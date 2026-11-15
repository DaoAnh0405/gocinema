const bookingModel = require('../models/bookingModel');

let running = false;

async function run() {
  if (running) return 0;
  running = true;
  try {
    const result = await bookingModel.releaseExpired();
    const n = result.affectedRows || 0;
    if (n) console.log(`[job] đã nhả ${n} ghế hết hạn giữ`);
    return n;
  } catch (err) {
    console.error('[job] releaseExpiredSeats lỗi:', err.message);
    return 0;
  } finally {
    running = false;
  }
}

module.exports = { run };