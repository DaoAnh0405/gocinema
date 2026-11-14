const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const env = require('./env');
const { pool } = require('./db');

const options = {
  name: 'gocinema.sid',
  secret: env.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: env.session.maxAgeMs,
  },
};

// khi test dùng bộ nhớ tạm để Jest thoát gọn
if (!env.isTest) {
  options.store = new MySQLStore({}, pool); // tự tạo bảng `sessions`
}

module.exports = session(options);