SET NAMES utf8mb4; --
USE gocinema;

SET SQL_SAFE_UPDATES = 0;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE payments;
TRUNCATE TABLE order_food_items;
TRUNCATE TABLE tickets;
TRUNCATE TABLE orders;
TRUNCATE TABLE work_shifts;
TRUNCATE TABLE showtime_seats;
TRUNCATE TABLE showtimes;
TRUNCATE TABLE ticket_prices;
TRUNCATE TABLE promotions;
TRUNCATE TABLE food_items;
TRUNCATE TABLE seats;
TRUNCATE TABLE rooms;
TRUNCATE TABLE staff;
TRUNCATE TABLE cinemas;
TRUNCATE TABLE movie_genres;
TRUNCATE TABLE movies;
TRUNCATE TABLE genres;
TRUNCATE TABLE seat_types;
TRUNCATE TABLE password_reset_tokens;
TRUNCATE TABLE customers;
TRUNCATE TABLE accounts;
TRUNCATE TABLE role_permissions;
TRUNCATE TABLE permissions;
TRUNCATE TABLE roles;
SET FOREIGN_KEY_CHECKS = 1;

-- NHÓM 1: VAI TRÒ, QUYỀN, TÀI KHOẢN
INSERT INTO roles (role_name) VALUES ('ADMIN'), ('STAFF'), ('CUSTOMER');

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

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'STAFF'
  AND p.permission_name IN
      ('VIEW_SHOWTIMES', 'SELL_TICKETS', 'CHECKIN_TICKETS', 'HANDLE_TICKETS', 'MANAGE_SHIFTS');

-- Hash bcrypt của "Demo12345" mk dùng chung cho tất cả tài khoản
SET @pwd = '$2a$10$HV7seHtLJEtKoeT8gyLoS.cXaNRp2nBeVUDQCp4XwlGQBIvrVkg5a';

-- 1 ADMIN + 4 STAFF + 8 CUSTOMER
INSERT INTO accounts (email, phone, password, role_id, status, created_at)
SELECT x.email, x.phone, @pwd, r.role_id, x.status, x.created_at
FROM (
  SELECT 'admin@gocinema.vn'    AS email, '0900000001' AS phone, 'ADMIN'    AS role, 1 AS status, '2026-01-01 08:00:00' AS created_at
  UNION ALL SELECT 'staff1@gocinema.vn', '0900000011', 'STAFF', 1, '2026-01-05 08:00:00'
  UNION ALL SELECT 'staff2@gocinema.vn', '0900000012', 'STAFF', 1, '2026-01-05 08:00:00'
  UNION ALL SELECT 'staff3@gocinema.vn', '0900000013', 'STAFF', 1, '2026-01-06 08:00:00'
  UNION ALL SELECT 'staff4@gocinema.vn', '0900000014', 'STAFF', 0, '2026-01-06 08:00:00'
  UNION ALL SELECT 'an.nguyen@example.com',    '0912345001', 'CUSTOMER', 1, '2026-02-10 10:15:00'
  UNION ALL SELECT 'binh.tran@example.com',    '0912345002', 'CUSTOMER', 1, '2026-02-18 14:30:00'
  UNION ALL SELECT 'chi.le@example.com',       '0912345003', 'CUSTOMER', 1, '2026-03-02 09:45:00'
  UNION ALL SELECT 'dung.pham@example.com',    '0912345004', 'CUSTOMER', 1, '2026-03-15 19:20:00'
  UNION ALL SELECT 'em.hoang@example.com',     '0912345005', 'CUSTOMER', 1, '2026-04-01 21:00:00'
  UNION ALL SELECT 'giang.vu@example.com',     '0912345006', 'CUSTOMER', 1, '2026-05-12 11:11:00'
  UNION ALL SELECT 'hoa.dang@example.com',     '0912345007', 'CUSTOMER', 1, '2026-06-20 16:40:00'
  UNION ALL SELECT 'khoa.bui@example.com',     '0912345008', 'CUSTOMER', 0, '2026-07-07 08:05:00'
) x
JOIN roles r ON r.role_name = x.role;

INSERT INTO customers (account_id, full_name, dob, gender, address)
SELECT a.account_id, c.full_name, c.dob, c.gender, c.address
FROM (
  SELECT 'an.nguyen@example.com' AS email, 'Nguyễn Văn An' AS full_name, '1999-03-12' AS dob, 'Male' AS gender, '12 Xuân Thủy, Cầu Giấy, Hà Nội' AS address
  UNION ALL SELECT 'binh.tran@example.com', 'Trần Thị Bình',  '2001-07-25', 'Female', '45 Nguyễn Trãi, Thanh Xuân, Hà Nội'
  UNION ALL SELECT 'chi.le@example.com',    'Lê Minh Chí',    '1995-11-02', 'Male',   '78 Ngọc Lâm, Long Biên, Hà Nội'
  UNION ALL SELECT 'dung.pham@example.com', 'Phạm Thùy Dung', '2003-01-30', 'Female', '5 Lê Lợi, Quận 1, TP.HCM'
  UNION ALL SELECT 'em.hoang@example.com',  'Hoàng Gia Em',   '1998-09-14', 'Other',  '23 Trần Duy Hưng, Cầu Giấy, Hà Nội'
  UNION ALL SELECT 'giang.vu@example.com',  'Vũ Hương Giang', '2000-05-05', 'Female', '90 Hai Bà Trưng, Quận 1, TP.HCM'
  UNION ALL SELECT 'hoa.dang@example.com',  'Đặng Quỳnh Hoa', '1997-12-20', 'Female', '17 Phố Huế, Hai Bà Trưng, Hà Nội'
  UNION ALL SELECT 'khoa.bui@example.com',  'Bùi Anh Khoa',   '2002-08-08', 'Male',   '66 Điện Biên Phủ, Bình Thạnh, TP.HCM'
) c
JOIN accounts a ON a.email = c.email;

