jest.mock('../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('crypto', () => ({ randomUUID: jest.fn() }));

// Exercise middleware callbacks without opening an HTTP server or parsing real uploads.
jest.mock('multer', () => {
  const multer = jest.fn(() => ({ single: jest.fn(() => jest.fn()) }));
  multer.memoryStorage = jest.fn(() => ({}));
  multer.MulterError = class MulterError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  };
  return multer;
});

const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const multer = require('multer');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const validator = require('../validators/adminCatalogValidator');
const catalog = require('../models/adminCatalogModel');
const posters = require('../middlewares/posterUpload');

const uploadOptions = multer.mock.calls[0][0];
const singlePoster = multer.mock.results[0].value.single;
const receivePoster = singlePoster.mock.results[0].value;
const UUID = '12345678-1234-4234-8234-123456789abc';
const POSTER_URL = `/images/posters/uploads/${UUID}.jpg`;
const UPLOAD_DIRECTORY = path.join(__dirname, '../../public/images/posters/uploads');
const POSTER_PATH = path.join(UPLOAD_DIRECTORY, `${UUID}.jpg`);

function movieInput(overrides = {}) {
  return {
    title: ' Example movie ', description: '', duration: '120',
    release_date: '2024-02-29', end_date: '2024-03-01',
    director: '', actors: '', trailer_url: '', age_rating: 'P',
    status: 'COMING_SOON', genre_ids: ['3', '1'], ...overrides,
  };
}

function savedMovie(overrides = {}) {
  return { ...validator.validateMovie(movieInput()).values, poster_url: POSTER_URL, ...overrides };
}

function jpeg(overrides = {}) {
  return {
    originalname: 'poster.jpg', mimetype: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), ...overrides,
  };
}

let connection;
beforeEach(() => {
  db.query.mockReset();
  db.withTransaction.mockReset();
  connection = { query: jest.fn() };
  // Model tests verify use of one transaction connection, not the DB helper's rollback logic.
  db.withTransaction.mockImplementation((callback) => callback(connection));
  fs.mkdir.mockReset().mockResolvedValue(undefined);
  fs.writeFile.mockReset().mockResolvedValue(undefined);
  fs.unlink.mockReset().mockResolvedValue(undefined);
  randomUUID.mockReset().mockReturnValue(UUID);
  receivePoster.mockReset().mockImplementation((_req, _res, callback) => callback());
});

