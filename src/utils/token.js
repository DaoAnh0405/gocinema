const crypto = require('crypto');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// token gửi qua email là `raw`; trong DB (password_reset_tokens.token) chỉ lưu `hash`.
exports.generateResetToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw) };
};
exports.hashToken = sha256;