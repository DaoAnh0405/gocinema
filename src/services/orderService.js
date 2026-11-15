const AppError = require('../utils/AppError');
const env = require('../config/env');
const { withTransaction } = require('../config/db');
const { SEAT_STATUS } = require('../constants');
const bookingModel = require('../models/bookingModel');
const orderModel = require('../models/orderModel');
const foodModel = require('../models/foodModel');
const promotionModel = require('../models/promotionModel');
const bookingService = require('./bookingService');
const pricingService = require('./pricingService');
const promotionService = require('./promotionService');
const paymentService = require('./paymentService');
const qrcodeService = require('./qrcodeService');
const accountModel = require('../models/accountModel');
const maskEmail = require('../utils/maskEmail');
const ticketMailService = require('./ticketMailService');

const MAX_FOOD_PER_ITEM = 10;
const GATEWAY_OPTIONS = {
  sepay: [{ value: 'SEPAY', label: 'SePay (QR ngân hàng, thẻ)' }],
};
const PAYMENT_OPTIONS = GATEWAY_OPTIONS[env.payment.provider] || [
  { value: 'E_WALLET', label: 'Ví điện tử' },
  { value: 'CARD', label: 'Thẻ ATM / Visa / Mastercard' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản ngân hàng' },
];
const holdMinutes = () => env.booking.holdMinutes;
const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

// đọc đồ ăn từ form (các trường food_<id>=<số lượng>); số lượng 0 thì bỏ qua
function parseFoods(body) {
  const foods = [];
  for (const [key, value] of Object.entries(body || {})) {
    const m = /^food_(\d+)$/.exec(key);
    if (!m) continue;
    const quantity = Number.parseInt(value, 10);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_FOOD_PER_ITEM) {
      throw new AppError(`Số lượng mỗi món tối đa ${MAX_FOOD_PER_ITEM}.`, 400);
    }
    if (quantity > 0) foods.push({ foodId: Number(m[1]), quantity });
  }
  return foods;
}

// báo giá do server tính từ ghế đang giữ + đồ ăn + mã khuyến mãi, không tin số tiền từ trình duyệt.
// không còn ghế giữ hợp lệ thì ném lỗi 409 (controller sẽ đưa về bước chọn ghế).
async function buildQuote(accountId, rawShowtimeId, state = {}) {
  const showtime = await bookingService.getBookableShowtime(rawShowtimeId);
  const held = await bookingModel.getMyHeldSeats(showtime.showtime_id, accountId);
  if (!held.length) {
    throw new AppError('Bạn chưa giữ ghế hoặc đã hết thời gian giữ ghế. Vui lòng chọn lại ghế.', 409);
  }

  const priceMap = await pricingService.getPriceMap(showtime.start_time, showtime.screen_format);
  const seats = held.map((s) => {
    if (!priceMap.has(s.seat_type_id)) {
      throw new AppError(`Chưa cấu hình giá vé cho ghế ${s.seat_row}${s.seat_number}.`, 422);
    }
    return { id: s.seat_id, label: `${s.seat_row}${s.seat_number}`, type: s.seat_type_name, price: priceMap.get(s.seat_type_id) };
  });
  const ticketSubtotal = sum(seats, (s) => s.price);

  const wanted = (state.foods || []).filter((f) => f.quantity > 0);
  const foodMap = new Map((await foodModel.findActiveByIds(wanted.map((f) => f.foodId))).map((f) => [f.food_id, f]));
  const foods = wanted
    .filter((f) => foodMap.has(f.foodId))
    .map((f) => {
      const row = foodMap.get(f.foodId);
      return { id: f.foodId, name: row.food_name, quantity: f.quantity, unitPrice: row.price, lineTotal: row.price * f.quantity };
    });
  const foodSubtotal = sum(foods, (f) => f.lineTotal);
  const subtotal = ticketSubtotal + foodSubtotal;

  let promo = null;
  let promoError = null;
  if (state.promoCode) {
    try {
      promo = await promotionService.validate(state.promoCode, subtotal);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      promoError = err.message;        // mã không còn hợp lệ (vd đổi ghế làm đơn thấp hơn mức tối thiểu)
    }
  }
  const discount = promo ? promo.discount : 0;

  return {
    showtime, seats, foods, ticketSubtotal, foodSubtotal, subtotal,
    promo, promoError, discount, total: subtotal - discount,
    secondsLeft: Math.min(...held.map((s) => s.seconds_left)),
  };
}

// kiểm tra mã khuyến mãi trên giá trị đơn hiện tại trả về mã đã chuẩn hóa
async function checkPromo(accountId, rawShowtimeId, state, rawCode) {
  const quote = await buildQuote(accountId, rawShowtimeId, { ...state, promoCode: null });
  const promo = await promotionService.validate(rawCode, quote.subtotal);
  return promo.code;
}

