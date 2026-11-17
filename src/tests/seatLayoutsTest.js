const request = require('supertest');
const app = require('../app');
const model = require('../models/cinemaModel');
const { pool } = require('../config/db');
const pairCoupleSeats = require('../../public/js/seat-pairs');

let admin;
let token;
let cinemaId;
let roomId;
let standard;
let vip;
let couple;
let orderIds = [];
const prefix = `SeatLayoutTest_${Date.now()}`;
const base = () => `/admin/cinemas/${cinemaId}/rooms/${roomId}/seats`;
const grid = () => ({ rows: 2, columns: 3, cells: Array.from({ length: 2 }, () => Array(3).fill(standard)) });
const post = (layout, version, extra = {}) => admin.post(base()).set('Accept', 'application/json').type('form')
  .send({ _csrf: token, layout: JSON.stringify(layout), version, ...extra });

async function cleanRooms() {
  if (orderIds.length) await pool.query('DELETE FROM orders WHERE order_id IN (?)', [orderIds]);
  orderIds = [];
  await pool.query('DELETE FROM showtimes WHERE room_id IN (SELECT room_id FROM rooms WHERE cinema_id = ?)', [cinemaId]);
  await pool.query('DELETE FROM rooms WHERE cinema_id = ?', [cinemaId]);
}

async function addShowtime() {
  const [movies] = await pool.query('SELECT movie_id FROM movies LIMIT 1');
  const [result] = await pool.query(`INSERT INTO showtimes (movie_id, room_id, start_time, end_time)
    VALUES (?, ?, '2040-01-01 10:00:00', '2040-01-01 12:00:00')`, [movies[0].movie_id, roomId]);
  await pool.query('INSERT INTO showtime_seats (showtime_id, seat_id, status) SELECT ?, seat_id, 1 FROM seats WHERE room_id = ?', [result.insertId, roomId]);
  return result.insertId;
}

beforeAll(async () => {
  cinemaId = await model.saveCinema({ cinema_name: prefix, address: 'Test', city: 'Test', status: 1 });
  const types = await model.listSeatTypes();
  standard = types.find((type) => type.seat_type_name === 'Standard').seat_type_id;
  vip = types.find((type) => type.seat_type_name === 'VIP').seat_type_id;
  couple = types.find((type) => type.seat_type_name === 'Couple').seat_type_id;
  admin = request.agent(app);
  await admin.post('/login').type('form').send({ email: 'admin@gocinema.vn', password: 'Demo12345' });
  token = (await admin.get('/admin/cinemas/new')).text.match(/name="_csrf" value="([^"]+)"/)[1];
});

beforeEach(async () => {
  await cleanRooms();
  roomId = await model.saveRoom(cinemaId, { room_name: 'Test room', room_type: '2D', status: 1 }, null, { rows: 2, columns: 3 });
});

afterAll(async () => {
  try {
    if (cinemaId) {
      await cleanRooms();
      await pool.query('DELETE FROM cinemas WHERE cinema_id = ?', [cinemaId]);
    }
  } finally { await pool.end(); }
});

test('loads the editor through the room seat route', async () => {
  const page = await admin.get(base());
  expect(page.status).toBe(200);
  expect(page.text).toContain('Sinh ghế tự động');
  expect(page.text).toContain('/js/seat-editor.js');
  expect(page.text).toContain('Lưu sơ đồ');
});

test('saves changed types and removed positions while keeping retained seat IDs', async () => {
  const original = await model.readLayout(cinemaId, roomId);
  const layout = grid();
  layout.cells[0][0] = vip;
  layout.cells[1] = [0, 0, 0];
  const response = await post(layout, original.version);
  expect(response.status).toBe(200);
  const saved = await model.readLayout(cinemaId, roomId);
  expect(saved.room.seat_count).toBe(3);
  expect(saved.room.row_count).toBe(2);
  expect(saved.room.column_count).toBe(3);
  expect(saved.seats[0].seat_id).toBe(original.seats[0].seat_id);
  expect(saved.seats[0].seat_type_id).toBe(vip);
  expect(response.body.version).toBe(saved.version);
  expect((await model.findRoom(cinemaId, roomId)).total_seats).toBe(3);
});

