const AppError = require('../utils/AppError');
const showtimeModel = require('../models/showtimeModel');
const { partsOf, dayLabel } = require('../utils/vnTime');

const toId = (raw, name) => {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) throw new AppError(`${name} không hợp lệ.`, 400);
  return n;
};

// danh sách rạp nhóm theo khu vực
async function getCinemas() {
  const byCity = new Map();
  for (const c of await showtimeModel.listCinemas()) {
    const city = c.city || 'Khác';
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push({ id: c.cinema_id, name: c.cinema_name, address: c.address });
  }
  return [...byCity].map(([city, cinemas]) => ({ city, cinemas }));
}

async function getMovies(rawCinemaId) {
  const rows = await showtimeModel.listMoviesByCinema(toId(rawCinemaId, 'Rạp'));
  return rows.map((m) => ({
    id: m.movie_id, title: m.title, posterUrl: m.poster_url, ageRating: m.age_rating, duration: m.duration,
  }));
}

// suất chiếu của một phim tại một rạp, nhóm theo ngày
async function getShowtimes(rawCinemaId, rawMovieId) {
  const rows = await showtimeModel.listShowtimes(toId(rawCinemaId, 'Rạp'), toId(rawMovieId, 'Phim'));
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.show_date)) byDate.set(r.show_date, { date: r.show_date, label: dayLabel(r.show_date), showtimes: [] });
    byDate.get(r.show_date).showtimes.push({
      id: r.showtime_id,
      time: partsOf(new Date(r.start_time)).time.slice(0, 5),
      format: r.screen_format,
      language: r.language,
      room: r.room_name,
      available: r.available_seats,
    });
  }
  return [...byDate.values()];
}

module.exports = { getCinemas, getMovies, getShowtimes };