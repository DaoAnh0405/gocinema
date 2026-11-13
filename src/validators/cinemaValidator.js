const { body, param } = require('express-validator');

const formats = ['2D', '3D', 'IMAX'];
const cinemaIdRule = param('cinemaId').isInt({ min: 1, max: 2147483647 }).withMessage('Mã rạp không hợp lệ.');
const roomIdRule = param('roomId').isInt({ min: 1, max: 2147483647 }).withMessage('Mã phòng chiếu không hợp lệ.');
const statusRule = body('status').isString().bail().isIn(['0', '1']).withMessage('Trạng thái không hợp lệ.');
const textRule = (field, label, max) => body(field).isString().withMessage(`${label} không hợp lệ.`).bail()
  .trim().isLength({ min: 1, max }).withMessage(`${label} phải có từ 1 đến ${max} ký tự.`);

const cinemaRules = [
  textRule('cinema_name', 'Tên rạp', 100), textRule('address', 'Địa chỉ', 255), textRule('city', 'Thành phố', 50),
  body('phone_number').optional({ values: 'falsy' }).isString().bail().trim()
    .matches(/^\+?\d{7,14}$/).withMessage('Số điện thoại gồm 7–14 chữ số, có thể bắt đầu bằng dấu +.'),
  statusRule,
];
const roomRules = [
  textRule('room_name', 'Tên phòng chiếu', 50),
  body('room_type').isString().bail().isIn(formats).withMessage('Loại phòng phải là 2D, 3D hoặc IMAX.'), statusRule,
  body('row_count').isInt({ min: 1, max: 702 }).withMessage('Số hàng phải là số nguyên từ 1 đến 702 (A–ZZ).'),
  body('column_count').isInt({ min: 1, max: 100 }).withMessage('Số cột phải là số nguyên từ 1 đến 100.'),
];

module.exports = { formats, cinemaIdRule, roomIdRule, statusRule, cinemaRules, roomRules };
