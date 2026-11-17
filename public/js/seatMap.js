(function () {
  'use strict';

  const root = document.getElementById('seatApp');
  if (!root) return;

  const maxSeats = Number(root.dataset.maxSeats) || 8;
  const nextUrl = root.dataset.nextUrl;
  const apiBase = `/api/showtimes/${encodeURIComponent(root.dataset.showtimeId)}`;
  const $ = (id) => document.getElementById(id);
  const ui = {
    grid: $('seatGrid'), legend: $('seatLegend'), alert: $('seatAlert'),
    seatsRow: $('sumSeatsRow'), seatsText: $('sumSeatsText'), seatsPrice: $('sumSeatsPrice'), total: $('sumTotal'),
    badge: $('holdBadge'), timer: $('holdTimer'), next: $('btnNext'), back: $('btnBack'),
  };

  let rows = [];
  let seats = new Map();
  const selected = new Set();
  let myHold = null;
  let secondsLeft = 0;
  let tick = null;
  let initialized = false;
  let busy = false;
  let alertTimer = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;
  const label = (s) => `${s.row}${s.number}`;
  const byLabel = (a, b) => a.row.localeCompare(b.row) || a.number - b.number;

  function showAlert(type, message) {
    ui.alert.className = `alert alert-${type} mt-3`;
    ui.alert.textContent = message;
    clearTimeout(alertTimer);
    if (type !== 'danger') alertTimer = setTimeout(() => ui.alert.classList.add('d-none'), 6000);
  }

  async function api(path, options = {}) {
    const res = await fetch(apiBase + path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.redirected && res.url.includes('/login')) {
      window.location.href = '/login';
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const body = isJson ? await res.json() : {};
    if (!res.ok) throw new Error(body.message || body.error || 'Có lỗi xảy ra, vui lòng thử lại.');
    if (!isJson) throw new Error('Phản hồi không hợp lệ từ máy chủ.');
    return body.data;
  }

  const isHeld = () =>
    Boolean(myHold) && myHold.seatIds.length === selected.size && myHold.seatIds.every((id) => selected.has(id));

  function paintTimer() {
    const s = Math.max(secondsLeft, 0);
    ui.timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function setTimer(seconds) {
    clearInterval(tick);
    secondsLeft = seconds || 0;
    ui.badge.classList.toggle('d-none', secondsLeft <= 0);
    paintTimer();
    if (secondsLeft <= 0) return;
    tick = setInterval(() => {
      secondsLeft -= 1;
      paintTimer();
      if (secondsLeft <= 0) {
        clearInterval(tick);
        selected.clear();
        showAlert('warning', 'Đã hết thời gian giữ ghế, vui lòng chọn lại.');
        load().catch(() => {});
      }
    }, 1000);
  }

  function renderLegend() {
    const items = [];
    const add = (cls, text, mark) => {
      const wrap = el('span', 'gc-legend__item');
      wrap.append(el('span', `gc-seat ${cls}`, mark || ''), document.createTextNode(text));
      items.push(wrap);
    };
    add('is-sold', 'Đã bán', '×');
    add('is-selected', 'Đang chọn');

    const typePrice = new Map();
    rows.forEach((r) => r.seats.forEach((s) => { if (!typePrice.has(s.type)) typePrice.set(s.type, s.price); }));
    typePrice.forEach((price, type) => {
      const wrap = el('span', 'gc-legend__item');
      wrap.append(
        el('span', `gc-seat gc-seat--${type.toLowerCase()}`),
        el('strong', '', type),
        document.createTextNode(price !== null ? ` ${money(price)}` : ' —'),
      );
      items.push(wrap);
    });
    ui.legend.replaceChildren(...items);
  }

  function seatButton(seat) {
    const b = document.createElement('button');
    b.type = 'button';
    // gghế người khác đang giữ cũng hiển thị như đã bán (vài phút sau sẽ mở lại)
    const gone = seat.state === 'sold' || seat.state === 'held';
    const blocked = gone || seat.price === null;
    const classes = ['gc-seat', `gc-seat--${String(seat.type).toLowerCase()}`];
    if (selected.has(seat.id)) classes.push('is-selected');
    if (gone) classes.push('is-sold');
    b.className = classes.join(' ');
    b.textContent = gone ? '×' : seat.number;
    b.disabled = blocked;
    b.title = `${label(seat)} · ${seat.type}${seat.price !== null ? ` · ${money(seat.price)}` : ''}`;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(selected.has(seat.id)));
    b.addEventListener('click', () => toggle(seat.id));
    return b;
  }

  function renderSummary() {
    const list = [...selected].map((id) => seats.get(id)).filter(Boolean).sort(byLabel);
    const total = list.reduce((sum, s) => sum + (s.price || 0), 0);
    ui.seatsRow.classList.toggle('d-none', list.length === 0);
    ui.seatsText.textContent = `${list.length} Ghế đã chọn - ${list.map(label).join(', ')}`;
    ui.seatsPrice.textContent = money(total);
    ui.total.textContent = money(total);
    ui.next.disabled = busy || list.length === 0;
  }

  function render() {
    ui.grid.replaceChildren();
    rows.forEach((r) => {
      const rowEl = el('div', 'gc-seatrow');
      rowEl.appendChild(el('span', 'gc-seatrow__label', r.row));
      
      [...r.seats].reverse().forEach((s) => rowEl.appendChild(seatButton(seats.get(s.id))));
      rowEl.appendChild(el('span', 'gc-seatrow__label', r.row));
      ui.grid.appendChild(rowEl);
    });
    renderLegend();
    renderSummary();
  }

  function toggle(id) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      if (selected.size >= maxSeats) {
        showAlert('warning', `Chỉ được chọn tối đa ${maxSeats} ghế cho một đơn.`);
        return;
      }
      selected.add(id);
    }
    render();
  }

  async function load() {
    const data = await api('/seats');
    rows = data.rows;
    seats = new Map();
    rows.forEach((r) => r.seats.forEach((s) => seats.set(s.id, { ...s, row: r.row })));
    myHold = data.myHold;

    if (!initialized) {
      initialized = true;
      if (myHold) myHold.seatIds.forEach((id) => selected.add(id));
    }
    const dropped = [];
    [...selected].forEach((id) => {
      const s = seats.get(id);
      if (!s || (s.state !== 'available' && s.state !== 'mine')) {
        selected.delete(id);
        dropped.push(s ? label(s) : id);
      }
    });
    if (dropped.length) showAlert('warning', `Ghế ${dropped.join(', ')} vừa có người khác chọn.`);
    setTimer(myHold ? myHold.secondsLeft : 0);
    render();
  }

  // tiếp tục giữ ghế rồi sang bước đồ ăn
  ui.next.addEventListener('click', async () => {
    if (busy || !selected.size) return;
    busy = true;
    renderSummary();
    try {
      if (!isHeld()) await api('/hold', { method: 'POST', body: JSON.stringify({ seatIds: [...selected] }) });
      window.location.href = nextUrl;
      return;
    } catch (err) {
      showAlert('danger', err.message);
    }
    busy = false;
    await load().catch(() => {});
  });

  // quay lại nhả ghế đang giữ rồi mới rời trang
  ui.back.addEventListener('click', async (event) => {
    if (!myHold) return;
    event.preventDefault();
    try { await api('/release', { method: 'POST', body: '{}' }); } catch (e) { /* vẫn quay lại */ }
    window.location.href = ui.back.href;
  });

  setInterval(() => {
    if (!document.hidden && !busy) load().catch(() => {});
  }, 15000);

  if (new URLSearchParams(window.location.search).has('expired')) {
    showAlert('warning', 'Đã hết thời gian giữ ghế, vui lòng chọn lại.');
  }
  load().catch((err) => { ui.grid.textContent = err.message; });
})();