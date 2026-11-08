USE gocinema;

-- Vai trò (thứ tự cố định: 1 = ADMIN, 2 = STAFF, 3 = CUSTOMER)
INSERT INTO roles (role_name) VALUES ('ADMIN'), ('STAFF'), ('CUSTOMER');

-- Loại ghế
INSERT INTO seat_types (seat_type_name) VALUES ('Standard'), ('VIP'), ('Couple');

-- Thể loại phim
INSERT INTO genres (genre_name) VALUES
  ('Hành động'), ('Tình cảm'), ('Hài'), ('Kinh dị'), ('Hoạt hình'),
  ('Khoa học viễn tưởng'), ('Tâm lý'), ('Phiêu lưu');

-- Danh sách quyền
INSERT INTO permissions (permission_name, description) VALUES
  ('MANAGE_MOVIES',      'Quản lý phim và thể loại'),
  ('MANAGE_CINEMAS',     'Quản lý rạp, phòng, ghế'),
  ('MANAGE_SHOWTIMES',   'Quản lý suất chiếu'),
  ('MANAGE_PRICES',      'Quản lý giá vé'),
  ('MANAGE_FOODS',       'Quản lý đồ ăn'),
  ('MANAGE_PROMOTIONS',  'Quản lý khuyến mãi'),
  ('MANAGE_ACCOUNTS',    'Quản lý tài khoản khách và nhân viên'),
  ('MANAGE_PERMISSIONS', 'Gán quyền theo vai trò'),
  ('VIEW_REPORTS',       'Xem thống kê doanh thu'),
  ('VIEW_SHOWTIMES',     'Xem lịch chiếu và tình trạng ghế'),
  ('SELL_TICKETS',       'Bán vé tại quầy'),
  ('CHECKIN_TICKETS',    'Soát vé'),
  ('HANDLE_TICKETS',     'Xử lý vé (hủy, đổi)'),
  ('MANAGE_SHIFTS',      'Mở/đóng ca làm việc');

-- ADMIN có tất cả quyền
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'ADMIN';

-- STAFF chỉ có quyền nghiệp vụ quầy
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'STAFF'
  AND p.permission_name IN
      ('VIEW_SHOWTIMES', 'SELL_TICKETS', 'CHECKIN_TICKETS', 'HANDLE_TICKETS', 'MANAGE_SHIFTS');

-- CUSTOMER không cần quyền riêng, chỉ cần kiểm tra theo vai trò