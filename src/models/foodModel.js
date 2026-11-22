const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const PAGE_SIZE = 8;
const IN_USE_MESSAGE = 'Không thể xóa món đã có trong đơn hàng. Hãy chuyển sang "Ngừng bán"';

function foodError(message, status, field) {
  const error = new AppError(message, status);
  error.field = field;
  return error;
}

const isReferenced = (err) => err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451;

/* phần dùng cho khách hàng / thanh toán */

async function listActive() {
  return query(
    `SELECT food_id, food_name, category, price, image_url
       FROM food_items WHERE status = 1
      ORDER BY FIELD(category, 'COMBO', 'POPCORN', 'DRINK'), price`,
  );
}

async function findActiveByIds(ids) {
  if (!ids.length) return [];
  return query(
    `SELECT food_id, food_name, price FROM food_items WHERE status = 1 AND food_id IN (?)`,
    [ids],
  );
}

/* phần quản trị */

async function listPage(filters) {
  const where = [];
  const params = [];
  if (filters.q) {
    // LOCATE tránh phải escape ký tự % _ của LIKE
    where.push('LOCATE(LOWER(?), LOWER(food_name)) > 0');
    params.push(filters.q);
  }
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.status !== '') {
    where.push('status = ?');
    params.push(Number(filters.status));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const counts = await query(`SELECT COUNT(*) AS total FROM food_items ${clause}`, params);
  const total = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const foods = await query(
    `SELECT food_id, food_name, category, price, image_url, status
       FROM food_items ${clause}
      ORDER BY food_id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    foods,
    filters: { ...filters, page },
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages },
  };
}

async function findById(id) {
  const rows = await query(
    'SELECT food_id, food_name, category, price, image_url, status FROM food_items WHERE food_id = ?',
    [id],
  );
  return rows[0] || null;
}

async function create({ food_name, category, price, image_url, status }) {
  const result = await query(
    'INSERT INTO food_items (food_name, category, price, image_url, status) VALUES (?, ?, ?, ?, ?)',
    [food_name, category, price, image_url || null, status],
  );
  return result.insertId;
}

// image_url === undefined nghĩa là giữ ảnh hiện tại (đọc lại trong transaction, tránh ghi đè ảnh mới hơn)
async function update(id, { food_name, category, price, image_url, status }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT image_url FROM food_items WHERE food_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw foodError('Không tìm thấy món', 404);
    const nextImage = image_url === undefined ? rows[0].image_url : image_url;
    await conn.query(
      'UPDATE food_items SET food_name = ?, category = ?, price = ?, image_url = ?, status = ? WHERE food_id = ?',
      [food_name, category, price, nextImage, status, id],
    );
    return { food_id: id, previousImageUrl: rows[0].image_url };
  });
}

async function remove(id) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT food_id, image_url FROM food_items WHERE food_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw foodError('Không tìm thấy món', 404);
      const [used] = await conn.query('SELECT 1 FROM order_food_items WHERE food_id = ? LIMIT 1', [id]);
      if (used.length) throw foodError(IN_USE_MESSAGE, 409);
      await conn.query('DELETE FROM food_items WHERE food_id = ?', [id]);
      return rows[0];
    });
  } catch (err) {
    if (isReferenced(err)) throw foodError(IN_USE_MESSAGE, 409);
    throw err;
  }
}

module.exports = {
  PAGE_SIZE, listActive, findActiveByIds,
  listPage, findById, create, update, remove,
};