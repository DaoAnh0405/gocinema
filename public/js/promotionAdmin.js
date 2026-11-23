(() => {
  'use strict';

  const page = document.querySelector('[data-promo-page]');
  if (!page) return;

  const dialog = page.querySelector('[data-promo-dialog]');
  const form = page.querySelector('[data-promo-form]');
  if (!dialog || !form) return;

  const title = dialog.querySelector('[data-promo-title]');
  const statusField = dialog.querySelector('[data-promo-status-field]');
  const typeSelect = form.elements.discount_type;
  const valueInput = form.elements.discount_value;
  const maxInput = form.elements.max_discount;
  const maxField = dialog.querySelector('[data-promo-max-field]');
  const startInput = form.elements.start_date;
  const endInput = form.elements.end_date;
  const MAX_MONEY = 100000000;
  const FIELDS = [
    'promo_code', 'promotion_name', 'description', 'discount_type', 'discount_value',
    'max_discount', 'min_order_value', 'start_date', 'end_date', 'quantity', 'status',
  ];

  // giảm tối đa chỉ dùng cho loại phần trăm input bị disabled thì không gửi lên (server lưu NULL)
  function syncType() {
    const percent = typeSelect.value === 'PERCENT';
    valueInput.max = percent ? '100' : String(MAX_MONEY);
    maxInput.disabled = !percent;
    maxField.classList.toggle('gc-promo__field--muted', !percent);
  }

  function checkRange() {
    endInput.setCustomValidity(
      startInput.value && endInput.value && endInput.value < startInput.value
        ? 'Ngày kết thúc không được trước ngày bắt đầu' : '',
    );
  }

  function clearErrors() {
    dialog.querySelectorAll('[data-promo-errors], .gc-catalog__field-error').forEach((el) => { el.hidden = true; });
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function fill(values) {
    FIELDS.forEach((name) => {
      const input = form.elements[name];
      if (input) input.value = values[name] == null ? '' : String(values[name]);
    });
    syncType();
    checkRange();
  }

  function open(mode, promo) {
    clearErrors();
    const editing = mode === 'edit';
    title.textContent = editing ? 'Sửa mã khuyến mãi' : 'Tạo mã khuyến mãi mới';
    statusField.hidden = !editing;
    form.elements.status.disabled = !editing;
    form.action = editing ? `/admin/promotions/${promo.id}/update` : '/admin/promotions';
    fill(editing ? promo : {
      discount_type: 'PERCENT', min_order_value: '0', status: '1',
    });
    dialog.showModal();
    form.elements.promo_code.focus();
  }

  page.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-promo-create]')) {
      open('create');
      return;
    }
    const edit = event.target.closest('[data-promo-edit]');
    if (edit) {
      try {
        open('edit', JSON.parse(edit.dataset.promo));
      } catch (err) {
        console.error('Dữ liệu khuyến mãi không hợp lệ', err);
      }
      return;
    }
    if (event.target.closest('[data-promo-close]')) dialog.close();
  });

  // bấm ra ngoài vùng nội dung thì đóng
  dialog.addEventListener('mousedown', (event) => {
    if (event.target === dialog) dialog.close();
  });

  typeSelect.addEventListener('change', syncType);
  startInput.addEventListener('change', checkRange);
  endInput.addEventListener('change', checkRange);

  syncType();
  checkRange();

  // server trả lại form có lỗi mở lại modal với dữ liệu đã nhập
  if (dialog.dataset.open === 'true' && typeof dialog.showModal === 'function') {
    dialog.showModal();
    const summary = dialog.querySelector('[data-promo-errors]');
    if (summary) summary.focus();
  }
})();