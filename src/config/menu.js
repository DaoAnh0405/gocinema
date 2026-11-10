const { PERMISSION: P } = require('../constants');

// mục menu: { label, icon (Bootstrap Icons), href, permission?, exact? }
// mục nhóm:  { group: 'Tên nhóm' }
// href ở dưới chỉ là ví dụ thiết kế như thế or thay bằng href thực
const adminMenu = [
  { label: 'Tổng quan', icon: 'bi-speedometer2', href: '/admin', exact: true },

  { group: 'Danh mục' },
  { label: 'Phim', icon: 'bi-film', href: '/admin/movies', permission: P.MANAGE_MOVIES },
  { label: 'Thể loại', icon: 'bi-tags', href: '/admin/genres', permission: P.MANAGE_MOVIES },
  { label: 'Rạp & phòng chiếu', icon: 'bi-building', href: '/admin/cinemas', permission: P.MANAGE_CINEMAS },
  { label: 'Suất chiếu', icon: 'bi-calendar-event', href: '/admin/showtimes', permission: P.MANAGE_SHOWTIMES },

  { group: 'Bán hàng' },
  { label: 'Giá vé', icon: 'bi-cash-coin', href: '/admin/prices', permission: P.MANAGE_PRICES },
  { label: 'Đồ ăn', icon: 'bi-cup-straw', href: '/admin/foods', permission: P.MANAGE_FOODS },
  { label: 'Khuyến mãi', icon: 'bi-ticket-perforated', href: '/admin/promotions', permission: P.MANAGE_PROMOTIONS },

  { group: 'Hệ thống' },
  { label: 'Tài khoản', icon: 'bi-people', href: '/admin/accounts', permission: P.MANAGE_ACCOUNTS },
  { label: 'Phân quyền', icon: 'bi-shield-lock', href: '/admin/permissions', permission: P.MANAGE_PERMISSIONS },
  { label: 'Thống kê', icon: 'bi-graph-up', href: '/admin/reports', permission: P.VIEW_REPORTS },
];

const staffMenu = [
  { label: 'Tổng quan', icon: 'bi-house-door', href: '/staff', exact: true },
  { label: 'Ca làm việc', icon: 'bi-clock-history', href: '/staff/shift', permission: P.MANAGE_SHIFTS },
  { label: 'Bán vé tại quầy', icon: 'bi-bag-check', href: '/staff/counter', permission: P.SELL_TICKETS },
  { label: 'Soát vé', icon: 'bi-qr-code-scan', href: '/staff/checkin', permission: P.CHECKIN_TICKETS },
  { label: 'Xử lý vé', icon: 'bi-receipt', href: '/staff/tickets', permission: P.HANDLE_TICKETS },
  { label: 'Lịch chiếu & ghế', icon: 'bi-calendar3', href: '/staff/showtimes', permission: P.VIEW_SHOWTIMES },
];

module.exports = { adminMenu, staffMenu };