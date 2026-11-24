const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const listPermissions = () => query(
  'SELECT permission_id, permission_name, description FROM permissions ORDER BY permission_id',
);

const listRoles = () => query(
  `SELECT r.role_id, r.role_name, COUNT(a.account_id) AS account_count
     FROM roles r LEFT JOIN accounts a ON a.role_id = r.role_id
    GROUP BY r.role_id, r.role_name
    ORDER BY r.role_id`,
);

const listGranted = () => query(
  `SELECT r.role_name, p.permission_name
     FROM role_permissions rp
     JOIN roles r ON r.role_id = rp.role_id
     JOIN permissions p ON p.permission_id = rp.permission_id`,
);

// chỉ thay các quyền trong `scopeNames` quyền khác của vai trò được giữ nguyên
// trả về { added, removed } để báo cáo thay đổi
async function replaceScopedPermissions(roleName, scopeNames, selectedNames) {
  return withTransaction(async (conn) => {
    const [roles] = await conn.query('SELECT role_id FROM roles WHERE role_name = ? FOR UPDATE', [roleName]);
    if (!roles.length) throw new AppError('Không tìm thấy vai trò', 404);
    const roleId = roles[0].role_id;

    const [scope] = await conn.query(
      'SELECT permission_id, permission_name FROM permissions WHERE permission_name IN (?)',
      [scopeNames],
    );
    const idByName = new Map(scope.map((row) => [row.permission_name, row.permission_id]));
    if (selectedNames.some((name) => !idByName.has(name))) throw new AppError('Quyền không tồn tại', 400);

    const [current] = await conn.query(
      'SELECT permission_id FROM role_permissions WHERE role_id = ? AND permission_id IN (?)',
      [roleId, scope.map((row) => row.permission_id)],
    );
    const currentIds = new Set(current.map((row) => row.permission_id));
    const selectedIds = new Set(selectedNames.map((name) => idByName.get(name)));
    const nameById = new Map(scope.map((row) => [row.permission_id, row.permission_name]));

    const removedIds = [...currentIds].filter((id) => !selectedIds.has(id));
    const addedIds = [...selectedIds].filter((id) => !currentIds.has(id));
    if (removedIds.length) {
      await conn.query('DELETE FROM role_permissions WHERE role_id = ? AND permission_id IN (?)', [roleId, removedIds]);
    }
    if (addedIds.length) {
      await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [addedIds.map((id) => [roleId, id])]);
    }
    return { added: addedIds.map((id) => nameById.get(id)), removed: removedIds.map((id) => nameById.get(id)) };
  });
}

module.exports = { listPermissions, listRoles, listGranted, replaceScopedPermissions };