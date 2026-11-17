const router = require('express').Router();
const homeController = require('../../controllers/homeController');
const movieController = require('../../controllers/movieController');

// các trang công khai khác (phim, rạp, bảng giá, ưu đãi) thêm vào đây
router.get('/', homeController.index);
router.get('/movies/:id(\\d+)', movieController.detail);

module.exports = router;