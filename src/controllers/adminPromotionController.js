const promotionService = require('../services/adminPromotionService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const { parseId } = require('../validators/adminCatalogValidator');
const {
  STATUS_KEYS, STATUS_LABELS, validatePromotion, normalizePromotionFilters,
} = require('../validators/promotionValidator');

const PROMOTIONS_URL = '/admin/promotions';

function requireId(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError('Mã không hợp lệ', 404);
  return id;
}

function addError(result, field, message) {
  result.fieldErrors[field || '_form'] = message;
  result.errors = Object.values(result.fieldErrors);
}

async function flashRedirect(req, res, type, message, destination) {
  req.flash(type, message);
  await saveSession(req);
  return res.redirect(destination);
}

// lỗi nghiệp vụ dự kiến (400/409)
const isExpected = (err) => err instanceof AppError && err.status < 500 && err.status !== 404;

// modal = null: không mở, ngược lại { mode: 'create' | 'edit', id, values, errors, fieldErrors }
async function renderIndex(req, res, { modal = null, status = 200 } = {}) {
  const result = await promotionService.list(normalizePromotionFilters(req.query));
  return res.status(status).render('pages/admin/promotions/index', {
    title: 'Quản lý khuyến mãi',
    pageStyles: ['/css/adminCatalog.css', '/css/adminPromotions.css'],
    pageScripts: ['/js/adminCatalog.js', '/js/promotionAdmin.js'],
    ...result,
    statusKeys: STATUS_KEYS,
    statusLabels: STATUS_LABELS,
    modal,
  });
}

const list = asyncHandler(async (req, res) => renderIndex(req, res));

const create = asyncHandler(async (req, res) => {
  const result = validatePromotion(req.body);
  if (result.errors.length) {
    return renderIndex(req, res, { modal: { mode: 'create', ...result }, status: 400 });
  }
  try {
    await promotionService.create(result.values);
  } catch (err) {
    if (isExpected(err)) {
      addError(result, err.field, err.message);
      return renderIndex(req, res, { modal: { mode: 'create', ...result }, status: err.status });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Tạo khuyến mãi thành công', PROMOTIONS_URL);
});

const update = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const result = validatePromotion(req.body, { withStatus: true });
  if (result.errors.length) {
    return renderIndex(req, res, { modal: { mode: 'edit', id, ...result }, status: 400 });
  }
  try {
    await promotionService.update(id, result.values);
  } catch (err) {
    if (isExpected(err)) {
      addError(result, err.field, err.message);
      return renderIndex(req, res, { modal: { mode: 'edit', id, ...result }, status: err.status });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Cập nhật khuyến mãi thành công', PROMOTIONS_URL);
});

const remove = asyncHandler(async (req, res) => {
  const id = requireId(req);
  try {
    await promotionService.remove(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      return flashRedirect(req, res, 'error', err.message, PROMOTIONS_URL);
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Xóa khuyến mãi thành công', PROMOTIONS_URL);
});

module.exports = { list, create, update, remove };