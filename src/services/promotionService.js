const AppError = require('../utils/AppError');
const promotionModel = require('../models/promotionModel');
const { money } = require('../utils/format');

function calcDiscount(promo, subtotal) {
  let d = promo.discount_type === 'PERCENT'
    ? Math.floor((subtotal * promo.discount_value) / 100)
    : promo.discount_value;
  if (promo.discount_type === 'PERCENT' && promo.max_discount != null) d = Math.min(d, promo.max_discount);
  return Math.max(0, Math.min(d, subtotal));
}

async function validate(rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) throw new AppError('Vui lòng nhập mã khuyến mãi.', 400);

  const p = await promotionModel.findByCode(code);
  if (!p) throw new AppError('Mã khuyến mãi không tồn tại.', 400);
  const now = new Date();
  if (p.status !== 1) throw new AppError('Mã khuyến mãi hiện không áp dụng.', 400);
  if (p.start_date && new Date(p.start_date) > now) throw new AppError('Mã khuyến mãi chưa đến thời gian áp dụng.', 400);
  if (p.end_date && new Date(p.end_date) < now) throw new AppError('Mã khuyến mãi đã hết hạn.', 400);
  if (p.quantity != null && p.used_count >= p.quantity) throw new AppError('Mã khuyến mãi đã hết lượt sử dụng.', 400);
  if (subtotal < (p.min_order_value || 0)) {
    throw new AppError(`Đơn hàng cần tối thiểu ${money(p.min_order_value)} để dùng mã này.`, 400);
  }
  return { promotionId: p.promotion_id, code: p.promo_code, name: p.promotion_name, discount: calcDiscount(p, subtotal) };
}

module.exports = { calcDiscount, validate };