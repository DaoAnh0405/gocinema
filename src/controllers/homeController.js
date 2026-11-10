const asyncHandler = require('../utils/asyncHandler');
const homeService = require('../services/homeService');

exports.index = asyncHandler(async (req, res) => {
  const data = await homeService.getHomeData();
  res.render('pages/home/index', { title: 'Trang chủ', fullWidth: true, ...data });
});