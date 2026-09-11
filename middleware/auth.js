/**
 * Authentication and Role-Based Access Control (RBAC) Middleware
 */

// 1. Kiểm tra người dùng đã đăng nhập chưa
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.flashError = 'Vui lòng đăng nhập để tiếp tục.';
  return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
}

// 2. Phân quyền theo Role (RBAC): ['admin', 'staff']
function checkRole(allowedRoles = ['admin', 'staff']) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.session.flashError = 'Vui lòng đăng nhập với tài khoản có thẩm quyền.';
      return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }

    const userRole = req.session.user.role;
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // Nếu người dùng thông thường (customer) cố truy cập trang Admin -> Trả về HTTP 403
    res.status(403);
    return res.render('error', {
      layout: 'layouts/client_layout',
      title: '403 - Quyền truy cập bị từ chối',
      statusCode: 403,
      message: 'Bạn không có quyền quản trị hoặc thẩm quyền nhân viên để truy cập khu vực này.',
      details: `Vai trò hiện tại của bạn là '${userRole}'. Chỉ vai trò [${allowedRoles.join(', ')}] mới được phép truy cập.`
    });
  };
}

// 3. Helper chia sẻ dữ liệu toàn cục cho các View EJS
function injectLocals(req, res, next) {
  // Người dùng hiện tại trong session
  res.locals.currentUser = req.session.user || null;

  // Tính tổng số lượng hàng trong giỏ hàng
  let totalCartItems = 0;
  if (req.session.cart && Array.isArray(req.session.cart)) {
    totalCartItems = req.session.cart.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
  }
  res.locals.cartCount = totalCartItems;

  // Flash message
  res.locals.flashSuccess = req.session.flashSuccess || null;
  res.locals.flashError = req.session.flashError || null;
  delete req.session.flashSuccess;
  delete req.session.flashError;

  // Đường dẫn hiện tại để active menu
  res.locals.currentPath = req.path;

  // Hàm định dạng tiền tệ Việt Nam Đồng (VND)
  res.locals.formatVND = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  // Hàm định dạng ngày tháng
  res.locals.formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  next();
}

module.exports = {
  isAuthenticated,
  checkRole,
  injectLocals
};
