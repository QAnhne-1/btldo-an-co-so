/**
 * Main Server Application Entry Point
 * QZStore - E-Commerce Monolith Application
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const mysql = require('mysql2/promise');

// Session Store: Lưu trữ phiên làm việc vào MySQL thay vì RAM
const MySQLStore = require('express-mysql-session')(session);

// Middlewares
const { isAuthenticated, checkRole, injectLocals } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Cấu hình Body Parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 2. Cấu hình File tĩnh (Static Assets: CSS, JS, Images)
app.use(express.static(path.join(__dirname, 'public')));

// 3. Cấu hình MySQL Session Store (Persistent Sessions)
// Session sẽ được lưu vào bảng `sessions` trong MySQL, giữ nguyên giỏ hàng
// và trạng thái đăng nhập ngay cả khi server khởi động lại.
const sessionStoreOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'qz_store_db',
  charset: 'utf8mb4',
  clearExpired: true,              // Tự động xóa session hết hạn
  checkExpirationInterval: 900000, // Kiểm tra mỗi 15 phút (ms)
  expiration: 1000 * 60 * 60 * 24 * 7, // Session tồn tại 7 ngày
  createDatabaseTable: true,       // Tự động tạo bảng `sessions` nếu chưa có
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
};

const sessionStore = new MySQLStore(sessionStoreOptions);

app.use(
  session({
    key: 'qzstore_session_id',
    secret: process.env.SESSION_SECRET || 'techstore_monolith_secret_key_default',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 ngày
      sameSite: 'lax'
    }
  })
);

// 4. Cấu hình Template Engine EJS & express-ejs-layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/client_layout'); // Layout mặc định
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// 5. Nạp Global Variables & Helpers cho toàn bộ Views
app.use(injectLocals);

// 6. Đăng ký Routes
// A. Tuyến đường xác thực (Login, Register, Logout)
app.use('/auth', authRoutes);

// B. Tuyến đường Quản trị viên & Nhân viên (Admin Dashboard - RBAC Bảo vệ nghiêm ngặt)
app.use('/admin', isAuthenticated, checkRole(['admin', 'staff']), adminRoutes);

// C. Tuyến đường Cửa hàng Người dùng (Storefront)
app.use('/', clientRoutes);

// 7. Xử lý lỗi 404 (Not Found)
app.use((req, res) => {
  res.status(404).render('error', {
    layout: 'layouts/client_layout',
    title: '404 - Không tìm thấy trang',
    statusCode: 404,
    message: 'Trang hoặc tài nguyên bạn yêu cầu không tồn tại trên hệ thống QZStore.',
    details: `Đường dẫn yêu cầu: ${req.originalUrl}`
  });
});

// 8. Xử lý lỗi 500 (Internal Server Error)
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err.stack);
  res.status(500).render('error', {
    layout: 'layouts/client_layout',
    title: '500 - Lỗi hệ thống nội bộ',
    statusCode: 500,
    message: 'Đã có sự cố xảy ra trên máy chủ. Đội ngũ kỹ thuật đang khắc phục.',
    details: process.env.NODE_ENV === 'development' ? err.message : null
  });
});

// 9. Khởi chạy Server
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 QZStore Web Application đang chạy tại: http://localhost:${PORT}`);
  console.log(`🛒 Giao diện Cửa hàng (Client Storefront): http://localhost:${PORT}/`);
  console.log(`🛡️ Giao diện Quản trị (Admin Dashboard):   http://localhost:${PORT}/admin/dashboard`);
  console.log(`🔍 Tra cứu bảo hành điện tử:              http://localhost:${PORT}/warranty`);
  console.log(`💾 Session Store: MySQL Persistent (Bảng: sessions)`);
  console.log('====================================================');
});
