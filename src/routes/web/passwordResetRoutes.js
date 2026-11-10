const router = require('express').Router();
const ctrl = require('../../controllers/passwordResetController');
const { forgotRules, resetRules } = require('../../validators/passwordResetValidator');
const { guestOnly } = require('../../middlewares/auth');

// đặt guestOnly ở từng route, không dùng router.use(guestOnly)
// vì router này gắn ở "/" nên router.use sẽ chặn nhầm cả /admin, /profile của người đã đăng nhập
router.get('/forgot-password', guestOnly, ctrl.showForgotPassword);
router.post('/forgot-password', guestOnly, forgotRules, ctrl.requestReset);

router.get('/reset-password/:token', guestOnly, ctrl.showResetPassword);
router.post('/reset-password/:token', guestOnly, resetRules, ctrl.resetPassword);

module.exports = router;