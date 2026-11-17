const asyncHandler = require('../utils/asyncHandler');
const catalogService = require('../services/catalogService');

exports.cinemas = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await catalogService.getCinemas() });
});

exports.movies = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await catalogService.getMovies(req.params.cinemaId) });
});

exports.showtimes = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await catalogService.getShowtimes(req.query.cinemaId, req.query.movieId) });
});