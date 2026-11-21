const router = require('express').Router();
const homeController = require('../../controllers/homeController');
const movieController = require('../../controllers/movieController');
const { searchRules } = require('../../validators/searchValidator');

// phim, rạp, ưu đãi, search, chi tiết
router.get('/', homeController.index);
router.get('/movies', searchRules, movieController.search);
router.get('/movies/:id(\\d+)', movieController.detail);

module.exports = router;