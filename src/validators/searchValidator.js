const { query } = require('express-validator');

const searchRules = [
  query('q')
    .optional()
    .isString().withMessage('Từ khóa tìm kiếm không hợp lệ')
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Từ khóa tìm kiếm phải từ 1 đến 100 ký tự'),
];

module.exports = { searchRules };