describe('admin catalog validators', () => {
  test('normalizes a valid movie without accepting a client-owned poster path', () => {
    const result = validator.validateMovie(movieInput({
      duration: ' 120 ', genre_ids: ['3', 1], poster_url: POSTER_URL,
    }));
    expect(result.errors).toEqual([]);
    expect(result.values).toMatchObject({ title: 'Example movie', duration: '120', genre_ids: [3, 1] });
    expect(result.values).not.toHaveProperty('poster_url');
  });

  test.each(['2000-02-29', '2024-02-29', '2025-04-30', '1000-01-01', '9999-12-31'])(
    'accepts real date %s', (date) => {
      expect(validator.isRealDate(date)).toBe(true);
      expect(validator.validateMovie(movieInput({ release_date: date, end_date: date })).errors).toEqual([]);
    },
  );

  test.each(['1900-02-29', '2025-02-29', '2024-04-31', '2024-00-10', '2024-13-01',
    '2024-01-00', '0999-12-31', '2024-2-01', '2024-01-01T00:00:00Z', 20240101, null])(
    'rejects invalid date %p', (date) => {
      expect(validator.isRealDate(date)).toBe(false);
    },
  );

  test.each(['release_date', 'end_date'])('reports invalid %s on the form', (field) => {
    expect(validator.validateMovie(movieInput({ [field]: '2025-02-30' })).fieldErrors[field]).toBeTruthy();
  });

  test('allows optional dates and rejects an end date before release', () => {
    expect(validator.validateMovie(movieInput({ release_date: '', end_date: '' })).errors).toEqual([]);
    expect(validator.validateMovie(movieInput({ end_date: '2024-02-28' })).fieldErrors.end_date).toBeTruthy();
  });

  test.each([1, '1', '2147483647', 2147483647])('accepts positive SQL integer %p', (id) => {
    expect(validator.parseId(id)).toBe(Number(id));
    expect(validator.validateMovie(movieInput({ duration: id })).errors).toEqual([]);
  });

  test.each([0, '0', -1, '-1', '1.5', 1.5, '1e2', '1 OR 1=1', '1;DROP TABLE movies',
    '2147483648', '', ' 1 ', null, undefined, true, [], {}, NaN, Infinity])(
    'rejects invalid id %p', (id) => {
      expect(validator.parseId(id)).toBeNull();
    },
  );

  test.each([0, -1, '1.5', '1e2', '2147483648', '', null, true, [], {}])(
    'rejects invalid duration %p', (duration) => {
      expect(validator.validateMovie(movieInput({ duration })).fieldErrors.duration).toBeTruthy();
    },
  );

  test.each(['COMING_SOON', 'NOW_SHOWING', 'ENDED'])('accepts status %s', (status) => {
    expect(validator.validateMovie(movieInput({ status })).errors).toEqual([]);
  });

  test.each(['', 'now_showing', 'DELETED', "ENDED' OR 1=1", [], 1])('rejects status %p', (status) => {
    expect(validator.validateMovie(movieInput({ status })).fieldErrors.status).toBeTruthy();
  });

  test.each(['P', 'T13', 'T16', 'T18'])('accepts age rating %s', (age_rating) => {
    expect(validator.validateMovie(movieInput({ age_rating })).errors).toEqual([]);
  });

  test('rejects unknown age ratings', () => {
    expect(validator.validateMovie(movieInput({ age_rating: 'R' })).fieldErrors.age_rating).toBeTruthy();
  });

  test.each(['https://example.com/watch?v=123', 'http://example.com/trailer', ''])(
    'accepts trailer URL %s', (trailer_url) => {
      expect(validator.validateMovie(movieInput({ trailer_url })).errors).toEqual([]);
    },
  );

  test.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
    '//example.com/video', '/trailer', 'ftp://example.com/video',
    'https://example.com/" onload="alert(1)', 'https://example.com/\nvideo',
    'https://example.com/\\evil', '<iframe src="https://example.com"></iframe>'])(
    'rejects unsafe or malformed trailer %p', (trailer_url) => {
      expect(validator.validateMovie(movieInput({ trailer_url })).fieldErrors.trailer_url).toBeTruthy();
    },
  );

  test('validates required and length-limited movie text, including UTF-8 bytes', () => {
    for (const [field, max] of [['title', 200], ['director', 100], ['actors', 500]]) {
      expect(validator.validateMovie(movieInput({ [field]: 'a'.repeat(max) })).errors).toEqual([]);
      expect(validator.validateMovie(movieInput({ [field]: 'a'.repeat(max + 1) })).fieldErrors[field]).toBeTruthy();
    }
    expect(validator.validateMovie(movieInput({ title: '  ' })).fieldErrors.title).toBeTruthy();
    expect(validator.validateMovie(movieInput({ title: ['title'] })).fieldErrors.title).toBeTruthy();
    expect(validator.validateMovie(movieInput({ description: 'a'.repeat(65535) })).errors).toEqual([]);
    expect(validator.validateMovie(movieInput({ description: 'a'.repeat(65536) })).fieldErrors.description).toBeTruthy();
    expect(validator.validateMovie(movieInput({ description: 'é'.repeat(32768) })).fieldErrors.description).toBeTruthy();
    expect(validator.validateMovie(movieInput({ trailer_url: `https://example.com/${'a'.repeat(240)}` })).fieldErrors.trailer_url).toBeTruthy();
  });

  test.each(['a'.repeat(50), '🎬'.repeat(50)])('counts genre names by Unicode characters', (genre_name) => {
    expect(validator.validateGenre({ genre_name }).errors).toEqual([]);
    expect(validator.validateGenre({ genre_name: `${genre_name}a` }).fieldErrors.genre_name).toBeTruthy();
  });

  test('trims genre names and rejects empty or non-text names', () => {
    expect(validator.validateGenre({ genre_name: ' Drama ' }).values.genre_name).toBe('Drama');
    for (const input of [undefined, null, {}, { genre_name: ' ' }, { genre_name: [] }, { genre_name: 42 }]) {
      expect(validator.validateGenre(input).fieldErrors.genre_name).toBeTruthy();
    }
  });

  test('normalizes single/legacy genre selection and allows no genres', () => {
    expect(validator.validateMovie(movieInput({ genre_ids: '3' })).values.genre_ids).toEqual([3]);
    expect(validator.validateMovie(movieInput({ genre_ids: undefined, genres: ['2'] })).values.genre_ids).toEqual([2]);
    expect(validator.validateMovie(movieInput({ genre_ids: '' })).errors).toEqual([]);
    expect(validator.validateMovie(movieInput({ genre_ids: [] })).values.genre_ids).toEqual([]);
  });

  test.each([['1', 1], ['0'], ['2147483648'], ['1 OR 1=1'], [{}]])(
    'rejects invalid or duplicate genre ids %p', (...genre_ids) => {
      expect(validator.validateMovie(movieInput({ genre_ids })).fieldErrors.genre_ids).toBeTruthy();
    },
  );

  test('bounds genre selections at 50', () => {
    const genre_ids = Array.from({ length: 50 }, (_, index) => String(index + 1));
    expect(validator.validateMovie(movieInput({ genre_ids })).errors).toEqual([]);
    const result = validator.validateMovie(movieInput({ genre_ids: [...genre_ids, '51'] }));
    expect(result.fieldErrors.genre_ids).toBeTruthy();
    expect(result.values.genre_ids).toHaveLength(50);
  });

  test.each(['/images/posters/example.jpg', '/images/posters/uploads/example.JPEG'])(
    'accepts safe poster URL %s', (url) => expect(validator.isSafePosterUrl(url)).toBe(true),
  );

  test.each(['https://example.com/poster.jpg', '/images/posters/../secret.jpg',
    '/images/posters/uploads/a.jpg?x=1', '/images/posters/a.svg', '//evil/poster.jpg', null])(
    'rejects unsafe poster URL %p', (poster_url) => {
      expect(validator.isSafePosterUrl(poster_url)).toBe(false);
      if (poster_url !== null) {
        expect(validator.validateMovie(movieInput({ poster_url })).fieldErrors.poster).toBeTruthy();
      }
    },
  );

  test('normalizes untrusted filters and caps search by Unicode characters', () => {
    expect(validator.normalizeMovieFilters({ q: ['bad'], status: 'INVALID', genre: '1 OR 1=1', page: '-1' }))
      .toEqual({ q: '', status: '', genre: '', page: 1 });
    expect(validator.normalizeMovieFilters({ q: ` ${'🎬'.repeat(201)} `, status: 'ENDED', genre: '2', page: '3' }))
      .toEqual({ q: '🎬'.repeat(200), status: 'ENDED', genre: 2, page: 3 });
  });
});

