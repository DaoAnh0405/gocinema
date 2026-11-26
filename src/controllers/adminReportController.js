const reportService = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeReportFilters, presetRanges } = require('../validators/reportValidator');

const index = asyncHandler(async (req, res) => {
  const report = await reportService.build(normalizeReportFilters(req.query));
  const chartData = {
    labels: report.daily.map((row) => `${row.date.slice(8, 10)}/${row.date.slice(5, 7)}`),
    revenue: report.daily.map((row) => row.revenue),
    orders: report.daily.map((row) => row.orders),
    channels: { labels: report.channels.map((row) => row.label), values: report.channels.map((row) => row.revenue) },
    payments: { labels: report.payments.map((row) => row.label), values: report.payments.map((row) => row.amount) },
  };
  return res.render('pages/admin/reports/index', {
    title: 'Thống kê',
    pageStyles: ['/css/adminCatalog.css', '/css/adminReports.css'],
    pageScripts: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js', '/js/reportAdmin.js'],
    ...report,
    chartData,
    presets: presetRanges(),
  });
});

const exportCsv = asyncHandler(async (req, res) => {
  const report = await reportService.build(normalizeReportFilters(req.query));
  const { from, to } = report.filters;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="thong-ke_${from}_${to}.csv"`);
  return res.send(reportService.toCsv(report));
});

module.exports = { index, exportCsv };