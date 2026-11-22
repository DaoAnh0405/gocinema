(() => {
  const dialog = document.querySelector('[data-showtime-dialog]');
  if (dialog && dialog.dataset.open === 'true') {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  const form = document.querySelector('[data-showtime-form]');
  if (form) {
    const cinema = form.querySelector('[data-cinema-select]');
    const room = form.querySelector('[data-room-select]');
    const format = form.querySelector('#showtime-format');
    const hint = form.querySelector('[data-room-hint]');
    let requestId = 0;

    const setRooms = (rooms, selectedId = '') => {
      room.replaceChildren(new Option('Chọn phòng chiếu', ''));
      rooms.forEach((item) => {
        const option = new Option(`${item.room_name} · ${item.room_type} · ${item.seat_count} ghế`, item.room_id);
        option.dataset.format = item.room_type || '';
        option.selected = String(item.room_id) === String(selectedId);
        room.add(option);
      });
      room.disabled = rooms.length === 0;
      if (hint) hint.textContent = rooms.length ? 'Định dạng chiếu sẽ theo loại phòng đã chọn.' : 'Rạp này chưa có phòng đang hoạt động.';
      if (room.value) syncFormat();
    };

    const syncFormat = () => {
      const selected = room.options[room.selectedIndex];
      const roomFormat = selected && selected.dataset.format;
      if (roomFormat && Array.from(format.options).some((option) => option.value === roomFormat)) format.value = roomFormat;
    };

    const loadRooms = async (cinemaId, selectedId = '') => {
      const currentRequest = ++requestId;
      if (!cinemaId) {
        setRooms([]);
        return;
      }
      room.disabled = true;
      if (hint) hint.textContent = 'Đang tải phòng chiếu…';
      try {
        const url = new URL(form.dataset.roomsUrl, window.location.origin);
        url.searchParams.set('cinemaId', cinemaId);
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('rooms');
        const data = await response.json();
        if (currentRequest === requestId) setRooms(Array.isArray(data.rooms) ? data.rooms : [], selectedId);
      } catch {
        if (currentRequest === requestId) {
          setRooms([]);
          if (hint) hint.textContent = 'Không tải được phòng chiếu. Hãy thử chọn lại rạp.';
        }
      }
    };

    cinema.addEventListener('change', () => loadRooms(cinema.value));
    room.addEventListener('change', syncFormat);
    form.addEventListener('submit', (event) => {
      if (!form.reportValidity()) event.preventDefault();
    });

    if (cinema.value && !room.options.length) loadRooms(cinema.value);
  }

  document.querySelectorAll('[data-status-confirm], [data-delete-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const message = form.dataset.confirmMessage || 'Bạn có chắc muốn thực hiện thao tác này?';
      if (!window.confirm(message)) event.preventDefault();
    });
  });
})();
