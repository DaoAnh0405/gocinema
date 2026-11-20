jest.mock('../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

const db = require('../config/db');
const AppError = require('../utils/AppError');
const validator = require('../validators/adminShowtimeValidator');
const showtimes = require('../models/adminShowtimeModel');
const { MOVIE_STATUS, SHOWTIME_STATUS, SEAT_STATUS } = require('../constants');

const NOW = Date.parse('2030-06-15T00:00:00+07:00');
const ID = 41;

function input(overrides = {}) {
  return {
    movie_id: '3', cinema_id: '2', room_id: '5', date: '2030-06-15',
    start_time: '10:00', screen_format: '2D', language: 'Phụ đề', ...overrides,
  };
}

function savedShowtime(overrides = {}) {
  return {
    showtime_id: ID, movie_id: 3, room_id: 5, status: SHOWTIME_STATUS.OPEN,
    start_time: '2030-06-15 10:00:00', end_time: '2030-06-15 12:15:00',
    screen_format: '2D', language: 'Phụ đề', ...overrides,
  };
}

let connection;
let state;
const compact = (sql) => sql.replace(/\s+/g, ' ').trim();
const calls = (pattern) => connection.query.mock.calls.filter(([sql]) => pattern.test(compact(sql)));
const mutations = () => calls(/^(INSERT|UPDATE|DELETE) /);

// Only the mocked transaction connection can execute writes. Unknown SQL fails the test.
// Query predicates are asserted separately: this fixture is not a SQL engine or a DB rollback test.
function transactionQuery(rawSql, params = []) {
  const sql = compact(rawSql);
  if (sql.startsWith('SELECT s.movie_id, s.room_id, r.cinema_id')) return [state.initial ? [state.initial] : []];
  if (sql.includes('FROM movies WHERE movie_id = ?')) return [state.movies.filter((row) => row.movie_id === params[0])];
  if (sql.includes('FROM cinemas WHERE cinema_id = ?')) return [state.cinemas.filter((row) => row.cinema_id === params[0])];
  if (sql.includes('FROM rooms WHERE room_id = ?')) return [state.rooms.filter((row) => row.room_id === params[0])];
  if (sql.startsWith('SELECT s.showtime_id') && sql.endsWith('FOR UPDATE')) return [state.current ? [state.current] : []];
  if (sql.startsWith('SELECT seat_id FROM seats')) return [state.seats];
  if (sql.startsWith('SELECT showtime_id FROM showtimes')) {
    const [roomId, excludedId, end, start] = params;
    return [state.neighbors.filter((row) => row.room_id === roomId && row.showtime_id !== excludedId &&
      [SHOWTIME_STATUS.CLOSED, SHOWTIME_STATUS.OPEN].includes(row.status) && row.start_time < end && row.end_time > start)];
  }
  if (sql.startsWith('SELECT seat_id, status,')) return [state.inventory];
  if (sql.startsWith('SELECT ticket_id FROM tickets')) return [state.tickets];
  if (sql.startsWith('INSERT INTO showtimes ')) return [{ insertId: 73 }];
  if (/^(INSERT INTO showtime_seats |UPDATE showtime_seats |UPDATE showtimes |DELETE FROM showtime_seats |DELETE FROM showtimes )/.test(sql)) {
    return [{ affectedRows: 1 }];
  }
  throw new Error(`Unexpected transaction SQL: ${sql}`);
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  db.query.mockReset().mockImplementation(() => { throw new Error('Unexpected nontransactional DB query'); });
  db.withTransaction.mockReset();
  state = {
    initial: { movie_id: 3, room_id: 5, cinema_id: 2 },
    current: savedShowtime(),
    movies: [{ movie_id: 3, duration: 120, status: MOVIE_STATUS.NOW_SHOWING, release_date: '2030-06-01', end_date: '2030-06-30' }],
    cinemas: [{ cinema_id: 2, status: 1 }],
    rooms: [{ room_id: 5, cinema_id: 2, room_type: '2D', status: 1 }],
    seats: [{ seat_id: 11 }, { seat_id: 12 }],
    inventory: [{ seat_id: 11, status: SEAT_STATUS.AVAILABLE, active_hold: 1 }],
    tickets: [], neighbors: [],
  };
  connection = { query: jest.fn(async (sql, params) => transactionQuery(sql, params)) };
  db.withTransaction.mockImplementation((callback) => callback(connection));
});

afterEach(() => jest.restoreAllMocks());

