const AppError = require('../utils/AppError');
const env = require('../config/env');
const { withTransaction } = require('../config/db');
const { SEAT_STATUS, BOOKING } = require('../constants');
const bookingModel = require('../models/bookingModel');
const showtimeModel = require('../models/showtimeModel');
const pricingService = require('./pricingService');

const holdMinutes = () => env.booking.holdMinutes;

async function getBookableShowtime(rawId) {
  const id = Number.parseInt(rawId, 10);
  const showtime = Number.isInteger(id) && id > 0 ? await showtimeModel.findForBooking(id) : null;
  if (!showtime || !showtime.bookable) throw new AppError('Suất chiếu không còn mở bán.', 404);
  return showtime;
}

function normalizeSeatIds(raw) {
  if (!Array.isArray(raw)) throw new AppError('Danh sách ghế không hợp lệ.', 400);
  const ids = [...new Set(raw.map(Number))];
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new AppError('Danh sách ghế không hợp lệ.', 400);
  }
  if (ids.length > BOOKING.MAX_SEATS_PER_ORDER) {
    throw new AppError(`Chỉ được chọn tối đa ${BOOKING.MAX_SEATS_PER_ORDER} ghế cho một đơn.`, 400);
  }
  return ids.sort((a, b) => a - b);
}

async function assertNoPendingOrder(conn, accountId) {
  const pending = await bookingModel.findLivePendingOrder(conn, accountId, holdMinutes());
  if (pending) {
    throw new AppError(
      `Bạn đang có đơn ${pending.order_code} chờ thanh toán. Hãy thanh toán hoặc hủy đơn trước khi chọn ghế khác.`,
      409,
    );
  }
}

// sơ đồ ghế + trạng thái từng ghế theo góc nhìn của người đang đăng nhập
async function getSeatMap(rawShowtimeId, accountId) {
  const showtime = await getBookableShowtime(rawShowtimeId);
  const [rows, priceMap] = await Promise.all([
    bookingModel.getSeatRows(showtime.showtime_id),
    pricingService.getPriceMap(showtime.start_time, showtime.screen_format),
  ]);

  const byRow = new Map();
  const mineIds = [];
  let secondsLeft = null;

  for (const r of rows) {
    let state = 'available';                                   // ghế hết hạn giữ coi như trống
    if (r.status === SEAT_STATUS.SOLD) state = 'sold';
    else if (r.is_held) state = r.held_by === accountId ? 'mine' : 'held';

    if (state === 'mine') {
      mineIds.push(r.seat_id);
      secondsLeft = secondsLeft === null ? r.seconds_left : Math.min(secondsLeft, r.seconds_left);
    }
    if (!byRow.has(r.seat_row)) byRow.set(r.seat_row, []);
    byRow.get(r.seat_row).push({
      id: r.seat_id,
      number: r.seat_number,
      type: r.seat_type_name,
      price: priceMap.has(r.seat_type_id) ? priceMap.get(r.seat_type_id) : null,
      state,
    });
  }

  return {
    showtime: {
      id: showtime.showtime_id,
      movieTitle: showtime.title,
      cinemaName: showtime.cinema_name,
      roomName: showtime.room_name,
      startTime: showtime.start_time,
      screenFormat: showtime.screen_format,
      language: showtime.language,
    },
    rows: [...byRow].map(([row, seats]) => ({ row, seats })),
    myHold: mineIds.length ? { seatIds: mineIds, secondsLeft } : null,
    maxSeats: BOOKING.MAX_SEATS_PER_ORDER,
    holdMinutes: holdMinutes(),
  };
}

// giữ ghế toàn bộ lựa chọn mới thay thế lựa chọn cũ của chính người này trong suất chiếu
async function holdSeats(rawShowtimeId, accountId, rawSeatIds) {
  const showtime = await getBookableShowtime(rawShowtimeId);
  const seatIds = normalizeSeatIds(rawSeatIds);
  const showtimeId = showtime.showtime_id;

  return withTransaction(async (conn) => {
    await assertNoPendingOrder(conn, accountId);

    const locked = await bookingModel.lockSeats(conn, showtimeId, seatIds);
    if (locked.length !== seatIds.length) {
      throw new AppError('Có ghế không thuộc suất chiếu này.', 400);
    }

    const conflicts = locked.filter(
      (r) => r.status === SEAT_STATUS.SOLD || (r.is_held && r.held_by !== accountId),
    );
    if (conflicts.length) {
      const labels = await bookingModel.getSeatLabels(conn, conflicts.map((r) => r.seat_id));
      throw new AppError(`Ghế ${labels.join(', ')} vừa có người khác chọn, vui lòng chọn ghế khác.`, 409);
    }

    await bookingModel.releaseHolds(conn, showtimeId, accountId, seatIds);
    await bookingModel.markHeld(conn, showtimeId, accountId, seatIds, holdMinutes());
    return { seatIds };
  });
}

async function releaseMyHolds(rawShowtimeId, accountId) {
  const showtime = await getBookableShowtime(rawShowtimeId);
  await withTransaction(async (conn) => {
    await assertNoPendingOrder(conn, accountId);
    await bookingModel.releaseHolds(conn, showtime.showtime_id, accountId);
  });
}

module.exports = { getBookableShowtime, getSeatMap, holdSeats, releaseMyHolds, assertNoPendingOrder };