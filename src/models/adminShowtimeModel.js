const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { MOVIE_STATUS, SHOWTIME_STATUS, SEAT_STATUS } = require('../constants');
const {
  normalizeFilters, validateShowtime, validateStatus, parseId,
  vietnamTimestamp, vietnamDateTime,
} = require('../validators/adminShowtimeValidator');

const PAGE_SIZE = 10;
const CLEANING_MINUTES = 15;
const VN_NOW_SQL = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)';
const SHOWTIME_FIELDS = `s.showtime_id, s.movie_id, s.room_id, s.screen_format, s.language, s.status,
  DATE_FORMAT(s.start_time, '%Y-%m-%d %H:%i:%s') AS start_time,
  DATE_FORMAT(s.end_time, '%Y-%m-%d %H:%i:%s') AS end_time`;
const DISPLAY_FIELDS = `${SHOWTIME_FIELDS}, m.title, m.title AS movie_title, m.duration,
  r.cinema_id, r.room_name, r.room_type, c.cinema_name,
  DATE_FORMAT(s.start_time, '%Y-%m-%d') AS show_date,
  DATE_FORMAT(s.start_time, '%H:%i') AS start_clock,
  DATE_FORMAT(s.end_time, '%H:%i') AS end_clock,
  DATE_FORMAT(s.end_time, '%Y-%m-%d') AS end_date,
  DATE_FORMAT(DATE_SUB(s.end_time, INTERVAL ${CLEANING_MINUTES} MINUTE), '%H:%i') AS film_end_clock,
  DATE_FORMAT(DATE_SUB(s.end_time, INTERVAL ${CLEANING_MINUTES} MINUTE), '%Y-%m-%d') AS film_end_date`;
const SHOWTIME_JOINS = `FROM showtimes s JOIN movies m ON m.movie_id = s.movie_id
  JOIN rooms r ON r.room_id = s.room_id JOIN cinemas c ON c.cinema_id = r.cinema_id`;

function showtimeError(message, status = 409, field) {
  const error = new AppError(message, status);
  if (field) error.field = field;
  return error;
}

function requireId(value) {
  const id = parseId(value);
  if (!id) throw showtimeError('Mã suất chiếu không hợp lệ', 404);
  return id;
}

function checkedValues(input) {
  const result = validateShowtime(input);
  if (result.errors.length) {
    const error = showtimeError(result.errors.join('. '), 400);
    error.fieldErrors = result.fieldErrors;
    throw error;
  }
  return result.values;
}