-- NHÓM 2: PHIM + THỂ LOẠI
INSERT INTO genres (genre_name) VALUES
  ('Hành động'), ('Tình cảm'), ('Hài'), ('Kinh dị'), ('Hoạt hình'),
  ('Khoa học viễn tưởng'), ('Tâm lý'), ('Phiêu lưu');

INSERT INTO movies
    (title, description, duration, release_date, end_date, director, actors, poster_url, trailer_url, age_rating, status)
VALUES
-- ĐANG CHIẾU
('Khi Thần Chết Đổ Chuông',
 'Câu chuyện đầy kịch tính về lằn ranh sinh tử và những bí ẩn đằng sau tiếng chuông định mệnh.',
 110, '2026-01-01', NULL, 'Jay Sukmo',
 'Bhisma Mulia, Ratu Sofya, Givina',
 '/images/posters/khi-than-chet-do-chuong.jpg', 'https://www.youtube.com/watch?v=eJZOJVGaXKQ', 'T18', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=eJZOJVGaXKQ

('Thiên Đường Tăm Tối',
 'Hành trình khám phá những góc khuất tâm lý và bí mật đen tối tại một nơi tưởng chừng như yên bình.',
 115, '2026-01-01', NULL, 'Yeon Sang-ho',
 'Kim Hyun-joo, Bae Hyun-sung, Lee Hyun-kyun, Kim Jong-tae, Koo Kyo-hwan',
 '/images/posters/thien-duong-tam-toi.jpg', 'https://www.youtube.com/watch?v=drOYCp_2Vtw', 'T18', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=drOYCp_2Vtw

('Chàng Mèo Mang Mũ',
 'Bộ phim hoạt hình/phiêu lưu thú vị về chú mèo kỳ lạ mang theo những bất ngờ và tiếng cười.',
 95, '2026-01-01', NULL, 'Alessandro Carloni, Erica Rivinoja',
 'Bill Hader, Xochitl Gomez, Matt Berry, Quinta Brunson, Bowen Yang',
 '/images/posters/chang-meo-mang-mu.jpg', 'https://www.youtube.com/watch?v=eCs0qclCDKA', 'P', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=eCs0qclCDKA

('Trại Buôn Người',
 'Phút giây nghẹt thở lật tẩy đường dây tội phạm xuyên quốc gia và cuộc chiến sinh tồn.',
 120, '2026-01-01', NULL, 'Toni Dương Bảo Anh',
 'Steven Nguyễn, Trầm Minh Hoàng, Quách Ngọc Ngoan, Huỳnh Minh Kiên, Tùng Mint, Võ Đình Hiếu',
 '/images/posters/trai-buon-nguoi.jpg', 'https://www.youtube.com/watch?v=8SF-MgysvBU', 'T18', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=8SF-MgysvBU

('Clayface',
 'Tác phẩm xoay quanh nhân vật phản diện mang khả năng biến hóa khôn lường trong thế giới siêu anh hùng.',
 125, '2026-01-01', NULL, 'James Watkins',
 'Tom Rhys Harries, Naomi Ackie, David Dencik, Max Minghella, Eddie Marsan',
 '/images/posters/clayface.jpg', 'https://www.youtube.com/watch?v=KCR-rz0YfD4', 'T16', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=KCR-rz0YfD4

('Chị Chị Em Em 3',
 'Phần tiếp theo của series phim điện ảnh tâm lý, giật gân xoay quanh những mưu mô tình cảm đầy rẫy bất ngờ.',
 105, '2026-01-01', NULL, 'Nguyễn Hữu Hoàng',
 'Ninh Dương Lan Ngọc, Nguyễn Cao Kỳ Duyên, Steven Nguyễn, Chi Pu, Trần Quốc Anh, Lê Khanh',
 '/images/posters/chi-chi-em-em-3.jpg', 'https://www.youtube.com/watch?v=lM4mrAELuz0', 'T18', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=lM4mrAELuz0

('Ramayana : Khởi Nguồn Một Huyền Thoại',
 'Sử thi hoành tráng tái hiện câu chuyện truyền thuyết kinh điển đầy màu sắc và cảm xúc.',
 170, '2026-01-01', NULL, 'Nitesh Tiwari',
 'Ranbir Kapoor, Sai Pallavi, Yash, Sunny Deol, Ravie Dubey',
 '/images/posters/ramayana.jpg', 'https://www.youtube.com/watch?v=6BDX2p1aNlE', 'P', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=6BDX2p1aNlE

('Bò Sữa Bay',
 'Bộ phim hoạt hình giải trí nhẹ nhàng với các nhân vật đáng yêu và chuyến phiêu lưu kỳ thú.',
 90, '2026-01-01', NULL, 'Nguyễn Phạm Thành Đạt',
 'Nguyễn Hùng, Võ Điền Gia Huy, Ngọc Xuân, Tiểu Vy, Lãnh Thanh, Huy Tít',
 '/images/posters/bo-sua-bay.jpg', 'https://www.youtube.com/watch?v=kKhAo3l2Bb4', 'P', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=kKhAo3l2Bb4

('Godzilla Minus Zero',
 'Cuộc đối đầu kinh hoàng khi quái vật huyền thoại trỗi dậy tàn phá, đẩy nhân loại vào bờ vực tuyệt vọng.',
 125, '2026-01-01', NULL, 'Takashi Yamazaki',
 'Ryunosuke Kamiki, Minami Hamabe, Masami Nagasawa, Jun Kunimura',
 '/images/posters/godzilla-minus-zero.jpg', 'https://www.youtube.com/watch?v=TfkCKKW3iB8', 'T13', 'NOW_SHOWING'),
-- https://www.youtube.com/watch?v=TfkCKKW3iB8

-- SẮP CHIẾU
('Avengers: Doomsday',
 'Các siêu anh hùng của vũ trụ Marvel đối mặt với mối đe dọa lớn nhất từ trước đến nay.',
 150, '2026-12-18', NULL, 'Anthony Russo, Joe Russo',
 'Robert Downey Jr., Chris Hemsworth, Anthony Mackie, Florence Pugh',
 '/images/posters/avengers-doomsday.jpg', 'https://www.youtube.com/watch?v=irVNGjRFZGk', 'T13', 'COMING_SOON'),
-- https://www.youtube.com/watch?v=irVNGjRFZGk

('Dune: Hành Tinh Cát - Phần Ba',
 'Phần kết của bộ ba Dune, tiếp nối hành trình của Paul Atreides trên con đường làm hoàng đế.',
 150, '2026-12-18', NULL, 'Denis Villeneuve',
 'Timothée Chalamet, Zendaya, Florence Pugh, Jason Momoa',
 '/images/posters/dune-3.jpg', 'https://www.youtube.com/watch?v=of4DM5WWv4M', 'T13', 'COMING_SOON'),
-- https://www.youtube.com/watch?v=of4DM5WWv4M

('Nhất Quỷ Nhì Ma',
 'Tại một ngôi trường bị bao phủ bởi những lời đồn tâm linh, những hiện tượng kỳ bí liên tiếp xảy ra và dần hé lộ các bí mật đáng sợ.',
 120, '2027-01-15', NULL, 'Đang cập nhật',
 'Đang cập nhật',
 '/images/posters/nhat-quy-nhi-ma.jpg', 'https://www.youtube.com/watch?v=8untGwjhtYQ', 'T16', 'COMING_SOON'),
-- https://www.youtube.com/watch?v=8untGwjhtYQ

('The Angry Birds Movie 3',
 'Red, Chuck, Bomb và những người bạn trở lại trong chuyến phiêu lưu mới với nhiều tình huống hài hước và bất ngờ.',
 95, '2027-01-01', NULL, 'John Rice',
 'Jason Sudeikis, Josh Gad, Danny McBride, Rachel Bloom, Emma Myers, Keke Palmer, Lily James, Walker Scobell',
 '/images/posters/angry-birds-3.jpg', 'https://www.youtube.com/watch?v=a9DB_aUMzME', 'P', 'COMING_SOON'),
-- https://www.youtube.com/watch?v=a9DB_aUMzME

('Đêm Hung Tàn 2',
 'Ông Già Noel trở lại trong cuộc phiêu lưu Giáng Sinh đầy hài hước và kịch tính khi phải đối mặt với những mối đe dọa mới.',
 110, '2026-12-04', NULL, 'Tommy Wirkola',
 'David Harbour, Kristen Bell, Jared Harris, Daniela Melchior, Joe Pantoliano, Andrew Bachelor',
 '/images/posters/dem-hung-tan-2.jpg', 'https://www.youtube.com/watch?v=B4I29C3ddu4', 'T18', 'COMING_SOON'),
-- https://www.youtube.com/watch?v=B4I29C3ddu4

('Trại Giam Hạnh Phúc',
 'Câu chuyện về một người thầy hiền lành bị đưa vào tù và hành trình cảm hóa những con người nơi song sắt bằng lòng tốt.',
 127, '2026-11-20', NULL, 'Nguyễn Nhật Trung',
 'Ma Ran Đô, Tuấn Trần, Khuyến Dương, Tiến Luật, Gia Nguyễn, Hoàng Phi, La Thành, Lương Thế Thành',
 '/images/posters/trai-giam-hanh-phuc.jpg', 'https://www.youtube.com/watch?v=gXfaBKCL9z4', 'T13', 'COMING_SOON'),
-- https://www.youtube.com/watch?v=gXfaBKCL9z4

-- ĐÃ KẾT THÚC
('Oppenheimer',
 'Câu chuyện về J. Robert Oppenheimer và vai trò của ông trong việc chế tạo bom nguyên tử.',
 180, '2023-07-21', '2023-09-30', 'Christopher Nolan',
 'Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.',
 '/images/posters/oppenheimer.jpg', 'https://www.youtube.com/watch?v=uYPbbksJxIg', 'T18', 'ENDED'),

('Joker: Folie À Deux',
 'Arthur Fleck bị giam tại Arkham và gặp Harley Quinn, người mở ra thế giới âm nhạc và tình yêu điên loạn.',
 138, '2024-10-04', '2024-11-20', 'Todd Phillips',
 'Joaquin Phoenix, Lady Gaga, Brendan Gleeson, Catherine Keener',
 '/images/posters/joker-2.jpg', 'https://www.youtube.com/watch?v=_OKAwz2MsJs', 'T18', 'ENDED'),

('Godzilla x Kong: Đế Chế Mới',
 'Godzilla và Kong bắt tay chống lại mối đe dọa khổng lồ ẩn sâu trong lòng Trái Đất.',
 115, '2024-03-29', '2024-05-31', 'Adam Wingard',
 'Rebecca Hall, Brian Tyree Henry, Dan Stevens, Kaylee Hottle',
 '/images/posters/godzilla-x-kong.jpg', 'https://www.youtube.com/watch?v=B2Jlyq_Tf3Y', 'T13', 'ENDED');

-- Gán thể loại cho các phim thực sự có trong danh sách movies
INSERT INTO movie_genres (movie_id, genre_id)
SELECT m.movie_id, g.genre_id
FROM (
  -- ĐANG CHIẾU
  SELECT 'Khi Thần Chết Đổ Chuông' AS t, 'Kinh dị' AS g
  UNION ALL SELECT 'Khi Thần Chết Đổ Chuông', 'Tâm lý'
  UNION ALL SELECT 'Thiên Đường Tăm Tối', 'Tâm lý'
  UNION ALL SELECT 'Thiên Đường Tăm Tối', 'Kinh dị'
  UNION ALL SELECT 'Chàng Mèo Mang Mũ', 'Hoạt hình'
  UNION ALL SELECT 'Chàng Mèo Mang Mũ', 'Hài'
  UNION ALL SELECT 'Chàng Mèo Mang Mũ', 'Phiêu lưu'
  UNION ALL SELECT 'Trại Buôn Người', 'Hành động'
  UNION ALL SELECT 'Trại Buôn Người', 'Tâm lý'
  UNION ALL SELECT 'Clayface', 'Kinh dị'
  UNION ALL SELECT 'Clayface', 'Khoa học viễn tưởng'
  UNION ALL SELECT 'Clayface', 'Hành động'
  UNION ALL SELECT 'Chị Chị Em Em 3', 'Tâm lý'
  UNION ALL SELECT 'Chị Chị Em Em 3', 'Tình cảm'
  UNION ALL SELECT 'Ramayana : Khởi Nguồn Một Huyền Thoại', 'Hành động'
  UNION ALL SELECT 'Ramayana : Khởi Nguồn Một Huyền Thoại', 'Phiêu lưu'
  UNION ALL SELECT 'Bò Sữa Bay', 'Hoạt hình'
  UNION ALL SELECT 'Bò Sữa Bay', 'Phiêu lưu'
  UNION ALL SELECT 'Bò Sữa Bay', 'Hài'
  UNION ALL SELECT 'Godzilla Minus Zero', 'Hành động'
  UNION ALL SELECT 'Godzilla Minus Zero', 'Khoa học viễn tưởng'
  -- SẮP CHIẾU
  UNION ALL SELECT 'Avengers: Doomsday', 'Hành động'
  UNION ALL SELECT 'Avengers: Doomsday', 'Khoa học viễn tưởng'
  UNION ALL SELECT 'Avengers: Doomsday', 'Phiêu lưu'
  UNION ALL SELECT 'Dune: Hành Tinh Cát - Phần Ba', 'Khoa học viễn tưởng'
  UNION ALL SELECT 'Dune: Hành Tinh Cát - Phần Ba', 'Phiêu lưu'
  UNION ALL SELECT 'Nhất Quỷ Nhì Ma', 'Kinh dị'
  UNION ALL SELECT 'Nhất Quỷ Nhì Ma', 'Hài'
  UNION ALL SELECT 'The Angry Birds Movie 3', 'Hoạt hình'
  UNION ALL SELECT 'The Angry Birds Movie 3', 'Hài'
  UNION ALL SELECT 'The Angry Birds Movie 3', 'Phiêu lưu'
  UNION ALL SELECT 'Đêm Hung Tàn 2', 'Hành động'
  UNION ALL SELECT 'Đêm Hung Tàn 2', 'Hài'
  UNION ALL SELECT 'Đêm Hung Tàn 2', 'Kinh dị'
  UNION ALL SELECT 'Trại Giam Hạnh Phúc', 'Hài'
  UNION ALL SELECT 'Trại Giam Hạnh Phúc', 'Tâm lý'
  -- ĐÃ KẾT THÚC
  UNION ALL SELECT 'Oppenheimer', 'Tâm lý'
  UNION ALL SELECT 'Joker: Folie À Deux', 'Tâm lý'
  UNION ALL SELECT 'Joker: Folie À Deux', 'Tình cảm'
  UNION ALL SELECT 'Godzilla x Kong: Đế Chế Mới', 'Hành động'
  UNION ALL SELECT 'Godzilla x Kong: Đế Chế Mới', 'Khoa học viễn tưởng'
) x
JOIN movies m ON m.title = x.t
JOIN genres g ON g.genre_name = x.g;

-- NHÓM 3: RẠP, NHÂN VIÊN, PHÒNG, GHẾ
INSERT INTO cinemas (cinema_name, address, city, phone_number, status) VALUES
  ('GoCinema Cầu Giấy',  '234 Xuân Thủy, Cầu Giấy',        'Hà Nội',  '02432001001', 1),
  ('GoCinema Nhổn', '15 Nguyễn Văn Cừ, Long Biên',    'Hà Nội',  '02432001002', 1),
  ('GoCinema Quận 1',    '88 Nguyễn Huệ, Quận 1',          'TP.HCM',  '02838001003', 1),
  ('GoCinema Đà Nẵng',   '10 Trần Phú, Hải Châu',          'Đà Nẵng', '02363001004', 0);

INSERT INTO staff (account_id, full_name, cinema_id, position)
SELECT a.account_id, s.full_name, c.cinema_id, s.position
FROM (
  SELECT 'staff1@gocinema.vn' AS email, 'Nguyễn Thị Lan'  AS full_name, 'GoCinema Cầu Giấy'  AS cinema, 'Thu ngân'      AS position
  UNION ALL SELECT 'staff2@gocinema.vn', 'Trần Văn Hùng',   'GoCinema Cầu Giấy',  'Soát vé'
  UNION ALL SELECT 'staff3@gocinema.vn', 'Lê Thu Trang',    'GoCinema Quận 1',    'Quản lý ca'
  UNION ALL SELECT 'staff4@gocinema.vn', 'Phạm Quốc Bảo',   'GoCinema Nhổn', 'Thu ngân'
) s
JOIN accounts a ON a.email = s.email
JOIN cinemas  c ON c.cinema_name = s.cinema;

INSERT INTO seat_types (seat_type_name) VALUES ('Standard'), ('VIP'), ('Couple');

INSERT INTO rooms (cinema_id, room_name, room_type, total_seats, status)
SELECT c.cinema_id, r.room_name, r.room_type, 0, r.status
FROM (
  SELECT 'GoCinema Cầu Giấy' AS cinema, 'Phòng 1' AS room_name, '2D'   AS room_type, 1 AS status
  UNION ALL SELECT 'GoCinema Cầu Giấy',  'Phòng 2', '3D',   1
  UNION ALL SELECT 'GoCinema Cầu Giấy',  'Phòng 3', 'IMAX', 1
  UNION ALL SELECT 'GoCinema Nhổn', 'Phòng 1', '2D',   1
  UNION ALL SELECT 'GoCinema Nhổn', 'Phòng 2', '3D',   1
  UNION ALL SELECT 'GoCinema Quận 1',    'Phòng 1', '2D',   1
  UNION ALL SELECT 'GoCinema Quận 1',    'Phòng 2', 'IMAX', 1
  UNION ALL SELECT 'GoCinema Quận 1',    'Phòng 3', '2D',   0   -- đang bảo trì
) r
JOIN cinemas c ON c.cinema_name = r.cinema;

-- Sơ đồ ghế mỗi phòng: hàng A-D Standard (10 ghế), E-G VIP (10 ghế), H Couple (5 ghế)
INSERT INTO seats (room_id, seat_row, seat_number, seat_type_id)
SELECT r.room_id, rw.seat_row, n.num, st.seat_type_id
FROM rooms r
CROSS JOIN (
  SELECT 'A' AS seat_row, 'Standard' AS type_name
  UNION ALL SELECT 'B', 'Standard' UNION ALL SELECT 'C', 'Standard' UNION ALL SELECT 'D', 'Standard'
  UNION ALL SELECT 'E', 'VIP'      UNION ALL SELECT 'F', 'VIP'      UNION ALL SELECT 'G', 'VIP'
  UNION ALL SELECT 'H', 'Couple'
) rw
CROSS JOIN (
  SELECT 1 AS num UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
) n
JOIN seat_types st ON st.seat_type_name = rw.type_name
WHERE NOT (rw.seat_row = 'H' AND n.num > 5);

UPDATE rooms r
SET total_seats = (SELECT COUNT(*) FROM seats s WHERE s.room_id = r.room_id);

-- NHÓM 4: GIÁ VÉ, ĐỒ ĂN, KHUYẾN MÃI
-- Giá = giá gốc loại ghế + phụ thu định dạng + phụ thu ngày + phụ thu giờ
--   Standard 70k | VIP 90k | Couple 160k (giá/ghế đôi)
--   3D +20k | IMAX +40k
--   WEEKEND +15k | HOLIDAY +25k
--   Sau 17:00 +10k
INSERT INTO ticket_prices
  (seat_type_id, screen_format, day_type, time_from, time_to, price, valid_from, valid_to)
SELECT st.seat_type_id, f.fmt, d.day_type, t.time_from, t.time_to,
       b.base + f.extra + d.extra + t.extra,
       '2026-01-01', '2030-12-31'
FROM seat_types st
JOIN (SELECT 'Standard' AS n, 70000 AS base UNION ALL SELECT 'VIP', 90000 UNION ALL SELECT 'Couple', 160000) b
     ON b.n = st.seat_type_name
CROSS JOIN (SELECT '2D' AS fmt, 0 AS extra UNION ALL SELECT '3D', 20000 UNION ALL SELECT 'IMAX', 40000) f
CROSS JOIN (SELECT 'WEEKDAY' AS day_type, 0 AS extra UNION ALL SELECT 'WEEKEND', 15000 UNION ALL SELECT 'HOLIDAY', 25000) d
CROSS JOIN (SELECT '00:00:00' AS time_from, '16:59:59' AS time_to, 0 AS extra
            UNION ALL SELECT '17:00:00', '23:59:59', 10000) t;

INSERT INTO food_items (food_name, category, price, image_url, status) VALUES
  ('Bắp rang bơ (M)',           'POPCORN', 45000,  '/images/foods/popcorn-m.jpg',   1),
  ('Bắp rang bơ (L)',           'POPCORN', 59000,  '/images/foods/popcorn-l.jpg',   1),
  ('Bắp caramel (L)',           'POPCORN', 65000,  '/images/foods/caramel-l.jpg',   1),
  ('Coca-Cola (M)',             'DRINK',   30000,  '/images/foods/coke-m.jpg',      1),
  ('Coca-Cola (L)',             'DRINK',   38000,  '/images/foods/coke-l.jpg',      1),
  ('Sprite (M)',                'DRINK',   30000,  '/images/foods/sprite-m.jpg',    1),
  ('Nước suối',                 'DRINK',   20000,  '/images/foods/water.jpg',       1),
  ('Trà đào',                   'DRINK',   42000,  '/images/foods/peach-tea.jpg',   1),
  ('Combo 1 (1 bắp M + 1 nước M)',        'COMBO', 69000,  '/images/foods/combo1.jpg', 1),
  ('Combo 2 (1 bắp L + 2 nước M)',        'COMBO', 99000,  '/images/foods/combo2.jpg', 1),
  ('Combo Party (2 bắp L + 4 nước M)',    'COMBO', 189000, '/images/foods/combo-party.jpg', 1),
  ('Bắp phô mai (L)',           'POPCORN', 69000,  '/images/foods/cheese-l.jpg',    0);

INSERT INTO promotions
  (promo_code, promotion_name, description, discount_type, discount_value, max_discount,
   min_order_value, start_date, end_date, quantity, used_count, status)
VALUES
  ('WELCOME10', 'Chào bạn mới',        'Giảm 10% cho đơn từ 100.000đ, tối đa 30.000đ',
   'PERCENT', 10, 30000, 100000, '2026-01-01 00:00:00', '2026-12-31 23:59:59', 1000, 1, 1),
  ('GIAM20K',   'Giảm 20.000đ',        'Giảm trực tiếp 20.000đ cho đơn từ 150.000đ',
   'AMOUNT',  20000, NULL, 150000, '2026-01-01 00:00:00', '2026-12-31 23:59:59', 500, 0, 1),
  ('COMBO15',   'Ưu đãi combo',        'Giảm 15% đơn từ 250.000đ, tối đa 50.000đ',
   'PERCENT', 15, 50000, 250000, '2026-11-01 00:00:00', '2026-12-31 23:59:59', 200, 0, 1),
  ('BLACKFRI',  'Black Friday',        'Giảm 30% tối đa 80.000đ cho đơn từ 200.000đ',
   'PERCENT', 30, 80000, 200000, '2026-11-25 00:00:00', '2026-11-30 23:59:59', 100, 0, -1),
  ('TET2026',   'Tết 2026 (đã hết hạn)', 'Giảm 25.000đ dịp Tết',
   'AMOUNT',  25000, NULL, 100000, '2026-02-01 00:00:00', '2026-02-28 23:59:59', 300, 120, 0);

-- NHÓM 5a: SUẤT CHIẾU (5 ngày kể từ hôm nay, 5 suất/ngày/phòng, xoay vòng phim đang chiếu)
-- Các suất cách nhau 195 phút; thời lượng phim + 15 phút dọn phòng phải phù hợp.
-- Phòng đang bảo trì (status = 0) không có suất chiếu.
-- end_time = start_time + thời lượng + 15 phút dọn phòng
DROP TEMPORARY TABLE IF EXISTS tmp_now;
CREATE TEMPORARY TABLE tmp_now (
  rn INT, movie_id INT, title VARCHAR(200), duration INT
);
INSERT INTO tmp_now
SELECT ROW_NUMBER() OVER (ORDER BY movie_id) - 1, movie_id, title, duration
FROM movies WHERE status = 'NOW_SHOWING';

SET @n = (SELECT COUNT(*) FROM tmp_now);

INSERT INTO showtimes (movie_id, room_id, start_time, end_time, screen_format, language, status)
SELECT t.movie_id, x.room_id, x.st,
       DATE_ADD(x.st, INTERVAL (t.duration + 15) MINUTE),
       x.room_type,
       CASE WHEN t.title IN ('Chàng Mèo Mang Mũ', 'Bò Sữa Bay', 'The Angry Birds Movie 3') THEN 'Lồng tiếng'
            WHEN MOD(x.dn + x.sidx, 2) = 0 THEN 'Phụ đề'
            ELSE 'Lồng tiếng' END,
       1
FROM (
  SELECT r.room_id, r.room_type, d.n AS dn, s.idx AS sidx,
         TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL d.n DAY), s.t) AS st
  FROM rooms r
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) d
  CROSS JOIN (SELECT 0 AS idx, '09:00:00' AS t
              UNION ALL SELECT 1, '12:15:00'
              UNION ALL SELECT 2, '15:30:00'
              UNION ALL SELECT 3, '18:45:00'
              UNION ALL SELECT 4, '22:00:00') s
  WHERE r.status = 1
) x
JOIN tmp_now t ON t.rn = MOD(x.room_id + x.dn + x.sidx, @n)
WHERE x.st > NOW();

DROP TEMPORARY TABLE tmp_now;

-- Mỗi suất chiếu có đủ ghế của phòng, mặc định còn trống
INSERT INTO showtime_seats (showtime_id, seat_id, status, held_until, held_by)
SELECT sh.showtime_id, se.seat_id, 1, NULL, NULL
FROM showtimes sh
JOIN seats se ON se.room_id = sh.room_id;

-- NHÓM 5b: CA LÀM VIỆC
INSERT INTO work_shifts (staff_id, start_time, end_time, opening_cash, closing_cash, status)
SELECT a.account_id, s.st, s.et, s.oc, s.cc, s.status
FROM (
  SELECT 'staff1@gocinema.vn' AS email, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '08:00:00') AS st,
         TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '16:00:00') AS et, 2000000 AS oc, 6350000 AS cc, 0 AS status
  UNION ALL SELECT 'staff3@gocinema.vn', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '16:00:00'),
         TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '23:30:00'), 2000000, 5120000, 0
  UNION ALL SELECT 'staff1@gocinema.vn', TIMESTAMP(CURDATE(), '08:00:00'), NULL, 2000000, NULL, 1
) s
JOIN accounts a ON a.email = s.email;

-- NHÓM 5c: ĐƠN HÀNG MẪU, VÉ, ĐỒ ĂN, THANH TOÁN
-- Ghi chú ghế: hàng A-D Standard, E-G VIP, H Couple
-- Quy ước: vé (tickets) được tạo cùng lúc với đơn; vé chỉ có hiệu lực khi đơn ở trạng thái PAID
-- Giá vé và mã QR dưới đây chỉ là dữ liệu mẫu, không phải cách app sinh mã thật
-- Lấy 4 suất chiếu sớm nhất theo thứ tự thời gian, không giả định ID liên tục
SET @st1 = (SELECT showtime_id FROM showtimes ORDER BY start_time, showtime_id LIMIT 0, 1);
SET @st2 = (SELECT showtime_id FROM showtimes ORDER BY start_time, showtime_id LIMIT 1, 1);
SET @st3 = (SELECT showtime_id FROM showtimes ORDER BY start_time, showtime_id LIMIT 2, 1);
SET @st4 = (SELECT showtime_id FROM showtimes ORDER BY start_time, showtime_id LIMIT 3, 1);

SET @cus1  = (SELECT account_id FROM accounts WHERE email = 'an.nguyen@example.com');
SET @cus2  = (SELECT account_id FROM accounts WHERE email = 'binh.tran@example.com');
SET @cus3  = (SELECT account_id FROM accounts WHERE email = 'chi.le@example.com');
SET @stf1  = (SELECT account_id FROM accounts WHERE email = 'staff1@gocinema.vn');
SET @shift = (SELECT shift_id FROM work_shifts WHERE staff_id = @stf1 AND status = 1 LIMIT 1);
SET @promo = (SELECT promotion_id FROM promotions WHERE promo_code = 'WELCOME10');

-- Đơn 1: ONLINE, ĐÃ THANH TOÁN, 2 ghế VIP + Combo 2, áp mã WELCOME10 ----
INSERT INTO orders (order_code, customer_id, staff_id, shift_id, channel, promotion_id,
                    subtotal, discount_amount, total_amount, status, created_at)
VALUES ('GC260001', @cus1, NULL, NULL, 'ONLINE', @promo, 279000, 27900, 251100, 'PAID', NOW());
SET @o1 = LAST_INSERT_ID();

INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code, status)
SELECT @o1, @st1, se.seat_id, 90000, CONCAT('QR-GC260001-', se.seat_number), 1
FROM seats se
WHERE se.room_id = (SELECT room_id FROM showtimes WHERE showtime_id = @st1)
  AND se.seat_row = 'E' AND se.seat_number IN (5, 6);

