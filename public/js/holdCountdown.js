(function () {
  'use strict';

  // đếm ngược thời gian giữ ghế ở bước đồ ăn và thanh toán
  const root = document.querySelector('[data-seconds-left]');
  const out = document.getElementById('holdCountdown');
  if (root && out) {
    let left = Number(root.dataset.secondsLeft) || 0;
    const back = `${root.dataset.seatsUrl}?expired=1`;
    const paint = () => {
      const s = Math.max(left, 0);
      out.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    paint();
    const timer = setInterval(() => {
      left -= 1;
      paint();
      if (left <= 0) {
        clearInterval(timer);
        window.location.href = back;
      }
    }, 1000);
  }

  // chống bấm đúp form có data-once sẽ khóa nút gửi sau lần gửi đầu
  document.querySelectorAll('form[data-once]').forEach((form) => {
    form.addEventListener('submit', () => {
      setTimeout(() => {
        document.querySelectorAll(`button[form="${form.id}"], #${form.id} button[type="submit"]`)
          .forEach((b) => { b.disabled = true; });
      }, 0);
    });
  });
})();