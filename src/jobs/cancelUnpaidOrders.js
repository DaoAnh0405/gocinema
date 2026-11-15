const orderService = require('../services/orderService');

let running = false;

async function run() {
  if (running) return 0;
  running = true;
  try {
    const n = await orderService.expireUnpaidOrders();
    if (n) console.log(`[job] đã hủy ${n} đơn quá hạn thanh toán`);
    return n;
  } catch (err) {
    console.error('[job] cancelUnpaidOrders lỗi:', err.message);
    return 0;
  } finally {
    running = false;
  }
}

module.exports = { run };