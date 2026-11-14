const { body } = require('express-validator');

const forgotRules = [body('email').trim().toLowerCase().isEmail().withMessage('Email không hợp lệ')];

const resetRules = [
  body('new_password')
    .isLength({ min: 8 }).withMessage('Mật khẩu mới tối thiểu 8 ký tự')
    .matches(/[A-Za-z]/).withMessage('Mật khẩu mới phải có ít nhất 1 chữ cái')
    .matches(/\d/).withMessage('Mật khẩu mới phải có ít nhất 1 chữ số'),
  body('confirm_new_password')
    .custom((value, { req }) => value === req.body.new_password)
    .withMessage('Mật khẩu nhập lại không khớp'),
];

module.exports = { forgotRules, resetRules };