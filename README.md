# ⚡ TechStore - Nền Tảng Thương Mại Điện Tử Phụ Kiện Điện Tử Đa Giao Diện

> Ứng dụng thương mại điện tử chuyên nghiệp bán phụ kiện công nghệ (tai nghe chống ồn, củ sạc GaN, cáp sạc bọc dù, pin sạc dự phòng, loa Bluetooth) với **2 giao diện độc lập (Client Storefront & Admin Dashboard)**, kiến trúc Monolith Express.js + EJS SSR, cơ sở dữ liệu MySQL 8.0+ và kiểm soát phân quyền RBAC nghiêm ngặt.

---

## 🌟 Điểm Nổi Bật Của Hệ Thống

### 1. Hai Giao Diện Độc Lập Hoàn Toàn
- **Giao diện Khách hàng (Storefront - `client_layout.ejs`)**:
  - Chủ đề Indigo & Amber hiện đại, Sticky Navbar Glassmorphism, giỏ hàng đếm thời gian thực.
  - Trang chủ (`/`), Lọc đa tiêu chí Faceted (`/products`), Chi tiết sản phẩm & Chọn biến thể động (`/product/:slug`).
  - Giỏ hàng (`/cart`), Đặt hàng (`/checkout`), Hoàn tất đơn (`/order-success`).
  - **Tra cứu bảo hành điện tử công khai (`/warranty`)**: Nhập Serial Number hoặc Số điện thoại để kiểm tra thời hạn và số ngày bảo hành còn lại.
- **Giao diện Quản trị viên & Nhân viên (Admin Dashboard - `admin_layout.ejs`)**:
  - Giao diện SaaS Dark Slate Sidebar chuyên nghiệp. **Tuyệt đối bảo mật, chặn truy cập từ khách hàng (HTTP 403 Forbidden)**.
  - Bảng điều khiển tổng quan: Thẻ doanh thu, tổng đơn hàng, cảnh báo tồn kho thấp (≤ 5 chiếc), 10 đơn hàng gần nhất.
  - Quản lý sản phẩm & thêm động không giới hạn biến thể (SKU, giá, tồn kho, ảnh).
  - Xử lý đơn hàng đa trạng thái kèm **tự động hóa vòng đời nghiệp vụ**.
  - Quản lý danh sách Serial Number và bảo hành điện tử chính hãng.

### 2. Nghiệp Vụ Backend & CSDL Nâng Cao
- **Transaction Checkout & Khóa Dòng (`FOR UPDATE`)**: Khi khách hàng đặt hàng, hệ thống mở giao dịch cơ sở dữ liệu, khóa dòng kiểm tra số lượng tồn kho thực tế, chống bán vượt tồn kho (overselling) và rollback an toàn nếu xảy ra lỗi.
- **Tự động hóa vòng đời đơn hàng (Order Lifecycle Automations)**:
  - Khi Admin duyệt đơn sang `confirmed`: Hệ thống tự động trừ số lượng tồn kho tương ứng.
  - Khi Admin hủy đơn `cancelled`: Hệ thống tự động hoàn lại số lượng tồn kho.
  - Khi Admin duyệt sang `completed`: Hệ thống tự động sinh mã Serial Number duy nhất (`SN-TECH-XXXXXX`) và kích hoạt bảo hành điện tử chính hãng với thời hạn dựa trên cấu hình sản phẩm (`warranty_months`).

---

## 🛠️ Công Nghệ Sử Dụng

- **Backend**: Node.js, Express.js (Monolith Architecture)
- **Template Engine**: EJS, `express-ejs-layouts` (Server-Side Rendering)
- **Styling & UI**: Tailwind CSS (CDN), FontAwesome 6, Google Fonts Plus Jakarta Sans
- **Database**: MySQL 8.0+ / MariaDB (`mysql2/promise` Connection Pool)
- **Bảo mật**: `bcryptjs` (mã hóa mật khẩu), `express-session`, Middleware RBAC (`admin`, `staff`, `customer`)

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 1. Yêu Cầu Môi Trường
- Đã cài đặt **Node.js** (Khuyên dùng v18+ hoặc v20+)
- Đã cài đặt **MySQL Server** hoặc **XAMPP** (chạy MySQL cổng 3306)

### 2. Cài Đặt Thư Viện
```bash
npm install
```

### 3. Cấu Hình Biến Môi Trường (.env)
Tạo file `.env` tại thư mục gốc (hoặc sao chép từ `.env.example`):
```env
PORT=3000
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=tech_store_db

SESSION_SECRET=techstore_super_secure_secret_key_2026_!@#$%
```

### 4. Khởi Tạo Cơ Sở Dữ Liệu & Dữ Liệu Mẫu
Chạy script tự động tạo database `tech_store_db`, 8 bảng quan hệ và nạp dữ liệu sản phẩm, biến thể, tài khoản mẫu:
```bash
npm run db:init
```

### 5. Khởi Chạy Ứng Dụng
```bash
# Khởi chạy server thông thường
npm start

# Hoặc chế độ lập trình tự động tải lại
npm run dev
```

Truy cập ứng dụng:
- **Cửa hàng (Client Storefront)**: [http://localhost:3000/](http://localhost:3000/)
- **Quản trị (Admin Dashboard)**: [http://localhost:3000/admin/dashboard](http://localhost:3000/admin/dashboard)
- **Tra cứu bảo hành điện tử**: [http://localhost:3000/warranty](http://localhost:3000/warranty)

---

## 👥 Tài Khoản Mẫu Để Kiểm Thử

| Vai trò | Email đăng nhập | Mật khẩu | Quyền hạn |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@techstore.local` | `Admin@123456` | Toàn quyền Storefront & Admin Dashboard |
| **Staff** | `staff@techstore.local` | `Staff@123456` | Quản lý sản phẩm, đơn hàng |
| **Customer** | `customer@gmail.com` | `Customer@123456` | Mua hàng (Bị chặn 403 khi vào Admin) |

---

## 📂 Cấu Trúc Thư Mục Dự Án

```
├── config/             # Cấu hình kết nối MySQL Pool
├── middleware/         # Middleware xác thực & phân quyền RBAC
├── routes/             # Route handlers: Auth, Client Storefront, Admin
├── scripts/            # Script khởi tạo DB & kiểm thử tự động
├── views/              # EJS Views & Layouts tách biệt (Client & Admin)
│   ├── layouts/        # client_layout.ejs & admin_layout.ejs
│   ├── client/         # Các trang dành cho người dùng mua sắm
│   ├── admin/          # Các trang quản trị hệ thống
│   ├── auth/           # Giao diện Đăng nhập & Đăng ký
│   └── partials/       # Flash alert messages & components
├── public/             # File tĩnh: CSS, JavaScript, Images
├── .env                # Biến môi trường
├── package.json        # Định nghĩa dependencies & scripts
└── server.js           # Điểm khởi chạy ứng dụng Express
```

---

## 📄 Bản Quyền & Giấy Phép
Dự án được xây dựng phục vụ mục đích học tập, đồ án tốt nghiệp và phát triển thương mại điện tử chuyên nghiệp.
Giấy phép: **ISC License**.
