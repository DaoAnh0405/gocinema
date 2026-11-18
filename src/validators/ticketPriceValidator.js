const { body, param } = require('express-validator');
const { DAY_TYPE } = require('../constants');

const formats = ['2D', '3D', 'IMAX'];
const dayLabels = { WEEKDAY: 'Ngày thường', WEEKEND: 'Cuối tuần', HOLIDAY: 'Ngày lễ' };
const idRule = param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Mã mức giá không hợp lệ.');
const timeRule = (field) => body(field).optional({ values: 'falsy' })
  .matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).withMessage('Giờ phải nằm trong khoảng 00:00 đến 23:59:59.');
const dateRule = (field) => body(field).optional({ values: 'falsy' })
  .isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value) => value >= '1000-01-01' && value <= '9999-12-31').withMessage('Ngày áp dụng không hợp lệ.');
const normalizeTime = (value) => value.length === 5 ? `${value}:00` : value;

const priceRules = [
  body(['seat_type_id', 'price', 'screen_format', 'day_type', 'time_from', 'time_to', 'valid_from', 'valid_to'])
    .optional().isString().withMessage('Giá trị biểu mẫu không hợp lệ.'),
  body('seat_type_id').isInt({ min: 1, max: 2147483647 }).withMessage('Vui lòng chọn loại ghế.'),
  body('price').matches(/^\d{1,10}$/).withMessage('Đơn giá phải là số nguyên từ 0 đến 9.999.999.999 đồng.'),
  body('screen_format').isIn(formats).withMessage('Vui lòng chọn định dạng 2D, 3D hoặc IMAX.'),
  body('day_type').isIn(Object.values(DAY_TYPE)).withMessage('Vui lòng chọn loại ngày.'),
  timeRule('time_from'), timeRule('time_to'),
  body('time_to').custom((value, { req }) => !value || !req.body.time_from || normalizeTime(value) >= normalizeTime(req.body.time_from))
    .withMessage('Giờ kết thúc phải từ giờ bắt đầu trở đi.'),
  dateRule('valid_from'), dateRule('valid_to'),
  body('valid_to').custom((value, { req }) => !value || !req.body.valid_from || value >= req.body.valid_from)
    .withMessage('Ngày kết thúc phải từ ngày bắt đầu trở đi.'),
];

module.exports = { formats, dayLabels, idRule, priceRules };
