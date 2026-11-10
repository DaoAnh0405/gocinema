const { body } = require('express-validator');

const registerRules = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Vui lòng nhập họ tên')
    .isLength({ max: 100 }).withMessage('Họ tên tối đa 100 ký tự'),
  body('email')
    .trim()
    .toLowerCase()
    .isEmail().withMessage('Email không hợp lệ')
    .isLength({ max: 100 }).withMessage('Email tối đa 100 ký tự'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^(0|\+84)\d{9}$/).withMessage('Số điện thoại không hợp lệ (vd: 0912345678)'),
  body('password')
    .isLength({ min: 8 }).withMessage('Mật khẩu tối thiểu 8 ký tự')
    .matches(/[A-Za-z]/).withMessage('Mật khẩu phải có ít nhất 1 chữ cái')
    .matches(/\d/).withMessage('Mật khẩu phải có ít nhất 1 chữ số'),
  body('confirm_password')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Mật khẩu nhập lại không khớp'),
  body('dob')
    .optional({ values: 'falsy' })
    .isISO8601().withMessage('Ngày sinh không hợp lệ')
    .custom((value) => new Date(value) <= new Date())
    .withMessage('Ngày sinh không được ở tương lai'),
  body('gender')
    .optional({ values: 'falsy' })
    .isIn(['Male', 'Female', 'Other']).withMessage('Giới tính không hợp lệ'),
];

const loginRules = [
  body('email').trim().notEmpty().withMessage('Vui lòng nhập email'),
  body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu'),
];

module.exports = { registerRules, loginRules };