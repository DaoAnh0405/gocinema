const bcrypt = require('bcryptjs');
const { pool, query } = require('../../config/db');
const { ROLE } = require('../../constants');

async function main() {
  const [emailArg, password] = process.argv.slice(2);
  if (!emailArg || !password) {
    console.error("Dùng: npm run seed:admin -- <email> '<mật_khẩu>'");
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Mật khẩu tối thiểu 8 ký tự');
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const existed = await query('SELECT 1 FROM accounts WHERE email = ?', [email]);
  if (existed.length) {
    console.log(`Email ${email} đã tồn tại, bỏ qua.`);
    return;
  }

  const roles = await query('SELECT role_id FROM roles WHERE role_name = ?', [ROLE.ADMIN]);
  if (!roles.length) throw new Error('Chưa có vai trò ADMIN. Hãy chạy `npm run db:reset`');

  const hash = await bcrypt.hash(password, 10);
  await query('INSERT INTO accounts (email, password, role_id) VALUES (?, ?, ?)', [
    email,
    hash,
    roles[0].role_id,
  ]);
  console.log(`Đã tạo tài khoản ADMIN: ${email}`);
}

main()
  .catch((err) => {
    console.error('Lỗi:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());