const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { ROLE } = require('../constants');

const PAGE_SIZE = 8;

function accountError(message, status, field) {
  const error = new AppError(message, status);
  error.field = field;
  return error;
}

const isDuplicate = (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062;

// tên khóa UNIQUE xuất hiện trong thông báo của MySQL ('accounts.phone' hoặc 'accounts.email')
function duplicateError(err) {
  return /phone/i.test(String(err.sqlMessage || err.message || ''))
    ? accountError('Số điện thoại đã được sử dụng', 409, 'phone')
    : accountError('Email đã được sử dụng', 409, 'email');
}

const FROM = `FROM accounts a
  JOIN roles r ON r.role_id = a.role_id
  LEFT JOIN customers c ON c.account_id = a.account_id
  LEFT JOIN staff s ON s.account_id = a.account_id
  LEFT JOIN cinemas ci ON ci.cinema_id = s.cinema_id`;
const NAME = 'COALESCE(c.full_name, s.full_name)';
const COLUMNS = `a.account_id, a.email, a.phone, a.status, a.created_at, r.role_name,
  ${NAME} AS full_name, s.cinema_id, ci.cinema_name, s.position`;

async function listPage(filters) {
  const where = ['r.role_name = ?'];
  const params = [filters.role];
  if (filters.q) {
    where.push(`(LOCATE(LOWER(?), LOWER(COALESCE(${NAME}, ''))) > 0
      OR LOCATE(LOWER(?), LOWER(a.email)) > 0
      OR LOCATE(?, COALESCE(a.phone, '')) > 0)`);
    params.push(filters.q, filters.q, filters.q);
  }
  if (filters.status !== '') {
    where.push('a.status = ?');
    params.push(Number(filters.status));
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const counts = await query(`SELECT COUNT(*) AS total ${FROM} ${clause}`, params);
  const total = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const accounts = await query(
    `SELECT ${COLUMNS} ${FROM} ${clause} ORDER BY a.account_id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    accounts,
    filters: { ...filters, page },
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages },
  };
}

async function countByRole() {
  const rows = await query(
    `SELECT r.role_name, COUNT(a.account_id) AS total
       FROM roles r LEFT JOIN accounts a ON a.role_id = r.role_id
      GROUP BY r.role_name`,
  );
  return Object.fromEntries(rows.map((row) => [row.role_name, Number(row.total)]));
}

async function findById(id) {
  const rows = await query(`SELECT ${COLUMNS} ${FROM} WHERE a.account_id = ?`, [id]);
  return rows[0] || null;
}

const listActiveCinemas = () => query('SELECT cinema_id, cinema_name FROM cinemas WHERE status = 1 ORDER BY cinema_name');

async function findCinema(id) {
  const rows = await query('SELECT cinema_id, cinema_name, status FROM cinemas WHERE cinema_id = ?', [id]);
  return rows[0] || null;
}

async function createStaff({ email, phone, fullName, cinemaId, position, passwordHash }) {
  try {
    return await withTransaction(async (conn) => {
      const [roles] = await conn.query('SELECT role_id FROM roles WHERE role_name = ?', [ROLE.STAFF]);
      if (!roles.length) throw new Error('Chưa có vai trò STAFF. Hãy chạy `npm run db:reset` để nạp seed.sql');
      const [account] = await conn.query(
        'INSERT INTO accounts (email, phone, password, role_id) VALUES (?, ?, ?, ?)',
        [email, phone, passwordHash, roles[0].role_id],
      );
      await conn.query(
        'INSERT INTO staff (account_id, full_name, cinema_id, position) VALUES (?, ?, ?, ?)',
        [account.insertId, fullName, cinemaId, position],
      );
      return account.insertId;
    });
  } catch (err) {
    if (isDuplicate(err)) throw duplicateError(err);
    throw err;
  }
}

async function updateStaff(id, { phone, fullName, cinemaId, position }) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT a.account_id FROM accounts a JOIN roles r ON r.role_id = a.role_id
          WHERE a.account_id = ? AND r.role_name = ? FOR UPDATE`,
        [id, ROLE.STAFF],
      );
      if (!rows.length) throw accountError('Không tìm thấy nhân viên', 404);
      await conn.query('UPDATE accounts SET phone = ? WHERE account_id = ?', [phone, id]);
      await conn.query(
        'UPDATE staff SET full_name = ?, cinema_id = ?, position = ? WHERE account_id = ?',
        [fullName, cinemaId, position, id],
      );
      return { account_id: id };
    });
  } catch (err) {
    if (isDuplicate(err)) throw duplicateError(err);
    throw err;
  }
}

// khóa hoặc mở khóa, tài khoản quản trị không bị thay đổi ở đây
async function setStatus(id, status) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT a.status, r.role_name FROM accounts a JOIN roles r ON r.role_id = a.role_id
        WHERE a.account_id = ? FOR UPDATE`,
      [id],
    );
    if (!rows.length) throw accountError('Không tìm thấy tài khoản', 404);
    if (rows[0].role_name === ROLE.ADMIN) {
      throw accountError('Không thể khóa hoặc mở khóa tài khoản quản trị', 403);
    }
    await conn.query('UPDATE accounts SET status = ? WHERE account_id = ?', [status, id]);
    return { role: rows[0].role_name, changed: rows[0].status !== status };
  });
}

module.exports = {
  PAGE_SIZE, listPage, countByRole, findById, listActiveCinemas, findCinema,
  createStaff, updateStaff, setStatus,
};