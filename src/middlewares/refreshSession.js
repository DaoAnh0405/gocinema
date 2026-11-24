const accountModel = require('../models/accountModel');
const AppError = require('../utils/AppError');
const { ACCOUNT_STATUS } = require('../constants');

const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const save = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));

// mỗi request của người đã đăng nhập đọc lại trạng thái và quyền từ DB
// tài khoản bị khóa hoặc không còn tồn tại hủy phiên, về trang đăng nhập (API trả 401)
// vai trò hoặc quyền đã đổi cập nhật session ngay, không cần đăng nhập lại
module.exports = async function refreshSession(req, res, next) {
  try {
    const user = req.session && req.session.user;
    if (!user) return next();

    const state = await accountModel.loadAuthState(user.id);
    if (state && state.status === ACCOUNT_STATUS.ACTIVE) {
      if (user.role !== state.role || !sameSet(user.permissions || [], state.permissions)) {
        user.role = state.role;
        user.permissions = state.permissions;
      }
      return next();
    }

    const message = 'Tài khoản đã bị khóa hoặc không còn tồn tại, vui lòng liên hệ quản trị viên';
    await regenerate(req); // cấp session mới, bỏ toàn bộ dữ liệu đăng nhập cũ
    if (req.originalUrl.startsWith('/api')) return next(new AppError(message, 401));
    req.session.flash = { type: 'error', message };
    await save(req);
    return res.redirect('/login');
  } catch (err) {
    return next(err);
  }
};