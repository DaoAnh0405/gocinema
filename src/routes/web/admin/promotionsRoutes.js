const router = require('express').Router();
const { requirePermission } = require('../../../middlewares/permission');
const { PERMISSION } = require('../../../constants');
const controller = require('../../../controllers/admin/promotionController');
const {
  promotionRules,
  promotionIdRule,
  statusRule,
} = require('../../../validators/promotionValidator');

router.use(requirePermission(PERMISSION.MANAGE_PROMOTIONS));

router.get('/', controller.index);
router.post('/', promotionRules, controller.create);
router.put('/:id', promotionIdRule, promotionRules, controller.update);
router.post('/:id/status', promotionIdRule, statusRule, controller.updateStatus);
router.delete('/:id', promotionIdRule, controller.remove);

module.exports = router;