describe('admin catalog model queries', () => {
  test('parameterizes search, literal LIKE wildcards, status, genre and pagination', async () => {
    const q = "50%_!'; DROP TABLE movies; --";
    const movies = [{ movie_id: 8, title: 'Result' }];
    db.query.mockResolvedValueOnce([{ total: '15' }]).mockResolvedValueOnce(movies);
    const result = await catalog.listMovies({ q, status: 'NOW_SHOWING', genre: '3', page: '2' });
    const params = ["%50!%!_!!'; DROP TABLE movies; --%", 'NOW_SHOWING', 3];
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining("m.title LIKE ? ESCAPE '!'"), params);
    expect(db.query.mock.calls[0][0]).toContain('m.status = ?');
    expect(db.query.mock.calls[0][0]).toContain('mg.genre_id = ?');
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT ? OFFSET ?'), [...params, 7, 7]);
    for (const [sql] of db.query.mock.calls) expect(sql).not.toContain(q);
    expect(result).toMatchObject({
      movies, filters: { q, status: 'NOW_SHOWING', genre: 3, page: 2 },
      pagination: { page: 2, pageSize: 7, total: 15, totalPages: 3, hasPrevious: true, hasNext: true },
    });
  });

  test.each([
    [0, '99', 1, 1, false, false],
    [8, '99', 2, 2, true, false],
    [15, 'invalid', 1, 3, false, true],
  ])('paginates total %i and requested page %s', async (total, requested, page, totalPages, hasPrevious, hasNext) => {
    db.query.mockResolvedValueOnce([{ total }]).mockResolvedValueOnce([]);
    const result = await catalog.listMovies({ page: requested, status: 'INVALID', genre: '-1' });
    expect(result.pagination).toEqual({ page, pageSize: 7, total, totalPages, hasPrevious, hasNext });
    expect(result.filters.page).toBe(page);
    expect(db.query.mock.calls[0][1]).toEqual([]);
    expect(db.query.mock.calls[0][0]).not.toContain('WHERE');
    expect(db.query.mock.calls[1][1]).toEqual([7, (page - 1) * 7]);
  });

  test('returns numeric genre counts', async () => {
    db.query.mockResolvedValue([{ genre_id: 1, genre_name: 'Drama', movie_count: '2' }]);
    await expect(catalog.listGenres()).resolves.toEqual([{ genre_id: 1, genre_name: 'Drama', movie_count: 2 }]);
  });

  test('finds a movie and normalizes selected genre ids', async () => {
    db.query.mockResolvedValueOnce([{ movie_id: 7 }]).mockResolvedValueOnce([{ genre_id: '3' }]);
    await expect(catalog.findMovieById(7)).resolves.toEqual({ movie_id: 7, genre_ids: [3] });
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('m.movie_id = ?'), [7]);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('movie_id = ?'), [7]);
  });

  test('does not query genre assignments for a missing movie', async () => {
    db.query.mockResolvedValue([]);
    await expect(catalog.findMovieById(7)).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('transactional movie and genre writes', () => {
  test('locks genres in sorted order, then inserts movie and assignments on one connection', async () => {
    const movie = savedMovie({ title: "A'); DROP TABLE movies; --" });
    connection.query.mockResolvedValueOnce([[{ genre_id: 1 }, { genre_id: 3 }]])
      .mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValue([{}]);
    await expect(catalog.createMovie(movie)).resolves.toBe(42);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('LOCK IN SHARE MODE'), [1, 3]);
    expect(connection.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO movies'), [
      movie.title, null, '120', '2024-02-29', '2024-03-01', null, null, POSTER_URL, null, 'P', 'COMING_SOON',
    ]);
    expect(connection.query.mock.calls[1][0]).not.toContain(movie.title);
    expect(connection.query.mock.calls[1][0].match(/\?/g)).toHaveLength(11);
    expect(connection.query).toHaveBeenNthCalledWith(3, 'DELETE FROM movie_genres WHERE movie_id = ?', [42]);
    expect(connection.query).toHaveBeenNthCalledWith(4,
      'INSERT INTO movie_genres (movie_id, genre_id) VALUES (?, ?), (?, ?)', [42, 3, 42, 1]);
    expect(movie.genre_ids).toEqual([3, 1]);
  });

  test('creates a movie with no genres without generating an empty IN or INSERT', async () => {
    connection.query.mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValue([{}]);
    await expect(catalog.createMovie(savedMovie({ genre_ids: [] }))).resolves.toBe(42);
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO movies');
    expect(connection.query.mock.calls[1]).toEqual(['DELETE FROM movie_genres WHERE movie_id = ?', [42]]);
  });

  test.each([undefined, POSTER_URL])('updates movie and genres with poster %p', async (poster_url) => {
    const previousPosterUrl = '/images/posters/uploads/previous.jpg';
    connection.query.mockResolvedValueOnce([[{ movie_id: 7, poster_url: previousPosterUrl }]])
      .mockResolvedValueOnce([[{ genre_id: 1 }, { genre_id: 3 }]]).mockResolvedValue([{}]);
    await expect(catalog.updateMovie(7, savedMovie({ poster_url })))
      .resolves.toEqual({ movie_id: 7, previousPosterUrl });
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), [7]);
    expect(connection.query).toHaveBeenNthCalledWith(2, expect.stringContaining('LOCK IN SHARE MODE'), [1, 3]);
    const [sql, params] = connection.query.mock.calls[2];
    expect(sql).toContain('UPDATE movies SET title = ?');
    expect(sql).toContain('WHERE movie_id = ?');
    expect(params[7]).toBe(poster_url === undefined ? previousPosterUrl : POSTER_URL);
    expect(params[params.length - 1]).toBe(7);
    expect(connection.query).toHaveBeenNthCalledWith(4, 'DELETE FROM movie_genres WHERE movie_id = ?', [7]);
    expect(connection.query).toHaveBeenNthCalledWith(5,
      expect.stringContaining('INSERT INTO movie_genres'), [7, 3, 7, 1]);
  });

  test('removes old genre assignments when an update selects no genres', async () => {
    connection.query.mockResolvedValueOnce([[{ movie_id: 7, poster_url: POSTER_URL }]]).mockResolvedValue([{}]);
    await catalog.updateMovie(7, savedMovie({ genre_ids: [] }));
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query).toHaveBeenLastCalledWith('DELETE FROM movie_genres WHERE movie_id = ?', [7]);
  });

  test.each(['createMovie', 'updateMovie'])('rejects missing genres before %s writes', async (method) => {
    if (method === 'updateMovie') connection.query.mockResolvedValueOnce([[{ movie_id: 7 }]]);
    connection.query.mockResolvedValueOnce([[{ genre_id: 1 }]]);
    const operation = method === 'createMovie' ? catalog.createMovie(savedMovie()) : catalog.updateMovie(7, savedMovie());
    await expect(operation).rejects.toMatchObject({ status: 400, field: 'genre_ids' });
    expect(connection.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  });

  test.each(['createMovie', 'updateMovie'])('%s converts missing foreign keys into a friendly genre error', async (method) => {
    for (const error of [{ code: 'ER_NO_REFERENCED_ROW_2' }, { errno: 1452 }]) {
      db.withTransaction.mockRejectedValueOnce(error);
      const operation = method === 'createMovie' ? catalog.createMovie(savedMovie()) : catalog.updateMovie(7, savedMovie());
      await expect(operation).rejects.toMatchObject({
        name: 'AppError', status: 400, field: 'genre_ids', message: 'Một thể loại đã bị xóa. Vui lòng chọn lại',
      });
    }
  });

  test('does not write when the movie to update is missing', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(catalog.updateMovie(7, savedMovie())).rejects.toMatchObject({ status: 404 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('creates and updates genre names using bound parameters', async () => {
    const name = "Drama'); DROP TABLE genres; --";
    db.query.mockResolvedValueOnce({ insertId: 9 });
    await expect(catalog.createGenre(name)).resolves.toBe(9);
    expect(db.query).toHaveBeenCalledWith('INSERT INTO genres (genre_name) VALUES (?)', [name]);
    connection.query.mockResolvedValueOnce([[{ genre_id: 9 }]]).mockResolvedValue([{}]);
    await catalog.updateGenre(9, name);
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), [9]);
    expect(connection.query).toHaveBeenNthCalledWith(2, 'UPDATE genres SET genre_name = ? WHERE genre_id = ?', [name, 9]);
  });

  test.each(['createGenre', 'updateGenre'])('%s translates duplicate names into friendly field errors', async (method) => {
    for (const error of [{ code: 'ER_DUP_ENTRY' }, { errno: 1062 }]) {
      if (method === 'createGenre') db.query.mockRejectedValueOnce(error);
      else {
        connection.query.mockResolvedValueOnce([[{ genre_id: 9 }]]).mockRejectedValueOnce(error);
      }
      const operation = method === 'createGenre' ? catalog.createGenre('Drama') : catalog.updateGenre(9, 'Drama');
      await expect(operation).rejects.toMatchObject({
        name: 'AppError', status: 409, field: 'genre_name', message: 'Tên thể loại đã tồn tại',
      });
    }
  });

  test('does not update a missing genre', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(catalog.updateGenre(9, 'Drama')).rejects.toMatchObject({ status: 404 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test.each(['createMovie', 'updateMovie', 'deleteMovie', 'updateGenre', 'deleteGenre'])(
    '%s preserves unexpected transaction errors', async (method) => {
      const error = new Error('transaction unavailable');
      db.withTransaction.mockRejectedValueOnce(error);
      const operation = method === 'createMovie' ? catalog[method](savedMovie()) : catalog[method](7, savedMovie());
      await expect(operation).rejects.toBe(error);
    },
  );

  test('preserves unexpected genre creation errors', async () => {
    const error = new Error('query unavailable');
    db.query.mockRejectedValueOnce(error);
    await expect(catalog.createGenre('Drama')).rejects.toBe(error);
  });
});

describe.each([
  ['movie', 'deleteMovie', 'movies', 'showtimes'],
  ['genre', 'deleteGenre', 'genres', 'movie_genres'],
])('%s deletion guards', (kind, method, table, references) => {
  const row = kind === 'movie' ? { movie_id: 7, poster_url: POSTER_URL } : { genre_id: 7 };

  test('locks the parent and checks references before deleting', async () => {
    connection.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
    const result = await catalog[method](7);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining(`FROM ${table} WHERE`), [7]);
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query).toHaveBeenNthCalledWith(2, expect.stringContaining(`FROM ${references} WHERE`), [7]);
    expect(connection.query.mock.calls[1][0]).toContain('LIMIT 1 FOR UPDATE');
    expect(connection.query).toHaveBeenNthCalledWith(3, `DELETE FROM ${table} WHERE ${kind}_id = ?`, [7]);
    if (kind === 'movie') expect(result).toEqual(row);
  });

  test('returns 404 without deleting a missing parent', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(catalog[method](7)).rejects.toMatchObject({ status: 404 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('returns a conflict without deleting a referenced parent', async () => {
    connection.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ reference_id: 1 }]]);
    await expect(catalog[method](7)).rejects.toMatchObject({
      status: 409, ...(kind === 'genre' ? { field: 'genre_name' } : {}),
    });
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  });

  test.each([{ code: 'ER_ROW_IS_REFERENCED_2' }, { errno: 1451 }])(
    'translates a concurrent foreign-key restriction %p', async (error) => {
      connection.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[]]).mockRejectedValueOnce(error);
      await expect(catalog[method](7)).rejects.toMatchObject({
        name: 'AppError', status: 409, ...(kind === 'genre' ? { field: 'genre_name' } : {}),
      });
    },
  );
});

