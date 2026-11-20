process.env.NODE_ENV = 'test';
require('dotenv').config();

if (process.env.DB_NAME !== 'gocinema_test') {
  throw new Error('Bộ kiểm thử chỉ được chạy với DB_NAME=gocinema_test.');
}

beforeAll(async () => {
  await require('../database/migrate')();
});