INSERT INTO order_food_items (order_id, food_id, quantity, unit_price)
SELECT @o1, food_id, 1, price FROM food_items WHERE food_name LIKE 'Combo 2%';

INSERT INTO payments (order_id, payment_method, amount, transaction_ref, status, paid_at)
VALUES (@o1, 'E_WALLET', 251100, 'MOMO20260001', 1, NOW());

-- Đơn 2: QUẦY, ĐÃ THANH TOÁN, 3 ghế Standard + bắp + nước, khách vãng lai ----
INSERT INTO orders (order_code, customer_id, staff_id, shift_id, channel, promotion_id,
                    subtotal, discount_amount, total_amount, status, created_at)
VALUES ('GC260002', NULL, @stf1, @shift, 'COUNTER', NULL, 285000, 0, 285000, 'PAID', NOW());
SET @o2 = LAST_INSERT_ID();

INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code, status)
SELECT @o2, @st2, se.seat_id, 70000, CONCAT('QR-GC260002-', se.seat_number), 1
FROM seats se
WHERE se.room_id = (SELECT room_id FROM showtimes WHERE showtime_id = @st2)
  AND se.seat_row = 'C' AND se.seat_number IN (4, 5, 6);

INSERT INTO order_food_items (order_id, food_id, quantity, unit_price)
SELECT @o2, food_id, 1, price FROM food_items WHERE food_name = 'Bắp rang bơ (M)'
UNION ALL
SELECT @o2, food_id, 1, price FROM food_items WHERE food_name = 'Coca-Cola (M)';
-- (210.000 vé + 45.000 + 30.000 = 285.000)

