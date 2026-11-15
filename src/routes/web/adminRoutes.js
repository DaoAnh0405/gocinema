const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { adminLayout } = require('../../middlewares/layout');
const { ROLE } = require('../../constants');
const promotionRoutes = require('./admin/promotionsRoutes');

router.use(requireLogin, requireRole(ROLE.ADMIN), adminLayout);

router.get('/', (req, res) => res.render('pages/admin/dashboard', { title: 'Tổng quan' }));

router.use('/promotions', promotionRoutes);

module.exports = router;