const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const PAGE_SIZE = 8;
const IN_USE_MESSAGE = 'Không thể xóa mã đã được dùng trong đơn hàng. Hãy chuyển sang "Tạm dừng"';

function promoError(message, status, field) {
  const error = new AppError(message, status);
  error.field = field;
  return error;
}

const isDuplicate = (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
const isReferenced = (err) => err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451;

// trạng thái hiển thị = trạng thái lưu + thời hạn + số lượt
const EFFECTIVE_STATUS = `CASE
  WHEN p.status = -1 THEN 'PAUSED'
  WHEN p.status = 0
    OR (p.end_date IS NOT NULL AND p.end_date < NOW())
    OR (p.quantity IS NOT NULL AND p.used_count >= p.quantity) THEN 'EXPIRED'
  WHEN p.start_date IS NOT NULL AND p.start_date > NOW() THEN 'UPCOMING'
  ELSE 'ACTIVE'
END`;

/* phần dùng cho khách hàng / đặt vé */

// khuyến mãi đang áp dụng bật, trong thời hạn, còn lượt dùng
async function listActive(limit = 4) {
  const n = Math.max(1, parseInt(limit, 10) || 4);
  return query(
    `SELECT promotion_id, promo_code, promotion_name, description,
            discount_type, discount_value, max_discount, min_order_value, end_date
       FROM promotions
      WHERE status = 1
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date   IS NULL OR end_date   >= NOW())
        AND (quantity   IS NULL OR used_count < quantity)
      ORDER BY end_date ASC
      LIMIT ${n}`,
  );
}

async function findByCode(code) {
  const rows = await query(`SELECT * FROM promotions WHERE promo_code = ?`, [code]);
  return rows[0] || null;
}

// giữ chỗ một lượt dùng trả false nếu mã đã hết lượt
async function reserveUse(conn, promotionId) {
  const [res] = await conn.query(
    `UPDATE promotions SET used_count = used_count + 1
      WHERE promotion_id = ? AND status = 1 AND (quantity IS NULL OR used_count < quantity)`,
    [promotionId],
  );
  return res.affectedRows === 1;
}

async function releaseUse(conn, promotionId) {
  await conn.query(
    `UPDATE promotions SET used_count = GREATEST(used_count - 1, 0) WHERE promotion_id = ?`,
    [promotionId],
  );
}

/* phần quản trị */

const ADMIN_SELECT = `SELECT p.*,
    DATE_FORMAT(p.start_date, '%Y-%m-%d') AS start_text,
    DATE_FORMAT(p.end_date, '%Y-%m-%d') AS end_text,
    ${EFFECTIVE_STATUS} AS effective_status
  FROM promotions p`;

async function listPage(filters) {
  const where = [];
  const params = [];
  if (filters.q) {
    where.push('(LOCATE(LOWER(?), LOWER(t.promo_code)) > 0 OR LOCATE(LOWER(?), LOWER(t.promotion_name)) > 0)');
    params.push(filters.q, filters.q);
  }
  if (filters.status) {
    where.push('t.effective_status = ?');
    params.push(filters.status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const counts = await query(`SELECT COUNT(*) AS total FROM (${ADMIN_SELECT}) t ${clause}`, params);
  const total = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const promotions = await query(
    `SELECT t.* FROM (${ADMIN_SELECT}) t ${clause}
      ORDER BY t.promotion_id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    promotions,
    filters: { ...filters, page },
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages },
  };
}

const FIELDS = [
  'promo_code', 'promotion_name', 'description', 'discount_type', 'discount_value',
  'max_discount', 'min_order_value', 'start_date', 'end_date', 'quantity', 'status',
];
const toParams = (promo) => FIELDS.map((field) => (promo[field] === undefined ? null : promo[field]));
const duplicateCode = () => promoError('Mã khuyến mãi đã tồn tại', 409, 'promo_code');

async function create(promo) {
  try {
    const result = await query(
      `INSERT INTO promotions (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`,
      toParams(promo),
    );
    return result.insertId;
  } catch (err) {
    if (isDuplicate(err)) throw duplicateCode();
    throw err;
  }
}

async function update(id, promo) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT used_count FROM promotions WHERE promotion_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw promoError('Không tìm thấy khuyến mãi', 404);
      const used = Number(rows[0].used_count);
      if (promo.quantity != null && promo.quantity < used) {
        throw promoError(`Số lượng không được nhỏ hơn số lượt đã dùng (${used})`, 400, 'quantity');
      }
      await conn.query(
        `UPDATE promotions SET ${FIELDS.map((field) => `${field} = ?`).join(', ')} WHERE promotion_id = ?`,
        [...toParams(promo), id],
      );
      return { promotion_id: id };
    });
  } catch (err) {
    if (isDuplicate(err)) throw duplicateCode();
    throw err;
  }
}

async function remove(id) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT promotion_id FROM promotions WHERE promotion_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw promoError('Không tìm thấy khuyến mãi', 404);
      const [used] = await conn.query('SELECT 1 FROM orders WHERE promotion_id = ? LIMIT 1', [id]);
      if (used.length) throw promoError(IN_USE_MESSAGE, 409);
      await conn.query('DELETE FROM promotions WHERE promotion_id = ?', [id]);
      return rows[0];
    });
  } catch (err) {
    if (isReferenced(err)) throw promoError(IN_USE_MESSAGE, 409);
    throw err;
  }
}

module.exports = {
  PAGE_SIZE, listActive, findByCode, reserveUse, releaseUse,
  listPage, create, update, remove,
};