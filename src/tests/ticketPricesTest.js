process.env.NODE_ENV = 'test';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const prices = require('../models/ticketPriceModel');
const { requirePermission } = require('../middlewares/permission');

let admin;
let csrf;
let seatId;
let initialPrices;
let originalSql;

function sqlHashes() {
  return ['seed.sql', 'schema.sql', 'seed_test.sql'].map((name) =>
    crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../database', name))).digest('hex'));
}

function validPrice(overrides = {}) {
  return {
    _csrf: csrf, seat_type_id: String(seatId), price: '200000',
    screen_format: '2D', day_type: 'WEEKDAY',
    time_from: '10:00:00', time_to: '12:00:00',
    valid_from: '2098-01-01', valid_to: '2098-01-10', ...overrides,
  };
}

function createPrice(overrides = {}) {
  return admin.post('/admin/prices').type('form').send(validPrice(overrides));
}

async function fixtureRows() {
  const [rows] = await pool.query('SELECT * FROM ticket_prices WHERE seat_type_id = ? ORDER BY price_id', [seatId]);
  return rows;
}

beforeAll(async () => {
  originalSql = sqlHashes();
  [initialPrices] = await pool.query('SELECT * FROM ticket_prices ORDER BY price_id');
  const [seat] = await pool.query('INSERT INTO seat_types (seat_type_name) VALUES (?)', [`TestPrices_${Date.now()}`]);
  seatId = seat.insertId;
  admin = request.agent(app);
  const login = await admin.post('/login').type('form').send({ email: 'admin@gocinema.vn', password: 'Demo12345' });
  expect(login.status).toBe(302);
  const form = await admin.get('/admin/prices/new');
  expect(form.status).toBe(200);
  csrf = form.text.match(/name="_csrf" value="([^"]+)"/)[1];
});

beforeEach(async () => {
  if (seatId) await pool.query('DELETE FROM ticket_prices WHERE seat_type_id = ?', [seatId]);
});

afterAll(async () => {
  try {
    if (seatId) {
      await pool.query('DELETE FROM ticket_prices WHERE seat_type_id = ?', [seatId]);
      await pool.query('DELETE FROM seat_types WHERE seat_type_id = ?', [seatId]);
    }
    const [currentPrices] = await pool.query('SELECT * FROM ticket_prices ORDER BY price_id');
    expect(currentPrices).toEqual(initialPrices);
    expect(sqlHashes()).toEqual(originalSql);
  } finally {
    await pool.end();
  }
});

