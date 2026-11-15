const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const saveSession = require('../utils/saveSession');
const bookingSession = require('../utils/bookingSession');
const { accountIdOf } = require('../utils/currentAccount');
const env = require('../config/env');
const orderService = require('../services/orderService');
const foodModel = require('../models/foodModel');
const ticketMailService = require('../services/ticketMailService'); 

const showtimeIdOf = (req) => Number.parseInt(req.params.id, 10);
const statusOf = (err) => err.statusCode || err.status;
const base = (req) => `/booking/showtimes/${showtimeIdOf(req)}`;
const toSeats = (req) => `${base(req)}/seats`;
const RESEND_COOLDOWN_MS = 60 * 1000;

// lỗi nghiệp vụ -> flash + chuyển trang. 409 (mất ghế/hết hạn giữ) luôn về bước chọn ghế, 404 về bước 1.
const guard = (backPath, handler) =>
  asyncHandler(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      const status = statusOf(err);
      let target = backPath(req);
      if (status === 409) target = toSeats(req);
      if (status === 404) target = '/booking';
      req.flash('error', err.message);
      await saveSession(req);
      res.redirect(target);
    }
  });

// 3 đồ ăn (đây là trường không bắt buộc)
exports.foodPage = guard(toSeats, async (req, res) => {
  const id = showtimeIdOf(req);
  const state = bookingSession.get(req, id);
  const [quote, foods] = await Promise.all([
    orderService.buildQuote(accountIdOf(req), id, state),
    foodModel.listActive(),
  ]);
  res.render('pages/booking/food', {
    title: 'Chọn đồ ăn',
    quote,
    foods,
    maxQty: orderService.MAX_FOOD_PER_ITEM,
    qty: new Map(state.foods.map((f) => [f.foodId, f.quantity])),
  });
});

exports.saveFood = guard((req) => `${base(req)}/food`, async (req, res) => {
  const id = showtimeIdOf(req);
  const foods = orderService.parseFoods(req.body);
  await orderService.buildQuote(accountIdOf(req), id, { foods });      // phải còn giữ ghế mới đi tiếp
  bookingSession.set(req, { ...bookingSession.get(req, id), foods });
  await saveSession(req);
  res.redirect(`${base(req)}/payment`);
});

// 4 thanh toán
exports.paymentPage = guard(toSeats, async (req, res) => {
  const id = showtimeIdOf(req);
  const quote = await orderService.buildQuote(accountIdOf(req), id, bookingSession.get(req, id));
  res.render('pages/booking/payment', {
    title: 'Thanh toán',
    quote,
    methods: orderService.PAYMENT_OPTIONS,
    isMockPayment: env.payment.provider === 'mock',
  });
});

exports.applyPromo = guard((req) => `${base(req)}/payment`, async (req, res) => {
  const id = showtimeIdOf(req);
  const state = bookingSession.get(req, id);
  if (req.body.remove) {
    bookingSession.set(req, { ...state, promoCode: null });
    req.flash('info', 'Đã bỏ mã khuyến mãi.');
  } else {
    const code = await orderService.checkPromo(accountIdOf(req), id, state, req.body.code);
    bookingSession.set(req, { ...state, promoCode: code });
    req.flash('success', `Đã áp dụng mã ${code}.`);
  }
  await saveSession(req);
  res.redirect(`${base(req)}/payment`);
});

exports.pay = guard((req) => `${base(req)}/payment`, async (req, res) => {
  const id = showtimeIdOf(req);
  const order = await orderService.checkout(accountIdOf(req), id, bookingSession.get(req, id), req.body.method);
  bookingSession.clear(req);
  await saveSession(req);
  res.redirect(order.redirectUrl || `/booking/orders/${order.orderCode}/confirmation`);
});

async function finishReturn(req, res, query) {
  let result;
  try {
    result = await orderService.handlePaymentReturn(query);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    result = { redirectTo: '/booking', flash: { type: 'error', message: err.message } };
  }
  if (result.flash) req.flash(result.flash.type, result.flash.message);
  await saveSession(req);
  res.redirect(result.redirectTo);
}

// trang trung gian: form ẩn có chữ ký, tự gửi POST sang sepay
exports.sepayPage = asyncHandler(async (req, res) => {
  try {
    const r = await orderService.getHostedForm(accountIdOf(req), req.params.code);
    if (r.done) return res.redirect(`/booking/orders/${r.code}/confirmation`);
    return res.render('pages/booking/gatewayRedirect', { title: 'Chuyển sang cổng thanh toán', form: r.form });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    req.flash('error', err.message);
    await saveSession(req);
    return res.redirect('/booking');
  }
});

// sepay đưa khách về /booking/payment/sepay/:code/(success|error|cancel)
exports.sepayReturn = asyncHandler((req, res) => {
  const result = ['success', 'error', 'cancel'].includes(req.params.result) ? req.params.result : 'error';
  return finishReturn(req, res, { order: req.params.code, result });
});

// xác nhận
exports.confirmation = asyncHandler(async (req, res) => {
  const data = await orderService.getConfirmation(accountIdOf(req), req.params.code);
  res.render('pages/booking/confirmation', { title: 'Xác nhận đặt vé', ...data });
});

// gửi lại email vé (cách nhau ít nhất 60 giây cho mỗi đơn)
exports.resendTicketMail = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const back = `/booking/orders/${encodeURIComponent(code)}/confirmation`;
  const sentAt = req.session.ticketMailAt || (req.session.ticketMailAt = {});
  const wait = RESEND_COOLDOWN_MS - (Date.now() - (sentAt[code] || 0));

  if (wait > 0) {
    req.flash('warning', `Vui lòng đợi ${Math.ceil(wait / 1000)} giây rồi gửi lại.`);
  } else {
    try {
      await ticketMailService.sendOrderTickets(code, accountIdOf(req));
      sentAt[code] = Date.now();
      req.flash('success', 'Đã gửi lại thông tin vé vào email của bạn.');
    } catch (err) {
      if (err instanceof AppError) {
        req.flash('error', err.message);
      } else {
        console.error('[mail] gửi lại vé lỗi:', err.message);
        req.flash('error', 'Gửi email không thành công, vui lòng thử lại sau.');
      }
    }
  }
  await saveSession(req);
  res.redirect(back);
});