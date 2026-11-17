const asyncHandler = require('../utils/asyncHandler');
const movieService = require('../services/movieService');

exports.detail = asyncHandler(async (req, res) => {
  const data = await movieService.getDetail(req.params.id);
  res.render('pages/home/movieDetail', { title: data.movie.title, ...data });
});