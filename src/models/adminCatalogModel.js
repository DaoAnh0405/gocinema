const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { normalizeMovieFilters } = require('../validators/adminCatalogValidator');

const PAGE_SIZE = 7;
const MOVIE_FIELDS = [
  'title', 'description', 'duration', 'release_date', 'end_date', 'director',
  'actors', 'poster_url', 'trailer_url', 'age_rating', 'status',
];
const MOVIE_SELECT = `m.*,
  DATE_FORMAT(m.release_date, '%Y-%m-%d') AS release_date,
  DATE_FORMAT(m.end_date, '%Y-%m-%d') AS end_date`;

function catalogError(message, status, field) {
  const error = new AppError(message, status);
  error.field = field;
  return error;
}

const isReferenced = (err) => err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451;
const isMissingReference = (err) => err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452;

async function listMovies(input = {}) {
  const filters = normalizeMovieFilters(input);
  const where = [];
  const params = [];
  if (filters.q) {
    // Escape LIKE wildcards with an explicit escape character, independently of SQL mode.
    where.push("m.title LIKE ? ESCAPE '!'");
    params.push(`%${filters.q.replace(/[!%_]/g, '!$&')}%`);
  }
  if (filters.status) {
    where.push('m.status = ?');
    params.push(filters.status);
  }
  if (filters.genre) {
    where.push('EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.movie_id AND mg.genre_id = ?)');
    params.push(filters.genre);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const counts = await query(`SELECT COUNT(*) AS total FROM movies m ${clause}`, params);
  const total = Number(counts[0].total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const movies = await query(
    `SELECT ${MOVIE_SELECT},
       (SELECT GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ')
        FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
        WHERE mg.movie_id = m.movie_id) AS genres
     FROM movies m ${clause}
     ORDER BY m.movie_id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    movies, filters: { ...filters, page },
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages },
  };
}

async function listGenres() {
  const rows = await query(
    `SELECT g.genre_id, g.genre_name, COUNT(mg.movie_id) AS movie_count
     FROM genres g LEFT JOIN movie_genres mg ON mg.genre_id = g.genre_id
     GROUP BY g.genre_id, g.genre_name ORDER BY g.genre_name, g.genre_id`,
  );
  return rows.map((row) => ({ ...row, movie_count: Number(row.movie_count) }));
}

async function findMovieById(id) {
  const rows = await query(`SELECT ${MOVIE_SELECT} FROM movies m WHERE m.movie_id = ?`, [id]);
  if (!rows.length) return null;
  const genres = await query('SELECT genre_id FROM movie_genres WHERE movie_id = ? ORDER BY genre_id', [id]);
  return { ...rows[0], genre_ids: genres.map((row) => Number(row.genre_id)) };
}

async function lockGenres(conn, genreIds) {
  if (!genreIds.length) return;
  const ids = [...genreIds].sort((a, b) => a - b);
  // Shared parent locks serialize assignment against genre deletion, whose FK cascades.
  const [rows] = await conn.query(
    `SELECT genre_id FROM genres WHERE genre_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY genre_id LOCK IN SHARE MODE`, ids,
  );
  if (rows.length !== ids.length) throw catalogError('Một thể loại đã bị xóa. Vui lòng chọn lại', 400, 'genre_ids');
}

async function replaceGenres(conn, id, genreIds) {
  await conn.query('DELETE FROM movie_genres WHERE movie_id = ?', [id]);
  if (genreIds.length) {
    await conn.query(
      `INSERT INTO movie_genres (movie_id, genre_id) VALUES ${genreIds.map(() => '(?, ?)').join(', ')}`,
      genreIds.flatMap((genreId) => [id, genreId]),
    );
  }
}

function movieValues(movie) {
  return MOVIE_FIELDS.map((field) => movie[field] === '' || movie[field] == null ? null : movie[field]);
}

async function createMovie(movie) {
  try {
    return await withTransaction(async (conn) => {
      await lockGenres(conn, movie.genre_ids);
      const [result] = await conn.query(
        `INSERT INTO movies (${MOVIE_FIELDS.join(', ')}) VALUES (${MOVIE_FIELDS.map(() => '?').join(', ')})`,
        movieValues(movie),
      );
      await replaceGenres(conn, result.insertId, movie.genre_ids);
      return result.insertId;
    });
  } catch (err) {
    if (isMissingReference(err)) throw catalogError('Một thể loại đã bị xóa. Vui lòng chọn lại', 400, 'genre_ids');
    throw err;
  }
}

async function updateMovie(id, movie) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT movie_id, poster_url FROM movies WHERE movie_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw catalogError('Không tìm thấy phim', 404);
      await lockGenres(conn, movie.genre_ids);
      // A concurrent edit may have replaced the poster since the form was loaded.
      const updated = { ...movie, poster_url: movie.poster_url === undefined ? rows[0].poster_url : movie.poster_url };
      await conn.query(
        `UPDATE movies SET ${MOVIE_FIELDS.map((field) => `${field} = ?`).join(', ')} WHERE movie_id = ?`,
        [...movieValues(updated), id],
      );
      await replaceGenres(conn, id, movie.genre_ids);
      return { movie_id: id, previousPosterUrl: rows[0].poster_url };
    });
  } catch (err) {
    if (isMissingReference(err)) throw catalogError('Một thể loại đã bị xóa. Vui lòng chọn lại', 400, 'genre_ids');
    throw err;
  }
}

async function deleteMovie(id) {
  try {
    return await withTransaction(async (conn) => {
      const [movies] = await conn.query('SELECT movie_id, poster_url FROM movies WHERE movie_id = ? FOR UPDATE', [id]);
      if (!movies.length) throw catalogError('Không tìm thấy phim', 404);
      const [showtimes] = await conn.query('SELECT showtime_id FROM showtimes WHERE movie_id = ? LIMIT 1 FOR UPDATE', [id]);
      if (showtimes.length) throw catalogError('Không thể xóa phim đã có suất chiếu', 409);
      await conn.query('DELETE FROM movies WHERE movie_id = ?', [id]);
      return movies[0];
    });
  } catch (err) {
    if (isReferenced(err)) throw catalogError('Không thể xóa phim đã có suất chiếu hoặc dữ liệu liên quan', 409);
    throw err;
  }
}

function genreWriteError(err) {
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
    return catalogError('Tên thể loại đã tồn tại', 409, 'genre_name');
  }
  return err;
}

async function createGenre(genreName) {
  try {
    const result = await query('INSERT INTO genres (genre_name) VALUES (?)', [genreName]);
    return result.insertId;
  } catch (err) {
    throw genreWriteError(err);
  }
}

async function updateGenre(id, genreName) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT genre_id FROM genres WHERE genre_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw catalogError('Không tìm thấy thể loại', 404);
      await conn.query('UPDATE genres SET genre_name = ? WHERE genre_id = ?', [genreName, id]);
    });
  } catch (err) {
    throw genreWriteError(err);
  }
}

async function deleteGenre(id) {
  try {
    return await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT genre_id FROM genres WHERE genre_id = ? FOR UPDATE', [id]);
      if (!rows.length) throw catalogError('Không tìm thấy thể loại', 404);
      const [movies] = await conn.query('SELECT movie_id FROM movie_genres WHERE genre_id = ? LIMIT 1 FOR UPDATE', [id]);
      if (movies.length) throw catalogError('Không thể xóa thể loại đang có phim', 409, 'genre_name');
      await conn.query('DELETE FROM genres WHERE genre_id = ?', [id]);
    });
  } catch (err) {
    if (isReferenced(err)) throw catalogError('Không thể xóa thể loại đang có phim hoặc dữ liệu liên quan', 409, 'genre_name');
    throw err;
  }
}

module.exports = {
  PAGE_SIZE, listMovies, listGenres, findMovieById,
  createMovie, updateMovie, deleteMovie, createGenre, updateGenre, deleteGenre,
};
