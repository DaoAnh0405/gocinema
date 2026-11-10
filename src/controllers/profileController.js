const profileService = require('../services/profileService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const maskEmail = require('../utils/maskEmail');
const { errorMessages } = require('../middlewares/validate');
const saveSession = require('../utils/saveSession');

// profile

async function renderProfile(req, res, { status = 200, errors = [], values } = {}) {
  const profile = await profileService.getProfile(req.session.user);
  res.status(status).render('pages/auth/profile', {
    title: 'Hồ sơ cá nhân',
    profile,
    errors,
    values: values || profile,
  });
}

const showProfile = asyncHandler((req, res) => renderProfile(req, res));

const updateInfo = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) return renderProfile(req, res, { status: 400, errors, values: req.body });

  try {
    const updated = await profileService.updateInfo(req.session.user, req.body);
    req.session.user.fullName = updated.fullName;
    req.flash('success', 'Cập nhật thông tin thành công');
    await saveSession(req);
    return res.redirect('/profile');
  } catch (err) {
    if (err instanceof AppError) {
      return renderProfile(req, res, { status: err.status, errors: [err.message], values: req.body });
    }
    throw err;
  }
});

// đổi mật khẩu 2 bước cần otp

const renderChangePassword = (res, status, errors) =>
  res.status(status).render('pages/auth/changePassword', { title: 'Đổi mật khẩu', errors });

const renderVerifyOtp = (req, res, status, errors) =>
  res.status(status).render('pages/auth/verifyOtp', {
    title: 'Xác nhận đổi mật khẩu',
    errors,
    maskedEmail: maskEmail(req.session.user.email),
    ttlMinutes: profileService.OTP_TTL_MINUTES,
  });

// mở lại trang bước 1 thì xóa yêu cầu đang chờ, bắt đầu lại từ đầu
function showChangePassword(req, res) {
    delete req.session.passwordChange;
    renderChangePassword(res, 200, []);
}

const requestPasswordChange = asyncHandler(async (req, res) => {
  const errors = errorMessages(req);
  if (errors.length) return renderChangePassword(res, 400, errors);

  try {
    req.session.passwordChange = await profileService.startPasswordChange(
      req.session.user.id,
      req.body.current_password,
      req.body.new_password,
    );
    req.flash('info', `Mã OTP đã được gửi tới ${maskEmail(req.session.user.email)}`);
    await saveSession(req);
    return res.redirect('/profile/password/verify');
  } catch (err) {
    if (err instanceof AppError) return renderChangePassword(res, err.status, [err.message]);
    throw err;
  }
});

function showVerifyOtp(req, res) {
  if (!req.session.passwordChange) return res.redirect('/profile/password');
  return renderVerifyOtp(req, res, 200, []);
}

const verifyPasswordChange = asyncHandler(async (req, res) => {
  if (!req.session.passwordChange) {
    req.flash('warning', 'Phiên đổi mật khẩu đã hết hạn, vui lòng thực hiện lại');
    
    return res.redirect('/profile/password');
  }

  const errors = errorMessages(req);
  if (errors.length) return renderVerifyOtp(req, res, 400, errors);

  try {
    await profileService.confirmPasswordChange(
      req.session.user.id,
      req.session.passwordChange,
      req.body.otp,
    );
    delete req.session.passwordChange;
    req.flash('success', 'Đổi mật khẩu thành công');
    await saveSession(req);
    return res.redirect('/profile');
  } catch (err) {
    if (err instanceof AppError) return renderVerifyOtp(req, res, err.status, [err.message]);
    throw err;
  }
});

const resendOtp = asyncHandler(async (req, res) => {
  if (!req.session.passwordChange) {
    req.flash('warning', 'Phiên đổi mật khẩu đã hết hạn, vui lòng thực hiện lại');

    return res.redirect('/profile/password');
  }
  try {
    req.session.passwordChange = await profileService.resendPasswordOtp(
      req.session.user.id,
      req.session.passwordChange,
    );
    req.flash('info', 'Đã gửi lại mã OTP mới');
    await saveSession(req);
    return res.redirect('/profile/password/verify');
  } catch (err) {
    if (err instanceof AppError) return renderVerifyOtp(req, res, err.status, [err.message]);
    throw err;
  }
});

module.exports = {
  showProfile,
  updateInfo,
  showChangePassword,
  requestPasswordChange,
  showVerifyOtp,
  verifyPasswordChange,
  resendOtp,
};