const path = require('path');
const express = require('express');
const session = require('express-session');
const layouts = require('express-ejs-layouts');
const request = require('supertest');

jest.mock('../models/adminCatalogModel', () => ({
  listMovies: jest.fn(), listGenres: jest.fn(), findMovieById: jest.fn(),
  createMovie: jest.fn(), updateMovie: jest.fn(), deleteMovie: jest.fn(),
  createGenre: jest.fn(), updateGenre: jest.fn(), deleteGenre: jest.fn(),
}));
jest.mock('../middlewares/posterUpload', () => ({
  ...jest.requireActual('../middlewares/posterUpload'),
  persistPoster: jest.fn(), cleanupManagedPoster: jest.fn(),
}));

const model = require('../models/adminCatalogModel');
const posters = require('../middlewares/posterUpload');
const AppError = require('../utils/AppError');
const viewLocals = require('../middlewares/viewLocals');
const adminRoutes = require('../routes/web/adminRoutes');

const movie = {
  movie_id: 1, title: 'Phim thử nghiệm', description: 'Mô tả', duration: 120,
  release_date: '2026-11-14', end_date: '2026-12-14', director: 'Đạo diễn',
  actors: 'Diễn viên', poster_url: '/images/posters/dune-3.jpg', trailer_url: '',
  age_rating: 'T13', status: 'NOW_SHOWING', genre_ids: [1], genres: 'Hành động',
};
const validMovie = {
  title: 'Phim mới', duration: '100', age_rating: 'P', status: 'COMING_SOON',
  release_date: '2026-12-01', end_date: '2026-12-31', genre_ids: ['1', '2'],
};

function appFor(user = { role: 'ADMIN', email: 'admin@example.test', permissions: ['MANAGE_MOVIES'] }) {
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(layouts);
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', true);
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'catalog-tests-only-not-a-production-secret', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    if (user) req.session.user = user;
    next();
  });
  app.use(viewLocals);
  app.use('/admin', adminRoutes);
  app.use((err, _req, res, _next) => res.status(err.status || 500).send(err.message));
  return app;
}

async function tokenFrom(agent, url = '/admin/movies/new') {
  const response = await agent.get(url).expect(200);
  const match = response.text.match(/name="_csrf" value="([a-f0-9]{64})"/);
  expect(match).not.toBeNull();
  return match[1];
}

beforeEach(() => {
  jest.resetAllMocks();
  model.listGenres.mockResolvedValue([
    { genre_id: 1, genre_name: 'Hành động', movie_count: 1 },
    { genre_id: 2, genre_name: 'Hài', movie_count: 0 },
  ]);
  model.listMovies.mockResolvedValue({
    movies: [movie], filters: { q: '', status: '', genre: '', page: 1 },
    pagination: { page: 1, pageSize: 7, total: 1, totalPages: 1, hasPrevious: false, hasNext: false },
  });
  model.findMovieById.mockResolvedValue(movie);
  model.createMovie.mockResolvedValue(2);
  model.updateMovie.mockResolvedValue({ previousPosterUrl: movie.poster_url });
  model.deleteMovie.mockResolvedValue(movie);
  posters.persistPoster.mockResolvedValue('/images/posters/uploads/00000000-0000-4000-8000-000000000000.jpg');
  posters.cleanupManagedPoster.mockResolvedValue();
});

