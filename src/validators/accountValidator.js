const { parseId } = require('./adminCatalogValidator');

const ROLE_TABS = Object.freeze(['CUSTOMER', 'STAFF', 'ADMIN']);
const TAB_LABELS = Object.freeze({ CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', ADMIN: 'Quản trị' });
const PHONE_PATTERN = /^(0|\+84)\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;
const EMAIL_MAX = 100;
const POSITION_MAX = 50;

function validateStaff(input = {}, { isEdit = false } = {}) {
  input = input || {};
  const values = {};
  const fieldErrors = {};
  const add = (field, message) => { if (!fieldErrors[field]) fieldErrors[field] = message; };
  const str = (field) => {
    const raw = input[field];
    if (raw != null && typeof raw !== 'string') {
      add(field, 'Giá trị không hợp lệ');
      return '';
    }
    return (raw || '').trim();
  };

  values.full_name = str('full_name');
  if (!values.full_name) add('full_name', 'Vui lòng nhập họ tên');
  else if ([...values.full_name].length > NAME_MAX) add('full_name', `Họ tên tối đa ${NAME_MAX} ký tự`);

  // email là định danh đăng nhập chỉ kiểm tra khi tạo khi sửa chỉ giữ lại để hiển thị lại form
  values.email = str('email').toLowerCase();
  if (!isEdit) {
    if (!values.email) add('email', 'Vui lòng nhập email');
    else if (values.email.length > EMAIL_MAX || !EMAIL_PATTERN.test(values.email)) add('email', 'Email không hợp lệ');
  }

  const rawPhone = str('phone');
  values.phone = rawPhone || null; // cột phone là UNIQUE nên chuỗi rỗng phải đổi thành NULL
  if (rawPhone && !PHONE_PATTERN.test(rawPhone)) add('phone', 'Số điện thoại không hợp lệ (vd: 0912345678)');

  const rawCinema = str('cinema_id');
  values.cinema_id = parseId(rawCinema) || rawCinema;
  if (!parseId(rawCinema)) add('cinema_id', 'Vui lòng chọn rạp làm việc');

  const rawPosition = str('position');
  values.position = rawPosition || null;
  if ([...rawPosition].length > POSITION_MAX) add('position', `Chức vụ tối đa ${POSITION_MAX} ký tự`);

  return { values, errors: Object.values(fieldErrors), fieldErrors };
}

function normalizeAccountFilters(input = {}) {
  const q = typeof input.q === 'string' ? [...input.q.trim()].slice(0, 100).join('') : '';
  return {
    role: ROLE_TABS.includes(input.role) ? input.role : 'CUSTOMER',
    q,
    status: input.status === '1' || input.status === '0' ? input.status : '',
    page: parseId(input.page) || 1,
  };
}

// '0' (khóa) hoặc '1' (mở khóa) mọi giá trị khác bị từ chối
function parseStatus(raw) {
  if (raw === '1') return 1;
  if (raw === '0') return 0;
  return null;
}

// chỉ cho quay lại đúng trang quản lý tài khoản, chặn chuyển hướng ra ngoài
function safeBackUrl(raw, fallback) {
  return typeof raw === 'string' && /^\/admin\/accounts(\?[A-Za-z0-9_=&%.+-]*)?$/.test(raw) ? raw : fallback;
}

module.exports = {
  ROLE_TABS, TAB_LABELS, validateStaff, normalizeAccountFilters, parseStatus, safeBackUrl,
};