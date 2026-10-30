const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const CLIENT_LAYOUT = 'layouts/client_layout';

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

router.get('/', async (req, res) => {
  try {
    const categories = await getHeaderCategories();

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

router.get('/product/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

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

    const [variants] = await pool.query(
      `SELECT id, product_id, sku, variant_name, price, stock_quantity, image
       FROM product_variants
       WHERE product_id = ?
       ORDER BY price ASC`,
      [product.id]
    );

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

router.post('/cart/add', async (req, res) => {
  try {
    const { variant_id, quantity = 1 } = req.body;
    const qty = parseInt(quantity, 10) || 1;

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

router.post('/cart/remove', (req, res) => {
  const { variant_id } = req.body;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(i => i.variant_id != variant_id);
    req.session.flashSuccess = 'Đã xóa sản phẩm khỏi giỏ hàng.';
  }
  res.redirect('/cart');
});

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

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    let totalAmount = 0;
    const validatedItems = [];

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

    const shippingFee = totalAmount > 500000 ? 0 : 30000;
    const finalOrderTotal = totalAmount + shippingFee;

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCode = `ORD-${datePart}-${randomSuffix}`;

    const userId = req.session.user ? req.session.user.id : null;
    const validPaymentMethod = ['cod', 'banking'].includes(payment_method) ? payment_method : 'cod';

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

    for (const vItem of validatedItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, variant_id, quantity, price)
         VALUES (?, ?, ?, ?)`,
        [orderId, vItem.variant_id, vItem.quantity, vItem.price]
      );
    }

    await conn.commit();

    req.session.cart = [];

    return res.redirect(`/order-success?code=${orderCode}`);
  } catch (err) {
    await conn.rollback();
    console.error('LỖI TRANSACTION CHECKOUT - ROLLBACK THÀNH CÔNG:', err.message);

    req.session.flashError = err.message || 'Giao dịch đặt hàng thất bại do xung đột dữ liệu. Vui lòng kiểm tra lại giỏ hàng.';
    return res.redirect('/checkout');
  } finally {
    conn.release();
  }
});

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

    const formattedWarranties = warranties.map(w => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(w.end_date);
      endDate.setHours(0, 0, 0, 0);

      const diffTime = endDate.getTime() - today.getTime();
      const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

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

const { GoogleGenerativeAI } = require('@google/generative-ai');

const CHAT_MAX_SUGGESTIONS = 4;
const CHAT_HISTORY_LIMIT = 8;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DETAIL_PROMPT_PREFIX = 'Xem chi tiết sản phẩm:';
const STEP1_CLOSING = 'Bạn quan tâm đến sản phẩm nào trên đây để mình tư vấn chi tiết thông số nhé?';
const SUGGEST_TAG_REGEX = /\[\[\s*GOI_Y\s*:([^\]]*)\]\]/gi;

const GENERIC_TOKENS = new Set([
  'tai', 'nghe', 'củ', 'sạc', 'cáp', 'pin', 'dự', 'phòng', 'loa', 'nhanh', 'không',
  'dây', 'bluetooth', 'chống', 'ồn', 'sản', 'phẩm', 'chính', 'hãng', 'cổng', 'và', 'cho'
]);

function normalizeText(str) {
  return (str || '').toString().normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(str) {
  return normalizeText(str).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function formatVnd(value) {
  return value ? Number(value).toLocaleString('vi-VN') + ' đ' : 'Liên hệ';
}

function formatPriceRange(p) {
  const minP = formatVnd(p.min_price);
  const maxP = formatVnd(p.max_price);
  return minP === maxP ? minP : `${minP} - ${maxP}`;
}

function parseSpecs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function specsToText(specs, maxLen = 400) {
  const text = Object.entries(specs)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('; ');
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function buildProductSuggestions(list) {
  return list.slice(0, CHAT_MAX_SUGGESTIONS).map(p => ({
    label: p.name,
    prompt: `${DETAIL_PROMPT_PREFIX} ${p.name}`
  }));
}

function findMentionedProduct(message, products) {
  const msg = normalizeText(message);
  if (!msg) return null;

  let exact = null;
  for (const p of products) {
    const name = normalizeText(p.name);
    if (name && msg.includes(name) && (!exact || name.length > normalizeText(exact.name).length)) {
      exact = p;
    }
  }
  if (exact) return exact;

  const msgTokens = new Set(tokenize(msg));
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const tokens = [...new Set(tokenize(p.name))].filter(t => t.length >= 2 && !GENERIC_TOKENS.has(t));
    if (tokens.length === 0) continue;
    const hits = tokens.filter(t => msgTokens.has(t)).length;
    const score = hits / tokens.length;
    if (hits >= 2 && score >= 0.6 && score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

function rankProducts(list, query) {
  const qTokens = new Set(tokenize(query).filter(t => !GENERIC_TOKENS.has(t)));
  return list
    .map(p => {
      const nameTokens = tokenize(p.name + ' ' + (p.brand_name || ''));
      const score = nameTokens.filter(t => qTokens.has(t)).length;
      return { p, score, inStock: Number(p.total_stock) > 0 ? 1 : 0 };
    })
    .sort((a, b) => b.score - a.score || b.inStock - a.inStock)
    .map(x => x.p);
}

function buildShortListReply(title, list) {
  const lines = list.slice(0, CHAT_MAX_SUGGESTIONS).map((p, i) => `${i + 1}. **${p.name}**`);
  return `${title}\n${lines.join('\n')}\n\n${STEP1_CLOSING}`;
}

function buildProductDetailReply(p, variants) {
  const specs = parseSpecs(p.specifications);
  const inStock = Number(p.total_stock) > 0;
  let reply = `🔎 **${p.name}**\n`;
  reply += `- Thương hiệu: **${p.brand_name}** | Danh mục: ${p.category_name}\n`;

  if (variants && variants.length > 1) {
    const variantText = variants
      .map(v => `${v.variant_name} **${formatVnd(v.price)}**${Number(v.stock_quantity) > 0 ? '' : ' (hết hàng)'}`)
      .join(' · ');
    reply += `- Giá bán: ${variantText}\n`;
  } else {
    reply += `- Giá bán: **${formatPriceRange(p)}**\n`;
  }

  reply += `- Bảo hành: **${p.warranty_months} tháng** chính hãng, 1 đổi 1 trong 30 ngày nếu lỗi nhà sản xuất\n`;
  reply += `- Tình trạng: **${inStock ? 'Còn hàng' : 'Tạm hết hàng'}**\n`;

  const specEntries = Object.entries(specs);
  if (specEntries.length > 0) {
    reply += `\n**Thông số kỹ thuật:**\n`;
    specEntries.slice(0, 10).forEach(([k, v]) => {
      reply += `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}\n`;
    });
  }

  if (p.description) {
    const plain = p.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const highlight = plain.length > 300 ? plain.slice(0, 300).replace(/\s+\S*$/, '') + '…' : plain;
    if (highlight) reply += `\n**Ưu điểm nổi bật:** ${highlight}\n`;
  }

  if (p.slug) reply += `\n👉 Xem trang sản phẩm & đặt hàng: /product/${p.slug}`;
  return reply;
}

function buildRelatedSuggestions(product, products) {
  return buildProductSuggestions(
    products.filter(p => p.id !== product.id && p.category_name === product.category_name).slice(0, 3)
  );
}

function extractSuggestionsFromAi(text, products) {
  const names = [];
  const cleaned = text.replace(SUGGEST_TAG_REGEX, (_, inner) => {
    inner.split('|').map(s => s.trim()).filter(Boolean).forEach(n => names.push(n));
    return '';
  }).trim();

  const seen = new Set();
  const matched = [];
  for (const n of names) {
    const target = normalizeText(n);
    const p = products.find(x => normalizeText(x.name) === target) || findMentionedProduct(n, products);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      matched.push(p);
    }
  }
  return { reply: cleaned, suggestions: buildProductSuggestions(matched) };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = history
    .slice(-CHAT_HISTORY_LIMIT)
    .filter(h => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim())
    .map(h => ({ role: h.role, text: h.text.trim().slice(0, 1500) }));

  const result = [];
  for (const h of cleaned) {
    if (result.length === 0 && h.role !== 'user') continue;
    if (result.length && result[result.length - 1].role === h.role) {
      result[result.length - 1] = h;
      continue;
    }
    result.push(h);
  }
  if (result.length && result[result.length - 1].role === 'user') result.pop();
  return result.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
}

function generateSmartFallbackReply(userMessage, products, ctx) {
  const { orderInfo, warrantyInfo, mentionedProduct, mentionedVariants } = ctx;
  const query = normalizeText(userMessage);
  const none = [];

  if (orderInfo) return { reply: orderInfo, suggestions: none };
  if (warrantyInfo) return { reply: warrantyInfo, suggestions: none };

  if (mentionedProduct) {
    return {
      reply: buildProductDetailReply(mentionedProduct, mentionedVariants),
      suggestions: buildRelatedSuggestions(mentionedProduct, products)
    };
  }
  if (query.startsWith(normalizeText(DETAIL_PROMPT_PREFIX))) {
    return {
      reply: `Rất tiếc, mình không tìm thấy sản phẩm này trong kho hiện tại. Bạn có thể xem toàn bộ sản phẩm tại /products hoặc cho mình biết nhu cầu để gợi ý mẫu phù hợp nhé!`,
      suggestions: none
    };
  }

  if (query.includes('bảo hành') || query.includes('đổi trả') || query.includes('lỗi') || query.includes('chính sách')) {
    return {
      reply: `🛡️ **Chính sách bảo hành & đổi trả tại QZStore:**\n` +
        `- **Đổi trả 1 - 1 trong 30 ngày:** Áp dụng ngay cho mọi sản phẩm có lỗi kỹ thuật từ nhà sản xuất.\n` +
        `- **Bảo hành chính hãng:** Thời hạn từ **12 đến 24 tháng** tùy thuộc vào từng loại phụ kiện.\n` +
        `- **Tra cứu bảo hành điện tử:** Kiểm tra theo Serial hoặc Số điện thoại mua hàng tại trang /warranty\n` +
        `- **Hỗ trợ:** Hotline miễn phí **1900 1234** hoặc Showroom 123 Đường Công Nghệ, Quận 1, TP. HCM.`,
      suggestions: none
    };
  }

  if (query.includes('vận chuyển') || query.includes('giao hàng') || query.includes('ship') || query.includes('phí')) {
    return {
      reply: `🚚 **Chính sách giao hàng & vận chuyển:**\n` +
        `- **Freeship:** Tự động cho đơn từ **500.000 đ** trở lên.\n` +
        `- **Đơn dưới 500.000 đ:** Đồng giá **30.000 đ** toàn quốc.\n` +
        `- **Thời gian:** Nội thành 1 - 2 ngày, tỉnh thành khác 2 - 3 ngày làm việc.\n` +
        `- **Đồng kiểm:** Được kiểm tra hàng trước khi thanh toán.`,
      suggestions: none
    };
  }

  if (query.includes('thanh toán') || query.includes('chuyển khoản') || query.includes('cod') || query.includes('vietqr')) {
    return {
      reply: `💳 **Phương thức thanh toán tại QZStore:**\n` +
        `- **COD:** Nhận hàng, kiểm tra rồi thanh toán.\n` +
        `- **Chuyển khoản VietQR:** Quét mã QR qua mọi ứng dụng ngân hàng, xác nhận đơn tự động.`,
      suggestions: none
    };
  }

  if (query.includes('đơn hàng') || query.includes('tra cứu đơn') || query.includes('tình trạng đơn')) {
    return {
      reply: `📦 **Hướng dẫn tra cứu đơn hàng:**\n` +
        `Bạn chỉ cần nhập **Mã đơn hàng** (ví dụ: \`ORD-20260918-1234\`) vào khung chat này để mình kiểm tra ngay, hoặc gọi Hotline **1900 1234** nhé!`,
      suggestions: none
    };
  }

  const chargerKeywords = ['sạc', 'cáp', 'gan', 'pin dự phòng', 'anker', 'baseus', 'ugreen'];
  if (chargerKeywords.some(k => query.includes(k))) {
    const matched = rankProducts(products.filter(p => {
      const hay = normalizeText(p.name + ' ' + p.category_name);
      return ['sạc', 'cáp', 'pin', 'gan', 'anker', 'baseus', 'ugreen'].some(k => hay.includes(k));
    }), query);
    if (matched.length > 0) {
      return {
        reply: buildShortListReply('⚡ Mình gợi ý nhanh vài mẫu sạc nổi bật đang có tại QZStore:', matched),
        suggestions: buildProductSuggestions(matched)
      };
    }
  }

  const audioKeywords = ['tai nghe', 'loa', 'âm thanh', 'chống ồn', 'sony', 'airpods', 'jbl', 'marshall'];
  if (audioKeywords.some(k => query.includes(k))) {
    const matched = rankProducts(products.filter(p => {
      const hay = normalizeText(p.name + ' ' + p.category_name);
      return ['tai nghe', 'loa', 'âm thanh', 'sony', 'airpods', 'jbl', 'marshall'].some(k => hay.includes(k));
    }), query);
    if (matched.length > 0) {
      return {
        reply: buildShortListReply('🎧 Mình gợi ý nhanh vài mẫu tai nghe & loa nổi bật tại QZStore:', matched),
        suggestions: buildProductSuggestions(matched)
      };
    }
  }

  if (query.includes('địa chỉ') || query.includes('showroom') || query.includes('cửa hàng') || query.includes('hotline') || query.includes('liên hệ')) {
    return {
      reply: `📍 **Thông tin liên hệ QZStore:**\n` +
        `- **Showroom:** 123 Đường Công Nghệ, Quận 1, TP. Hồ Chí Minh\n` +
        `- **Hotline:** **1900 1234** (8:00 - 21:30 hàng ngày)\n` +
        `- **Email:** support@qzstore.local\n` +
        `- **Giờ mở cửa:** 8:00 - 22:00 các ngày trong tuần.`,
      suggestions: none
    };
  }

  const words = tokenize(query).filter(w => w.length > 2 && !GENERIC_TOKENS.has(w));
  const keywordMatches = rankProducts(
    products.filter(p => words.some(w => normalizeText(p.name).includes(w))),
    query
  );
  if (keywordMatches.length > 0) {
    return {
      reply: buildShortListReply('🔍 Mình tìm thấy vài sản phẩm phù hợp:', keywordMatches),
      suggestions: buildProductSuggestions(keywordMatches)
    };
  }

  return {
    reply: `Xin chào bạn! QZStore AI Support có thể tư vấn cho bạn về:\n` +
      `- **Củ sạc & cáp sạc nhanh GaN**\n` +
      `- **Tai nghe chống ồn & loa Bluetooth**\n` +
      `- **Pin sạc dự phòng**\n` +
      `- **Tra cứu đơn hàng** (nhập mã \`ORD-...\`) và **chính sách bảo hành**\n\n` +
      `Bạn đang quan tâm đến dòng sản phẩm nào ạ?`,
    suggestions: [
      { label: '🎧 Tai nghe chống ồn', prompt: 'Tư vấn tai nghe chống ồn tốt nhất hiện nay' },
      { label: '⚡ Củ sạc nhanh GaN', prompt: 'Gợi ý củ sạc nhanh GaN đang có sẵn' },
      { label: '🔋 Pin sạc dự phòng', prompt: 'Gợi ý pin sạc dự phòng dung lượng cao' }
    ]
  };
}

router.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ reply: 'Vui lòng nhập nội dung câu hỏi để QZStore AI hỗ trợ bạn nhé.', suggestions: [] });
    }

    const userMessage = message.trim().slice(0, 500);

    const [products] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.warranty_months, p.description, p.specifications,
              c.name as category_name, b.name as brand_name,
              MIN(pv.price) as min_price, MAX(pv.price) as max_price,
              SUM(pv.stock_quantity) as total_stock
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN brands b ON p.brand_id = b.id
       LEFT JOIN product_variants pv ON p.id = pv.product_id
       GROUP BY p.id
       ORDER BY p.id ASC`
    );

    const [categories] = await pool.query('SELECT name FROM categories ORDER BY name ASC');
    const [brands] = await pool.query('SELECT name FROM brands ORDER BY name ASC');

    let orderInfo = '';
    const orderCodeMatch = userMessage.match(/ORD-\d{8}-\d{4}/i);
    if (orderCodeMatch) {
      const [orderRows] = await pool.query(
        `SELECT o.order_code, o.order_status, o.total_amount, o.created_at, o.payment_method,
                GROUP_CONCAT(CONCAT(p.name, ' (x', oi.quantity, ')') SEPARATOR ', ') as items
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN product_variants pv ON oi.variant_id = pv.id
         JOIN products p ON pv.product_id = p.id
         WHERE o.order_code = ?
         GROUP BY o.id`,
        [orderCodeMatch[0].toUpperCase()]
      );

      if (orderRows.length > 0) {
        const ord = orderRows[0];
        const statusMap = {
          pending: 'Chờ xử lý',
          confirmed: 'Đã xác nhận',
          shipping: 'Đang giao hàng',
          completed: 'Đã giao thành công',
          cancelled: 'Đã hủy'
        };
        const statusText = statusMap[ord.order_status] || ord.order_status;
        orderInfo = `📦 **Thông tin đơn hàng ${ord.order_code}:**\n` +
          `- Trạng thái: **${statusText}**\n` +
          `- Tổng tiền: **${Number(ord.total_amount).toLocaleString('vi-VN')} đ**\n` +
          `- Hình thức thanh toán: **${ord.payment_method.toUpperCase()}**\n` +
          `- Sản phẩm trong đơn: ${ord.items || 'Xem chi tiết trong hóa đơn'}\n` +
          `Nếu cần điều chỉnh thông tin người nhận, quý khách có thể liên hệ ngay Hotline **1900 1234** nhé!`;
      } else {
        orderInfo = `⚠️ Không tìm thấy đơn hàng có mã **${orderCodeMatch[0].toUpperCase()}** trong hệ thống. Quý khách vui lòng kiểm tra lại mã trên hóa đơn/email hoặc liên hệ Hotline **1900 1234**.`;
      }
    }

    let warrantyInfo = '';
    const phoneMatch = userMessage.match(/(0\d{9})/);
    if (phoneMatch && (userMessage.toLowerCase().includes('bảo hành') || userMessage.toLowerCase().includes('tra cứu'))) {
      const [warrantyRows] = await pool.query(
        `SELECT w.serial_number, w.status, w.end_date, p.name as product_name
         FROM warranties w
         JOIN order_items oi ON w.order_item_id = oi.id
         JOIN product_variants pv ON oi.variant_id = pv.id
         JOIN products p ON pv.product_id = p.id
         WHERE w.customer_phone = ?`,
        [phoneMatch[0]]
      );

      if (warrantyRows.length > 0) {
        warrantyInfo = `🛡️ **Thông tin bảo hành thiết bị theo SĐT ${phoneMatch[0]}:**\n` +
          warrantyRows.map(w => `- **${w.product_name}** | Serial: \`${w.serial_number}\` | Tình trạng: **${w.status === 'active' ? 'Còn hạn' : 'Hết hạn'}** (Hạn bảo hành: ${new Date(w.end_date).toLocaleDateString('vi-VN')})`).join('\n') +
          `\nQuý khách có thể xem chi tiết tại trang /warranty`;
      }
    }

    const mentionedProduct = findMentionedProduct(userMessage, products);
    let mentionedVariants = [];
    if (mentionedProduct) {
      const [variantRows] = await pool.query(
        `SELECT variant_name, price, stock_quantity
         FROM product_variants
         WHERE product_id = ?
         ORDER BY price ASC`,
        [mentionedProduct.id]
      );
      mentionedVariants = variantRows;
    }

    const fallbackCtx = { orderInfo, warrantyInfo, mentionedProduct, mentionedVariants };

    const apiKey = process.env.GEMINI_API_KEY;
    const isApiKeyConfigured = apiKey && apiKey.trim() !== '' && !apiKey.includes('your_gemini_api_key_here');

    if (!isApiKeyConfigured) {
      return res.json(generateSmartFallbackReply(userMessage, products, fallbackCtx));
    }

    const productCatalog = products.map(p => {
      const specText = specsToText(parseSpecs(p.specifications), 300);
      return `- "${p.name}" | Danh mục: ${p.category_name} | Hãng: ${p.brand_name} | Giá: ${formatPriceRange(p)} | Bảo hành: ${p.warranty_months} tháng | Còn hàng: ${Number(p.total_stock) > 0 ? 'Có' : 'Hết'} | Link: /product/${p.slug}${specText ? ` | Thông số: ${specText}` : ''}`;
    }).join('\n');

    let focusBlock = '';
    if (mentionedProduct) {
      const mp = mentionedProduct;
      const desc = (mp.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
      focusBlock = `\nSẢN PHẨM KHÁCH ĐANG HỎI CHI TIẾT (áp dụng BƯỚC 2):
- Tên: ${mp.name} | Hãng: ${mp.brand_name} | Danh mục: ${mp.category_name}
- Phiên bản & giá: ${mentionedVariants.length ? mentionedVariants.map(v => `${v.variant_name}: ${formatVnd(v.price)}${Number(v.stock_quantity) > 0 ? '' : ' (hết hàng)'}`).join('; ') : formatPriceRange(mp)}
- Bảo hành: ${mp.warranty_months} tháng | Tình trạng: ${Number(mp.total_stock) > 0 ? 'Còn hàng' : 'Tạm hết hàng'} | Link: /product/${mp.slug}
- Thông số đầy đủ: ${specsToText(parseSpecs(mp.specifications), 1500) || 'Chưa có dữ liệu'}
- Mô tả: ${desc || 'Chưa có mô tả'}\n`;
    }

    const systemInstruction = `Bạn là "QZStore AI Support" — chuyên viên tư vấn phụ kiện điện thoại, củ sạc, cáp, pin dự phòng, tai nghe và loa của QZStore.
Luôn trả lời bằng tiếng Việt, thân thiện, ngắn gọn. Chỉ tư vấn sản phẩm CÓ trong danh sách kho bên dưới, không bịa thông số hay giá.

=== QUY TRÌNH TƯ VẤN SẢN PHẨM 2 BƯỚC (BẮT BUỘC) ===

BƯỚC 1 — GỢI Ý NGẮN GỌN
Áp dụng khi khách hỏi chung về một nhóm sản phẩm hoặc nhu cầu (ví dụ: "tai nghe chống ồn tốt nhất?", "củ sạc GaN 65W", "sạc cho iPhone", "loa nào nghe nhạc hay").
- Chọn tối đa ${CHAT_MAX_SUGGESTIONS} sản phẩm phù hợp nhất trong kho (ưu tiên còn hàng).
- Mở đầu bằng tối đa 1 câu ngắn, rồi liệt kê dạng danh sách đánh số. Mỗi dòng CHỈ gồm tên sản phẩm in đậm, được thêm tối đa 6 từ nêu điểm khác biệt.
- TUYỆT ĐỐI KHÔNG ghi giá, thương hiệu, thời gian bảo hành, thông số kỹ thuật hay chính sách ở bước này — kể cả khi khách hỏi giá; giá sẽ báo ở bước 2.
- Kết thúc bằng đúng câu: "${STEP1_CLOSING}"
- Dòng CUỐI CÙNG phải là thẻ dành cho hệ thống (khách không thấy): [[GOI_Y: Tên SP 1 | Tên SP 2 | Tên SP 3]] — tên chép NGUYÊN VĂN như trong danh sách kho, cùng thứ tự đã liệt kê.

BƯỚC 2 — TƯ VẤN CHI TIẾT 1 SẢN PHẨM
Áp dụng khi khách bấm "${DETAIL_PROMPT_PREFIX} ...", gõ tên một sản phẩm cụ thể, hoặc chỉ tới 1 mẫu vừa gợi ý (ví dụ "mẫu thứ 2", "con Sony đó").
- Chỉ nói về DUY NHẤT sản phẩm đó, trình bày gọn theo thứ tự:
  1) Tên sản phẩm + thương hiệu
  2) Giá bán (liệt kê theo từng phiên bản nếu có)
  3) Thời gian bảo hành (kèm 1 đổi 1 trong 30 ngày nếu lỗi NSX)
  4) Thông số kỹ thuật chính (chỉ lấy từ dữ liệu được cung cấp)
  5) 2-3 ưu điểm nổi bật / phù hợp với ai
  6) Tình trạng hàng và đường dẫn /product/<slug>
- Không liệt kê chi tiết sản phẩm khác, trừ khi khách yêu cầu so sánh.
- Có thể thêm thẻ [[GOI_Y: ...]] ở dòng cuối với tối đa 3 sản phẩm cùng danh mục để khách xem tiếp (không bắt buộc).

CÂU HỎI KHÁC (chính sách, vận chuyển, thanh toán, đơn hàng, bảo hành): trả lời ngắn gọn theo chính sách bên dưới, KHÔNG dùng thẻ [[GOI_Y]].
Không bao giờ nhắc tới "bước 1", "bước 2" hay thẻ [[GOI_Y]] với khách.

=== CHÍNH SÁCH CỬA HÀNG ===
1. Bảo hành: 12-24 tháng chính hãng tùy sản phẩm; 1 đổi 1 trong 30 ngày nếu lỗi nhà sản xuất. Tra cứu bảo hành điện tử tại /warranty.
2. Vận chuyển: Miễn phí cho đơn từ 500.000 đ; đơn dưới 500.000 đ phí đồng giá 30.000 đ toàn quốc; giao trong 1-3 ngày làm việc.
3. Thanh toán: COD và chuyển khoản VietQR.
4. Liên hệ: Hotline 1900 1234 (8:00 - 21:30), Showroom 123 Đường Công Nghệ, Quận 1, TP. Hồ Chí Minh.

DANH MỤC CỬA HÀNG: ${categories.map(c => c.name).join(', ')}
THƯƠNG HIỆU: ${brands.map(b => b.name).join(', ')}

DANH SÁCH SẢN PHẨM HIỆN CÓ TRONG KHO:
${productCatalog}
${focusBlock}${orderInfo ? `\nTHÔNG TIN ĐƠN HÀNG TRA CỨU:\n${orderInfo}` : ''}
${warrantyInfo ? `\nTHÔNG TIN BẢO HÀNH TRA CỨU:\n${warrantyInfo}` : ''}`;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction
      });

      const chat = model.startChat({ history: sanitizeHistory(history) });
      const result = await chat.sendMessage(userMessage);
      const rawReply = result.response.text();

      const { reply, suggestions } = extractSuggestionsFromAi(rawReply, products);
      return res.json({ reply, suggestions });
    } catch (aiErr) {
      console.warn('[QZStore Chatbot] Gemini AI API gặp sự cố, tự động kích hoạt Fallback Engine:', aiErr.message);
      return res.json(generateSmartFallbackReply(userMessage, products, fallbackCtx));
    }
  } catch (error) {
    console.error('Lỗi API Chatbot:', error);
    return res.status(500).json({
      reply: 'Hệ thống đang bảo trì dịch vụ tư vấn AI. Quý khách vui lòng liên hệ Hotline **1900 1234** để được hỗ trợ tức thì nhé!',
      suggestions: []
    });
  }
});

module.exports = router;