/**
 * Admin Dashboard Dynamic Interactions & Form Management
 */

// Thêm hàng Biến thể mới trong form Sản phẩm
function initVariantFormManager() {
  const addVariantBtn = document.getElementById('add-variant-row-btn');
  const container = document.getElementById('variant-rows-container');

  if (!addVariantBtn || !container) return;

  addVariantBtn.addEventListener('click', () => {
    const rowId = 'variant-new-' + Date.now();
    const rowHtml = `
      <div id="${rowId}" class="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-4 relative group">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="absolute top-3 right-3 text-rose-500 hover:text-rose-700 text-sm font-medium">
          <i class="fa-solid fa-trash-can mr-1"></i> Xóa
        </button>
        <input type="hidden" name="variant_id[]" value="new">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Tên phiên bản / Màu sắc *</label>
            <input type="text" name="variant_name[]" required placeholder="VD: Màu Đen Nhám" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Mã SKU *</label>
            <input type="text" name="variant_sku[]" required placeholder="VD: SONY-XM5-BLK" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Giá bán (VNĐ) *</label>
            <input type="number" name="variant_price[]" required min="0" step="1000" placeholder="7690000" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Số lượng trong kho *</label>
            <input type="number" name="variant_stock[]" required min="0" value="10" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
          </div>
        </div>
        <div class="mt-3">
          <label class="block text-xs font-semibold text-slate-700 mb-1">URL Ảnh riêng của phiên bản (Tùy chọn)</label>
          <input type="url" name="variant_image[]" placeholder="https://..." class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHtml);
  });
}

// Thêm thông số kỹ thuật (Specifications key-value)
function initSpecificationManager() {
  const addSpecBtn = document.getElementById('add-spec-row-btn');
  const specContainer = document.getElementById('spec-rows-container');

  if (!addSpecBtn || !specContainer) return;

  addSpecBtn.addEventListener('click', () => {
    const rowId = 'spec-row-' + Date.now();
    const rowHtml = `
      <div id="${rowId}" class="flex items-center gap-3 mb-3">
        <input type="text" name="spec_keys[]" placeholder="Tên thông số (VD: Cổng sạc)" class="w-1/3 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
        <input type="text" name="spec_values[]" placeholder="Giá trị (VD: Type-C PD 65W)" class="w-2/3 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-2 text-rose-500 hover:text-rose-700">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
    specContainer.insertAdjacentHTML('beforeend', rowHtml);
  });
}

// Cảnh báo tự động hóa khi quản trị viên chọn đổi trạng thái đơn hàng
function initOrderStatusWarning() {
  const statusSelect = document.getElementById('admin-order-status-select');
  const warningBox = document.getElementById('status-automation-warning');

  if (!statusSelect || !warningBox) return;

  statusSelect.addEventListener('change', function () {
    const val = this.value;
    warningBox.classList.remove('hidden', 'bg-amber-50', 'text-amber-800', 'border-amber-200', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200', 'bg-rose-50', 'text-rose-800', 'border-rose-200');

    if (val === 'confirmed') {
      warningBox.classList.add('bg-amber-50', 'text-amber-800', 'border', 'border-amber-200');
      warningBox.innerHTML = `
        <div class="flex items-start gap-2">
          <i class="fa-solid fa-triangle-exclamation mt-0.5 text-amber-600"></i>
          <div>
            <strong>Lưu ý nghiệp vụ:</strong> Khi chuyển sang <b>"Đã xác nhận"</b>, hệ thống sẽ tự động trừ số lượng tồn kho của các biến thể tương ứng trong kho hàng.
          </div>
        </div>
      `;
    } else if (val === 'completed') {
      warningBox.classList.add('bg-emerald-50', 'text-emerald-800', 'border', 'border-emerald-200');
      warningBox.innerHTML = `
        <div class="flex items-start gap-2">
          <i class="fa-solid fa-shield-check mt-0.5 text-emerald-600"></i>
          <div>
            <strong>Kích hoạt bảo hành:</strong> Khi chuyển sang <b>"Đã hoàn thành"</b>, hệ thống sẽ tự động sinh mã Serial Number (SN-XXXXXX) duy nhất cho từng sản phẩm và kích hoạt bảo hành điện tử chính hãng.
          </div>
        </div>
      `;
    } else if (val === 'cancelled') {
      warningBox.classList.add('bg-rose-50', 'text-rose-800', 'border', 'border-rose-200');
      warningBox.innerHTML = `
        <div class="flex items-start gap-2">
          <i class="fa-solid fa-rotate-left mt-0.5 text-rose-600"></i>
          <div>
            <strong>Hoàn tồn kho:</strong> Nếu đơn hàng này trước đó đã được xác nhận, hệ thống sẽ tự động cộng hoàn lại số lượng tồn kho.
          </div>
        </div>
      `;
    } else {
      warningBox.classList.add('hidden');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initVariantFormManager();
  initSpecificationManager();
  initOrderStatusWarning();
});
