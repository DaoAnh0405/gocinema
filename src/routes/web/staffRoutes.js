const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { staffLayout } = require('../../middlewares/layout');
const { ROLE } = require('../../constants');

router.use(requireLogin, requireRole(ROLE.STAFF), staffLayout);

router.get('/', (req, res) => res.render('pages/staff/dashboard', { title: 'Tổng quan' }));

//

module.exports = router;