const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const accountModel = require('../models/adminAccountModel');
const passwordResetService = require('./passwordResetService');
const AppError = require('../utils/AppError');
const { ROLE } = require('../constants');

const SALT_ROUNDS = 10;

async function list(filters) {
  const [result, counts, cinemas] = await Promise.all([
    accountModel.listPage(filters),
    accountModel.countByRole(),
    accountModel.listActiveCinemas(),
  ]);
  return { ...result, counts, cinemas };
}

// rạp phải tồn tại khi tạo mới còn phải đang hoạt động
async function assertCinema(cinemaId, { requireActive }) {
  const cinema = await accountModel.findCinema(cinemaId);
  if (!cinema || (requireActive && cinema.status !== 1)) {
    const error = new AppError('Rạp làm việc không hợp lệ', 400);
    error.field = 'cinema_id';
    throw error;
  }
}

// tạo nhân viên với mật khẩu ngẫu nhiên, sau đó gửi liên kết để nhân viên tự đặt mật khẩu
// trả về { id, mailSent } gửi mail lỗi không làm mất tài khoản đã tạo
async function createStaff(values) {
  await assertCinema(values.cinema_id, { requireActive: true });
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), SALT_ROUNDS);
  const id = await accountModel.createStaff({
    email: values.email,
    phone: values.phone,
    fullName: values.full_name,
    cinemaId: values.cinema_id,
    position: values.position,
    passwordHash,
  });
  const mailSent = await invite({ account_id: id, email: values.email, full_name: values.full_name });
  return { id, mailSent };
}

async function invite(account) {
  try {
    await passwordResetService.sendInvite(account);
    return true;
  } catch (err) {
    console.error('Không gửi được mail mời nhân viên:', err.message);
    return false;
  }
}

async function updateStaff(id, values, { currentCinemaId } = {}) {
  // cho phép giữ nguyên rạp đã ngừng hoạt động, chỉ chặn khi đổi sang rạp ngừng hoạt động
  const keepsCinema = currentCinemaId != null && Number(currentCinemaId) === Number(values.cinema_id);
  await assertCinema(values.cinema_id, { requireActive: !keepsCinema });
  return accountModel.updateStaff(id, {
    phone: values.phone,
    fullName: values.full_name,
    cinemaId: values.cinema_id,
    position: values.position,
  });
}

async function findStaff(id) {
  const account = await accountModel.findById(id);
  if (!account || account.role_name !== ROLE.STAFF) throw new AppError('Không tìm thấy nhân viên', 404);
  return account;
}

async function resendInvite(id) {
  const staff = await findStaff(id);
  if (!staff.status) throw new AppError('Tài khoản đang bị khóa, hãy mở khóa trước khi gửi liên kết', 409);
  return invite(staff);
}

// khóa / mở khóa không cho tự khóa chính mình
async function setStatus(actorId, id, status) {
  if (Number(actorId) === Number(id)) throw new AppError('Bạn không thể tự khóa tài khoản của mình', 409);
  return accountModel.setStatus(id, status);
}

module.exports = { list, createStaff, updateStaff, findStaff, resendInvite, setStatus };