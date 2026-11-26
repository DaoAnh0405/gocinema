const router = require('express').Router();
const controller = require('../../controllers/adminReportController');
const { requirePermission } = require('../../middlewares/permission');
const { PERMISSION } = require('../../constants');

// chỉ đọc (GET) nên không cần CSRF
router.use('/reports', requirePermission(PERMISSION.VIEW_REPORTS));

router.get('/reports', controller.index);
router.get('/reports/export.csv', controller.exportCsv);

module.exports = router;