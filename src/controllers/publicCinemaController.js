const asyncHandler = require('../utils/asyncHandler');
const publicCinemaService = require('../services/publicCinemaService');

// GET /api/cinemas: rạp đang hoạt động theo khu vực (cho modal "Rạp chiếu" ở navbar)
exports.list = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await publicCinemaService.listCinemaGroups() });
});

// GET /cinemas/:id?date=YYYY-MM-DD&format=2D
exports.detail = asyncHandler(async (req, res) => {
  const data = await publicCinemaService.getDetail(req.params.id, {
    date: req.query.date,
    format: req.query.format,
  });
  res.render('pages/home/cinemaDetail', { title: data.cinema.cinema_name, fullWidth: true, ...data });
});