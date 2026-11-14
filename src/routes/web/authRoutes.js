const router = require('express').Router();
const ctrl = require('../../controllers/authController');
const { registerRules, loginRules } = require('../../validators/authValidator');
const { requireLogin, guestOnly } = require('../../middlewares/auth');

router.get('/register', guestOnly, ctrl.showRegister);
router.post('/register', guestOnly, registerRules, ctrl.register);

router.get('/login', guestOnly, ctrl.showLogin);
router.post('/login', guestOnly, loginRules, ctrl.login);

router.post('/logout', requireLogin, ctrl.logout);

module.exports = router;