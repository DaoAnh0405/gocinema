const router = require('express').Router();

router.get('/ping', (_req, res) => res.json({ success: true, message: 'pong' }));

module.exports = router;