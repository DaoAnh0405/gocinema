const env = require('../config/env');
const mockProvider = require('./payment/mockProvider');
const sepayProvider = require('./payment/sepayProvider');

const providers = { mock: mockProvider, sepay: sepayProvider };

function current() {
  const provider = providers[env.payment.provider];
  if (!provider) throw new Error(`Cổng thanh toán "${env.payment.provider}" chưa được cài đặt.`);
  return provider;
}

const pay = (payload) => current().pay(payload);

// Có thể trả về Promise (SePay phải hỏi lại cổng), nên nơi gọi phải dùng await
function verifyReturn(query) {
  const provider = current();
  if (!provider.verifyReturn) throw new Error('Cổng thanh toán hiện tại không nhận kết quả trả về.');
  return provider.verifyReturn(query);
}

function buildCheckout(payload) {
  const provider = current();
  if (!provider.buildCheckout) throw new Error('Cổng thanh toán hiện tại không dùng form thanh toán.');
  return provider.buildCheckout(payload);
}

module.exports = { pay, verifyReturn, buildCheckout };