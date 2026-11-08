require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

// thiếu biến quan trọng thì báo ngay khi khởi động
if (!isTest) {
  const missing = ['DB_PASSWORD', 'SESSION_SECRET'].filter((k) => !process.env[k]);
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
  payment: { provider: get('PAYMENT_PROVIDER', 'mock') },
  vnpay: {
    tmnCode: get('VNPAY_TMN_CODE', ''),
    hashSecret: get('VNPAY_HASH_SECRET', ''),
    returnUrl: get('VNPAY_RETURN_URL', ''),
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