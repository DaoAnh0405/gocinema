const authService = require('../services/authService');
const AppError = require('../utils/AppError');
const { errorMessages } = require('../middlewares/validate');
const { HOME_BY_ROLE } = require('../middlewares/auth');

const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const save = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

// chỉ chấp nhận đường dẫn nội bộ ("/abc"), chặn "//evil.com" để tránh chuyển hướng ra ngoài
const safeReturnTo = (url) => (url && url.startsWith('/') && !url.startsWith('//') ? url : null);

function showRegister(_req, res) {
  res.render('pages/auth/register', { title: 'Đăng ký', errors: [], values: {} });
}

async function register(req, res, next) {
  const errors = errorMessages(req);
  if (errors.length) {
    return res.status(400).render('pages/auth/register', { title: 'Đăng ký', errors, values: req.body });
  }
  try {
    await authService.register(req.body);
    req.flash('success', 'Đăng ký thành công, hãy đăng nhập');
    return res.redirect('/login');
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      return res
        .status(err.status)
        .render('pages/auth/register', { title: 'Đăng ký', errors: [err.message], values: req.body });
    }
    return next(err);
  }
}

function showLogin(_req, res) {
  res.render('pages/auth/login', { title: 'Đăng nhập', errors: [], values: {} });
}

async function login(req, res, next) {
  const errors = errorMessages(req);
  if (errors.length) {
    return res.status(400).render('pages/auth/login', { title: 'Đăng nhập', errors, values: req.body });
  }
  try {
    const user = await authService.login(req.body.email, req.body.password);
    const returnTo = req.session.returnTo;

    // cấp session mới sau khi đăng nhập để chống tấn công chiếm phiên (session fixation)
    await regenerate(req);
    req.session.user = user;
    await save(req);

    return res.redirect(safeReturnTo(returnTo) || HOME_BY_ROLE[user.role] || '/');
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      return res
        .status(err.status)
        .render('pages/auth/login', { title: 'Đăng nhập', errors: [err.message], values: { email: req.body.email } });
    }
    return next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('gocinema.sid');
    res.redirect('/login');
  });
}

module.exports = { showRegister, register, showLogin, login, logout };