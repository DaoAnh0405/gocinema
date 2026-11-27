const { parseId } = require('./adminCatalogValidator');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;
const DEFAULT_DAYS = 30;
const CHANNELS = Object.freeze(['ONLINE', 'COUNTER']);

// 'YYYY-MM-DD' thật sự tồn tại (loại 2026-02-30) -> mốc UTC, ngược lại null
function parseDate(raw) {
  if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? time : null;
}

const formatDate = (time) => new Date(time).toISOString().slice(0, 10);
const addDays = (text, days) => formatDate(parseDate(text) + days * DAY_MS);
const countDays = (from, to) => Math.round((parseDate(to) - parseDate(from)) / DAY_MS) + 1;

// ngày hiện tại theo giờ máy chủ, dạng YYYY-MM-DD
function todayText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// chuẩn hóa bộ lọc khoảng ngày (bao gồm cả hai đầu), tối đa 366 ngày, mặc định 30 ngày gần nhất
function normalizeReportFilters(input = {}, today = todayText()) {
  input = input || {};
  let from = parseDate(input.from) === null ? null : input.from;
  let to = parseDate(input.to) === null ? null : input.to;
  if (!to) to = from && from > today ? from : today;
  if (!from) from = addDays(to, -(DEFAULT_DAYS - 1));
  if (from > to) [from, to] = [to, from];

  let notice = '';
  if (countDays(from, to) > MAX_DAYS) {
    from = addDays(to, -(MAX_DAYS - 1));
    notice = `Chỉ xem được tối đa ${MAX_DAYS} ngày mỗi lần, đã rút gọn về ${MAX_DAYS} ngày gần nhất của khoảng đã chọn`;
  }
  return {
    from,
    to,
    days: countDays(from, to),
    cinemaId: parseId(input.cinema_id) || '',
    movieId: parseId(input.movie_id) || '',
    channel: CHANNELS.includes(input.channel) ? input.channel : '',
    notice,
  };
}

// khoảng liền trước có cùng số ngày, dùng để so sánh tăng giảm
function previousRange({ from, days }) {
  const to = addDays(from, -1);
  return { from: addDays(to, -(days - 1)), to, days };
}

function presetRanges(today = todayText()) {
  const [year, month] = today.split('-').map(Number);
  const lastMonthStart = formatDate(Date.UTC(year, month - 2, 1));
  const lastMonthEnd = formatDate(Date.UTC(year, month - 1, 0));
  const [y, m, d] = today.split('-');
  return [
    { key: 'all', label: 'Tất cả kỳ', title: `Tối đa ${MAX_DAYS} ngày gần nhất`, from: addDays(today, -(MAX_DAYS - 1)), to: today },
    { key: 'today', label: `${d}/${m}/${y}`, title: 'Hôm nay', from: today, to: today },
    { key: '7d', label: '7 ngày gần nhất', from: addDays(today, -6), to: today },
    { key: '30d', label: '30 ngày gần nhất', from: addDays(today, -29), to: today },
    { key: 'month', label: 'Tháng này', from: `${today.slice(0, 8)}01`, to: today },
    { key: 'lastMonth', label: 'Tháng trước', from: lastMonthStart, to: lastMonthEnd },
  ];
}

module.exports = {
  MAX_DAYS, parseDate, addDays, countDays, normalizeReportFilters, previousRange, presetRanges, CHANNELS
};