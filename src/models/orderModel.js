const crypto = require('crypto');
const { query } = require('../config/db');
const { partsOf } = require('../utils/vnTime');

// trong transaction

// tạo đơn pending cùng vé và đồ ăn, mã đơn = GC + 2 số năm + order_id 4 chữ số
async function createPending(conn, { customerId, quote }) {
  const tempCode = `T${crypto.randomBytes(8).toString('hex')}`;
  const [res] = await conn.query(
    `INSERT INTO orders (order_code, cinema_id, customer_id, channel, promotion_id,
                         subtotal, discount_amount, total_amount, status)
     VALUES (?, ?, ?, 'ONLINE', ?, ?, ?, ?, 'PENDING')`,
    [tempCode, quote.showtime.cinema_id, customerId, quote.promo ? quote.promo.promotionId : null,
      quote.subtotal, quote.discount, quote.total],
  );
  const orderId = res.insertId;
  const orderCode = `GC${partsOf().ymd.slice(2, 4)}${String(orderId).padStart(4, '0')}`;
  await conn.query('UPDATE orders SET order_code = ? WHERE order_id = ?', [orderCode, orderId]);

  const rand = () => crypto.randomBytes(6).toString('hex').toUpperCase();
  const tickets = quote.seats.map((s) => [
    orderId, quote.showtime.showtime_id, s.id, s.price, `QR-${orderCode}-${s.label}-${rand()}`, 1,
  ]);
  await conn.query(
    'INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code, status) VALUES ?',
    [tickets],
  );
  if (quote.foods.length) {
    const foods = quote.foods.map((f) => [orderId, f.id, f.quantity, f.unitPrice]);
    await conn.query(
      'INSERT INTO order_food_items (order_id, food_id, quantity, unit_price) VALUES ?',
      [foods],
    );
  }
  return { orderId, orderCode };
}

async function lockPendingForCustomer(conn, orderId, customerId) {
  const [rows] = await conn.query(
    `SELECT order_id, total_amount, promotion_id FROM orders
      WHERE order_id = ? AND customer_id = ? AND status = 'PENDING' FOR UPDATE`,
    [orderId, customerId],
  );
  return rows[0] || null;
}

async function lockExpiredPending(conn, holdMinutes) {
  const [rows] = await conn.query(
    `SELECT order_id, promotion_id FROM orders
      WHERE status = 'PENDING' AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ORDER BY order_id FOR UPDATE`,
    [holdMinutes],
  );
  return rows;
}

async function insertPayment(conn, { orderId, method, amount, transactionRef }) {
  await conn.query(
    `INSERT INTO payments (order_id, payment_method, amount, transaction_ref, status)
     VALUES (?, ?, ?, ?, 1)`,
    [orderId, method, amount, transactionRef || null],
  );
}

const setPaid = (conn, orderId) =>
  conn.query(`UPDATE orders SET status = 'PAID' WHERE order_id = ?`, [orderId]);

const setCancelled = (conn, orderId, status, reason) =>
  conn.query(
    `UPDATE orders SET status = ?, cancel_reason = ?, cancelled_at = NOW() WHERE order_id = ?`,
    [status, reason, orderId],
  );

const cancelTickets = (conn, orderId) =>
  conn.query(`UPDATE tickets SET status = -1 WHERE order_id = ?`, [orderId]);

async function findByCode(orderCode, customerId) {
  const rows = await query(
    `SELECT o.order_id, o.order_code, o.status, o.subtotal, o.discount_amount, o.total_amount,
            o.created_at, o.cancel_reason, p.promo_code
       FROM orders o LEFT JOIN promotions p ON p.promotion_id = o.promotion_id
      WHERE o.order_code = ? AND o.customer_id = ?`,
    [orderCode, customerId],
  );
  return rows[0] || null;
}

async function listTickets(orderId) {
  return query(
    `SELECT t.ticket_id, t.qr_code, t.ticket_price, t.status,
            se.seat_row, se.seat_number, st.seat_type_name,
            s.start_time, s.screen_format, s.language,
            m.title, m.age_rating, r.room_name, c.cinema_name, c.address
       FROM tickets t
       JOIN seats se      ON se.seat_id = t.seat_id
       JOIN seat_types st ON st.seat_type_id = se.seat_type_id
       JOIN showtimes s   ON s.showtime_id = t.showtime_id
       JOIN movies m      ON m.movie_id = s.movie_id
       JOIN rooms r       ON r.room_id = s.room_id
       JOIN cinemas c     ON c.cinema_id = r.cinema_id
      WHERE t.order_id = ?
      ORDER BY se.seat_row, se.seat_number`,
    [orderId],
  );
}

async function listFoods(orderId) {
  return query(
    `SELECT f.food_name, ofi.quantity, ofi.unit_price
       FROM order_food_items ofi JOIN food_items f ON f.food_id = ofi.food_id
      WHERE ofi.order_id = ?`,
    [orderId],
  );
}

async function findPayment(orderId) {
  const rows = await query(
    `SELECT payment_method, amount, transaction_ref, paid_at
       FROM payments WHERE order_id = ? AND status = 1 ORDER BY payment_id DESC LIMIT 1`,
    [orderId],
  );
  return rows[0] || null;
}

// tìm đơn theo mã, không ràng buộc chủ đơn (dùng cho kết quả trả về từ cổng thanh toán)
async function findByCodeAny(orderCode) {
  const rows = await query(
    `SELECT order_id, order_code, customer_id, status, total_amount FROM orders WHERE order_code = ?`,
    [orderCode],
  );
  return rows[0] || null;
}

module.exports = {
  createPending, lockPendingForCustomer, lockExpiredPending, insertPayment,
  setPaid, setCancelled, cancelTickets,
  findByCode, listTickets, listFoods, findPayment, findByCodeAny,
};