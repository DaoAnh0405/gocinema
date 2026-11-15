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

module.exports = { listCinemas, listMoviesByCinema, listShowtimes, findForBooking };