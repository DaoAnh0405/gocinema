const router = require('express').Router();
const controller = require('../../controllers/adminPromotionController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { PERMISSION } = require('../../constants');

router.use('/promotions', requirePermission(PERMISSION.MANAGE_PROMOTIONS), catalogCsrfToken);

router.get('/promotions', controller.list);
router.post('/promotions', verifyCatalogCsrf, controller.create);
router.post('/promotions/:id/update', verifyCatalogCsrf, controller.update);
router.post('/promotions/:id/delete', verifyCatalogCsrf, controller.remove);

module.exports = router;