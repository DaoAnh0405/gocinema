const model = require('../models/adminShowtimeModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const { partsOf } = require('../utils/vnTime');
const { parseId } = require('../validators/adminCatalogValidator');
const { normalizeFilters, validateShowtime, FORMATS, LANGUAGES, STATUSES } = require('../validators/adminShowtimeValidator');

const BASE = '/admin/showtimes';

function requireId(raw) {
  const id = parseId(raw);
  if (!id) throw new AppError('Mã suất chiếu không hợp lệ.', 404);
  return id;
}

function pageQuery(filters) {
  const params = new URLSearchParams();
  for (const key of ['date', 'cinema', 'movie', 'status']) if (filters[key] !== '') params.set(key, filters[key]);
  if (filters.page > 1) params.set('page', String(filters.page));
  const value = params.toString();
  return value ? `?${value}` : '';
}

function safeReturnTo(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(`${BASE}?`) && raw !== BASE) return BASE;
  try {
    const url = new URL(raw, 'http://gocinema.local');
    if (url.origin !== 'http://gocinema.local' || url.pathname !== BASE) return BASE;
    return BASE + url.search;
  } catch {
    return BASE;
  }
}

async function renderPage(req, res, { status = 200, errors = [], modalOpen = false, editingId = null, values = null, returnTo: requestedReturnTo = null } = {}) {
  let fallbackQuery = {};
  const rawReturnTo = requestedReturnTo || req.body?._return;
  if (!Object.keys(req.query || {}).length && rawReturnTo) {
    try { fallbackQuery = Object.fromEntries(new URL(safeReturnTo(rawReturnTo), 'http://gocinema.local').searchParams); } catch { /* use empty filters */ }
  }
  const filters = normalizeFilters(Object.keys(req.query || {}).length ? req.query : fallbackQuery);
  const [page, cinemas, movies] = await Promise.all([
    model.listPage(filters.page, filters), model.listCinemas(), model.listMovies(),
  ]);
  filters.page = page.pagination.page;
  const formValues = values || {};
  const cinemaId = parseId(formValues.cinema_id) || '';
  const editingRoomId = editingId && formValues.room_id ? parseId(formValues.room_id) : null;
  const rooms = cinemaId ? await model.listRooms(cinemaId, editingRoomId) : [];
  return res.status(status).render('pages/admin/showtimes/index', {
    title: 'Quản lý Suất chiếu', rows: page.rows, pagination: page.pagination,
    filters, cinemas, movies, rooms, errors, modalOpen, editingId,
    values: formValues, formats: FORMATS, languages: LANGUAGES, statuses: STATUSES,
    returnTo: BASE + pageQuery(filters), pageQuery: pageQuery(filters),
    pageUrl: (number) => BASE + pageQuery({ ...filters, page: number }),
  });
}

const index = asyncHandler((req, res) => renderPage(req, res));

const createForm = asyncHandler((req, res) => renderPage(req, res, {
  modalOpen: true,
  values: { movie_id: '', cinema_id: '', room_id: '', show_date: partsOf().ymd,
    start_time: '18:00', screen_format: '2D', language: 'Phụ đề' },
}));

const editForm = asyncHandler(async (req, res) => {
  const id = requireId(req.params.id);
  const values = await model.findById(id);
  if (!values) throw new AppError('Suất chiếu không tồn tại.', 404);
  return renderPage(req, res, { modalOpen: true, editingId: id, values });
});

const rooms = asyncHandler(async (req, res) => {
  const cinemaId = parseId(req.query.cinemaId);
  if (!cinemaId) return res.status(400).json({ rooms: [] });
  return res.json({ rooms: await model.listRooms(cinemaId) });
});

async function save(req, res, id = null) {
  const result = validateShowtime(req.body);
  const options = { modalOpen: true, editingId: id, values: result.values, returnTo: safeReturnTo(req.body._return) };
  if (result.errors.length) return renderPage(req, res, { ...options, status: 400, errors: result.errors });
  try {
    if (id) await model.update(id, result.values);
    else await model.create(result.values);
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500) throw error;
    return renderPage(req, res, { ...options, status: error.status, errors: [error.message] });
  }
  req.flash('success', id ? 'Cập nhật suất chiếu thành công.' : 'Tạo suất chiếu thành công.');
  await saveSession(req);
  return res.redirect(safeReturnTo(req.body._return));
}

const create = asyncHandler((req, res) => save(req, res));
const update = asyncHandler((req, res) => save(req, res, requireId(req.params.id)));

const changeStatus = asyncHandler(async (req, res) => {
  const id = requireId(req.params.id);
  const next = Number(req.body.status);
  try {
    await model.changeStatus(id, next);
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500) throw error;
    req.flash('error', error.message);
    await saveSession(req);
    return res.redirect(safeReturnTo(req.body._return));
  }
  req.flash('success', next === -1 ? 'Đã hủy suất chiếu.' : next === 0 ? 'Đã đóng suất chiếu.' : 'Đã mở lại suất chiếu.');
  await saveSession(req);
  return res.redirect(safeReturnTo(req.body._return));
});

const remove = asyncHandler(async (req, res) => {
  const id = requireId(req.params.id);
  try {
    await model.remove(id);
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500) throw error;
    req.flash('error', error.message);
    await saveSession(req);
    return res.redirect(safeReturnTo(req.body._return));
  }
  req.flash('success', 'Đã xóa suất chiếu.');
  await saveSession(req);
  return res.redirect(safeReturnTo(req.body._return));
});

module.exports = { index, createForm, editForm, rooms, create, update, changeStatus, remove };
