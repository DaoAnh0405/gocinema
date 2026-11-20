const path = require('path');
const express = require('express');
const session = require('express-session');
const layouts = require('express-ejs-layouts');
const request = require('supertest');

jest.mock('../config/db', () => ({ query: jest.fn(), withTransaction: jest.fn() }));
jest.mock('../models/adminShowtimeModel', () => ({
  list: jest.fn(), options: jest.fn(), findById: jest.fn(),
  create: jest.fn(), update: jest.fn(), remove: jest.fn(), changeStatus: jest.fn(),
}));

const model = require('../models/adminShowtimeModel');
const AppError = require('../utils/AppError');
const viewLocals = require('../middlewares/viewLocals');
const adminRoutes = require('../routes/web/adminRoutes');
const validator = require('../validators/adminShowtimeValidator');

const record = {
  showtime_id: 10, movie_id: 1, cinema_id: 2, room_id: 3,
  title: 'Phim suất chiếu', cinema_name: 'GoCinema Nhơn', room_name: 'Phòng 01',
  show_date: '2099-11-20', start_clock: '18:30', film_end_clock: '20:30', film_end_date: '2099-11-20',
  end_clock: '20:45', end_date: '2099-11-20', status: 1, screen_format: '2D', language: 'Phụ đề',
  sold_count: 15, total_count: 72,
};
const valid = {
  movie_id: '1', cinema_id: '2', room_id: '3', date: '2099-11-20',
  start_time: '18:30', screen_format: '2D', language: 'Phụ đề',
};
const choices = {
  movies: [{ movie_id: 1, title: 'Phim suất chiếu', status: 'NOW_SHOWING' }],
  cinemas: [{ cinema_id: 2, cinema_name: 'GoCinema Nhơn', status: 1 }],
  rooms: [{ room_id: 3, cinema_id: 2, room_name: 'Phòng 01', room_type: '2D', status: 1, seat_count: 72 }],
};

function appFor(user = { role: 'ADMIN', email: 'admin@example.test', permissions: ['MANAGE_SHOWTIMES'] }) {
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(layouts);
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', true);
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'showtime-route-tests-only-not-for-deployment', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    if (user) req.session.user = user;
    next();
  });
  app.use(viewLocals);
  app.use('/admin', adminRoutes);
  app.use((err, _req, res, _next) => res.status(err.status || 500).send(err.message));
  return app;
}

async function csrf(agent) {
  const response = await agent.get('/admin/showtimes?new=1').expect(200);
  const match = response.text.match(/name="_csrf" value="([a-f0-9]{64})"/);
  expect(match).not.toBeNull();
  return match[1];
}

beforeEach(() => {
  jest.resetAllMocks();
  model.list.mockImplementation(async (input) => ({
    showtimes: [{ ...record }], filters: validator.normalizeFilters(input),
    pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasPrevious: false, hasNext: false },
  }));
  model.options.mockResolvedValue(choices);
  model.findById.mockResolvedValue({ ...record });
  model.create.mockResolvedValue(11);
  model.update.mockResolvedValue(10);
  model.remove.mockResolvedValue(10);
  model.changeStatus.mockResolvedValue(10);
});

