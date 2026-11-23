const { PROMO_TYPE, PROMO_STATUS } = require('../constants');
const { parseId, isRealDate } = require('./adminCatalogValidator');

const TYPES = Object.freeze(Object.values(PROMO_TYPE));
const STATUS_KEYS = Object.freeze(['ACTIVE', 'UPCOMING', 'PAUSED', 'EXPIRED']);
const STATUS_LABELS = Object.freeze({
  ACTIVE: 'Đang áp dụng', UPCOMING: 'Sắp diễn ra', PAUSED: 'Tạm dừng', EXPIRED: 'Hết hạn',
});
const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;
const INTEGER = /^\d+$/;
const MAX_MONEY = 100000000;
const MAX_QUANTITY = 1000000;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

const money = (n) => n.toLocaleString('vi-VN');

function validatePromotion(input = {}, { withStatus = false } = {}) {
  input = input || {};
  const values = {};
  const fieldErrors = {};
  const add = (field, message) => { if (!fieldErrors[field]) fieldErrors[field] = message; };
  const str = (field) => {
    const raw = input[field];
    if (raw != null && typeof raw !== 'string') {
      add(field, 'Giá trị không hợp lệ');
      return '';
    }
    return (raw || '').trim();
  };
  const integer = (raw, min, max) => INTEGER.test(raw) && Number(raw) >= min && Number(raw) <= max;

  values.promo_code = str('promo_code').toUpperCase();
  if (!values.promo_code) add('promo_code', 'Vui lòng nhập mã khuyến mãi');
  else if (!CODE_PATTERN.test(values.promo_code)) {
    add('promo_code', 'Mã gồm 3–30 ký tự: chữ không dấu, số, gạch ngang hoặc gạch dưới');
  }

  values.promotion_name = str('promotion_name');
  if (!values.promotion_name) add('promotion_name', 'Vui lòng nhập tên chương trình');
  else if ([...values.promotion_name].length > NAME_MAX) add('promotion_name', `Tên tối đa ${NAME_MAX} ký tự`);

  values.description = str('description');
  if ([...values.description].length > DESCRIPTION_MAX) add('description', `Mô tả tối đa ${DESCRIPTION_MAX} ký tự`);

  values.discount_type = str('discount_type');
  if (!TYPES.includes(values.discount_type)) add('discount_type', 'Loại giảm giá không hợp lệ');
  const isPercent = values.discount_type === PROMO_TYPE.PERCENT;

  const rawValue = str('discount_value');
  values.discount_value = rawValue;
  if (isPercent ? !integer(rawValue, 1, 100) : !integer(rawValue, 1, MAX_MONEY)) {
    add('discount_value', isPercent
      ? 'Phần trăm giảm phải là số nguyên từ 1 đến 100'
      : `Số tiền giảm phải là số nguyên từ 1 đến ${money(MAX_MONEY)}`);
  } else {
    values.discount_value = Number(rawValue);
  }

  // giảm tối đa chỉ có ý nghĩa với loại phần trăm loại số tiền luôn lưu NULL
  const rawMax = str('max_discount');
  if (!isPercent) values.max_discount = null;
  else if (!rawMax) values.max_discount = null;
  else if (!integer(rawMax, 1, MAX_MONEY)) {
    values.max_discount = rawMax;
    add('max_discount', `Giảm tối đa phải là số nguyên từ 1 đến ${money(MAX_MONEY)}`);
  } else values.max_discount = Number(rawMax);

  const rawMin = str('min_order_value');
  if (!rawMin) values.min_order_value = 0;
  else if (!integer(rawMin, 0, MAX_MONEY)) {
    values.min_order_value = rawMin;
    add('min_order_value', `Đơn tối thiểu phải là số nguyên từ 0 đến ${money(MAX_MONEY)}`);
  } else values.min_order_value = Number(rawMin);

  const rawQuantity = str('quantity');
  if (!rawQuantity) values.quantity = null;
  else if (!integer(rawQuantity, 1, MAX_QUANTITY)) {
    values.quantity = rawQuantity;
    add('quantity', `Số lượng phải là số nguyên từ 1 đến ${money(MAX_QUANTITY)}`);
  } else values.quantity = Number(rawQuantity);

  values.start_date = str('start_date');
  values.end_date = str('end_date');
  if (!values.start_date) add('start_date', 'Vui lòng chọn ngày bắt đầu');
  else if (!isRealDate(values.start_date)) add('start_date', 'Ngày bắt đầu không hợp lệ');
  if (!values.end_date) add('end_date', 'Vui lòng chọn ngày kết thúc');
  else if (!isRealDate(values.end_date)) add('end_date', 'Ngày kết thúc không hợp lệ');
  if (isRealDate(values.start_date) && isRealDate(values.end_date) && values.end_date < values.start_date) {
    add('end_date', 'Ngày kết thúc không được trước ngày bắt đầu');
  }

  if (withStatus) {
    const rawStatus = str('status');
    values.status = rawStatus;
    if (['1', '0', '-1'].includes(rawStatus)) values.status = Number(rawStatus);
    else add('status', 'Trạng thái không hợp lệ');
  } else {
    values.status = PROMO_STATUS.ACTIVE;
  }

  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

function normalizePromotionFilters(input = {}) {
  const q = typeof input.q === 'string' ? [...input.q.trim()].slice(0, 100).join('') : '';
  return {
    q,
    status: STATUS_KEYS.includes(input.status) ? input.status : '',
    page: parseId(input.page) || 1,
  };
}

module.exports = {
  STATUS_KEYS, STATUS_LABELS, MAX_MONEY, MAX_QUANTITY,
  validatePromotion, normalizePromotionFilters,
};