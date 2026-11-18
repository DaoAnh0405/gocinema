(() => {
  const form = document.querySelector('[data-seatEditor]');
  if (!form) return;
  const layoutField = form.elements.layout;
  const versionField = form.elements.version;
  const types = JSON.parse(form.querySelector('[data-seat-types]').value);
  const typeById = new Map(types.map((type) => [type.seat_type_id, type]));
  const editableTypes = ['Standard', 'VIP', 'Couple'].map((name) =>
    types.find((type) => type.seat_type_name === name)?.seat_type_id).filter(Boolean);
  const cycle = [...editableTypes, 0];
  const coupleType = types.find((type) => type.seat_type_name === 'Couple')?.seat_type_id;
  const gridElement = form.querySelector('[data-seat-grid]');
  const feedback = form.querySelector('[data-seat-feedback]');
  const saveButton = form.querySelector('button[type="submit"]');
  const generateButton = form.querySelector('[data-generate-seats]');
  const rowInput = form.elements.grid_rows;
  const columnInput = form.elements.grid_columns;
  let layout = JSON.parse(layoutField.value);
  layout.pairs = pairCoupleSeats(layout.cells, coupleType, layout.pairs);
  let dirty = false;
  let saving = false;

  function rowLabel(number) {
    let label = '';
    for (let index = number; index > 0; index = Math.floor((index - 1) / 26)) {
      label = String.fromCharCode(65 + (index - 1) % 26) + label;
    }
    return label;
  }

  function message(text, error = false) {
    feedback.textContent = text;
    feedback.hidden = false;
    feedback.classList.toggle('seat-feedback--error', error);
  }

  function updateSeat(button, row, column) {
    const typeId = layout.cells[row][column];
    const type = typeById.get(typeId);
    const name = type?.seat_type_name || 'Bỏ ghế';
    const key = ['Standard', 'VIP', 'Couple'].includes(name) ? name.toLowerCase() : 'other';
    button.className = `room-seat room-seat--${typeId ? key : 'empty'}`;
    button.textContent = typeId ? String(column + 1) : '+';
    button.setAttribute('aria-label', `${rowLabel(row + 1)}${column + 1} · ${name}`);
    button.title = `${rowLabel(row + 1)}${column + 1} · ${name}`;
  }

  function updateCount() {
    const count = layout.cells.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    const coupleCount = gridElement.querySelectorAll('.room-seat--couple-pair').length;
    form.querySelector('[data-seat-count]').textContent = `${count} chỗ ngồi · ${coupleCount} ghế đôi · ${layout.rows} hàng x ${layout.columns} cột`;
  }

  function render() {
    const pairEnds = new Map(layout.pairs.map(([row, column]) => [`${row}:${column + 1}`, column]));
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < layout.rows; row++) {
      const line = document.createElement('div');
      line.className = 'room-seat-row';
      const label = document.createElement('strong');
      label.className = 'room-seat-label';
      label.textContent = rowLabel(row + 1);
      line.append(label);
      for (let column = layout.columns - 1; column >= 0; column--) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.row = row;
        button.dataset.column = column;
        updateSeat(button, row, column);
        if (coupleType && layout.cells[row][column] === coupleType) {
          const pairStart = pairEnds.get(`${row}:${column}`);
          if (pairStart !== undefined) {
            button.dataset.pairColumn = pairStart;
            button.classList.add('room-seat--couple-pair');
            button.textContent = `${column}–${column + 1}`;
            const description = `${rowLabel(row + 1)}${column}–${rowLabel(row + 1)}${column + 1} · Couple`;
            button.setAttribute('aria-label', description);
            button.title = description;
            column--;
          } else {
            button.classList.add('room-seat--couple-single');
            button.title += ' · Chờ ghép với ô Couple liền kề chưa thuộc cặp khác';
          }
        }
        line.append(button);
      }
      line.append(label.cloneNode(true));
      fragment.append(line);
    }
    gridElement.replaceChildren(fragment);
    layoutField.value = JSON.stringify(layout);
    updateCount();
  }

  gridElement.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-row]');
    if (!button || saving) return;
    const row = Number(button.dataset.row);
    const column = Number(button.dataset.column);
    const current = layout.cells[row][column];
    layout.cells[row][column] = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    if (button.dataset.pairColumn !== undefined) {
      layout.cells[row][Number(button.dataset.pairColumn)] = layout.cells[row][column];
    }
    layout.pairs = pairCoupleSeats(layout.cells, coupleType, layout.pairs);
    render();
    const focusButton = [...gridElement.querySelectorAll('button[data-row]')].find((seat) =>
      Number(seat.dataset.row) === row &&
      (Number(seat.dataset.column) === column || Number(seat.dataset.pairColumn) === column));
    focusButton?.focus({ preventScroll: true });
    dirty = true;
    const waiting = focusButton?.classList.contains('room-seat--couple-single');
    message(waiting
      ? `${rowLabel(row + 1)}${column + 1} chờ ghép với ô Couple liền kề chưa thuộc cặp khác. Thay đổi chưa được lưu.`
      : 'Sơ đồ có thay đổi chưa lưu. Các cặp ghế đã ghép được giữ cố định.');
  });

  generateButton.addEventListener('click', () => {
    if (saving || !rowInput.reportValidity() || !columnInput.reportValidity()) return;
    const type = Number(form.elements.default_type.value);
    if (!editableTypes.includes(type)) return message('Chọn loại ghế mặc định.', true);
    layout = { rows: Number(rowInput.value), columns: Number(columnInput.value) };
    layout.cells = Array.from({ length: layout.rows }, () => Array(layout.columns).fill(type));
    layout.pairs = pairCoupleSeats(layout.cells, coupleType);
    render();
    dirty = true;
    message('Đã sinh sơ đồ. Bấm Lưu sơ đồ để lưu thay đổi.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    if (Number(rowInput.value) !== layout.rows || Number(columnInput.value) !== layout.columns) {
      return message('Bấm Sinh sơ đồ để áp dụng số hàng và số cột vừa nhập.', true);
    }
    saving = true;
    saveButton.disabled = true;
    generateButton.disabled = true;
    gridElement.setAttribute('aria-busy', 'true');
    try {
      const body = new URLSearchParams({ _csrf: form.elements._csrf.value, version: versionField.value, layout: JSON.stringify(layout) });
      const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Phiên làm việc đã hết hạn hoặc máy chủ chưa phản hồi. Hãy tải lại trang.');
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Không thể lưu sơ đồ ghế.');
      versionField.value = result.version;
      dirty = false;
      message(result.message);
    } catch (error) {
      message(error.message || 'Không kết nối được máy chủ. Vui lòng thử lại.', true);
    } finally {
      saving = false;
      saveButton.disabled = false;
      generateButton.disabled = false;
      gridElement.removeAttribute('aria-busy');
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (dirty) event.preventDefault();
  });
  render();
})();