describe('admin showtime validation', () => {
  test.each([1, '1', '0003', 2147483647, '2147483647'])('accepts SQL integer ID %p', (id) => {
    expect(validator.parseId(id)).toBe(Number(id));
    expect(validator.validateShowtime(input({ movie_id: id, cinema_id: id, room_id: id })).errors).toEqual([]);
  });

  test.each([0, '0', -1, '-1', 1.5, '1.5', '1e2', '2147483648', '1 OR 1=1', '', ' 1 ', null, undefined, true, [], {}, NaN, Infinity])(
    'rejects malformed ID %p', (id) => expect(validator.parseId(id)).toBeNull(),
  );

  test.each(['movie_id', 'cinema_id', 'room_id'])('reports invalid %s', (field) => {
    expect(validator.validateShowtime(input({ [field]: '1 OR 1=1' })).fieldErrors[field]).toBeTruthy();
  });

  test('trims form values, supplies defaults, and ignores client-controlled end/status/inventory', () => {
    const result = validator.validateShowtime(input({
      movie_id: ' 3 ', cinema_id: 2, room_id: ' 5 ', date: ' 2030-06-15 ', start_time: ' 10:00 ',
      screen_format: undefined, language: null, end_time: '2099-01-01 00:00:00', status: '-1', seats: [99],
    }));
    expect(result).toEqual({ values: input(), errors: [], fieldErrors: {} });
  });

  test.each([undefined, null, {}])('returns field errors for missing form %p', (value) => {
    expect(Object.keys(validator.validateShowtime(value).fieldErrors)).toEqual([
      'movie_id', 'cinema_id', 'room_id', 'date', 'start_time',
    ]);
  });

  test.each(['1000-01-01', '2000-02-29', '2032-02-29', '9999-12-31'])('accepts real date %s', (date) => {
    expect(validator.isRealDate(date)).toBe(true);
    expect(validator.validateShowtime(input({ date })).errors).toEqual([]);
  });

  test.each(['0999-12-31', '1900-02-29', '2030-02-29', '2030-04-31', '2030-00-01', '2030-13-01',
    '2030-06-00', '2030-6-15', '2030-06-15T00:00:00Z', '', null, 20300615])('rejects date %p', (date) => {
    expect(validator.isRealDate(date)).toBe(false);
    expect(validator.validateShowtime(input({ date })).fieldErrors.date).toBeTruthy();
  });

  test.each(['00:00', '09:05', '23:59'])('accepts clock %s', (start_time) => {
    expect(validator.isClock(start_time)).toBe(true);
    expect(validator.validateShowtime(input({ start_time })).errors).toEqual([]);
  });

  test.each(['24:00', '23:60', '-1:00', '9:05', '09:5', '10:00:00', '10:00+07:00', '', null, 1000])(
    'rejects clock %p', (start_time) => {
      expect(validator.isClock(start_time)).toBe(false);
      expect(validator.validateShowtime(input({ start_time })).fieldErrors.start_time).toBeTruthy();
    },
  );

  test.each(['2D', '3D', 'IMAX'])('accepts format %s', (screen_format) => {
    expect(validator.validateShowtime(input({ screen_format })).errors).toEqual([]);
  });

  test.each(['Tiếng Việt', 'Phụ đề', 'Lồng tiếng'])('accepts language %s', (language) => {
    expect(validator.validateShowtime(input({ language })).errors).toEqual([]);
  });

  test.each(['', '4DX', '2d', [], 1])('rejects unknown format %p', (screen_format) => {
    expect(validator.validateShowtime(input({ screen_format })).fieldErrors.screen_format).toBeTruthy();
  });

  test.each(['', 'English', [], 1])('rejects unknown language %p', (language) => {
    expect(validator.validateShowtime(input({ language })).fieldErrors.language).toBeTruthy();
  });

  test.each(['-1', '0', '1'])('accepts exact form status %s', (status) => {
    expect(validator.validateStatus({ status })).toEqual({ values: { status }, errors: [], fieldErrors: {} });
  });

  test.each(['2', '-2', 'OPEN', ' 1 ', '', 0, 1, null, undefined, [], {}])('rejects form status %p', (status) => {
    expect(validator.validateStatus({ status }).fieldErrors.status).toBeTruthy();
  });

  test.each([undefined, null, {}])('handles missing status form %p', (value) => {
    expect(validator.validateStatus(value).fieldErrors.status).toBeTruthy();
  });

  test('normalizes filters without accepting arrays, SQL fragments, numeric status or invalid dates', () => {
    expect(validator.normalizeFilters({ date: '2030-02-30', cinema: ['2'], movie: '3 OR 1=1', status: 0, page: '-1' }))
      .toEqual({ date: '', cinema: '', movie: '', status: '', page: 1 });
    expect(validator.normalizeFilters({ date: '2030-06-15', cinema: '2', movie: '3', status: '0', page: '4' }))
      .toEqual({ date: '2030-06-15', cinema: 2, movie: 3, status: '0', page: 4 });
    expect(validator.normalizeFilters(null)).toEqual(validator.normalizeFilters());
  });
});

describe('Vietnam wall-time helpers', () => {
  test('uses +07:00 independently of the host timezone', () => {
    expect(validator.vietnamTimestamp('2030-06-15', '00:00')).toBe(Date.parse('2030-06-14T17:00:00Z'));
    expect(validator.vietnamDateTime(Date.parse('2030-06-14T17:00:00Z'))).toBe('2030-06-15 00:00:00');
    expect(validator.vietnamDate()).toBe('2030-06-15');
  });

  test('crosses the Vietnam date boundary at 17:00 UTC, including year rollover', () => {
    expect(validator.vietnamDate(Date.parse('2030-12-31T16:59:59.999Z'))).toBe('2030-12-31');
    expect(validator.vietnamDate(Date.parse('2030-12-31T17:00:00Z'))).toBe('2031-01-01');
    expect(validator.vietnamDateTime(Date.parse('2030-12-31T17:00:00Z'))).toBe('2031-01-01 00:00:00');
  });

  test.each([['2030-02-29', '10:00'], ['2030-06-15', '24:00'], [null, '10:00'], ['2030-06-15', '10:00:00']])(
    'returns NaN for invalid timestamp %p %p', (date, clock) => {
      expect(validator.vietnamTimestamp(date, clock)).toBeNaN();
    },
  );
});

