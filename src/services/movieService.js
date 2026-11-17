const AppError = require('../utils/AppError');
const { MOVIE_STATUS } = require('../constants');
const movieModel = require('../models/movieModel');
const showtimeModel = require('../models/showtimeModel');

const YT_ID = /^[\w-]{11}$/;

function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = /^\/(?:embed|shorts|live)\/([\w-]{11})/.exec(u.pathname);
      return m ? m[1] : null;
    }
  } catch (_) { /* không phải url hợp lệ */ }
  return null;
}

// chỉ nhận ytb hoặc file video trực tiếp, link lạ bị bỏ để không nhúng trang tùy ý
function trailerOf(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  const id = youtubeId(url);
  if (id && YT_ID.test(id)) {
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
  }
  if (/^(\/uploads\/|https?:\/\/)\S+\.(mp4|webm|ogg)(\?\S*)?$/i.test(url)) return { kind: 'video', src: url };
  return null;
}

async function getDetail(rawId) {
  const id = Number.parseInt(rawId, 10);
  const movie = Number.isInteger(id) && id > 0 ? await movieModel.findById(id) : null;
  if (!movie) throw new AppError('Không tìm thấy phim.', 404);

  let cities = [];
  if (movie.status === MOVIE_STATUS.NOW_SHOWING) {
    const rows = await showtimeModel.listCinemaIdsByMovie(id);
    cities = [...new Set(rows.map((r) => r.city || 'Khác'))];
  }
  return {
    movie,
    trailer: trailerOf(movie.trailer_url),
    cities,
    bookable: cities.length > 0,
    paragraphs: String(movie.description || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean),
  };
}

module.exports = { getDetail };