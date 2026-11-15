const TZ = 'Asia/Ho_Chi_Minh';

function date(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  }).format(new Date(value));
}

function dateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(new Date(value));
}

function money(value) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}đ`;
}

const SHOW_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function showLabel(value) {
  if (!value) return '';
  const p = Object.fromEntries(SHOW_FORMAT.formatToParts(new Date(value)).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute} ${p.weekday}, ${p.day}/${p.month}/${p.year}`;
}

module.exports = { date, dateTime, money, showLabel };