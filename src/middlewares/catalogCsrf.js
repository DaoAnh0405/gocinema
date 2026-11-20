const { randomBytes, timingSafeEqual } = require('crypto');
const AppError = require('../utils/AppError');

function catalogCsrfToken(req, res, next) {
  if (!req.session.catalogCsrfToken) {
    req.session.catalogCsrfToken = randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.catalogCsrfToken;
  next();
}

// Multipart forms must be parsed by uploadPoster before checking their token.
function verifyCatalogCsrf(req, _res, next) {
  const actual = req.body && req.body._csrf;
  const expected = req.session.catalogCsrfToken;
  if (typeof actual !== 'string' || typeof expected !== 'string' ||
      !/^[a-f0-9]{64}$/.test(actual) || actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return next(new AppError('Phiên biểu mẫu không hợp lệ. Vui lòng tải lại trang rồi thử lại', 403));
  }
  return next();
}

module.exports = { catalogCsrfToken, verifyCatalogCsrf };
