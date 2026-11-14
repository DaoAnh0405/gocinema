const { query } = require('../config/db');

const GENRES_SUBQUERY = `
  (SELECT GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ')
     FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
    WHERE mg.movie_id = m.movie_id)`;

const toLimit = (value, fallback) => Math.max(1, parseInt(value, 10) || fallback);

// phim theo trạng thái (trang chủ, và là điểm bắt đầu cho trang danh sách phim)
async function listByStatus(status, limit = 8) {
  const n = toLimit(limit, 8);
  return query(
    `SELECT m.movie_id, m.title, m.duration, m.release_date, m.poster_url,
            m.age_rating, m.status, ${GENRES_SUBQUERY} AS genres
       FROM movies m
      WHERE m.status = ?
      ORDER BY m.release_date DESC, m.movie_id DESC
      LIMIT ${n}`,
    [status],
  );
}

// phim "hot": đang chiếu, nhiều vé đã thanh toán nhất (= thì phim mới hơn xếp trước)
async function listHot(limit = 5) {
  const n = toLimit(limit, 5);
  return query(
    `SELECT m.movie_id, m.title, m.description, m.duration, m.release_date,
            m.poster_url, m.age_rating, ${GENRES_SUBQUERY} AS genres,
            COUNT(o.order_id) AS sold
       FROM movies m
       LEFT JOIN showtimes s ON s.movie_id = m.movie_id
       LEFT JOIN tickets   t ON t.showtime_id = s.showtime_id AND t.status IN (0, 1)
       LEFT JOIN orders    o ON o.order_id = t.order_id AND o.status = 'PAID'
      WHERE m.status = 'NOW_SHOWING'
      GROUP BY m.movie_id
      ORDER BY sold DESC, m.release_date DESC
      LIMIT ${n}`,
  );
}

module.exports = { listByStatus, listHot };