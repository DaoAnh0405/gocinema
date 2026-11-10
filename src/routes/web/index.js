const router = require('express').Router();

router.use('/', require('./publicRoutes'));
router.use('/', require('./authRoutes'));
router.use('/', require('./passwordResetRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/staff', require('./staffRoutes'));
router.use('/profile', require('./profileRoutes'));

module.exports = router;