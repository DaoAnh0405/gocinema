(function () {
  'use strict';

  document.querySelectorAll('[data-more-group]').forEach((group) => {
    const btn = group.querySelector('[data-more-btn]');
    if (!btn) return;
    const step = Number(group.dataset.step) || 8;

    btn.addEventListener('click', () => {
      // Hiện thêm tối đa `step` phim đang ẩn
      group.querySelectorAll('.gc-more-item[hidden]').forEach((item, i) => {
        if (i < step) item.hidden = false;
      });
      // Hết phim để hiện thì ẩn luôn nút
      if (!group.querySelector('.gc-more-item[hidden]')) btn.parentElement.hidden = true;
    });
  });
})();