describe('admin showtime read queries', () => {
  test('parameterizes every filter, includes closed status zero, clamps pages and normalizes counts', async () => {
    db.query.mockResolvedValueOnce([{ total: '21' }]).mockResolvedValueOnce([
      { showtime_id: ID, total_count: '20', sold_count: '3' },
    ]);
    const result = await showtimes.list({ date: '2030-06-15', cinema: '2', movie: '3', status: '0', page: '99' });
    const params = ['2030-06-15 00:00:00', '2030-06-15 23:59:59', 2, 3, 0];
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('COUNT(*) AS total'), params);
    expect(compact(db.query.mock.calls[0][0])).toContain('WHERE s.start_time >= ? AND s.start_time <= ? AND r.cinema_id = ? AND s.movie_id = ? AND s.status = ?');
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('ORDER BY s.start_time DESC, s.showtime_id DESC LIMIT ? OFFSET ?'), [...params, 10, 20]);
    const sql = compact(db.query.mock.calls[1][0]);
    expect(sql).toContain('COUNT(DISTINCT sold.seat_id)');
    expect(sql).toContain('FROM showtime_seats WHERE status = -1');
    expect(sql).toContain("WHERE o.status = 'PAID' AND t.status IN (0, 1)");
    // Keep the scheduled end stable even if the movie's duration is edited later.
    expect(sql).toContain('DATE_SUB(s.end_time, INTERVAL 15 MINUTE)');
    expect(sql).not.toContain('INTERVAL m.duration MINUTE');
    expect(result.showtimes).toEqual([{ showtime_id: ID, total_count: 20, sold_count: 3 }]);
    expect(result.filters).toEqual({ date: '2030-06-15', cinema: 2, movie: 3, status: '0', page: 3 });
    expect(result.pagination).toEqual({ page: 3, pageSize: 10, total: 21, totalPages: 3, hasPrevious: true, hasNext: false });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test('drops invalid filters and returns a stable empty first page', async () => {
    db.query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
    const result = await showtimes.list({ date: '2030-02-30', cinema: '2 OR 1=1', movie: [], status: '9', page: 50 });
    expect(db.query.mock.calls[0][1]).toEqual([]);
    expect(compact(db.query.mock.calls[0][0])).not.toContain('WHERE');
    expect(db.query.mock.calls[1][1]).toEqual([10, 0]);
    expect(result.showtimes).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 1, hasPrevious: false, hasNext: false });
  });

  test('reports a next page without a previous page', async () => {
    db.query.mockResolvedValueOnce([{ total: 11 }]).mockResolvedValueOnce([]);
    expect((await showtimes.list()).pagination).toMatchObject({ page: 1, hasPrevious: false, hasNext: true });
  });

  test.each(['-1', '1'])('retains valid status filter %s', async (status) => {
    db.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await showtimes.list({ status });
    expect(db.query.mock.calls[0][1]).toEqual([Number(status)]);
  });

  test('loads all option statuses with deterministic sorting and numeric room seat counts', async () => {
    const movies = [{ movie_id: 3, status: MOVIE_STATUS.ENDED }];
    const cinemas = [{ cinema_id: 2, status: 0 }];
    db.query.mockResolvedValueOnce(movies).mockResolvedValueOnce(cinemas)
      .mockResolvedValueOnce([{ room_id: 5, status: 0, seat_count: '0' }]);
    expect(await showtimes.options()).toEqual({ movies, cinemas, rooms: [{ room_id: 5, status: 0, seat_count: 0 }] });
    const sql = db.query.mock.calls.map(([statement]) => compact(statement));
    expect(sql[0]).toContain("DATE_FORMAT(release_date, '%Y-%m-%d')");
    expect(sql[0]).toContain('ORDER BY title, movie_id');
    expect(sql[1]).toContain('ORDER BY cinema_name, cinema_id');
    expect(sql[2]).toContain('COUNT(*) FROM seats st WHERE st.room_id = r.room_id');
    expect(sql[2]).toContain('ORDER BY r.cinema_id, r.room_name, r.room_id');
    expect(sql.join(' ')).not.toMatch(/WHERE (?:m\.|c\.|r\.)?status/);
  });

  test('finds one showtime with a numeric bound ID and returns null when absent', async () => {
    db.query.mockResolvedValueOnce([savedShowtime()]).mockResolvedValueOnce([]);
    expect(await showtimes.findById('41')).toEqual(savedShowtime());
    expect(await showtimes.findById(42)).toBeNull();
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE s.showtime_id = ?'), [41]);
  });
});

