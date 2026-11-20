const orderHistoryModel = require('../models/orderHistoryModel');
const profileService = require('../services/profileService');
const { ORDER_STATUS } = require('../constants');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const statusLabels = {
  ALL: 'Tất cả',
  PAID: 'Đã thanh toán',
  PENDING: 'Chờ thanh toán',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

const index = asyncHandler(async (req, res) => {
  const status = req.query.status === undefined ? 'ALL' : req.query.status;
  if (status !== 'ALL' && !Object.values(ORDER_STATUS).includes(status)) {
    throw new AppError('Trạng thái giao dịch không hợp lệ', 400);
  }
  const user = req.session.user;
  const [profile, summary, orders] = await Promise.all([
    profileService.getProfile(user),
    orderHistoryModel.getSummary(user.id),
    orderHistoryModel.listRecent(user.id, status === 'ALL' ? null : status),
  ]);
  res.render('pages/customer/orders', {
    layout: 'layouts/main',
    title: 'Lịch sử giao dịch', profile, summary, orders, status, statusLabels,
  });
});

module.exports = { index };
