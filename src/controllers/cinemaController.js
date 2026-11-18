const crypto = require('crypto');
const { validationResult } = require('express-validator');
const model = require('../models/cinemaModel');
const { formats } = require('../validators/cinemaValidator');
const { errorMessages } = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const saveSession = require('../utils/saveSession');
const getPriceAssets = require('../config/priceAssets');

function csrf(req, res, next) {
  if (!req.session.cinemaCsrf) req.session.cinemaCsrf = crypto.randomBytes(32).toString('hex');
  res.locals.cinemaCsrf = req.session.cinemaCsrf;
  if (req.method === 'POST' && req.body._csrf !== req.session.cinemaCsrf) {
    return next(new AppError('Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang.', 403));
  }
  next();
}

function filtersFor(query, rooms) {
  const filters = {
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
    status: ['0', '1'].includes(query.status) ? query.status : '',
  };
  if (rooms) filters.type = formats.includes(query.type) ? query.type : '';
  else filters.city = typeof query.city === 'string' ? query.city.trim().slice(0, 50) : '';
  return filters;
}

function queryString(page, filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== '') params.set(key, value);
  const number = Number(page);
  if (Number.isSafeInteger(number) && number > 1) params.set('page', number);
  return params.size ? `?${params}` : '';
}

function returnUrl(req, rooms) {
  const base = rooms ? `/admin/cinemas/${req.params.cinemaId}/rooms` : '/admin/cinemas';
  return base + queryString(req.query.page, filtersFor(req.query, rooms));
}

function assertIds(req) {
  if (validationResult(req).array().some((error) => error.location === 'params')) {
    throw new AppError('Mã rạp hoặc phòng chiếu không hợp lệ.', 400);
  }
}

async function render(req, res, { rooms = false, status = 200, dialog = null, values = {}, errors = [], editingId = null } = {}) {
  assertIds(req);
  const cinema = rooms ? await model.findCinema(req.params.cinemaId) : null;
  if (rooms && editingId && values.seat_count === undefined) {
    values = { ...values, seat_count: (await model.findRoom(cinema.cinema_id, editingId)).seat_count };
  }
  const filters = filtersFor(req.query, rooms);
  const base = rooms ? `/admin/cinemas/${cinema.cinema_id}/rooms` : '/admin/cinemas';
  const [{ rows, pagination }, cities] = await Promise.all([
    rooms ? model.listRooms(cinema.cinema_id, req.query.page, filters) : model.listCinemas(req.query.page, filters),
    rooms ? Promise.resolve([]) : model.listCities(),
  ]);
  
  return res.status(status).render('pages/admin/cinemas/index', {
    adminModule: true,
    // Sử dụng layout dashboard chung
    moduleClass: 'cinema-app',
    // CSS của chức năng Cinemas
    pageStyles: [
      '/css/pricesTheme.css',
      '/css/prices.css',
      '/css/cinemas.css',
    ],
    // JS của chức năng Cinemas
    pageScripts: [
      '/js/prices.js',
    ],
    title: 'Quản lý Rạp & phòng chiếu',
    rooms,
    cinema,
    rows,
    cities,
    formats,
    filters,
    pagination,
    breadcrumbs: rooms
      ? [
          { label: 'Rạp', href: '/admin/cinemas' },
          { label: cinema.cinema_name },
          { label: 'Phòng chiếu' },
        ]
      : [
          { label: 'Rạp' },
        ],
    base,
    listUrl: base + queryString(pagination.page, filters),
    pageQuery: queryString(pagination.page, filters),
    pageUrl: (page) => base + queryString(page, filters),
    dialog,
    values,
    errors,
    editingId,
    priceAssets: getPriceAssets(),
  });
}

const index = asyncHandler((req, res) => render(req, res));
const roomIndex = asyncHandler((req, res) => render(req, res, { rooms: true }));
const create = asyncHandler((req, res) => render(req, res, { dialog: 'cinema', values: { status: '1' } }));
const createRoom = asyncHandler((req, res) => render(req, res, { rooms: true, dialog: 'room', values: { room_type: '2D', status: '1', row_count: 9, column_count: 8 } }));
const edit = asyncHandler(async (req, res) => {
  assertIds(req);
  return render(req, res, { dialog: 'cinema', editingId: req.params.cinemaId, values: await model.findCinema(req.params.cinemaId) });
});
const editRoom = asyncHandler(async (req, res) => {
  assertIds(req);
  return render(req, res, { rooms: true, dialog: 'room', editingId: req.params.roomId, values: await model.findRoom(req.params.cinemaId, req.params.roomId) });
});

