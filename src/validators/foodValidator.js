const { FOOD_CATEGORY, FOOD_STATUS } = require('../constants');
const { parseId } = require('./adminCatalogValidator');

const CATEGORIES = Object.freeze(Object.values(FOOD_CATEGORY));
const CATEGORY_LABELS = Object.freeze({ POPCORN: 'Bắp rang', DRINK: 'Nước uống', COMBO: 'Combo' });
const STATUS_LABELS = Object.freeze({ 1: 'Đang bán', 0: 'Ngừng bán' });
const NAME_MAX = 100;
const PRICE_MAX = 10000000;

function isSafeFoodImageUrl(value) {
  return typeof value === 'string' && value.length <= 255 &&
    /^\/images\/foods\/(?:uploads\/)?[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value);
}

function validateFood(input = {}) {
  input = input || {};
  const fieldErrors = {};
  const add = (field, message) => { if (!fieldErrors[field]) fieldErrors[field] = message; };
  const values = {};

  const rawName = input.food_name;
  values.food_name = typeof rawName === 'string' ? rawName.trim() : '';
  if (rawName != null && typeof rawName !== 'string') add('food_name', 'Tên món phải là văn bản');
  else if (!values.food_name) add('food_name', 'Vui lòng nhập tên món');
  else if ([...values.food_name].length > NAME_MAX) add('food_name', `Tên món tối đa ${NAME_MAX} ký tự`);

  values.category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!CATEGORIES.includes(values.category)) add('category', 'Loại món không hợp lệ');

  const rawPrice = typeof input.price === 'string' ? input.price.trim() : input.price;
  values.price = typeof rawPrice === 'string' || typeof rawPrice === 'number' ? String(rawPrice) : '';
  if (!/^\d+$/.test(values.price) || Number(values.price) > PRICE_MAX) {
    add('price', `Giá phải là số nguyên từ 0 đến ${PRICE_MAX.toLocaleString('vi-VN')}`);
  } else {
    values.price = Number(values.price);
  }

  const rawStatus = typeof input.status === 'string' ? input.status.trim() : input.status;
  if (String(rawStatus) === String(FOOD_STATUS.SELLING)) values.status = FOOD_STATUS.SELLING;
  else if (String(rawStatus) === String(FOOD_STATUS.STOPPED)) values.status = FOOD_STATUS.STOPPED;
  else {
    values.status = '';
    add('status', 'Trạng thái không hợp lệ');
  }

  // đường dẫn ảnh do server quản lý, không tin giá trị client gửi lên.
  if (input.image_url != null && input.image_url !== '' && !isSafeFoodImageUrl(input.image_url)) {
    add('image', 'Đường dẫn ảnh không hợp lệ');
  }

  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

function normalizeFoodFilters(input = {}) {
  const q = typeof input.q === 'string' ? [...input.q.trim()].slice(0, 100).join('') : '';
  return {
    q,
    category: CATEGORIES.includes(input.category) ? input.category : '',
    status: input.status === '1' || input.status === '0' ? input.status : '',
    page: parseId(input.page) || 1,
  };
}

module.exports = {
  CATEGORIES, CATEGORY_LABELS, STATUS_LABELS, PRICE_MAX,
  isSafeFoodImageUrl, validateFood, normalizeFoodFilters,
};