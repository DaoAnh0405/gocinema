const { query, withTransaction } = require('../config/db');

// vô hiệu hóa các token cũ chưa dùng rồi tạo token mới (cùng 1 transaction)
async function createToken(accountId, tokenHash, expiresAt) {
  return withTransaction(async (conn) => {
    await conn.query(
      'UPDATE password_reset_tokens SET is_used = TRUE WHERE account_id = ? AND is_used = FALSE',
      [accountId],
    );
    await conn.query(
      'INSERT INTO password_reset_tokens (account_id, token, expires_at) VALUES (?, ?, ?)',
      [accountId, tokenHash, expiresAt],
    );
  });
}

// dùng để chặn gửi mail dồn dập
async function hasTokenExpiringAfter(accountId, moment) {
  const rows = await query(
    `SELECT 1 FROM password_reset_tokens
     WHERE account_id = ? AND is_used = FALSE AND expires_at > ? LIMIT 1`,
    [accountId, moment],
  );
  return rows.length > 0;
}

async function findValid(tokenHash, now) {
  const rows = await query(
    `SELECT t.token_id, t.account_id, a.status
     FROM password_reset_tokens t
     JOIN accounts a ON a.account_id = t.account_id
     WHERE t.token = ? AND t.is_used = FALSE AND t.expires_at > ?
     LIMIT 1`,
    [tokenHash, now],
  );
  return rows[0] || null;
}

/**
 * Đổi mật khẩu và đánh dấu token đã dùng trong 1 transaction
 * Trả về false nếu token vừa bị dùng bởi một request khác (tránh dùng 2 lần)
 */
async function resetPassword(tokenId, accountId, passwordHash) {
  return withTransaction(async (conn) => {
    const [marked] = await conn.query(
      'UPDATE password_reset_tokens SET is_used = TRUE WHERE token_id = ? AND is_used = FALSE',
      [tokenId],
    );
    if (marked.affectedRows !== 1) return false;

    await conn.query('UPDATE accounts SET password = ? WHERE account_id = ?', [
      passwordHash,
      accountId,
    ]);
    await conn.query(
      'UPDATE password_reset_tokens SET is_used = TRUE WHERE account_id = ? AND is_used = FALSE',
      [accountId],
    );
    return true;
  });
}

module.exports = { createToken, hasTokenExpiringAfter, findValid, resetPassword };