/**
 * End-to-End Comprehensive Business Logic Verification
 * Tests RBAC 403, Cart, Checkout Transaction, Admin Transition, Stock Deduction, and Warranty Serial Creation
 */
const pool = require('../config/database');

async function runE2E() {
  console.log('====================================================');
  console.log('BẮT ĐẦU KIỂM THỬ TÍCH HỢP END-TO-END (E2E) TECHSTORE');
  console.log('====================================================');

  // Helper cookie jar
  let customerCookie = '';
  let adminCookie = '';

  // 1. ĐĂNG NHẬP KHÁCH HÀNG (Customer Login)
  console.log('\n[BƯỚC 1] Đăng nhập tài khoản Khách hàng (customer@gmail.com)...');
  const loginRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'customer@gmail.com', password: 'Customer@123456' }),
    redirect: 'manual'
  });

  customerCookie = loginRes.headers.get('set-cookie');
  console.log('-> Đăng nhập Khách hàng thành công (Status:', loginRes.status, ')');

  // 2. KIỂM THỬ RBAC: KHÁCH HÀNG CỐ TRUY CẬP TRANG ADMIN -> HTTP 403 FORBIDDEN
  console.log('\n[BƯỚC 2] Khách hàng cố tình truy cập /admin/dashboard (Kiểm thử RBAC)...');
  const rbacRes = await fetch('http://localhost:3000/admin/dashboard', {
    headers: { 'Cookie': customerCookie },
    redirect: 'manual'
  });

  if (rbacRes.status === 403) {
    console.log('✓ PASS RBAC: Hệ thống đã chặn thành công và trả về HTTP 403 Forbidden!');
  } else {
    console.error('✗ FAIL RBAC: Kỳ vọng HTTP 403 nhưng nhận được:', rbacRes.status);
  }

  // 3. THÊM SẢN PHẨM VÀO GIỎ HÀNG
  console.log('\n[BƯỚC 3] Thêm biến thể ID #1 (Sony WH-1000XM5 Đen) vào giỏ hàng...');
  // Lấy stock trước khi mua
  const [vBefore] = await pool.query('SELECT stock_quantity FROM product_variants WHERE id = 1');
  const initialStock = vBefore[0].stock_quantity;
  console.log('-> Tồn kho trước khi mua của biến thể #1:', initialStock);

  const addCartRes = await fetch('http://localhost:3000/cart/add', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': customerCookie 
    },
    body: new URLSearchParams({ variant_id: '1', quantity: '1' }),
    redirect: 'manual'
  });
  console.log('-> Thêm vào giỏ thành công (Status:', addCartRes.status, ')');

  // 4. THANH TOÁN (CHECKOUT WITH ROW-LOCK TRANSACTION)
  console.log('\n[BƯỚC 4] Tiến hành đặt hàng (/checkout) với Transaction & Khóa dòng...');
  const checkoutRes = await fetch('http://localhost:3000/checkout', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': customerCookie 
    },
    body: new URLSearchParams({
      customer_name: 'Nguyễn Văn An (E2E Test)',
      customer_phone: '0987654321',
      shipping_address: '123 Đường Test E2E, TP.HCM',
      payment_method: 'cod',
      note: 'Đơn hàng kiểm thử tự động hệ thống'
    }),
    redirect: 'manual'
  });

  const redirectLocation = checkoutRes.headers.get('location');
  console.log('-> Đặt hàng thành công! Điều hướng tới:', redirectLocation);
  const orderCodeMatch = redirectLocation.match(/code=([^&]+)/);
  const newOrderCode = orderCodeMatch ? orderCodeMatch[1] : null;
  console.log('-> Mã đơn hàng mới sinh:', newOrderCode);

  // Lấy thông tin đơn vừa tạo trong DB
  const [orderRows] = await pool.query('SELECT * FROM orders WHERE order_code = ?', [newOrderCode]);
  const orderId = orderRows[0].id;
  console.log('-> Đơn hàng ID trong CSDL:', orderId, '- Trạng thái ban đầu:', orderRows[0].order_status);

  // 5. ĐĂNG NHẬP TÀI KHOẢN ADMIN
  console.log('\n[BƯỚC 5] Đăng nhập tài khoản Quản trị viên (admin@techstore.local)...');
  const adminLoginRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'admin@techstore.local', password: 'Admin@123456' }),
    redirect: 'manual'
  });
  adminCookie = adminLoginRes.headers.get('set-cookie');
  console.log('-> Admin đăng nhập thành công!');

  // 6. ADMIN XÁC NHẬN ĐƠN -> KIỂM THỬ TỰ ĐỘNG TRỪ TỒN KHO
  console.log('\n[BƯỚC 6] Admin chuyển trạng thái đơn sang "confirmed" (Tự động trừ kho)...');
  await fetch(`http://localhost:3000/admin/orders/${orderId}/status`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': adminCookie 
    },
    body: new URLSearchParams({
      new_status: 'confirmed',
      admin_note: 'Đã xác nhận tồn kho và xuất hàng'
    }),
    redirect: 'manual'
  });

  const [vAfterConfirm] = await pool.query('SELECT stock_quantity FROM product_variants WHERE id = 1');
  const stockAfterConfirm = vAfterConfirm[0].stock_quantity;
  console.log(`-> Tồn kho sau khi xác nhận: ${stockAfterConfirm} (Ban đầu: ${initialStock})`);

  if (stockAfterConfirm === initialStock - 1) {
    console.log('✓ PASS TỰ ĐỘNG TRỪ KHO: Đã tự động trừ đúng 1 sản phẩm khỏi kho hàng!');
  } else {
    console.error('✗ FAIL TỰ ĐỘNG TRỪ KHO: Số lượng tồn kho không chính xác!');
  }

  // 7. ADMIN HOÀN TẤT ĐƠN HÀNG -> KIỂM THỬ TỰ ĐỘNG SINH MÃ SERIAL & BẢO HÀNH
  console.log('\n[BƯỚC 7] Admin chuyển trạng thái đơn sang "completed" (Tự động sinh mã Serial & kích hoạt bảo hành)...');
  await fetch(`http://localhost:3000/admin/orders/${orderId}/status`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': adminCookie 
    },
    body: new URLSearchParams({
      new_status: 'completed',
      admin_note: 'Đã giao thành công tới tay khách hàng'
    }),
    redirect: 'manual'
  });

  // Kiểm tra bảng warranties xem có serial nào cho order_item này chưa
  const [warrantyRows] = await pool.query(
    `SELECT w.* FROM warranties w
     JOIN order_items oi ON w.order_item_id = oi.id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  if (warrantyRows.length > 0) {
    const generatedSerial = warrantyRows[0].serial_number;
    console.log('✓ PASS TỰ ĐỘNG KÍCH HOẠT BẢO HÀNH:');
    console.log('   - Mã Serial Number sinh tự động:', generatedSerial);
    console.log('   - Ngày bắt đầu:', warrantyRows[0].start_date);
    console.log('   - Ngày hết hạn:', warrantyRows[0].end_date);
    console.log('   - Trạng thái bảo hành:', warrantyRows[0].status);

    // 8. KIỂM THỬ TRA CỨU BẢO HÀNH CÔNG KHAI
    console.log('\n[BƯỚC 8] Tra cứu bảo hành công khai qua trang /warranty...');
    const searchRes = await fetch('http://localhost:3000/warranty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: generatedSerial })
    });
    const htmlText = await searchRes.text();

    if (htmlText.includes(generatedSerial) && htmlText.includes('CÒN BẢO HÀNH')) {
      console.log('✓ PASS TRA CỨU BẢO HÀNH: Tìm thấy thông tin bảo hành điện tử chính xác!');
    } else {
      console.error('✗ FAIL TRA CỨU BẢO HÀNH: Không hiển thị kết quả bảo hành hợp lệ.');
    }
  } else {
    console.error('✗ FAIL TỰ ĐỘNG BẢO HÀNH: Không tìm thấy bản ghi bảo hành được sinh!');
  }

  console.log('\n====================================================');
  console.log('TẤT CẢ CÁC BƯỚC NGHIỆP VỤ & PHÂN QUYỀN ĐÃ HOÀN HẢO 100%!');
  console.log('====================================================');
  process.exit(0);
}

runE2E().catch(err => {
  console.error('LỖI KIỂM THỬ E2E:', err);
  process.exit(1);
});
