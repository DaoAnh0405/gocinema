const { ROLE } = require('../constants');
const fmt = require('../utils/format');

module.exports = (req, res, next) => {
  // Dùng: req.flash('success', 'Đăng ký thành công')
  const perms = (req.session && req.session.user && req.session.user.permissions) || [];
  res.locals.can = (permission) => perms.includes(permission);
  res.locals.fmt = fmt;
  req.flash = (type, message) => {
    req.session.flash = { type, message };
  };

  res.locals.ROLE = ROLE;
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.currentPath = req.path;
  next();
};