INSERT INTO payments (order_id, payment_method, amount, transaction_ref, status, paid_at)
VALUES (@o2, 'CASH', 285000, NULL, 1, NOW());

-- Đơn 3: ONLINE, CHỜ THANH TOÁN, đang giữ 1 ghế Couple (hết hạn sau 10 phút) ----
-- Có vé (status 1, nhưng đơn chưa PAID nên chưa dùng được) và ghế được giữ bởi chính khách đặt đơn
INSERT INTO orders (order_code, customer_id, staff_id, shift_id, channel, promotion_id,
                    subtotal, discount_amount, total_amount, status, created_at)
VALUES ('GC260003', @cus2, NULL, NULL, 'ONLINE', NULL, 160000, 0, 160000, 'PENDING', NOW());
SET @o3 = LAST_INSERT_ID();

INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code, status)
SELECT @o3, @st3, se.seat_id, 160000, CONCAT('QR-GC260003-', se.seat_number), 1
FROM seats se
WHERE se.room_id = (SELECT room_id FROM showtimes WHERE showtime_id = @st3)
  AND se.seat_row = 'H' AND se.seat_number = 2;

UPDATE showtime_seats ss
JOIN seats se ON se.seat_id = ss.seat_id
SET ss.status = 0, ss.held_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE), ss.held_by = @cus2
WHERE ss.showtime_id = @st3
  AND se.room_id = (SELECT room_id FROM showtimes WHERE showtime_id = @st3)
  AND se.seat_row = 'H' AND se.seat_number = 2;

