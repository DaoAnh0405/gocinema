const { validationResult } = require('express-validator');
const { promotionRules } = require('../validators/promotionValidator');

async function validatePromotion(body) {
  const req = { body, params: {}, query: {} };
  await Promise.all(promotionRules.map((rule) => rule.run(req)));
  return validationResult(req).array().map((error) => error.msg);
}

function validPromotion(overrides = {}) {
  return {
    promo_code: 'WELCOME10',
    promotion_name: 'Chào bạn mới',
    description: '',
    discount_type: 'PERCENT',
    discount_value: '10',
    max_discount: '30000',
    min_order_value: '100000',
    start_date: '2026-11-16T10:00',
    end_date: '2026-11-30T23:59',
    quantity: '100',
    ...overrides,
  };
}

describe('promotion validation', () => {
  test('accepts a valid promotion', async () => {
    await expect(validatePromotion(validPromotion())).resolves.toEqual([]);
  });

  test('rejects percentage discounts above 100 and invalid date ranges', async () => {
    const errors = await validatePromotion(validPromotion({
      discount_value: '101',
      end_date: '2026-11-15T10:00',
    }));

    expect(errors).toContain('Mức giảm theo phần trăm không được vượt quá 100%');
    expect(errors).toContain('Thời gian kết thúc phải sau thời gian bắt đầu');
  });

  test('accepts an unlimited promotion when quantity is blank', async () => {
    const errors = await validatePromotion(validPromotion({ quantity: '' }));

    expect(errors).toEqual([]);
  });
});
