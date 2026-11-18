const crypto = require('crypto');

// giả lập luôn thành công, provider thật (vnpayProvider...) có cùng giao diện pay()
async function pay({ orderCode }) {
  return { success: true, transactionRef: `MOCK-${orderCode}-${crypto.randomBytes(3).toString('hex').toUpperCase()}` };
}

module.exports = { pay };