-- Đơn 4: ONLINE, ĐÃ HỦY + HOÀN TIỀN (ghế đã trả lại trạng thái trống) ----
INSERT INTO orders (order_code, customer_id, staff_id, shift_id, channel, promotion_id,
                    subtotal, discount_amount, total_amount, status, cancel_reason, created_at, cancelled_at)
VALUES ('GC260004', @cus3, NULL, NULL, 'ONLINE', NULL, 140000, 0, 140000, 'CANCELLED',
        'Khách đổi lịch', DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW());
SET @o4 = LAST_INSERT_ID();

INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code, status)
SELECT @o4, @st4, se.seat_id, 70000, CONCAT('QR-GC260004-', se.seat_number), -1
FROM seats se
WHERE se.room_id = (SELECT room_id FROM showtimes WHERE showtime_id = @st4)
  AND se.seat_row = 'B' AND se.seat_number IN (3, 4);

INSERT INTO payments (order_id, payment_method, amount, transaction_ref, status, paid_at)
VALUES (@o4, 'BANK_TRANSFER', 140000, 'VCB20260004', -1, DATE_SUB(NOW(), INTERVAL 1 HOUR));

-- Đơn 5: CHECK-IN mẫu (vé đã dùng) ----
INSERT INTO orders (order_code, customer_id, staff_id, shift_id, channel, promotion_id,
                    subtotal, discount_amount, total_amount, status, created_at)
