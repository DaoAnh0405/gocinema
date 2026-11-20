const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { adminLayout } = require('../../middlewares/layout');
const { ROLE } = require('../../constants');

router.use(requireLogin, requireRole(ROLE.ADMIN), adminLayout);

router.get('/', (req, res) => res.render('pages/admin/dashboard', { title: 'Tổng quan' }));

router.use(require('./adminCatalogRoutes'));
router.use('/showtimes', require('./adminShowtimeRoutes'));

module.exports = router;