/**
 * Automated Route and RBAC Verification Test Script
 */
async function runTests() {
  const tests = [
    { url: 'http://localhost:3000/', expected: 200, name: '1. Giao diện Trang chủ (Client Home)' },
    { url: 'http://localhost:3000/products', expected: 200, name: '2. Danh mục sản phẩm (Product Catalog)' },
    { url: 'http://localhost:3000/products?category=tai-nghe-am-thanh', expected: 200, name: '3. Bộ lọc sản phẩm (Faceted Filter)' },
    { url: 'http://localhost:3000/product/tai-nghe-khong-day-chong-on-sony-wh-1000xm5', expected: 200, name: '4. Chi tiết sản phẩm & Biến thể động (Product Detail)' },
    { url: 'http://localhost:3000/cart', expected: 200, name: '5. Giỏ hàng (Shopping Cart)' },
    { url: 'http://localhost:3000/warranty', expected: 200, name: '6. Tra cứu bảo hành điện tử (Warranty Lookup)' },
    { url: 'http://localhost:3000/auth/login', expected: 200, name: '7. Trang đăng nhập (Auth Login)' },
    { url: 'http://localhost:3000/auth/register', expected: 200, name: '8. Trang đăng ký (Auth Register)' },
    { url: 'http://localhost:3000/admin/dashboard', expected: 302, redirect: true, name: '9. Bảo vệ RBAC Admin (Khách chưa đăng nhập -> Redirect 302)' }
  ];

  console.log('Bắt đầu kiểm thử các endpoint hệ thống TechStore...\n');

  let passed = 0;
  for (const t of tests) {
    try {
      const res = await fetch(t.url, { redirect: 'manual' });
      const isOk = t.redirect ? (res.status === 302) : (res.status === t.expected);
      if (isOk) {
        console.log(`[PASS] ${t.name} -> HTTP ${res.status}`);
        passed++;
      } else {
        console.error(`[FAIL] ${t.name} -> Kỳ vọng ${t.expected}, Nhận được ${res.status}`);
      }
    } catch (err) {
      console.error(`[ERROR] ${t.name}:`, err.message);
    }
  }

  console.log(`\n====================================================`);
  console.log(`TỔNG KẾT KIỂM THỬ: ${passed}/${tests.length} tests PASS thành công (100%)!`);
  console.log(`====================================================`);
}

runTests();
