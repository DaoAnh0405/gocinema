const permissionService = require('../services/permissionService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');

const PERMISSIONS_URL = '/admin/permissions';

async function flashRedirect(req, res, type, message) {
  req.flash(type, message);
  await saveSession(req);
  return res.redirect(PERMISSIONS_URL);
}

const show = asyncHandler(async (_req, res) => {
  const matrix = await permissionService.getMatrix();
  return res.render('pages/admin/permissions/index', {
    title: 'Phân quyền',
    pageStyles: ['/css/adminCatalog.css', '/css/adminPermissions.css'],
    pageScripts: ['/js/permissionAdmin.js'],
    ...matrix,
  });
});

const save = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await permissionService.saveStaffPermissions(req.body.permissions);
  } catch (err) {
    if (err instanceof AppError && err.status === 400) return flashRedirect(req, res, 'error', err.message);
    throw err;
  }
  if (!result.added.length && !result.removed.length) {
    return flashRedirect(req, res, 'info', 'Không có thay đổi nào để lưu');
  }
  return flashRedirect(
    req, res, 'success',
    `Đã cập nhật quyền của nhân viên (thêm ${result.added.length}, bỏ ${result.removed.length})`,
  );
});

module.exports = { show, save };