const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Layout mặc định cho Client Storefront
const CLIENT_LAYOUT = 'layouts/client_layout';

// Helper lấy danh mục cho header menu
async function getHeaderCategories() {
  const [categories] = await pool.query(
    `SELECT c.*, COUNT(p.id) as product_count 
     FROM categories c 
     LEFT JOIN products p ON c.id = p.category_id 
     GROUP BY c.id 
     ORDER BY c.name ASC`
  );
  return categories;
}

// 1. TRANG CHỦ (Home Page)
router.get('/', async (req, res) => {
  try {
    const categories = await getHeaderCategories();

    // Lấy 8 sản phẩm mới nhất kèm khoảng giá của các biến thể
    const [latestProducts] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.thumbnail, p.warranty_months,
              c.name as category_name, c.slug as category_slug,
              b.name as brand_name,
              MIN(pv.price) as min_price,
              MAX(pv.price) as max_price,
              SUM(pv.stock_quantity) as total_stock
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN brands b ON p.brand_id = b.id
       LEFT JOIN product_variants pv ON p.id = pv.product_id
       GROUP BY p.id
       ORDER BY p.id DESC
       LIMIT 8`
    );

    // Lấy các thương hiệu nổi bật
    const [brands] = await pool.query('SELECT * FROM brands ORDER BY name ASC');

    res.render('client/home', {
      layout: CLIENT_LAYOUT,
      title: 'QZStore - Phụ Kiện Điện Tử & Âm Thanh Chính Hãng',
      categories,
      latestProducts,
      brands
    });
  } catch (error) {
    console.error('Lỗi tải trang chủ:', error);
    res.status(500).render('error', {
      layout: CLIENT_LAYOUT,
      title: '500 - Lỗi máy chủ nội bộ',
      statusCode: 500,
      message: 'Không thể tải dữ liệu trang chủ lúc này. Vui lòng thử lại sau.'
    });
  }
});

// 2. DANH SÁCH SẢN PHẨM & BỘ LỌC (Product Listing & Faceted Filter)
router.get('/products', async (req, res) => {
  try {
    const { category, brand, min_price, max_price, q, sort } = req.query;

    const categories = await getHeaderCategories();
    const [brands] = await pool.query('SELECT * FROM brands ORDER BY name ASC');

    let whereClauses = ['1=1'];
    let queryParams = [];

    if (category) {
      whereClauses.push('c.slug = ?');
      queryParams.push(category);
    }

    if (brand) {
      whereClauses.push('b.slug = ?');
      queryParams.push(brand);
    }

    if (q) {
      whereClauses.push('(p.name LIKE ? OR p.description LIKE ?)');
      queryParams.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    let havingClauses = [];
    if (min_price && !isNaN(min_price)) {
      havingClauses.push('MIN(pv.price) >= ?');
      queryParams.push(Number(min_price));
    }
    if (max_price && !isNaN(max_price)) {
      havingClauses.push('MIN(pv.price) <= ?');
      queryParams.push(Number(max_price));
    }

    let orderBy = 'p.id DESC';
    if (sort === 'price_asc') {
      orderBy = 'min_price ASC';
    } else if (sort === 'price_desc') {
      orderBy = 'min_price DESC';
    } else if (sort === 'name') {
      orderBy = 'p.name ASC';
    }

    let sql = `
      SELECT p.id, p.name, p.slug, p.thumbnail, p.warranty_months,
             c.name as category_name, c.slug as category_slug,
             b.name as brand_name, b.slug as brand_slug,
             MIN(pv.price) as min_price,
             MAX(pv.price) as max_price,
             SUM(pv.stock_quantity) as total_stock
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN brands b ON p.brand_id = b.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY p.id
    `;

    if (havingClauses.length > 0) {
      sql += ` HAVING ${havingClauses.join(' AND ')}`;
    }

    sql += ` ORDER BY ${orderBy}`;

    const [products] = await pool.query(sql, queryParams);

    res.render('client/products', {
      layout: CLIENT_LAYOUT,
      title: 'Tất cả sản phẩm phụ kiện - QZStore',
      categories,
      brands,
      products,
      filters: { category, brand, min_price, max_price, q, sort },
      totalResults: products.length
    });
  } catch (error) {
    console.error('Lỗi tải danh sách sản phẩm:', error);
    res.status(500).render('error', {
      layout: CLIENT_LAYOUT,
      title: '500 - Lỗi máy chủ nội bộ',
      statusCode: 500,
      message: 'Không thể lọc danh sách sản phẩm lúc này.'
    });
  }
});

// 3. CHI TIẾT SẢN PHẨM & CHỌN BIẾN THỂ ĐỘNG (Product Detail Page)
router.get('/product/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Lấy thông tin sản phẩm
    const [products] = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug,
              b.name as brand_name, b.slug as brand_slug
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN brands b ON p.brand_id = b.id
       WHERE p.slug = ?
       LIMIT 1`,
      [slug]
    );

    if (products.length === 0) {
      return res.status(404).render('error', {
        layout: CLIENT_LAYOUT,
        title: '404 - Không tìm thấy sản phẩm',
        statusCode: 404,
        message: 'Sản phẩm bạn đang tìm kiếm không tồn tại hoặc đã ngừng kinh doanh.'
      });
    }

    const product = products[0];

    // Parse JSON thông số kỹ thuật an toàn
    let specifications = {};
    if (product.specifications) {
      if (typeof product.specifications === 'string') {
        try {
          specifications = JSON.parse(product.specifications);
        } catch (e) {
          specifications = {};
        }
      } else {
        specifications = product.specifications;
      }
    }

    // Lấy danh sách các biến thể của sản phẩm
    const [variants] = await pool.query(
      `SELECT id, product_id, sku, variant_name, price, stock_quantity, image
       FROM product_variants
       WHERE product_id = ?
       ORDER BY price ASC`,
      [product.id]
    );

    // Lấy các sản phẩm liên quan cùng danh mục
    const [relatedProducts] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.thumbnail,
              MIN(pv.price) as min_price,
              MAX(pv.price) as max_price
       FROM products p
       LEFT JOIN product_variants pv ON p.id = pv.product_id
       WHERE p.category_id = ? AND p.id != ?
       GROUP BY p.id
       LIMIT 4`,
      [product.category_id, product.id]
    );

    res.render('client/product_detail', {
      layout: CLIENT_LAYOUT,
      title: `${product.name} - QZStore`,
      product,
      specifications,
      variants,
      relatedProducts
    });
  } catch (error) {
    console.error('Lỗi chi tiết sản phẩm:', error);
    res.status(500).render('error', {
      layout: CLIENT_LAYOUT,
      title: '500 - Lỗi máy chủ',
      statusCode: 500,
      message: 'Không thể tải chi tiết sản phẩm.'
    });
  }
});

// 4. QUẢN LÝ GIỎ HÀNG (Shopping Cart)

// Xem giỏ hàng
router.get('/cart', async (req, res) => {
  try {
    const sessionCart = req.session.cart || [];
    let cartItems = [];
    let subtotal = 0;

    if (sessionCart.length > 0) {
      const variantIds = sessionCart.map(item => item.variant_id);
      const [variants] = await pool.query(
        `SELECT pv.id as variant_id, pv.sku, pv.variant_name, pv.price, pv.stock_quantity,
                COALESCE(pv.image, p.thumbnail) as image,
                p.id as product_id, p.name as product_name, p.slug as product_slug,
                p.warranty_months
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         WHERE pv.id IN (?)`,
        [variantIds]
      );

      // Kết hợp dữ liệu database mới nhất với số lượng trong session
      cartItems = sessionCart.map(sItem => {
        const dbVariant = variants.find(v => v.variant_id === parseInt(sItem.variant_id, 10));
        if (!dbVariant) return null;

        const quantity = Math.min(parseInt(sItem.quantity, 10) || 1, dbVariant.stock_quantity);
        const itemTotal = quantity * Number(dbVariant.price);
        subtotal += itemTotal;

        return {
          ...dbVariant,
          quantity,
          itemTotal
        };
      }).filter(Boolean);
    }

    const shippingFee = subtotal > 500000 || subtotal === 0 ? 0 : 30000;
    const finalTotal = subtotal + shippingFee;

    res.render('client/cart', {
      layout: CLIENT_LAYOUT,
      title: 'Giỏ hàng của bạn - QZStore',
      cartItems,
      subtotal,
      shippingFee,
      finalTotal
    });
  } catch (error) {
    console.error('Lỗi xem giỏ hàng:', error);
    res.status(500).render('error', {
      layout: CLIENT_LAYOUT,
      title: '500 - Lỗi giỏ hàng',
      statusCode: 500,
      message: 'Không thể xem giỏ hàng lúc này.'
    });
  }
});

// Thêm vào giỏ hàng
router.post('/cart/add', async (req, res) => {
  try {
    const { variant_id, quantity = 1 } = req.body;
    const qty = parseInt(quantity, 10) || 1;

    // Kiểm tra biến thể và tồn kho
    const [rows] = await pool.query(
      `SELECT pv.id, pv.stock_quantity, pv.variant_name, p.name as product_name 
       FROM product_variants pv 
       JOIN products p ON pv.product_id = p.id 
       WHERE pv.id = ?`,
      [variant_id]
    );

    if (rows.length === 0) {
      req.session.flashError = 'Phiên bản sản phẩm không tồn tại.';
      return res.redirect('back');
    }

    const variant = rows[0];

    if (variant.stock_quantity < 1) {
      req.session.flashError = `Rất tiếc, phiên bản "${variant.variant_name}" hiện đã hết hàng.`;
      return res.redirect('back');
    }

    if (!req.session.cart) {
      req.session.cart = [];
    }

    const existingIndex = req.session.cart.findIndex(i => i.variant_id == variant_id);

    if (existingIndex > -1) {
      const newQty = req.session.cart[existingIndex].quantity + qty;
      if (newQty > variant.stock_quantity) {
        req.session.cart[existingIndex].quantity = variant.stock_quantity;
        req.session.flashError = `Kho chỉ còn ${variant.stock_quantity} sản phẩm. Đã cập nhật số lượng tối đa trong giỏ hàng.`;
      } else {
        req.session.cart[existingIndex].quantity = newQty;
        req.session.flashSuccess = `Đã cập nhật giỏ hàng: ${variant.product_name} (${variant.variant_name}).`;
      }
    } else {
      const finalQty = Math.min(qty, variant.stock_quantity);
      req.session.cart.push({
        variant_id: parseInt(variant_id, 10),
        quantity: finalQty
      });
      req.session.flashSuccess = `Đã thêm vào giỏ hàng: ${variant.product_name} (${variant.variant_name}).`;
    }

    return res.redirect('/cart');
  } catch (error) {
    console.error('Lỗi thêm giỏ hàng:', error);
    req.session.flashError = 'Không thể thêm sản phẩm vào giỏ hàng.';
    return res.redirect('back');
  }
});

// Cập nhật số lượng trong giỏ hàng
router.post('/cart/update', (req, res) => {
  const { variant_id, quantity } = req.body;
  const newQty = parseInt(quantity, 10);

  if (!req.session.cart) req.session.cart = [];

  const index = req.session.cart.findIndex(i => i.variant_id == variant_id);
  if (index > -1) {
    if (newQty <= 0) {
      req.session.cart.splice(index, 1);
      req.session.flashSuccess = 'Đã xóa sản phẩm khỏi giỏ hàng.';
    } else {
      req.session.cart[index].quantity = newQty;
      req.session.flashSuccess = 'Đã cập nhật số lượng.';
    }
  }

  res.redirect('/cart');
});

// Xóa 1 sản phẩm khỏi giỏ hàng
router.post('/cart/remove', (req, res) => {
  const { variant_id } = req.body;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(i => i.variant_id != variant_id);
    req.session.flashSuccess = 'Đã xóa sản phẩm khỏi giỏ hàng.';
  }
  res.redirect('/cart');
});

// 5. TRANG THANH TOÁN & TRANSACTION CHECKOUT (Checkout Page & DB Transaction)

// GET: Giao diện thanh toán
router.get('/checkout', async (req, res) => {
  try {
    const sessionCart = req.session.cart || [];
    if (sessionCart.length === 0) {
      req.session.flashError = 'Giỏ hàng của bạn đang trống. Vui lòng chọn sản phẩm trước khi thanh toán.';
      return res.redirect('/products');
    }

    const variantIds = sessionCart.map(item => item.variant_id);
    const [variants] = await pool.query(
      `SELECT pv.id as variant_id, pv.sku, pv.variant_name, pv.price, pv.stock_quantity,
              COALESCE(pv.image, p.thumbnail) as image,
              p.name as product_name
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       WHERE pv.id IN (?)`,
      [variantIds]
    );

    let subtotal = 0;
    const checkoutItems = sessionCart.map(sItem => {
      const v = variants.find(item => item.variant_id === parseInt(sItem.variant_id, 10));
      if (!v) return null;
      const quantity = parseInt(sItem.quantity, 10) || 1;
      const lineTotal = quantity * Number(v.price);
      subtotal += lineTotal;
      return {
        ...v,
        quantity,
        lineTotal
      };
    }).filter(Boolean);

    const shippingFee = subtotal > 500000 ? 0 : 30000;
    const finalTotal = subtotal + shippingFee;

    res.render('client/checkout', {
      layout: CLIENT_LAYOUT,
      title: 'Thanh toán đơn hàng - QZStore',
      checkoutItems,
      subtotal,
      shippingFee,
      finalTotal,
      user: req.session.user || null
    });
  } catch (error) {
    console.error('Lỗi tải trang thanh toán:', error);
    res.status(500).render('error', {
      layout: CLIENT_LAYOUT,
      title: '500 - Lỗi thanh toán',
      statusCode: 500,
      message: 'Không thể mở trang thanh toán.'
    });
  }
});

// POST: Xử lý đặt hàng với DATABASE TRANSACTION & ROW LOCK (FOR UPDATE)
router.post('/checkout', async (req, res) => {
  const { customer_name, customer_phone, shipping_address, payment_method, note } = req.body;
  const sessionCart = req.session.cart || [];

  if (sessionCart.length === 0) {
    req.session.flashError = 'Giỏ hàng của bạn đang trống!';
    return res.redirect('/cart');
  }

  if (!customer_name || !customer_phone || !shipping_address) {
    req.session.flashError = 'Vui lòng cung cấp đầy đủ thông tin nhận hàng (Họ tên, SĐT, Địa chỉ).';
    return res.redirect('/checkout');
  }

  // Kết nối Pool Connection riêng biệt để thực thi Transaction
  const conn = await pool.getConnection();

  try {
    // 1. BẮT ĐẦU TRANSACTION
    await conn.beginTransaction();

    let totalAmount = 0;
    const validatedItems = [];

    // 2. KHÓA TỪNG HÀNG (ROW-LOCK) BẰNG SELECT ... FOR UPDATE & KIỂM TRA TỒN KHO
    for (const item of sessionCart) {
      const [rows] = await conn.query(
        `SELECT pv.id, pv.price, pv.stock_quantity, pv.variant_name, p.name as product_name
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         WHERE pv.id = ? 
         FOR UPDATE`,
        [item.variant_id]
      );

      if (rows.length === 0) {
        throw new Error(`Sản phẩm với mã biến thể #${item.variant_id} không còn tồn tại.`);
      }

      const variant = rows[0];
      const requestedQty = parseInt(item.quantity, 10);

      // Kiểm tra lượng tồn kho thời gian thực
      if (variant.stock_quantity < requestedQty) {
        throw new Error(
          `Sản phẩm "${variant.product_name} - ${variant.variant_name}" trong kho chỉ còn ${variant.stock_quantity} cái (bạn đặt ${requestedQty} cái). Không đủ tồn kho để đáp ứng.`
        );
      }

      const itemPrice = Number(variant.price);
      totalAmount += itemPrice * requestedQty;

      validatedItems.push({
        variant_id: variant.id,
        quantity: requestedQty,
        price: itemPrice
      });
    }

    // Tính phí vận chuyển (miễn phí nếu > 500,000 VND)
    const shippingFee = totalAmount > 500000 ? 0 : 30000;
    const finalOrderTotal = totalAmount + shippingFee;

    // Sinh mã đơn hàng ngẫu nhiên duy nhất: ORD-YYYYMMDD-XXXX
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCode = `ORD-${datePart}-${randomSuffix}`;

    const userId = req.session.user ? req.session.user.id : null;
    const validPaymentMethod = ['cod', 'banking'].includes(payment_method) ? payment_method : 'cod';

    // 3. TẠO ĐƠN HÀNG MỚI TRONG BẢNG `orders`
    const [orderResult] = await conn.query(
      `INSERT INTO orders 
        (user_id, order_code, customer_name, customer_phone, shipping_address, payment_method, order_status, total_amount, note)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        userId,
        orderCode,
        customer_name.trim(),
        customer_phone.trim(),
        shipping_address.trim(),
        validPaymentMethod,
        finalOrderTotal,
        note ? note.trim() : null
      ]
    );

    const orderId = orderResult.insertId;

    // 4. CHÈN TỪNG MẶT HÀNG VÀO BẢNG `order_items`
    for (const vItem of validatedItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, variant_id, quantity, price)
         VALUES (?, ?, ?, ?)`,
        [orderId, vItem.variant_id, vItem.quantity, vItem.price]
      );
    }

    // 5. COMMIT TRANSACTION KHI MỌI THAO TÁC HỢP LỆ VÀ AN TOÀN
    await conn.commit();

    // Xóa giỏ hàng trong session
    req.session.cart = [];

    // Chuyển hướng đến trang thông báo thành công
    return res.redirect(`/order-success?code=${orderCode}`);
  } catch (err) {
    // 6. ROLLBACK TRANSACTION KHI CÓ LỖI HOẶC HẾT TỒN KHO
    await conn.rollback();
    console.error('LỖI TRANSACTION CHECKOUT - ROLLBACK THÀNH CÔNG:', err.message);

    req.session.flashError = err.message || 'Giao dịch đặt hàng thất bại do xung đột dữ liệu. Vui lòng kiểm tra lại giỏ hàng.';
    return res.redirect('/checkout');
  } finally {
    // Luôn giải phóng kết nối về Pool
    conn.release();
  }
});

