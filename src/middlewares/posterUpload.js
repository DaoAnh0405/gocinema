const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const AppError = require('../utils/AppError');

const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_PREFIX = '/images/posters/uploads/';
const UPLOAD_DIRECTORY = path.join(__dirname, '../../public/images/posters/uploads');
const MANAGED_POSTER = /^\/images\/posters\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg)$/;

function posterError(message) {
  const error = new AppError(message, 400);
  error.field = 'poster';
  return error;
}

function validatePosterFile(file) {
  if (!file) return null;
  if (!/\.jpe?g$/i.test(file.originalname || '') || file.mimetype !== 'image/jpeg') {
    return 'Poster phải là ảnh JPEG (.jpg hoặc .jpeg)';
  }
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length < 3 ||
      file.buffer[0] !== 0xff || file.buffer[1] !== 0xd8 || file.buffer[2] !== 0xff) {
    return 'Nội dung poster không phải ảnh JPEG hợp lệ';
  }
  if (file.buffer.length > MAX_POSTER_BYTES) return 'Poster không được vượt quá 5MB';
  return null;
}

const receivePoster = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_POSTER_BYTES, files: 1, fields: 100, parts: 102, fieldSize: 262144 },
  fileFilter(req, file, callback) {
    if (!/\.jpe?g$/i.test(file.originalname) || file.mimetype !== 'image/jpeg') {
      req.posterUploadError = posterError('Poster phải là ảnh JPEG (.jpg hoặc .jpeg)');
      return callback(null, false);
    }
    return callback(null, true);
  },
}).single('poster');

// Keep expected upload failures inline; CSRF middleware must still run after this.
function uploadPoster(req, res, next) {
  receivePoster(req, res, (err) => {
    if (err && !(err instanceof multer.MulterError)) return next(err);
    if (err) {
      req.posterUploadError = posterError(err.code === 'LIMIT_FILE_SIZE'
        ? 'Poster không được vượt quá 5MB'
        : 'Dữ liệu tải lên không hợp lệ. Chỉ chọn một poster JPEG');
    }
    const message = validatePosterFile(req.file);
    if (message) req.posterUploadError = posterError(message);
    if (req.posterUploadError) delete req.file;
    return next();
  });
}

async function persistPoster(file) {
  const message = validatePosterFile(file);
  if (!file || message) throw posterError(message || 'Không có poster để lưu');
  await fs.mkdir(UPLOAD_DIRECTORY, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  const destination = path.join(UPLOAD_DIRECTORY, filename);
  try {
    await fs.writeFile(destination, file.buffer, { flag: 'wx' });
  } catch (err) {
    // A failed write may leave a partial file; never remove a pre-existing file.
    if (err.code !== 'EEXIST') await fs.unlink(destination).catch(() => {});
    throw err;
  }
  return `${UPLOAD_URL_PREFIX}${filename}`;
}

async function cleanupManagedPoster(posterUrl) {
  if (typeof posterUrl !== 'string') return;
  const match = MANAGED_POSTER.exec(posterUrl);
  if (!match) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIRECTORY, match[1]));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = {
  uploadPoster, persistPoster, cleanupManagedPoster, validatePosterFile, MAX_POSTER_BYTES,
};
