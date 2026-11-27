const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const orderModel = require('./orderModel');
const bookingModel = require('./bookingModel');
const promotionModel = require('./promotionModel');
const { nextDay } = require('../validators/orderAdminValidator');

const PAGE_SIZE = 10;
const EXPORT_LIMIT = 5000;

const FROM = `FROM orders o
  LEFT JOIN accounts a ON a.account_id = o.customer_id
  LEFT JOIN customers c ON c.account_id = o.customer_id`;

// orders.cinema_id chưa được ghi ở luồng đặt vé nên rạp của đơn suy ra từ vé
const IN_CINEMA = `EXISTS (
  SELECT 1 FROM tickets tc
    JOIN showtimes sc ON sc.showtime_id = tc.showtime_id
    JOIN rooms rc ON rc.room_id = sc.room_id
   WHERE tc.order_id = o.order_id AND rc.cinema_id = ?)`;

function buildWhere(filters) {
  const where = [];
  const params = [];
  if (filters.q) {
    where.push(`(LOCATE(LOWER(?), LOWER(o.order_code)) > 0
      OR LOCATE(LOWER(?), LOWER(COALESCE(a.email, ''))) > 0
      OR LOCATE(?, COALESCE(a.phone, '')) > 0
      OR LOCATE(LOWER(?), LOWER(COALESCE(c.full_name, ''))) > 0)`);
    params.push(filters.q, filters.q, filters.q, filters.q);
  }
  if (filters.status) {
    where.push('o.status = ?');
    params.push(filters.status);
  }
  if (filters.channel) {
    where.push('o.channel = ?');
    params.push(filters.channel);
  }
  if (filters.from) {
    where.push('o.created_at >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    where.push('o.created_at < ?');
    params.push(`${nextDay(filters.to)} 00:00:00`);
  }
  if (filters.cinemaId) {
    where.push(IN_CINEMA);
    params.push(filters.cinemaId);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const ROW_COLUMNS = `o.order_id, o.order_code, o.created_at, o.channel, o.total_amount, o.status,
  c.full_name AS customer_name, a.email AS customer_email,
  (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.order_id AND t.status <> -1) AS ticket_count,
  (SELECT p.payment_method FROM payments p
    WHERE p.order_id = o.order_id AND p.status = 1 ORDER BY p.payment_id DESC LIMIT 1) AS payment_method`;

async function listPage(filters) {
  const { clause, params } = buildWhere(filters);
  const counts = await query(`SELECT COUNT(*) AS total ${FROM} ${clause}`, params);
  const total = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const orders = await query(
    `SELECT ${ROW_COLUMNS} ${FROM} ${clause} ORDER BY o.created_at DESC, o.order_id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    orders,
    filters: { ...filters, page },
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages },
  };
}

// toàn bộ đơn khớp bộ lọc (tối đa EXPORT_LIMIT) để xuất CSV (mô phỏng)
async function listForExport(filters) {
  const { clause, params } = buildWhere(filters);
  return query(
    `SELECT ${ROW_COLUMNS} ${FROM} ${clause} ORDER BY o.created_at DESC, o.order_id DESC LIMIT ?`,
    [...params, EXPORT_LIMIT],
  );
}

const listCinemas = () => query('SELECT cinema_id, cinema_name FROM cinemas ORDER BY cinema_name');

async function findById(orderId) {
  const orders = await query(
    `SELECT o.order_id, o.order_code, o.channel, o.status, o.subtotal, o.discount_amount, o.total_amount,
            o.created_at, o.cancelled_at, o.cancel_reason, o.customer_id, pr.promo_code,
            c.full_name AS customer_name, a.email AS customer_email, a.phone AS customer_phone,
            sf.full_name AS staff_name, sa.email AS staff_email
       FROM orders o
       LEFT JOIN promotions pr ON pr.promotion_id = o.promotion_id
       LEFT JOIN accounts a ON a.account_id = o.customer_id
       LEFT JOIN customers c ON c.account_id = o.customer_id
       LEFT JOIN staff sf ON sf.account_id = o.staff_id
       LEFT JOIN accounts sa ON sa.account_id = o.staff_id
      WHERE o.order_id = ?`,
    [orderId],
  );
  if (!orders.length) return null;
  const [tickets, foods, payments] = await Promise.all([
    query(
      `SELECT t.ticket_id, t.ticket_price, t.status, t.checked_in_at,
              s.seat_row, s.seat_number, ty.seat_type_name,
              st.start_time, st.screen_format, st.language,
              m.title, r.room_name, ci.cinema_name
         FROM tickets t
         JOIN showtimes st ON st.showtime_id = t.showtime_id
         JOIN movies m ON m.movie_id = st.movie_id
         JOIN rooms r ON r.room_id = st.room_id
         JOIN cinemas ci ON ci.cinema_id = r.cinema_id
         JOIN seats s ON s.seat_id = t.seat_id
         JOIN seat_types ty ON ty.seat_type_id = s.seat_type_id
        WHERE t.order_id = ?
        ORDER BY st.start_time, s.seat_row, s.seat_number, t.ticket_id`,
      [orderId],
    ),
    query(
      `SELECT i.food_name, f.quantity, f.unit_price
         FROM order_food_items f JOIN food_items i ON i.food_id = f.food_id
        WHERE f.order_id = ? ORDER BY f.order_food_id`,
      [orderId],
    ),
    query(
      `SELECT payment_method, amount, transaction_ref, status, paid_at
         FROM payments WHERE order_id = ? ORDER BY payment_id`,
      [orderId],
    ),
  ]);
  return { order: orders[0], tickets, foods, payments };
}

// hủy đơn đang chờ thanh toán đổi trạng thái, hủy vé, nhả ghế đang giữ, trả lượt mã giảm giá
// khóa dòng đơn (FOR UPDATE) nên không thể đồng thời bị thanh toán hoặc hết hạn
async function cancelPending(orderId, reason) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT order_id, order_code, status, promotion_id FROM orders WHERE order_id = ? FOR UPDATE',
      [orderId],
    );
    if (!rows.length) throw new AppError('Không tìm thấy đơn hàng', 404);
    const order = rows[0];
    if (order.status !== 'PENDING') {
      throw new AppError('Chỉ hủy được đơn đang chờ thanh toán', 409);
    }
    await orderModel.setCancelled(conn, order.order_id, 'CANCELLED', reason);
    await orderModel.cancelTickets(conn, order.order_id);
    await bookingModel.releaseSeatsByOrder(conn, order.order_id);
    if (order.promotion_id) await promotionModel.releaseUse(conn, order.promotion_id);
    return { order_code: order.order_code };
  });
}

module.exports = {
  PAGE_SIZE, EXPORT_LIMIT, listPage, listForExport, listCinemas, findById, cancelPending,
};