describe('showtime admin access and rendered pages', () => {
  test('anonymous users must log in', async () => {
    await request(appFor(null)).get('/admin/showtimes').expect(302).expect('Location', '/login');
    expect(model.list).not.toHaveBeenCalled();
  });
  test.each(['STAFF', 'CUSTOMER'])('rejects role %s', async (role) => {
    await request(appFor({ role, permissions: ['MANAGE_SHOWTIMES'] })).get('/admin/showtimes').expect(403);
    expect(model.list).not.toHaveBeenCalled();
  });
  test('MANAGE_MOVIES alone is insufficient', async () => {
    const app = appFor({ role: 'ADMIN', email: 'admin@example.test', permissions: ['MANAGE_MOVIES'] });
    await request(app).get('/admin/showtimes').expect(403);
    await request(app).post('/admin/showtimes').type('form').send(valid).expect(403);
    expect(model.create).not.toHaveBeenCalled();
  });
  test('showtime permission works independently of movie-management permission', async () => {
    const response = await request(appFor()).get('/admin/showtimes').expect(200);
    expect(response.text).toContain('Quản lý suất chiếu');
    expect(response.text).toContain('gc-dash--admin');
    expect(response.text).toContain('Phim suất chiếu');
    expect(response.text).toContain('15/72');
    expect(response.text).toContain('18:30 – 20:30');
    expect(response.text).toContain('20/11/2099');
    expect(response.text).toContain('/css/admin-showtimes.css');
    expect(response.text).toContain('/js/admin-showtimes.js');
    expect(response.text).not.toContain('data-showtimes-editor');
  });
  test('preserves date, cinema, movie and status filters including closed status 0', async () => {
    const response = await request(appFor()).get('/admin/showtimes?date=2099-11-20&cinema=2&movie=1&status=0').expect(200);
    expect(model.list).toHaveBeenCalledWith(expect.objectContaining({ date: '2099-11-20', cinema: '2', movie: '1', status: '0' }));
    expect(response.text).toContain('value="0" selected');
    expect(response.text).toContain('date=2099-11-20&amp;cinema=2&amp;movie=1&amp;status=0');
  });
  test('renders empty list and no unnecessary pagination', async () => {
    model.list.mockResolvedValue({
      showtimes: [], filters: {}, pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    });
    const response = await request(appFor()).get('/admin/showtimes').expect(200);
    expect(response.text).toContain('Không tìm thấy suất chiếu phù hợp');
    expect(response.text).toContain('0–0');
    expect(response.text).not.toContain('aria-label="Phân trang suất chiếu"');
  });
  test('create link renders dialog with date and dependent room attributes', async () => {
    const response = await request(appFor()).get('/admin/showtimes?new=1').expect(200);
    expect(response.text).toContain('open data-showtimes-editor');
    expect(response.text).toContain('action="/admin/showtimes" data-showtimes-form');
    expect(response.text).toContain('data-cinema-id="2" data-room-type="2D"');
    expect(response.text).toContain('type="date"');
    expect(response.text).toContain('type="time"');
  });
  test('edit dialog preserves current choices', async () => {
    const response = await request(appFor()).get('/admin/showtimes?edit=10').expect(200);
    expect(model.findById).toHaveBeenCalledWith(10);
    expect(response.text).toContain('Sửa suất chiếu');
    expect(response.text).toContain('action="/admin/showtimes/10/update"');
    expect(response.text).toContain('value="18:30"');
    expect(response.text).toContain('value="2099-11-20"');
  });
  test('missing showtime and malformed edit ID return 404', async () => {
    await request(appFor()).get('/admin/showtimes?edit=bad').expect(404);
    model.findById.mockResolvedValue(null);
    await request(appFor()).get('/admin/showtimes?edit=999').expect(404);
  });
  test('unknown submitted selection remains visible on invalid form', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    const response = await agent.post('/admin/showtimes').type('form').send({ ...valid, movie_id: '999', start_time: '25:00', _csrf }).expect(400);
    expect(response.text).toContain('999 (không hợp lệ)');
  });
});