describe('Admin catalog pages and access control', () => {
  test('requires login', async () => {
    await request(appFor(null)).get('/admin/movies').expect(302).expect('Location', '/login');
    expect(model.listMovies).not.toHaveBeenCalled();
  });
  test.each(['STAFF', 'CUSTOMER'])('denies role %s', async (role) => {
    await request(appFor({ role, permissions: ['MANAGE_MOVIES'] })).get('/admin/genres').expect(403);
    expect(model.listGenres).not.toHaveBeenCalled();
  });
  test('requires movie management permission for reads and writes', async () => {
    const app = appFor({ role: 'ADMIN', email: 'admin@example.test', permissions: [] });
    await request(app).get('/admin/movies').expect(403);
    await request(app).post('/admin/genres').type('form').send({ genre_name: 'Hài' }).expect(403);
    expect(model.createGenre).not.toHaveBeenCalled();
  });
  test('renders movie list with actual dashboard, actions and extracted assets', async () => {
    const response = await request(appFor()).get('/admin/movies?q=Phim&status=NOW_SHOWING&genre=1').expect(200);
    expect(response.text).toContain('Phim thử nghiệm');
    expect(response.text).toContain('gc-dash--admin');
    expect(response.text).toContain('/css/admin-catalog.css');
    expect(response.text).toContain('/js/admin-catalog.js');
    expect(response.text).toContain('/admin/movies/1/edit');
    expect(response.text).toContain('/admin/movies/1/delete');
    expect(model.listMovies).toHaveBeenCalledWith(expect.objectContaining({ q: 'Phim', status: 'NOW_SHOWING', genre: '1' }));
  });
  test('renders empty movie list', async () => {
    model.listMovies.mockResolvedValue({
      movies: [], filters: {}, pagination: { page: 1, pageSize: 7, total: 0, totalPages: 1 },
    });
    const response = await request(appFor()).get('/admin/movies').expect(200);
    expect(response.text).toContain('Không tìm thấy phim phù hợp');
    expect(response.text).toContain('0–0');
  });
  test('renders add form and edit form with retained poster and selected genres', async () => {
    const agent = request.agent(appFor());
    await tokenFrom(agent);
    const edit = await agent.get('/admin/movies/1/edit').expect(200);
    expect(edit.text).toContain('enctype="multipart/form-data"');
    expect(edit.text).toContain('/admin/movies/1/update');
    expect(edit.text).toContain('value="Phim thử nghiệm"');
    expect(edit.text).toContain('name="genre_ids[]" value="1" checked');
    expect(edit.text).toContain('/images/posters/dune-3.jpg');
  });
  test('renders genres with linked deletion disabled', async () => {
    const response = await request(appFor()).get('/admin/genres').expect(200);
    expect(response.text).toContain('Hành động');
    expect(response.text).toContain('disabled aria-describedby=genre-delete-help');
    expect(response.text).toContain('data-genre-editor');
  });
  test('returns 404 for malformed and missing movie IDs', async () => {
    await request(appFor()).get('/admin/movies/not-an-id/edit').expect(404);
    model.findMovieById.mockResolvedValue(null);
    await request(appFor()).get('/admin/movies/999/edit').expect(404);
  });
});

