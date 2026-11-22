const router = require('express').Router();
const controller = require('../../controllers/adminShowtimeController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { PERMISSION } = require('../../constants');

router.use('/showtimes', requirePermission(PERMISSION.MANAGE_SHOWTIMES), catalogCsrfToken);

router.get('/showtimes', controller.index);
router.get('/showtimes/rooms', controller.rooms);
router.get('/showtimes/new', controller.createForm);
router.get('/showtimes/:id/edit', controller.editForm);
router.post('/showtimes', verifyCatalogCsrf, controller.create);
router.post('/showtimes/:id/update', verifyCatalogCsrf, controller.update);
router.post('/showtimes/:id/status', verifyCatalogCsrf, controller.changeStatus);
router.post('/showtimes/:id/delete', verifyCatalogCsrf, controller.remove);

module.exports = router;
