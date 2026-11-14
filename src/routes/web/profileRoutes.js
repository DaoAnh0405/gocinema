const router = require('express').Router();
const ctrl = require('../../controllers/profileController');
const {
  updateInfoRules,
  changePasswordRules,
  otpRules,
} = require('../../validators/profileValidator');
const { requireLogin } = require('../../middlewares/auth');

router.use(requireLogin);

router.get('/', ctrl.showProfile);
router.post('/', updateInfoRules, ctrl.updateInfo);

// đổi mật khẩu: bước 1 (nhập mật khẩu) và bước 2 (nhập OTP)
router.get('/password', ctrl.showChangePassword);
router.post('/password', changePasswordRules, ctrl.requestPasswordChange);
router.get('/password/verify', ctrl.showVerifyOtp);
router.post('/password/verify', otpRules, ctrl.verifyPasswordChange);
router.post('/password/resend', ctrl.resendOtp);

module.exports = router;