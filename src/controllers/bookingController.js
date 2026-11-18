const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { BOOKING } = require('../constants');
const { accountIdOf } = require('../utils/currentAccount');
const bookingService = require('../services/bookingService');
const saveSession = require('../utils/saveSession');
const catalogService = require('../services/catalogService');

// 1 ?movieId=... để chọn sẵn phim 
exports.startPage = asyncHandler(async (req, res) => {
  let locked = null;
  if (req.query.movieId !== undefined) {
    locked = await catalogService.getBookableMovie(req.query.movieId);
    if (!locked) {
      const id = Number.parseInt(req.query.movieId, 10);
      req.flash('warning', 'Phim này hiện chưa có suất chiếu để đặt vé.');
      await saveSession(req);
      return res.redirect(Number.isInteger(id) && id > 0 ? `/movies/${id}` : '/booking');
    }
  }
  return res.render('pages/booking/start', { title: 'Mua vé', locked });
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