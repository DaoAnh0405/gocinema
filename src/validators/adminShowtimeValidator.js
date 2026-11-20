const { SHOWTIME_STATUS } = require('../constants');
const { parseId, isRealDate } = require('./adminCatalogValidator');

const SCREEN_FORMATS = Object.freeze(['2D', '3D', 'IMAX']);
const LANGUAGES = Object.freeze(['Tiếng Việt', 'Phụ đề', 'Lồng tiếng']);
const STATUSES = Object.freeze(Object.values(SHOWTIME_STATUS).map(String));
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const text = (value) => typeof value === 'string' ? value.trim() : '';
const isClock = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

// SQL DATETIME values represent Vietnam wall time, never the host's local timezone.
function vietnamTimestamp(date, clock) {
  if (!isRealDate(date) || !isClock(clock)) return NaN;
  return Date.parse(`${date}T${clock}:00+07:00`);
}

function vietnamDate(now = Date.now()) {
  return new Date(Number(now) + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function vietnamDateTime(timestamp) {
  return new Date(timestamp + VN_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

function validateShowtime(input = {}) {
  input = input || {};
  const values = {};
  const fieldErrors = {};
  for (const [field, label] of [['movie_id', 'phim'], ['cinema_id', 'rạp'], ['room_id', 'phòng chiếu']]) {
    const raw = input[field];
    values[field] = typeof raw === 'number' ? String(raw) : text(raw);
    if (!parseId(values[field])) fieldErrors[field] = `Vui lòng chọn ${label} hợp lệ`;
  }
  values.date = text(input.date);
  values.start_time = text(input.start_time);
  values.screen_format = input.screen_format == null ? '2D' : text(input.screen_format);
  values.language = input.language == null ? 'Phụ đề' : text(input.language);
  if (!isRealDate(values.date)) fieldErrors.date = 'Ngày chiếu phải hợp lệ, định dạng YYYY-MM-DD';
  if (!isClock(values.start_time)) fieldErrors.start_time = 'Giờ chiếu phải hợp lệ, định dạng HH:mm';
  if (!SCREEN_FORMATS.includes(values.screen_format)) fieldErrors.screen_format = 'Định dạng chiếu không hợp lệ';
  if (!LANGUAGES.includes(values.language)) fieldErrors.language = 'Ngôn ngữ không hợp lệ';
  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

function normalizeFilters(input = {}) {
  input = input || {};
  return {
    date: isRealDate(input.date) ? input.date : '',
    cinema: parseId(input.cinema) || '',
    movie: parseId(input.movie) || '',
    status: typeof input.status === 'string' && STATUSES.includes(input.status) ? input.status : '',
    page: parseId(input.page) || 1,
  };
}

function validateStatus(input = {}) {
  const status = input && input.status;
  const values = { status: typeof status === 'string' ? status : '' };
  const fieldErrors = {};
  if (!STATUSES.includes(values.status)) fieldErrors.status = 'Trạng thái suất chiếu không hợp lệ';
  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

module.exports = {
  validateShowtime, normalizeFilters, validateStatus,
  SCREEN_FORMATS, LANGUAGES, STATUSES, parseId, isRealDate, isClock,
  vietnamTimestamp, vietnamDate, vietnamDateTime,
};
