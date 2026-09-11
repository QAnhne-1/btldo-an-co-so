const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

// GET: Trang đăng nhập
router.get('/login', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin' || req.session.user.role === 'staff') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/');
  }

  res.render('auth/login', {
    layout: 'layouts/client_layout',
    title: 'Đăng nhập tài khoản - TechStore',
    redirect: req.query.redirect || ''
  });
});

// POST: Xử lý đăng nhập
router.post('/login', async (req, res) => {
  const { email, password, redirect } = req.body;

  try {
    if (!email || !password) {
      req.session.flashError = 'Vui lòng nhập đầy đủ Email và Mật khẩu.';
      return res.redirect(`/auth/login${redirect ? '?redirect=' + encodeURIComponent(redirect) : ''}`);
    }

    const [rows] = await pool.query(
      'SELECT id, fullname, email, password, phone, role, address, status FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      req.session.flashError = 'Tài khoản Email không tồn tại trong hệ thống.';
      return res.redirect(`/auth/login${redirect ? '?redirect=' + encodeURIComponent(redirect) : ''}`);
    }

    const user = rows[0];

    if (user.status !== 'active') {
      req.session.flashError = 'Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa. Vui lòng liên hệ quản trị viên.';
      return res.redirect('/auth/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.session.flashError = 'Mật khẩu đăng nhập không chính xác.';
      return res.redirect(`/auth/login${redirect ? '?redirect=' + encodeURIComponent(redirect) : ''}`);
    }

    // Thiết lập Session
    req.session.user = {
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      role: user.role,
      address: user.address
    };

    req.session.flashSuccess = `Đăng nhập thành công! Chào mừng ${user.fullname}.`;

    // Nếu là Admin hoặc Staff, chuyển hướng tới Admin Dashboard
    if (user.role === 'admin' || user.role === 'staff') {
      return res.redirect(redirect || '/admin/dashboard');
    }

    // Nếu là Customer bình thường
    return res.redirect(redirect || '/');
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    req.session.flashError = 'Đã xảy ra lỗi trong quá trình xử lý đăng nhập. Vui lòng thử lại.';
    return res.redirect('/auth/login');
  }
});

// GET: Trang đăng ký tài khoản khách hàng
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }

  res.render('auth/register', {
    layout: 'layouts/client_layout',
    title: 'Đăng ký tài khoản mới - TechStore'
  });
});

// POST: Xử lý đăng ký tài khoản
router.post('/register', async (req, res) => {
  const { fullname, email, phone, password, confirm_password, address } = req.body;

  try {
    if (!fullname || !email || !password || !phone) {
      req.session.flashError = 'Vui lòng điền đầy đủ các thông tin bắt buộc (*).';
      return res.redirect('/auth/register');
    }

    if (password.length < 6) {
      req.session.flashError = 'Mật khẩu phải có độ dài tối thiểu từ 6 ký tự.';
      return res.redirect('/auth/register');
    }

    if (password !== confirm_password) {
      req.session.flashError = 'Xác nhận mật khẩu không trùng khớp.';
      return res.redirect('/auth/register');
    }

    // Kiểm tra trùng lặp email
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      req.session.flashError = 'Email này đã được sử dụng bởi một tài khoản khác.';
      return res.redirect('/auth/register');
    }

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Thêm người dùng mới với role 'customer'
    const [result] = await pool.query(
      `INSERT INTO users (fullname, email, password, phone, role, address, status)
       VALUES (?, ?, ?, ?, 'customer', ?, 'active')`,
      [fullname.trim(), email.trim().toLowerCase(), hashedPassword, phone.trim(), address ? address.trim() : null]
    );

    // Tự động đăng nhập cho khách hàng sau khi đăng ký
    req.session.user = {
      id: result.insertId,
      fullname: fullname.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: 'customer',
      address: address ? address.trim() : null
    };

    req.session.flashSuccess = 'Đăng ký tài khoản thành công! Bạn có thể bắt đầu mua sắm ngay bây giờ.';
    return res.redirect('/');
  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    req.session.flashError = 'Đã xảy ra lỗi trong quá trình tạo tài khoản. Vui lòng thử lại.';
    return res.redirect('/auth/register');
  }
});

// GET / POST: Đăng xuất
router.all('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Lỗi hủy session:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;
