const { DAY_TYPE } = require('../constants');
const ticketPriceModel = require('../models/ticketPriceModel');
const { partsOf } = require('../utils/vnTime');

// ngày lễ ('yyyy-mm-dd') tính giá HOLIDAY, cần thêm loại ngày cho db
const HOLIDAYS = new Set([]);

function getDayType(startTime) {
  const { ymd, weekday } = partsOf(new Date(startTime));
  if (HOLIDAYS.has(ymd)) return DAY_TYPE.HOLIDAY;
  return weekday === 'Sat' || weekday === 'Sun' ? DAY_TYPE.WEEKEND : DAY_TYPE.WEEKDAY;
}

// trả về Map(seat_type_id -> giá) cho một suất chiếu
async function getPriceMap(startTime, screenFormat) {
  const { ymd, time } = partsOf(new Date(startTime));
  const rows = await ticketPriceModel.findApplicable({
    screenFormat, dayType: getDayType(startTime), time, ymd,
  });
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.seat_type_id)) map.set(row.seat_type_id, row.price); // dòng đầu = hiệu lực mới nhất
  }
  return map;
}

module.exports = { getDayType, getPriceMap };