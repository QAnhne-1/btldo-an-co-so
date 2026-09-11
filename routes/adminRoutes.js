const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');

const ADMIN_LAYOUT = 'layouts/admin_layout';

// 1. TỔNG QUAN HỆ THỐNG (Overview Dashboard)
router.get('/dashboard', async (req, res) => {
  try {
    // 1. Thống kê Doanh thu (các đơn hàng không bị hủy)
    const [revenueRows] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_revenue
       FROM orders 
       WHERE order_status IN ('confirmed', 'shipping', 'completed')`
    );
    const totalRevenue = revenueRows[0].total_revenue;

    // 2. Thống kê số lượng đơn hàng theo trạng thái
    const [orderStats] = await pool.query(
      `SELECT order_status, COUNT(*) as count 
       FROM orders 
       GROUP BY order_status`
    );

    let totalOrders = 0;
    const statusCounts = {
      pending: 0,
      confirmed: 0,
      shipping: 0,
      completed: 0,
      cancelled: 0
    };

    orderStats.forEach(item => {
      statusCounts[item.order_status] = item.count;
      totalOrders += item.count;
    });

    // 3. Tổng số sản phẩm đang kinh doanh
    const [productCountRows] = await pool.query('SELECT COUNT(*) as total FROM products');
    const totalProducts = productCountRows[0].total;

    // 4. Cảnh báo sản phẩm sắp hết hàng (stock_quantity <= 5)
    const [lowStockVariants] = await pool.query(
      `SELECT pv.id, pv.sku, pv.variant_name, pv.price, pv.stock_quantity,
              p.id as product_id, p.name as product_name, p.thumbnail
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       WHERE pv.stock_quantity <= 5
       ORDER BY pv.stock_quantity ASC
       LIMIT 10`
    );

    // 5. Danh sách đơn hàng gần đây (10 đơn mới nhất)
    const [recentOrders] = await pool.query(
      `SELECT id, order_code, customer_name, customer_phone, total_amount, 
              payment_method, order_status, created_at
       FROM orders
       ORDER BY id DESC
       LIMIT 10`
    );

    res.render('admin/dashboard', {
      layout: ADMIN_LAYOUT,
      title: 'Bảng điều khiển quản trị - TechStore',
      metrics: {
        totalRevenue,
        totalOrders,
        totalProducts,
        lowStockCount: lowStockVariants.length,
        statusCounts
      },
      lowStockVariants,
      recentOrders
    });
  } catch (error) {
    console.error('Lỗi Admin Dashboard:', error);
    res.status(500).render('error', {
      layout: ADMIN_LAYOUT,
      title: '500 - Lỗi máy chủ',
      statusCode: 500,
      message: 'Không thể tải bảng điều khiển quản trị.'
    });
  }
});

// 2. QUẢN LÝ SẢN PHẨM (Product Management)

// Danh sách sản phẩm
router.get('/products', async (req, res) => {
  try {
    const { q, category } = req.query;
    let whereClauses = ['1=1'];
    let params = [];

    if (q) {
      whereClauses.push('(p.name LIKE ? OR pv.sku LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    if (category) {
      whereClauses.push('p.category_id = ?');
      params.push(category);
    }

    const [products] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.thumbnail, p.warranty_months, p.created_at,
              c.name as category_name,
              b.name as brand_name,
              COUNT(DISTINCT pv.id) as variant_count,
              MIN(pv.price) as min_price,
              MAX(pv.price) as max_price,
              COALESCE(SUM(pv.stock_quantity), 0) as total_stock
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN brands b ON p.brand_id = b.id
       LEFT JOIN product_variants pv ON p.id = pv.product_id
       WHERE ${whereClauses.join(' AND ')}
       GROUP BY p.id
       ORDER BY p.id DESC`,
      params
    );

    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name ASC');

    res.render('admin/products', {
      layout: ADMIN_LAYOUT,
      title: 'Quản lý sản phẩm - TechStore Admin',
      products,
      categories,
      query: { q, category }
    });
  } catch (error) {
    console.error('Lỗi quản lý sản phẩm:', error);
    res.status(500).render('error', {
      layout: ADMIN_LAYOUT,
      title: '500 - Lỗi máy chủ',
      statusCode: 500,
      message: 'Không thể tải danh sách sản phẩm.'
    });
  }
});

// Giao diện Thêm sản phẩm mới
router.get('/products/new', async (req, res) => {
  try {
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    const [brands] = await pool.query('SELECT * FROM brands ORDER BY name ASC');

    res.render('admin/product_form', {
      layout: ADMIN_LAYOUT,
      title: 'Thêm sản phẩm mới - TechStore Admin',
      product: null,
      variants: [],
      categories,
      brands,
      isEdit: false
    });
  } catch (error) {
    console.error('Lỗi trang tạo sản phẩm:', error);
    res.redirect('/admin/products');
  }
});

