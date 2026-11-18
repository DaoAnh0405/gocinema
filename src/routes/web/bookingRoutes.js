const router = require('express').Router();
const { requireLogin, requireRole } = require('../../middlewares/auth');
const { ROLE } = require('../../constants');
const bookingController = require('../../controllers/bookingController');
const catalogController = require('../../controllers/catalogController');
const checkoutController = require('../../controllers/checkoutController');

const customerOnly = [requireLogin, requireRole(ROLE.CUSTOMER)];

// 1 rạp -> phim -> suất (public)
router.get('/booking', bookingController.startPage);
router.get('/api/booking/cinemas', catalogController.cinemas);
router.get('/api/booking/cinemas/:cinemaId/movies', catalogController.movies);
router.get('/api/booking/showtimes', catalogController.showtimes);
// booking
router.get('/booking/orders/:code/sepay', ...customerOnly, checkoutController.sepayPage);
router.get('/booking/payment/sepay/:code/:result', checkoutController.sepayReturn);

// 2 chọn ghế (auth)
router.get('/booking/showtimes/:id/seats', ...customerOnly, bookingController.seatPage);
router.get('/api/showtimes/:id/seats', ...customerOnly, bookingController.seatMap);
router.post('/api/showtimes/:id/hold', ...customerOnly, bookingController.hold);
router.post('/api/showtimes/:id/release', ...customerOnly, bookingController.release);

// 3-5
router.get('/booking/showtimes/:id/food', ...customerOnly, checkoutController.foodPage);
router.post('/booking/showtimes/:id/food', ...customerOnly, checkoutController.saveFood);
router.get('/booking/showtimes/:id/payment', ...customerOnly, checkoutController.paymentPage);
router.post('/booking/showtimes/:id/promo', ...customerOnly, checkoutController.applyPromo);
router.post('/booking/showtimes/:id/payment', ...customerOnly, checkoutController.pay);
router.get('/booking/orders/:code/confirmation', ...customerOnly, checkoutController.confirmation);
router.post('/booking/orders/:code/email', ...customerOnly, checkoutController.resendTicketMail);

module.exports = router;