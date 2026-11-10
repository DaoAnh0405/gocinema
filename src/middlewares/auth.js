const AppError = require('../utils/AppError');

// trang chủ theo từng vai trò (dùng cho đăng nhập và guestOnly)
const HOME_BY_ROLE = { ADMIN: '/admin', STAFF: '/staff', CUSTOMER: '/' };

function requireLogin(req, res, next) {
  if (req.session.user) return next();

  if (req.originalUrl.startsWith('/api')) {
    return next(new AppError('Vui lòng đăng nhập', 401));
  }
  if (req.method === 'GET') req.session.returnTo = req.originalUrl; // đăng nhập xong quay lại
  req.flash('warning', 'Vui lòng đăng nhập để tiếp tục');
  return res.redirect('/login');
}

// chỉ cho phép các vai trò được liệt kê, sai vai trò trả 403
function requireRole(...roles) {
  return (req, _res, next) => {
    const user = req.session.user;
    if (user && roles.includes(user.role)) return next();
    return next(new AppError('Bạn không có quyền truy cập trang này', 403));
  };
}

// Trang dành cho khách chưa đăng nhập (đăng nhập, đăng ký), đã đăng nhập thì chuyển đi
function guestOnly(req, res, next) {
  const user = req.session.user;
  if (!user) return next();
  return res.redirect(HOME_BY_ROLE[user.role] || '/');
}

module.exports = { requireLogin, requireRole, guestOnly, HOME_BY_ROLE };