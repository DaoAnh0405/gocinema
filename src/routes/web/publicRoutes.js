const router = require('express').Router();
const homeController = require('../../controllers/homeController');

// các trang công khai khác (phim, rạp, bảng giá, ưu đãi) thêm vào đây
router.get('/', homeController.index);

module.exports = router;