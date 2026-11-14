const asyncHandler = require('../utils/asyncHandler');
const homeService = require('../services/homeService');

exports.index = asyncHandler(async (req, res) => {
  const data = await homeService.getHomeData();
  res.render('pages/home/index', { title: 'Hệ thống đặt vé xem phim', fullWidth: true, ...data });
});