describe('JPEG poster uploads', () => {
  test('configures bounded memory uploads with a single poster field', () => {
    expect(uploadOptions.limits).toEqual({
      fileSize: posters.MAX_POSTER_BYTES, files: 1, fields: 100, parts: 102, fieldSize: 262144,
    });
    expect(posters.MAX_POSTER_BYTES).toBe(5 * 1024 * 1024);
  });

  test.each(['poster.jpg', 'poster.jpeg', 'POSTER.JPG', 'POSTER.JPEG'])(
    'accepts JPEG filename %s with MIME and magic bytes', (originalname) => {
      expect(posters.validatePosterFile(jpeg({ originalname }))).toBeNull();
    },
  );

  test('allows no optional poster', () => {
    expect(posters.validatePosterFile()).toBeNull();
  });

  test.each([
    { originalname: 'poster.png' }, { originalname: 'poster.jpg.exe' }, { originalname: '' },
    { mimetype: 'image/png' }, { mimetype: 'image/jpg' }, { mimetype: 'text/html' },
    { buffer: Buffer.from('not a JPEG') }, { buffer: Buffer.from([0xff, 0xd8]) },
    { buffer: Buffer.from([0xff, 0xd8, 0x00]) }, { buffer: [0xff, 0xd8, 0xff] }, { buffer: undefined },
  ])('rejects spoofed or malformed JPEG %p', (overrides) => {
    expect(posters.validatePosterFile(jpeg(overrides))).toEqual(expect.any(String));
  });

  test('accepts exactly 5 MiB and rejects one byte above the limit', () => {
    const buffer = Buffer.alloc(posters.MAX_POSTER_BYTES + 1);
    buffer.set([0xff, 0xd8, 0xff]);
    expect(posters.validatePosterFile(jpeg({ buffer: buffer.subarray(0, posters.MAX_POSTER_BYTES) }))).toBeNull();
    expect(posters.validatePosterFile(jpeg({ buffer }))).toContain('5MB');
  });

  test('file filter rejects bad extensions or MIME inline and accepts JPEG', () => {
    for (const file of [jpeg({ originalname: 'poster.png' }), jpeg({ mimetype: 'image/png' })]) {
      const req = {};
      const callback = jest.fn();
      uploadOptions.fileFilter(req, file, callback);
      expect(callback).toHaveBeenCalledWith(null, false);
      expect(req.posterUploadError).toBeInstanceOf(AppError);
      expect(req.posterUploadError).toMatchObject({ status: 400, field: 'poster' });
    }
    const req = {};
    const callback = jest.fn();
    uploadOptions.fileFilter(req, jpeg(), callback);
    expect(callback).toHaveBeenCalledWith(null, true);
    expect(req.posterUploadError).toBeUndefined();
  });

  test('passes a valid upload through to the next middleware', () => {
    const req = { file: jpeg() };
    const next = jest.fn();
    posters.uploadPoster(req, {}, next);
    expect(req.file).toBeDefined();
    expect(req.posterUploadError).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  test.each(['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'])(
    'turns multer %s into an inline poster error and continues', (code) => {
      receivePoster.mockImplementationOnce((_req, _res, callback) => callback(new multer.MulterError(code)));
      const req = { file: jpeg() };
      const next = jest.fn();
      posters.uploadPoster(req, {}, next);
      expect(req.posterUploadError).toMatchObject({ status: 400, field: 'poster' });
      if (code === 'LIMIT_FILE_SIZE') expect(req.posterUploadError.message).toContain('5MB');
      expect(req.file).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    },
  );

  test('removes invalid content and previously rejected uploads before continuing', () => {
    for (const req of [
      { file: jpeg({ buffer: Buffer.from('bad') }) },
      { file: jpeg(), posterUploadError: new AppError('rejected by filter', 400) },
    ]) {
      const next = jest.fn();
      posters.uploadPoster(req, {}, next);
      expect(req.file).toBeUndefined();
      expect(req.posterUploadError.status).toBe(400);
      expect(next).toHaveBeenCalledWith();
    }
  });

  test('forwards unexpected middleware errors instead of masking them', () => {
    const error = new Error('upload failed');
    receivePoster.mockImplementationOnce((_req, _res, callback) => callback(error));
    const next = jest.fn();
    posters.uploadPoster({}, {}, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  test('persists with a server-owned UUID path and exclusive write flag', async () => {
    const file = jpeg({ originalname: '../../client-name.jpg' });
    await expect(posters.persistPoster(file)).resolves.toBe(POSTER_URL);
    expect(fs.mkdir).toHaveBeenCalledWith(UPLOAD_DIRECTORY, { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(POSTER_PATH, file.buffer, { flag: 'wx' });
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  test.each([undefined, jpeg({ mimetype: 'image/png' }), jpeg({ buffer: Buffer.from('bad') })])(
    'rejects invalid persistence input before filesystem calls', async (file) => {
      await expect(posters.persistPoster(file)).rejects.toMatchObject({ status: 400, field: 'poster' });
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    },
  );

  test.each(['EIO', 'EEXIST'])('handles failed writes safely for %s', async (code) => {
    const error = Object.assign(new Error('write failed'), { code });
    fs.writeFile.mockRejectedValueOnce(error);
    await expect(posters.persistPoster(jpeg())).rejects.toBe(error);
    if (code === 'EEXIST') expect(fs.unlink).not.toHaveBeenCalled();
    else expect(fs.unlink).toHaveBeenCalledWith(POSTER_PATH);
  });

  test('preserves the write error even when partial-file cleanup also fails', async () => {
    const error = Object.assign(new Error('write failed'), { code: 'EIO' });
    fs.writeFile.mockRejectedValueOnce(error);
    fs.unlink.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(posters.persistPoster(jpeg())).rejects.toBe(error);
  });

  test.each([null, undefined, '/images/posters/example.jpg', '/images/posters/uploads/example.jpg',
    `/images/posters/uploads/../${UUID}.jpg`, `${POSTER_URL}?x=1`, `https://example.com${POSTER_URL}`])(
    'does not unlink unmanaged or unsafe path %p', async (url) => {
      await posters.cleanupManagedPoster(url);
      expect(fs.unlink).not.toHaveBeenCalled();
    },
  );

  test('unlinks only a managed UUID poster and tolerates already missing files', async () => {
    await posters.cleanupManagedPoster(POSTER_URL);
    expect(fs.unlink).toHaveBeenCalledWith(POSTER_PATH);
    fs.unlink.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await expect(posters.cleanupManagedPoster(POSTER_URL)).resolves.toBeUndefined();
  });

  test('surfaces unexpected managed-poster cleanup errors', async () => {
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    fs.unlink.mockRejectedValueOnce(error);
    await expect(posters.cleanupManagedPoster(POSTER_URL)).rejects.toBe(error);
  });
});
