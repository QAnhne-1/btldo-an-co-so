-- ==============================================================================
-- DATABASE CREATION & SETUP
-- Electronic Accessories E-Commerce System (qz_store_db)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `qz_store_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `qz_store_db`;

-- 1. USERS TABLE
DROP TABLE IF EXISTS `warranties`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `product_variants`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `brands`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `fullname` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `role` ENUM('admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
  `address` TEXT DEFAULT NULL,
  `status` ENUM('active', 'inactive', 'banned') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. CATEGORIES TABLE
CREATE TABLE `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(120) NOT NULL UNIQUE,
  `description` TEXT DEFAULT NULL,
  `icon` VARCHAR(50) DEFAULT 'fa-box'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BRANDS TABLE
CREATE TABLE `brands` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(120) NOT NULL UNIQUE,
  `logo` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. PRODUCTS TABLE
CREATE TABLE `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT NOT NULL,
  `brand_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `description` LONGTEXT DEFAULT NULL,
  `specifications` JSON DEFAULT NULL,
  `warranty_months` INT NOT NULL DEFAULT 12,
  `thumbnail` VARCHAR(500) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_products_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. PRODUCT VARIANTS TABLE
CREATE TABLE `product_variants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `sku` VARCHAR(100) NOT NULL UNIQUE,
  `variant_name` VARCHAR(100) NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `stock_quantity` INT NOT NULL DEFAULT 0,
  `image` VARCHAR(500) DEFAULT NULL,
  CONSTRAINT `fk_variants_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. ORDERS TABLE
CREATE TABLE `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `order_code` VARCHAR(50) NOT NULL UNIQUE,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(20) NOT NULL,
  `shipping_address` TEXT NOT NULL,
  `payment_method` ENUM('cod', 'banking') NOT NULL DEFAULT 'cod',
  `order_status` ENUM('pending', 'confirmed', 'shipping', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `total_amount` DECIMAL(12,2) NOT NULL,
  `note` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. ORDER ITEMS TABLE
CREATE TABLE `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `variant_id` INT NOT NULL,
  `quantity` INT NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. WARRANTIES TABLE
CREATE TABLE `warranties` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_item_id` INT NOT NULL,
  `serial_number` VARCHAR(100) NOT NULL UNIQUE,
  `customer_phone` VARCHAR(20) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` ENUM('valid', 'expired', 'void') NOT NULL DEFAULT 'valid',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_warranties_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- INDEXES FOR PERFORMANCE
CREATE INDEX `idx_products_category` ON `products` (`category_id`);
CREATE INDEX `idx_products_brand` ON `products` (`brand_id`);
CREATE INDEX `idx_products_slug` ON `products` (`slug`);
CREATE INDEX `idx_variants_sku` ON `product_variants` (`sku`);
CREATE INDEX `idx_orders_code` ON `orders` (`order_code`);
CREATE INDEX `idx_orders_status` ON `orders` (`order_status`);
CREATE INDEX `idx_warranties_serial` ON `warranties` (`serial_number`);
CREATE INDEX `idx_warranties_phone` ON `warranties` (`customer_phone`);

-- ==============================================================================
-- SAMPLE SEED DATA
-- ==============================================================================

-- 1. SEED USERS
-- Passwords:
-- admin@qzstore.com : Admin@123456
-- staff@qzstore.com : Staff@123456
-- customer@gmail.com    : Customer@123456
INSERT INTO `users` (`id`, `fullname`, `email`, `password`, `phone`, `role`, `address`, `status`) VALUES
(1, 'Quản Trị Viên Hệ Thống', 'admin@qzstore.com', '$2a$10$Q1AoM6yo.E20vHF04yHN/upcGy1zir.ZkqZPvbqoblI16r2S4ZwFS', '0901234567', 'admin', 'Tòa nhà qzstore, 123 Đường Công Nghệ, Quận 1, TP.HCM', 'active'),
(2, 'Nhân Viên Bán Hàng', 'staff@qzstore.com', '$2a$10$q41Gn599AusmQ3aTjC9MueOjj2RFaU/1s51qyS5VCfMvxjvUHu/.O', '0902345678', 'staff', 'Chi nhánh 2, 456 Đường Điện Biên Phủ, Quận Bình Thạnh, TP.HCM', 'active'),
(3, 'Lê Quang Anh (Khách Hàng)', 'customer@gmail.com', '$2a$10$mkTocrWwRf1PmKIiSYq2cOo3nBF3X3kFjw1/ZBRx7DPcgS4L1LKv.', '0987654321', 'customer', 'Số 789 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM', 'active');