test('keeps dimensions after removing every seat and supports an unchanged retry', async () => {
  const initial = await model.readLayout(cinemaId, roomId);
  const layout = { rows: 2, columns: 3, cells: [[0, 0, 0], [0, 0, 0]] };
  const saved = await post(layout, initial.version);
  expect(saved.status).toBe(200);
  expect((await model.findRoom(cinemaId, roomId)).row_count).toBe(2);
  expect((await model.findRoom(cinemaId, roomId)).seat_count).toBe(0);
  expect((await post(layout, saved.body.version)).status).toBe(200);
});

test.each([
  { rows: 0, columns: 3, cells: [] },
  { rows: 2, columns: 3, cells: [[1]] },
  { rows: 2, columns: 3, cells: [[0, -1, 0], [0, 0, 0]] },
  { rows: 2, columns: 3, cells: [[0, 2147483647, 0], [0, 0, 0]] },
])('rejects malformed or unknown seat data %#', async (layout) => {
  const original = await model.readLayout(cinemaId, roomId);
  expect((await post(layout, original.version)).status).toBe(400);
  expect((await model.readLayout(cinemaId, roomId)).version).toBe(original.version);
});

test('rejects invalid JSON, missing CSRF and cross-cinema requests', async () => {
  const original = await model.readLayout(cinemaId, roomId);
  expect((await post(grid(), original.version, { layout: '{' })).status).toBe(400);
  expect((await post(grid(), original.version, { _csrf: 'invalid' })).status).toBe(403);
  expect((await admin.post(`/admin/cinemas/2147483647/rooms/${roomId}/seats`).set('Accept', 'application/json')
    .type('form').send({ _csrf: token, layout: JSON.stringify(grid()), version: original.version })).status).toBe(404);
  expect((await request(app).post(base())).status).toBe(302);
});

test('rejects a stale editor and serializes concurrent saves', async () => {
  const initial = await model.readLayout(cinemaId, roomId);
  const first = grid();
  first.cells[0][0] = vip;
  const second = grid();
  second.cells[0][1] = vip;
  const responses = await Promise.all([post(first, initial.version), post(second, initial.version)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await post(grid(), initial.version)).status).toBe(409);
});

test.each([-1, 0])('protects sold or actively held seats with status %s', async (status) => {
  await addShowtime();
  const initial = await model.readLayout(cinemaId, roomId);
  await pool.query('UPDATE showtime_seats SET status = ?, held_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE seat_id = ?', [status, initial.seats[0].seat_id]);
  const layout = grid();
  layout.cells[0][0] = 0;
  expect((await post(layout, initial.version)).status).toBe(409);
  expect((await model.readLayout(cinemaId, roomId)).version).toBe(initial.version);
  layout.cells[0][0] = standard;
  layout.cells[0][1] = vip;
  expect((await post(layout, initial.version)).status).toBe(200);
});

test('synchronizes available showtime seats when expanding and removing expired holds', async () => {
  const showtimeId = await addShowtime();
  const initial = await model.readLayout(cinemaId, roomId);
  await pool.query('UPDATE showtime_seats SET status = 0, held_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE seat_id = ?', [initial.seats[0].seat_id]);
  const layout = grid();
  layout.rows = 3;
  layout.cells.push([standard, standard, standard]);
  layout.cells[0][0] = 0;
  expect((await post(layout, initial.version)).status).toBe(200);
  const [inventory] = await pool.query('SELECT * FROM showtime_seats WHERE showtime_id = ?', [showtimeId]);
  expect(inventory).toHaveLength(8);
  expect(inventory.every((seat) => seat.status === 1)).toBe(true);
});

test('protects ticket references even when inventory is marked available', async () => {
  const showtimeId = await addShowtime();
  const initial = await model.readLayout(cinemaId, roomId);
  const [order] = await pool.query('INSERT INTO orders (order_code) VALUES (?)', [`ST${Date.now()}`]);
  orderIds.push(order.insertId);
  await pool.query('INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code) VALUES (?, ?, ?, 70000, ?)',
    [order.insertId, showtimeId, initial.seats[0].seat_id, `${prefix}_QR`]);
  const layout = grid();
  layout.cells[0][0] = vip;
  expect((await post(layout, initial.version)).status).toBe(409);
  expect((await model.readLayout(cinemaId, roomId)).version).toBe(initial.version);
});

