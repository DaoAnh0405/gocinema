const FoodService = require('../services/foodService');

exports.renderAdminPage = (req, res) => {
  res.render('admin/foods');
};

exports.getFoods = async (req, res) => {
  try {
    const data = await FoodService.getAllFoods(req.query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách đồ ăn', error: error.message });
  }
};

exports.createFood = async (req, res) => {
  try {
    const created = await FoodService.createFood(req.body, req.file);
    res.status(201).json({ message: 'Thêm món thành công', data: created });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi thêm món mới', error: error.message });
  }
};

exports.updateFood = async (req, res) => {
  try {
    const updated = await FoodService.updateFood(req.params.id, req.body, req.file);
    res.json({ message: 'Cập nhật món thành công', data: updated });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return res.status(404).json({ message: 'Không tìm thấy món ăn' });
    res.status(500).json({ message: 'Lỗi cập nhật món', error: error.message });
  }
};

exports.deleteFood = async (req, res) => {
  try {
    await FoodService.deleteFood(req.params.id);
    res.json({ message: 'Xóa món thành công' });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return res.status(404).json({ message: 'Không tìm thấy món ăn' });
    res.status(500).json({ message: 'Lỗi xóa món', error: error.message });
  }
};