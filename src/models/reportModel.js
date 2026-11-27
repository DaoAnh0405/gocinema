const { query } = require('../config/db');

// chỉ tính đơn đã thanh toán (PAID); khoảng ngày [from 00:00, toExclusive 00:00)
// lọc theo rạp đơn có ít nhất một vé thuộc phòng của rạp đó (orders.cinema_id chưa được ghi ở luồng đặt vé)
const ORDER_IN_CINEMA = `EXISTS (
  SELECT 1 FROM tickets tc
    JOIN showtimes sc ON sc.showtime_id = tc.showtime_id
    JOIN rooms rc ON rc.room_id = sc.room_id
   WHERE tc.order_id = o.order_id AND rc.cinema_id = ?)`;

// lọc theo phim đơn có ít nhất một vé của suất chiếu thuộc phim đó
const ORDER_HAS_MOVIE = `EXISTS (
  SELECT 1 FROM tickets tm
    JOIN showtimes sm ON sm.showtime_id = tm.showtime_id
   WHERE tm.order_id = o.order_id AND sm.movie_id = ?)`;

function orderScope(range, statuses = ['PAID']) {
  const sql = ['o.status IN (?)', 'o.created_at >= ?', 'o.created_at < ?'];
  const params = [statuses, `${range.from} 00:00:00`, `${range.toExclusive} 00:00:00`];
  if (range.cinemaId) {
    sql.push(ORDER_IN_CINEMA);
    params.push(range.cinemaId);
  }
  if (range.movieId) {
    sql.push(ORDER_HAS_MOVIE);
    params.push(range.movieId);
  }
  if (range.channel) {
    sql.push('o.channel = ?');
    params.push(range.channel);
  }
  return { where: sql.join(' AND '), params };
}

// vé còn hiệu lực hoặc đã dùng (không tính vé hủy) thuộc đơn PAID
const TICKET_FROM = `FROM tickets t
  JOIN orders o ON o.order_id = t.order_id
  JOIN showtimes s ON s.showtime_id = t.showtime_id
  JOIN rooms r ON r.room_id = s.room_id`;

function ticketScope(range) {
  const sql = ["o.status = 'PAID'", 't.status <> -1', 'o.created_at >= ?', 'o.created_at < ?'];
  const params = [`${range.from} 00:00:00`, `${range.toExclusive} 00:00:00`];
  if (range.cinemaId) {
    sql.push('r.cinema_id = ?');
    params.push(range.cinemaId);
  }
  if (range.movieId) {
    sql.push('s.movie_id = ?');
    params.push(range.movieId);
  }
  if (range.channel) {
    sql.push('o.channel = ?');
    params.push(range.channel);
  }
  return { where: sql.join(' AND '), params };
}

const FOOD_FROM = 'FROM order_food_items ofi JOIN orders o ON o.order_id = ofi.order_id';

async function summary(range) {
  const paid = orderScope(range);
  const failed = orderScope(range, ['CANCELLED', 'EXPIRED']);
  const tickets = ticketScope(range);
  const [orders, ticketRows, foodRows, failedRows] = await Promise.all([
    query(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue,
              COALESCE(SUM(o.discount_amount), 0) AS discount
         FROM orders o WHERE ${paid.where}`,
      paid.params,
    ),
    query(`SELECT COUNT(*) AS tickets ${TICKET_FROM} WHERE ${tickets.where}`, tickets.params),
    query(
      `SELECT COALESCE(SUM(ofi.quantity * ofi.unit_price), 0) AS revenue ${FOOD_FROM} WHERE ${paid.where}`,
      paid.params,
    ),
    query(`SELECT COUNT(*) AS total FROM orders o WHERE ${failed.where}`, failed.params),
  ]);
  return {
    orders: Number(orders[0].orders),
    revenue: Number(orders[0].revenue),
    discount: Number(orders[0].discount),
    tickets: Number(ticketRows[0].tickets),
    foodRevenue: Number(foodRows[0].revenue),
    failedOrders: Number(failedRows[0].total),
  };
}

async function dailyOrders(range) {
  const { where, params } = orderScope(range);
  return query(
    `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS report_day, COUNT(*) AS orders,
            COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM orders o WHERE ${where}
      GROUP BY report_day ORDER BY report_day`,
    params,
  );
}

async function dailyTickets(range) {
  const { where, params } = ticketScope(range);
  return query(
    `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS report_day, COUNT(*) AS tickets
       ${TICKET_FROM} WHERE ${where}
      GROUP BY report_day ORDER BY report_day`,
    params,
  );
}

async function byChannel(range) {
  const { where, params } = orderScope(range);
  return query(
    `SELECT o.channel AS channel, COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM orders o WHERE ${where} GROUP BY o.channel ORDER BY revenue DESC`,
    params,
  );
}

async function byPayment(range) {
  const { where, params } = orderScope(range);
  return query(
    `SELECT p.payment_method AS method, COUNT(*) AS payments, COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p JOIN orders o ON o.order_id = p.order_id
      WHERE p.status = 1 AND ${where}
      GROUP BY p.payment_method ORDER BY amount DESC`,
    params,
  );
}

async function topMovies(range, limit = 5) {
  const { where, params } = ticketScope(range);
  return query(
    `SELECT m.movie_id, m.title, COUNT(*) AS tickets, COALESCE(SUM(t.ticket_price), 0) AS revenue
       ${TICKET_FROM} JOIN movies m ON m.movie_id = s.movie_id
      WHERE ${where}
      GROUP BY m.movie_id, m.title ORDER BY revenue DESC, tickets DESC, m.movie_id LIMIT ?`,
    [...params, limit],
  );
}

async function byCinema(range) {
  const { where, params } = ticketScope(range);
  return query(
    `SELECT c.cinema_id, c.cinema_name, COUNT(*) AS tickets, COALESCE(SUM(t.ticket_price), 0) AS revenue
       ${TICKET_FROM} JOIN cinemas c ON c.cinema_id = r.cinema_id
      WHERE ${where}
      GROUP BY c.cinema_id, c.cinema_name ORDER BY revenue DESC, c.cinema_id`,
    params,
  );
}

async function topFoods(range, limit = 5) {
  const { where, params } = orderScope(range);
  return query(
    `SELECT f.food_id, f.food_name, SUM(ofi.quantity) AS quantity,
            SUM(ofi.quantity * ofi.unit_price) AS revenue
       ${FOOD_FROM} JOIN food_items f ON f.food_id = ofi.food_id
      WHERE ${where}
      GROUP BY f.food_id, f.food_name ORDER BY revenue DESC, f.food_id LIMIT ?`,
    [...params, limit],
  );
}

const listCinemas = () => query('SELECT cinema_id, cinema_name FROM cinemas ORDER BY cinema_name');

const listMovies = () => query('SELECT movie_id, title FROM movies ORDER BY title');

module.exports = {
  summary, dailyOrders, dailyTickets, byChannel, byPayment, topMovies, byCinema, topFoods, listCinemas, listMovies,
};