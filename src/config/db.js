const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: '+07:00',
  decimalNumbers: true,
});

// truy vấn đơn giản, luôn truyền dữ liệu qua params (?) để chống SQL injection.
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// chạy nhiều lệnh trong 1 transaction, lỗi thì rollback toàn bộ.
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };