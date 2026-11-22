const { isRealDate, parseId } = require('./adminCatalogValidator');

const FORMATS = Object.freeze(['2D', '3D', 'IMAX']);
const LANGUAGES = Object.freeze(['Tiếng Việt', 'Phụ đề', 'Lồng tiếng']);
const STATUSES = Object.freeze({ '-1': 'Đã hủy', '0': 'Đóng', '1': 'Hoạt động' });

function normalizeFilters(input = {}) {
  const statusValue = String(input.status);
  const status = Object.prototype.hasOwnProperty.call(STATUSES, statusValue) ? statusValue : '';
  return {
    date: isRealDate(input.date) ? input.date : '',
    cinema: parseId(input.cinema) || '',
    movie: parseId(input.movie) || '',
    status,
    page: parseId(input.page) || 1,
  };
}

function validateShowtime(input = {}) {
  const values = {
    movie_id: typeof input.movie_id === 'string' ? input.movie_id.trim() : '',
    cinema_id: typeof input.cinema_id === 'string' ? input.cinema_id.trim() : '',
    room_id: typeof input.room_id === 'string' ? input.room_id.trim() : '',
    show_date: typeof input.show_date === 'string' ? input.show_date.trim() : '',
    start_time: typeof input.start_time === 'string' ? input.start_time.trim() : '',
    screen_format: typeof input.screen_format === 'string' ? input.screen_format.trim() : '',
    language: typeof input.language === 'string' ? input.language.trim() : '',
  };
  const fieldErrors = {};
  const add = (field, message) => { if (!fieldErrors[field]) fieldErrors[field] = message; };

  for (const field of ['movie_id', 'cinema_id', 'room_id']) {
    if (!parseId(values[field])) add(field, 'Vui lòng chọn mục hợp lệ.');
  }
  if (!isRealDate(values.show_date)) add('show_date', 'Ngày chiếu không hợp lệ.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.start_time)) add('start_time', 'Giờ bắt đầu phải theo định dạng HH:MM.');
  if (!FORMATS.includes(values.screen_format)) add('screen_format', 'Định dạng chiếu không hợp lệ.');
  if (!LANGUAGES.includes(values.language)) add('language', 'Vui lòng chọn ngôn ngữ/phụ đề.');

  return { values, fieldErrors, errors: Object.values(fieldErrors) };
}

module.exports = { FORMATS, LANGUAGES, STATUSES, normalizeFilters, validateShowtime };
