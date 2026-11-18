const AppError = require('../utils/AppError');
const env = require('../config/env');
const orderModel = require('../models/orderModel');
const accountModel = require('../models/accountModel');
const mailService = require('./mailService');
const qrcodeService = require('./qrcodeService');
const { money, showLabel } = require('../utils/format');

const METHOD_LABEL = { E_WALLET: 'VNPAY', CARD: 'Thẻ', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildHtml({ name, order, tickets, foods, payment }) {
  const first = tickets[0];
  const ticketBlocks = tickets.map((t, i) => `
    <table role="presentation" width="100%" style="border:1px dashed #cbd5e1;border-radius:10px;margin:0 0 12px;padding:8px">
      <tr>
        <td width="150" style="padding:8px"><img src="cid:qr${i}@gocinema" width="140" height="140" alt="QR ghế ${esc(t.seat_row)}${esc(t.seat_number)}"></td>
        <td style="padding:8px;font-size:14px;line-height:1.5">
          <div style="font-size:16px;font-weight:bold">${esc(t.title)}</div>
          <div>${esc(t.cinema_name)} · ${esc(t.room_name)}</div>
          <div>Suất ${esc(showLabel(t.start_time))} · ${esc(t.screen_format)} ${esc(t.language)}</div>
          <div style="margin-top:6px">Ghế <strong style="font-size:18px">${esc(t.seat_row)}${esc(t.seat_number)}</strong> (${esc(t.seat_type_name)})</div>
          <div style="color:#6b7280;font-size:12px">Mã vé: ${esc(t.qr_code)}</div>
        </td>
      </tr>
    </table>`).join('');

  const foodRows = foods.map((f) =>
    `<tr><td>${esc(f.food_name)} × ${f.quantity}</td><td align="right">${esc(money(f.unit_price * f.quantity))}</td></tr>`).join('');
  const discountRow = order.discount_amount > 0
    ? `<tr><td>Giảm giá${order.promo_code ? ` (${esc(order.promo_code)})` : ''}</td><td align="right">−${esc(money(order.discount_amount))}</td></tr>` : '';
  const payLine = payment
    ? `<p style="font-size:13px;color:#6b7280">Thanh toán: ${esc(METHOD_LABEL[payment.payment_method] || payment.payment_method)} · Mã giao dịch: ${esc(payment.transaction_ref)}</p>` : '';

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#111827">
    <h2 style="color:#d9231a;margin-bottom:4px">GoCinema</h2>
    <p>Xin chào ${esc(name || 'bạn')}, đơn <strong>${esc(order.order_code)}</strong> đã thanh toán thành công.
       Hãy đưa mã QR bên dưới cho nhân viên soát vé tại rạp <strong>${esc(first.cinema_name)}</strong>.</p>
    ${ticketBlocks}
    <table role="presentation" width="100%" style="font-size:14px;border-top:1px solid #e5e7eb;padding-top:8px">
      ${foodRows}
      <tr><td>Tạm tính</td><td align="right">${esc(money(order.subtotal))}</td></tr>
      ${discountRow}
      <tr><td><strong>Tổng cộng</strong></td><td align="right"><strong style="color:#d9231a">${esc(money(order.total_amount))}</strong></td></tr>
    </table>
    ${payLine}
    <p style="font-size:12px;color:#6b7280">Vui lòng có mặt trước giờ chiếu 15 phút. Email này được gửi tự động, bạn không cần trả lời.</p>
  </div>`;
}

function buildText({ order, tickets }) {
  const lines = tickets.map((t) => `- Ghế ${t.seat_row}${t.seat_number} (${t.seat_type_name}) · mã vé ${t.qr_code}`);
  const f = tickets[0];
  return [
    `Đơn ${order.order_code} đã thanh toán thành công.`,
    `${f.title} · ${f.cinema_name} · ${f.room_name}`,
    `Suất ${showLabel(f.start_time)} · ${f.screen_format} ${f.language}`,
    ...lines,
    `Tổng cộng: ${money(order.total_amount)}`,
  ].join('\n');
}

// gửi vé (kèm mã QR) của một đơn đã thanh toán về email của cus
async function sendOrderTickets(orderCode, accountId) {
  if (env.isTest) return false;

  const order = await orderModel.findByCode(String(orderCode || '').toUpperCase(), accountId);
  if (!order) throw new AppError('Không tìm thấy đơn hàng.', 404);
  if (order.status !== 'PAID') throw new AppError('Đơn hàng chưa thanh toán nên chưa có vé.', 409);

  const account = await accountModel.findById(accountId);
  if (!account || !account.email) throw new AppError('Tài khoản chưa có email để gửi vé.', 422);

  const [tickets, foods, payment] = await Promise.all([
    orderModel.listTickets(order.order_id),
    orderModel.listFoods(order.order_id),
    orderModel.findPayment(order.order_id),
  ]);
  if (!tickets.length) throw new AppError('Đơn hàng không có vé.', 409);

  // QR đính kèm theo cid (Gmail chặn ảnh data: url trong email)
  const qrs = await Promise.all(tickets.map((t) => qrcodeService.toBuffer(t.qr_code)));
  const attachments = qrs.map((content, i) => ({
    filename: `ve-${tickets[i].seat_row}${tickets[i].seat_number}.png`,
    content,
    cid: `qr${i}@gocinema`,
  }));

  const data = { name: account.full_name, order, tickets, foods, payment };
  await mailService.sendMail({
    to: account.email,
    subject: `GoCinema – Vé xem phim ${tickets[0].title} (${order.order_code})`,
    text: buildText(data),
    html: buildHtml(data),
    attachments,
  });
  return true;
}

module.exports = { sendOrderTickets };