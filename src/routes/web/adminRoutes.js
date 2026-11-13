const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { adminLayout } = require('../../middlewares/layout');
const { ROLE, PERMISSION } = require('../../constants');
const { requirePermission } = require('../../middlewares/permission');
const prices = require('../../controllers/ticketPriceController');
const { idRule, priceRules } = require('../../validators/ticketPriceValidator');

router.use(requireLogin, requireRole(ROLE.ADMIN), adminLayout);

router.get('/', (req, res) => res.render('pages/admin/dashboard', { title: 'Tổng quan' }));

// mount module ở đây
router.use('/prices', requirePermission(PERMISSION.MANAGE_PRICES), prices.csrf);
router.get('/prices', prices.index);
router.get('/prices/new', prices.create);
router.post('/prices', priceRules, prices.save);
router.get('/prices/:id/edit', idRule, prices.edit);
router.post('/prices/:id', idRule, priceRules, prices.save);
router.get('/prices/:id/delete', idRule, prices.confirmDelete);
router.post('/prices/:id/delete', idRule, prices.remove);

module.exports = router;
