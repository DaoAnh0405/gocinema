const { MOVIE_STATUS } = require('../constants');

const STATUSES = Object.freeze(Object.values(MOVIE_STATUS));
const AGE_RATINGS = Object.freeze(['P', 'T13', 'T16', 'T18']);
const SQL_INT_MAX = 2147483647;
const MAX_GENRES = 50;

function parseId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= SQL_INT_MAX ? id : null;
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function isSafePosterUrl(value) {
  return typeof value === 'string' && value.length <= 255 &&
    /^\/images\/posters\/(?:uploads\/)?[a-zA-Z0-9_-]+\.jpe?g$/i.test(value);
}

function validateMovie(input = {}) {
  input = input || {};
  const values = {};
  const fieldErrors = {};
  const add = (field, message) => { if (!fieldErrors[field]) fieldErrors[field] = message; };
  const text = (field, max, required = false) => {
    const raw = input[field];
    values[field] = typeof raw === 'string' ? raw.trim() : '';
    if (raw != null && typeof raw !== 'string') add(field, 'Giá trị phải là văn bản');
    if (required && !values[field]) add(field, 'Vui lòng nhập tên phim');
    if ([...values[field]].length > max) add(field, `Tối đa ${max} ký tự`);
  };

  text('title', 200, true);
  text('description', 65535);
  if (Buffer.byteLength(values.description, 'utf8') > 65535) {
    add('description', 'Mô tả vượt quá giới hạn 65535 byte');
  }
  text('director', 100);
  text('actors', 500);
  text('trailer_url', 255);
  if (values.trailer_url) {
    try {
      const url = new URL(values.trailer_url);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname ||
          /[\s\\]/.test(values.trailer_url)) throw new Error('Invalid URL');
    } catch {
      add('trailer_url', 'Trailer phải là URL http hoặc https hợp lệ');
    }
  }

  values.duration = typeof input.duration === 'string' ? input.duration.trim() : input.duration;
  if (!parseId(values.duration)) add('duration', `Thời lượng phải là số nguyên từ 1 đến ${SQL_INT_MAX}`);
  if (typeof values.duration !== 'string' && typeof values.duration !== 'number') values.duration = '';

  for (const field of ['release_date', 'end_date']) {
    text(field, 10);
    if (values[field] && !isRealDate(values[field])) add(field, 'Ngày phải hợp lệ, định dạng YYYY-MM-DD');
  }
  if (isRealDate(values.release_date) && isRealDate(values.end_date) && values.end_date < values.release_date) {
    add('end_date', 'Ngày kết thúc không được trước ngày khởi chiếu');
  }

  text('age_rating', 10);
  text('status', 20);
  if (!AGE_RATINGS.includes(values.age_rating)) add('age_rating', 'Phân loại độ tuổi không hợp lệ');
  if (!STATUSES.includes(values.status)) add('status', 'Trạng thái phim không hợp lệ');

  const rawGenres = input.genre_ids == null ? input.genres : input.genre_ids;
  const genres = rawGenres == null || rawGenres === '' ? [] : Array.isArray(rawGenres) ? rawGenres : [rawGenres];
  values.genre_ids = [];
  if (genres.length > MAX_GENRES) add('genre_ids', `Chỉ được chọn tối đa ${MAX_GENRES} thể loại`);
  const seen = new Set();
  for (const raw of genres.slice(0, MAX_GENRES)) {
    const id = parseId(raw);
    if (!id) {
      add('genre_ids', 'Thể loại phải là mã số nguyên dương');
    } else if (seen.has(id)) {
      add('genre_ids', 'Không được chọn thể loại trùng lặp');
    } else {
      seen.add(id);
      values.genre_ids.push(id);
    }
  }

  // Poster paths are server-owned; never use a submitted path to replace a poster.
  if (input.poster_url != null && input.poster_url !== '' && !isSafePosterUrl(input.poster_url)) {
    add('poster', 'Đường dẫn poster không hợp lệ');
  }

  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

function validateGenre(input = {}) {
  const raw = input && input.genre_name;
  const values = { genre_name: typeof raw === 'string' ? raw.trim() : '' };
  const fieldErrors = {};
  if (!values.genre_name) fieldErrors.genre_name = 'Vui lòng nhập tên thể loại';
  else if ([...values.genre_name].length > 50) fieldErrors.genre_name = 'Tên thể loại tối đa 50 ký tự';
  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

function normalizeMovieFilters(input = {}) {
  const q = typeof input.q === 'string' ? [...input.q.trim()].slice(0, 200).join('') : '';
  return {
    q,
    status: STATUSES.includes(input.status) ? input.status : '',
    genre: parseId(input.genre) || '',
    page: parseId(input.page) || 1,
  };
}

module.exports = {
  STATUSES, AGE_RATINGS, SQL_INT_MAX, MAX_GENRES,
  parseId, isRealDate, isSafePosterUrl, validateMovie, validateGenre, normalizeMovieFilters,
};
