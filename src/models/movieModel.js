const { query } = require('../config/db');
const { MOVIE_STATUS } = require('../constants');

const GENRES_SUBQUERY = `
  (SELECT GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ')
     FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
    WHERE mg.movie_id = m.movie_id)`;

const toLimit = (value, fallback) => Math.max(1, parseInt(value, 10) || fallback);

// phim theo trạng thái (limit = null: lấy tất cả)
async function listByStatus(status, limit = 8) {
  const limitSql = limit === null ? '' : `LIMIT ${toLimit(limit, 8)}`;
  return query(
    `SELECT m.movie_id, m.title, m.duration, m.release_date, m.poster_url,
            m.age_rating, m.status, ${GENRES_SUBQUERY} AS genres
       FROM movies m
      WHERE m.status = ?
      ORDER BY m.release_date DESC, m.movie_id DESC
      ${limitSql}`,
    [status],
  );
}

const listAllByStatus = (status) => listByStatus(status, null);

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

async function searchByTitle(keyword, limit = 100) {
  const n = toLimit(limit, 100);
  const where = ['m.status IN (?, ?)'];
  const params = [MOVIE_STATUS.NOW_SHOWING, MOVIE_STATUS.COMING_SOON];
  if (keyword) {
    where.push('LOCATE(LOWER(?), LOWER(m.title)) > 0');
    params.push(keyword);
  }
  return query(
    `SELECT m.movie_id, m.title, m.duration, m.release_date, m.poster_url,
            m.age_rating, m.status, ${GENRES_SUBQUERY} AS genres
       FROM movies m
      WHERE ${where.join(' AND ')}
      ORDER BY FIELD(m.status, 'NOW_SHOWING', 'COMING_SOON'), m.release_date DESC, m.movie_id DESC
      LIMIT ${n}`,
    params,
  );
}

async function findById(movieId) {
  const rows = await query(
    `SELECT m.*, ${GENRES_SUBQUERY} AS genres FROM movies m WHERE m.movie_id = ?`,
    [movieId],
  );
  return rows[0] || null;
}

module.exports = { listByStatus, listAllByStatus, listHot, searchByTitle, findById };