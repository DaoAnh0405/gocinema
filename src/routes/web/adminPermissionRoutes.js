const router = require('express').Router();
const controller = require('../../controllers/adminPermissionController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { PERMISSION } = require('../../constants');

router.use('/permissions', requirePermission(PERMISSION.MANAGE_PERMISSIONS), catalogCsrfToken);

router.get('/permissions', controller.show);
router.post('/permissions', verifyCatalogCsrf, controller.save);

module.exports = router;