const save = asyncHandler(async (req, res) => {
  assertIds(req);
  const errors = errorMessages(req);
  const options = { dialog: 'cinema', editingId: req.params.cinemaId || null, values: req.body };
  if (errors.length) return render(req, res, { ...options, status: 400, errors });
  try {
    await model.saveCinema({ cinema_name: req.body.cinema_name, address: req.body.address, city: req.body.city,
      phone_number: req.body.phone_number || null, status: Number(req.body.status) }, options.editingId);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return render(req, res, { ...options, status: error.status, errors: [error.message] });
  }
  req.flash('success', options.editingId ? 'Cập nhật rạp thành công.' : 'Thêm rạp thành công.');
  await saveSession(req);
  return res.redirect(returnUrl(req, false));
});

const saveRoom = asyncHandler(async (req, res) => {
  assertIds(req);
  const errors = errorMessages(req);
  const options = { rooms: true, dialog: 'room', editingId: req.params.roomId || null, values: req.body };
  if (errors.length) return render(req, res, { ...options, status: 400, errors });
  try {
    await model.saveRoom(req.params.cinemaId, { room_name: req.body.room_name, room_type: req.body.room_type,
      status: Number(req.body.status) }, options.editingId, { rows: Number(req.body.row_count), columns: Number(req.body.column_count) });
  } catch (error) {
    if (error.code === 'ER_LOCK_DEADLOCK') {
      return render(req, res, { ...options, status: 409, errors: ['Dữ liệu vừa thay đổi. Vui lòng thử lưu lại.'] });
    }
    if (!(error instanceof AppError)) throw error;
    return render(req, res, { ...options, status: error.status, errors: [error.message] });
  }
  req.flash('success', options.editingId ? 'Cập nhật phòng chiếu thành công.' : 'Thêm phòng chiếu thành công.');
  await saveSession(req);
  return res.redirect(returnUrl(req, true));
});

function changeStatus(rooms) {
  return asyncHandler(async (req, res) => {
    if (!validationResult(req).isEmpty()) throw new AppError('Yêu cầu đổi trạng thái không hợp lệ.', 400);
    if (rooms) await model.setRoomStatus(req.params.cinemaId, req.params.roomId, Number(req.body.status));
    else await model.setCinemaStatus(req.params.cinemaId, Number(req.body.status));
    req.flash('success', 'Đã cập nhật trạng thái.');
    await saveSession(req);
    return res.redirect(returnUrl(req, rooms));
  });
}

const seats = asyncHandler(async (req, res) => {
  assertIds(req);
  const cinema = await model.findCinema(req.params.cinemaId);
  const { room, seats, version, pairs } = await model.readLayout(cinema.cinema_id, req.params.roomId);
  const types = await model.listSeatTypes();
  const positions = new Map(seats.map((seat) => [`${seat.seat_row}:${seat.seat_number}`, seat]));
  const layout = { rows: room.row_count || 9, columns: room.column_count || 8, pairs };
  layout.cells = Array.from({ length: layout.rows }, (_, row) => Array.from({ length: layout.columns }, (_, column) =>
    positions.get(`${model.rowLabel(row + 1)}:${column + 1}`)?.seat_type_id || 0));
  const base = `/admin/cinemas/${cinema.cinema_id}/rooms`;
  
  return res.render('pages/admin/cinemas/seats', {
    adminModule: true,
    moduleClass: 'cinema-app',
    pageStyles: [
      '/css/pricesTheme.css',
      '/css/prices.css',
      '/css/cinemas.css',
    ],
    pageScripts: [
      '/js/seat-pairs.js',
      '/js/seat-editor.js',
    ],
    title: 'Quản lý Rạp & phòng chiếu',
    cinema,
    room,
    seatLayout: layout,
    types,
    version,
    base,
    breadcrumbs: [
      { label: 'Rạp', href: '/admin/cinemas' },
      { label: cinema.cinema_name, href: base },
      { label: room.room_name, href: base },
      { label: 'Ghế' },
    ],
    priceAssets: getPriceAssets(),
  });
});

const saveSeats = asyncHandler(async (req, res) => {
  assertIds(req);
  try {
    const version = await model.saveLayout(req.params.cinemaId, req.params.roomId, req.body.layout, req.body.version);
    if (req.accepts(['html', 'json']) === 'json') return res.json({ version, message: 'Đã lưu sơ đồ ghế.' });
    req.flash('success', 'Đã lưu sơ đồ ghế.');
    await saveSession(req);
    return res.redirect(`/admin/cinemas/${req.params.cinemaId}/rooms/${req.params.roomId}/seats`);
  } catch (error) {
    if (error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_ROW_IS_REFERENCED_2') {
      error = new AppError('Dữ liệu ghế vừa thay đổi. Hãy tải lại trang và kiểm tra sơ đồ.', 409);
    }
    if (!(error instanceof AppError)) throw error;
    if (req.accepts(['html', 'json']) === 'json') return res.status(error.status).json({ message: error.message });
    throw error;
  }
});

module.exports = { csrf, index, roomIndex, create, createRoom, edit, editRoom, save, saveRoom, seats, saveSeats,
  changeStatus: changeStatus(false), changeRoomStatus: changeStatus(true) };
