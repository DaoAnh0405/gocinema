(() => {
  'use strict';

  const catalog = document.querySelector('.gc-dash--admin .gc-catalog');
  if (!catalog) return;

  const dialog = catalog.querySelector('[data-delete-dialog]');
  const approvedForms = new WeakSet();
  const initialPosters = new WeakMap();
  let pendingDelete = null;

  catalog.querySelectorAll('[data-poster-field]').forEach((field) => {
    const preview = field.querySelector('[data-poster-preview]');
    initialPosters.set(field, preview && !preview.hidden ? preview.getAttribute('src') : '');
  });

  function restorePoster(field) {
    const preview = field.querySelector('[data-poster-preview]');
    const placeholder = field.querySelector('[data-poster-placeholder]');
    const original = initialPosters.get(field);
    if (original) preview.src = original;
    preview.hidden = !original;
    placeholder.hidden = Boolean(original);
  }

  function setGenreEditing(row, editing) {
    row.querySelectorAll('[data-genre-display]').forEach((element) => { element.hidden = editing; });
    row.querySelectorAll('[data-genre-editor]').forEach((element) => { element.hidden = !editing; });
    const editButton = row.querySelector('[data-edit-genre]');
    editButton.hidden = editing;
    editButton.setAttribute('aria-expanded', String(editing));
    const input = row.querySelector('input[name="genre_name"]');
    if (editing) {
      input.focus();
      input.select();
    } else {
      input.value = input.dataset.originalValue;
      input.classList.remove('is-invalid');
      input.setAttribute('aria-invalid', 'false');
      input.removeAttribute('aria-describedby');
      row.querySelectorAll('.gc-catalog__field-error').forEach((element) => { element.hidden = true; });
      editButton.focus();
    }
  }

  function submitConfirmed(form, submitter) {
    // requestSubmit dispatches submit again; allow exactly that confirmed submission.
    approvedForms.add(form);
    try {
      if (typeof form.requestSubmit === 'function') {
        if (submitter && submitter.form === form && !submitter.disabled) form.requestSubmit(submitter);
        else form.requestSubmit();
      } else if (form.checkValidity()) {
        HTMLFormElement.prototype.submit.call(form);
      } else if (typeof form.reportValidity === 'function') {
        form.reportValidity();
      }
    } finally {
      approvedForms.delete(form);
    }
  }

  catalog.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-confirm-delete]')) return;
    if (approvedForms.has(form)) {
      approvedForms.delete(form);
      return;
    }
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (pendingDelete) return;

    const message = form.dataset.confirmMessage || 'Bạn có chắc muốn xóa mục này?';
    const submitter = event.submitter || null;
    if (!dialog || typeof dialog.showModal !== 'function') {
      if (window.confirm(message)) submitConfirmed(form, submitter);
      return;
    }
    dialog.querySelector('[data-dialog-message]').textContent = message;
    pendingDelete = { form, submitter };
    dialog.showModal();
  });

  catalog.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const editButton = event.target.closest('[data-edit-genre]');
    if (editButton) {
      setGenreEditing(editButton.closest('[data-genre-row]'), true);
      return;
    }
    const cancelEdit = event.target.closest('[data-cancel-genre]');
    if (cancelEdit) {
      setGenreEditing(cancelEdit.closest('[data-genre-row]'), false);
      return;
    }
    if (event.target.closest('[data-dialog-cancel]')) {
      dialog.close();
      return;
    }
    if (event.target.closest('[data-dialog-confirm]') && pendingDelete) {
      const { form, submitter } = pendingDelete;
      pendingDelete = null;
      dialog.close();
      submitConfirmed(form, submitter);
    }
  });

  if (dialog) {
    dialog.addEventListener('close', () => {
      const trigger = pendingDelete && pendingDelete.submitter;
      pendingDelete = null;
      if (trigger && trigger.isConnected) trigger.focus();
    });
  }

  catalog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !(event.target instanceof Element)) return;
    const row = event.target.closest('[data-genre-row]');
    if (row && !row.querySelector('[data-edit-genre]').hidden) return;
    if (row) {
      event.preventDefault();
      setGenreEditing(row, false);
    }
  });

  catalog.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.matches('input[name="genre_ids[]"]')) {
      const picker = input.closest('[data-genre-picker]');
      if (!picker) return;
      const count = picker.querySelectorAll('input[type="checkbox"]:checked').length;
      picker.querySelector('[data-genre-summary]').textContent = count ? `Đã chọn ${count} thể loại` : 'Chọn thể loại';
      return;
    }
    if (!input.matches('[data-poster-input]')) return;

    const field = input.closest('[data-poster-field]');
    const error = field.querySelector('[data-poster-error]');
    const serverError = field.querySelector('#error-poster');
    const file = input.files && input.files[0];
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
    input.classList.remove('is-invalid');
    error.hidden = true;
    error.textContent = '';
    if (serverError) serverError.hidden = true;
    restorePoster(field);
    if (!file) return;

    function showError(message) {
      input.setCustomValidity(message);
      input.setAttribute('aria-invalid', 'true');
      input.classList.add('is-invalid');
      error.textContent = message;
      error.hidden = false;
      restorePoster(field);
    }

    if (!/\.jpe?g$/i.test(file.name) || (file.type && file.type !== 'image/jpeg')) {
      showError('Vui lòng chọn ảnh JPG hoặc JPEG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError('Poster không được vượt quá 5 MB.');
      return;
    }
    if (file.size === 0) {
      showError('Tệp ảnh trống. Vui lòng chọn ảnh khác.');
      return;
    }
    if (typeof FileReader !== 'function') return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (input.files[0] !== file || typeof reader.result !== 'string') return;
      const preview = field.querySelector('[data-poster-preview]');
      preview.src = reader.result;
      preview.hidden = false;
      field.querySelector('[data-poster-placeholder]').hidden = true;
    });
    reader.addEventListener('error', () => {
      if (input.files[0] === file) showError('Không thể đọc ảnh. Vui lòng chọn lại tệp.');
    });
    reader.readAsDataURL(file);
  });

  const summary = catalog.querySelector('[data-error-summary]');
  if (summary) {
    summary.focus();
    const editingInput = catalog.querySelector('[data-genre-editor]:not([hidden]) input');
    if (editingInput) editingInput.focus();
  }
})();
