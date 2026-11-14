const AppError = require('../utils/AppError');

// phải có đủ tất cả quyền được liệt kê. Dùng sau requireLogin
function requirePermission(...permissions) {
  return (req, _res, next) => {
    const owned = req.session.user?.permissions || [];
    if (permissions.every((p) => owned.includes(p))) return next();
    return next(new AppError('Bạn không có quyền thực hiện thao tác này', 403));
  };
}

module.exports = { requirePermission };