// 6. TRANG ĐẶT HÀNG THÀNH CÔNG (Order Success Page)
router.get('/order-success', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect('/');
    }

    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE order_code = ? LIMIT 1`,
      [code]
    );

    if (orders.length === 0) {
      return res.redirect('/');
    }

    const order = orders[0];

    // Lấy chi tiết các mặt hàng
    const [items] = await pool.query(
      `SELECT oi.*, pv.variant_name, pv.sku, p.name as product_name,
              COALESCE(pv.image, p.thumbnail) as image
       FROM order_items oi
       JOIN product_variants pv ON oi.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    res.render('client/order_success', {
      layout: CLIENT_LAYOUT,
      title: 'Đặt hàng thành công - QZStore',
      order,
      items
    });
  } catch (error) {
    console.error('Lỗi trang hoàn tất đơn:', error);
    res.redirect('/');
  }
});

// 7. TRA CỨU BẢO HÀNH ĐIỆN TỬ (Electronic Warranty Lookup)
router.get('/warranty', (req, res) => {
  res.render('client/warranty', {
    layout: CLIENT_LAYOUT,
    title: 'Tra cứu bảo hành điện tử chính hãng - QZStore',
    queryValue: '',
    warranties: null,
    searched: false
  });
});

router.post('/warranty', async (req, res) => {
  const { query } = req.body;

  try {
    if (!query || !query.trim()) {
      req.session.flashError = 'Vui lòng nhập Mã Serial sản phẩm hoặc Số điện thoại mua hàng.';
      return res.redirect('/warranty');
    }

    const cleanQuery = query.trim();

    // Tìm theo Serial Number hoặc SĐT khách hàng
    const [warranties] = await pool.query(
      `SELECT w.*, 
              p.name as product_name, p.thumbnail, p.warranty_months,
              pv.variant_name, pv.sku,
              o.order_code, o.customer_name, o.created_at as order_date
       FROM warranties w
       JOIN order_items oi ON w.order_item_id = oi.id
       JOIN product_variants pv ON oi.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE w.serial_number = ? OR w.customer_phone = ?
       ORDER BY w.id DESC`,
      [cleanQuery, cleanQuery]
    );

    // Tính số ngày bảo hành còn lại
    const formattedWarranties = warranties.map(w => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(w.end_date);
      endDate.setHours(0, 0, 0, 0);

      const diffTime = endDate.getTime() - today.getTime();
      const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Che mờ một phần tên và SĐT để bảo mật thông tin khách hàng
      let maskedName = w.customer_name;
      if (maskedName.length > 4) {
        const parts = maskedName.split(' ');
        maskedName = parts.map(p => p[0] + '***').join(' ');
      }

      let maskedPhone = w.customer_phone;
      if (maskedPhone.length >= 7) {
        maskedPhone = maskedPhone.slice(0, 3) + '****' + maskedPhone.slice(-3);
      }

      return {
        ...w,
        remainingDays,
        isExpired: remainingDays < 0 || w.status === 'expired',
        maskedName,
        maskedPhone
      };
    });

    res.render('client/warranty', {
      layout: CLIENT_LAYOUT,
      title: 'Kết quả tra cứu bảo hành điện tử - QZStore',
      queryValue: cleanQuery,
      warranties: formattedWarranties,
      searched: true
    });
  } catch (error) {
    console.error('Lỗi tra cứu bảo hành:', error);
    req.session.flashError = 'Không thể tra cứu bảo hành lúc này. Vui lòng thử lại sau.';
    res.redirect('/warranty');
  }
});

module.exports = router;
