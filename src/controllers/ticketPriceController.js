const crypto = require('crypto');
const { validationResult } = require('express-validator');
const prices = require('../models/ticketPriceModel');
const { formats, dayLabels } = require('../validators/ticketPriceValidator');
const { errorMessages } = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const saveSession = require('../utils/saveSession');
const getPriceAssets = require('../config/priceAssets');

function readFilters(query) {
  return {
    seat: typeof query.seat === 'string' && /^[1-9]\d{0,9}$/.test(query.seat) ? query.seat : '',
    format: formats.includes(query.format) ? query.format : '',
    day: Object.keys(dayLabels).includes(query.day) ? query.day : '',
  };
}

function queryString(page, filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const number = Number(page);
  if (Number.isSafeInteger(number) && number > 1) params.set('page', number);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function listUrl(page, filters) {
  return '/admin/prices' + queryString(page, filters);
}

function csrf(req, res, next) {
  if (!req.session.priceCsrf) req.session.priceCsrf = crypto.randomBytes(32).toString('hex');
  res.locals.priceCsrf = req.session.priceCsrf;
  if (req.method === 'POST' && req.body._csrf !== req.session.priceCsrf) {
    return next(new AppError('Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang.', 403));
  }
  next();
}

async function render(req, res, { status = 200, errors = [], values = {}, dialog = null, editingId = null } = {}) {
  const filters = readFilters(req.query);
  const [{ rows, pagination }, seatTypes] = await Promise.all([prices.listPage(req.query.page, filters), prices.listSeatTypes()]);
  
  return res.status(status).render('pages/admin/prices/index', {
    adminModule: true,
    moduleClass: 'prices-app',
    pageStyles: [
      '/css/pricesTheme.css',
      '/css/prices.css',
    ],
    pageScripts: [
      '/js/prices.js',
    ],
    title: 'Quản lý Giá vé',
    rows,
    seatTypes,
    formats,
    dayLabels,
    errors,
    values,
    dialog,
    editingId,
    priceAssets: getPriceAssets(),
    pagination,
    filters,
    listUrl: listUrl(pagination.page, filters),
    pageQuery: queryString(pagination.page, filters),
    pageUrl: (page) => listUrl(page, filters),
  });
}

const index = asyncHandler((req, res) => render(req, res));
const create = asyncHandler((req, res) => render(req, res, {
  dialog: 'form', values: { screen_format: '2D', day_type: 'WEEKDAY', time_from: '00:00:00', time_to: '23:59:59' },
}));

function showRecord(dialog) {
  return asyncHandler(async (req, res) => {
    if (!validationResult(req).isEmpty()) throw new AppError('Mã mức giá không hợp lệ.', 400);
    return render(req, res, { dialog, editingId: req.params.id, values: await prices.findById(req.params.id) });
  });
}

const save = asyncHandler(async (req, res) => {
  const editingId = req.params.id || null;
  const errors = errorMessages(req);
  const options = { values: req.body, dialog: 'form', editingId };
  if (errors.length) return render(req, res, { ...options, status: 400, errors });
  const values = {
    seat_type_id: Number(req.body.seat_type_id), price: Number(req.body.price),
    screen_format: req.body.screen_format, day_type: req.body.day_type,
    time_from: req.body.time_from || null, time_to: req.body.time_to || null,
    valid_from: req.body.valid_from || null, valid_to: req.body.valid_to || null,
  };
  try {
    await prices.save(values, editingId);
  } catch (error) {
    if (error.code === 'ER_LOCK_DEADLOCK') {
      return render(req, res, { ...options, status: 409, errors: ['Dữ liệu vừa được cập nhật. Vui lòng thử lưu lại.'] });
    }
    if (!(error instanceof AppError)) throw error;
    return render(req, res, { ...options, status: error.status, errors: [error.message] });
  }
  req.flash('success', editingId ? 'Cập nhật đơn giá vé thành công.' : 'Thêm mức giá vé thành công.');
  await saveSession(req);
  return res.redirect(listUrl(req.query.page, readFilters(req.query)));
});

const remove = asyncHandler(async (req, res) => {
  if (!validationResult(req).isEmpty()) throw new AppError('Mã mức giá không hợp lệ.', 400);
  await prices.remove(req.params.id);
  req.flash('success', 'Đã xóa mức giá vé.');
  await saveSession(req);
  return res.redirect(listUrl(req.query.page, readFilters(req.query)));
});

module.exports = { csrf, index, create, edit: showRecord('form'), confirmDelete: showRecord('delete'), save, remove };