// nhả ghế, hủy vé, trả lượt mã khuyến mãi của một đơn PENDING (dùng khi thanh toán lỗi hoặc đơn hết hạn)
async function releasePendingOrder(conn, order, status, reason) {
  await orderModel.setCancelled(conn, order.order_id, status, reason);
  await orderModel.cancelTickets(conn, order.order_id);
  await bookingModel.releaseSeatsByOrder(conn, order.order_id);
  if (order.promotion_id) await promotionModel.releaseUse(conn, order.promotion_id);
}

// 1 tạo đơn PENDING + vé + đồ ăn trong 1 transaction, đồng thời gia hạn ghế đúng bằng hạn thanh toán
async function createPendingOrder(accountId, quote) {
  const showtimeId = quote.showtime.showtime_id;
  const seatIds = quote.seats.map((s) => s.id);

  return withTransaction(async (conn) => {
    await bookingService.assertNoPendingOrder(conn, accountId);   // chặn bấm đúp tạo hai đơn

    const locked = await bookingModel.lockSeats(conn, showtimeId, seatIds);
    const stillMine = locked.length === seatIds.length
      && locked.every((r) => r.status === SEAT_STATUS.HELD && r.is_held && r.held_by === accountId);
    if (!stillMine) {
      throw new AppError('Ghế của bạn đã hết thời gian giữ hoặc bị thay đổi. Vui lòng chọn lại.', 409);
    }
    if (quote.promo && !(await promotionModel.reserveUse(conn, quote.promo.promotionId))) {
      throw new AppError('Mã khuyến mãi vừa hết lượt sử dụng.', 422);
    }
    const order = await orderModel.createPending(conn, { customerId: accountId, quote });
    await bookingModel.extendHold(conn, showtimeId, seatIds, holdMinutes());
    return order;
  });
}

// 2 thanh toán thành công -> ghi payments, đơn PAID, ghế SOLD (vé đã có sẵn từ pha 1)
async function markPaid(orderId, accountId, method, transactionRef) {
  await withTransaction(async (conn) => {
    const order = await orderModel.lockPendingForCustomer(conn, orderId, accountId);
    if (!order) throw new AppError('Đơn hàng đã hết hạn hoặc không còn chờ thanh toán.', 409);
    await orderModel.insertPayment(conn, { orderId, method, amount: order.total_amount, transactionRef });
    await orderModel.setPaid(conn, orderId);
    await bookingModel.markSeatsSoldByOrder(conn, orderId);
  });
}

async function cancelOrder(orderId, accountId, reason) {
  await withTransaction(async (conn) => {
    const order = await orderModel.lockPendingForCustomer(conn, orderId, accountId);
    if (order) await releasePendingOrder(conn, order, 'CANCELLED', reason);
  });
}

function sendTicketsInBackground(orderCode, accountId) {
  ticketMailService.sendOrderTickets(orderCode, accountId)
    .then((sent) => sent && console.log(`[mail] đã gửi vé đơn ${orderCode}`))
    .catch((err) => console.error(`[mail] không gửi được vé đơn ${orderCode}:`, err.message));
}

async function checkout(accountId, rawShowtimeId, state, method) {
  if (!PAYMENT_OPTIONS.some((o) => o.value === method)) {
    throw new AppError('Vui lòng chọn phương thức thanh toán.', 400);
  }
  const quote = await buildQuote(accountId, rawShowtimeId, state);
  if (quote.promoError) throw new AppError(quote.promoError, 422);

  const order = await createPendingOrder(accountId, quote);

  let result;
  try {
    result = await paymentService.pay({ orderCode: order.orderCode, amount: quote.total, method, accountId });
  } catch (err) {
    console.error('[payment]', err.message);
    await cancelOrder(order.orderId, accountId, 'Không kết nối được cổng thanh toán');
    throw new AppError('Không kết nối được cổng thanh toán. Vui lòng thử lại.', 502);
  }

  // sepay chuyển trình duyệt sang cổng, kết quả xử lý ở handlePaymentReturn
  if (result.redirectUrl) return { ...order, redirectUrl: result.redirectUrl };

  // mock thành công ngay
  if (!result.success) {
    await cancelOrder(order.orderId, accountId, 'Thanh toán không thành công');
    throw new AppError('Thanh toán không thành công. Vui lòng thử lại.', 402);
  }
  await markPaid(order.orderId, accountId, method, result.transactionRef);
  sendTicketsInBackground(order.orderCode, accountId);
  return order;
}