describe('showtime mutations and CSRF', () => {
  test.each(['/admin/showtimes', '/admin/showtimes/10/update', '/admin/showtimes/10/delete', '/admin/showtimes/10/status'])(
    'rejects missing CSRF token: %s', async (url) => {
      await request(appFor()).post(url).type('form').send({ ...valid, status: '-1' }).expect(403);
      expect(model.create).not.toHaveBeenCalled();
      expect(model.update).not.toHaveBeenCalled();
      expect(model.remove).not.toHaveBeenCalled();
      expect(model.changeStatus).not.toHaveBeenCalled();
    },
  );
  test('rejects an invalid token', async () => {
    const agent = request.agent(appFor());
    await csrf(agent);
    await agent.post('/admin/showtimes').type('form').send({ ...valid, _csrf: 'incorrect' }).expect(403);
    expect(model.create).not.toHaveBeenCalled();
  });
  test('creates showtime and persists success flash across redirect', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    await agent.post('/admin/showtimes').type('form').send({ ...valid, _csrf }).expect(302).expect('Location', '/admin/showtimes');
    expect(model.create).toHaveBeenCalledWith(valid);
    const response = await agent.get('/admin/showtimes').expect(200);
    expect(response.text).toContain('Tạo suất chiếu thành công');
  });
  test('invalid date/time keeps modal open and preserves fields without write', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    const response = await agent.post('/admin/showtimes').type('form')
      .send({ ...valid, date: '2099-02-30', start_time: '24:01', _csrf }).expect(400);
    expect(response.text).toContain('open data-showtimes-editor');
    expect(response.text).toContain('2099-02-30');
    expect(response.text).toContain('Giờ chiếu phải hợp lệ');
    expect(model.create).not.toHaveBeenCalled();
  });
  test('overlap error stays in the dialog and highlights start time', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    const error = new AppError('Lịch chiếu bị trùng, bao gồm 15 phút dọn phòng', 409);
    error.field = 'start_time';
    model.create.mockRejectedValue(error);
    const response = await agent.post('/admin/showtimes').type('form').send({ ...valid, _csrf }).expect(409);
    expect(response.text).toContain('open data-showtimes-editor');
    expect(response.text).toContain('Lịch chiếu bị trùng');
    expect(response.text).toContain('id="showtimes-error-start_time"');
  });
  test('updates valid showtime', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    await agent.post('/admin/showtimes/10/update').type('form').send({ ...valid, _csrf }).expect(302);
    expect(model.update).toHaveBeenCalledWith(10, valid);
  });
  test('model validation errors retain edit action and fields', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    const error = new AppError('Phòng không hợp lệ', 400);
    error.fieldErrors = { room_id: 'Phòng chiếu không thuộc rạp đã chọn' };
    model.update.mockRejectedValue(error);
    const response = await agent.post('/admin/showtimes/10/update').type('form').send({ ...valid, _csrf }).expect(400);
    expect(response.text).toContain('/admin/showtimes/10/update');
    expect(response.text).toContain('Phòng chiếu không thuộc rạp đã chọn');
    expect(response.text).toContain('open data-showtimes-editor');
  });
  test('safe delete redirects successfully', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    await agent.post('/admin/showtimes/10/delete').type('form').send({ _csrf }).expect(302);
    expect(model.remove).toHaveBeenCalledWith(10);
  });
  test('deletion conflict is displayed outside editor', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    model.remove.mockRejectedValue(new AppError('Suất chiếu đã có vé', 409));
    const response = await agent.post('/admin/showtimes/10/delete').type('form').send({ _csrf }).expect(409);
    expect(response.text).toContain('Suất chiếu đã có vé');
    expect(response.text).not.toContain('data-showtimes-editor');
  });
  test.each(['1', '0', '-1'])('changes status to %s with CSRF', async (status) => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    await agent.post('/admin/showtimes/10/status').type('form').send({ _csrf, status }).expect(302);
    expect(model.changeStatus).toHaveBeenCalledWith(10, status);
  });
  test('invalid status does not call model write', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    const response = await agent.post('/admin/showtimes/10/status').type('form').send({ _csrf, status: '999' }).expect(400);
    expect(response.text).toContain('Trạng thái suất chiếu không hợp lệ');
    expect(model.changeStatus).not.toHaveBeenCalled();
  });
  test('cancellation with tickets returns readable refusal', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    model.changeStatus.mockRejectedValue(new AppError('Không thể hủy suất chiếu đã có vé', 409));
    const response = await agent.post('/admin/showtimes/10/status').type('form').send({ _csrf, status: '-1' }).expect(409);
    expect(response.text).toContain('Không thể hủy suất chiếu đã có vé');
  });
  test('invalid mutation ID returns 404 after CSRF', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    await agent.post('/admin/showtimes/bad/update').type('form').send({ ...valid, _csrf }).expect(404);
    expect(model.update).not.toHaveBeenCalled();
  });
  test('unexpected DB failure is not reported as success', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    model.create.mockRejectedValue(new Error('Database unavailable'));
    await agent.post('/admin/showtimes').type('form').send({ ...valid, _csrf }).expect(500);
  });
  test('escapes submitted strings in preserved invalid fields', async () => {
    const agent = request.agent(appFor());
    const _csrf = await csrf(agent);
    const response = await agent.post('/admin/showtimes').type('form').send({ ...valid, language: '<script>alert(1)</script>', _csrf }).expect(400);
    expect(response.text).not.toContain('<script>alert(1)</script>');
    expect(response.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
