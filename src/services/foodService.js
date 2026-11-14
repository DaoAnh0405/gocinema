const FoodModel = require('../models/foodModel');
const { FOOD_STATUS, UPLOAD_PATH } = require('../constants/foodConstants');
const { deletePublicFile } = require('../utils/fileHelper');

class FoodService {
  static async getAllFoods(query) {
    return await FoodModel.findAll({
      search: query.search?.trim(),
      status: query.status
    });
  }

  static async createFood(body, file) {
    const image_url = file ? `${UPLOAD_PATH}/${file.filename}` : null;
    const newId = await FoodModel.create({
      name: body.name.trim(),
      description: body.description?.trim() || '',
      price: Number(body.price),
      status: FOOD_STATUS.SELLING,
      image_url
    });
    return await FoodModel.findById(newId);
  }

  static async updateFood(id, body, file) {
    const existing = await FoodModel.findById(id);
    if (!existing) throw new Error('NOT_FOUND');

    let image_url = existing.image_url;
    if (file) {
      deletePublicFile(existing.image_url);
      image_url = `${UPLOAD_PATH}/${file.filename}`;
    }

    await FoodModel.update(id, {
      name: body.name.trim(),
      description: body.description !== undefined ? body.description.trim() : existing.description,
      price: Number(body.price),
      status: body.status || existing.status,
      image_url
    });
    return await FoodModel.findById(id);
  }

  static async deleteFood(id) {
    const existing = await FoodModel.findById(id);
    if (!existing) throw new Error('NOT_FOUND');

    deletePublicFile(existing.image_url);
    await FoodModel.delete(id);
  }
}

module.exports = FoodService;