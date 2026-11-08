module.exports = (req, res, next) => {
  // Dùng: req.flash('success', 'Đăng ký thành công')
  req.flash = (type, message) => {
    req.session.flash = { type, message };
  };

  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.currentPath = req.path;
  next();
};