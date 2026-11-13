const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { BOOKING } = require('../constants');
const { accountIdOf } = require('../utils/currentAccount');
const bookingService = require('../services/bookingService');

// 1 ?movieId=... để chọn sẵn phim 
exports.startPage = asyncHandler(async (req, res) => {
  const movieId = Number.parseInt(req.query.movieId, 10);
  res.render('pages/booking/start', {
    title: 'Mua vé',
    preselectMovieId: Number.isInteger(movieId) && movieId > 0 ? movieId : '',
  });
});

// 2
exports.seatPage = asyncHandler(async (req, res) => {
  const showtime = await bookingService.getBookableShowtime(req.params.id);
  res.render('pages/booking/selectSeats', {
    title: 'Chọn ghế',
    showtime,
    maxSeats: BOOKING.MAX_SEATS_PER_ORDER,
    holdMinutes: env.booking.holdMinutes,
  });
});

exports.seatMap = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await bookingService.getSeatMap(req.params.id, accountIdOf(req)) });
});

exports.hold = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await bookingService.holdSeats(req.params.id, accountIdOf(req), req.body.seatIds) });
});

exports.release = asyncHandler(async (req, res) => {
  await bookingService.releaseMyHolds(req.params.id, accountIdOf(req));
  res.json({ ok: true, data: null });
});