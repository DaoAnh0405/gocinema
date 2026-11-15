const promotionModel = require('../../models/promotionModel');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { errorMessages } = require('../../middlewares/validate');

const STATUSES = {
  ACTIVE: 'Đang áp dụng',
  UPCOMING: 'Sắp diễn ra',
  EXPIRED: 'Hết hạn',
  PAUSED: 'Đã tạm dừng',
};

function toPromotionData(body) {
  return {
    promo_code: body.promo_code.trim().toUpperCase(),
    promotion_name: body.promotion_name.trim(),
    description: body.description ? body.description.trim() : null,
    discount_type: body.discount_type,
    discount_value: Number(body.discount_value),
    max_discount: body.max_discount === '' ? null : Number(body.max_discount),
    min_order_value: Number(body.min_order_value),
    start_date: body.start_date.replace('T', ' ') + ':00',
    end_date: body.end_date.replace('T', ' ') + ':00',
    quantity: body.quantity === '' ? null : Number(body.quantity),
  };
}

async function renderIndex(req, res, {
  status = 200, errors = [], values = null, editing = false, recordId = null,
} = {}) {
  const search = String(req.query.search || '').trim();
  const selectedStatus = ['ALL', 'ACTIVE', 'UPCOMING', 'EXPIRED', 'PAUSED'].includes(req.query.status)
    ? req.query.status
    : 'ALL';
  const promotions = await promotionModel.listForAdmin({ search, status: selectedStatus });

  return res.status(status).render('pages/admin/promotions/index', {
    title: 'Quản lý khuyến mãi',
    promotions,
    search,
    selectedStatus,
    statusLabels: STATUSES,
    errors,
    modalValues: values,
    editing,
    recordId,
  });
}

const index = asyncHandler((req, res) => renderIndex(req, res));

const create = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) {
    return renderIndex(req, res, { status: 400, errors, values: req.body });
  }

  await promotionModel.createForAdmin(toPromotionData(req.body));
  req.flash('success', 'Tạo khuyến mãi thành công');
  return res.redirect('/admin/promotions');
});

const update = asyncHandler(async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) {
    req.flash('error', 'Mã khuyến mãi không hợp lệ');
    return res.redirect('/admin/promotions');
  }

  const existing = await promotionModel.findForAdmin(req.params.id);
  if (!existing) throw new AppError('Không tìm thấy khuyến mãi', 404);

  const errors = errorMessages(req);
  if (errors.length) {
    return renderIndex(req, res, {
      status: 400, errors, values: req.body, editing: true, recordId: req.params.id,
    });
  }

  const promotion = toPromotionData(req.body);
  if (existing.used_count > 0 && promotion.quantity !== null && promotion.quantity < existing.used_count) {
    return renderIndex(req, res, {
      status: 400,
      errors: ['Số lượng không thể nhỏ hơn số lượt khuyến mãi đã sử dụng'],
      values: req.body,
      editing: true,
      recordId: req.params.id,
    });
  }

  await promotionModel.updateForAdmin(req.params.id, promotion);
  req.flash('success', 'Cập nhật khuyến mãi thành công');
  return res.redirect('/admin/promotions');
});

const updateStatus = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) {
    req.flash('error', errors[0]);
    return res.redirect('/admin/promotions');
  }

  const status = req.body.status === 'ACTIVE' ? 1 : -1;
  const updated = await promotionModel.setAdminStatus(req.params.id, status);
  if (!updated) throw new AppError('Không tìm thấy khuyến mãi', 404);

  req.flash('success', status === 1 ? 'Đã bật khuyến mãi' : 'Đã tạm dừng khuyến mãi');
  return res.redirect('/admin/promotions');
});

const remove = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) {
    req.flash('error', errors[0]);
    return res.redirect('/admin/promotions');
  }

  await promotionModel.deleteForAdmin(req.params.id);
  req.flash('success', 'Đã xóa khuyến mãi');
  return res.redirect('/admin/promotions');
});

module.exports = { index, create, update, updateStatus, remove };