// POST: Thêm sản phẩm mới và các biến thể đính kèm
router.post('/products/new', async (req, res) => {
  const {
    name, category_id, brand_id, warranty_months, thumbnail, description,
    spec_keys, spec_values,
    variant_sku, variant_name, variant_price, variant_stock, variant_image
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Tạo slug từ tên sản phẩm
    let slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-');
    slug += `-${Date.now().toString().slice(-4)}`;

    // 2. Chuẩn bị specifications JSON
    const specifications = {};
    if (spec_keys && spec_values) {
      const keys = Array.isArray(spec_keys) ? spec_keys : [spec_keys];
      const values = Array.isArray(spec_values) ? spec_values : [spec_values];
      keys.forEach((key, idx) => {
        if (key && key.trim()) {
          specifications[key.trim()] = values[idx] ? values[idx].trim() : '';
        }
      });
    }

    // 3. Chèn vào bảng products
    const [productResult] = await conn.query(
      `INSERT INTO products 
        (category_id, brand_id, name, slug, description, specifications, warranty_months, thumbnail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(category_id, 10),
        parseInt(brand_id, 10),
        name.trim(),
        slug,
        description ? description.trim() : '',
        JSON.stringify(specifications),
        parseInt(warranty_months, 10) || 12,
        thumbnail ? thumbnail.trim() : 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'
      ]
    );

    const productId = productResult.insertId;

    // 4. Chèn các biến thể (product_variants)
    if (variant_name) {
      const vNames = Array.isArray(variant_name) ? variant_name : [variant_name];
      const vSkus = Array.isArray(variant_sku) ? variant_sku : [variant_sku];
      const vPrices = Array.isArray(variant_price) ? variant_price : [variant_price];
      const vStocks = Array.isArray(variant_stock) ? variant_stock : [variant_stock];
      const vImages = Array.isArray(variant_image) ? variant_image : [variant_image];

      for (let i = 0; i < vNames.length; i++) {
        if (!vNames[i] || !vNames[i].trim()) continue;

        const sku = vSkus[i] && vSkus[i].trim() ? vSkus[i].trim() : `SKU-${Date.now()}-${i}`;
        const price = parseFloat(vPrices[i]) || 0;
        const stock = parseInt(vStocks[i], 10) || 0;
        const img = vImages[i] && vImages[i].trim() ? vImages[i].trim() : thumbnail;

        await conn.query(
          `INSERT INTO product_variants (product_id, sku, variant_name, price, stock_quantity, image)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [productId, sku, vNames[i].trim(), price, stock, img]
        );
      }
    }

    await conn.commit();
    req.session.flashSuccess = `Đã tạo mới sản phẩm "${name}" cùng các phiên bản thành công!`;
    res.redirect('/admin/products');
  } catch (error) {
    await conn.rollback();
    console.error('Lỗi thêm sản phẩm mới:', error);
    req.session.flashError = 'Lỗi khi lưu sản phẩm: ' + error.message;
    res.redirect('/admin/products/new');
  } finally {
    conn.release();
  }
});

// Giao diện Chỉnh sửa sản phẩm
router.get('/products/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;

    const [products] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    if (products.length === 0) {
      req.session.flashError = 'Không tìm thấy sản phẩm.';
      return res.redirect('/admin/products');
    }

    const product = products[0];
    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC', [id]);
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    const [brands] = await pool.query('SELECT * FROM brands ORDER BY name ASC');

    let specifications = {};
    if (product.specifications) {
      specifications = typeof product.specifications === 'string' ? JSON.parse(product.specifications) : product.specifications;
    }

    res.render('admin/product_form', {
      layout: ADMIN_LAYOUT,
      title: `Chỉnh sửa: ${product.name} - TechStore Admin`,
      product: { ...product, specifications },
      variants,
      categories,
      brands,
      isEdit: true
    });
  } catch (error) {
    console.error('Lỗi form sửa sản phẩm:', error);
    res.redirect('/admin/products');
  }
});

