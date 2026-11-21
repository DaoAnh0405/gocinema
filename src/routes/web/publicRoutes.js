const router = require('express').Router();
const homeController = require('../../controllers/homeController');
const movieController = require('../../controllers/movieController');
const publicCinemaController = require('../../controllers/publicCinemaController');
const { searchRules } = require('../../validators/searchValidator');

// phim, rạp, (ưu đãi)/chưa có, search, chi tiết
router.get('/', homeController.index);
router.get('/movies', searchRules, movieController.search);
router.get('/movies/now-showing', movieController.nowShowing);
router.get('/movies/coming-soon', movieController.comingSoon);
router.get('/movies/:id(\\d+)', movieController.detail);
router.get('/api/cinemas', publicCinemaController.list);
router.get('/cinemas/:id(\\d+)', publicCinemaController.detail);

module.exports = router;