-- 2. SEED CATEGORIES
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `icon`) VALUES
(1, 'Tai nghe & Âm thanh', 'tai-nghe-am-thanh', 'Tai nghe chụp tai, tai nghe True Wireless, chống ồn đỉnh cao', 'fa-headphones'),
(2, 'Củ sạc & Bộ sạc', 'cu-sac-bo-sac', 'Củ sạc nhanh GaN công suất cao từ 20W đến 140W an toàn', 'fa-bolt'),
(3, 'Cáp sạc & Dây kết nối', 'cap-sac-day-ket-noi', 'Cáp Type-C, Lightning, bọc dù chống đứt, chuẩn sạc PD & QC', 'fa-network-wired'),
(4, 'Pin sạc dự phòng', 'pin-sac-du-phong', 'Dung lượng từ 10.000mAh đến 30.000mAh, sạc nhanh hai chiều', 'fa-battery-full'),
(5, 'Loa Bluetooth di động', 'loa-bluetooth-di-dong', 'Loa kháng nước IPX7, âm bass uy lực, pin siêu trâu', 'fa-volume-high'),
(6, 'Phụ kiện khác', 'phu-kien-khac', 'Các phụ kiện công nghệ tiện ích, giá đỡ, bao da, túi bảo vệ, đầu chuyển đổi', 'fa-shapes');