// POST: Cập nhật sản phẩm và biến thể
router.post('/products/:id/edit', async (req, res) => {
  const { id } = req.params;
  const {
    name, category_id, brand_id, warranty_months, thumbnail, description,
    spec_keys, spec_values,
    variant_id, variant_sku, variant_name, variant_price, variant_stock, variant_image
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Chuẩn bị specifications
    const specifications = {};
    if (spec_keys && spec_values) {
      const keys = Array.isArray(spec_keys) ? spec_keys : [spec_keys];
      const values = Array.isArray(spec_values) ? spec_values : [spec_values];
      keys.forEach((key, idx) => {
        if (key && key.trim()) {
          specifications[key.trim()] = values[idx] ? values[idx].trim() : '';
        }
      });
    }

    // Cập nhật thông tin cơ bản sản phẩm
    await conn.query(
      `UPDATE products 
       SET category_id = ?, brand_id = ?, name = ?, description = ?, 
           specifications = ?, warranty_months = ?, thumbnail = ?
       WHERE id = ?`,
      [
        parseInt(category_id, 10),
        parseInt(brand_id, 10),
        name.trim(),
        description ? description.trim() : '',
        JSON.stringify(specifications),
        parseInt(warranty_months, 10) || 12,
        thumbnail ? thumbnail.trim() : '',
        id
      ]
    );

    // Cập nhật hoặc chèn các biến thể
    if (variant_name) {
      const vIds = Array.isArray(variant_id) ? variant_id : [variant_id];
      const vNames = Array.isArray(variant_name) ? variant_name : [variant_name];
      const vSkus = Array.isArray(variant_sku) ? variant_sku : [variant_sku];
      const vPrices = Array.isArray(variant_price) ? variant_price : [variant_price];
      const vStocks = Array.isArray(variant_stock) ? variant_stock : [variant_stock];
      const vImages = Array.isArray(variant_image) ? variant_image : [variant_image];

      for (let i = 0; i < vNames.length; i++) {
        if (!vNames[i] || !vNames[i].trim()) continue;

        const currentVId = vIds[i];
        const sku = vSkus[i] && vSkus[i].trim() ? vSkus[i].trim() : `SKU-${Date.now()}-${i}`;
        const price = parseFloat(vPrices[i]) || 0;
        const stock = parseInt(vStocks[i], 10) || 0;
        const img = vImages[i] && vImages[i].trim() ? vImages[i].trim() : thumbnail;

        if (currentVId && currentVId !== 'new') {
          // Cập nhật biến thể hiện có
          await conn.query(
            `UPDATE product_variants 
             SET sku = ?, variant_name = ?, price = ?, stock_quantity = ?, image = ?
             WHERE id = ? AND product_id = ?`,
            [sku, vNames[i].trim(), price, stock, img, currentVId, id]
          );
        } else {
          // Thêm biến thể mới
          await conn.query(
            `INSERT INTO product_variants (product_id, sku, variant_name, price, stock_quantity, image)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, sku, vNames[i].trim(), price, stock, img]
          );
        }
      }
    }

    await conn.commit();
    req.session.flashSuccess = `Đã cập nhật sản phẩm "${name}" thành công!`;
    res.redirect('/admin/products');
  } catch (error) {
    await conn.rollback();
    console.error('Lỗi cập nhật sản phẩm:', error);
    req.session.flashError = 'Lỗi cập nhật: ' + error.message;
    res.redirect(`/admin/products/${id}/edit`);
  } finally {
    conn.release();
  }
});

// Xóa sản phẩm
router.post('/products/:id/delete', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    req.session.flashSuccess = 'Đã xóa sản phẩm thành công.';
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Lỗi xóa sản phẩm:', error);
    req.session.flashError = 'Không thể xóa sản phẩm vì đã có đơn hàng liên quan.';
    res.redirect('/admin/products');
  }
});

// 3. XỬ LÝ ĐƠN HÀNG & ORDER LIFECYCLE AUTOMATION (Order Processing)

// Danh sách đơn hàng
router.get('/orders', async (req, res) => {
  try {
    const { status, q } = req.query;
    let whereClauses = ['1=1'];
    let params = [];

    if (status && ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'].includes(status)) {
      whereClauses.push('o.order_status = ?');
      params.push(status);
    }

    if (q) {
      whereClauses.push('(o.order_code LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
    }

    const [orders] = await pool.query(
      `SELECT o.*, COUNT(oi.id) as item_count 
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE ${whereClauses.join(' AND ')}
       GROUP BY o.id
       ORDER BY o.id DESC`,
      params
    );

    res.render('admin/orders', {
      layout: ADMIN_LAYOUT,
      title: 'Quản lý đơn hàng - TechStore Admin',
      orders,
      currentStatus: status || 'all',
      query: q || ''
    });
  } catch (error) {
    console.error('Lỗi danh sách đơn hàng:', error);
    res.status(500).render('error', {
      layout: ADMIN_LAYOUT,
      title: '500 - Lỗi máy chủ',
      statusCode: 500,
      message: 'Không thể tải danh sách đơn hàng.'
    });
  }
});

// Chi tiết đơn hàng
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? LIMIT 1', [id]);
    if (orders.length === 0) {
      req.session.flashError = 'Không tìm thấy đơn hàng.';
      return res.redirect('/admin/orders');
    }

    const order = orders[0];

    // Lấy chi tiết các mặt hàng
    const [items] = await pool.query(
      `SELECT oi.*, pv.sku, pv.variant_name, pv.stock_quantity as current_stock,
              p.name as product_name, p.thumbnail, p.warranty_months,
              w.serial_number, w.status as warranty_status
       FROM order_items oi
       JOIN product_variants pv ON oi.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       LEFT JOIN warranties w ON oi.id = w.order_item_id
       WHERE oi.order_id = ?`,
      [id]
    );

    res.render('admin/order_detail', {
      layout: ADMIN_LAYOUT,
      title: `Chi tiết đơn ${order.order_code} - TechStore Admin`,
      order,
      items
    });
  } catch (error) {
    console.error('Lỗi xem chi tiết đơn:', error);
    res.redirect('/admin/orders');
  }
});

// POST: CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG VỚI CÁC TỰ ĐỘNG HÓA BUSINESS LOGIC
// 1. Chuyển sang 'confirmed': Tự động trừ tồn kho (Deduct stock_quantity)
// 2. Chuyển từ 'confirmed'/'shipping' sang 'cancelled': Tự động hoàn lại tồn kho
// 3. Chuyển sang 'completed': Tự động sinh mã Serial Number (SN-XXXXXX) và kích hoạt bảo hành điện tử
router.post('/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { new_status, admin_note } = req.body;

  const validStatuses = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];
  if (!validStatuses.includes(new_status)) {
    req.session.flashError = 'Trạng thái chuyển đổi không hợp lệ.';
    return res.redirect(`/admin/orders/${id}`);
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Khóa bản ghi đơn hàng để kiểm tra trạng thái hiện tại
    const [orderRows] = await conn.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [id]
    );

    if (orderRows.length === 0) {
      throw new Error('Đơn hàng không tồn tại.');
    }

    const currentOrder = orderRows[0];
    const oldStatus = currentOrder.order_status;

    if (oldStatus === new_status) {
      req.session.flashSuccess = 'Trạng thái đơn hàng không thay đổi.';
      await conn.commit();
      return res.redirect(`/admin/orders/${id}`);
    }

    // Lấy các mặt hàng trong đơn
    const [orderItems] = await conn.query(
      `SELECT oi.id as order_item_id, oi.variant_id, oi.quantity,
              pv.stock_quantity, pv.variant_name,
              p.name as product_name, p.warranty_months
       FROM order_items oi
       JOIN product_variants pv ON oi.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE oi.order_id = ?`,
      [id]
    );

    // =========================================================================
    // LOGIC 1: ĐƠN HÀNG CHUYỂN SANG 'confirmed' -> TỰ ĐỘNG TRỪ KHO
    // =========================================================================
    if (new_status === 'confirmed' && oldStatus === 'pending') {
      for (const item of orderItems) {
        // Kiểm tra tồn kho trước khi trừ
        if (item.stock_quantity < item.quantity) {
          throw new Error(
            `Không thể xác nhận đơn: Biến thể "${item.product_name} - ${item.variant_name}" chỉ còn ${item.stock_quantity} sản phẩm trong kho (cần ${item.quantity}).`
          );
        }

        // Trừ tồn kho
        await conn.query(
          `UPDATE product_variants 
           SET stock_quantity = stock_quantity - ? 
           WHERE id = ?`,
          [item.quantity, item.variant_id]
        );
      }
    }

    // =========================================================================
    // LOGIC 2: HỦY ĐƠN ĐÃ XÁC NHẬN ('confirmed'/'shipping' -> 'cancelled') -> HOÀN TỒN KHO
    // =========================================================================
    if (new_status === 'cancelled' && (oldStatus === 'confirmed' || oldStatus === 'shipping')) {
      for (const item of orderItems) {
        await conn.query(
          `UPDATE product_variants 
           SET stock_quantity = stock_quantity + ? 
           WHERE id = ?`,
          [item.quantity, item.variant_id]
        );
      }
    }

    // =========================================================================
    // LOGIC 3: ĐƠN HÀNG CHUYỂN SANG 'completed' -> TỰ ĐỘNG SINH SERIAL VÀ KÍCH HOẠT BẢO HÀNH
    // =========================================================================
    if (new_status === 'completed') {
      // Nếu đơn hàng từ pending nhảy thẳng sang completed mà chưa trừ kho, ta cũng thực hiện trừ kho
      if (oldStatus === 'pending') {
        for (const item of orderItems) {
          await conn.query(
            `UPDATE product_variants 
             SET stock_quantity = GREATEST(0, stock_quantity - ?) 
             WHERE id = ?`,
            [item.quantity, item.variant_id]
          );
        }
      }

      // Kiểm tra xem đơn hàng đã từng được sinh mã bảo hành chưa
      const [existingWarranties] = await conn.query(
        `SELECT w.id FROM warranties w
         JOIN order_items oi ON w.order_item_id = oi.id
         WHERE oi.order_id = ?`,
        [id]
      );

      if (existingWarranties.length === 0) {
        // Tự động tạo mã bảo hành duy nhất cho từng mặt hàng
        for (const item of orderItems) {
          const warrantyMonths = item.warranty_months || 12;

          // Sinh mã Serial độc nhất theo chuẩn SN-TECH-XXXXXX
          const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
          const serialNumber = `SN-TECH-${randomHex}`;

          await conn.query(
            `INSERT INTO warranties 
              (order_item_id, serial_number, customer_phone, start_date, end_date, status)
             VALUES (?, ?, ?, CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL ? MONTH), 'valid')`,
            [item.order_item_id, serialNumber, currentOrder.customer_phone, warrantyMonths]
          );
        }
      }
    }

    // 4. Cập nhật trạng thái đơn hàng
    let noteUpdate = currentOrder.note || '';
    if (admin_note && admin_note.trim()) {
      noteUpdate = (noteUpdate ? noteUpdate + ' | ' : '') + `[Admin ${new Date().toLocaleDateString('vi-VN')}]: ${admin_note.trim()}`;
    }

    await conn.query(
      `UPDATE orders 
       SET order_status = ?, note = ?, updated_at = NOW() 
       WHERE id = ?`,
      [new_status, noteUpdate, id]
    );

    await conn.commit();

    let successMsg = `Đã cập nhật đơn ${currentOrder.order_code} sang trạng thái "${new_status}".`;
    if (new_status === 'confirmed' && oldStatus === 'pending') {
      successMsg += ' Đã tự động trừ số lượng tồn kho tương ứng.';
    } else if (new_status === 'completed') {
      successMsg += ' Đã tự động kích hoạt bảo hành điện tử và tạo mã Serial cho từng sản phẩm!';
    } else if (new_status === 'cancelled') {
      successMsg += ' Đã hoàn lại số lượng tồn kho cho các sản phẩm.';
    }

    req.session.flashSuccess = successMsg;
    res.redirect(`/admin/orders/${id}`);
  } catch (error) {
    await conn.rollback();
    console.error('Lỗi chuyển trạng thái đơn hàng:', error);
    req.session.flashError = 'Không thể cập nhật trạng thái đơn: ' + error.message;
    res.redirect(`/admin/orders/${id}`);
  } finally {
    conn.release();
  }
});

// 4. QUẢN LÝ BẢO HÀNH ĐIỆN TỬ (Warranty List)
router.get('/warranties', async (req, res) => {
  try {
    const { q, status } = req.query;
    let whereClauses = ['1=1'];
    let params = [];

    if (q) {
      whereClauses.push('(w.serial_number LIKE ? OR w.customer_phone LIKE ? OR p.name LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
    }

    if (status && ['valid', 'expired', 'void'].includes(status)) {
      whereClauses.push('w.status = ?');
      params.push(status);
    }

    const [warranties] = await pool.query(
      `SELECT w.*, 
              o.order_code, o.customer_name,
              p.name as product_name, p.thumbnail,
              pv.variant_name, pv.sku,
              DATEDIFF(w.end_date, CURRENT_DATE()) as remaining_days
       FROM warranties w
       JOIN order_items oi ON w.order_item_id = oi.id
       JOIN product_variants pv ON oi.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY w.id DESC`,
      params
    );

    res.render('admin/warranties', {
      layout: ADMIN_LAYOUT,
      title: 'Quản lý bảo hành điện tử - TechStore Admin',
      warranties,
      query: { q, status }
    });
  } catch (error) {
    console.error('Lỗi quản lý bảo hành:', error);
    res.status(500).render('error', {
      layout: ADMIN_LAYOUT,
      title: '500 - Lỗi máy chủ',
      statusCode: 500,
      message: 'Không thể tải danh sách bảo hành.'
    });
  }
});

module.exports = router;
