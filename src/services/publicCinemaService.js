const AppError = require('../utils/AppError');
const showtimeModel = require('../models/showtimeModel');
const { partsOf, todayYmd, weekdayLabel } = require('../utils/vnTime');

const DAYS = 6; // hôm nay và 5 ngày kế tiếp
const DAY_MS = 24 * 60 * 60 * 1000;
const OTHER_CINEMAS = 5;

const addDays = (ymd, n) => partsOf(new Date(Date.parse(`${ymd}T12:00:00+07:00`) + n * DAY_MS)).ymd;

// danh sách rạp đang hoạt động, nhóm theo khu vực (cho modal "Rạp chiếu")
async function listCinemaGroups() {
  const byCity = new Map();
  for (const c of await showtimeModel.listActiveCinemas()) {
    const city = c.city || 'Khác';
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push({
      id: c.cinema_id, name: c.cinema_name, address: c.address, ticketing: Boolean(c.ticketing),
    });
  }
  return [...byCity].map(([city, cinemas]) => ({ city, cinemas }));
}

// trang một rạp: thông tin rạp, lịch chiếu của ngày được chọn (có thể lọc theo định dạng)
async function getDetail(rawId, { date, format } = {}) {
  const id = Number.parseInt(rawId, 10);
  const cinema = Number.isInteger(id) && id > 0 ? await showtimeModel.findActiveCinema(id) : null;
  if (!cinema) throw new AppError('Không tìm thấy rạp.', 404);

  const today = todayYmd();
  const days = Array.from({ length: DAYS }, (_, i) => {
    const ymd = addDays(today, i);
    const [, mm, dd] = ymd.split('-');
    return { ymd, weekday: weekdayLabel(ymd), dm: `${dd}/${mm}` };
  });
  const selectedDate = days.some((d) => d.ymd === date) ? date : today;

  const rows = await showtimeModel.listShowtimesByCinemaDay(id, selectedDate);
  const formats = [...new Set(rows.map((r) => r.screen_format))].sort();
  const selectedFormat = formats.includes(format) ? format : '';

  const byMovie = new Map();
  for (const r of rows) {
    if (selectedFormat && r.screen_format !== selectedFormat) continue;
    if (!byMovie.has(r.movie_id)) {
      byMovie.set(r.movie_id, {
        id: r.movie_id,
        title: r.title,
        posterUrl: r.poster_url,
        ageRating: r.age_rating,
        duration: r.duration,
        genres: r.genres,
        groups: new Map(),
      });
    }
    const movie = byMovie.get(r.movie_id);
    const key = `${r.screen_format}|${r.language}`;
    if (!movie.groups.has(key)) movie.groups.set(key, { label: `${r.screen_format} ${r.language}`, times: [] });
    movie.groups.get(key).times.push({
      id: r.showtime_id,
      time: partsOf(new Date(r.start_time)).time.slice(0, 5),
      past: Boolean(r.is_past),
    });
  }
  const movies = [...byMovie.values()].map((m) => ({ ...m, groups: [...m.groups.values()] }));

  // const query = [cinema.cinema_name, cinema.address, cinema.city].filter(Boolean).join(', ');
  return {
    cinema,
    days,
    selectedDate,
    formats,
    selectedFormat,
    movies,
    others: await showtimeModel.listOtherCinemas(cinema.city, id, OTHER_CINEMAS),
    // mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, //chưa làm:v
  };
}

module.exports = { listCinemaGroups, getDetail };