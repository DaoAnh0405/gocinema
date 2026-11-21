const { FOOD_STATUS } = require('../constants/foodConstants');

exports.validateFoodPayload = (req, res, next) => {
  const { name, price, status } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ message: 'Tên món không được để trống!' });
  }
  if (price === undefined || price === '' || isNaN(price) || Number(price) < 0) {
    return res.status(400).json({ message: 'Giá bán (VND) phải là số hợp lệ >= 0!' });
  }
  if (status && !Object.values(FOOD_STATUS).includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ!' });
  }
  next();
};