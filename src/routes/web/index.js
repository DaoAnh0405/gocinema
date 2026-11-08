const router = require('express').Router();
const { pool } = require('../../config/db');
const asyncHandler = require('../../utils/asyncHandler');

router.get('/', (_req, res) => {
  res.render('pages/public/home', { title: 'Trang chủ' });
});

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let db = 'up';
    try {
      await pool.query('SELECT 1');
    } catch {
      db = 'down';
    }
    res.json({ status: 'ok', db, time: new Date().toISOString() });
  }),
);

module.exports = router;