const { query } = require('../config/db');

async function getSummary(customerId) {
  const rows = await query(
    `SELECT COUNT(*) AS orderCount,
            COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN
              (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.order_id AND t.status IN (0, 1))
            ELSE 0 END), 0) AS ticketCount
     FROM orders o WHERE o.customer_id = ?`,
    [customerId],
  );
  return rows[0];
}

async function listRecent(customerId, status) {
  const params = [customerId];
  const statusClause = status ? ' AND o.status = ?' : '';
  if (status) params.push(status);
  const orders = await query(
    `SELECT o.order_id, o.order_code, o.created_at, o.total_amount, o.status
     FROM orders o WHERE o.customer_id = ?${statusClause}
     ORDER BY o.created_at DESC, o.order_id DESC LIMIT 10`,
    params,
  );
  if (!orders.length) return orders;

  const orderIds = orders.map((order) => order.order_id);
  const [tickets, foods] = await Promise.all([
    query(
      `SELECT t.order_id, t.ticket_id, st.showtime_id, st.start_time,
              st.screen_format, st.language, m.title, m.poster_url,
              DATE_ADD(st.start_time, INTERVAL m.duration MINUTE) AS movie_end_time,
              c.cinema_name, r.room_name, s.seat_row, s.seat_number, ty.seat_type_name
       FROM tickets t
       JOIN orders o ON o.order_id = t.order_id
       JOIN showtimes st ON st.showtime_id = t.showtime_id
       JOIN movies m ON m.movie_id = st.movie_id
       JOIN rooms r ON r.room_id = st.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
       JOIN seats s ON s.seat_id = t.seat_id
       JOIN seat_types ty ON ty.seat_type_id = s.seat_type_id
       WHERE o.customer_id = ? AND t.order_id IN (?)
       ORDER BY st.start_time, st.showtime_id, s.seat_row, s.seat_number, t.ticket_id`,
      [customerId, orderIds],
    ),
    query(
      `SELECT f.order_id, f.quantity, i.food_name
       FROM order_food_items f
       JOIN orders o ON o.order_id = f.order_id
       JOIN food_items i ON i.food_id = f.food_id
       WHERE o.customer_id = ? AND f.order_id IN (?) ORDER BY f.order_food_id`,
      [customerId, orderIds],
    ),
  ]);

  return orders.map((order) => {
    const screenings = new Map();
    for (const ticket of tickets.filter((ticket) => ticket.order_id === order.order_id)) {
      if (!screenings.has(ticket.showtime_id)) {
        screenings.set(ticket.showtime_id, { ...ticket, seats: [] });
      }
      screenings.get(ticket.showtime_id).seats.push(
        `${ticket.seat_row}${String(ticket.seat_number).padStart(2, '0')} (${ticket.seat_type_name})`,
      );
    }
    return {
      ...order,
      screenings: [...screenings.values()],
      foods: foods.filter((food) => food.order_id === order.order_id),
    };
  });
}

module.exports = { getSummary, listRecent };
