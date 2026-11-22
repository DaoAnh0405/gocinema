const router = require('express').Router();
const controller = require('../../controllers/adminFoodController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { uploadFoodImage } = require('../../middlewares/foodUpload');
const { PERMISSION } = require('../../constants');

router.use('/foods', requirePermission(PERMISSION.MANAGE_FOODS), catalogCsrfToken);

router.get('/foods', controller.list);
router.get('/foods/new', controller.newFood);
router.get('/foods/:id/edit', controller.editFood);
// multipart: multer phải chạy trước để đọc được _csrf
router.post('/foods', uploadFoodImage, verifyCatalogCsrf, controller.createFood);
router.post('/foods/:id/update', uploadFoodImage, verifyCatalogCsrf, controller.updateFood);
router.post('/foods/:id/delete', verifyCatalogCsrf, controller.deleteFood);

module.exports = router;