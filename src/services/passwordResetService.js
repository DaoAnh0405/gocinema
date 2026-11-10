const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const accountModel = require('../models/accountModel');
const resetModel = require('../models/passwordResetModel');
const mailService = require('./mailService');
const AppError = require('../utils/AppError');
const { ACCOUNT_STATUS } = require('../constants');

const TOKEN_TTL_MINUTES = 30;
const COOLDOWN_MS = 60 * 1000;
const SALT_ROUNDS = 10;
const MSG_INVALID_LINK = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const isTokenFormat = (token) => /^[a-f0-9]{64}$/.test(token);

// luôn kết thúc êm, dù email có tồn tại hay không, để không lộ email nào đã đăng ký
async function requestReset(emailInput) {
  const email = String(emailInput).trim().toLowerCase();
  const account = await accountModel.findByEmail(email);
  if (!account || account.status !== ACCOUNT_STATUS.ACTIVE) return;

  // token tạo lúc T có hạn T + TTL, còn token hạn muộn hơn (now + TTL - 60s) nghĩa là vừa gửi < 60s trước
  const ttlMs = TOKEN_TTL_MINUTES * 60 * 1000;
  const recentMark = new Date(Date.now() + ttlMs - COOLDOWN_MS);
  if (await resetModel.hasTokenExpiringAfter(account.account_id, recentMark)) return;

  const token = crypto.randomBytes(32).toString('hex'); // 64 ký tự hex
  await resetModel.createToken(account.account_id, hashToken(token), new Date(Date.now() + ttlMs));

  try {
    await mailService.sendResetPasswordMail(
      account.email,
      `${env.appUrl}/reset-password/${token}`,
      TOKEN_TTL_MINUTES,
    );
  } catch (err) {
    // không báo lỗi ra ngoài để không lộ thông tin, chỉ ghi log
    console.error('Gửi mail đặt lại mật khẩu thất bại:', err.message);
  }
}

// trả về bản ghi token nếu còn hiệu lực và tài khoản còn hoạt động, ngược lại trả null
async function findValidToken(token) {
  if (!isTokenFormat(String(token))) return null;
  const record = await resetModel.findValid(hashToken(token), new Date());
  if (!record || record.status !== ACCOUNT_STATUS.ACTIVE) return null;
  return record;
}

async function resetPassword(token, newPassword) {
  const record = await findValidToken(token);
  if (!record) throw new AppError(MSG_INVALID_LINK, 400);

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const ok = await resetModel.resetPassword(record.token_id, record.account_id, hash);
  if (!ok) throw new AppError(MSG_INVALID_LINK, 400);
}

module.exports = { TOKEN_TTL_MINUTES, MSG_INVALID_LINK, requestReset, findValidToken, resetPassword };