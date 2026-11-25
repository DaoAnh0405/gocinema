(() => {
  'use strict';

  const page = document.querySelector('[data-acc-page]');
  if (!page) return;

  // hộp xác nhận dùng chung với adminCatalog.js đổi tiêu đề và nhãn nút theo từng form (khóa / mở khóa)
  const confirmDialog = page.querySelector('[data-delete-dialog]');
  page.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-confirm-delete]') || !confirmDialog) return;
    const title = confirmDialog.querySelector('[data-dialog-title]');
    const confirmButton = confirmDialog.querySelector('[data-dialog-confirm]');
    if (title) title.textContent = form.dataset.confirmTitle || 'Xác nhận';
    if (confirmButton) confirmButton.textContent = form.dataset.confirmLabel || 'Xác nhận';
  }, true);

  const dialog = page.querySelector('[data-acc-dialog]');
  const form = page.querySelector('[data-acc-form]');
  if (!dialog || !form) return;

  const title = dialog.querySelector('[data-acc-title]');
  const emailHint = dialog.querySelector('[data-acc-email-hint]');
  const FIELDS = ['full_name', 'email', 'phone', 'position', 'cinema_id'];

  function clearErrors() {
    dialog.querySelectorAll('[data-acc-errors], .gc-catalog__field-error').forEach((el) => { el.hidden = true; });
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function fill(values) {
    FIELDS.forEach((name) => {
      const input = form.elements[name];
      if (input) input.value = values[name] == null ? '' : String(values[name]);
    });
  }

  function open(mode, account) {
    clearErrors();
    const editing = mode === 'edit';
    title.textContent = editing ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới';
    form.elements.email.readOnly = editing;
    if (emailHint) emailHint.hidden = editing;
    form.action = editing ? `/admin/accounts/${account.id}/update` : '/admin/accounts';
    fill(editing ? account : {});
    dialog.showModal();
    form.elements.full_name.focus();
  }

  page.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-acc-create]')) {
      open('create');
      return;
    }
    const edit = event.target.closest('[data-acc-edit]');
    if (edit) {
      try {
        open('edit', JSON.parse(edit.dataset.acc));
      } catch (err) {
        console.error('Dữ liệu nhân viên không hợp lệ', err);
      }
      return;
    }
    if (event.target.closest('[data-acc-close]')) dialog.close();
  });

  dialog.addEventListener('mousedown', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // server trả lại form có lỗi mở lại modal với dữ liệu đã nhập
  if (dialog.dataset.open === 'true' && typeof dialog.showModal === 'function') {
    dialog.showModal();
    const summary = dialog.querySelector('[data-acc-errors]');
    if (summary) summary.focus();
  }
})();