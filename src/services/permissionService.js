const permissionModel = require('../models/permissionModel');
const AppError = require('../utils/AppError');
const { ROLE, PERMISSION: P } = require('../constants');

// quyền thuộc khu nhân viên chỉ nhóm này được gán cho STAFF
// các quyền còn lại thuộc khu /admin (đang chặn bằng requireRole(ADMIN)) nên không cho gán cho STAFF
const STAFF_SCOPE = Object.freeze([
  P.VIEW_SHOWTIMES, P.SELL_TICKETS, P.CHECKIN_TICKETS, P.HANDLE_TICKETS, P.MANAGE_SHIFTS,
]);
const EDITABLE_ROLE = ROLE.STAFF;
const MAX_SELECTION = 50;

// dữ liệu cho bảng ma trận cột là vai trò, hàng là quyền, chia hai nhóm
async function getMatrix() {
  const [permissions, roles, granted] = await Promise.all([
    permissionModel.listPermissions(),
    permissionModel.listRoles(),
    permissionModel.listGranted(),
  ]);
  const has = new Set(granted.map((row) => `${row.role_name}:${row.permission_name}`));
  const columns = roles.map((role) => ({
    name: role.role_name,
    accountCount: Number(role.account_count),
    editable: role.role_name === EDITABLE_ROLE,
  }));

  const rowOf = (permission) => {
    const inStaffScope = STAFF_SCOPE.includes(permission.permission_name);
    return {
      name: permission.permission_name,
      description: permission.description || '',
      cells: columns.map((column) => ({
        role: column.name,
        checked: has.has(`${column.name}:${permission.permission_name}`),
        editable: column.editable && inStaffScope,
      })),
    };
  };
  const adminRows = permissions.filter((p) => !STAFF_SCOPE.includes(p.permission_name)).map(rowOf);
  const staffRows = permissions.filter((p) => STAFF_SCOPE.includes(p.permission_name)).map(rowOf);
  return {
    roles: columns,
    groups: [
      { key: 'ADMIN', label: 'Khu quản trị (chỉ Admin)', rows: adminRows },
      { key: 'STAFF', label: 'Khu nhân viên', rows: staffRows },
    ].filter((group) => group.rows.length),
  };
}

// chấp nhận chuỗi đơn, mảng chuỗi hoặc không có gì (bỏ tick hết) từ chối mọi giá trị khác
function parseSelection(raw) {
  const list = raw === undefined ? [] : [].concat(raw);
  if (list.length > MAX_SELECTION || !list.every((item) => typeof item === 'string')) {
    throw new AppError('Dữ liệu quyền không hợp lệ', 400);
  }
  const names = [...new Set(list.map((item) => item.trim()))];
  const invalid = names.filter((name) => !STAFF_SCOPE.includes(name));
  if (invalid.length) {
    throw new AppError(`Không thể gán cho nhân viên: ${invalid.join(', ')}`, 400);
  }
  return names;
}

async function saveStaffPermissions(rawSelection) {
  const selected = parseSelection(rawSelection);
  return permissionModel.replaceScopedPermissions(EDITABLE_ROLE, STAFF_SCOPE, selected);
}

module.exports = { STAFF_SCOPE, getMatrix, parseSelection, saveStaffPermissions };