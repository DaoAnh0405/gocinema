const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const AppError = require('../utils/AppError');

const MAX_FOOD_IMAGE_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_PREFIX = '/images/foods/uploads/';
const UPLOAD_DIRECTORY = path.join(__dirname, '../../public/images/foods/uploads');
const MANAGED_IMAGE = /^\/images\/foods\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp))$/;
const TYPE_MESSAGE = 'Ảnh món phải là JPG, PNG hoặc WebP';

function imageError(message) {
  const error = new AppError(message, 400);
  error.field = 'image';
  return error;
}

// nhận diện định dạng thật bằng "magic bytes", không tin đuôi file hay mimetype.
function detectExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function validateFoodImageFile(file) {
  if (!file) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(file.originalname || '') ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return TYPE_MESSAGE;
  if (!detectExtension(file.buffer)) return 'Nội dung tệp không phải ảnh hợp lệ';
  if (file.buffer.length > MAX_FOOD_IMAGE_BYTES) return 'Ảnh không được vượt quá 5MB';
  return null;
}

const receiveImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FOOD_IMAGE_BYTES, files: 1, fields: 20, parts: 22, fieldSize: 65536 },
}).single('image');

// lỗi upload dự kiến được gắn vào req để form hiển thị lại, CSRF phải chạy sau middleware này.
function uploadFoodImage(req, res, next) {
  receiveImage(req, res, (err) => {
    if (err && !(err instanceof multer.MulterError)) return next(err);
    if (err) {
      req.foodUploadError = imageError(err.code === 'LIMIT_FILE_SIZE'
        ? 'Ảnh không được vượt quá 5MB'
        : 'Dữ liệu tải lên không hợp lệ. Chỉ chọn một ảnh');
    }
    const message = validateFoodImageFile(req.file);
    if (message) req.foodUploadError = imageError(message);
    if (req.foodUploadError) delete req.file;
    return next();
  });
}

async function persistFoodImage(file) {
  const message = validateFoodImageFile(file);
  if (!file || message) throw imageError(message || 'Không có ảnh để lưu');
  await fs.mkdir(UPLOAD_DIRECTORY, { recursive: true });
  const filename = `${randomUUID()}.${detectExtension(file.buffer)}`;
  const destination = path.join(UPLOAD_DIRECTORY, filename);
  try {
    await fs.writeFile(destination, file.buffer, { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') await fs.unlink(destination).catch(() => {});
    throw err;
  }
  return `${UPLOAD_URL_PREFIX}${filename}`;
}

// chỉ xóa ảnh do chức năng upload tạo ra, ảnh seed (/images/foods/xxx.jpg) không bị xóa.
async function cleanupManagedFoodImage(imageUrl) {
  if (typeof imageUrl !== 'string') return;
  const match = MANAGED_IMAGE.exec(imageUrl);
  if (!match) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIRECTORY, match[1]));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = {
  uploadFoodImage, persistFoodImage, cleanupManagedFoodImage,
  validateFoodImageFile, MAX_FOOD_IMAGE_BYTES,
};