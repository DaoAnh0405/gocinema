const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const crypto = require('crypto');
const parseLayout = require('../validators/seatLayoutValidator');
const pairCoupleSeats = require('../../public/js/seatPairs');

// Row labels support both existing single-letter and two-letter seat rows.
const seatSummary = `LEFT JOIN (SELECT room_id, COUNT(*) AS seat_count,
  MAX(CASE WHEN CHAR_LENGTH(seat_row) = 1 THEN ASCII(UPPER(seat_row)) - 64
    ELSE (ASCII(UPPER(LEFT(seat_row, 1))) - 64) * 26 + ASCII(UPPER(RIGHT(seat_row, 1))) - 64 END) AS row_count,
  MAX(seat_number) AS column_count FROM seats GROUP BY room_id) s ON s.room_id = r.room_id
  LEFT JOIN room_layouts l ON l.room_id = r.room_id`;
const seatColumns = `COALESCE(s.seat_count, 0) AS seat_count,
  GREATEST(COALESCE(l.row_count, 0), COALESCE(s.row_count, 0)) AS row_count,
  GREATEST(COALESCE(l.column_count, 0), COALESCE(s.column_count, 0)) AS column_count`;

function pageInfo(requested, total) {
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const number = Number(requested);
  const page = Math.min(Number.isSafeInteger(number) && number > 0 ? number : 1, totalPages);
  return { page, pageSize: 10, total, totalPages, offset: (page - 1) * 10 };
}

function resultPage(rows, pagination) {
  return { rows, pagination: { ...pagination, start: pagination.total ? pagination.offset + 1 : 0, end: pagination.offset + rows.length } };
}

function searchPattern(value) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

