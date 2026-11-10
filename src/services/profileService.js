const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const accountModel = require('../models/accountModel');
const mailService = require('./mailService');
const AppError = require('../utils/AppError');
const { ROLE } = require('../constants');

const SALT_ROUNDS = 10;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const MSG_SESSION_EXPIRED = 'Phiên đổi mật khẩu đã hết hạn, vui lòng thực hiện lại';
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// khách hàng xem đầy đủ và sửa được. Nhân viên/admin chỉ xem thông tin cơ bản
async function getProfile(user) {
  if (user.role === ROLE.CUSTOMER) {
    const profile = await accountModel.getCustomerProfile(user.id);
    if (!profile) throw new AppError('Không tìm thấy hồ sơ', 404);
    return { ...profile, editable: true };
  }
  const account = await accountModel.findById(user.id);
  if (!account) throw new AppError('Không tìm thấy hồ sơ', 404);
  return {
    account_id: account.account_id,
    email: account.email,
    phone: account.phone,
    full_name: account.full_name,
    editable: false,
  };
}

async function updateInfo(user, input) {
  if (user.role !== ROLE.CUSTOMER) {
    throw new AppError('Tài khoản này không được tự sửa thông tin', 403);
  }
  const phone = input.phone ? input.phone.trim() : null;

  if (phone) {
    const owner = await accountModel.findByPhone(phone);
    if (owner && owner.account_id !== user.id) {
      throw new AppError('Số điện thoại đã được sử dụng', 409);
    }
  }

  const data = {
    phone,
    fullName: input.full_name.trim(),
    dob: input.dob || null,
    gender: input.gender || null,
    address: input.address ? input.address.trim() : null,
  };
  try {
    await accountModel.updateCustomerProfile(user.id, data);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError('Số điện thoại đã được sử dụng', 409);
    throw err;
  }
  return { fullName: data.fullName };
}

// đổi mật khẩu có xác nhận OTP
// tạo OTP, gửi email, trả về trạng thái OTP để controller lưu vào session (lưu bản băm)
async function sendOtp(email) {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
  try {
    await mailService.sendPasswordOtpMail(email, otp, OTP_TTL_MINUTES);
  } catch (err) {
    console.error('Gửi OTP thất bại:', err.message);
    throw new AppError('Không gửi được email xác nhận, vui lòng thử lại sau', 503);
  }
  const now = Date.now();
  return { otpHash, expiresAt: now + OTP_TTL_MINUTES * 60 * 1000, sentAt: now, attempts: 0 };
}

// 1 kiểm tra mật khẩu hiện tại, băm mật khẩu mới, gửi OTP, chưa đổi mật khẩu thật
async function startPasswordChange(userId, currentPassword, newPassword) {
  const account = await accountModel.findById(userId);
  if (!account) throw new AppError('Không tìm thấy tài khoản', 404);

  if (!(await bcrypt.compare(currentPassword, account.password))) {
    throw new AppError('Mật khẩu hiện tại không đúng', 400);
  }
  if (await bcrypt.compare(newPassword, account.password)) {
    throw new AppError('Mật khẩu mới phải khác mật khẩu hiện tại', 400);
  }

  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const otpState = await sendOtp(account.email);
  return { ...otpState, newPasswordHash };
}

// gửi lại OTP mới (cách lần trước ít nhất 60 giây), giữ nguyên mật khẩu mới đang chờ
async function resendPasswordOtp(userId, pending) {
  if (!pending) throw new AppError(MSG_SESSION_EXPIRED, 400);

  const waitSeconds = Math.ceil((pending.sentAt + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000);
  if (waitSeconds > 0) {
    throw new AppError(`Vui lòng đợi ${waitSeconds} giây trước khi gửi lại mã`, 429);
  }

  const account = await accountModel.findById(userId);
  if (!account) throw new AppError('Không tìm thấy tài khoản', 404);
  const otpState = await sendOtp(account.email);
  return { ...pending, ...otpState };
}

// 2 kiểm tra OTP, đúng thì mới ghi mật khẩu mới vào DB
async function confirmPasswordChange(userId, pending, otpInput) {
  if (!pending) throw new AppError(MSG_SESSION_EXPIRED, 400);
  if (Date.now() > pending.expiresAt) {
    throw new AppError('Mã OTP đã hết hạn, hãy bấm "Gửi lại mã"', 400);
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('Bạn đã nhập sai quá nhiều lần, hãy bấm "Gửi lại mã" để nhận mã mới', 429);
  }

  if (!(await bcrypt.compare(String(otpInput), pending.otpHash))) {
    pending.attempts += 1; // pending là object trong session nên giá trị này được lưu lại
    const remaining = OTP_MAX_ATTEMPTS - pending.attempts;
    throw new AppError(`Mã OTP không đúng (còn ${remaining} lần thử)`, 400);
  }

  await accountModel.updatePassword(userId, pending.newPasswordHash);
}

module.exports = {
  OTP_TTL_MINUTES,
  getProfile,
  updateInfo,
  startPasswordChange,
  resendPasswordOtp,
  confirmPasswordChange,
};