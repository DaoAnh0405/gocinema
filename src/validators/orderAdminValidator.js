const { parseId } = require('./adminCatalogValidator');

const ORDER_STATUSES = Object.freeze(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED']);
const STATUS_LABELS = Object.freeze({
  PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn giữ ghế',
});
const CHANNELS = Object.freeze(['ONLINE', 'COUNTER']);
const CHANNEL_LABELS = Object.freeze({ ONLINE: 'Online', COUNTER: 'Tại quầy' });
const REASON_MAX = 150;
const SEARCH_MAX = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' thật sự tồn tại (loại 2026-02-30) -> mốc UTC, ngược lại null
function parseDate(raw) {
  if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? time : null;
}

const nextDay = (text) => new Date(parseDate(text) + DAY_MS).toISOString().slice(0, 10);

// bộ lọc danh sách đơn giá trị sai bị bỏ qua, không bao giờ ném lỗi
function normalizeOrderFilters(input = {}) {
  input = input || {};
  let from = parseDate(input.from) === null ? '' : input.from;
  let to = parseDate(input.to) === null ? '' : input.to;
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: typeof input.q === 'string' ? [...input.q.trim()].slice(0, SEARCH_MAX).join('') : '',
    status: ORDER_STATUSES.includes(input.status) ? input.status : '',
    channel: CHANNELS.includes(input.channel) ? input.channel : '',
    cinemaId: parseId(input.cinema_id) || '',
    from,
    to,
    page: parseId(input.page) || 1,
  };
}

// lý do hủy (không bắt buộc, tối đa 150 ký tự để còn chỗ ghi tên người hủy vào cột 255 ký tự)
function validateCancel(input = {}) {
  input = input || {};
  const raw = input.reason;
  if (raw != null && typeof raw !== 'string') return { reason: '', error: 'Lý do không hợp lệ' };
  const reason = (raw || '').trim();
  if ([...reason].length > REASON_MAX) return { reason, error: `Lý do tối đa ${REASON_MAX} ký tự` };
  return { reason, error: '' };
}

module.exports = {
  ORDER_STATUSES, STATUS_LABELS, CHANNELS, CHANNEL_LABELS, REASON_MAX, parseDate, nextDay,
  normalizeOrderFilters, validateCancel,
};