async function list(input = {}) {
  const filters = normalizeFilters(input);
  const where = [];
  const params = [];
  if (filters.date) {
    where.push('s.start_time >= ? AND s.start_time <= ?');
    params.push(`${filters.date} 00:00:00`, `${filters.date} 23:59:59`);
  }
  if (filters.cinema) { where.push('r.cinema_id = ?'); params.push(filters.cinema); }
  if (filters.movie) { where.push('s.movie_id = ?'); params.push(filters.movie); }
  if (filters.status !== '') { where.push('s.status = ?'); params.push(Number(filters.status)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const counts = await query(`SELECT COUNT(*) AS total ${SHOWTIME_JOINS} ${clause}`, params);
  const total = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const rows = await query(
    `SELECT ${DISPLAY_FIELDS},
       (SELECT COUNT(*) FROM showtime_seats inventory WHERE inventory.showtime_id = s.showtime_id) AS total_count,
       (SELECT COUNT(DISTINCT sold.seat_id) FROM (
          SELECT showtime_id, seat_id FROM showtime_seats WHERE status = -1
          UNION ALL
          SELECT t.showtime_id, t.seat_id FROM tickets t JOIN orders o ON o.order_id = t.order_id
          WHERE o.status = 'PAID' AND t.status IN (0, 1)
        ) sold WHERE sold.showtime_id = s.showtime_id) AS sold_count
     ${SHOWTIME_JOINS} ${clause}
     ORDER BY s.start_time DESC, s.showtime_id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    showtimes: rows.map((row) => ({ ...row, total_count: Number(row.total_count), sold_count: Number(row.sold_count) })),
    filters: { ...filters, page },
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages },
  };
}

async function options() {
  const [movies, cinemas, rooms] = await Promise.all([
    query(`SELECT movie_id, title, duration, status,
      DATE_FORMAT(release_date, '%Y-%m-%d') AS release_date,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date FROM movies ORDER BY title, movie_id`),
    query('SELECT cinema_id, cinema_name, status FROM cinemas ORDER BY cinema_name, cinema_id'),
    query(`SELECT r.room_id, r.cinema_id, r.room_name, r.room_type, r.status,
      (SELECT COUNT(*) FROM seats st WHERE st.room_id = r.room_id) AS seat_count
      FROM rooms r ORDER BY r.cinema_id, r.room_name, r.room_id`),
  ]);
  return { movies, cinemas, rooms: rooms.map((room) => ({ ...room, seat_count: Number(room.seat_count) })) };
}

async function findById(value) {
  const id = requireId(value);
  const rows = await query(`SELECT ${DISPLAY_FIELDS} ${SHOWTIME_JOINS} WHERE s.showtime_id = ?`, [id]);
  return rows[0] || null;
}

const sortedIds = (ids) => [...new Set(ids.map(Number))].sort((a, b) => a - b);

// All mutations use movie -> cinema -> room -> showtime -> seats -> tickets.
// Shared parent locks prevent eligibility changes; room locks serialize scheduling.
async function lockContext(conn, id = null, values = null) {
  let initial = null;
  if (id !== null) {
    const [rows] = await conn.query(
      `SELECT s.movie_id, s.room_id, r.cinema_id FROM showtimes s
       JOIN rooms r ON r.room_id = s.room_id WHERE s.showtime_id = ?`, [id],
    );
    if (!rows.length) throw showtimeError('Không tìm thấy suất chiếu', 404);
    initial = rows[0];
  }
  const movieIds = sortedIds([...(initial ? [initial.movie_id] : []), ...(values ? [values.movie_id] : [])]);
  const cinemaIds = sortedIds([...(initial ? [initial.cinema_id] : []), ...(values ? [values.cinema_id] : [])]);
  const roomIds = sortedIds([...(initial ? [initial.room_id] : []), ...(values ? [values.room_id] : [])]);
  const movies = new Map();
  const cinemas = new Map();
  const rooms = new Map();
  for (const movieId of movieIds) {
    const [rows] = await conn.query(
      `SELECT movie_id, duration, status, DATE_FORMAT(release_date, '%Y-%m-%d') AS release_date,
       DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date FROM movies WHERE movie_id = ? LOCK IN SHARE MODE`, [movieId],
    );
    if (!rows.length) throw showtimeError('Phim không tồn tại hoặc đã bị xóa', 400, 'movie_id');
    movies.set(movieId, rows[0]);
  }
  for (const cinemaId of cinemaIds) {
    const [rows] = await conn.query('SELECT cinema_id, status FROM cinemas WHERE cinema_id = ? LOCK IN SHARE MODE', [cinemaId]);
    if (!rows.length) throw showtimeError('Rạp không tồn tại hoặc đã bị xóa', 400, 'cinema_id');
    cinemas.set(cinemaId, rows[0]);
  }
  for (const roomId of roomIds) {
    const [rows] = await conn.query('SELECT room_id, cinema_id, room_type, status FROM rooms WHERE room_id = ? FOR UPDATE', [roomId]);
    if (!rows.length) throw showtimeError('Phòng chiếu không tồn tại hoặc đã bị xóa', 400, 'room_id');
    rooms.set(roomId, rows[0]);
  }
  let current = null;
  if (initial) {
    const [rows] = await conn.query(`SELECT ${SHOWTIME_FIELDS} FROM showtimes s WHERE s.showtime_id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw showtimeError('Không tìm thấy suất chiếu', 404);
    current = rows[0];
    // Never proceed under locks for a stale room/movie after a concurrent move.
    if (Number(current.room_id) !== Number(initial.room_id) || Number(current.movie_id) !== Number(initial.movie_id) ||
        Number(rooms.get(Number(initial.room_id)).cinema_id) !== Number(initial.cinema_id)) {
      throw showtimeError('Suất chiếu vừa được thay đổi. Vui lòng tải lại trang');
    }
  }
  return { current, movies, cinemas, rooms };
}

function ensureFuture(startTime) {
  if (Date.parse(`${startTime.replace(' ', 'T')}+07:00`) <= Date.now()) {
    throw showtimeError('Chỉ được thao tác với suất chiếu chưa bắt đầu', 409, 'start_time');
  }
}

async function eligibleSchedule(conn, context, values) {
  const movie = context.movies.get(Number(values.movie_id));
  const cinema = context.cinemas.get(Number(values.cinema_id));
  const room = context.rooms.get(Number(values.room_id));
  if (Number(room.cinema_id) !== Number(values.cinema_id)) throw showtimeError('Phòng chiếu không thuộc rạp đã chọn', 400, 'room_id');
  if (Number(cinema.status) !== 1) throw showtimeError('Rạp đang tạm ngừng hoạt động', 409, 'cinema_id');
  if (Number(room.status) !== 1) throw showtimeError('Phòng chiếu đang bảo trì hoặc ngừng hoạt động', 409, 'room_id');
  if (movie.status === MOVIE_STATUS.ENDED) throw showtimeError('Không thể xếp lịch cho phim đã ngừng chiếu', 409, 'movie_id');
  if ((movie.release_date && values.date < movie.release_date) || (movie.end_date && values.date > movie.end_date)) {
    throw showtimeError('Ngày chiếu phải nằm trong thời gian phát hành của phim', 400, 'date');
  }
  if (room.room_type !== values.screen_format) {
    throw showtimeError('Định dạng chiếu phải phù hợp với loại phòng', 400, 'screen_format');
  }
  const duration = Number(movie.duration);
  if (!Number.isInteger(duration) || duration <= 0) throw showtimeError('Thời lượng phim không hợp lệ', 409, 'movie_id');
  const start = vietnamTimestamp(values.date, values.start_time);
  const end = start + (duration + CLEANING_MINUTES) * 60000;
  if (!Number.isFinite(end) || end > Date.parse('9999-12-31T23:59:59+07:00')) {
    throw showtimeError('Giờ kết thúc vượt giới hạn ngày hợp lệ', 400, 'date');
  }
  const startTime = vietnamDateTime(start);
  const endTime = vietnamDateTime(end);
  ensureFuture(startTime);
  const [seats] = await conn.query('SELECT seat_id FROM seats WHERE room_id = ? ORDER BY seat_id FOR UPDATE', [Number(values.room_id)]);
  if (!seats.length) throw showtimeError('Phòng chiếu chưa có ghế', 409, 'room_id');
  return { startTime, endTime };
}

async function ensureNoOverlap(conn, roomId, startTime, endTime, excludedId = 0) {
  const [rows] = await conn.query(
    `SELECT showtime_id FROM showtimes
     WHERE room_id = ? AND status IN (0, 1) AND showtime_id <> ?
       AND start_time < ? AND end_time > ? LIMIT 1 FOR UPDATE`,
    [Number(roomId), excludedId, endTime, startTime],
  );
  if (rows.length) throw showtimeError('Lịch chiếu bị trùng, bao gồm 15 phút dọn phòng', 409, 'start_time');
}

async function ensureSafeStructure(conn, id) {
  const [seats] = await conn.query(
    `SELECT seat_id, status,
       (held_until IS NULL OR held_until > ${VN_NOW_SQL}) AS active_hold
     FROM showtime_seats WHERE showtime_id = ? ORDER BY seat_id FOR UPDATE`, [id],
  );
  const [tickets] = await conn.query('SELECT ticket_id FROM tickets WHERE showtime_id = ? LIMIT 1 FOR UPDATE', [id]);
  if (tickets.length) throw showtimeError('Không thể sửa lịch, xóa hoặc hủy suất chiếu đã có vé, kể cả vé chờ thanh toán hoặc đã hủy');
  if (seats.some((seat) => Number(seat.status) === SEAT_STATUS.SOLD)) {
    throw showtimeError('Không thể sửa lịch, xóa hoặc hủy suất chiếu đã có ghế bán');
  }
  if (seats.some((seat) => Number(seat.status) === SEAT_STATUS.HELD && Number(seat.active_hold))) {
    throw showtimeError('Suất chiếu đang có ghế được giữ. Vui lòng thử lại sau khi hết hạn giữ ghế');
  }
}

async function insertInventory(conn, id, roomId) {
  await conn.query(
    `INSERT INTO showtime_seats (showtime_id, seat_id, status)
     SELECT ?, seat_id, 1 FROM seats WHERE room_id = ? ORDER BY seat_id`, [id, Number(roomId)],
  );
}

async function freeInventory(conn, id) {
  // The caller has rejected sold seats and live (including undated) holds.
  await conn.query('UPDATE showtime_seats SET status = 1, held_until = NULL, held_by = NULL WHERE showtime_id = ?', [id]);
}

async function write(work) {
  try {
    return await withTransaction(work);
  } catch (error) {
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw showtimeError('Lịch chiếu đang được cập nhật hoặc đặt vé. Vui lòng thử lại');
    }
    if (['ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW_2'].includes(error.code)) {
      throw showtimeError('Dữ liệu liên quan đã thay đổi hoặc suất chiếu đã có vé. Vui lòng tải lại trang');
    }
    throw error;
  }
}

async function create(input) {
  const values = checkedValues(input);
  return write(async (conn) => {
    const context = await lockContext(conn, null, values);
    const { startTime, endTime } = await eligibleSchedule(conn, context, values);
    await ensureNoOverlap(conn, values.room_id, startTime, endTime);
    ensureFuture(startTime);
    const [result] = await conn.query(
      `INSERT INTO showtimes (movie_id, room_id, start_time, end_time, screen_format, language, status)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [Number(values.movie_id), Number(values.room_id), startTime, endTime, values.screen_format, values.language],
    );
    await insertInventory(conn, result.insertId, values.room_id);
    return result.insertId;
  });
}

async function update(value, input) {
  const id = requireId(value);
  const values = checkedValues(input);
  return write(async (conn) => {
    const context = await lockContext(conn, id, values);
    const current = context.current;
    const { startTime, endTime } = await eligibleSchedule(conn, context, values);
    ensureFuture(current.start_time);
    const roomChanged = Number(current.room_id) !== Number(values.room_id);
    const changed = roomChanged || Number(current.movie_id) !== Number(values.movie_id) ||
      current.start_time !== startTime || current.end_time !== endTime ||
      current.screen_format !== values.screen_format || current.language !== values.language;
    if (!changed) return id;
    await ensureSafeStructure(conn, id);
    if (Number(current.status) !== SHOWTIME_STATUS.CANCELLED) {
      await ensureNoOverlap(conn, values.room_id, startTime, endTime, id);
    }
    // Child/overlap locks may have waited until either schedule had already started.
    ensureFuture(current.start_time);
    ensureFuture(startTime);
    await conn.query(
      `UPDATE showtimes SET movie_id = ?, room_id = ?, start_time = ?, end_time = ?, screen_format = ?, language = ?
       WHERE showtime_id = ?`,
      [Number(values.movie_id), Number(values.room_id), startTime, endTime, values.screen_format, values.language, id],
    );
    if (roomChanged) {
      await conn.query('DELETE FROM showtime_seats WHERE showtime_id = ?', [id]);
      await insertInventory(conn, id, values.room_id);
    } else {
      await freeInventory(conn, id);
    }
    return id;
  });
}

async function remove(value) {
  const id = requireId(value);
  return write(async (conn) => {
    const { current } = await lockContext(conn, id);
    ensureFuture(current.start_time);
    await ensureSafeStructure(conn, id);
    ensureFuture(current.start_time);
    // Only inventory cascades; tickets and orders are never deleted by this backend.
    await conn.query('DELETE FROM showtimes WHERE showtime_id = ?', [id]);
    return id;
  });
}

async function changeStatus(value, status) {
  const id = requireId(value);
  const result = validateStatus({ status: typeof status === 'number' ? String(status) : status });
  if (result.errors.length) throw showtimeError(result.errors[0], 400, 'status');
  const target = Number(result.values.status);
  return write(async (conn) => {
    const context = await lockContext(conn, id);
    const current = context.current;
    const previous = Number(current.status);
    if (previous === target) return id;
    ensureFuture(current.start_time);
    let endTime = current.end_time;
    if (target === SHOWTIME_STATUS.CANCELLED) {
      await ensureSafeStructure(conn, id);
      await freeInventory(conn, id);
    } else {
      // Closing an open showtime does not alter its schedule or invalidate existing tickets.
      if (target === SHOWTIME_STATUS.OPEN || previous === SHOWTIME_STATUS.CANCELLED) {
        const room = context.rooms.get(Number(current.room_id));
        const values = checkedValues({
          movie_id: current.movie_id, cinema_id: room.cinema_id, room_id: current.room_id,
          date: current.start_time.slice(0, 10), start_time: current.start_time.slice(11, 16),
          screen_format: current.screen_format, language: current.language,
        });
        const schedule = await eligibleSchedule(conn, context, values);
        endTime = schedule.endTime;
        if (previous === SHOWTIME_STATUS.CANCELLED || endTime !== current.end_time) {
          await ensureSafeStructure(conn, id);
          await freeInventory(conn, id);
        }
        await ensureNoOverlap(conn, current.room_id, current.start_time, endTime, id);
      }
    }
    ensureFuture(current.start_time);
    await conn.query('UPDATE showtimes SET status = ?, end_time = ? WHERE showtime_id = ?', [target, endTime, id]);
    return id;
  });
}

module.exports = { PAGE_SIZE, CLEANING_MINUTES, list, options, findById, create, update, remove, changeStatus };
