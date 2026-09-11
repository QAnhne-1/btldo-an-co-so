/**
 * Database Initialization and Seeding Script
 * Run with: npm run db:init
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function initializeDatabase() {
  console.log('====================================================');
  console.log('Khởi tạo và cài đặt Cơ sở dữ liệu TechStore MySQL...');
  console.log('====================================================');

  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  };

  let connection;
  try {
    console.log(`Đang kết nối tới máy chủ MySQL tại ${dbConfig.host}:${dbConfig.port}...`);
    connection = await mysql.createConnection(dbConfig);
    console.log('-> Kết nối máy chủ MySQL thành công!');

    const sqlFilePath = path.join(__dirname, 'schema_and_seed.sql');
    console.log(`Đang đọc tệp tin SQL tại: ${sqlFilePath}`);
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Đang thực thi các lệnh tạo bảng và nạp dữ liệu mẫu...');
    await connection.query(sqlContent);

    console.log('-> Đã tạo database `tech_store_db` và 8 bảng thành công:');
    console.log('   - users, categories, brands, products, product_variants, orders, order_items, warranties');
    console.log('-> Đã nạp dữ liệu mẫu (Sản phẩm, Biến thể, Đơn hàng, Bảo hành điện tử).');
    console.log('====================================================');
    console.log('TÀI KHOẢN MẪU ĐỂ ĐĂNG NHẬP VÀ KIỂM THỬ:');
    console.log('1. Admin:    admin@techstore.local  | Mật khẩu: Admin@123456');
    console.log('2. Staff:    staff@techstore.local  | Mật khẩu: Staff@123456');
    console.log('3. Customer: customer@gmail.com     | Mật khẩu: Customer@123456');
    console.log('====================================================');
    console.log('Khởi tạo cơ sở dữ liệu hoàn tất 100%!');
  } catch (error) {
    console.error('LỖI KHỞI TẠO CƠ SỞ DỮ LIỆU:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initializeDatabase();