-- 3. SEED BRANDS
INSERT INTO `brands` (`id`, `name`, `slug`, `logo`) VALUES
(1, 'Anker', 'anker', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Anker_logo.svg/320px-Anker_logo.svg.png'),
(2, 'Sony', 'sony', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Sony_logo.svg/320px-Sony_logo.svg.png'),
(3, 'Apple', 'apple', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/200px-Apple_logo_black.svg.png'),
(4, 'Baseus', 'baseus', 'https://cdn.brandfetch.io/idgXw5R8qQ/theme/light/logo.svg'),
(5, 'Samsung', 'samsung', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Samsung_Logo.svg/320px-Samsung_Logo.svg.png'),
(6, 'JBL', 'jbl', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/JBL_logo.svg/320px-JBL_logo.svg.png');

-- 4. SEED PRODUCTS
INSERT INTO `products` (`id`, `category_id`, `brand_id`, `name`, `slug`, `description`, `specifications`, `warranty_months`, `thumbnail`) VALUES
(1, 1, 2, 'Tai nghe không dây chống ồn Sony WH-1000XM5', 'tai-nghe-khong-day-chong-on-sony-wh-1000xm5', 
'Tai nghe không dây Sony WH-1000XM5 định nghĩa lại chuẩn mực trải nghiệm âm thanh cao cấp với hai bộ xử lý kiểm soát 8 micro mang lại khả năng chống ồn đỉnh cao. Driver 30mm được chế tạo đặc biệt với màng loa composite sợi carbon nhẹ và cứng cáp, tái tạo âm thanh tự nhiên và chi tiết sắc sảo. Thời lượng pin ấn tượng lên đến 30 giờ cùng tính năng sạc nhanh 3 phút cho 3 giờ phát nhạc liên tục.',
'{"Kieu_dang": "Chup tai Over-ear", "Chong_on": "Active Noise Cancelling (ANC) kep", "Thoi_luong_pin": "30 gio (bat ANC) / 40 gio (tat ANC)", "Cong_nghe_am_thanh": "Hi-Res Audio Wireless, LDAC, DSEE Extreme", "Ket_noi": "Bluetooth 5.2 / Jack 3.5mm", "Trong_luong": "250g"}',
12, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'),

(2, 2, 1, 'Củ sạc nhanh Anker 735 GaNPrime 65W 3 cổng', 'cu-sac-nhanh-anker-735-ganprime-65w-3-cong',
'Củ sạc nhanh Anker 735 trang bị công nghệ GaNPrime tiên tiến nhất của Anker, cho phép sạc đồng thời 3 thiết bị với công suất tổng lên đến 65W. Thiết kế siêu nhỏ gọn nhỏ hơn 53% so với bộ sạc 67W thông thường của máy tính xách tay. Hệ thống kiểm soát nhiệt độ ActiveShield 2.0 theo dõi nhiệt độ hơn 3 triệu lần mỗi ngày để bảo vệ thiết bị tối ưu.',
'{"Cong_suat_toi_da": "65W", "So_cong_ra": "2 x USB-C, 1 x USB-A", "Cong_nghe_sac": "GaNPrime, PowerIQ 4.0, ActiveShield 2.0", "Kich_thuoc": "38 x 29 x 66 mm", "Trong_luong": "132g", "Tuong_thich": "MacBook, iPhone, iPad, Laptop Windows, Android"}',
18, 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&auto=format&fit=crop&q=80'),

(3, 4, 1, 'Pin sạc dự phòng Anker 737 PowerCore 24.000mAh 140W', 'pin-sac-du-phong-anker-737-powercore-24000mah-140w',
'Anker 737 Power Bank (PowerCore 24K) là cục sạc dự phòng mạnh mẽ nhất hiện nay hỗ trợ công nghệ Power Delivery 3.1 hai chiều công suất lên đến 140W. Màn hình kỹ thuật số thông minh màu hiển thị công suất vào/ra thời gian thực, dung lượng còn lại và thời gian sạc đầy ước tính. Dung lượng khổng lồ 24.000mAh đủ sạc iPhone 13 gần 5 lần hoặc sạc đầy MacBook Pro 16 inch.',
'{"Dung_luong": "24.000 mAh (86.4 Wh)", "Cong_suat_toi_da": "140W PD 3.1 hai chieu", "So_cong": "2 x USB-C (140W Max), 1 x USB-A (18W Max)", "Man_hinh_hien_thi": "LCD Digital mau thoi gian thuc", "Kich_thuoc": "155.7 x 54.6 x 49.5 mm", "Trong_luong": "635g"}',
24, 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&auto=format&fit=crop&q=80'),

(4, 3, 4, 'Cáp sạc Baseus Tungsten Gold Type-C to Type-C 100W', 'cap-sac-baseus-tungsten-gold-type-c-to-type-c-100w',
'Cáp sạc Baseus Tungsten Gold Type-C to Type-C siêu bền với đầu hợp kim kẽm mạ đen sang trọng chống oxy hóa tuyệt đối. Lõi đồng dày dặn bọc dù nylon mật độ cao chịu uốn cong hơn 10.000 lần. Chip E-Marker thông minh tự động nhận diện và điều chỉnh dòng sạc an toàn lên đến 100W 20V/5A, tốc độ truyền dữ liệu 480Mbps.',
'{"Cong_suat_ho_tro": "100W (20V/5A)", "Chuan_ket_noi": "USB-C to USB-C", "Chat_lieu": "Hop kim kem + Day du bren nylon", "Toc_do_truyen_tai": "480 Mbps", "Chieu_dai": "1m - 2m", "Chip_quan_ly": "E-Marker Smart Chip"}',
12, 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=800&auto=format&fit=crop&q=80'),

(5, 1, 3, 'Tai nghe không dây Apple AirPods Pro 2 (USB-C)', 'tai-nghe-khong-day-apple-airpods-pro-2-usb-c',
'AirPods Pro 2 với chip Apple H2 mang lại hiệu quả chống ồn chủ động gấp 2 lần thế hệ tiền nhiệm, chế độ Xuyên âm thích ứng linh hoạt và Âm thanh không gian cá nhân hóa với khả năng theo dõi chuyển động đầu. Hộp sạc MagSafe trang bị cổng USB-C tiện lợi, chip U1 hỗ trợ định vị chính xác và loa tích hợp phát âm thanh cảnh báo.',
'{"Chip_xu_ly": "Apple H2 (tai nghe) + Apple U1 (hop sac)", "Chong_nuoc": "IP54 (ca tai nghe va hop sac)", "Thoi_luong_pin": "6 gio (tai nghe) / 30 gio (kem hop sac)", "Cong_nghe_sac": "USB-C, MagSafe, Apple Watch Charger, Qi", "Tinh_nang_noi_bat": "Adaptive Audio, Personalized Spatial Audio"}',
12, 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop&q=80'),

(6, 5, 6, 'Loa di động Bluetooth JBL Charge 5 Kháng nước IP67', 'loa-di-dong-bluetooth-jbl-charge-5-khang-nuoc-ip67',
'JBL Charge 5 mang đến chất âm JBL Original Pro Sound đậm chất với củ loa trầm riêng biệt, củ loa tweeter độc lập và bộ tản nhiệt thụ động kép. Chuẩn chống nước và kháng bụi IP67 giúp bạn yên tâm mang theo trong mọi chuyến dã ngoại. Thời gian chơi nhạc lên tới 20 giờ và tích hợp pin dự phòng sạc ngược cho điện thoại.',
'{"Cong_suat": "40W (30W RMS woofer + 10W RMS tweeter)", "Chong_nuoc_bui": "Chuan IP67", "Thoi_luong_pin": "20 gio (Pin 7500 mAh)", "Tinh_nang_khac": "JBL PartyBoost, Sac du phong nguoc qua cong USB-A", "Ket_noi": "Bluetooth 5.1", "Trong_luong": "960g"}',
12, 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80');

-- 5. SEED PRODUCT VARIANTS
-- Note: Setting some variants to low stock (<= 5) to test the Admin Low-Stock alerts!
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `variant_name`, `price`, `stock_quantity`, `image`) VALUES
-- Sony WH-1000XM5
(1, 1, 'SONY-XM5-BLK', 'Màu Đen Nhám (Matte Black)', 7690000.00, 18, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'),
(2, 1, 'SONY-XM5-SLV', 'Màu Bạc Bạch Kim (Platinum Silver)', 7690000.00, 4, 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80'), -- LOW STOCK (4 <= 5)
(3, 1, 'SONY-XM5-BLU', 'Màu Xanh Đêm (Midnight Blue)', 7990000.00, 8, 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80'),

-- Anker 735 GaNPrime 65W
(4, 2, 'ANK-735-BLK', 'Đen Phantom (Phantom Black)', 1190000.00, 45, 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&auto=format&fit=crop&q=80'),
(5, 2, 'ANK-735-WHT', 'Trắng Tinh Khôi (Pure White)', 1190000.00, 3, 'https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=800&auto=format&fit=crop&q=80'), -- LOW STOCK (3 <= 5)

-- Anker 737 PowerCore 24K 140W
(6, 3, 'ANK-737-140W', 'Xám Không Gian - 24.000mAh', 2790000.00, 22, 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&auto=format&fit=crop&q=80'),

-- Baseus Tungsten Gold 100W Cable
(7, 4, 'BAS-TG100-1M', 'Đen Mạ Kim - Dài 1.0 Mét', 149000.00, 80, 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=800&auto=format&fit=crop&q=80'),
(8, 4, 'BAS-TG100-2M', 'Đen Mạ Kim - Dài 2.0 Mét', 189000.00, 5, 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=800&auto=format&fit=crop&q=80'), -- LOW STOCK (5 <= 5)

-- AirPods Pro 2 USB-C
(9, 5, 'APP2-USBC-WHT', 'Trắng Apple Chuẩn MagSafe USB-C', 5690000.00, 30, 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop&q=80'),

-- JBL Charge 5
(10, 6, 'JBL-CHG5-BLK', 'Đen Cá Tính (Squad Black)', 3490000.00, 15, 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80'),
(11, 6, 'JBL-CHG5-BLU', 'Xanh Biển Sâu (Ocean Blue)', 3490000.00, 2, 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80'); -- LOW STOCK (2 <= 5)

-- 6. SEED ORDERS
INSERT INTO `orders` (`id`, `user_id`, `order_code`, `customer_name`, `customer_phone`, `shipping_address`, `payment_method`, `order_status`, `total_amount`, `note`, `created_at`) VALUES
(1, 3, 'ORD-20260901-8192', 'Lê Quang Anh', '0987654321', 'Số 789 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM', 'banking', 'completed', 8880000.00, 'Giao hàng giờ hành chính', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(2, 3, 'ORD-20260905-4421', 'Lê Quang Anh', '0987654321', 'Số 789 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM', 'cod', 'shipping', 1190000.00, 'Gọi trước khi giao 15 phút', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(3, NULL, 'ORD-20260910-1093', 'Trần Thị Bích', '0912334455', 'Số 12 Đường Hoàng Hoa Thám, Ba Đình, Hà Nội', 'cod', 'confirmed', 2790000.00, 'Khách vãng lai đặt mua qua web', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(4, NULL, 'ORD-20260911-9981', 'Phạm Minh Đức', '0977889900', 'Chung cư Sunrise City, Quận 7, TP.HCM', 'banking', 'pending', 5690000.00, 'Đã thanh toán chuyển khoản, chờ xác nhận', NOW());

-- 7. SEED ORDER ITEMS
INSERT INTO `order_items` (`id`, `order_id`, `variant_id`, `quantity`, `price`) VALUES
-- Đơn hàng 1 (completed): Sony XM5 Đen (7.69M) + Anker 735 Đen (1.19M) = 8.88M
(1, 1, 1, 1, 7690000.00),
(2, 1, 4, 1, 1190000.00),

-- Đơn hàng 2 (shipping): Anker 735 Đen (1.19M)
(3, 2, 4, 1, 1190000.00),

-- Đơn hàng 3 (confirmed): Anker 737 PowerBank 140W (2.79M)
(4, 3, 6, 1, 2790000.00),

-- Đơn hàng 4 (pending): AirPods Pro 2 USB-C (5.69M)
(5, 4, 9, 1, 5690000.00);

-- 8. SEED WARRANTIES (cho các sản phẩm trong đơn hàng completed)
-- Tra cứu bảo hành điện tử theo Serial Number hoặc Số điện thoại: 0987654321
INSERT INTO `warranties` (`id`, `order_item_id`, `serial_number`, `customer_phone`, `start_date`, `end_date`, `status`) VALUES
(1, 1, 'SN-SONY-XM5-98217', '0987654321', DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY), DATE_ADD(DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY), INTERVAL 12 MONTH), 'valid'),
(2, 2, 'SN-ANK-735-33418', '0987654321', DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY), DATE_ADD(DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY), INTERVAL 18 MONTH), 'valid');
