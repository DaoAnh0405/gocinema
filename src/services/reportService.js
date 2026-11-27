const reportModel = require('../models/reportModel');
const { addDays, previousRange } = require('../validators/reportValidator');

const CHANNEL_LABELS = Object.freeze({ ONLINE: 'Online', COUNTER: 'Tại quầy' });
const PAYMENT_LABELS = Object.freeze({
  CASH: 'Tiền mặt', CARD: 'Thẻ', E_WALLET: 'Ví điện tử', BANK_TRANSFER: 'Chuyển khoản',
});

const toRange = ({ from, to, cinemaId, movieId, channel }) => ({ from, to, toExclusive: addDays(to, 1), cinemaId, movieId, channel });

// % thay đổi so với kỳ trước, null khi kỳ trước bằng 0 (không so sánh được)
function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// điền 0 cho các ngày không có đơn để biểu đồ liên tục
function fillDaily({ from, days }, orderRows, ticketRows) {
  const orders = new Map(orderRows.map((row) => [row.report_day, row]));
  const tickets = new Map(ticketRows.map((row) => [row.report_day, row]));
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(from, index);
    const order = orders.get(date);
    const ticket = tickets.get(date);
    return {
      date,
      orders: order ? Number(order.orders) : 0,
      revenue: order ? Number(order.revenue) : 0,
      tickets: ticket ? Number(ticket.tickets) : 0,
    };
  });
}

async function build(filters) {
  const range = toRange(filters);
  const previous = toRange({ ...previousRange(filters), cinemaId: filters.cinemaId, movieId: filters.movieId, channel: filters.channel });
  const [
    current, before, orderRows, ticketRows, channels, payments, movies, cinemas, foods, cinemaOptions, movieOptions,
  ] = await Promise.all([
    reportModel.summary(range),
    reportModel.summary(previous),
    reportModel.dailyOrders(range),
    reportModel.dailyTickets(range),
    reportModel.byChannel(range),
    reportModel.byPayment(range),
    reportModel.topMovies(range),
    reportModel.byCinema(range),
    reportModel.topFoods(range),
    reportModel.listCinemas(),
    reportModel.listMovies(),
  ]);

  const finished = current.orders + current.failedOrders;
  return {
    filters,
    previous: { from: previous.from, to: previous.to },
    kpi: {
      ...current,
      avgOrder: current.orders ? Math.round(current.revenue / current.orders) : 0,
      failedRate: finished ? Math.round((current.failedOrders / finished) * 1000) / 10 : 0,
      change: {
        revenue: percentChange(current.revenue, before.revenue),
        orders: percentChange(current.orders, before.orders),
        tickets: percentChange(current.tickets, before.tickets),
      },
    },
    daily: fillDaily(filters, orderRows, ticketRows),
    channels: channels.map((row) => ({
      key: row.channel, label: CHANNEL_LABELS[row.channel] || row.channel,
      orders: Number(row.orders), revenue: Number(row.revenue),
    })),
    payments: payments.map((row) => ({
      key: row.method, label: PAYMENT_LABELS[row.method] || row.method,
      payments: Number(row.payments), amount: Number(row.amount),
    })),
    movies: movies.map((row) => ({ ...row, tickets: Number(row.tickets), revenue: Number(row.revenue) })),
    cinemas: cinemas.map((row) => ({ ...row, tickets: Number(row.tickets), revenue: Number(row.revenue) })),
    foods: foods.map((row) => ({ ...row, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
    cinemaOptions,
    movieOptions,
  };
}

// CSV theo ngày (có BOM để Excel đọc đúng tiếng Việt), kèm dòng tổng (mô phỏng chưa format)
function toCsv(report) {
  const lines = [['Ngày', 'Số đơn', 'Vé bán ra', 'Doanh thu (VNĐ)']];
  report.daily.forEach((row) => lines.push([row.date, row.orders, row.tickets, row.revenue]));
  lines.push(['Tổng', report.kpi.orders, report.kpi.tickets, report.kpi.revenue]);
  return `\uFEFF${lines.map((line) => line.join(',')).join('\r\n')}\r\n`;
}

module.exports = { CHANNEL_LABELS, PAYMENT_LABELS, percentChange, fillDaily, build, toCsv };