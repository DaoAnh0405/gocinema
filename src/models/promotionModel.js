const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

// khuyến mãi đang áp dụng: bật, trong thời hạn, còn lượt dùng
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

async function listForAdmin({ search = '', status = 'ALL' } = {}) {
  const params = [];
  let where = '';
  if (search) {
    where = 'WHERE promo_code LIKE ? OR promotion_name LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  const allowedStatuses = ['ALL', 'ACTIVE', 'UPCOMING', 'EXPIRED', 'PAUSED'];
  const filterStatus = allowedStatuses.includes(status) ? status : 'ALL';
  params.push(filterStatus, filterStatus);

  return query(
    `SELECT promotion_id, promo_code, promotion_name, description,
            discount_type, discount_value, max_discount, min_order_value,
            DATE_FORMAT(start_date, '%Y-%m-%dT%H:%i') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%dT%H:%i') AS end_date,
            DATE_FORMAT(start_date, '%d/%m/%Y') AS start_date_display,
            DATE_FORMAT(end_date, '%d/%m/%Y') AS end_date_display,
            quantity, used_count, status,
            CASE
              WHEN status = -1 THEN 'PAUSED'
              WHEN status = 0
                OR (end_date IS NOT NULL AND end_date < NOW())
                OR (quantity IS NOT NULL AND used_count >= quantity) THEN 'EXPIRED'
              WHEN start_date IS NOT NULL AND start_date > NOW() THEN 'UPCOMING'
              ELSE 'ACTIVE'
            END AS effective_status
       FROM promotions
       ${where}
      HAVING (? = 'ALL' OR effective_status = ?)
      ORDER BY promotion_id DESC`,
    params,
  );
}

async function findForAdmin(id) {
  const rows = await query(
    `SELECT promotion_id, promo_code, promotion_name, description,
            discount_type, discount_value, max_discount, min_order_value,
            DATE_FORMAT(start_date, '%Y-%m-%dT%H:%i') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%dT%H:%i') AS end_date,
            DATE_FORMAT(start_date, '%d/%m/%Y') AS start_date_display,
            DATE_FORMAT(end_date, '%d/%m/%Y') AS end_date_display,
            quantity, used_count, status
       FROM promotions
      WHERE promotion_id = ?`,
    [id],
  );
  return rows[0] || null;
}

async function createForAdmin(promotion) {
  try {
    const result = await query(
      `INSERT INTO promotions
        (promo_code, promotion_name, description, discount_type, discount_value,
         max_discount, min_order_value, start_date, end_date, quantity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        promotion.promo_code,
        promotion.promotion_name,
        promotion.description,
        promotion.discount_type,
        promotion.discount_value,
        promotion.max_discount,
        promotion.min_order_value,
        promotion.start_date,
        promotion.end_date,
        promotion.quantity,
      ],
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError('Mã khuyến mãi đã tồn tại', 409);
    }
    throw err;
  }
}

async function updateForAdmin(id, promotion) {
  try {
    await query(
      `UPDATE promotions
          SET promo_code = ?, promotion_name = ?, description = ?,
              discount_type = ?, discount_value = ?, max_discount = ?,
              min_order_value = ?, start_date = ?, end_date = ?, quantity = ?
        WHERE promotion_id = ?`,
      [
        promotion.promo_code,
        promotion.promotion_name,
        promotion.description,
        promotion.discount_type,
        promotion.discount_value,
        promotion.max_discount,
        promotion.min_order_value,
        promotion.start_date,
        promotion.end_date,
        promotion.quantity,
        id,
      ],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError('Mã khuyến mãi đã tồn tại', 409);
    }
    throw err;
  }
}

async function setAdminStatus(id, status) {
  const result = await query(
    'UPDATE promotions SET status = ? WHERE promotion_id = ?',
    [status, id],
  );
  if (result.affectedRows > 0) return true;
  const rows = await query('SELECT promotion_id FROM promotions WHERE promotion_id = ?', [id]);
  return rows.length > 0;
}

async function deleteForAdmin(id) {
  try {
    return await withTransaction(async (connection) => {
      const [promotions] = await connection.query(
        'SELECT promotion_id FROM promotions WHERE promotion_id = ? FOR UPDATE',
        [id],
      );
      if (!promotions.length) throw new AppError('Không tìm thấy khuyến mãi', 404);

      const [orders] = await connection.query(
        'SELECT COUNT(*) AS order_count FROM orders WHERE promotion_id = ?',
        [id],
      );
      if (orders[0].order_count > 0) {
        throw new AppError(
          'Khuyến mãi đã được gắn với đơn hàng nên không thể xóa. Bạn có thể tạm dừng chương trình.',
          409,
        );
      }

      await connection.query('DELETE FROM promotions WHERE promotion_id = ?', [id]);
    });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new AppError(
        'Khuyến mãi đã được sử dụng nên không thể xóa. Bạn có thể tạm dừng chương trình.',
        409,
      );
    }
    throw err;
  }
}

module.exports = {
  listActive,
  listForAdmin,
  findForAdmin,
  createForAdmin,
  updateForAdmin,
  setAdminStatus,
  deleteForAdmin,
};