describe('admin showtime transaction scheduling', () => {
  test('creates an open schedule using movie duration plus 15 minutes, then copies all room seats', async () => {
    expect(showtimes.CLEANING_MINUTES).toBe(15);
    expect(await showtimes.create(input({ end_time: '2099-01-01 00:00:00', status: '-1' }))).toBe(73);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(mutations().map(([sql, params]) => [compact(sql), params])).toEqual([
      ['INSERT INTO showtimes (movie_id, room_id, start_time, end_time, screen_format, language, status) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [3, 5, '2030-06-15 10:00:00', '2030-06-15 12:15:00', '2D', 'Phụ đề']],
      ['INSERT INTO showtime_seats (showtime_id, seat_id, status) SELECT ?, seat_id, 1 FROM seats WHERE room_id = ? ORDER BY seat_id', [73, 5]],
    ]);
    expect(calls(/^SELECT seat_id FROM seats/)[0][1]).toEqual([5]);
    expect(compact(calls(/^SELECT seat_id FROM seats/)[0][0])).toContain('ORDER BY seat_id FOR UPDATE');
  });

  test('computes cross-midnight end time in Vietnam wall time', async () => {
    await showtimes.create(input({ start_time: '23:30' }));
    expect(calls(/^INSERT INTO showtimes /)[0][1]).toEqual([
      3, 5, '2030-06-15 23:30:00', '2030-06-16 01:45:00', '2D', 'Phụ đề',
    ]);
  });

  test.each(['COMING_SOON', 'NOW_SHOWING'])('allows eligible movie status %s and inclusive release/end dates', async (status) => {
    Object.assign(state.movies[0], { status, release_date: '2030-06-15', end_date: '2030-06-15', duration: '120' });
    await expect(showtimes.create(input())).resolves.toBe(73);
  });

  test('allows movies without a bounded release window', async () => {
    Object.assign(state.movies[0], { release_date: null, end_date: null });
    await expect(showtimes.create(input())).resolves.toBe(73);
  });

  test.each([
    ['inactive cinema', 'cinemas', { status: 0 }, 'cinema_id', 409],
    ['inactive room', 'rooms', { status: 0 }, 'room_id', 409],
    ['wrong room/cinema relation', 'rooms', { cinema_id: 9 }, 'room_id', 400],
    ['ended movie', 'movies', { status: MOVIE_STATUS.ENDED }, 'movie_id', 409],
    ['before release', 'movies', { release_date: '2030-06-16' }, 'date', 400],
    ['after release window', 'movies', { end_date: '2030-06-14' }, 'date', 400],
    ['wrong format', 'rooms', { room_type: 'IMAX' }, 'screen_format', 400],
    ['zero duration', 'movies', { duration: 0 }, 'movie_id', 409],
    ['negative duration', 'movies', { duration: -1 }, 'movie_id', 409],
    ['fractional duration', 'movies', { duration: 120.5 }, 'movie_id', 409],
    ['nonnumeric duration', 'movies', { duration: 'bad' }, 'movie_id', 409],
    ['infinite duration', 'movies', { duration: Infinity }, 'movie_id', 409],
  ])('rejects %s before any write', async (_name, table, patch, field, status) => {
    Object.assign(state[table][0], patch);
    await expect(showtimes.create(input())).rejects.toMatchObject({ status, field });
    expect(mutations()).toEqual([]);
  });

  test('rejects rooms without seats', async () => {
    state.seats = [];
    await expect(showtimes.create(input())).rejects.toMatchObject({ status: 409, field: 'room_id' });
    expect(mutations()).toEqual([]);
  });

  test('rejects an end timestamp outside SQL DATETIME range', async () => {
    state.movies[0].end_date = null;
    await expect(showtimes.create(input({ date: '9999-12-31', start_time: '23:59' })))
      .rejects.toMatchObject({ status: 400, field: 'date' });
    expect(mutations()).toEqual([]);
  });

  test.each(['2030-06-15T09:59:59.999+07:00', '2030-06-15T10:00:00+07:00', '2030-06-15T10:00:00.001+07:00'])(
    'checks start boundary against %s', async (now) => {
      Date.now.mockReturnValue(Date.parse(now));
      if (Date.parse(now) < Date.parse('2030-06-15T10:00:00+07:00')) {
        await expect(showtimes.create(input())).resolves.toBe(73);
      } else {
        await expect(showtimes.create(input())).rejects.toMatchObject({ status: 409, field: 'start_time' });
        expect(mutations()).toEqual([]);
      }
    },
  );

  test('checks future time again after waiting for overlap locks', async () => {
    connection.query.mockImplementation(async (sql, params) => {
      const result = transactionQuery(sql, params);
      if (compact(sql).startsWith('SELECT showtime_id FROM showtimes')) {
        Date.now.mockReturnValue(Date.parse('2030-06-15T10:00:00+07:00'));
      }
      return result;
    });
    await expect(showtimes.create(input())).rejects.toMatchObject({ status: 409, field: 'start_time' });
    expect(mutations()).toEqual([]);
  });

  test.each([SHOWTIME_STATUS.CLOSED, SHOWTIME_STATUS.OPEN])('blocks overlapping status %s but allows touching boundaries', async (status) => {
    const neighbor = { showtime_id: 99, room_id: 5, status };
    state.neighbors = [{ ...neighbor, start_time: '2030-06-15 08:00:00', end_time: '2030-06-15 10:00:00' }];
    await expect(showtimes.create(input())).resolves.toBe(73);
    state.neighbors = [{ ...neighbor, start_time: '2030-06-15 12:15:00', end_time: '2030-06-15 14:00:00' }];
    await expect(showtimes.create(input())).resolves.toBe(73);
    for (const [start_time, end_time] of [
      ['2030-06-15 08:00:00', '2030-06-15 10:00:01'],
      ['2030-06-15 12:14:59', '2030-06-15 14:00:00'],
      ['2030-06-15 10:00:00', '2030-06-15 12:15:00'],
      ['2030-06-15 09:00:00', '2030-06-15 13:00:00'],
    ]) {
      connection.query.mockClear();
      state.neighbors = [{ ...neighbor, start_time, end_time }];
      await expect(showtimes.create(input())).rejects.toMatchObject({ status: 409, field: 'start_time' });
      expect(mutations()).toEqual([]);
    }
    const [sql, params] = calls(/^SELECT showtime_id FROM showtimes/)[0];
    expect(compact(sql)).toBe('SELECT showtime_id FROM showtimes WHERE room_id = ? AND status IN (0, 1) AND showtime_id <> ? AND start_time < ? AND end_time > ? LIMIT 1 FOR UPDATE');
    expect(params).toEqual([5, 0, '2030-06-15 12:15:00', '2030-06-15 10:00:00']);
  });

  test('ignores cancelled neighbors and showtimes in other rooms', async () => {
    state.neighbors = [
      { showtime_id: 99, room_id: 5, status: -1, start_time: '2030-06-15 09:00:00', end_time: '2030-06-15 13:00:00' },
      { showtime_id: 98, room_id: 6, status: 1, start_time: '2030-06-15 09:00:00', end_time: '2030-06-15 13:00:00' },
    ];
    await expect(showtimes.create(input())).resolves.toBe(73);
  });
});

describe('admin showtime validation and lock failures', () => {
  test.each(['findById', 'update', 'remove', 'changeStatus'])('%s rejects an invalid ID without database work', async (method) => {
    await expect(showtimes[method]('41 OR 1=1', method === 'update' ? input() : '0')).rejects.toMatchObject({ status: 404 });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test.each(['create', 'update'])('%s rejects malformed forms before opening a transaction', async (method) => {
    const args = method === 'create' ? [{}] : [ID, {}];
    await expect(showtimes[method](...args)).rejects.toMatchObject({ status: 400, fieldErrors: { movie_id: expect.any(String), date: expect.any(String) } });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test.each([
    ['movies', 'movie_id'], ['cinemas', 'cinema_id'], ['rooms', 'room_id'],
  ])('rejects missing %s under parent locks', async (table, field) => {
    state[table] = [];
    await expect(showtimes.create(input())).rejects.toMatchObject({ status: 400, field });
    expect(mutations()).toEqual([]);
  });

  test.each(['update', 'remove', 'changeStatus'])('%s rejects a missing initial showtime', async (method) => {
    state.initial = null;
    await expect(showtimes[method](ID, method === 'update' ? input() : '-1')).rejects.toMatchObject({ status: 404 });
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(mutations()).toEqual([]);
  });

  test('rejects a showtime deleted between the initial read and locking read', async () => {
    state.current = null;
    await expect(showtimes.remove(ID)).rejects.toMatchObject({ status: 404 });
    expect(mutations()).toEqual([]);
  });

  test.each([
    ['movie', () => { state.current.movie_id = 9; }],
    ['room', () => { state.current.room_id = 9; }],
    ['room parent', () => { state.rooms[0].cinema_id = 9; }],
  ])('rejects stale %s parent context after locking', async (_name, alter) => {
    alter();
    await expect(showtimes.remove(ID)).rejects.toMatchObject({ status: 409 });
    expect(mutations()).toEqual([]);
  });

  test.each(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW_2'])(
    'maps transactional error %s into a user-facing conflict', async (code) => {
      db.withTransaction.mockRejectedValue(Object.assign(new Error('database detail'), { code }));
      await expect(showtimes.create(input())).rejects.toBeInstanceOf(AppError);
      await expect(showtimes.create(input())).rejects.toMatchObject({ status: 409 });
    },
  );

  test('propagates unexpected database failures without masking them', async () => {
    const error = new Error('unanticipated database failure');
    connection.query.mockRejectedValue(error);
    await expect(showtimes.create(input())).rejects.toBe(error);
    expect(mutations()).toEqual([]);
  });

  test('propagates an inventory insertion failure from the same transaction', async () => {
    const error = new Error('inventory insertion failed');
    connection.query.mockImplementation(async (sql, params) => {
      if (compact(sql).startsWith('INSERT INTO showtime_seats')) throw error;
      return transactionQuery(sql, params);
    });
    await expect(showtimes.create(input())).rejects.toBe(error);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('admin showtime updates and inventory safety', () => {
  test('returns unchanged schedules without touching inventory or rejecting existing tickets', async () => {
    state.tickets = [{ ticket_id: 1 }];
    expect(await showtimes.update('41', input())).toBe(ID);
    expect(mutations()).toEqual([]);
    expect(calls(/^SELECT ticket_id/)).toEqual([]);
    expect(calls(/^SELECT showtime_id FROM showtimes/)).toEqual([]);
  });

  test('updates same-room schedules, excludes itself from overlap, and releases only safe inventory', async () => {
    state.inventory = [{ seat_id: 11, status: 0, active_hold: 0 }];
    state.neighbors = [{ ...state.current, showtime_id: ID }];
    expect(await showtimes.update(ID, input({ start_time: '11:00', language: 'Lồng tiếng' }))).toBe(ID);
    expect(calls(/^SELECT showtime_id FROM showtimes/)[0][1]).toEqual([5, ID, '2030-06-15 13:15:00', '2030-06-15 11:00:00']);
    expect(mutations().map(([sql, params]) => [compact(sql), params])).toEqual([
      ['UPDATE showtimes SET movie_id = ?, room_id = ?, start_time = ?, end_time = ?, screen_format = ?, language = ? WHERE showtime_id = ?',
        [3, 5, '2030-06-15 11:00:00', '2030-06-15 13:15:00', '2D', 'Lồng tiếng', ID]],
      ['UPDATE showtime_seats SET status = 1, held_until = NULL, held_by = NULL WHERE showtime_id = ?', [ID]],
    ]);
  });

  test('replaces inventory when moving to a different room', async () => {
    state.rooms.push({ room_id: 6, cinema_id: 2, room_type: '3D', status: 1 });
    await showtimes.update(ID, input({ room_id: '6', screen_format: '3D' }));
    expect(mutations().map(([sql]) => compact(sql).split(' SET ')[0])).toEqual([
      'UPDATE showtimes', 'DELETE FROM showtime_seats WHERE showtime_id = ?',
      'INSERT INTO showtime_seats (showtime_id, seat_id, status) SELECT ?, seat_id, 1 FROM seats WHERE room_id = ? ORDER BY seat_id',
    ]);
    expect(calls(/^DELETE FROM showtime_seats/)[0][1]).toEqual([ID]);
    expect(calls(/^INSERT INTO showtime_seats/)[0][1]).toEqual([ID, 6]);
    expect(calls(/^UPDATE showtime_seats/)).toEqual([]);
  });

  test('locks old and new parents in sorted, deduplicated movie/cinema/room order before the showtime', async () => {
    state.movies.push({ ...state.movies[0], movie_id: 1 });
    state.cinemas.push({ cinema_id: 1, status: 1 });
    state.rooms.push({ room_id: 4, cinema_id: 1, room_type: '2D', status: 1 });
    await showtimes.update(ID, input({ movie_id: '1', cinema_id: '1', room_id: '4' }));
    const locked = calls(/LOCK IN SHARE MODE|FOR UPDATE/).map(([sql, params]) => [compact(sql), params]);
    expect(locked.slice(0, 7).map(([sql, params]) => [
      sql.includes('FROM movies') ? 'movie' : sql.includes('FROM cinemas') ? 'cinema' : sql.includes('FROM rooms') ? 'room' : 'showtime', params,
    ])).toEqual([
      ['movie', [1]], ['movie', [3]], ['cinema', [1]], ['cinema', [2]], ['room', [4]], ['room', [5]], ['showtime', [ID]],
    ]);
    expect(locked.slice(0, 4).every(([sql]) => sql.endsWith('LOCK IN SHARE MODE'))).toBe(true);
    expect(locked.slice(4, 7).every(([sql]) => sql.endsWith('FOR UPDATE'))).toBe(true);
    const sql = connection.query.mock.calls.map(([statement]) => compact(statement));
    expect(sql.findIndex((statement) => statement.startsWith('SELECT seat_id, status,')))
      .toBeLessThan(sql.findIndex((statement) => statement.startsWith('SELECT ticket_id')));
  });

  test('deduplicates parent locks when keeping the same movie, cinema and room', async () => {
    await showtimes.update(ID, input({ language: 'Tiếng Việt' }));
    expect(calls(/FROM movies WHERE/)).toHaveLength(1);
    expect(calls(/FROM cinemas WHERE/)).toHaveLength(1);
    expect(calls(/FROM rooms WHERE/)).toHaveLength(1);
  });

  test('retains cancellation and skips overlap checks when editing cancelled schedules', async () => {
    state.current.status = SHOWTIME_STATUS.CANCELLED;
    state.neighbors = [{ showtime_id: 99, room_id: 5, status: 1, start_time: '2030-06-15 09:00:00', end_time: '2030-06-15 14:00:00' }];
    await expect(showtimes.update(ID, input({ start_time: '11:00' }))).resolves.toBe(ID);
    expect(calls(/^SELECT showtime_id FROM showtimes/)).toEqual([]);
    expect(compact(calls(/^UPDATE showtimes /)[0][0])).not.toContain('status =');
  });

  test('does not move an already started showtime into the future', async () => {
    state.current.start_time = '2030-06-14 23:59:00';
    await expect(showtimes.update(ID, input({ start_time: '11:00' }))).rejects.toMatchObject({ status: 409, field: 'start_time' });
    expect(mutations()).toEqual([]);
  });

  test('does not move a future showtime to the past', async () => {
    await expect(showtimes.update(ID, input({ date: '2030-06-14' }))).rejects.toMatchObject({ status: 409, field: 'start_time' });
    expect(mutations()).toEqual([]);
  });
});

const protectedOperations = [
  ['update', () => showtimes.update(ID, input({ start_time: '11:00' }))],
  ['delete', () => showtimes.remove(ID)],
  ['cancel', () => showtimes.changeStatus(ID, '-1')],
];

describe.each(protectedOperations)('%s protection', (_name, operate) => {
  test.each(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'])('rejects any ticket, including order status %s', async (order_status) => {
    state.tickets = [{ ticket_id: 1, order_status, status: -1 }];
    await expect(operate()).rejects.toMatchObject({ status: 409, message: expect.stringContaining('vé') });
    const [sql, params] = calls(/^SELECT ticket_id/)[0];
    expect(compact(sql)).toBe('SELECT ticket_id FROM tickets WHERE showtime_id = ? LIMIT 1 FOR UPDATE');
    expect(params).toEqual([ID]);
    expect(mutations()).toEqual([]);
  });

  test('rejects sold inventory even without a ticket', async () => {
    state.inventory = [{ seat_id: 11, status: String(SEAT_STATUS.SOLD), active_hold: 0 }];
    await expect(operate()).rejects.toMatchObject({ status: 409, message: expect.stringContaining('ghế bán') });
    expect(mutations()).toEqual([]);
  });

  test.each(['unexpired', 'undated'])('rejects %s holds and requests DB-side Vietnam expiry comparison', async (kind) => {
    state.inventory = [{ seat_id: 11, status: '0', active_hold: '1', held_until: kind === 'undated' ? null : '2030-06-15 11:00:00' }];
    await expect(operate()).rejects.toMatchObject({ status: 409, message: expect.stringContaining('giữ') });
    const [sql, params] = calls(/^SELECT seat_id, status,/)[0];
    expect(compact(sql)).toContain('(held_until IS NULL OR held_until > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR)) AS active_hold');
    expect(compact(sql)).toContain('ORDER BY seat_id FOR UPDATE');
    expect(params).toEqual([ID]);
    expect(mutations()).toEqual([]);
  });

  test('allows expired holds using the DB-computed active_hold flag', async () => {
    state.inventory = [{ seat_id: 11, status: '0', active_hold: '0' }];
    await expect(operate()).resolves.toBe(ID);
  });

  test('rechecks current start time after child locks have waited', async () => {
    connection.query.mockImplementation(async (sql, params) => {
      const result = transactionQuery(sql, params);
      if (compact(sql).startsWith('SELECT ticket_id')) {
        Date.now.mockReturnValue(Date.parse('2030-06-15T10:00:00+07:00'));
      }
      return result;
    });
    await expect(operate()).rejects.toMatchObject({ status: 409, field: 'start_time' });
    expect(calls(/^(UPDATE showtimes|DELETE FROM showtimes) /)).toEqual([]);
  });
});

describe('admin showtime deletion', () => {
  test('deletes only the parent showtime after all guards, relying on inventory cascade', async () => {
    expect(await showtimes.remove('41')).toBe(ID);
    expect(mutations().map(([sql, params]) => [compact(sql), params])).toEqual([
      ['DELETE FROM showtimes WHERE showtime_id = ?', [ID]],
    ]);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('rejects deleting a showtime at its start time', async () => {
    Date.now.mockReturnValue(Date.parse('2030-06-15T10:00:00+07:00'));
    await expect(showtimes.remove(ID)).rejects.toMatchObject({ status: 409, field: 'start_time' });
    expect(mutations()).toEqual([]);
  });
});

describe('admin showtime status changes', () => {
  test.each(['2', '-2', '', 'OPEN', ' 1 ', null, undefined, [], {}, NaN, Infinity])('rejects invalid status %p before transactions', async (status) => {
    await expect(showtimes.changeStatus(ID, status)).rejects.toMatchObject({ status: 400, field: 'status' });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test.each([-1, 0, 1])('accepts numeric API status %s and makes repeated transitions idempotent', async (status) => {
    state.current.status = status;
    state.current.start_time = '2029-01-01 00:00:00';
    await expect(showtimes.changeStatus(ID, status)).resolves.toBe(ID);
    expect(mutations()).toEqual([]);
    expect(calls(/^SELECT ticket_id/)).toEqual([]);
  });

  test('closes an open showtime without changing schedule or invalidating tickets/holds', async () => {
    state.tickets = [{ ticket_id: 1 }];
    state.inventory = [{ seat_id: 11, status: 0, active_hold: 1 }];
    state.cinemas[0].status = 0;
    expect(await showtimes.changeStatus(ID, '0')).toBe(ID);
    expect(mutations().map(([sql, params]) => [compact(sql), params])).toEqual([
      ['UPDATE showtimes SET status = ?, end_time = ? WHERE showtime_id = ?', [0, '2030-06-15 12:15:00', ID]],
    ]);
    expect(calls(/^SELECT ticket_id|^SELECT seat_id|^SELECT showtime_id FROM showtimes/)).toEqual([]);
  });

  test('cancels a safe showtime and frees inventory before changing status', async () => {
    state.inventory = [{ seat_id: 11, status: 0, active_hold: 0 }];
    await expect(showtimes.changeStatus(ID, '-1')).resolves.toBe(ID);
    expect(mutations().map(([sql, params]) => [compact(sql), params])).toEqual([
      ['UPDATE showtime_seats SET status = 1, held_until = NULL, held_by = NULL WHERE showtime_id = ?', [ID]],
      ['UPDATE showtimes SET status = ?, end_time = ? WHERE showtime_id = ?', [-1, '2030-06-15 12:15:00', ID]],
    ]);
  });

  test('reopens a closed schedule after eligibility/overlap checks without rejecting unchanged sold tickets', async () => {
    state.current.status = SHOWTIME_STATUS.CLOSED;
    state.tickets = [{ ticket_id: 1 }];
    state.inventory = [{ seat_id: 11, status: -1, active_hold: 0 }];
    await expect(showtimes.changeStatus(ID, '1')).resolves.toBe(ID);
    expect(calls(/^SELECT seat_id FROM seats/)).toHaveLength(1);
    expect(calls(/^SELECT showtime_id FROM showtimes/)[0][1]).toEqual([5, ID, '2030-06-15 12:15:00', '2030-06-15 10:00:00']);
    expect(calls(/^SELECT ticket_id/)).toEqual([]);
    expect(calls(/^UPDATE showtime_seats/)).toEqual([]);
    expect(calls(/^UPDATE showtimes /)[0][1]).toEqual([1, '2030-06-15 12:15:00', ID]);
  });

  test.each([0, 1])('restores cancelled showtimes to status %s only after schedule and safety checks', async (target) => {
    state.current.status = SHOWTIME_STATUS.CANCELLED;
    await expect(showtimes.changeStatus(ID, target)).resolves.toBe(ID);
    expect(calls(/^SELECT ticket_id/)).toHaveLength(1);
    expect(calls(/^SELECT showtime_id FROM showtimes/)).toHaveLength(1);
    expect(calls(/^UPDATE showtime_seats/)).toHaveLength(1);
    expect(calls(/^UPDATE showtimes /)[0][1]).toEqual([target, '2030-06-15 12:15:00', ID]);
  });

  test.each([0, 1])('does not restore cancelled schedules to status %s when protected by tickets', async (target) => {
    state.current.status = SHOWTIME_STATUS.CANCELLED;
    state.tickets = [{ ticket_id: 1 }];
    await expect(showtimes.changeStatus(ID, target)).rejects.toMatchObject({ status: 409 });
    expect(mutations()).toEqual([]);
  });

  test.each([
    [0, 1, 'cinemas', { status: 0 }],
    [-1, 0, 'rooms', { status: 0 }],
    [-1, 1, 'movies', { status: MOVIE_STATUS.ENDED }],
    [0, 1, 'rooms', { room_type: 'IMAX' }],
    [0, 1, 'movies', { end_date: '2030-06-14' }],
  ])('revalidates eligibility for transition %s -> %s', async (previous, target, table, patch) => {
    state.current.status = previous;
    Object.assign(state[table][0], patch);
    await expect(showtimes.changeStatus(ID, target)).rejects.toBeInstanceOf(AppError);
    expect(mutations()).toEqual([]);
  });

  test.each([0, -1])('rejects reopening status %s when an open or closed neighbor overlaps', async (previous) => {
    state.current.status = previous;
    for (const status of [0, 1]) {
      state.neighbors = [{ showtime_id: 99, room_id: 5, status, start_time: '2030-06-15 12:14:59', end_time: '2030-06-15 13:00:00' }];
      await expect(showtimes.changeStatus(ID, '1')).rejects.toMatchObject({ status: 409, field: 'start_time' });
    }
    expect(calls(/^UPDATE showtimes /)).toEqual([]);
  });

  test('recomputes the end time from changed duration and frees safe inventory when reopening', async () => {
    state.current.status = SHOWTIME_STATUS.CLOSED;
    state.movies[0].duration = 90;
    await showtimes.changeStatus(ID, '1');
    expect(calls(/^SELECT ticket_id/)).toHaveLength(1);
    expect(calls(/^UPDATE showtime_seats/)).toHaveLength(1);
    expect(calls(/^UPDATE showtimes /)[0][1]).toEqual([1, '2030-06-15 11:45:00', ID]);
  });

  test('does not silently change ticketed schedules when reopening with a changed movie duration', async () => {
    state.current.status = SHOWTIME_STATUS.CLOSED;
    state.movies[0].duration = 90;
    state.tickets = [{ ticket_id: 1 }];
    await expect(showtimes.changeStatus(ID, '1')).rejects.toMatchObject({ status: 409 });
    expect(mutations()).toEqual([]);
  });

  test.each([0, -1])('does not change an already started open showtime to %s', async (target) => {
    Date.now.mockReturnValue(Date.parse('2030-06-15T10:00:00+07:00'));
    await expect(showtimes.changeStatus(ID, target)).rejects.toMatchObject({ status: 409, field: 'start_time' });
    expect(mutations()).toEqual([]);
  });
});