describe('Ticket price authorization', () => {
  test('guests must log in for viewing and creating prices', async () => {
    for (const response of [await request(app).get('/admin/prices'), await request(app).post('/admin/prices')]) {
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    }
  });

  test.each(['an.nguyen@example.com', 'staff1@gocinema.vn'])('%s cannot view or modify admin prices', async (email) => {
    const user = request.agent(app);
    await user.post('/login').type('form').send({ email, password: 'Demo12345' });
    expect((await user.get('/admin/prices')).status).toBe(403);
    expect((await user.post('/admin/prices').type('form').send(validPrice())).status).toBe(403);
  });

  test('MANAGE_PRICES permission is required', () => {
    const next = jest.fn();
    requirePermission('MANAGE_PRICES')({ session: { user: { role: 'ADMIN', permissions: [] } } }, {}, next);
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test.each([undefined, 'invalid'])('rejects missing or incorrect CSRF token (%s)', async (token) => {
    expect((await createPrice({ _csrf: token })).status).toBe(403);
    expect(await fixtureRows()).toHaveLength(0);
  });
});

describe('Ticket price validation', () => {
  test.each([
    ['negative price', { price: '-1' }],
    ['fractional price', { price: '1.5' }],
    ['price beyond DECIMAL(10,0)', { price: '10000000000' }],
    ['missing price', { price: '' }],
    ['array value', { price: ['1', '2'] }],
    ['unknown seat', { seat_type_id: '2147483647' }],
    ['invalid seat ID', { seat_type_id: 'abc' }],
    ['invalid format', { screen_format: '4D' }],
    ['invalid day', { day_type: 'OTHER' }],
    ['invalid clock time', { time_from: '25:00:00' }],
    ['reversed times', { time_from: '17:00:00', time_to: '16:59:59' }],
    ['invalid calendar date', { valid_from: '2098-02-30' }],
    ['reversed dates', { valid_to: '2097-12-31' }],
    ['invalid date representation', { valid_from: '01/01/2098' }],
  ])('rejects %s without inserting data', async (_name, overrides) => {
    expect((await createPrice(overrides)).status).toBe(400);
    expect(await fixtureRows()).toHaveLength(0);
  });

  test.each(['0', '9999999999'])('accepts valid price boundary %s', async (price) => {
    expect((await createPrice({ price })).status).toBe(302);
    expect(Number((await fixtureRows())[0].price)).toBe(Number(price));
  });

  test('accepts mixed minute and second precision and preserves seconds', async () => {
    expect((await createPrice({ time_from: '10:00', time_to: '10:00:59' })).status).toBe(302);
    expect((await fixtureRows())[0].time_to).toBe('10:00:59');
  });
});

describe('Ticket price CRUD and overlapping intervals', () => {
  test('creates, reads, updates and deletes through HTTP routes', async () => {
    expect((await createPrice()).status).toBe(302);
    const id = (await fixtureRows())[0].price_id;
    const edit = await admin.get(`/admin/prices/${id}/edit?page=2`);
    expect(edit.status).toBe(200);
    expect(edit.text).toContain('2098-01-01');
    expect(edit.text).toContain('data-return-url="/admin/prices?page=2"');
    const update = await admin.post(`/admin/prices/${id}?page=2`).type('form').send(validPrice({ price: '210000' }));
    expect(update.status).toBe(302);
    expect(update.headers.location).toBe('/admin/prices?page=2');
    expect(Number((await fixtureRows())[0].price)).toBe(210000);
    expect((await admin.get(`/admin/prices/${id}/delete`)).status).toBe(200);
    expect((await admin.post(`/admin/prices/${id}/delete`).type('form').send({ _csrf: csrf })).status).toBe(302);
    expect(await fixtureRows()).toHaveLength(0);
    expect((await admin.get(`/admin/prices/${id}/edit`)).status).toBe(404);
    expect((await admin.post(`/admin/prices/${id}/delete`).type('form').send({ _csrf: csrf })).status).toBe(404);
  });

  test('rejects duplicate and partially overlapping rules with HTTP 409', async () => {
    await createPrice();
    expect((await createPrice()).status).toBe(409);
    expect((await createPrice({ time_from: '11:00:00', time_to: '13:00:00', valid_from: '2098-01-05' })).status).toBe(409);
    expect(await fixtureRows()).toHaveLength(1);
  });

  test('supports different formats or day types in the same interval', async () => {
    await createPrice();
    expect((await createPrice({ screen_format: '3D' })).status).toBe(302);
    expect((await createPrice({ day_type: 'HOLIDAY' })).status).toBe(302);
    expect(await fixtureRows()).toHaveLength(3);
  });

  test('checks inclusive interval boundaries for times and dates', async () => {
    await createPrice();
    expect((await createPrice({ time_from: '12:00:00', time_to: '13:00:00' })).status).toBe(409);
    expect((await createPrice({ time_from: '12:00:01', time_to: '13:00:00' })).status).toBe(302);
    expect((await createPrice({ valid_from: '2098-01-10', valid_to: '2098-01-11' })).status).toBe(409);
    expect((await createPrice({ valid_from: '2098-01-11', valid_to: '2098-01-12' })).status).toBe(302);
  });

  test('preserves unlimited time/date values and blocks overlap with them', async () => {
    expect((await createPrice({ time_from: '', time_to: '', valid_from: '', valid_to: '' })).status).toBe(302);
    const row = (await fixtureRows())[0];
    expect([row.time_from, row.time_to, row.valid_from, row.valid_to]).toEqual([null, null, null, null]);
    expect((await createPrice()).status).toBe(409);
  });

  test('an edit cannot overlap another existing record', async () => {
    await createPrice();
    await createPrice({ time_from: '13:00:00', time_to: '14:00:00' });
    const rows = await fixtureRows();
    const response = await admin.post(`/admin/prices/${rows[1].price_id}`).type('form').send(validPrice());
    expect(response.status).toBe(409);
    expect((await fixtureRows())[1].time_from).toBe('13:00:00');
  });

  test('simultaneous duplicate submissions produce only one row', async () => {
    const responses = await Promise.all([createPrice(), createPrice()]);
    expect(responses.map((response) => response.status).sort()).toEqual([302, 409]);
    expect(await fixtureRows()).toHaveLength(1);
  });

  test.each(['abc', '0', '-1', '2147483648'])('rejects invalid record ID %s', async (id) => {
    expect((await admin.get(`/admin/prices/${id}/edit`)).status).toBe(400);
  });
});

describe('Ticket price filtering and pagination', () => {
  test('limits each page to ten rows and uses stable ordering', async () => {
    const first = await prices.listPage(1);
    const second = await prices.listPage(2);
    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(10);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.price_id)).size).toBe(20);
    const last = await prices.listPage(999999);
    expect(last.pagination.page).toBe(last.pagination.totalPages);
    expect(last.rows.length).toBeLessThanOrEqual(10);
  });

  test.each(['abc', '-1', '1.5', '999999999999999999999'])('normalizes invalid page %s', async (page) => {
    expect((await prices.listPage(page)).pagination.page).toBe(1);
  });

  test('combines all three filters, preserves context and handles no matches', async () => {
    await createPrice({ screen_format: '3D', day_type: 'HOLIDAY' });
    const filters = { seat: String(seatId), format: '3D', day: 'HOLIDAY' };
    const result = await prices.listPage(1, filters);
    expect(result.rows).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    const form = await admin.get('/admin/prices/new').query(filters);
    expect(form.status).toBe(200);
    expect(form.text).toContain(`seat=${seatId}&amp;format=3D&amp;day=HOLIDAY`);
    expect((await prices.listPage(1, { ...filters, format: 'IMAX' })).pagination.total).toBe(0);
  });

  test('SQL-like input cannot widen a filtered query', async () => {
    const result = await prices.listPage(1, { seat: "0 OR 1=1" });
    expect(result.pagination.total).toBe(0);
    const response = await admin.get('/admin/prices').query({ format: "' OR 1=1 --", day: 'invalid', page: 'invalid' });
    expect(response.status).toBe(200);
  });
});
