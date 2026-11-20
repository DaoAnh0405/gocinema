const router = require('express').Router();
const controller = require('../../controllers/adminShowtimeController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { PERMISSION } = require('../../constants');

router.use(requirePermission(PERMISSION.MANAGE_SHOWTIMES), catalogCsrfToken);
router.get('/', controller.index);
router.post('/', verifyCatalogCsrf, controller.create);
router.post('/:id/update', verifyCatalogCsrf, controller.update);
router.post('/:id/delete', verifyCatalogCsrf, controller.remove);
router.post('/:id/status', verifyCatalogCsrf, controller.changeStatus);

module.exports = router;
