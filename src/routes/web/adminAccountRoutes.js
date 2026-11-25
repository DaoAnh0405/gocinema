const router = require('express').Router();
const controller = require('../../controllers/adminAccountController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { PERMISSION } = require('../../constants');

router.use('/accounts', requirePermission(PERMISSION.MANAGE_ACCOUNTS), catalogCsrfToken);

router.get('/accounts', controller.list);
router.post('/accounts', verifyCatalogCsrf, controller.create);
router.post('/accounts/:id/update', verifyCatalogCsrf, controller.update);
router.post('/accounts/:id/status', verifyCatalogCsrf, controller.setStatus);
router.post('/accounts/:id/resend-invite', verifyCatalogCsrf, controller.resendInvite);

module.exports = router;