(() => {
  'use strict';

  const dialog = document.querySelector('[data-order-cancel-dialog]');
  const opener = document.querySelector('[data-order-cancel-open]');
  if (!dialog || !opener) return;

  opener.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const reason = dialog.querySelector('textarea');
    if (reason) reason.focus();
  });

  dialog.querySelector('[data-order-cancel-close]').addEventListener('click', () => dialog.close());

  // bấm ra ngoài hộp thoại để đóng
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // chống bấm đúp khi đang gửi
  dialog.querySelector('form').addEventListener('submit', (event) => {
    const button = event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
  });
})();