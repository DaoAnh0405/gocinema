const foodModel = require('../models/foodModel');
const { persistFoodImage, cleanupManagedFoodImage } = require('../middlewares/foodUpload');

// dữ liệu đã lưu DB thành công thì không được báo lỗi chỉ vì dọn ảnh cũ thất bại.
async function safeCleanup(imageUrl) {
  try {
    await cleanupManagedFoodImage(imageUrl);
  } catch (err) {
    console.error('Không thể dọn ảnh món ăn:', imageUrl, err);
  }
}

const list = (filters) => foodModel.listPage(filters);
const getById = (id) => foodModel.findById(id);

async function create(values, file) {
  let imageUrl;
  try {
    if (file) imageUrl = await persistFoodImage(file);
    return await foodModel.create({ ...values, image_url: imageUrl || null });
  } catch (err) {
    if (imageUrl) await safeCleanup(imageUrl);
    throw err;
  }
}

async function update(id, values, file) {
  let imageUrl;
  try {
    if (file) imageUrl = await persistFoodImage(file);
    const result = await foodModel.update(id, { ...values, image_url: imageUrl });
    if (imageUrl) await safeCleanup(result.previousImageUrl);
    return result;
  } catch (err) {
    if (imageUrl) await safeCleanup(imageUrl);
    throw err;
  }
}

async function remove(id) {
  const food = await foodModel.remove(id);
  await safeCleanup(food.image_url);
  return food;
}

module.exports = { list, getById, create, update, remove };