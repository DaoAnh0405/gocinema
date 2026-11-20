process.env.NODE_ENV = 'test';
require('dotenv').config();

const request = require('supertest');
const app = require('../app');
const model = require('../models/cinemaModel');
const { pool } = require('../config/db');

const prefix = `CinemaTest_${Date.now()}`;
let admin;
let token;
let firstId;
let secondId;
let seatTypeId;
let extraIds = [];
let originalCinemas;
let originalRooms;
let originalSeats;


const cinemaData = (suffix = 'A', overrides = {}) => ({
  cinema_name: `${prefix}_${suffix}`, address: 'Địa chỉ kiểm thử', city: `${prefix}_City`,
  phone_number: '0901234567', status: '1', ...overrides,
});
const roomData = (overrides = {}) => ({ _csrf: token, room_name: 'Phòng kiểm thử', room_type: '2D', status: '1', row_count: '2', column_count: '3', ...overrides });
const roomBase = (id = firstId) => `/admin/cinemas/${id}/rooms`;
const createRoom = (data = {}, id = firstId) => admin.post(roomBase(id)).type('form').send(roomData(data));
const filters = (extra = {}) => ({ q: prefix, ...extra });

async function removeFixtures(ids) {
  if (!ids.length) return;
  await pool.query('DELETE sh FROM showtimes sh JOIN rooms r ON r.room_id = sh.room_id WHERE r.cinema_id IN (?)', [ids]);
  await pool.query('DELETE s FROM seats s JOIN rooms r ON r.room_id = s.room_id WHERE r.cinema_id IN (?)', [ids]);
  await pool.query('DELETE FROM rooms WHERE cinema_id IN (?)', [ids]);
  await pool.query('DELETE FROM cinemas WHERE cinema_id IN (?)', [ids]);
}

beforeAll(async () => {
  [originalCinemas] = await pool.query('SELECT * FROM cinemas ORDER BY cinema_id');
  [originalRooms] = await pool.query('SELECT * FROM rooms ORDER BY room_id');
  [originalSeats] = await pool.query('SELECT * FROM seats ORDER BY seat_id');
  firstId = await model.saveCinema(cinemaData());
  secondId = await model.saveCinema(cinemaData('B', { status: '0' }));
  const [types] = await pool.query('SELECT seat_type_id FROM seat_types LIMIT 1');
  seatTypeId = types[0].seat_type_id;
  admin = request.agent(app);
  const login = await admin.post('/login').type('form').send({ email: 'admin@gocinema.vn', password: 'Demo12345' });
  expect(login.status).toBe(302);
  const form = await admin.get('/admin/cinemas/new');
  expect(form.status).toBe(200);
  token = form.text.match(/name="_csrf" value="([^"]+)"/)[1];
});

beforeEach(async () => {
  await removeFixtures(extraIds);
  extraIds = [];
  await pool.query('DELETE sh FROM showtimes sh JOIN rooms r ON r.room_id = sh.room_id WHERE r.cinema_id IN (?)', [[firstId, secondId]]);
  await pool.query('DELETE s FROM seats s JOIN rooms r ON r.room_id = s.room_id WHERE r.cinema_id IN (?)', [[firstId, secondId]]);
  await pool.query('DELETE FROM rooms WHERE cinema_id IN (?)', [[firstId, secondId]]);
  await model.saveCinema(cinemaData(), firstId);
  await model.saveCinema(cinemaData('B', { status: '0' }), secondId);
});

afterAll(async () => {
  try {
    await removeFixtures([firstId, secondId, ...extraIds].filter(Boolean));
    const [cinemas] = await pool.query('SELECT * FROM cinemas ORDER BY cinema_id');
    const [rooms] = await pool.query('SELECT * FROM rooms ORDER BY room_id');
    const [seats] = await pool.query('SELECT * FROM seats ORDER BY seat_id');
    expect(cinemas).toEqual(originalCinemas);
    expect(rooms).toEqual(originalRooms);
    expect(seats).toEqual(originalSeats);
  } finally { await pool.end(); }
});