// trả về { redirectTo, flash? } chữ ký sai ném lỗi, các trường hợp còn lại đều chuyển trang
async function handlePaymentReturn(query) {
  const r = await paymentService.verifyReturn(query);
  if (!r.valid) throw new AppError('Dữ liệu trả về từ cổng thanh toán không hợp lệ.', 400);

  const order = await orderModel.findByCodeAny(r.orderCode);
  if (!order) throw new AppError('Không tìm thấy đơn hàng.', 404);
  const confirm = `/booking/orders/${order.order_code}/confirmation`;

  if (order.status === 'PAID') return { redirectTo: confirm };          // tải lại trang hoặc IPN gọi lặp

  if (r.pending) {
    return {
      redirectTo: '/booking',
      flash: { type: 'warning', message: `Giao dịch của đơn ${order.order_code} đang được xử lý. Nếu ví đã bị trừ tiền, vui lòng chờ ít phút rồi kiểm tra email hoặc liên hệ GoCinema.` },
    };
  }

  if (!r.success) {
    if (order.status === 'PENDING') {
      await cancelOrder(order.order_id, order.customer_id, `Cổng thanh toán mã ${r.responseCode}`);
    }
    const message = r.cancelled
      ? 'Bạn đã hủy thanh toán. Ghế đã được nhả, vui lòng chọn lại.'
      : `Thanh toán không thành công (mã ${r.responseCode}). Vui lòng thử lại.`;
    return { redirectTo: '/booking', flash: { type: 'error', message } };
  }

  if (Number(order.total_amount) !== r.amount) {
    console.error(`[payment] sai số tiền đơn ${order.order_code}: ${r.amount} != ${order.total_amount}`);
    throw new AppError('Số tiền thanh toán không khớp với đơn hàng.', 400);
  }

  try {
    await markPaid(order.order_id, order.customer_id, r.method, r.transactionRef);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    // khách đã trả tiền nhưng đơn đã hết hạn cần hoàn tiền thủ công
    console.error(`[payment] ĐÃ THU TIỀN NHƯNG ĐƠN ${order.order_code} KHÔNG CÒN CHỜ THANH TOÁN (GD ${r.transactionRef})`);
    return {
      redirectTo: '/booking',
      flash: { type: 'error', message: `Thanh toán đã được ghi nhận nhưng đơn ${order.order_code} đã hết hạn. Vui lòng liên hệ GoCinema để được hoàn tiền.` },
    };
  }
  sendTicketsInBackground(order.order_code, order.customer_id);
  return { redirectTo: confirm };
}

// job hủy các đơn pending quá hạn thanh toán, trả ghế và lượt mã khuyến mãi
async function expireUnpaidOrders() {
  return withTransaction(async (conn) => {
    const orders = await orderModel.lockExpiredPending(conn, holdMinutes());
    for (const order of orders) {
      await releasePendingOrder(conn, order, 'EXPIRED', 'Hết thời gian thanh toán');
    }
    return orders.length;
  });
}

// dữ liệu trang xác nhận (chỉ chủ đơn xem được)
async function getConfirmation(accountId, rawCode) {
  const code = String(rawCode || '').toUpperCase();
  const order = /^[A-Z0-9]{4,20}$/.test(code) ? await orderModel.findByCode(code, accountId) : null;
  if (!order) throw new AppError('Không tìm thấy đơn hàng.', 404);

  const [tickets, foods, payment] = await Promise.all([
    orderModel.listTickets(order.order_id),
    orderModel.listFoods(order.order_id),
    orderModel.findPayment(order.order_id),
  ]);
  if (order.status === 'PAID') {
    const images = await Promise.all(tickets.map((t) => qrcodeService.toDataUrl(t.qr_code)));
    tickets.forEach((t, i) => { t.qr_image = images[i]; });
  }
  const account = await accountModel.findById(accountId);
  return {
    order, tickets, foods, payment,
    info: tickets[0] || null,
    maskedEmail: account ? maskEmail(account.email) : '',
  };
}

// dữ liệu form POST sang cổng thanh toán (chỉ chủ đơn, đơn còn chờ thanh toán)
async function getHostedForm(accountId, rawCode) {
  const code = String(rawCode || '').toUpperCase();
  const order = /^[A-Z0-9]{4,20}$/.test(code) ? await orderModel.findByCode(code, accountId) : null;
  if (!order) throw new AppError('Không tìm thấy đơn hàng.', 404);
  if (order.status !== 'PENDING') return { done: true, code: order.order_code };
  return {
    done: false,
    form: paymentService.buildCheckout({ orderCode: order.order_code, amount: Number(order.total_amount) }),
  };
}

module.exports = {
  MAX_FOOD_PER_ITEM, PAYMENT_OPTIONS,
  parseFoods, buildQuote, checkPromo, checkout, expireUnpaidOrders, getConfirmation, handlePaymentReturn, getHostedForm,
};