test('adds inventory only for new seats and preserves deliberately absent inventory', async () => {
  const showtimeId = await addShowtime();
  const initial = await model.readLayout(cinemaId, roomId);
  await pool.query('DELETE FROM showtime_seats WHERE showtime_id = ? AND seat_id = ?', [showtimeId, initial.seats[0].seat_id]);
  const layout = grid();
  layout.rows = 3;
  layout.cells.push([standard, standard, standard]);
  expect((await post(layout, initial.version)).status).toBe(200);
  const [inventory] = await pool.query('SELECT seat_id FROM showtime_seats WHERE showtime_id = ?', [showtimeId]);
  expect(inventory).toHaveLength(8);
  expect(inventory.some((seat) => seat.seat_id === initial.seats[0].seat_id)).toBe(false);
});

test('keeps H1–H2 fixed when H3 becomes Couple, including after saving and reloading', async () => {
  const initial = await model.readLayout(cinemaId, roomId);
  const layout = { rows: 8, columns: 4, cells: Array.from({ length: 8 }, () => Array(4).fill(standard)), pairs: [] };
  layout.cells[7][0] = couple;
  layout.cells[7][1] = couple;
  layout.pairs = pairCoupleSeats(layout.cells, couple, layout.pairs);
  expect(layout.pairs).toEqual([[7, 0]]);
  const first = await post(layout, initial.version);
  expect(first.status).toBe(200);

  layout.cells[7][2] = couple;
  layout.pairs = pairCoupleSeats(layout.cells, couple, layout.pairs);
  expect(layout.pairs).toEqual([[7, 0]]);
  expect((await post(layout, first.body.version)).status).toBe(200);
  const reloaded = await model.readLayout(cinemaId, roomId);
  expect(reloaded.pairs).toEqual([[7, 0]]);
  const page = await admin.get(base());
  const encoded = page.text.match(/name="layout" value="([^"]+)"/)[1];
  expect(JSON.parse(encoded.replace(/&#34;|&quot;/g, '"')).pairs).toEqual([[7, 0]]);

  layout.cells[7][3] = couple;
  layout.pairs = pairCoupleSeats(layout.cells, couple, reloaded.pairs);
  expect(layout.pairs).toEqual([[7, 0], [7, 2]]);
  expect((await post(layout, reloaded.version)).status).toBe(200);
  expect((await model.readLayout(cinemaId, roomId)).pairs).toEqual([[7, 0], [7, 2]]);
});

test('keeps H2–H3 fixed when H1 becomes Couple and prevents overlapping pairs', async () => {
  const cells = [[standard, couple, couple, standard]];
  const pairs = pairCoupleSeats(cells, couple);
  expect(pairs).toEqual([[0, 1]]);
  cells[0][0] = couple;
  expect(pairCoupleSeats(cells, couple, pairs)).toEqual([[0, 1]]);
  const initial = await model.readLayout(cinemaId, roomId);
  const layout = { rows: 1, columns: 4, cells: [[couple, couple, couple, couple]], pairs: [[0, 0], [0, 1]] };
  expect((await post(layout, initial.version)).status).toBe(400);
  layout.pairs = [[0, 3]];
  expect((await post(layout, initial.version)).status).toBe(400);
  layout.pairs = [[0, 0]];
  layout.cells[0][1] = standard;
  expect((await post(layout, initial.version)).status).toBe(400);
  expect((await model.readLayout(cinemaId, roomId)).version).toBe(initial.version);
});

test('preserves pair boundaries through room resizing and includes pairs in conflict detection', async () => {
  const initial = await model.readLayout(cinemaId, roomId);
  const layout = { rows: 1, columns: 4, cells: [[couple, couple, couple, couple]], pairs: [[0, 1]] };
  const saved = await post(layout, initial.version);
  expect(saved.status).toBe(200);
  expect((await model.readLayout(cinemaId, roomId)).pairs).toEqual([[0, 1]]);
  await model.saveRoom(cinemaId, { room_name: 'Resized', room_type: '2D', status: 1 }, roomId, { rows: 2, columns: 4 });
  const expanded = await model.readLayout(cinemaId, roomId);
  expect(expanded.pairs).toEqual([[0, 1]]);
  const next = { rows: 2, columns: 4, cells: [layout.cells[0], Array(4).fill(standard)], pairs: [[0, 0], [0, 2]] };
  const response = await post(next, expanded.version);
  expect(response.status).toBe(200);
  expect(response.body.version).not.toBe(expanded.version);
  expect((await post(next, expanded.version)).status).toBe(409);
});
