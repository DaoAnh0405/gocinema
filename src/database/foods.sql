CREATE DATABASE IF NOT EXISTS gocinema CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gocinema;

CREATE TABLE IF NOT EXISTS food_items (
    food_id INT AUTO_INCREMENT PRIMARY KEY,
    food_name VARCHAR(100) NOT NULL,
    category VARCHAR(30) COMMENT 'POPCORN / DRINK / COMBO',
    price DECIMAL(10, 0) NOT NULL,
    image_url VARCHAR(255),
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = available, 0 = unavailable',
    CONSTRAINT chk_food_price CHECK (price >= 0),
    CONSTRAINT chk_food_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

INSERT INTO food_items (food_name, category, price, status, image_url) VALUES
('Combo Bỏng Nước 1', 'COMBO', 69000, 1, NULL),
('Combo Bỏng Nước 2', 'COMBO', 69000, 1, NULL),
('Combo Couple', 'COMBO', 109000, 1, NULL),
('Bỏng Phô Mai', 'POPCORN', 69000, 1, NULL),
('Combo Gia Đình', 'COMBO', 69000, 0, NULL);
