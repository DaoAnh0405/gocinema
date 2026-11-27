const service = require('../services/adminOrderService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const { parseId } = require('../validators/adminCatalogValidator');
const {
  ORDER_STATUSES, STATUS_LABELS, CHANNELS, CHANNEL_LABELS, REASON_MAX, normalizeOrderFilters, validateCancel,
} = require('../validators/orderAdminValidator');

const STYLES = ['/css/adminCatalog.css', '/css/adminOrders.css'];

function requireId(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError('Mã đơn không hợp lệ', 404);
  return id;
}

const list = asyncHandler(async (req, res) => {
  const result = await service.list(normalizeOrderFilters(req.query));
  return res.render('pages/admin/orders/index', {
    title: 'Đơn hàng',
    pageStyles: STYLES,
    ...result,
    statuses: ORDER_STATUSES,
    statusLabels: STATUS_LABELS,
    channels: CHANNELS,
    channelLabels: CHANNEL_LABELS,
  });
});

const show = asyncHandler(async (req, res) => {
  const result = await service.detail(requireId(req));
  return res.render('pages/admin/orders/detail', {
    title: `Đơn ${result.order.order_code}`,
    pageStyles: STYLES,
    pageScripts: ['/js/orderAdmin.js'],
    ...result,
    statusLabels: STATUS_LABELS,
    reasonMax: REASON_MAX,
  });
});

const exportCsv = asyncHandler(async (req, res) => {
  const { csv } = await service.toCsv(normalizeOrderFilters(req.query));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="don-hang.csv"');
  return res.send(csv);
});

async function flashRedirect(req, res, type, message, destination) {
  req.flash(type, message);
  await saveSession(req);
  return res.redirect(destination);
}

const cancel = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const back = `/admin/orders/${id}`;
  const { reason, error } = validateCancel(req.body);
  if (error) return flashRedirect(req, res, 'error', error, back);
  try {
    const result = await service.cancel(req.session.user, id, reason);
    return flashRedirect(req, res, 'success', `Đã hủy đơn ${result.order_code}, ghế đã được nhả`, back);
  } catch (err) {
    if (err instanceof AppError && err.status === 409) return flashRedirect(req, res, 'error', err.message, back);
    throw err;
  }
});

module.exports = { list, show, exportCsv, cancel };