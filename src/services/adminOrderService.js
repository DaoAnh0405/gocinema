const model = require('../models/adminOrderModel');
const AppError = require('../utils/AppError');
const fmt = require('../utils/format');
const { CHANNEL_LABELS, STATUS_LABELS } = require('../validators/orderAdminValidator');

const PAYMENT_LABELS = Object.freeze({
  CASH: 'Tiền mặt', CARD: 'Thẻ', E_WALLET: 'Ví điện tử', BANK_TRANSFER: 'Chuyển khoản',
});
const PAYMENT_STATUS_LABELS = Object.freeze({ 1: 'Thành công', 0: 'Thất bại', '-1': 'Đã hoàn tiền' });
const GUEST_LABEL = 'Khách vãng lai';

const decorateRow = (order) => ({
  ...order,
  ticket_count: Number(order.ticket_count),
  channelLabel: CHANNEL_LABELS[order.channel] || order.channel,
  paymentLabel: order.payment_method ? (PAYMENT_LABELS[order.payment_method] || order.payment_method) : '',
  customerLabel: order.customer_name || GUEST_LABEL,
});

async function list(filters) {
  const [page, cinemas] = await Promise.all([model.listPage(filters), model.listCinemas()]);
  return { ...page, orders: page.orders.map(decorateRow), cinemas };
}

// vé chỉ có hiệu lực khi đơn đã thanh toán
function ticketLabel(ticket, orderStatus) {
  if (ticket.status === -1) return { text: 'Đã hủy', tone: 'cancelled' };
  if (ticket.status === 0) return { text: 'Đã soát vé', tone: 'used' };
  return orderStatus === 'PAID' ? { text: 'Còn hiệu lực', tone: 'paid' } : { text: 'Chưa có hiệu lực', tone: 'pending' };
}

async function detail(orderId) {
  const found = await model.findById(orderId);
  if (!found) throw new AppError('Không tìm thấy đơn hàng', 404);
  const { order } = found;
  return {
    order: {
      ...order,
      channelLabel: CHANNEL_LABELS[order.channel] || order.channel,
      customerLabel: order.customer_name || GUEST_LABEL,
      canCancel: order.status === 'PENDING',
    },
    tickets: found.tickets.map((ticket) => ({
      ...ticket,
      seatLabel: `${ticket.seat_row}${String(ticket.seat_number).padStart(2, '0')}`,
      label: ticketLabel(ticket, order.status),
    })),
    foods: found.foods.map((food) => ({ ...food, lineTotal: Number(food.quantity) * Number(food.unit_price) })),
    payments: found.payments.map((payment) => ({
      ...payment,
      methodLabel: PAYMENT_LABELS[payment.payment_method] || payment.payment_method,
      statusLabel: PAYMENT_STATUS_LABELS[payment.status] || '',
    })),
    ticketTotal: found.tickets.filter((t) => t.status !== -1).reduce((sum, t) => sum + Number(t.ticket_price), 0),
  };
}

// ghi người hủy vào lý do để có dấu vết (chưa có bảng nhật ký riêng)
async function cancel(actor, orderId, reason) {
  const note = reason || 'Không nêu lý do';
  return model.cancelPending(orderId, `Quản trị viên ${actor.email} hủy: ${note}`.slice(0, 255));
}

// ô CSV chống chèn công thức khi mở bằng Excel (ô bắt đầu bằng = + - @ hoặc tab/xuống dòng)
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// CSV đơn hàng
async function toCsv(filters) {
  const rows = (await model.listForExport(filters)).map(decorateRow);
  const lines = [['Thời gian', 'Mã đơn', 'Khách hàng', 'Email', 'Kênh', 'Số vé', 'Tổng tiền (VNĐ)', 'Thanh toán', 'Trạng thái']];
  rows.forEach((row) => lines.push([
    fmt.dateTime(row.created_at), row.order_code, row.customerLabel, row.customer_email || '', row.channelLabel,
    row.ticket_count, row.total_amount, row.paymentLabel, STATUS_LABELS[row.status] || row.status,
  ]));
  return { csv: `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`, count: rows.length };
}

module.exports = { PAYMENT_LABELS, csvCell, list, detail, cancel, toCsv };