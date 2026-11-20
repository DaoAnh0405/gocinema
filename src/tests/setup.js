process.env.NODE_ENV = 'test';
require('dotenv').config();

if (process.env.DB_NAME !== 'gocinema_test') {
  throw new Error('Bộ kiểm thử chỉ được chạy với DB_NAME=gocinema_test.');
}

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// schema.sql và seed.sql viết cứng tên DB "gocinema" (kèm DROP DATABASE).
// Chỉ đổi đúng các câu DROP/CREATE/USE sang gocinema_test, không đụng email @gocinema.vn.
function toTestDb(sql) {
  return sql.replace(/\b(DROP DATABASE IF EXISTS|CREATE DATABASE|USE)\s+gocinema\b/gi, '$1 gocinema_test');
}

async function resetTestDb() {
  const dir = path.join(__dirname, '..', 'database');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  try {
    for (const file of ['schema.sql', 'seed.sql']) {
      const sql = toTestDb(fs.readFileSync(path.join(dir, file), 'utf8'));
      await conn.query(sql);
    }
  } finally {
    await conn.end();
  }
}

beforeAll(async () => {
  await resetTestDb();
});