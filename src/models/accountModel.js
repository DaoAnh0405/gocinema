const { query, withTransaction } = require('../config/db');
const { ROLE } = require('../constants');

// full_name nằm ở customers hoặc staff tùy vai trò (ADMIN không có dòng nào, nên để NULL)
const BASE_SELECT = `
  SELECT a.account_id, a.email, a.phone, a.password, a.status, a.role_id, r.role_name,
         COALESCE(c.full_name, s.full_name) AS full_name
  FROM accounts a
  JOIN roles r ON r.role_id = a.role_id
  LEFT JOIN customers c ON c.account_id = a.account_id
  LEFT JOIN staff s ON s.account_id = a.account_id`;

async function findByEmail(email) {
  const rows = await query(`${BASE_SELECT} WHERE a.email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

async function findByPhone(phone) {
  const rows = await query(`${BASE_SELECT} WHERE a.phone = ? LIMIT 1`, [phone]);
  return rows[0] || null;
}

async function getPermissionNames(roleId) {
  const rows = await query(
    `SELECT p.permission_name
     FROM role_permissions rp
     JOIN permissions p ON p.permission_id = rp.permission_id
     WHERE rp.role_id = ?`,
    [roleId],
  );
  return rows.map((r) => r.permission_name);
}

// tạo accounts + customers trong 1 transaction (thiếu 1 bảng thì rollback cả hai)
async function createCustomer({ email, phone, passwordHash, fullName, dob, gender, address }) {
  return withTransaction(async (conn) => {
    const [roles] = await conn.query('SELECT role_id FROM roles WHERE role_name = ?', [
      ROLE.CUSTOMER,
    ]);
    if (!roles.length) {
      throw new Error('Chưa có vai trò CUSTOMER. Hãy chạy `npm run db:reset` để nạp seed.sql');
    }
    const [acc] = await conn.query(
      'INSERT INTO accounts (email, phone, password, role_id) VALUES (?, ?, ?, ?)',
      [email, phone, passwordHash, roles[0].role_id],
    );
    await conn.query(
      'INSERT INTO customers (account_id, full_name, dob, gender, address) VALUES (?, ?, ?, ?, ?)',
      [acc.insertId, fullName, dob, gender, address],
    );
    return acc.insertId;
  });
}

async function findById(accountId) {
  const rows = await query(`${BASE_SELECT} WHERE a.account_id = ? LIMIT 1`, [accountId]);
  return rows[0] || null;
}

// DATE_FORMAT trả về chuỗi 'YYYY-MM-DD', tránh lệch ngày do múi giờ khi mysql2 đổi DATE sang Date của JS
async function getCustomerProfile(accountId) {
  const rows = await query(
    `SELECT a.account_id, a.email, a.phone,
            DATE_FORMAT(a.created_at, '%d/%m/%Y') AS created_at,
            c.full_name, DATE_FORMAT(c.dob, '%Y-%m-%d') AS dob, c.gender, c.address
     FROM accounts a
     JOIN customers c ON c.account_id = a.account_id
     WHERE a.account_id = ?`,
    [accountId],
  );
  return rows[0] || null;
}

// Cập nhật accounts.phone và customers trong 1 transaction
async function updateCustomerProfile(accountId, { phone, fullName, dob, gender, address }) {
  return withTransaction(async (conn) => {
    await conn.query('UPDATE accounts SET phone = ? WHERE account_id = ?', [phone, accountId]);
    await conn.query(
      'UPDATE customers SET full_name = ?, dob = ?, gender = ?, address = ? WHERE account_id = ?',
      [fullName, dob, gender, address, accountId],
    );
  });
}

async function updatePassword(accountId, passwordHash) {
  await query('UPDATE accounts SET password = ? WHERE account_id = ?', [passwordHash, accountId]);
}

module.exports = {
  findByEmail,
  findByPhone,
  findById,
  getPermissionNames,
  createCustomer,
  getCustomerProfile,
  updateCustomerProfile,
  updatePassword,
};