async function listCinemas(page, filters) {
  const conditions = [];
  const values = [];
  if (filters.q) {
    conditions.push('(c.cinema_name LIKE ? OR c.address LIKE ?)');
    values.push(searchPattern(filters.q), searchPattern(filters.q));
  }
  if (filters.city) { conditions.push('c.city = ?'); values.push(filters.city); }
  if (filters.status !== '') { conditions.push('c.status = ?'); values.push(filters.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [count] = await query(`SELECT COUNT(*) AS total FROM cinemas c ${where}`, values);
  const pagination = pageInfo(page, Number(count.total));
  const rows = await query(`SELECT c.*,
    (SELECT COUNT(*) FROM rooms r WHERE r.cinema_id = c.cinema_id) AS room_count
    FROM cinemas c ${where} ORDER BY c.cinema_id
    LIMIT ? OFFSET ?`, [...values, pagination.pageSize, pagination.offset]);
  return resultPage(rows, pagination);
}

function listCities() {
  return query("SELECT DISTINCT city FROM cinemas WHERE city IS NOT NULL AND city <> '' ORDER BY city");
}

async function findCinema(id) {
  const rows = await query('SELECT * FROM cinemas WHERE cinema_id = ?', [id]);
  if (!rows.length) throw new AppError('Rạp không tồn tại.', 404);
  return rows[0];
}

async function saveCinema(values, id = null) {
  if (!id) {
    const result = await query('INSERT INTO cinemas SET ?', [values]);
    return result.insertId;
  }
  const result = await query('UPDATE cinemas SET ? WHERE cinema_id = ?', [values, id]);
  if (!result.affectedRows) throw new AppError('Rạp không tồn tại.', 404);
  return Number(id);
}

async function setCinemaStatus(id, status) {
  const result = await query('UPDATE cinemas SET status = ? WHERE cinema_id = ?', [status, id]);
  if (!result.affectedRows) throw new AppError('Rạp không tồn tại.', 404);
}

async function listRooms(cinemaId, page, filters) {
  const conditions = ['r.cinema_id = ?'];
  const values = [cinemaId];
  if (filters.q) { conditions.push('r.room_name LIKE ?'); values.push(searchPattern(filters.q)); }
  if (filters.type) { conditions.push('r.room_type = ?'); values.push(filters.type); }
  if (filters.status !== '') { conditions.push('r.status = ?'); values.push(filters.status); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [count] = await query(`SELECT COUNT(*) AS total FROM rooms r ${where}`, values);
  const pagination = pageInfo(page, Number(count.total));
  const rows = await query(`SELECT r.*, ${seatColumns}
    FROM rooms r ${seatSummary} ${where} ORDER BY r.room_id LIMIT ? OFFSET ?`, [...values, pagination.pageSize, pagination.offset]);
  return resultPage(rows, pagination);
}

async function findRoom(cinemaId, roomId) {
  const rows = await query(`SELECT r.*, ${seatColumns}
    FROM rooms r ${seatSummary} WHERE r.cinema_id = ? AND r.room_id = ?`, [cinemaId, roomId]);
  if (!rows.length) throw new AppError('Phòng chiếu không tồn tại trong rạp này.', 404);
  return rows[0];
}

function rowLabel(number) {
  let label = '';
  for (let index = number; index > 0; index = Math.floor((index - 1) / 26)) {
    label = String.fromCharCode(65 + (index - 1) % 26) + label;
  }
  return label;
}

async function resizeGrid(connection, roomId, grid) {
  const [seats] = await connection.query('SELECT * FROM seats WHERE room_id = ? FOR UPDATE', [roomId]);
  const currentRows = [...new Set(seats.map((seat) => seat.seat_row))];
  const [layouts] = await connection.query('SELECT * FROM room_layouts WHERE room_id = ?', [roomId]);
  const maxRow = Math.max(layouts[0]?.row_count || 0, currentRows.reduce((max, label) => Math.max(max, rowNumber(label)), 0));
  const maxColumn = Math.max(layouts[0]?.column_count || 0, seats.reduce((max, seat) => Math.max(max, seat.seat_number), 0));
  // Keep irregular layouts and all seat IDs when only room details are edited.
  if (maxRow === grid.rows && maxColumn === grid.columns) {
    await connection.query('UPDATE rooms SET total_seats = ? WHERE room_id = ?', [seats.length, roomId]);
    return;
  }
  const [types] = await connection.query("SELECT seat_type_id, seat_type_name FROM seat_types WHERE seat_type_name IN ('Standard', 'Couple')");
  const standard = types.find((type) => type.seat_type_name === 'Standard');
  const couple = types.find((type) => type.seat_type_name === 'Couple');
  if (!standard) throw new AppError('Chưa có loại ghế Standard để tạo sơ đồ ghế.', 409);
  const positions = new Map(seats.map((seat) => [`${seat.seat_row}:${seat.seat_number}`, seat.seat_type_id]));
  const cells = Array.from({ length: grid.rows }, (_, row) => Array.from({ length: grid.columns }, (_, column) =>
    positions.get(`${rowLabel(row + 1)}:${column + 1}`) ||
      (row < maxRow && column < maxColumn ? 0 : standard.seat_type_id)));
  const pairs = pairCoupleSeats(cells, couple?.seat_type_id, storedPairs(layouts[0]));
  await persistLayout(connection, roomId, seats, { ...grid, cells, pairs });
}

function rowNumber(label) {
  return [...label.toUpperCase()].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function storedPairs(layout) {
  const value = layout?.couple_pairs;
  return typeof value === 'string' ? JSON.parse(value) : value || [];
}

function layoutVersion(room, seats, pairs) {
  return crypto.createHash('sha256').update(JSON.stringify({
    rows: room.row_count, columns: room.column_count,
    seats: seats.map((seat) => [seat.seat_id, seat.seat_row, seat.seat_number, seat.seat_type_id]),
    pairs,
  })).digest('hex');
}

async function loadLayout(connection, cinemaId, roomId) {
  const [cinemas] = await connection.query('SELECT cinema_id FROM cinemas WHERE cinema_id = ? FOR UPDATE', [cinemaId]);
  if (!cinemas.length) throw new AppError('Rạp không tồn tại.', 404);
  const [rooms] = await connection.query('SELECT * FROM rooms WHERE cinema_id = ? AND room_id = ? FOR UPDATE', [cinemaId, roomId]);
  if (!rooms.length) throw new AppError('Phòng chiếu không tồn tại trong rạp này.', 404);
  const [seats] = await connection.query(`SELECT s.*, t.seat_type_name FROM seats s
    JOIN seat_types t ON t.seat_type_id = s.seat_type_id WHERE s.room_id = ?
    ORDER BY CHAR_LENGTH(s.seat_row), s.seat_row, s.seat_number FOR UPDATE`, [roomId]);
  const [layouts] = await connection.query('SELECT * FROM room_layouts WHERE room_id = ?', [roomId]);
  const room = { ...rooms[0], seat_count: seats.length,
    row_count: seats.reduce((max, seat) => Math.max(max, rowNumber(seat.seat_row)), layouts[0]?.row_count || 0),
    column_count: seats.reduce((max, seat) => Math.max(max, seat.seat_number), layouts[0]?.column_count || 0),
  };
  const positions = new Map(seats.map((seat) => [`${seat.seat_row}:${seat.seat_number}`, seat.seat_type_id]));
  const cells = Array.from({ length: room.row_count }, (_, row) => Array.from({ length: room.column_count }, (_, column) =>
    positions.get(`${rowLabel(row + 1)}:${column + 1}`) || 0));
  const couple = seats.find((seat) => seat.seat_type_name === 'Couple');
  const pairs = pairCoupleSeats(cells, couple?.seat_type_id, storedPairs(layouts[0]));
  return { room, seats, pairs, version: layoutVersion(room, seats, pairs) };
}

async function persistLayout(connection, roomId, seats, grid) {
  const [showtimes] = await connection.query('SELECT showtime_id FROM showtimes WHERE room_id = ? FOR UPDATE', [roomId]);
  const positions = new Map(seats.map((seat) => [`${seat.seat_row}:${seat.seat_number}`, seat]));
  const desired = new Map();
  const added = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const type = grid.cells[row][column];
      if (!type) continue;
      const label = rowLabel(row + 1);
      const key = `${label}:${column + 1}`;
      desired.set(key, type);
      if (!positions.has(key)) added.push([roomId, label, column + 1, type]);
    }
  }
  const changed = seats.filter((seat) => desired.get(`${seat.seat_row}:${seat.seat_number}`) !== seat.seat_type_id);
  const changedIds = changed.map((seat) => seat.seat_id);
  if (changedIds.length) {
    const [inventory] = await connection.query(`SELECT seat_id, status, held_until FROM showtime_seats
      WHERE seat_id IN (?) FOR UPDATE`, [changedIds]);
    const [tickets] = await connection.query('SELECT seat_id FROM tickets WHERE seat_id IN (?) LIMIT 1 FOR UPDATE', [changedIds]);
    const [clock] = await connection.query('SELECT NOW() AS db_now');
    const blocked = inventory.some((seat) => seat.status === -1 ||
      (seat.status === 0 && (!seat.held_until || seat.held_until > clock[0].db_now)));
    if (tickets.length || blocked) throw new AppError('Có ghế đang được giữ hoặc đã có vé. Vui lòng giữ nguyên loại và vị trí của các ghế đó.', 409);
  }
  const removed = changed.filter((seat) => !desired.has(`${seat.seat_row}:${seat.seat_number}`));
  if (removed.length) {
    const ids = removed.map((seat) => seat.seat_id);
    await connection.query('DELETE FROM showtime_seats WHERE seat_id IN (?)', [ids]);
    await connection.query('DELETE FROM seats WHERE room_id = ? AND seat_id IN (?)', [roomId, ids]);
  }
  for (const seat of changed) {
    const type = desired.get(`${seat.seat_row}:${seat.seat_number}`);
    if (type) await connection.query('UPDATE seats SET seat_type_id = ? WHERE seat_id = ?', [type, seat.seat_id]);
  }
  if (added.length) {
    await connection.query('INSERT INTO seats (room_id, seat_row, seat_number, seat_type_id) VALUES ?', [added]);
    if (showtimes.length) {
      const existingIds = seats.map((seat) => seat.seat_id);
      const [newSeats] = await connection.query(`SELECT seat_id FROM seats WHERE room_id = ?
        ${existingIds.length ? 'AND seat_id NOT IN (?)' : ''}`, existingIds.length ? [roomId, existingIds] : [roomId]);
      await connection.query(`INSERT INTO showtime_seats (showtime_id, seat_id, status)
        SELECT sh.showtime_id, s.seat_id, 1 FROM showtimes sh JOIN seats s ON s.room_id = sh.room_id
        WHERE sh.room_id = ? AND sh.end_time > NOW() AND s.seat_id IN (?)`, [roomId, newSeats.map((seat) => seat.seat_id)]);
    }
  }
  await connection.query(`INSERT INTO room_layouts (room_id, row_count, column_count, couple_pairs) VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE row_count = VALUES(row_count), column_count = VALUES(column_count), couple_pairs = VALUES(couple_pairs)`,
    [roomId, grid.rows, grid.columns, JSON.stringify(grid.pairs)]);
  await connection.query('UPDATE rooms SET total_seats = ? WHERE room_id = ?', [desired.size, roomId]);
}

function readLayout(cinemaId, roomId) {
  return withTransaction((connection) => loadLayout(connection, cinemaId, roomId));
}

function saveLayout(cinemaId, roomId, grid, version) {
  grid = parseLayout(grid);
  if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new AppError('Phiên bản sơ đồ không hợp lệ. Hãy tải lại trang.', 400);
  return withTransaction(async (connection) => {
    const current = await loadLayout(connection, cinemaId, roomId);
    if (version !== current.version) throw new AppError('Sơ đồ đã được cập nhật ở phiên khác. Hãy tải lại trang trước khi chỉnh sửa tiếp.', 409);
    const [types] = await connection.query('SELECT seat_type_id, seat_type_name FROM seat_types');
    const allowed = new Set([0, ...types.map((type) => type.seat_type_id)]);
    if (grid.cells.some((row) => row.some((type) => !allowed.has(type)))) throw new AppError('Loại ghế không tồn tại.', 400);
    const couple = types.find((type) => type.seat_type_name === 'Couple');
    if (grid.pairs?.some(([row, column]) => !couple || grid.cells[row][column] !== couple.seat_type_id ||
        grid.cells[row][column + 1] !== couple.seat_type_id)) throw new AppError('Hai vị trí ghép đôi phải cùng loại Couple.', 400);
    grid.pairs = pairCoupleSeats(grid.cells, couple?.seat_type_id, grid.pairs ?? current.pairs);
    await persistLayout(connection, Number(roomId), current.seats, grid);
    return (await loadLayout(connection, cinemaId, roomId)).version;
  });
}

function listSeatTypes() {
  return query('SELECT seat_type_id, seat_type_name FROM seat_types ORDER BY seat_type_id');
}

function saveRoom(cinemaId, values, id = null, grid = null) {
  return withTransaction(async (connection) => {
    // A parent-row lock serializes room creation and renaming within one cinema.
    const [cinemas] = await connection.query('SELECT cinema_id FROM cinemas WHERE cinema_id = ? FOR UPDATE', [cinemaId]);
    if (!cinemas.length) throw new AppError('Rạp không tồn tại.', 404);
    if (id) {
      const [rows] = await connection.query('SELECT room_id FROM rooms WHERE cinema_id = ? AND room_id = ? FOR UPDATE', [cinemaId, id]);
      if (!rows.length) throw new AppError('Phòng chiếu không tồn tại trong rạp này.', 404);
    }
    const [duplicates] = await connection.query('SELECT room_id FROM rooms WHERE cinema_id = ? AND room_name = ? AND room_id <> ? LIMIT 1', [cinemaId, values.room_name, id || 0]);
    if (duplicates.length) throw new AppError('Tên phòng chiếu đã tồn tại trong rạp này.', 409);
    if (id) {
      await connection.query('UPDATE rooms SET ? WHERE cinema_id = ? AND room_id = ?', [values, cinemaId, id]);
      if (grid) await resizeGrid(connection, Number(id), grid);
      return Number(id);
    }
    const [result] = await connection.query('INSERT INTO rooms SET ?', [{ ...values, cinema_id: cinemaId, total_seats: 0 }]);
    if (grid) await resizeGrid(connection, result.insertId, grid);
    return result.insertId;
  });
}

async function setRoomStatus(cinemaId, roomId, status) {
  const result = await query('UPDATE rooms SET status = ? WHERE cinema_id = ? AND room_id = ?', [status, cinemaId, roomId]);
  if (!result.affectedRows) throw new AppError('Phòng chiếu không tồn tại trong rạp này.', 404);
}

async function listSeats(cinemaId, roomId) {
  await findRoom(cinemaId, roomId);
  return query(`SELECT s.*, t.seat_type_name FROM seats s JOIN seat_types t ON t.seat_type_id = s.seat_type_id
    WHERE s.room_id = ? ORDER BY CHAR_LENGTH(s.seat_row), s.seat_row, s.seat_number`, [roomId]);
}

module.exports = { listCinemas, listCities, findCinema, saveCinema, setCinemaStatus, listRooms, findRoom, saveRoom, setRoomStatus, listSeats, rowLabel, readLayout, saveLayout, listSeatTypes };
