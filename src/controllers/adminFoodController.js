const foodService = require('../services/foodService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const { parseId } = require('../validators/adminCatalogValidator');
const {
  CATEGORIES, CATEGORY_LABELS, STATUS_LABELS, isSafeFoodImageUrl,
  validateFood, normalizeFoodFilters,
} = require('../validators/foodValidator');
const { validateFoodImageFile } = require('../middlewares/foodUpload');

const FOODS_URL = '/admin/foods';

function requireId(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError('Mã không hợp lệ', 404);
  return id;
}

async function requireFood(id) {
  const food = await foodService.getById(id);
  if (!food) throw new AppError('Không tìm thấy món', 404);
  return food;
}

const safeImage = (url) => (isSafeFoodImageUrl(url) ? url : '');

function emptyFood() {
  return { food_name: '', category: 'POPCORN', price: '', image_url: '', status: 1 };
}

function renderForm(res, { food = null, values, errors = [], fieldErrors = {}, status = 200 } = {}) {
  const isEdit = Boolean(food);
  return res.status(status).render('pages/admin/foods/form', {
    title: isEdit ? 'Chỉnh sửa món' : 'Thêm món',
    food: food ? { ...food, image_url: safeImage(food.image_url) } : null,
    values: { ...emptyFood(), ...(values || food), image_url: safeImage(food && food.image_url) },
    errors, fieldErrors, isEdit,
    formAction: isEdit ? `${FOODS_URL}/${food.food_id}/update` : FOODS_URL,
    categories: CATEGORIES, categoryLabels: CATEGORY_LABELS, statusLabels: STATUS_LABELS,
  });
}

function addError(result, field, message) {
  result.fieldErrors[field || '_form'] = message;
  result.errors = Object.values(result.fieldErrors);
}

function checkImage(req, result) {
  const message = req.foodUploadError ? req.foodUploadError.message : validateFoodImageFile(req.file);
  if (message) addError(result, 'image', message);
}

async function flashRedirect(req, res, type, message, destination) {
  req.flash(type, message);
  await saveSession(req);
  return res.redirect(destination);
}

// lỗi nghiệp vụ dự kiến (400/409) hiển thị lại trên form; 404 và 5xx đi tiếp errorHandler.
const isExpected = (err) => err instanceof AppError && err.status < 500 && err.status !== 404;

const list = asyncHandler(async (req, res) => {
  const result = await foodService.list(normalizeFoodFilters(req.query));
  return res.render('pages/admin/foods/index', {
    title: 'Quản lý đồ ăn',
    ...result,
    foods: result.foods.map((food) => ({ ...food, image_url: safeImage(food.image_url) })),
    categories: CATEGORIES, categoryLabels: CATEGORY_LABELS, statusLabels: STATUS_LABELS,
  });
});

const newFood = asyncHandler(async (_req, res) => renderForm(res));

const editFood = asyncHandler(async (req, res) => {
  const food = await requireFood(requireId(req));
  return renderForm(res, { food });
});

const createFood = asyncHandler(async (req, res) => {
  const result = validateFood(req.body);
  checkImage(req, result);
  if (result.errors.length) return renderForm(res, { ...result, status: 400 });
  try {
    await foodService.create(result.values, req.file);
  } catch (err) {
    if (isExpected(err)) {
      addError(result, err.field, err.message);
      return renderForm(res, { ...result, status: err.status });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Thêm món thành công', FOODS_URL);
});

const updateFood = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const food = await requireFood(id);
  const result = validateFood(req.body);
  checkImage(req, result);
  if (result.errors.length) return renderForm(res, { food, ...result, status: 400 });
  try {
    await foodService.update(id, result.values, req.file);
  } catch (err) {
    if (isExpected(err)) {
      addError(result, err.field, err.message);
      return renderForm(res, { food, ...result, status: err.status });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Cập nhật món thành công', FOODS_URL);
});

const deleteFood = asyncHandler(async (req, res) => {
  const id = requireId(req);
  try {
    await foodService.remove(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      return flashRedirect(req, res, 'error', err.message, FOODS_URL);
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Xóa món thành công', FOODS_URL);
});

module.exports = { list, newFood, editFood, createFood, updateFood, deleteFood };