describe('Cinema and room access', () => {
  test('requires login for viewing and mutations', async () => {
    expect((await request(app).get('/admin/cinemas')).status).toBe(302);
    expect((await request(app).post('/admin/cinemas')).status).toBe(302);
    expect((await request(app).get(roomBase())).status).toBe(302);
  });

  test.each(['an.nguyen@example.com', 'staff1@gocinema.vn'])('rejects %s', async (email) => {
    const agent = request.agent(app);
    await agent.post('/login').type('form').send({ email, password: 'Demo12345' });
    expect((await agent.get('/admin/cinemas')).status).toBe(403);
    expect((await agent.post(roomBase()).type('form').send(roomData())).status).toBe(403);
  });

  test('rejects missing or incorrect CSRF tokens', async () => {
    expect((await admin.post('/admin/cinemas').type('form').send(cinemaData())).status).toBe(403);
    expect((await createRoom({ _csrf: 'invalid' })).status).toBe(403);
    expect((await admin.post(`/admin/cinemas/${firstId}/status`).type('form').send({ status: '0' })).status).toBe(403);
  });

  test.each(['abc', '0', '-1', '2147483648'])('rejects invalid cinema ID %s', async (id) => {
    expect((await admin.get(`/admin/cinemas/${id}/edit`)).status).toBe(400);
    expect((await admin.get(roomBase(id))).status).toBe(400);
  });

  test('returns 404 for a missing cinema', async () => {
    expect((await admin.get(roomBase(2147483647))).status).toBe(404);
  });
});

describe('Cinema management', () => {
  test('creates a cinema through the normal form route', async () => {
    const response = await admin.post('/admin/cinemas').type('form').send({ ...cinemaData('New'), _csrf: token });
    expect(response.status).toBe(302);
    const [rows] = await pool.query('SELECT * FROM cinemas WHERE cinema_name = ?', [`${prefix}_New`]);
    extraIds.push(...rows.map((row) => row.cinema_id));
    expect(rows).toHaveLength(1);
    expect(rows[0].phone_number).toBe('0901234567');
  });

  test('edits a cinema and accepts an unchanged form', async () => {
    const data = { ...cinemaData('Changed'), _csrf: token };
    const first = await admin.post(`/admin/cinemas/${firstId}`).type('form').send(data);
    expect(first.status).toBe(302);
    expect((await model.findCinema(firstId)).cinema_name).toBe(data.cinema_name);
    expect((await admin.post(`/admin/cinemas/${firstId}`).type('form').send(data)).status).toBe(302);
  });

  test.each([
    ['empty name', { cinema_name: '   ' }], ['long name', { cinema_name: 'a'.repeat(101) }],
    ['missing address', { address: '' }], ['missing city', { city: '' }],
    ['invalid phone', { phone_number: 'abc' }], ['long phone', { phone_number: '1'.repeat(16) }],
    ['invalid status', { status: '2' }], ['object value', { city: { invalid: true } }],
  ])('validates %s', async (_label, overrides) => {
    const response = await admin.post('/admin/cinemas').type('form').send({ ...cinemaData('Invalid', overrides), _csrf: token });
    expect(response.status).toBe(400);
    expect(response.text).toContain('Thêm/ Sửa');
  });

  test('changes status with an idempotent target value', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await admin.post(`/admin/cinemas/${firstId}/status`).type('form').send({ _csrf: token, status: '0' })).status).toBe(302);
    }
    expect((await model.findCinema(firstId)).status).toBe(0);
    expect((await admin.post(`/admin/cinemas/${firstId}/status`).type('form').send({ _csrf: token, status: '2' })).status).toBe(400);
  });

  test('combines name, city and status filters and escapes SQL-like input', async () => {
    const response = await admin.get('/admin/cinemas').query(filters({ city: `${prefix}_City`, status: '0' }));
    expect(response.status).toBe(200);
    expect(response.text).toContain(`${prefix}_B`);
    expect(response.text).not.toContain(`Sửa ${prefix}_A`);
    const result = await model.listCinemas(1, { q: "' OR 1=1 --", city: '', status: '' });
    expect(result.pagination.total).toBe(0);
  });

  test('paginates cinema results at ten rows', async () => {
    for (let index = 0; index < 10; index++) extraIds.push(await model.saveCinema(cinemaData(`Page${index}`)));
    const query = { q: prefix, city: '', status: '' };
    const first = await model.listCinemas(1, query);
    const last = await model.listCinemas(999, query);
    expect(first.rows).toHaveLength(10);
    expect(last.rows).toHaveLength(2);
    expect(last.pagination.page).toBe(2);
  });
});

