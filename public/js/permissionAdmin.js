(() => {
  'use strict';

  const page = document.querySelector('[data-perm-page]');
  if (!page) return;

  const form = page.querySelector('[data-perm-form]');
  const counter = page.querySelector('[data-perm-count]');
  const boxes = [...form.querySelectorAll('input[type="checkbox"][name="permissions"]')];

  const changed = () => boxes.filter((box) => box.checked !== (box.dataset.initial === '1')).length;

  function render() {
    const total = changed();
    counter.textContent = total ? `Đã thay đổi ${total} quyền` : 'Chưa có thay đổi';
    boxes.forEach((box) => {
      box.closest('td').classList.toggle('gc-perm__cell--changed', box.checked !== (box.dataset.initial === '1'));
    });
  }

  form.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'permissions') render();
  });

  page.querySelector('[data-perm-undo]').addEventListener('click', () => {
    boxes.forEach((box) => { box.checked = box.dataset.initial === '1'; });
    render();
  });

  render();
})();