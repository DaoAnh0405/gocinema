const { query } = require('../config/db');

// đọc không cần transaction

async function getSeatRows(showtimeId) {
  return query(
    `SELECT se.seat_id, se.seat_row, se.seat_number, se.seat_type_id, st.seat_type_name,
            ss.status, ss.held_by,
            (ss.status = 0 AND ss.held_until > NOW()) AS is_held,
            GREATEST(TIMESTAMPDIFF(SECOND, NOW(), ss.held_until), 0) AS seconds_left
       FROM showtime_seats ss
       JOIN seats se      ON se.seat_id = ss.seat_id
       JOIN seat_types st ON st.seat_type_id = se.seat_type_id
      WHERE ss.showtime_id = ?
      ORDER BY se.seat_row, se.seat_number`,
    [showtimeId],
  );
}

// các ghế người này đang giữ còn hạn trong suất chiếu
async function getMyHeldSeats(showtimeId, accountId) {
  return query(
    `SELECT se.seat_id, se.seat_row, se.seat_number, se.seat_type_id, st.seat_type_name,
            GREATEST(TIMESTAMPDIFF(SECOND, NOW(), ss.held_until), 0) AS seconds_left
       FROM showtime_seats ss
       JOIN seats se      ON se.seat_id = ss.seat_id
       JOIN seat_types st ON st.seat_type_id = se.seat_type_id
      WHERE ss.showtime_id = ? AND ss.held_by = ? AND ss.status = 0 AND ss.held_until > NOW()
      ORDER BY se.seat_row, se.seat_number`,
    [showtimeId, accountId],
  );
}

// dùng cho job nhả mọi ghế đã quá hạn giữ
async function releaseExpired() {
  return query(
    `UPDATE showtime_seats SET status = 1, held_until = NULL, held_by = NULL
      WHERE status = 0 AND held_until < NOW()`,
  );
}

// xác hàm dưới đây chạy trong transaction

async function findLivePendingOrder(conn, customerId, holdMinutes) {
  const [rows] = await conn.query(
    `SELECT order_id, order_code FROM orders
      WHERE customer_id = ? AND status = 'PENDING'
        AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
      LIMIT 1`,
    [customerId, holdMinutes],
  );
  return rows[0] || null;
}

// ORDER BY seat_id mọi giao dịch khóa cùng thứ tự nên không deadlock
async function lockSeats(conn, showtimeId, seatIds) {
  const [rows] = await conn.query(
    `SELECT seat_id, status, held_by, (status = 0 AND held_until > NOW()) AS is_held
       FROM showtime_seats
      WHERE showtime_id = ? AND seat_id IN (?)
      ORDER BY seat_id
      FOR UPDATE`,
    [showtimeId, seatIds],
  );
  return rows;
}

async function getSeatLabels(conn, seatIds) {
  const [rows] = await conn.query(
    `SELECT seat_row, seat_number FROM seats WHERE seat_id IN (?) ORDER BY seat_row, seat_number`,
    [seatIds],
  );
  return rows.map((r) => `${r.seat_row}${r.seat_number}`);
}

async function releaseHolds(conn, showtimeId, accountId, exceptSeatIds = []) {
  const params = [showtimeId, accountId];
  let except = '';
  if (exceptSeatIds.length) {
    except = ' AND seat_id NOT IN (?)';
    params.push(exceptSeatIds);
  }
  await conn.query(
    `UPDATE showtime_seats SET status = 1, held_until = NULL, held_by = NULL
      WHERE showtime_id = ? AND held_by = ? AND status = 0${except}`,
    params,
  );
}

// ghế đang được chính người này giữ còn hạn thì giữ nguyên giờ hết hạn (không vô hạn)
async function markHeld(conn, showtimeId, accountId, seatIds, holdMinutes) {
  await conn.query(
    `UPDATE showtime_seats
        SET held_until = CASE WHEN status = 0 AND held_by = ? AND held_until > NOW()
                              THEN held_until
                              ELSE DATE_ADD(NOW(), INTERVAL ? MINUTE) END,
            status = 0,
            held_by = ?
      WHERE showtime_id = ? AND seat_id IN (?)`,
    [accountId, holdMinutes, accountId, showtimeId, seatIds],
  );
}

// khi tạo đơn gia hạn ghế đúng bằng thời gian thanh toán của đơn
async function extendHold(conn, showtimeId, seatIds, holdMinutes) {
  await conn.query(
    `UPDATE showtime_seats SET held_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
      WHERE showtime_id = ? AND seat_id IN (?)`,
    [holdMinutes, showtimeId, seatIds],
  );
}

// thanh toán xong ghế của đơn thành đã bán
async function markSeatsSoldByOrder(conn, orderId) {
  await conn.query(
    `UPDATE showtime_seats ss
       JOIN tickets t ON t.showtime_id = ss.showtime_id AND t.seat_id = ss.seat_id
        SET ss.status = -1, ss.held_until = NULL, ss.held_by = NULL
      WHERE t.order_id = ?`,
    [orderId],
  );
}

// đơn bị hủy hoặc hết hạn trả ghế về trống
async function releaseSeatsByOrder(conn, orderId) {
  await conn.query(
    `UPDATE showtime_seats ss
       JOIN tickets t ON t.showtime_id = ss.showtime_id AND t.seat_id = ss.seat_id
        SET ss.status = 1, ss.held_until = NULL, ss.held_by = NULL
      WHERE t.order_id = ? AND ss.status = 0`,
    [orderId],
  );
}

module.exports = {
  getSeatRows, getMyHeldSeats, releaseExpired,
  findLivePendingOrder, lockSeats, getSeatLabels, releaseHolds, markHeld,
  extendHold, markSeatsSoldByOrder, releaseSeatsByOrder,
};