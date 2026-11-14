const router = require('express').Router();

router.get('/ping', (_req, res) => res.json({ success: true, message: 'pong' }));
router.use('/foods', require('../foodRoutes'));

module.exports = router;