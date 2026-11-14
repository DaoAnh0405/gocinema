CREATE DATABASE IF NOT EXISTS gocinema CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gocinema;

CREATE TABLE IF NOT EXISTS foods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(500) NULL,
    price DECIMAL(12, 0) NOT NULL,
    status ENUM('Đang bán', 'Ngừng bán') DEFAULT 'Đang bán',
    image_url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO foods (name, description, price, status) VALUES
('Combo Bỏng Nước 1', '1 Bỏng vừa + 1 nước', 69000, 'Đang bán'),
('Combo Bỏng Nước 2', '1 Bỏng lớn + 1 nước', 69000, 'Đang bán'),
('Combo Couple', '2 Bỏng + 2 nước', 109000, 'Đang bán'),
('Bỏng Phô Mai', '1 Bỏng vị phô mai', 69000, 'Đang bán'),
('Combo Gia Đình', '2 Bỏng lớn + 4 nước', 69000, 'Ngừng bán');  