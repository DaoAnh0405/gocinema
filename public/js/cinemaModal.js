(function () {
  'use strict';

  const modal = document.getElementById('cinemaModal');
  if (!modal) return;

  const select = document.getElementById('cinemaCity');
  const list = document.getElementById('cinemaList');
  const note = document.getElementById('cinemaNote');
  let groups = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function showNote(text, retry) {
    note.replaceChildren(document.createTextNode(text));
    if (retry) {
      const btn = el('button', 'btn btn-link btn-sm p-0 ms-2', 'Thử lại');
      btn.type = 'button';
      btn.addEventListener('click', load);
      note.appendChild(btn);
    }
    note.hidden = false;
  }

  function renderList() {
    const group = groups[Number(select.value)];
    list.replaceChildren();
    if (!group || !group.cinemas.length) {
      showNote('Khu vực này chưa có rạp.');
      return;
    }
    note.hidden = true;
    for (const c of group.cinemas) {
      const li = el('li');
      const a = el('a', 'gc-cinema-item');
      a.href = `/cinemas/${c.id}`;

      const logo = el('span', 'gc-cinema-item__logo');
      const img = el('img');
      img.src = '/images/favicon.png';
      img.alt = '';
      img.width = 40;
      img.height = 40;
      logo.appendChild(img);

      const body = el('span', 'gc-cinema-item__body');
      body.appendChild(el('span', 'gc-cinema-item__name d-block', c.name));
      const addr = el('span', 'gc-cinema-item__addr d-block', c.address || '');
      addr.title = c.address || '';
      body.appendChild(addr);

      a.append(logo, body);
      if (c.ticketing) a.appendChild(el('span', 'gc-cinema-badge', 'Bán vé'));
      li.appendChild(a);
      list.appendChild(li);
    }
  }

  async function load() {
    showNote('Đang tải danh sách rạp...');
    try {
      const res = await fetch('/api/cinemas', { headers: { Accept: 'application/json' } });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error('bad response');
      groups = body.data;
    } catch (_) {
      groups = null;
      showNote('Không tải được danh sách rạp.', true);
      return;
    }
    if (!groups.length) {
      select.hidden = true;
      showNote('Hiện chưa có rạp nào đang hoạt động.');
      return;
    }
    select.replaceChildren(...groups.map((g, i) => {
      const opt = el('option', '', g.city);
      opt.value = String(i);
      return opt;
    }));
    select.hidden = false;
    renderList();
  }

  select.addEventListener('change', renderList);
  modal.addEventListener('show.bs.modal', () => { if (!groups) load(); });
})();