(() => {
  'use strict';

  const page = document.querySelector('.gc-showtimes');
  if (!page) return;

  const editor = page.querySelector('[data-showtimes-editor]');
  const form = page.querySelector('[data-showtimes-form]');
  const summary = page.querySelector('[data-showtimes-errors]');

  if (form) {
    const cinema = form.elements.namedItem('cinema_id');
    const room = form.elements.namedItem('room_id');
    const format = form.elements.namedItem('screen_format');
    const hint = form.querySelector('[data-showtimes-room-help]');
    const roomOptions = Array.from(room.options).filter((option) => option.dataset.cinemaId);
    const unavailable = new WeakSet(roomOptions.filter((option) => option.disabled));
    const originalHint = hint.textContent;
    room.setAttribute('aria-describedby', [room.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));

    function updateRooms(resetSelection) {
      const activeCinema = cinema.value && !cinema.selectedOptions[0].disabled;
      roomOptions.forEach((option) => {
        const matches = activeCinema && option.dataset.cinemaId === cinema.value;
        option.hidden = !matches;
        option.disabled = !matches || unavailable.has(option);
      });
      // Preserve the server-rendered selection on errors, even if it is now unavailable.
      if (resetSelection && room.selectedOptions[0] && room.selectedOptions[0].disabled) room.value = '';
      const availableCount = roomOptions.filter((option) => !option.disabled).length;
      room.options[0].textContent = !activeCinema ? 'Chọn rạp trước' : availableCount ? 'Chọn phòng' : 'Không có phòng khả dụng';
      hint.textContent = !activeCinema ? 'Vui lòng chọn rạp trước khi chọn phòng.' : !availableCount ? 'Rạp này không có phòng đang hoạt động và có ghế.' : originalHint;
    }

    function updateFormat() {
      const selected = room.selectedOptions[0];
      if (!selected || selected.disabled || !selected.value) return;
      const roomType = (selected.dataset.roomType || '').trim().toUpperCase();
      if (Array.from(format.options).some((option) => option.value === roomType)) {
        format.value = roomType;
      }
    }

    cinema.addEventListener('change', () => {
      updateRooms(true);
      updateFormat();
    });
    room.addEventListener('change', updateFormat);
    updateRooms(false);
  }

  if (editor && editor.open && typeof editor.showModal === 'function') {
    editor.close();
    try {
      editor.showModal();
    } catch {
      // Keep the GET-rendered form usable when modal dialogs are unavailable.
      editor.setAttribute('open', '');
    }
    editor.addEventListener('cancel', (event) => {
      const cancel = editor.querySelector('[data-showtimes-close]');
      if (!cancel) return;
      event.preventDefault();
      window.location.assign(cancel.href);
    });
  }

  page.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.closest('[data-showtimes-status]')) return;
    select.classList.toggle('gc-showtimes__status--active', select.value === '1');
    select.classList.toggle('gc-showtimes__status--inactive', select.value !== '1');
  });

  page.addEventListener('submit', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement) || event.defaultPrevented) return;
    if (target.matches('[data-showtimes-delete]')) {
      if (!window.confirm(target.dataset.confirmMessage || 'Bạn có chắc muốn xóa suất chiếu này?')) event.preventDefault();
      return;
    }
    if (!target.matches('[data-showtimes-status]')) return;
    const status = target.elements.namedItem('status');
    if (status.value !== '-1' || status.dataset.originalStatus === '-1') return;
    const message = `Hủy suất chiếu “${target.dataset.showtimeTitle}”? Suất chiếu đã có vé có thể không được phép hủy.`;
    if (!window.confirm(message)) event.preventDefault();
  });

  if (summary) summary.focus();
})();
