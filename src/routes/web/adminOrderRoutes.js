const router = require('express').Router();
const controller = require('../../controllers/adminOrderController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { PERMISSION } = require('../../constants');

// xem VIEW_ORDERS, hủy đơn thêm MANAGE_ORDERS
router.use('/orders', requirePermission(PERMISSION.VIEW_ORDERS), catalogCsrfToken);

router.get('/orders', controller.list);
router.get('/orders/export.csv', controller.exportCsv);
router.get('/orders/:id', controller.show);
router.post('/orders/:id/cancel', requirePermission(PERMISSION.MANAGE_ORDERS), verifyCatalogCsrf, controller.cancel);

module.exports = router;