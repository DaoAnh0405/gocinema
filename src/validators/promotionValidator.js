const { body, param } = require('express-validator');

const promotionRules = [
  body('promo_code')
    .trim()
    .notEmpty().withMessage('Vui lòng nhập mã khuyến mãi')
    .isLength({ max: 30 }).withMessage('Mã khuyến mãi tối đa 30 ký tự')
    .matches(/^[A-Za-z0-9_-]+$/).withMessage('Mã chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới'),
  body('promotion_name')
    .trim()
    .notEmpty().withMessage('Vui lòng nhập tên chương trình')
    .isLength({ max: 100 }).withMessage('Tên chương trình tối đa 100 ký tự'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 5000 }).withMessage('Mô tả tối đa 5000 ký tự'),
  body('discount_type')
    .isIn(['PERCENT', 'AMOUNT']).withMessage('Loại giảm giá không hợp lệ'),
  body('discount_value')
    .isFloat({ gt: 0 }).withMessage('Mức giảm phải lớn hơn 0')
    .custom((value, { req }) => req.body.discount_type !== 'PERCENT' || Number(value) <= 100)
    .withMessage('Mức giảm theo phần trăm không được vượt quá 100%'),
  body('max_discount')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('Giảm tối đa phải là số không âm'),
  body('min_order_value')
    .isFloat({ min: 0 }).withMessage('Đơn tối thiểu phải là số không âm'),
  body('start_date')
    .notEmpty().withMessage('Vui lòng chọn thời gian bắt đầu')
    .isISO8601().withMessage('Thời gian bắt đầu không hợp lệ'),
  body('end_date')
    .notEmpty().withMessage('Vui lòng chọn thời gian kết thúc')
    .isISO8601().withMessage('Thời gian kết thúc không hợp lệ')
    .custom((value, { req }) => (
      !req.body.start_date
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(req.body.start_date)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
      || value > req.body.start_date
    ))
    .withMessage('Thời gian kết thúc phải sau thời gian bắt đầu'),
  body('quantity')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Số lượng phải là số nguyên lớn hơn 0'),
];

const promotionIdRule = param('id')
  .isInt({ min: 1 }).withMessage('Mã khuyến mãi không hợp lệ');

const statusRule = body('status')
  .isIn(['ACTIVE', 'PAUSED']).withMessage('Trạng thái khuyến mãi không hợp lệ');

module.exports = { promotionRules, promotionIdRule, statusRule };
