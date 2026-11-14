const express = require('express');
const router = express.Router();
const foodController = require('../controllers/foodController');
const uploadFood = require('../middlewares/uploadFood');
const { validateFoodPayload } = require('../validators/foodValidator');

// Route giao diện Web
router.get('/admin/foods', foodController.renderAdminPage);

// Route REST API
router.get('/api/foods', foodController.getFoods);
router.post('/api/foods', uploadFood.single('image'), validateFoodPayload, foodController.createFood);
router.put('/api/foods/:id', uploadFood.single('image'), validateFoodPayload, foodController.updateFood);
router.delete('/api/foods/:id', foodController.deleteFood);

module.exports = router;