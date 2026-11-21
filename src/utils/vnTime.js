const TZ = 'Asia/Ho_Chi_Minh';
const WEEKDAY_VI = { Mon: 'Thứ 2', Tue: 'Thứ 3', Wed: 'Thứ 4', Thu: 'Thứ 5', Fri: 'Thứ 6', Sat: 'Thứ 7', Sun: 'CN' };

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// tách một thời điểm thành ngày, thứ, giờ theo giờ VN
function partsOf(date = new Date()) {
  const p = {};
  for (const { type, value } of formatter.formatToParts(date)) p[type] = value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, time: `${p.hour}:${p.minute}:${p.second}` };
}

const todayYmd = () => partsOf().ymd;

function isValidYmd(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

function dayLabel(ymd) {
  if (ymd === todayYmd()) return 'Hôm nay';
  const { weekday } = partsOf(new Date(`${ymd}T12:00:00+07:00`));
  const [, mm, dd] = ymd.split('-');
  return `${WEEKDAY_VI[weekday]} ${dd}/${mm}`;
}

// nhãn thứ của một ngày: "Hôm nay", "Thứ 2", ..., "CN"
function weekdayLabel(ymd) {
  if (ymd === todayYmd()) return 'Hôm nay';
  return WEEKDAY_VI[partsOf(new Date(`${ymd}T12:00:00+07:00`)).weekday];
}

module.exports = { TZ, partsOf, todayYmd, isValidYmd, dayLabel, weekdayLabel };