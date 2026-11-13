const cron = require('node-cron');
const cancelUnpaidOrders = require('./cancelUnpaidOrders');
const releaseExpiredSeats = require('./releaseExpiredSeats');

function startJobs() {
  // mỗi phút: hủy đơn quá hạn trước, nhả ghế hết hạn SAU
  cron.schedule('* * * * *', async () => {
    await cancelUnpaidOrders.run();
    await releaseExpiredSeats.run();
  });
}

module.exports = { startJobs };