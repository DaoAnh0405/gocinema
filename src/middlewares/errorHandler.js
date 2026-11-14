const AppError = require('../utils/AppError');
const env = require('../config/env');

function notFound(req, _res, next) {
  next(new AppError('Không tìm thấy trang bạn yêu cầu', 404));
}

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  const message =
    status >= 500 && env.isProd ? 'Hệ thống đang gặp sự cố, vui lòng thử lại sau' : err.message;

  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ success: false, message });
  }
  return res.status(status).render('errors/error', { title: `Lỗi ${status}`, status, message });
}

module.exports = { notFound, errorHandler };