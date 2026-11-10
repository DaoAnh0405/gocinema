const { query } = require('../config/db');

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

module.exports = { listActive };