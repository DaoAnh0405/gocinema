const passwordResetService = require('../services/passwordResetService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const { errorMessages } = require('../middlewares/validate');

function showForgotPassword(_req, res) {
  res.render('pages/auth/forgotPassword', { title: 'Quên mật khẩu', errors: [], values: {} });
}

const requestReset = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) {
    return res
      .status(400)
      .render('pages/auth/forgotPassword', { title: 'Quên mật khẩu', errors, values: req.body });
  }

  await passwordResetService.requestReset(req.body.email);

  // cùng một thông báo cho mọi email để không lộ email nào đã đăng ký
  req.flash(
    'success',
    'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục Spam).',
  );
  await saveSession(req);
  return res.redirect('/login');
});

async function redirectInvalidLink(req, res) {
  req.flash('warning', `${passwordResetService.MSG_INVALID_LINK}, vui lòng yêu cầu lại`);
  await saveSession(req);
  return res.redirect('/forgot-password');
}

const showResetPassword = asyncHandler(async (req, res) => {
  const record = await passwordResetService.findValidToken(req.params.token);
  if (!record) return redirectInvalidLink(req, res);

  return res.render('pages/auth/resetPassword', {
    title: 'Đặt lại mật khẩu',
    errors: [],
    token: req.params.token,
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) {
    return res.status(400).render('pages/auth/resetPassword', {
      title: 'Đặt lại mật khẩu',
      errors,
      token: req.params.token,
    });
  }

  try {
    await passwordResetService.resetPassword(req.params.token, req.body.new_password);
  } catch (err) {
    if (err instanceof AppError) return redirectInvalidLink(req, res);
    throw err;
  }

  req.flash('success', 'Đặt lại mật khẩu thành công, hãy đăng nhập bằng mật khẩu mới');
  await saveSession(req);
  return res.redirect('/login');
});

module.exports = { showForgotPassword, requestReset, showResetPassword, resetPassword };