const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { adminLayout } = require('../../middlewares/layout');
const { ROLE, PERMISSION } = require('../../constants');
const { requirePermission } = require('../../middlewares/permission');
const prices = require('../../controllers/ticketPriceController');
const { idRule, priceRules } = require('../../validators/ticketPriceValidator');
const cinemas = require('../../controllers/cinemaController');
const cinemaRules = require('../../validators/cinemaValidator');

router.use(requireLogin, requireRole(ROLE.ADMIN), adminLayout);

router.get('/', (req, res) => res.render('pages/admin/dashboard', { title: 'Tổng quan' }));

//catalog(movies, genres)
router.use(require('./adminCatalogRoutes'));
//foods
router.use(require('./adminFoodRoutes'));
//promotions
router.use(require('./adminPromotionRoutes'));
//permissions
router.use(require('./adminPermissionRoutes'));
//accounts
router.use(require('./adminAccountRoutes'));
//cinemas
router.use('/cinemas', requirePermission(PERMISSION.MANAGE_CINEMAS), cinemas.csrf);
router.get('/cinemas', cinemas.index);
router.get('/cinemas/new', cinemas.create);
router.post('/cinemas', cinemaRules.cinemaRules, cinemas.save);
router.get('/cinemas/:cinemaId/edit', cinemaRules.cinemaIdRule, cinemas.edit);
router.post('/cinemas/:cinemaId', cinemaRules.cinemaIdRule, cinemaRules.cinemaRules, cinemas.save);
router.post('/cinemas/:cinemaId/status', cinemaRules.cinemaIdRule, cinemaRules.statusRule, cinemas.changeStatus);
router.get('/cinemas/:cinemaId/rooms', cinemaRules.cinemaIdRule, cinemas.roomIndex);
router.get('/cinemas/:cinemaId/rooms/new', cinemaRules.cinemaIdRule, cinemas.createRoom);
router.post('/cinemas/:cinemaId/rooms', cinemaRules.cinemaIdRule, cinemaRules.roomRules, cinemas.saveRoom);
router.get('/cinemas/:cinemaId/rooms/:roomId/edit', cinemaRules.cinemaIdRule, cinemaRules.roomIdRule, cinemas.editRoom);
router.get('/cinemas/:cinemaId/rooms/:roomId/seats', cinemaRules.cinemaIdRule, cinemaRules.roomIdRule, cinemas.seats);
router.post('/cinemas/:cinemaId/rooms/:roomId/seats', cinemaRules.cinemaIdRule, cinemaRules.roomIdRule, cinemas.saveSeats);
router.post('/cinemas/:cinemaId/rooms/:roomId', cinemaRules.cinemaIdRule, cinemaRules.roomIdRule, cinemaRules.roomRules, cinemas.saveRoom);
router.post('/cinemas/:cinemaId/rooms/:roomId/status', cinemaRules.cinemaIdRule, cinemaRules.roomIdRule, cinemaRules.statusRule, cinemas.changeRoomStatus);

// prices
router.use('/prices', requirePermission(PERMISSION.MANAGE_PRICES), prices.csrf);
router.get('/prices', prices.index);
router.get('/prices/new', prices.create);
router.post('/prices', priceRules, prices.save);
router.get('/prices/:id/edit', idRule, prices.edit);
router.post('/prices/:id', idRule, priceRules, prices.save);
router.get('/prices/:id/delete', idRule, prices.confirmDelete);
router.post('/prices/:id/delete', idRule, prices.remove);

module.exports = router;