VALUES ('GC260005', @cus1, NULL, NULL, 'ONLINE', NULL, 80000, 0, 80000, 'PAID', DATE_SUB(NOW(), INTERVAL 3 HOUR));
SET @o5 = LAST_INSERT_ID();

INSERT INTO tickets (order_id, showtime_id, seat_id, ticket_price, qr_code, status, checked_by_staff_id, checked_in_at)
SELECT @o5, @st1, se.seat_id, 80000, 'QR-GC260005-1', 0,
       (SELECT account_id FROM accounts WHERE email = 'staff2@gocinema.vn'), NOW()
FROM seats se
WHERE se.room_id = (SELECT room_id FROM showtimes WHERE showtime_id = @st1)
  AND se.seat_row = 'D' AND se.seat_number = 1;

INSERT INTO payments (order_id, payment_method, amount, transaction_ref, status, paid_at)
VALUES (@o5, 'CARD', 80000, 'VISA20260005', 1, DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- Đánh dấu ghế đã bán: chỉ tính vé còn hiệu lực của đơn ĐÃ THANH TOÁN ----
-- (vé của đơn PENDING vẫn để ghế ở trạng thái đang giữ; vé đã hủy thì ghế trống)
UPDATE showtime_seats ss
JOIN tickets t ON t.showtime_id = ss.showtime_id AND t.seat_id = ss.seat_id
JOIN orders o ON o.order_id = t.order_id
SET ss.status = -1, ss.held_until = NULL, ss.held_by = NULL
WHERE o.status = 'PAID' AND t.status IN (0, 1);

-- Cập nhật số lần dùng mã khuyến mãi theo đơn đã thanh toán
UPDATE promotions p
SET p.used_count = (SELECT COUNT(*) FROM orders o WHERE o.promotion_id = p.promotion_id AND o.status = 'PAID')
WHERE p.promo_code = 'WELCOME10';

SET SQL_SAFE_UPDATES = 1;