describe('Room management', () => {
  test('creates and edits a room while preserving cinema ownership', async () => {
    expect((await createRoom({ cinema_id: String(secondId), total_seats: '999' })).status).toBe(302);
    const result = await model.listRooms(firstId, 1, { q: '', status: '', type: '' });
    const room = result.rows[0];
    expect(room.cinema_id).toBe(firstId);
    expect(room.seat_count).toBe(6);
    expect(room.total_seats).toBe(6);
    expect(room.row_count).toBe(2);
    expect(room.column_count).toBe(3);
    expect((await admin.get(`${roomBase()}/${room.room_id}/edit`)).status).toBe(200);
    expect((await admin.post(`${roomBase()}/${room.room_id}`).type('form').send(roomData({ room_name: 'Phòng mới', room_type: 'IMAX' }))).status).toBe(302);
    expect((await model.findRoom(firstId, room.room_id)).room_type).toBe('IMAX');
  });

  test.each([
    ['empty name', { room_name: '' }], ['long name', { room_name: 'a'.repeat(51) }],
    ['invalid format', { room_type: '4D' }], ['invalid status', { status: '-1' }],
    ['zero rows', { row_count: '0' }], ['negative columns', { column_count: '-1' }],
    ['fractional rows', { row_count: '1.5' }], ['missing columns', { column_count: '' }],
    ['rows beyond ZZ', { row_count: '703' }], ['excessive columns', { column_count: '101' }],
  ])('validates %s', async (_label, values) => {
    expect((await createRoom(values)).status).toBe(400);
  });

  test('prevents duplicate names within a cinema but allows them in another cinema', async () => {
    expect((await createRoom()).status).toBe(302);
    expect((await createRoom()).status).toBe(409);
    expect((await createRoom({}, secondId)).status).toBe(302);
  });

  test('serializes simultaneous submissions of the same room name', async () => {
    const responses = await Promise.all([createRoom(), createRoom()]);
    expect(responses.map((response) => response.status).sort()).toEqual([302, 409]);
  });

  test('blocks cross-cinema reads and writes', async () => {
    const id = await model.saveRoom(firstId, { room_name: 'Private room', room_type: '2D', status: 1 });
    expect((await admin.get(`${roomBase(secondId)}/${id}/edit`)).status).toBe(404);
    expect((await admin.get(`${roomBase(secondId)}/${id}/seats`)).status).toBe(404);
    expect((await admin.post(`${roomBase(secondId)}/${id}`).type('form').send(roomData())).status).toBe(404);
    expect((await admin.post(`${roomBase(secondId)}/${id}/status`).type('form').send({ _csrf: token, status: '0' })).status).toBe(404);
    expect((await model.findRoom(firstId, id)).status).toBe(1);
  });

  test('supports maintenance and activation', async () => {
    const id = await model.saveRoom(firstId, { room_name: 'Maintenance room', room_type: '2D', status: 1 });
    for (const status of ['0', '1']) {
      expect((await admin.post(`${roomBase()}/${id}/status`).type('form').send({ _csrf: token, status })).status).toBe(302);
      expect((await model.findRoom(firstId, id)).status).toBe(Number(status));
    }
  });

  test('counts real seats and renders room validation errors with the real count', async () => {
    const id = await model.saveRoom(firstId, { room_name: 'Seats room', room_type: '2D', status: 1 });
    await pool.query('INSERT INTO seats (room_id, seat_row, seat_number, seat_type_id) VALUES (?, ?, ?, ?), (?, ?, ?, ?)', [id, 'A', 1, seatTypeId, id, 'A', 2, seatTypeId]);
    expect((await model.findRoom(firstId, id)).seat_count).toBe(2);
    const response = await admin.post(`${roomBase()}/${id}`).type('form').send(roomData({ room_name: '' }));
    expect(response.status).toBe(400);
    expect(response.text).toContain('1 hàng x 2 cột');
    const cinemas = await model.listCinemas(1, { q: `${prefix}_A`, city: '', status: '' });
    expect(cinemas.rows[0].room_count).toBe(1);
  });

  test('paginates rooms and combines type and status filters', async () => {
    for (let index = 0; index < 12; index++) {
      await model.saveRoom(firstId, { room_name: `Room ${index}`, room_type: '3D', status: 0 });
    }
    const filter = { q: 'Room', type: '3D', status: '0' };
    expect((await model.listRooms(firstId, 1, filter)).rows).toHaveLength(10);
    expect((await model.listRooms(firstId, 2, filter)).rows).toHaveLength(2);
    const response = await admin.get(roomBase()).query({ ...filter, page: 2 });
    expect(response.status).toBe(200);
    const text = response.text.replace(/\s+/g, ' ');
    expect(text).toContain('11 - 12 / 12');
    expect(text).toContain('Room 10');
    expect(text).toContain('Room 11');
    expect(text).not.toContain('Room 9');
    expect(text).toContain('type=3D');
  });

  test('resizes an unused grid while preserving IDs and types of retained seats', async () => {
    await createRoom();
    const { rows: [room] } = await model.listRooms(firstId, 1, { q: '', status: '', type: '' });
    const before = await model.listSeats(firstId, room.room_id);
    const response = await admin.post(`${roomBase()}/${room.room_id}`).type('form').send(roomData({ row_count: '3', column_count: '4' }));
    expect(response.status).toBe(302);
    const expanded = await model.listSeats(firstId, room.room_id);
    expect(expanded).toHaveLength(12);
    expect(expanded.filter((seat) => before.some((old) => old.seat_id === seat.seat_id))).toEqual(before);
    expect((await admin.post(`${roomBase()}/${room.room_id}`).type('form').send(roomData({ row_count: '1', column_count: '2' }))).status).toBe(302);
    expect((await model.findRoom(firstId, room.room_id)).total_seats).toBe(2);
    expect((await model.listSeats(firstId, room.room_id)).map((seat) => seat.seat_id)).toEqual(before.slice(0, 2).map((seat) => seat.seat_id));
  });

  test('keeps gaps in an existing layout when dimensions stay unchanged', async () => {
    await createRoom();
    const { rows: [room] } = await model.listRooms(firstId, 1, { q: '', status: '', type: '' });
    await pool.query('DELETE FROM seats WHERE room_id = ? AND seat_row = ? AND seat_number = ?', [room.room_id, 'B', 1]);
    const original = await model.listSeats(firstId, room.room_id);
    expect((await admin.post(`${roomBase()}/${room.room_id}`).type('form').send(roomData())).status).toBe(302);
    expect(await model.listSeats(firstId, room.room_id)).toEqual(original);
    expect((await model.findRoom(firstId, room.room_id)).total_seats).toBe(5);
    const page = await admin.get(`${roomBase()}/${room.room_id}/seats`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('MÀN HÌNH');
    expect(page.text).toContain('data-seatEditor');
  });

  test('rolls back room updates when shrinking over a sold seat', async () => {
    await createRoom();
    const { rows: [room] } = await model.listRooms(firstId, 1, { q: '', status: '', type: '' });
    const [movies] = await pool.query('SELECT movie_id FROM movies LIMIT 1');
    const [showtime] = await pool.query(`INSERT INTO showtimes (movie_id, room_id, start_time, end_time, screen_format)
      VALUES (?, ?, '2040-01-01 10:00:00', '2040-01-01 12:00:00', '2D')`, [movies[0].movie_id, room.room_id]);
    const before = await model.listSeats(firstId, room.room_id);
    await pool.query('INSERT INTO showtime_seats (showtime_id, seat_id, status) VALUES (?, ?, -1)', [showtime.insertId, before.at(-1).seat_id]);
    const response = await admin.post(`${roomBase()}/${room.room_id}`).type('form').send(roomData({ room_name: 'Changed', row_count: '1' }));
    expect(response.status).toBe(409);
    expect(response.text).toContain('Có ghế đang được giữ hoặc đã có vé');
    expect(await model.listSeats(firstId, room.room_id)).toEqual(before);
    expect((await model.findRoom(firstId, room.room_id)).room_name).toBe(room.room_name);
    expect((await admin.post(`${roomBase()}/${room.room_id}`).type('form').send(roomData({ room_name: 'Changed', status: '0' }))).status).toBe(302);
  });

  test('creates two-letter row labels', async () => {
    expect((await createRoom({ row_count: '27', column_count: '1' })).status).toBe(302);
    const { rows: [room] } = await model.listRooms(firstId, 1, { q: '', status: '', type: '' });
    expect(room.row_count).toBe(27);
    const seats = await model.listSeats(firstId, room.room_id);
    expect(seats).toHaveLength(27);
    expect(seats.at(-1).seat_row).toBe('AA');
  });
});
