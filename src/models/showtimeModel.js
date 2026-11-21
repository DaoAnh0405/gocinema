const { query } = require('../config/db');

// suất còn mở bán đang mở, chưa chiếu, phòng và rạp đang hoạt động (cần alias s, r, c)
const OPEN = `s.status = 1 AND s.start_time > NOW() AND r.status = 1 AND c.status = 1`;

async function listCinemas() {
  return query(
    `SELECT c.cinema_id, c.cinema_name, c.address, c.city
       FROM cinemas c
      WHERE c.status = 1
        AND EXISTS (SELECT 1 FROM showtimes s
                      JOIN rooms r  ON r.room_id = s.room_id
                      JOIN movies m ON m.movie_id = s.movie_id
                     WHERE r.cinema_id = c.cinema_id AND r.status = 1
                       AND s.status = 1 AND s.start_time > NOW() AND m.status = 'NOW_SHOWING')
      ORDER BY c.city, c.cinema_name`,
  );
}

async function listMoviesByCinema(cinemaId) {
  return query(
    `SELECT DISTINCT m.movie_id, m.title, m.poster_url, m.age_rating, m.duration
       FROM showtimes s
       JOIN rooms r   ON r.room_id = s.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
       JOIN movies m  ON m.movie_id = s.movie_id
      WHERE c.cinema_id = ? AND m.status = 'NOW_SHOWING' AND ${OPEN}
      ORDER BY m.title`,
    [cinemaId],
  );
}

async function listShowtimes(cinemaId, movieId) {
  return query(
    `SELECT s.showtime_id, s.start_time, s.screen_format, s.language, r.room_name,
            DATE_FORMAT(s.start_time, '%Y-%m-%d') AS show_date,
            (SELECT COUNT(*) FROM showtime_seats ss
              WHERE ss.showtime_id = s.showtime_id
                AND (ss.status = 1 OR (ss.status = 0 AND ss.held_until < NOW()))) AS available_seats
       FROM showtimes s
       JOIN rooms r   ON r.room_id = s.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
      WHERE c.cinema_id = ? AND s.movie_id = ? AND ${OPEN}
      ORDER BY s.start_time`,
    [cinemaId, movieId],
  );
}

async function findForBooking(showtimeId) {
  const rows = await query(
    `SELECT s.showtime_id, s.start_time, s.end_time, s.screen_format, s.language,
            m.movie_id, m.title, m.poster_url, m.age_rating, m.duration,
            r.room_id, r.room_name, c.cinema_id, c.cinema_name, c.address,
            (s.status = 1 AND s.start_time > NOW() AND r.status = 1 AND c.status = 1) AS bookable
       FROM showtimes s
       JOIN movies m  ON m.movie_id = s.movie_id
       JOIN rooms r   ON r.room_id = s.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
      WHERE s.showtime_id = ?`,
    [showtimeId],
  );
  return rows[0] || null;
}

// các rạp (và khu vực) đang có suất chiếu còn mở bán của một phim đang chiếu
async function listCinemaIdsByMovie(movieId) {
  return query(
    `SELECT DISTINCT c.cinema_id, c.city
       FROM showtimes s
       JOIN rooms r   ON r.room_id = s.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
       JOIN movies m  ON m.movie_id = s.movie_id
      WHERE s.movie_id = ? AND m.status = 'NOW_SHOWING' AND ${OPEN}
      ORDER BY c.city, c.cinema_id`,
    [movieId],
  );
}

// rạp đang hoạt động theo khu vực; ticketing = đang có suất chiếu chưa chiếu (nhãn "Bán vé")
async function listActiveCinemas() {
  return query(
    `SELECT c.cinema_id, c.cinema_name, c.address, c.city,
            EXISTS (SELECT 1 FROM showtimes s
                      JOIN rooms r  ON r.room_id = s.room_id
                      JOIN movies m ON m.movie_id = s.movie_id
                     WHERE r.cinema_id = c.cinema_id AND r.status = 1
                       AND s.status = 1 AND s.start_time > NOW()
                       AND m.status = 'NOW_SHOWING') AS ticketing
       FROM cinemas c
      WHERE c.status = 1
      ORDER BY c.city, c.cinema_name`,
  );
}

async function findActiveCinema(cinemaId) {
  const rows = await query(
    `SELECT cinema_id, cinema_name, address, city, phone_number
       FROM cinemas WHERE cinema_id = ? AND status = 1`,
    [cinemaId],
  );
  return rows[0] || null;
}

// các rạp khác cùng khu vực
async function listOtherCinemas(city, excludeId, limit = 5) {
  const n = Math.max(1, parseInt(limit, 10) || 5);
  return query(
    `SELECT cinema_id, cinema_name, address
       FROM cinemas
      WHERE status = 1 AND city <=> ? AND cinema_id <> ?
      ORDER BY cinema_name
      LIMIT ${n}`,
    [city, excludeId],
  );
}

// suất chiếu của một rạp trong một ngày (gồm cả suất đã qua giờ, is_past = 1)
async function listShowtimesByCinemaDay(cinemaId, ymd) {
  return query(
    `SELECT s.showtime_id, s.start_time, s.screen_format, s.language,
            (s.start_time <= NOW()) AS is_past,
            m.movie_id, m.title, m.poster_url, m.age_rating, m.duration,
            (SELECT GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ')
               FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
              WHERE mg.movie_id = m.movie_id) AS genres
       FROM showtimes s
       JOIN rooms r   ON r.room_id = s.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
       JOIN movies m  ON m.movie_id = s.movie_id
      WHERE c.cinema_id = ? AND c.status = 1 AND r.status = 1
        AND s.status = 1 AND m.status = 'NOW_SHOWING'
        AND s.start_time >= ? AND s.start_time < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY m.title, s.screen_format, s.language, s.start_time`,
    [cinemaId, ymd, ymd],
  );
}

module.exports = {
  listCinemas, listMoviesByCinema, listShowtimes, findForBooking, listCinemaIdsByMovie,
  listActiveCinemas, findActiveCinema, listOtherCinemas, listShowtimesByCinemaDay,
};