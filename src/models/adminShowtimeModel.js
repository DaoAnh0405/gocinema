const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { FORMATS } = require('../validators/adminShowtimeValidator');

const PAGE_SIZE = 10;

async function listCinemas() {
  return query(`SELECT cinema_id, cinema_name, city, status
                  FROM cinemas ORDER BY city, cinema_name`);
}

async function listMovies() {
  return query(`SELECT movie_id, title, release_date, end_date, duration, status,
                       DATE_FORMAT(release_date, '%Y-%m-%d') AS release_ymd,
                       DATE_FORMAT(end_date, '%Y-%m-%d') AS end_ymd
                  FROM movies ORDER BY title`);
}

async function listRooms(cinemaId, includeRoomId = null) {
  if (!Number.isInteger(Number(cinemaId)) || Number(cinemaId) < 1) return [];
  return query(`SELECT r.room_id, r.cinema_id, r.room_name, r.room_type, r.total_seats, r.status,
                       (SELECT COUNT(*) FROM seats se WHERE se.room_id = r.room_id) AS seat_count
                  FROM rooms r
                 WHERE r.cinema_id = ? AND (r.status = 1 OR r.room_id = ?)
                 ORDER BY r.room_name`, [Number(cinemaId), includeRoomId || 0]);
}

async function listPage(requestedPage, filters) {
  const conditions = [];
  const params = [];
  if (filters.date) { conditions.push('DATE(s.start_time) = ?'); params.push(filters.date); }
  if (filters.cinema) { conditions.push('c.cinema_id = ?'); params.push(filters.cinema); }
  if (filters.movie) { conditions.push('m.movie_id = ?'); params.push(filters.movie); }
  if (filters.status !== '') { conditions.push('s.status = ?'); params.push(Number(filters.status)); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const joins = `FROM showtimes s
    JOIN movies m ON m.movie_id = s.movie_id
    JOIN rooms r ON r.room_id = s.room_id
    JOIN cinemas c ON c.cinema_id = r.cinema_id
    LEFT JOIN showtime_seats ss ON ss.showtime_id = s.showtime_id`;
  const [count] = await query(`SELECT COUNT(DISTINCT s.showtime_id) AS total ${joins} ${where}`, params);
  const total = Number(count.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumber = Number(requestedPage);
  const page = Math.min(Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1, totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const rows = await query(`SELECT s.showtime_id, s.movie_id, m.title,
      c.cinema_id, c.cinema_name, r.room_id, r.room_name,
      DATE_FORMAT(s.start_time, '%Y-%m-%d') AS show_date,
      DATE_FORMAT(s.start_time, '%H:%i') AS start_clock,
      s.screen_format, s.language, s.status,
      COUNT(ss.seat_id) AS total_seats,
      COALESCE(SUM(ss.status = -1), 0) AS sold_seats,
      COALESCE(SUM(ss.status = 0 AND ss.held_until > NOW()), 0) AS held_seats
      ${joins} ${where}
      GROUP BY s.showtime_id, s.movie_id, m.title, c.cinema_id, c.cinema_name,
               r.room_id, r.room_name, s.start_time, s.screen_format, s.language, s.status
      ORDER BY s.start_time DESC, s.showtime_id DESC LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, offset]);
  return {
    rows,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, start: total ? offset + 1 : 0, end: offset + rows.length },
  };
}

async function findById(id) {
  const rows = await query(`SELECT s.showtime_id, s.movie_id, r.cinema_id, s.room_id,
      DATE_FORMAT(s.start_time, '%Y-%m-%d') AS show_date,
      DATE_FORMAT(s.start_time, '%H:%i') AS start_time,
      s.screen_format, s.language, s.status
      FROM showtimes s JOIN rooms r ON r.room_id = s.room_id
      WHERE s.showtime_id = ?`, [id]);
  return rows[0] || null;
}

async function create(values) {
  return save(values, null);
}

async function update(id, values) {
  return save(values, id);
}

async function save(values, id) {
  return withTransaction(async (conn) => {
    let existing = null;
    if (id) {
      const [rows] = await conn.query('SELECT showtime_id, room_id, status FROM showtimes WHERE showtime_id = ? FOR UPDATE', [id]);
      existing = rows[0];
      if (!existing) throw new AppError('Suất chiếu không tồn tại.', 404);
      if (Number(existing.status) === -1) throw new AppError('Không thể sửa lịch của suất chiếu đã hủy.', 409);
    }

    const [movies] = await conn.query(`SELECT movie_id, duration, status,
      DATE_FORMAT(release_date, '%Y-%m-%d') AS release_ymd,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS end_ymd
      FROM movies WHERE movie_id = ? FOR UPDATE`, [values.movie_id]);
    const movie = movies[0];
    if (!movie) throw new AppError('Phim đã chọn không tồn tại.', 400);
    if ((movie.release_ymd && values.show_date < movie.release_ymd) ||
        (movie.end_ymd && values.show_date > movie.end_ymd) || movie.status === 'ENDED') {
      throw new AppError('Ngày chiếu phải nằm trong thời gian phát hành của phim.', 400);
    }

    const [rooms] = await conn.query(`SELECT r.room_id, r.room_type, r.status, r.total_seats,
        c.status AS cinema_status, (SELECT COUNT(*) FROM seats se WHERE se.room_id = r.room_id) AS seat_count
        FROM rooms r JOIN cinemas c ON c.cinema_id = r.cinema_id
        WHERE r.room_id = ? AND r.cinema_id = ? FOR UPDATE`, [values.room_id, values.cinema_id]);
    const room = rooms[0];
    if (!room) throw new AppError('Phòng chiếu không thuộc rạp đã chọn.', 400);
    if (room.status !== 1 || room.cinema_status !== 1) throw new AppError('Rạp hoặc phòng chiếu đang ngừng hoạt động.', 409);
    if (!FORMATS.includes(values.screen_format) || room.room_type !== values.screen_format) {
      throw new AppError('Định dạng chiếu phải khớp với loại phòng đã chọn.', 400);
    }
    if (Number(room.seat_count) < 1) throw new AppError('Phòng chiếu chưa có sơ đồ ghế.', 409);

    const startAt = `${values.show_date} ${values.start_time}:00`;
    const [futureRows] = await conn.query('SELECT CAST(? AS DATETIME) > NOW() AS is_future', [startAt]);
    if (!Number(futureRows[0].is_future)) throw new AppError('Giờ chiếu phải ở thời điểm trong tương lai.', 400);

    if (existing) {
      const [usage] = await conn.query(`SELECT
        EXISTS(SELECT 1 FROM tickets WHERE showtime_id = ?) AS has_tickets,
        EXISTS(SELECT 1 FROM showtime_seats WHERE showtime_id = ? AND status = -1) AS has_sold_seats,
        EXISTS(SELECT 1 FROM showtime_seats WHERE showtime_id = ? AND status = 0 AND held_until > NOW()) AS has_holds`, [id, id, id]);
      if (Number(usage[0].has_tickets) || Number(usage[0].has_sold_seats) || Number(usage[0].has_holds)) {
        throw new AppError('Không thể sửa lịch suất chiếu đã có vé hoặc ghế đang được giữ.', 409);
      }
    }

    const [conflicts] = await conn.query(`SELECT showtime_id FROM showtimes
      WHERE room_id = ? AND showtime_id <> ? AND status <> -1
        AND start_time < DATE_ADD(CAST(? AS DATETIME), INTERVAL ? MINUTE)
        AND end_time > CAST(? AS DATETIME)
      LIMIT 1 FOR UPDATE`, [values.room_id, id || 0, startAt, Number(movie.duration) + 15, startAt]);
    if (conflicts.length) throw new AppError('Phòng đã có suất chiếu trong khoảng giờ này (đã tính 15 phút dọn phòng).', 409);

    let showtimeId = id;
    if (id) {
      await conn.query(`UPDATE showtimes SET movie_id = ?, room_id = ?, start_time = CAST(? AS DATETIME),
        end_time = DATE_ADD(CAST(? AS DATETIME), INTERVAL ? MINUTE), screen_format = ?, language = ?
        WHERE showtime_id = ?`, [values.movie_id, values.room_id, startAt, startAt,
        Number(movie.duration) + 15, values.screen_format, values.language, id]);
      await conn.query(`DELETE ss FROM showtime_seats ss
        LEFT JOIN seats se ON se.seat_id = ss.seat_id AND se.room_id = ?
        WHERE ss.showtime_id = ? AND se.seat_id IS NULL`, [values.room_id, id]);
      await conn.query(`INSERT INTO showtime_seats (showtime_id, seat_id, status, held_until, held_by)
        SELECT ?, se.seat_id, 1, NULL, NULL FROM seats se
        WHERE se.room_id = ? AND NOT EXISTS (SELECT 1 FROM showtime_seats ss
          WHERE ss.showtime_id = ? AND ss.seat_id = se.seat_id)`, [id, values.room_id, id]);
      showtimeId = id;
    } else {
      const [result] = await conn.query(`INSERT INTO showtimes
        (movie_id, room_id, start_time, end_time, screen_format, language, status)
        VALUES (?, ?, CAST(? AS DATETIME), DATE_ADD(CAST(? AS DATETIME), INTERVAL ? MINUTE), ?, ?, 1)`,
      [values.movie_id, values.room_id, startAt, startAt, Number(movie.duration) + 15, values.screen_format, values.language]);
      showtimeId = result.insertId;
      await conn.query(`INSERT INTO showtime_seats (showtime_id, seat_id, status, held_until, held_by)
        SELECT ?, seat_id, 1, NULL, NULL FROM seats WHERE room_id = ?`, [showtimeId, values.room_id]);
    }
    return showtimeId;
  });
}

async function changeStatus(id, nextStatus) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT showtime_id, status, (start_time > NOW()) AS is_future
      FROM showtimes WHERE showtime_id = ? FOR UPDATE`, [id]);
    const showtime = rows[0];
    if (!showtime) throw new AppError('Suất chiếu không tồn tại.', 404);
    if (![ -1, 0, 1 ].includes(Number(nextStatus))) throw new AppError('Trạng thái suất chiếu không hợp lệ.', 400);
    if (Number(showtime.status) === -1) throw new AppError('Suất chiếu đã hủy không thể mở lại.', 409);
    if (Number(nextStatus) === 1 && !Number(showtime.is_future)) {
      throw new AppError('Không thể mở lại suất chiếu đã đến giờ.', 409);
    }
    if (Number(nextStatus) === -1) {
      const [usage] = await conn.query(`SELECT
        EXISTS(SELECT 1 FROM tickets WHERE showtime_id = ?) AS has_tickets,
        EXISTS(SELECT 1 FROM showtime_seats WHERE showtime_id = ? AND status = -1) AS has_sold_seats,
        EXISTS(SELECT 1 FROM showtime_seats WHERE showtime_id = ? AND
          status = 0 AND held_until > NOW()) AS has_held_seats`, [id, id, id]);
      if (Number(usage[0].has_tickets) || Number(usage[0].has_sold_seats) || Number(usage[0].has_held_seats)) {
        throw new AppError('Không thể hủy suất chiếu đã có vé hoặc ghế đang bán/được giữ.', 409);
      }
    }
    await conn.query('UPDATE showtimes SET status = ? WHERE showtime_id = ?', [nextStatus, id]);
  });
}

async function remove(id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT showtime_id FROM showtimes WHERE showtime_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new AppError('Suất chiếu không tồn tại.', 404);
    const [usage] = await conn.query(`SELECT
      EXISTS(SELECT 1 FROM tickets WHERE showtime_id = ?) AS has_tickets,
      EXISTS(SELECT 1 FROM showtime_seats WHERE showtime_id = ? AND status = -1) AS has_sold_seats,
      EXISTS(SELECT 1 FROM showtime_seats WHERE showtime_id = ? AND status = 0 AND held_until > NOW()) AS has_holds`, [id, id, id]);
    if (Number(usage[0].has_tickets) || Number(usage[0].has_sold_seats) || Number(usage[0].has_holds)) {
      throw new AppError('Không thể xóa suất chiếu đã phát sinh vé hoặc có ghế đang được giữ.', 409);
    }
    await conn.query('DELETE FROM showtimes WHERE showtime_id = ?', [id]);
  });
}

module.exports = { listCinemas, listMovies, listRooms, listPage, findById, create, update, changeStatus, remove };
