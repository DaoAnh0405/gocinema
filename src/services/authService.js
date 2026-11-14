const bcrypt = require('bcryptjs');
const accountModel = require('../models/accountModel');
const AppError = require('../utils/AppError');
const { ACCOUNT_STATUS } = require('../constants');

const SALT_ROUNDS = 10;

async function register(input) {
  const email = input.email.trim().toLowerCase();
  // chuỗi rỗng phải đổi thành NULL, vì cột phone là UNIQUE (hai chuỗi '' sẽ trùng nhau)
  const phone = input.phone ? input.phone.trim() : null;

  if (await accountModel.findByEmail(email)) {
    throw new AppError('Email đã được sử dụng', 409);
  }
  if (phone && (await accountModel.findByPhone(phone))) {
    throw new AppError('Số điện thoại đã được sử dụng', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  try {
    return await accountModel.createCustomer({
      email,
      phone,
      passwordHash,
      fullName: input.full_name.trim(),
      dob: input.dob || null,
      gender: input.gender || null,
      address: input.address ? input.address.trim() : null,
    });
  } catch (err) {
    // hai người đăng ký cùng lúc: kiểm tra ở trên qua được nhưng UNIQUE trong DB vẫn chặn
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError('Email hoặc số điện thoại đã được sử dụng', 409);
    }
    throw err;
  }
}

// trả về object sẽ lưu vào session (không chứa mật khẩu)
async function login(emailInput, password) {
  const account = await accountModel.findByEmail(String(emailInput).trim().toLowerCase());
  const ok = account && (await bcrypt.compare(password, account.password));

  // một thông báo chung cho cả "sai email" và "sai mật khẩu" để không lộ email nào đã tồn tại
  if (!ok) throw new AppError('Email hoặc mật khẩu không đúng', 401);

  // kiểm tra khóa sau khi đã đúng mật khẩu, cũng để không lộ thông tin tài khoản
  if (account.status !== ACCOUNT_STATUS.ACTIVE) {
    throw new AppError('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên', 403);
  }

  const permissions = await accountModel.getPermissionNames(account.role_id);
  return {
    id: account.account_id,
    email: account.email,
    fullName: account.full_name,
    role: account.role_name,
    permissions,
  };
}

module.exports = { register, login };