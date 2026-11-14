const { validationResult } = require('express-validator');

function errorMessages(req) {
  const result = validationResult(req);
  return result.isEmpty() ? [] : result.array({ onlyFirstError: true }).map((e) => e.msg);
}

module.exports = { errorMessages };