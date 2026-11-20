const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

// các dòng giá áp dụng cho một suất chiếu (mọi loại ghế) dòng hiệu lực mới nhất xếp trước
async function findApplicable({ screenFormat, dayType, time, ymd }) {
  return query(
    `SELECT seat_type_id, price
       FROM ticket_prices
      WHERE screen_format = ?
        AND day_type = ?
        AND (time_from IS NULL OR time_from <= ?)
        AND (time_to   IS NULL OR time_to   >= ?)
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_to   IS NULL OR valid_to   >= ?)
      ORDER BY valid_from DESC, price_id DESC`,
    [screenFormat, dayType, time, time, ymd, ymd],
  );
}

const columns = `p.*, st.seat_type_name,
  DATE_FORMAT(p.valid_from, '%Y-%m-%d') AS valid_from,
  DATE_FORMAT(p.valid_to, '%Y-%m-%d') AS valid_to`;

async function listPage(requestedPage = 1, filters = {}) {
  const pageSize = 10;
  const pageNumber = Number(requestedPage);
  const conditions = [];
  const parameters = [];
  if (filters.seat) {
    conditions.push('p.seat_type_id = ?');
    parameters.push(filters.seat);
  }
  if (filters.q) {
    const search = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push('(st.seat_type_name LIKE ? OR CAST(p.price AS CHAR) LIKE ?)');
    parameters.push(search, search);
  }
  if (filters.format) {
    conditions.push('p.screen_format = ?');
    parameters.push(filters.format);
  }
  if (filters.day) {
    conditions.push('p.day_type = ?');
    parameters.push(filters.day);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = 'FROM ticket_prices p JOIN seat_types st ON st.seat_type_id = p.seat_type_id';
  const [count] = await query(`SELECT COUNT(*) AS total ${from} ${where}`, parameters);
  const total = Number(count.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const validPage = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const page = Math.min(validPage, totalPages);
  const offset = (page - 1) * pageSize;
  const rows = await query(`SELECT ${columns} ${from} ${where}
    ORDER BY p.seat_type_id, p.screen_format,
      FIELD(p.day_type, 'WEEKDAY', 'WEEKEND', 'HOLIDAY'), p.time_from, p.valid_from, p.price_id
    LIMIT ? OFFSET ?`, [...parameters, pageSize, offset]);
  return {
    rows,
    pagination: { page, pageSize, total, totalPages, start: total ? offset + 1 : 0, end: offset + rows.length },
  };
}

function listSeatTypes() {
  return query('SELECT seat_type_id, seat_type_name FROM seat_types ORDER BY seat_type_id');
}

async function findById(id) {
  const rows = await query(`SELECT ${columns} FROM ticket_prices p
    JOIN seat_types st ON st.seat_type_id = p.seat_type_id WHERE p.price_id = ?`, [id]);
  if (!rows.length) throw new AppError('Mức giá vé không tồn tại.', 404);
  return rows[0];
}

function save(values, id = null) {
  return withTransaction(async (connection) => {
    // Lock the seat type so simultaneous submissions cannot create overlapping prices.
    const [seatTypes] = await connection.query(
      'SELECT seat_type_id FROM seat_types WHERE seat_type_id = ? FOR UPDATE', [values.seat_type_id],
    );
    if (!seatTypes.length) throw new AppError('Loại ghế không tồn tại.', 400);
    if (id) {
      const [rows] = await connection.query('SELECT price_id FROM ticket_prices WHERE price_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw new AppError('Mức giá vé không tồn tại.', 404);
    }
    const [overlaps] = await connection.query(`SELECT price_id FROM ticket_prices
      WHERE seat_type_id = ? AND screen_format <=> ? AND day_type <=> ? AND price_id <> ?
        AND COALESCE(time_from, '00:00:00') <= COALESCE(?, '23:59:59')
        AND COALESCE(time_to, '23:59:59') >= COALESCE(?, '00:00:00')
        AND COALESCE(valid_from, '1000-01-01') <= COALESCE(?, '9999-12-31')
        AND COALESCE(valid_to, '9999-12-31') >= COALESCE(?, '1000-01-01')
      LIMIT 1 FOR UPDATE`, [values.seat_type_id, values.screen_format, values.day_type, id || 0,
      values.time_to, values.time_from, values.valid_to, values.valid_from]);
    if (overlaps.length) {
      throw new AppError('Khoảng áp dụng trùng với mức giá hiện có cho cùng loại ghế, định dạng và loại ngày.', 409);
    }
    if (id) return connection.query('UPDATE ticket_prices SET ? WHERE price_id = ?', [values, id]);
    return connection.query('INSERT INTO ticket_prices SET ?', [values]);
  });
}

async function remove(id) {
  const result = await query('DELETE FROM ticket_prices WHERE price_id = ?', [id]);
  if (!result.affectedRows) throw new AppError('Mức giá vé không tồn tại.', 404);
}

module.exports = { findApplicable, listPage, listSeatTypes, findById, save, remove };
