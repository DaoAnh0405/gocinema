const showtimes = require('../models/adminShowtimeModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const {
  parseId, validateShowtime, validateStatus, vietnamDate,
} = require('../validators/adminShowtimeValidator');

const SHOWTIMES_URL = '/admin/showtimes';

function requireId(value) {
  const id = parseId(value);
  if (!id) throw new AppError('Mã suất chiếu không hợp lệ', 404);
  return id;
}

async function requireShowtime(id) {
  const showtime = await showtimes.findById(id);
  if (!showtime) throw new AppError('Không tìm thấy suất chiếu', 404);
  return showtime;
}

function emptyShowtime() {
  return {
    movie_id: '', cinema_id: '', room_id: '', date: vietnamDate(),
    start_time: '', screen_format: '2D', language: 'Phụ đề',
  };
}

function showtimeValues(showtime) {
  return {
    movie_id: String(showtime.movie_id), cinema_id: String(showtime.cinema_id),
    room_id: String(showtime.room_id), date: showtime.show_date,
    start_time: showtime.start_clock,
    screen_format: showtime.screen_format, language: showtime.language,
  };
}

async function renderIndex(req, res, {
  values = emptyShowtime(), errors = [], fieldErrors = {}, modalOpen = false,
  editingId = null, status = 200,
} = {}) {
  const [result, choices] = await Promise.all([showtimes.list(req.query), showtimes.options()]);
  return res.status(status).render('pages/admin/showtimes/index', {
    title: 'Quản lý suất chiếu', ...result, ...choices,
    values, errors, fieldErrors, modalOpen, editingId,
  });
}

function businessFailure(error) {
  return error instanceof AppError && [400, 409].includes(error.status);
}

function addError(result, error) {
  result.fieldErrors = { ...result.fieldErrors, ...(error.fieldErrors || { [error.field || '_form']: error.message }) };
  result.errors = Object.values(result.fieldErrors);
  return result;
}

async function success(req, res, message) {
  req.flash('success', message);
  await saveSession(req);
  return res.redirect(SHOWTIMES_URL);
}

const index = asyncHandler(async (req, res) => {
  if (req.query && req.query.edit !== undefined) {
    const id = requireId(req.query.edit);
    const showtime = await requireShowtime(id);
    return renderIndex(req, res, { values: showtimeValues(showtime), modalOpen: true, editingId: id });
  }
  return renderIndex(req, res, { modalOpen: Boolean(req.query && req.query.new === '1') });
});

async function save(req, res, id = null) {
  if (id !== null) await requireShowtime(id);
  const result = validateShowtime(req.body);
  const form = { ...result, modalOpen: true, editingId: id };
  if (result.errors.length) return renderIndex(req, res, { ...form, status: 400 });
  try {
    if (id === null) await showtimes.create(result.values);
    else await showtimes.update(id, result.values);
  } catch (error) {
    if (!businessFailure(error)) throw error;
    return renderIndex(req, res, { ...form, ...addError(result, error), status: error.status });
  }
  return success(req, res, id === null ? 'Tạo suất chiếu thành công' : 'Cập nhật suất chiếu thành công');
}

const create = asyncHandler(async (req, res) => save(req, res));
const update = asyncHandler(async (req, res) => save(req, res, requireId(req.params.id)));

const remove = asyncHandler(async (req, res) => {
  const id = requireId(req.params.id);
  try {
    await showtimes.remove(id);
  } catch (error) {
    if (!businessFailure(error)) throw error;
    return renderIndex(req, res, {
      errors: [error.message], fieldErrors: error.fieldErrors || { [error.field || '_form']: error.message },
      status: error.status,
    });
  }
  return success(req, res, 'Xóa suất chiếu thành công');
});

const changeStatus = asyncHandler(async (req, res) => {
  const id = requireId(req.params.id);
  const showtime = await requireShowtime(id);
  const result = validateStatus(req.body);
  const values = { ...showtimeValues(showtime), ...result.values };
  if (result.errors.length) return renderIndex(req, res, { ...result, values, status: 400 });
  try {
    await showtimes.changeStatus(id, result.values.status);
  } catch (error) {
    if (!businessFailure(error)) throw error;
    return renderIndex(req, res, { ...addError(result, error), values, status: error.status });
  }
  return success(req, res, 'Cập nhật trạng thái suất chiếu thành công');
});

module.exports = { index, create, update, remove, changeStatus, emptyShowtime, showtimeValues };
