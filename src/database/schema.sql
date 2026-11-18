SET NAMES utf8mb4; --
DROP DATABASE IF EXISTS gocinema;

CREATE DATABASE gocinema
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE gocinema;

SET FOREIGN_KEY_CHECKS = 0;

-- NHÓM 1: TÀI KHOẢN VÀ PHÂN QUYỀN
CREATE TABLE roles (
    role_id    INT AUTO_INCREMENT PRIMARY KEY,
    role_name  VARCHAR(50) NOT NULL UNIQUE COMMENT 'ADMIN / STAFF / CUSTOMER'
) ENGINE=InnoDB;

CREATE TABLE permissions (
    permission_id    INT AUTO_INCREMENT PRIMARY KEY,
    permission_name  VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. MANAGE_MOVIES',
    description      VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
    role_id        INT NOT NULL,
    permission_id  INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE accounts (
    account_id  INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(100) NOT NULL UNIQUE,
    phone       VARCHAR(15) UNIQUE,
    password    VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã băm',
    role_id     INT NOT NULL,
    status      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = active, 0 = locked',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acc_role FOREIGN KEY (role_id) REFERENCES roles(role_id),
    CONSTRAINT chk_acc_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE customers (
    account_id  INT PRIMARY KEY,
    full_name   VARCHAR(100) NOT NULL,
    dob         DATE,
    gender      VARCHAR(10) COMMENT 'Male / Female / Other',
    address     VARCHAR(255),
    CONSTRAINT fk_cus_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
    token_id    INT AUTO_INCREMENT PRIMARY KEY,
    account_id  INT NOT NULL,
    token       VARCHAR(100) NOT NULL UNIQUE COMMENT 'Bản băm SHA-256 của token gửi qua email',
    expires_at  DATETIME NOT NULL,
    is_used     BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_prt_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- NHÓM 2: PHIM
CREATE TABLE movies (
    movie_id      INT AUTO_INCREMENT PRIMARY KEY,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    duration      INT NOT NULL COMMENT 'Minutes',
    release_date  DATE,
    end_date      DATE,
    director      VARCHAR(100),
    actors        VARCHAR(500),
    poster_url    VARCHAR(255),
    trailer_url   VARCHAR(255),
    age_rating    VARCHAR(10) DEFAULT 'P' COMMENT 'P / T13 / T16 / T18',
    status        VARCHAR(20) NOT NULL DEFAULT 'COMING_SOON' COMMENT 'COMING_SOON / NOW_SHOWING / ENDED',
    INDEX idx_movies_title (title),
    INDEX idx_movies_status (status),
    CONSTRAINT chk_movies_duration CHECK (duration > 0),
    CONSTRAINT chk_movies_status CHECK (status IN ('COMING_SOON','NOW_SHOWING','ENDED'))
) ENGINE=InnoDB;

CREATE TABLE genres (
    genre_id    INT AUTO_INCREMENT PRIMARY KEY,
    genre_name  VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE movie_genres (
    movie_id  INT NOT NULL,
    genre_id  INT NOT NULL,
    PRIMARY KEY (movie_id, genre_id),
    CONSTRAINT fk_mg_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE,
    CONSTRAINT fk_mg_genre FOREIGN KEY (genre_id) REFERENCES genres(genre_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- NHÓM 3: RẠP, PHÒNG CHIẾU, GHẾ, SUẤT CHIẾU
CREATE TABLE cinemas (
    cinema_id     INT AUTO_INCREMENT PRIMARY KEY,
    cinema_name   VARCHAR(100) NOT NULL,
    address       VARCHAR(255),
    city          VARCHAR(50),
    phone_number  VARCHAR(15),
    status        TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = active, 0 = suspended',
    CONSTRAINT chk_cinemas_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE staff (
    account_id  INT PRIMARY KEY,
    full_name   VARCHAR(100) NOT NULL,
    cinema_id   INT,
    position    VARCHAR(50),
    CONSTRAINT fk_staff_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_cinema  FOREIGN KEY (cinema_id)  REFERENCES cinemas(cinema_id)
) ENGINE=InnoDB;

CREATE TABLE rooms (
    room_id      INT AUTO_INCREMENT PRIMARY KEY,
    cinema_id    INT NOT NULL,
    room_name    VARCHAR(50) NOT NULL,
    room_type    VARCHAR(20) DEFAULT '2D' COMMENT '2D / 3D / IMAX',
    total_seats  INT DEFAULT 0,
    status       TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = active, 0 = maintenance',
    CONSTRAINT fk_room_cinema FOREIGN KEY (cinema_id) REFERENCES cinemas(cinema_id),
    CONSTRAINT chk_rooms_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE room_layouts (
  room_id       INT PRIMARY KEY,
  row_count     INT NOT NULL,
  column_count  INT NOT NULL,
  couple_pairs  JSON NULL,
  CONSTRAINT fk_room_layout_room FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
  CONSTRAINT chk_room_layout_rows CHECK (row_count BETWEEN 1 AND 702),
  CONSTRAINT chk_room_layout_columns CHECK (column_count BETWEEN 1 AND 100)
) ENGINE=InnoDB;

CREATE TABLE seat_types (
    seat_type_id    INT AUTO_INCREMENT PRIMARY KEY,
    seat_type_name  VARCHAR(30) NOT NULL UNIQUE COMMENT 'Standard / VIP / Couple'
) ENGINE=InnoDB;

CREATE TABLE seats (
    seat_id       INT AUTO_INCREMENT PRIMARY KEY,
    room_id       INT NOT NULL,
    seat_row      CHAR(2) NOT NULL,
    seat_number   INT NOT NULL,
    seat_type_id  INT NOT NULL,
    UNIQUE KEY uq_seat_position (room_id, seat_row, seat_number),
    CONSTRAINT fk_seat_room      FOREIGN KEY (room_id)      REFERENCES rooms(room_id) ON DELETE CASCADE,
    CONSTRAINT fk_seat_seat_type FOREIGN KEY (seat_type_id) REFERENCES seat_types(seat_type_id)
) ENGINE=InnoDB;

CREATE TABLE showtimes (
    showtime_id    INT AUTO_INCREMENT PRIMARY KEY,
    movie_id       INT NOT NULL,
    room_id        INT NOT NULL,
    start_time     DATETIME NOT NULL,
    end_time       DATETIME NOT NULL COMMENT 'Giờ chiếu + thời lượng phim + 15 phút dọn phòng (dùng để kiểm tra trùng lịch)',
    screen_format  VARCHAR(20) DEFAULT '2D' COMMENT '2D / 3D / IMAX',
    language       VARCHAR(30) COMMENT 'Tiếng Việt / Phụ đề / Lồng tiếng',
    status         TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = open, 0 = closed, -1 = cancelled',
    INDEX idx_show_movie_start (movie_id, start_time),
    INDEX idx_show_room_start (room_id, start_time),
    CONSTRAINT fk_show_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id),
    CONSTRAINT fk_show_room  FOREIGN KEY (room_id)  REFERENCES rooms(room_id),
    CONSTRAINT chk_show_time CHECK (end_time > start_time),
    CONSTRAINT chk_show_status CHECK (status IN (-1, 0, 1))
) ENGINE=InnoDB;

CREATE TABLE showtime_seats (
    showtime_id  INT NOT NULL,
    seat_id      INT NOT NULL,
    status       TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = available, 0 = held, -1 = sold',
    held_until   DATETIME NULL COMMENT 'Hạn giữ ghế tạm thời',
    held_by      INT NULL COMMENT 'Tài khoản đang giữ ghế (NULL khi ghế trống hoặc đã bán)',
    PRIMARY KEY (showtime_id, seat_id),
    INDEX idx_ss_status_held (status, held_until),
    CONSTRAINT fk_ss_showtime FOREIGN KEY (showtime_id) REFERENCES showtimes(showtime_id) ON DELETE CASCADE,
    CONSTRAINT fk_ss_seat     FOREIGN KEY (seat_id)     REFERENCES seats(seat_id),
    CONSTRAINT fk_ss_held_by  FOREIGN KEY (held_by)     REFERENCES accounts(account_id) ON DELETE SET NULL,
    CONSTRAINT chk_ss_status CHECK (status IN (-1, 0, 1))
) ENGINE=InnoDB;

-- NHÓM 4: GIÁ VÉ, ĐỒ ĂN, KHUYẾN MÃI
CREATE TABLE ticket_prices (
    price_id       INT AUTO_INCREMENT PRIMARY KEY,
    seat_type_id   INT NOT NULL,
    screen_format  VARCHAR(20) DEFAULT '2D',
    day_type       VARCHAR(20) DEFAULT 'WEEKDAY' COMMENT 'WEEKDAY / WEEKEND / HOLIDAY',
    time_from      TIME,
    time_to        TIME,
    price          DECIMAL(10,0) NOT NULL,
    valid_from     DATE,
    valid_to       DATE,
    CONSTRAINT fk_tp_seat_type FOREIGN KEY (seat_type_id) REFERENCES seat_types(seat_type_id),
    CONSTRAINT chk_tp_price CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE food_items (
    food_id    INT AUTO_INCREMENT PRIMARY KEY,
    food_name  VARCHAR(100) NOT NULL,
    category   VARCHAR(30) COMMENT 'POPCORN / DRINK / COMBO',
    price      DECIMAL(10,0) NOT NULL,
    image_url  VARCHAR(255),
    status     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = available, 0 = unavailable',
    CONSTRAINT chk_food_price CHECK (price >= 0),
    CONSTRAINT chk_food_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE promotions (
    promotion_id     INT AUTO_INCREMENT PRIMARY KEY,
    promo_code       VARCHAR(30) NOT NULL UNIQUE,
    promotion_name   VARCHAR(100) NOT NULL,
    description      TEXT,
    discount_type    VARCHAR(20) NOT NULL COMMENT 'PERCENT / AMOUNT',
    discount_value   DECIMAL(10,2) NOT NULL,
    max_discount     DECIMAL(10,0),
    min_order_value  DECIMAL(10,0) DEFAULT 0,
    start_date       DATETIME,
    end_date         DATETIME,
    quantity         INT,
    used_count       INT NOT NULL DEFAULT 0,
    status           TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = active, 0 = expired, -1 = paused',
    CONSTRAINT chk_promo_type CHECK (discount_type IN ('PERCENT','AMOUNT')),
    CONSTRAINT chk_promo_status CHECK (status IN (-1, 0, 1))
) ENGINE=InnoDB;

-- NHÓM 5: CA LÀM VIỆC, ĐƠN HÀNG, VÉ, THANH TOÁN
CREATE TABLE work_shifts (
    shift_id      INT AUTO_INCREMENT PRIMARY KEY,
    staff_id      INT NOT NULL,
    start_time    DATETIME NOT NULL,
    end_time      DATETIME NULL,
    opening_cash  DECIMAL(12,0) DEFAULT 0,
    closing_cash  DECIMAL(12,0) NULL,
    status        TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = open, 0 = closed',
    CONSTRAINT fk_shift_staff FOREIGN KEY (staff_id) REFERENCES staff(account_id),
    CONSTRAINT chk_shift_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE orders (
    order_id         INT AUTO_INCREMENT PRIMARY KEY,
    order_code       VARCHAR(20) NOT NULL UNIQUE COMMENT 'Ma don hien thi cho khach',
    customer_id      INT NULL COMMENT 'NULL neu ban cho khach vang lai(bán tại quầy)',
    staff_id         INT NULL COMMENT 'NULL neu khach dat online',
    shift_id         INT NULL COMMENT 'NULL neu khach dat online',
    channel          VARCHAR(10) NOT NULL DEFAULT 'ONLINE' COMMENT 'ONLINE / COUNTER',
    promotion_id     INT NULL,
    subtotal         DECIMAL(12,0) NOT NULL DEFAULT 0,
    discount_amount  DECIMAL(12,0) NOT NULL DEFAULT 0,
    total_amount     DECIMAL(12,0) NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / PAID / CANCELLED / EXPIRED',
    cancel_reason    VARCHAR(255),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at     DATETIME NULL,
    INDEX idx_orders_customer_date (customer_id, created_at),
    INDEX idx_orders_created_at (created_at),
    INDEX idx_orders_status_created (status, created_at),
    CONSTRAINT fk_ord_customer  FOREIGN KEY (customer_id)  REFERENCES customers(account_id),
    CONSTRAINT fk_ord_staff     FOREIGN KEY (staff_id)     REFERENCES staff(account_id),
    CONSTRAINT fk_ord_shift     FOREIGN KEY (shift_id)     REFERENCES work_shifts(shift_id),
    CONSTRAINT fk_ord_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(promotion_id),
    CONSTRAINT chk_ord_channel CHECK (channel IN ('ONLINE','COUNTER')),
    CONSTRAINT chk_ord_status CHECK (status IN ('PENDING','PAID','CANCELLED','EXPIRED'))
) ENGINE=InnoDB;

CREATE TABLE tickets (
    ticket_id            INT AUTO_INCREMENT PRIMARY KEY,
    order_id             INT NOT NULL,
    showtime_id          INT NOT NULL,
    seat_id              INT NOT NULL,
    ticket_price         DECIMAL(10,0) NOT NULL COMMENT 'Gia tai thoi diem mua',
    qr_code              VARCHAR(50) NOT NULL UNIQUE COMMENT 'Ma QR de soat ve',
    status               TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = valid, 0 = used, -1 = cancelled. Tao cung luc voi don; chi co hieu luc khi don o trang thai PAID',
    checked_by_staff_id  INT NULL,
    checked_in_at        DATETIME NULL,
    INDEX idx_tickets_showtime_seat (showtime_id, seat_id),
    CONSTRAINT fk_tic_order    FOREIGN KEY (order_id)            REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_tic_showtime FOREIGN KEY (showtime_id)         REFERENCES showtimes(showtime_id),
    CONSTRAINT fk_tic_seat     FOREIGN KEY (seat_id)             REFERENCES seats(seat_id),
    CONSTRAINT fk_tic_staff    FOREIGN KEY (checked_by_staff_id) REFERENCES staff(account_id),
    CONSTRAINT chk_tic_status CHECK (status IN (-1, 0, 1))
) ENGINE=InnoDB;

CREATE TABLE order_food_items (
    order_food_id  INT AUTO_INCREMENT PRIMARY KEY,
    order_id       INT NOT NULL,
    food_id        INT NOT NULL,
    quantity       INT NOT NULL DEFAULT 1,
    unit_price     DECIMAL(10,0) NOT NULL COMMENT 'Don gia tai thoi diem mua',
    CONSTRAINT fk_ofi_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_ofi_food  FOREIGN KEY (food_id)  REFERENCES food_items(food_id),
    CONSTRAINT chk_ofi_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id       INT AUTO_INCREMENT PRIMARY KEY,
    order_id         INT NOT NULL,
    payment_method   VARCHAR(20) NOT NULL COMMENT 'CASH / CARD / E_WALLET / BANK_TRANSFER',
    amount           DECIMAL(12,0) NOT NULL,
    transaction_ref  VARCHAR(50) COMMENT 'Ma giao dich tu cong thanh toan',
    status           TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = success, 0 = failed, -1 = refunded',
    paid_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT chk_pay_method CHECK (payment_method IN ('CASH','CARD','E_WALLET','BANK_TRANSFER')),
    CONSTRAINT chk_pay_status CHECK (status IN (-1, 0, 1))
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;