const mysql = require('mysql2/promise');
require('dotenv').config();

// Tạo Connection Pool cho hiệu năng cao và quản lý kết nối tự động
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tech_store_db',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true
});

// Kiểm tra kết nối khi khởi động
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Đã kết nối thành công tới MySQL Database: ${process.env.DB_NAME || 'tech_store_db'}`);
    connection.release();
  } catch (error) {
    console.error('[Database] Lỗi kết nối Cơ sở dữ liệu MySQL:', error.message);
    console.error('[Database] Hãy đảm bảo máy chủ MySQL (XAMPP/MySQL Service) đang chạy và lệnh `npm run db:init` đã được thực thi.');
  }
}

testConnection();

module.exports = pool;
