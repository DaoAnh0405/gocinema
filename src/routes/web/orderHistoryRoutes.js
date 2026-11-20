const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { ROLE } = require('../../constants');
const controller = require('../../controllers/orderHistoryController');

router.get('/', requireLogin, requireRole(ROLE.CUSTOMER), controller.index);

module.exports = router;
