/**
 * Client Storefront Dynamic Frontend Interactions
 */

// Định dạng tiền tệ VND
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Khởi tạo logic chọn biến thể động trên trang chi tiết sản phẩm
function initVariantSelector() {
  const variantButtons = document.querySelectorAll('.variant-select-btn');
  if (!variantButtons.length) return;

  const priceDisplay = document.getElementById('product-display-price');
  const stockBadge = document.getElementById('product-stock-badge');
  const skuDisplay = document.getElementById('product-display-sku');
  const variantInput = document.getElementById('selected-variant-id');
  const mainImage = document.getElementById('main-product-image');
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  const buyNowBtn = document.getElementById('buy-now-btn');
  const qtyInput = document.getElementById('product-quantity-input');

  variantButtons.forEach(btn => {
    btn.addEventListener('click', function () {
      // Bỏ active của các nút khác
      variantButtons.forEach(b => {
        b.classList.remove('active', 'border-indigo-600', 'bg-indigo-50', 'text-indigo-700');
        b.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
      });

      // Kích hoạt nút hiện tại
      this.classList.add('active', 'border-indigo-600', 'bg-indigo-50', 'text-indigo-700');
      this.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');

      // Lấy dữ liệu từ data attributes
      const price = parseFloat(this.dataset.price);
      const stock = parseInt(this.dataset.stock, 10);
      const sku = this.dataset.sku;
      const variantId = this.dataset.id;
      const image = this.dataset.image;

      // Cập nhật giá
      if (priceDisplay) {
        priceDisplay.textContent = formatVND(price);
      }

      // Cập nhật SKU
      if (skuDisplay) {
        skuDisplay.textContent = sku;
      }

      // Cập nhật Input Hidden
      if (variantInput) {
        variantInput.value = variantId;
      }

      // Cập nhật Ảnh sản phẩm nếu có
      if (mainImage && image) {
        mainImage.src = image;
      }

      // Cập nhật Trạng thái tồn kho và nút mua
      if (stockBadge) {
        if (stock > 5) {
          stockBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800';
          stockBadge.innerHTML = `<i class="fa-solid fa-circle-check mr-1.5"></i>Còn hàng (${stock} sản phẩm)`;
          if (addToCartBtn) addToCartBtn.disabled = false;
          if (buyNowBtn) buyNowBtn.disabled = false;
          if (qtyInput) {
            qtyInput.max = stock;
            if (parseInt(qtyInput.value, 10) > stock) qtyInput.value = stock;
          }
        } else if (stock > 0) {
          stockBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800';
          stockBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Sắp hết hàng (Chỉ còn ${stock} cái)`;
          if (addToCartBtn) addToCartBtn.disabled = false;
          if (buyNowBtn) buyNowBtn.disabled = false;
          if (qtyInput) {
            qtyInput.max = stock;
            if (parseInt(qtyInput.value, 10) > stock) qtyInput.value = stock;
          }
        } else {
          stockBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800';
          stockBadge.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1.5"></i>Tạm hết hàng`;
          if (addToCartBtn) addToCartBtn.disabled = true;
          if (buyNowBtn) buyNowBtn.disabled = true;
        }
      }
    });
  });
}

// Xử lý nút tăng giảm số lượng
function initQuantityControls() {
  document.querySelectorAll('.qty-btn-minus').forEach(btn => {
    btn.addEventListener('click', function () {
      const input = this.closest('.qty-wrapper').querySelector('.qty-input');
      if (input) {
        let val = parseInt(input.value, 10) || 1;
        if (val > 1) {
          input.value = val - 1;
          const form = input.closest('form');
          if (form && form.classList.contains('cart-update-form')) {
            form.submit();
          }
        }
      }
    });
  });

  document.querySelectorAll('.qty-btn-plus').forEach(btn => {
    btn.addEventListener('click', function () {
      const input = this.closest('.qty-wrapper').querySelector('.qty-input');
      if (input) {
        let val = parseInt(input.value, 10) || 1;
        const max = parseInt(input.max, 10) || 999;
        if (val < max) {
          input.value = val + 1;
          const form = input.closest('form');
          if (form && form.classList.contains('cart-update-form')) {
            form.submit();
          }
        }
      }
    });
  });
}

// Tự động đóng thông báo flash sau 5 giây
function initAutoDismissAlerts() {
  setTimeout(() => {
    const alerts = document.querySelectorAll('.flash-alert-box');
    alerts.forEach(el => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.5s ease-out';
      setTimeout(() => el.remove(), 500);
    });
  }, 5000);
}


// Quản lý dropdown Menu người dùng: Hỗ trợ Click bật/tắt, Click bên ngoài để đóng, và giữ menu ổn định khi rê chuột
function initUserMenuDropdown() {
  const container = document.getElementById('user-menu-container');
  const btn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-menu-dropdown');
  const chevron = document.getElementById('user-menu-chevron');

  if (!btn || !dropdown) return;

  function toggleDropdown(forceState) {
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !dropdown.classList.contains('is-open');
    if (shouldOpen) {
      dropdown.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      if (chevron) chevron.classList.add('rotate-180');
    } else {
      dropdown.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (chevron) chevron.classList.remove('rotate-180');
    }
  }

  // Click vào avatar/tên người dùng để mở hoặc đóng
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Click bất kỳ đâu bên ngoài menu để đóng lại
  document.addEventListener('click', (e) => {
    if (container && !container.contains(e.target)) {
      toggleDropdown(false);
    }
  });

  // Đóng khi nhấn phím Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleDropdown(false);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
    initUserMenuDropdown();
initVariantSelector();
  initQuantityControls();
  initAutoDismissAlerts();
});
