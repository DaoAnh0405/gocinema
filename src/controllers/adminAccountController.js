const accountService = require('../services/adminAccountService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const { parseId } = require('../validators/adminCatalogValidator');
const {
  ROLE_TABS, TAB_LABELS, validateStaff, normalizeAccountFilters, parseStatus, safeBackUrl,
} = require('../validators/accountValidator');

const ACCOUNTS_URL = '/admin/accounts';

function requireId(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError('Mã không hợp lệ', 404);
  return id;
}

function addError(result, field, message) {
  result.fieldErrors[field || '_form'] = message;
  result.errors = Object.values(result.fieldErrors);
}

async function flashRedirect(req, res, type, message, destination = ACCOUNTS_URL) {
  req.flash(type, message);
  await saveSession(req);
  return res.redirect(destination);
}

const isExpected = (err) => err instanceof AppError && err.status < 500 && err.status !== 404;

// modal = null hoặc { mode: 'create' | 'edit', id, values, errors, fieldErrors }
async function renderIndex(req, res, { modal = null, status = 200 } = {}) {
  const query = modal ? { ...req.query, role: 'STAFF' } : req.query;
  const result = await accountService.list(normalizeAccountFilters(query));
  return res.status(status).render('pages/admin/accounts/index', {
    title: 'Quản lý tài khoản',
    pageStyles: ['/css/adminCatalog.css', '/css/adminAccounts.css'],
    pageScripts: ['/js/adminCatalog.js', '/js/accountAdmin.js'],
    ...result,
    tabs: ROLE_TABS,
    tabLabels: TAB_LABELS,
    currentUserId: req.session.user.id,
    modal,
  });
}

const list = asyncHandler(async (req, res) => renderIndex(req, res));

const create = asyncHandler(async (req, res) => {
  const result = validateStaff(req.body);
  const reopen = (status) => renderIndex(req, res, { modal: { mode: 'create', ...result }, status });
  if (result.errors.length) return reopen(400);
  let created;
  try {
    created = await accountService.createStaff(result.values);
  } catch (err) {
    if (isExpected(err)) {
      addError(result, err.field, err.message);
      return reopen(err.status);
    }
    throw err;
  }
  if (created.mailSent) {
    return flashRedirect(req, res, 'success', `Đã tạo nhân viên và gửi liên kết đặt mật khẩu tới ${result.values.email}`, `${ACCOUNTS_URL}?role=STAFF`);
  }
  return flashRedirect(
    req, res, 'warning',
    'Đã tạo nhân viên nhưng chưa gửi được email. Hãy dùng nút "Gửi lại liên kết" sau khi kiểm tra cấu hình mail',
    `${ACCOUNTS_URL}?role=STAFF`,
  );
});

const update = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const staff = await accountService.findStaff(id);
  const result = validateStaff(req.body, { isEdit: true });
  result.values.email = staff.email; // email không đổi được, luôn hiển thị lại giá trị đã lưu
  const reopen = (status) => renderIndex(req, res, { modal: { mode: 'edit', id, ...result }, status });
  if (result.errors.length) return reopen(400);
  try {
    await accountService.updateStaff(id, result.values, { currentCinemaId: staff.cinema_id });
  } catch (err) {
    if (isExpected(err)) {
      addError(result, err.field, err.message);
      return reopen(err.status);
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Cập nhật nhân viên thành công', safeBackUrl(req.body.back, `${ACCOUNTS_URL}?role=STAFF`));
});

const setStatus = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const status = parseStatus(req.body.status);
  const back = safeBackUrl(req.body.back, ACCOUNTS_URL);
  if (status === null) throw new AppError('Trạng thái không hợp lệ', 400);
  try {
    await accountService.setStatus(req.session.user.id, id, status);
  } catch (err) {
    if (err instanceof AppError && (err.status === 403 || err.status === 409)) {
      return flashRedirect(req, res, 'error', err.message, back);
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', status ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản', back);
});

const resendInvite = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const back = safeBackUrl(req.body.back, `${ACCOUNTS_URL}?role=STAFF`);
  try {
    const sent = await accountService.resendInvite(id);
    return flashRedirect(
      req, res, sent ? 'success' : 'warning',
      sent ? 'Đã gửi lại liên kết đặt mật khẩu' : 'Chưa gửi được email, hãy kiểm tra cấu hình mail',
      back,
    );
  } catch (err) {
    if (err instanceof AppError && err.status === 409) return flashRedirect(req, res, 'error', err.message, back);
    throw err;
  }
});

module.exports = { list, create, update, setStatus, resendInvite };