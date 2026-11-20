const router = require('express').Router();

router.use('/', require('./publicRoutes'));
router.use('/', require('./authRoutes'));
router.use('/', require('./passwordResetRoutes'));
router.use('/', require('./bookingRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/staff', require('./staffRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/orders', require('./orderHistoryRoutes'));

module.exports = router;
