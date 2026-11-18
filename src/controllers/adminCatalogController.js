const catalog = require('../models/adminCatalogModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const {
  STATUSES, AGE_RATINGS, parseId, isSafePosterUrl, validateMovie, validateGenre,
} = require('../validators/adminCatalogValidator');
const {
  persistPoster, cleanupManagedPoster, validatePosterFile,
} = require('../middlewares/posterUpload');

const MOVIES_URL = '/admin/movies';
const GENRES_URL = '/admin/genres';

function requireId(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError('Mã không hợp lệ', 404);
  return id;
}

async function requireMovie(id) {
  const movie = await catalog.findMovieById(id);
  if (!movie) throw new AppError('Không tìm thấy phim', 404);
  return movie;
}

function emptyMovie() {
  return {
    title: '', description: '', duration: '', release_date: '', end_date: '',
    director: '', actors: '', poster_url: '', trailer_url: '',
    age_rating: 'P', status: 'COMING_SOON', genre_ids: [],
  };
}

function safePoster(posterUrl) {
  return isSafePosterUrl(posterUrl) ? posterUrl : '';
}

async function renderMovieForm(res, { movie = null, values, errors = [], fieldErrors = {}, status = 200 } = {}) {
  const isEdit = Boolean(movie);
  const formValues = { ...emptyMovie(), ...(values || movie), poster_url: safePoster(movie && movie.poster_url) };
  return res.status(status).render('pages/admin/movies/form', {
    title: isEdit ? 'Chỉnh sửa phim' : 'Thêm phim',
    movie: movie ? { ...movie, poster_url: safePoster(movie.poster_url) } : null,
    values: formValues,
    genres: await catalog.listGenres(),
    selectedGenreIds: formValues.genre_ids,
    errors, fieldErrors, isEdit,
    formAction: isEdit ? `${MOVIES_URL}/${movie.movie_id}/update` : MOVIES_URL,
    statuses: STATUSES,
    ageRatings: AGE_RATINGS,
  });
}

async function renderGenres(res, { values = { genre_name: '' }, editingGenreId = null, errors = [], fieldErrors = {}, status = 200 } = {}) {
  return res.status(status).render('pages/admin/genres/index', {
    title: 'Quản lý thể loại', genres: await catalog.listGenres(),
    values, editingGenreId, errors, fieldErrors,
  });
}

function addMovieError(result, field, message) {
  result.fieldErrors[field || '_form'] = message;
  result.errors = Object.values(result.fieldErrors);
}

function checkPoster(req, result) {
  const message = req.posterUploadError ? req.posterUploadError.message : validatePosterFile(req.file);
  if (message) addMovieError(result, 'poster', message);
}

// A committed database change must not be reported as failed due to stale-file cleanup.
async function cleanupPoster(posterUrl) {
  try {
    await cleanupManagedPoster(posterUrl);
  } catch (err) {
    console.error('Không thể dọn poster đã tải lên:', posterUrl, err);
  }
}

async function flashRedirect(req, res, type, message, destination) {
  req.flash(type, message);
  await saveSession(req);
  return res.redirect(destination);
}

const listMovies = asyncHandler(async (req, res) => {
  const [result, genres] = await Promise.all([catalog.listMovies(req.query), catalog.listGenres()]);
  return res.render('pages/admin/movies/index', {
    title: 'Quản lý phim', ...result,
    movies: result.movies.map((movie) => ({ ...movie, poster_url: safePoster(movie.poster_url) })),
    genres, statuses: STATUSES,
  });
});

const newMovie = asyncHandler(async (_req, res) => renderMovieForm(res));

const editMovie = asyncHandler(async (req, res) => {
  const movie = await requireMovie(requireId(req));
  return renderMovieForm(res, { movie });
});

const createMovie = asyncHandler(async (req, res) => {
  const result = validateMovie(req.body);
  checkPoster(req, result);
  if (result.errors.length) return renderMovieForm(res, { ...result, status: 400 });

  let newPosterUrl;
  try {
    if (req.file) newPosterUrl = await persistPoster(req.file);
    await catalog.createMovie({ ...result.values, poster_url: newPosterUrl || null });
  } catch (err) {
    if (newPosterUrl) await cleanupPoster(newPosterUrl);
    if (err instanceof AppError && err.status < 500 && err.status !== 404) {
      addMovieError(result, err.field, err.message);
      return renderMovieForm(res, { ...result, status: err.status });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Thêm phim thành công', MOVIES_URL);
});

const updateMovie = asyncHandler(async (req, res) => {
  const id = requireId(req);
  const movie = await requireMovie(id);
  const result = validateMovie(req.body);
  checkPoster(req, result);
  if (result.errors.length) return renderMovieForm(res, { movie, ...result, status: 400 });

  let newPosterUrl;
  let updated;
  try {
    if (req.file) newPosterUrl = await persistPoster(req.file);
    // Undefined tells the model to retain the latest locked poster, not a stale form value.
    updated = await catalog.updateMovie(id, { ...result.values, poster_url: newPosterUrl });
  } catch (err) {
    if (newPosterUrl) await cleanupPoster(newPosterUrl);
    if (err instanceof AppError && err.status < 500 && err.status !== 404) {
      addMovieError(result, err.field, err.message);
      return renderMovieForm(res, { movie, ...result, status: err.status });
    }
    throw err;
  }
  if (newPosterUrl) await cleanupPoster(updated.previousPosterUrl);
  return flashRedirect(req, res, 'success', 'Cập nhật phim thành công', MOVIES_URL);
});

const deleteMovie = asyncHandler(async (req, res) => {
  const id = requireId(req);
  let movie;
  try {
    movie = await catalog.deleteMovie(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      return flashRedirect(req, res, 'error', err.message, MOVIES_URL);
    }
    throw err;
  }
  await cleanupPoster(movie.poster_url);
  return flashRedirect(req, res, 'success', 'Xóa phim thành công', MOVIES_URL);
});

const listGenres = asyncHandler(async (_req, res) => renderGenres(res));

async function saveGenre(req, res, id = null) {
  const result = validateGenre(req.body);
  if (result.errors.length) {
    return renderGenres(res, { ...result, editingGenreId: id, status: 400 });
  }
  try {
    if (id === null) await catalog.createGenre(result.values.genre_name);
    else await catalog.updateGenre(id, result.values.genre_name);
  } catch (err) {
    if (err instanceof AppError && err.status < 500 && err.status !== 404) {
      return renderGenres(res, {
        values: result.values, editingGenreId: id, errors: [err.message],
        fieldErrors: { [err.field || '_form']: err.message }, status: err.status,
      });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', id === null ? 'Thêm thể loại thành công' : 'Cập nhật thể loại thành công', GENRES_URL);
}

const createGenre = asyncHandler(async (req, res) => saveGenre(req, res));
const updateGenre = asyncHandler(async (req, res) => saveGenre(req, res, requireId(req)));

const deleteGenre = asyncHandler(async (req, res) => {
  const id = requireId(req);
  try {
    await catalog.deleteGenre(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      const result = validateGenre(req.body);
      return renderGenres(res, {
        values: result.values, editingGenreId: id, errors: [err.message],
        fieldErrors: { [err.field || '_form']: err.message }, status: err.status,
      });
    }
    throw err;
  }
  return flashRedirect(req, res, 'success', 'Xóa thể loại thành công', GENRES_URL);
});

module.exports = {
  listMovies, newMovie, editMovie, createMovie, updateMovie, deleteMovie,
  listGenres, createGenre, updateGenre, deleteGenre,
};
