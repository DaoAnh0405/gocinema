const env = require('../config/env');
const mockProvider = require('./payment/mockProvider');

const providers = { mock: mockProvider };   // sau này thêm: vnpay: require('./payment/vnpayProvider')

function pay(payload) {
  const provider = providers[env.payment.provider];
  if (!provider) throw new Error(`Cổng thanh toán "${env.payment.provider}" chưa được cài đặt.`);
  return provider.pay(payload);
}

module.exports = { pay };