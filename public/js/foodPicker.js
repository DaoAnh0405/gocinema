(function () {
  'use strict';

  const root = document.getElementById('foodApp');
  if (!root) return;

  const ticketSubtotal = Number(root.dataset.ticketSubtotal) || 0;
  const boxes = [...root.querySelectorAll('.gc-qty')];
  const lines = document.getElementById('sumFoods');
  const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;

  function update() {
    let foodTotal = 0;
    lines.replaceChildren();
    boxes.forEach((box) => {
      const input = box.querySelector('input');
      const max = Number(input.max) || 10;
      const qty = Math.min(Math.max(parseInt(input.value, 10) || 0, 0), max);
      input.value = qty;
      if (!qty) return;
      const lineTotal = qty * Number(box.dataset.price);
      foodTotal += lineTotal;
      const row = document.createElement('div');
      row.className = 'gc-sum__line';
      const left = document.createElement('span');
      left.textContent = `${qty}x ${box.dataset.name}`;
      const right = document.createElement('span');
      right.textContent = money(lineTotal);
      row.append(left, right);
      lines.appendChild(row);
    });
    document.getElementById('sumTotal').textContent = money(ticketSubtotal + foodTotal);
  }

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-qty]');
    if (!btn) return;
    const input = btn.parentElement.querySelector('input');
    input.value = (parseInt(input.value, 10) || 0) + Number(btn.dataset.qty);
    update();
  });
  root.addEventListener('input', update);
  update();
})();