describe('CSRF and submissions', () => {
  test.each([
    '/admin/movies', '/admin/movies/1/update', '/admin/movies/1/delete',
    '/admin/genres', '/admin/genres/1/update', '/admin/genres/1/delete',
  ])('rejects mutations without token: %s', async (url) => {
    await request(appFor()).post(url).type('form').send({ title: 'Không được lưu' }).expect(403);
    expect(model.createMovie).not.toHaveBeenCalled();
    expect(model.updateMovie).not.toHaveBeenCalled();
    expect(model.deleteMovie).not.toHaveBeenCalled();
    expect(model.createGenre).not.toHaveBeenCalled();
    expect(model.updateGenre).not.toHaveBeenCalled();
    expect(model.deleteGenre).not.toHaveBeenCalled();
  });
  test('rejects a wrong token even when length is correct', async () => {
    const agent = request.agent(appFor());
    const token = await tokenFrom(agent);
    const invalid = `${token[0] === 'a' ? 'b' : 'a'}${token.slice(1)}`;
    await agent.post('/admin/genres').type('form').send({ _csrf: invalid, genre_name: 'Mới' }).expect(403);
    expect(model.createGenre).not.toHaveBeenCalled();
  });
  test('creates multipart movie with genre assignments and JPEG poster', async () => {
    const agent = request.agent(appFor());
    const token = await tokenFrom(agent);
    await agent.post('/admin/movies').field('_csrf', token)
      .field('title', validMovie.title).field('duration', validMovie.duration)
      .field('status', validMovie.status).field('age_rating', validMovie.age_rating)
      .field('genre_ids[]', '1').field('genre_ids[]', '2')
      .attach('poster', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]), { filename: 'poster.jpg', contentType: 'image/jpeg' })
      .expect(302).expect('Location', '/admin/movies');
    expect(model.createMovie).toHaveBeenCalledWith(expect.objectContaining({ title: 'Phim mới', genre_ids: [1, 2], poster_url: expect.stringContaining('/uploads/') }));
    expect(posters.persistPoster).toHaveBeenCalledTimes(1);
    const response = await agent.get('/admin/movies').expect(200);
    expect(response.text).toContain('Thêm phim thành công');
  });
  test('retains inputs and reports invalid dates without writing', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent);
    const response = await agent.post('/admin/movies').type('form')
      .send({ ...validMovie, release_date: '2026-02-30', _csrf }).expect(400);
    expect(response.text).toContain('value="Phim mới"');
    expect(response.text).toContain('Ngày phải hợp lệ');
    expect(model.createMovie).not.toHaveBeenCalled();
  });
  test('reports invalid poster inline', async () => {
    const agent = request.agent(appFor());
    const token = await tokenFrom(agent);
    const response = await agent.post('/admin/movies').field('_csrf', token)
      .field('title', 'Phim mới').field('duration', '100').field('age_rating', 'P').field('status', 'COMING_SOON')
      .attach('poster', Buffer.from('not a jpeg'), { filename: 'poster.jpg', contentType: 'image/jpeg' }).expect(400);
    expect(response.text).toContain('Nội dung poster không phải ảnh JPEG hợp lệ');
    expect(posters.persistPoster).not.toHaveBeenCalled();
    expect(model.createMovie).not.toHaveBeenCalled();
  });
  test('updates a movie without replacing poster when no file uploaded', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent);
    await agent.post('/admin/movies/1/update').type('form').send({ ...validMovie, _csrf }).expect(302);
    expect(model.updateMovie).toHaveBeenCalledWith(1, expect.objectContaining({ poster_url: undefined, genre_ids: [1, 2] }));
    expect(posters.cleanupManagedPoster).not.toHaveBeenCalled();
  });
  test('preserves movie on showtime conflict and flashes readable error', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent);
    model.deleteMovie.mockRejectedValue(new AppError('Không thể xóa phim đã có suất chiếu', 409));
    await agent.post('/admin/movies/1/delete').type('form').send({ _csrf }).expect(302);
    const response = await agent.get('/admin/movies').expect(200);
    expect(response.text).toContain('Không thể xóa phim đã có suất chiếu');
    expect(posters.cleanupManagedPoster).not.toHaveBeenCalled();
  });
  test('deletes unreferenced movie', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent);
    await agent.post('/admin/movies/1/delete').type('form').send({ _csrf }).expect(302);
    expect(model.deleteMovie).toHaveBeenCalledWith(1);
    expect(posters.cleanupManagedPoster).toHaveBeenCalledWith(movie.poster_url);
  });
  test('creates, updates and deletes unreferenced genre', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent, '/admin/genres');
    await agent.post('/admin/genres').type('form').send({ _csrf, genre_name: '  Trinh thám  ' }).expect(302);
    expect(model.createGenre).toHaveBeenCalledWith('Trinh thám');
    await agent.post('/admin/genres/2/update').type('form').send({ _csrf, genre_name: 'Hài mới' }).expect(302);
    expect(model.updateGenre).toHaveBeenCalledWith(2, 'Hài mới');
    await agent.post('/admin/genres/2/delete').type('form').send({ _csrf }).expect(302);
    expect(model.deleteGenre).toHaveBeenCalledWith(2);
  });
  test('duplicate genre preserves inline editing name', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent, '/admin/genres');
    const error = new AppError('Tên thể loại đã tồn tại', 409);
    error.field = 'genre_name';
    model.updateGenre.mockRejectedValue(error);
    const response = await agent.post('/admin/genres/2/update').type('form').send({ _csrf, genre_name: 'Hành động' }).expect(409);
    expect(response.text).toContain('Tên thể loại đã tồn tại');
    expect(response.text).toContain('value="Hành động"');
    expect(response.text).toContain('data-genre-editor >');
  });
  test('server refuses deleting a linked genre even if request bypasses disabled button', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent, '/admin/genres');
    model.deleteGenre.mockRejectedValue(new AppError('Không thể xóa thể loại đang có phim', 409));
    const response = await agent.post('/admin/genres/1/delete').type('form').send({ _csrf, genre_name: 'Hành động' }).expect(409);
    expect(response.text).toContain('Không thể xóa thể loại đang có phim');
  });
  test('escapes user-provided text when rendering', async () => {
    const agent = request.agent(appFor());
    const _csrf = await tokenFrom(agent);
    const response = await agent.post('/admin/movies').type('form').send({ ...validMovie, _csrf, title: '<script>alert(1)</script>', duration: '0' }).expect(400);
    expect(response.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(response.text).not.toContain('<script>alert(1)</script>');
  });
});
