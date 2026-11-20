require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

// thiếu biến quan trọng thì báo ngay khi khởi động
if (!isTest) {
  const required = ['DB_PASSWORD', 'SESSION_SECRET'];
  if (process.env.PAYMENT_PROVIDER === 'sepay') {
    required.push('SEPAY_MERCHANT_ID', 'SEPAY_SECRET_KEY');
  }
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}. Hãy kiểm tra file .env`);
  }
}

const get = (key, fallback) => process.env[key] ?? fallback;

module.exports = Object.freeze({
  nodeEnv,
  isProd: nodeEnv === 'production',
  isTest,
  port: Number(get('PORT', 3000)),
  appUrl: get('APP_URL', 'http://localhost:3000')
    .replace(/\/$/, ''),
  db: {
    host: get('DB_HOST', 'localhost'),
    port: Number(get('DB_PORT', 3307)),
    user: get('DB_USER', 'root'),
    password: get('DB_PASSWORD', ''),
    database: get('DB_NAME', 'gocinema'),
  },
  session: {
    secret: get('SESSION_SECRET', 'test-secret'),
    maxAgeMs: 24 * 60 * 60 * 1000,
  },
  booking: { holdMinutes: Number(get('SEAT_HOLD_MINUTES', 10)) },
  payment: { 
    provider: get('PAYMENT_PROVIDER', 'mock'),
    sepay: {
      merchantId: get('SEPAY_MERCHANT_ID', ''),
      secretKey: get('SEPAY_SECRET_KEY', ''),
      checkoutUrl: get('SEPAY_CHECKOUT_URL', 'https://pay-sandbox.sepay.vn/v1/checkout/init'),
      apiBase: get('SEPAY_API_BASE', 'https://pgapi-sandbox.sepay.vn'),
      returnBase: get('SEPAY_RETURN_BASE', 'http://localhost:3000/booking/payment/sepay'),
      ipnSecret: get('SEPAY_IPN_SECRET', ''),
    },
  },
  mail: {
    host: get('MAIL_HOST', ''),
    port: Number(get('MAIL_PORT', 465)),
    secure: get('MAIL_SECURE', 'true') === 'true',
    user: get('MAIL_USER', ''),
    pass: get('MAIL_PASS', ''),
    from: get('MAIL_FROM', ''),
  },
});