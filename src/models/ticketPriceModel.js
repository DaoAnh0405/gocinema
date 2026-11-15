const { query } = require('../config/db');

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

module.exports = { findApplicable };