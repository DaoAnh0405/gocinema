const express = require('express');
const router = express.Router();
const foodController = require('../controllers/foodController');
const uploadFood = require('../middlewares/uploadFood');
const { validateFoodPayload } = require('../validators/foodValidator');
const { requireLogin, requireRole } = require('../middlewares/auth');
const { ROLE } = require('../constants');

router.use(requireLogin, requireRole(ROLE.ADMIN));

router.get('/', foodController.getFoods);
router.post('/', uploadFood.single('image'), validateFoodPayload, foodController.createFood);
router.put('/:id', uploadFood.single('image'), validateFoodPayload, foodController.updateFood);
router.delete('/:id', foodController.deleteFood);

module.exports = router;