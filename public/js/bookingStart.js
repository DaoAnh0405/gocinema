(function () {
  'use strict';

  const root = document.getElementById('startApp');
  if (!root) return;

  // Mở từ trang chi tiết phim: phim được chọn sẵn, nhưng vẫn đổi được
  const preset = root.dataset.lockedId ? {
    id: Number(root.dataset.lockedId),
    title: root.dataset.lockedTitle,
    posterUrl: root.dataset.lockedPoster || null,
    ageRating: root.dataset.lockedAge || 'P',
  } : null;
  const presetCinemaIds = new Set((root.dataset.cinemaIds || '').split(',').filter(Boolean).map(Number));
  const $ = (id) => document.getElementById(id);
  const ui = {
    cities: $('cityList'), movies: $('movieGrid'), moviePanel: $('moviePanel'), movieTitle: $('moviePanelTitle'),
    prev: $('moviePrev'), next: $('movieNext'), dates: $('dateTabs'), times: $('timeList'),
    poster: $('sumPoster'), title: $('sumTitle'), format: $('sumFormat'), show: $('sumShow'), btn: $('btnNext'),
  };
  const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const state = {
    groups: [], city: null, movies: [],
    movie: preset ? { ...preset, cinemas: [] } : null,
    shows: [], date: null, showtime: null,
  };
  const moviesCache = new Map();

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const hint = (box, text) => box.replaceChildren(el('p', 'text-muted small mb-0 p-2', text));
  const parseDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { dd: String(d).padStart(2, '0'), mm: String(m).padStart(2, '0'), yyyy: y, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
  };

  async function getJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Không tải được dữ liệu, vui lòng thử lại.');
    return body.data;
  }

  // ----- Thẻ tóm tắt phía trên -----
  function renderSummary() {
    const { movie, showtime } = state;
    ui.title.textContent = movie ? movie.title : 'Tên phim';
    ui.poster.replaceChildren();
    if (movie && movie.posterUrl) {
      const img = el('img');
      img.src = movie.posterUrl;
      img.alt = `Poster ${movie.title}`;
      ui.poster.appendChild(img);
    } else {
      ui.poster.appendChild(el('i', 'bi bi-film'));
    }
    if (showtime) {
      const d = parseDate(state.date);
      ui.format.textContent = showtime.kind;
      ui.show.textContent = `${showtime.cinema} · ${showtime.room} - Suất ${showtime.time} ${d.weekday}, ${d.dd}/${d.mm}/${d.yyyy}`;
    } else {
      ui.format.textContent = '';
      ui.show.textContent = movie ? 'Chọn khu vực và suất chiếu' : 'Chọn khu vực, phim và suất chiếu';
    }
    ui.btn.disabled = !showtime;
  }

  // ----- Khu vực -----
  function renderCities() {
    ui.cities.replaceChildren();
    state.groups.forEach((g) => {
      const b = el('button', `gc-area${g.city === state.city ? ' is-selected' : ''}`, g.city);
      b.type = 'button';
      b.addEventListener('click', () => chooseCity(g.city));
      ui.cities.appendChild(b);
    });
  }

  // ----- Phim -----
  function renderMovies() {
    ui.movieTitle.textContent = state.movie ? `Chọn phim - ${state.movie.title}` : 'Chọn phim';
    ui.moviePanel.classList.toggle('is-collapsed', Boolean(state.movie));
    if (!state.movies.length) return hint(ui.movies, 'Khu vực này hiện chưa có suất chiếu.');
    ui.movies.replaceChildren();
    state.movies.forEach((m) => {
      const b = el('button', `gc-moviepick${state.movie && state.movie.id === m.id ? ' is-selected' : ''}`);
      b.type = 'button';
      b.title = m.title;
      const poster = el('div', 'gc-movie__poster');
      poster.appendChild(el('i', 'bi bi-film gc-movie__ph'));
      if (m.posterUrl) {
        const img = el('img');
        img.src = m.posterUrl;
        img.alt = `Poster ${m.title}`;
        img.loading = 'lazy';
        poster.appendChild(img);
      }
      const age = m.ageRating || 'P';
      poster.appendChild(el('span', `gc-age gc-age--${age.toLowerCase()}`, age));
      b.append(poster, el('span', 'gc-moviepick__title', m.title));
      b.addEventListener('click', () => chooseMovie(m));
      ui.movies.appendChild(b);
    });
  }

  // Phim của một khu vực = gộp phim của mọi rạp trong khu vực đó
  async function loadCityMovies(city) {
    if (moviesCache.has(city)) return moviesCache.get(city);
    const group = state.groups.find((g) => g.city === city);
    const lists = await Promise.all(group.cinemas.map((c) => getJson(`/api/booking/cinemas/${c.id}/movies`)));
    const merged = new Map();
    lists.forEach((list, i) => list.forEach((m) => {
      if (!merged.has(m.id)) merged.set(m.id, { ...m, cinemas: [] });
      merged.get(m.id).cinemas.push(group.cinemas[i]);
    }));
    const movies = [...merged.values()].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    moviesCache.set(city, movies);
    return movies;
  }

  // ----- Suất chiếu -----
  function renderShows() {
    ui.dates.replaceChildren();
    ui.times.replaceChildren();
    if (!state.movie) return hint(ui.times, 'Hãy chọn phim trước.');

    const dates = [...new Set(state.shows.flatMap((s) => s.days.map((d) => d.date)))].sort();
    if (!dates.length) return hint(ui.times, 'Chưa có suất chiếu.');

    dates.forEach((iso) => {
      const d = parseDate(iso);
      const b = el('button', `gc-date${iso === state.date ? ' is-selected' : ''}`);
      b.type = 'button';
      b.append(el('strong', '', `${d.dd}/${d.mm}`), el('small', '', d.weekday));
      b.addEventListener('click', () => {
        state.date = iso;
        state.showtime = null;
        renderShows();
        renderSummary();
      });
      ui.dates.appendChild(b);
    });

    state.shows.forEach(({ cinema, days }) => {
      const day = days.find((d) => d.date === state.date);
      if (!day) return;
      const block = el('div', 'gc-cine');
      block.appendChild(el('div', 'gc-cine__name', cinema.name));
      const kinds = new Map();
      day.showtimes.forEach((s) => {
        const kind = `${s.format} ${s.language}`;
        if (!kinds.has(kind)) kinds.set(kind, []);
        kinds.get(kind).push(s);
      });
      kinds.forEach((list, kind) => {
        const row = el('div', 'gc-cine__row');
        row.appendChild(el('span', 'gc-cine__kind', kind));
        const times = el('div', 'gc-cine__times');
        list.forEach((s) => {
          const picked = state.showtime && state.showtime.id === s.id;
          const b = el('button', `gc-time${picked ? ' is-selected' : ''}`, s.time);
          b.type = 'button';
          b.disabled = s.available === 0;
          b.title = s.available === 0 ? 'Hết ghế' : `${s.room} · còn ${s.available} ghế`;
          b.addEventListener('click', () => {
            state.showtime = { id: s.id, time: s.time, kind, room: s.room, cinema: cinema.name };
            renderShows();
            renderSummary();
          });
          times.appendChild(b);
        });
        row.appendChild(times);
        block.appendChild(row);
      });
      ui.times.appendChild(block);
    });
  }

  // ----- Hành động chọn -----
  // Đổi khu vực: giữ phim đang chọn nếu khu vực mới cũng có phim đó, nếu không thì bỏ chọn
  async function chooseCity(city) {
    const previous = state.movie;
    Object.assign(state, { city, movies: [], shows: [], date: null, showtime: null });
    renderCities();
    renderShows();
    hint(ui.movies, 'Đang tải phim...');

    let movies;
    try {
      movies = await loadCityMovies(city);
    } catch (err) {
      state.movie = null;
      renderSummary();
      return hint(ui.movies, err.message);
    }
    if (state.city !== city) return;        // người dùng đã bấm khu vực khác trong lúc chờ

    state.movies = movies;
    const same = previous && movies.find((m) => m.id === previous.id);
    if (same) return chooseMovie(same);     // dùng bản của khu vực mới để có đúng danh sách rạp

    state.movie = null;
    renderMovies();                         // panel tự mở ra để chọn phim khác
    renderSummary();
    renderShows();
  }

  async function chooseMovie(movie) {
    Object.assign(state, { movie, shows: [], date: null, showtime: null });
    renderMovies();
    renderSummary();
    hint(ui.times, 'Đang tải suất chiếu...');
    try {
      state.shows = await Promise.all(movie.cinemas.map(async (cinema) => ({
        cinema,
        days: await getJson(`/api/booking/showtimes?cinemaId=${cinema.id}&movieId=${movie.id}`),
      })));
    } catch (err) {
      return hint(ui.times, err.message);
    }
    if (state.movie !== movie) return;
    const dates = state.shows.flatMap((s) => s.days.map((d) => d.date)).sort();
    state.date = dates[0] || null;
    renderShows();
  }

  ui.moviePanel.querySelector('.gc-panel__head').addEventListener('click', () => {
    ui.moviePanel.classList.toggle('is-collapsed');
  });
  const page = (dir) => ui.movies.scrollBy({ left: dir * ui.movies.clientWidth, behavior: 'smooth' });
  ui.prev.addEventListener('click', () => page(-1));
  ui.next.addEventListener('click', () => page(1));
  ui.btn.addEventListener('click', () => {
    if (state.showtime) window.location.href = `/booking/showtimes/${state.showtime.id}/seats`;
  });

  async function init() {
    hint(ui.movies, 'Đang tải...');
    try {
      state.groups = await getJson('/api/booking/cinemas');
    } catch (err) {
      return hint(ui.movies, err.message);
    }
    if (!state.groups.length) {
      renderCities();
      return hint(ui.movies, 'Hiện chưa có rạp nào.');
    }
    // Khu vực đầu tiên mở ra là nơi đang chiếu phim chọn sẵn (nếu có)
    const first = (preset && state.groups.find((g) => g.cinemas.some((c) => presetCinemaIds.has(c.id))))
      || state.groups[0];
    chooseCity(first.city);
  }

  renderSummary();
  renderShows();
  init();
})();