(() => {
  'use strict';

  const field = document.querySelector('[data-food-image-field]');
  if (!field) return;

  const input = field.querySelector('[data-food-image-input]');
  const preview = field.querySelector('[data-food-image-preview]');
  const placeholder = field.querySelector('[data-food-image-placeholder]');
  const error = field.querySelector('[data-food-image-error]');
  const serverError = field.querySelector('#error-image');
  const original = preview && !preview.hidden ? preview.getAttribute('src') : '';
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 5 * 1024 * 1024;

  function showOriginal() {
    if (original) preview.src = original;
    preview.hidden = !original;
    placeholder.hidden = Boolean(original);
  }

  function fail(message) {
    input.setCustomValidity(message);
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
    showOriginal();
  }

  input.addEventListener('change', () => {
    input.setCustomValidity('');
    input.classList.remove('is-invalid');
    input.setAttribute('aria-invalid', 'false');
    error.hidden = true;
    error.textContent = '';
    if (serverError) serverError.hidden = true;
    showOriginal();

    const file = input.files && input.files[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      fail('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size === 0) { fail('Tệp ảnh trống. Vui lòng chọn ảnh khác.'); return; }
    if (file.size > MAX_BYTES) { fail('Ảnh không được vượt quá 5 MB.'); return; }
    if (typeof FileReader !== 'function') return;

    // dùng data url
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (input.files[0] !== file || typeof reader.result !== 'string') return;
      preview.src = reader.result;
      preview.hidden = false;
      placeholder.hidden = true;
    });
    reader.addEventListener('error', () => {
      if (input.files[0] === file) fail('Không thể đọc ảnh. Vui lòng chọn lại tệp.');
    });
    reader.readAsDataURL(file);
  });
})();