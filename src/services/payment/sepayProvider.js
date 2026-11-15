const crypto = require('crypto');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');

const cfg = () => env.payment.sepay;

// thứ tự trường dùng để ký
const SIGNED_FIELDS = [
  'order_amount', 'merchant', 'currency', 'operation', 'order_description', 'order_invoice_number',
  'customer_id', 'payment_method', 'success_url', 'error_url', 'cancel_url',
];
const isEmpty = (v) => v == null || v === '' || v === 0 || v === '0';

// "tên=giá trị" nối bằng dấu phẩy (bỏ trường rỗng/0) -> HMAC-SHA256 -> Base64
function sign(fields, secretKey) {
  const message = SIGNED_FIELDS.filter((k) => !isEmpty(fields[k])).map((k) => `${k}=${fields[k]}`).join(',');
  return crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');
}

// các trường của form gửi sang sepay (thứ tự chèn phải giữ nguyên, signature đứng cuối)
function buildCheckout({ orderCode, amount }) {
  const c = cfg();
  if (!c.merchantId || !c.secretKey) throw new Error('Chưa cấu hình SEPAY_MERCHANT_ID / SEPAY_SECRET_KEY');

  const base = `${c.returnBase}/${encodeURIComponent(orderCode)}`;
  const fields = {
    order_amount: String(Math.round(amount)),
    merchant: c.merchantId,
    currency: 'VND',
    operation: 'PURCHASE',
    order_description: `Thanh toan ve GoCinema ${orderCode}`,
    order_invoice_number: orderCode,                 // duy nhất cho mỗi đơn
    success_url: `${base}/success`,
    error_url: `${base}/error`,
    cancel_url: `${base}/cancel`,
    lang: 'vi',
  };
  fields.signature = sign(fields, c.secretKey);
  return { action: c.checkoutUrl, fields };
}

// sepay nhận dữ liệu bằng form POST từ trình duyệt, nên ở đây chỉ trả về trang trung gian cùng miền
async function pay({ orderCode, amount }) {
  buildCheckout({ orderCode, amount });              // báo lỗi sớm nếu thiếu cấu hình
  return { redirectUrl: `/booking/orders/${orderCode}/sepay` };
}

// khách quay về success/error/cancel không tin URL, hỏi lại sepay trạng thái thật của đơn
async function verifyReturn(query) {
  const orderCode = String((query && query.order) || '').toUpperCase();
  if (!/^GC\d+$/.test(orderCode)) return { valid: false };
  const result = String(query.result || '');
  const c = cfg();

  let data = null;
  try {
    const auth = Buffer.from(`${c.merchantId}:${c.secretKey}`).toString('base64');
    const res = await fetch(`${c.apiBase}/v1/order/detail/${encodeURIComponent(orderCode)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) data = (await res.json()).data || null;
    else if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error('[sepay] không hỏi được trạng thái đơn:', err.message);
    throw new AppError('Không kiểm tra được kết quả thanh toán, vui lòng thử lại sau ít phút.', 502);
  }

  const status = data ? data.order_status : '';
  const paid = Array.isArray(data && data.transactions)
    ? data.transactions.find((t) => t.transaction_status === 'APPROVED') : null;
  return {
    valid: true,
    success: status === 'CAPTURED',
    pending: status !== 'CAPTURED' && status !== 'CANCELLED' && result === 'success',
    cancelled: result === 'cancel' || status === 'CANCELLED',
    responseCode: status || result,
    orderCode,
    amount: data ? Number(data.order_amount) : 0,
    transactionRef: data ? String(data.order_id || '').slice(0, 50) : '',
    method: paid && paid.payment_method === 'CARD' ? 'CARD' : 'BANK_TRANSFER',
  };
}

module.exports = { pay, buildCheckout, verifyReturn };