/* ─────────────────────────────────────────────
   app.js — карта, список объектов, карточка и чат
   ───────────────────────────────────────────── */

const SPB_CENTER = [59.9386, 30.3141];

const STATUS = {
  in_progress: { label: 'Идёт ремонт',  color: '#fbbf24' },
  planned:     { label: 'Запланирован', color: '#60a5fa' },
  done:        { label: 'Завершён',     color: '#34d399' }
};

const state = {
  items: [],
  filtered: [],
  counts: {},
  current: null,
  status: 'all',
  district: 'all',
  sort: 'date',
  query: '',
  photo: null
};

const layers = new Map();   // id → { line, hit, marker }
let map;

/* ─────────  ХЕЛПЕРЫ  ───────── */
const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtMoney(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + ' млрд ₽';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' млн ₽';
  return n.toLocaleString('ru-RU') + ' ₽';
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toast(text, isError) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast' + (isError ? ' toast--err' : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3200);
}

/**
 * Геометрия объекта приходит в двух видах: одна ломаная [[lat,lng], ...]
 * или несколько (парсер OSM отдаёт улицу кусками) — [[[lat,lng], ...], ...].
 * Приводим к единому виду: массив отрезков.
 */
function segments(geometry) {
  if (!Array.isArray(geometry) || !geometry.length) return [];
  return typeof geometry[0][0] === 'number' ? [geometry] : geometry.filter((s) => Array.isArray(s) && s.length > 1);
}

function flatten(geometry) {
  return segments(geometry).reduce((acc, s) => acc.concat(s), []);
}

function midpoint(geometry) {
  const points = flatten(geometry);
  return points[Math.floor(points.length / 2)] || SPB_CENTER;
}

/* ─────────  ЗАГРУЗКА  ───────── */
async function boot() {
  bindUI();
  initMap();

  const online = await Api.init();
  const badge = $('modeBadge');
  badge.textContent = online ? 'Общий чат' : 'Локальный режим';
  badge.className = 'mode ' + (online ? 'mode--online' : 'mode--local');
  badge.title = online
    ? 'Сервер отвечает: сообщения и фото видны всем посетителям'
    : 'Сервер не запущен: сообщения сохраняются только в этом браузере';

  $('list').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

  let data;
  try {
    data = await Api.objects();
  } catch (e) {
    $('list').innerHTML = '<div class="empty">Не удалось загрузить данные.<br>Откройте сайт через веб-сервер:<br><code>python3 -m http.server</code></div>';
    toast('Ошибка загрузки данных объектов', true);
    return;
  }

  state.items = data.items;
  state.counts = await Api.counts();

  if (data.source === 'demo') {
    const bar = $('dataBar');
    bar.innerHTML = 'Показаны демонстрационные данные. Чтобы подтянуть реальные закупки из ЕИС, запустите '
      + '<code>python3 parser/fetch_zakupki.py</code>.';
    bar.hidden = false;
    document.body.classList.add('has-databar');
    setTimeout(() => map.invalidateSize(), 60);
  }

  fillDistricts();
  drawMap();
  applyFilters();
  renderStats();

  const hashId = decodeURIComponent(location.hash.slice(1));
  if (hashId && state.items.some((o) => o.id === hashId)) openObject(hashId, true);
}

/* ─────────  КАРТА  ───────── */
function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView(SPB_CENTER, 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  map.on('click', () => { /* клик по пустой карте ничего не закрывает */ });
}

function pinIcon(obj) {
  const color = (STATUS[obj.status] || STATUS.planned).color;
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${color}"><b>${state.counts[obj.id] || ''}</b></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function drawMap() {
  layers.forEach((rec) => rec.all.forEach((l) => map.removeLayer(l)));
  layers.clear();

  const bounds = [];

  state.items.forEach((obj) => {
    const segs = segments(obj.geometry);
    if (!segs.length) return;

    const color = (STATUS[obj.status] || STATUS.planned).color;
    const open = () => openObject(obj.id);
    const tip = `<span class="tip">${esc(obj.street)}</span><br>${esc((STATUS[obj.status] || {}).label || '')}`;
    const lines = [];
    const hits = [];

    segs.forEach((seg) => {
      const line = L.polyline(seg, {
        color, weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round',
        dashArray: obj.status === 'planned' ? '10 8' : null
      }).addTo(map);

      // широкая прозрачная линия — чтобы попадать пальцем на телефоне
      const hit = L.polyline(seg, { color, weight: 22, opacity: 0 }).addTo(map);
      hit.bindTooltip(tip, { sticky: true });

      line.on('click', open);
      hit.on('click', open);
      hit.on('mouseover', () => lines.forEach((l) => l.setStyle({ weight: 10 })));
      hit.on('mouseout', () => {
        if (state.current !== obj.id) lines.forEach((l) => l.setStyle({ weight: 6 }));
      });

      lines.push(line);
      hits.push(hit);
      seg.forEach((p) => bounds.push(p));
    });

    const marker = L.marker(midpoint(obj.geometry), { icon: pinIcon(obj) }).addTo(map);
    marker.on('click', open);

    layers.set(obj.id, { lines, marker, all: lines.concat(hits, [marker]) });
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

function refreshMarker(obj) {
  const rec = layers.get(obj.id);
  if (rec && rec.marker) rec.marker.setIcon(pinIcon(obj));
}

function highlight(id) {
  layers.forEach((rec, key) => {
    rec.lines.forEach((line) => {
      line.setStyle({ weight: key === id ? 11 : 6, opacity: id && key !== id ? 0.45 : 0.9 });
      if (key === id) line.bringToFront();
    });
  });
}

/* ─────────  ФИЛЬТРЫ И СПИСОК  ───────── */
function fillDistricts() {
  const districts = [...new Set(state.items.map((o) => o.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const sel = $('districtFilter');
  districts.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d + ' район';
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();

  state.filtered = state.items.filter((o) => {
    if (state.status !== 'all' && o.status !== state.status) return false;
    if (state.district !== 'all' && o.district !== state.district) return false;
    if (!q) return true;
    return [o.street, o.title, o.contractor, o.customer, o.district, o.id, o.section]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  state.filtered.sort((a, b) => {
    if (state.sort === 'price') return (b.price || 0) - (a.price || 0);
    if (state.sort === 'street') return String(a.street).localeCompare(String(b.street), 'ru');
    return String(b.dateStart || '').localeCompare(String(a.dateStart || ''));
  });

  renderList();

  // на карте показываем только то, что попало в фильтр
  const visible = new Set(state.filtered.map((o) => o.id));
  layers.forEach((rec, id) => {
    const on = visible.has(id);
    rec.all.forEach((l) => {
      if (on && !map.hasLayer(l)) map.addLayer(l);
      if (!on && map.hasLayer(l)) map.removeLayer(l);
    });
  });
}

function renderList() {
  const box = $('list');
  $('resultCount').textContent = state.filtered.length
    ? `Найдено объектов: ${state.filtered.length}`
    : '';

  if (!state.filtered.length) {
    box.innerHTML = '<div class="empty">Ничего не найдено.<br>Измените фильтры или запрос.</div>';
    return;
  }

  box.innerHTML = state.filtered.map((o) => {
    const st = STATUS[o.status] || STATUS.planned;
    const n = state.counts[o.id] || 0;
    return `
      <button class="item${state.current === o.id ? ' is-active' : ''}" data-id="${esc(o.id)}" type="button">
        <div class="item__top">
          <span class="item__status status--${esc(o.status)}">${esc(st.label)}</span>
        </div>
        <p class="item__street">${esc(o.street)}</p>
        <p class="item__meta">${esc(o.section || o.title)}<br>${esc(o.contractor || 'подрядчик не определён')}</p>
        <div class="item__foot">
          <span class="item__price">${fmtMoney(o.price)}</span>
          <span class="item__chat">💬 ${n}</span>
        </div>
      </button>`;
  }).join('');

  box.querySelectorAll('.item').forEach((el) => {
    el.addEventListener('click', () => openObject(el.dataset.id));
  });
}

function renderStats() {
  const total = state.items.length;
  const active = state.items.filter((o) => o.status === 'in_progress').length;
  const sum = state.items.reduce((acc, o) => acc + (o.price || 0), 0);

  $('topStats').innerHTML = `
    <span class="stat"><b>${total}</b><span>объектов ремонта</span></span>
    <span class="stat"><b>${active}</b><span>работы идут сейчас</span></span>
    <span class="stat"><b>${fmtMoney(sum)}</b><span>сумма контрактов</span></span>`;
}

/* ─────────  КАРТОЧКА ОБЪЕКТА  ───────── */
function openObject(id, skipFly) {
  const obj = state.items.find((o) => o.id === id);
  if (!obj) return;

  state.current = id;
  history.replaceState(null, '', '#' + encodeURIComponent(id));

  const st = STATUS[obj.status] || STATUS.planned;
  const badge = $('pStatus');
  badge.textContent = st.label;
  badge.className = 'badge status--' + obj.status;

  $('pTitle').textContent = obj.street;
  $('pSub').textContent = [obj.section, obj.district ? obj.district + ' район' : ''].filter(Boolean).join(' • ');

  $('pFacts').innerHTML = `
    ${fact('Подрядчик', esc(obj.contractor || 'не определён'), obj.contractorInn ? 'ИНН ' + esc(obj.contractorInn) : '')}
    ${fact('Начало работ', fmtDate(obj.dateStart))}
    ${fact('Завершение', fmtDate(obj.dateEnd))}
    ${fact('Вид работ', esc(obj.work || '—'))}
    ${fact('Цена контракта', fmtMoney(obj.price))}
    ${fact('Заказчик', esc(obj.customer || '—'))}
    ${fact('Номер закупки', esc(obj.id))}`;

  $('pTimeline').innerHTML = timeline(obj);
  $('pDesc').textContent = obj.description || 'Описание работ не указано в документации закупки.';

  const src = $('pSource');
  if (obj.source) { src.href = obj.source; src.hidden = false; }
  else src.hidden = true;

  $('panel').classList.add('is-open');
  $('panel').setAttribute('aria-hidden', 'false');
  highlight(id);
  renderList();

  const points = flatten(obj.geometry);
  if (!skipFly && points.length > 1) {
    map.fitBounds(points, { padding: [80, 80], maxZoom: 15 });
  }

  switchTab('info');
  loadChat(id);
}

function fact(label, value, note) {
  return `<div class="fact"><dt>${label}</dt><dd>${value}${note ? `<small>${note}</small>` : ''}</dd></div>`;
}

function timeline(obj) {
  const start = new Date(obj.dateStart).getTime();
  const end = new Date(obj.dateEnd).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return '';

  let pct = ((Date.now() - start) / (end - start)) * 100;
  pct = Math.max(0, Math.min(100, pct));
  if (obj.status === 'done') pct = 100;
  if (obj.status === 'planned') pct = 0;

  const days = Math.round((end - Date.now()) / 86400000);
  const note = obj.status === 'done' ? 'работы завершены'
    : obj.status === 'planned' ? 'работы ещё не начаты'
    : days >= 0 ? `осталось ${days} дн. по контракту` : `просрочка ${Math.abs(days)} дн.`;

  return `
    <div class="timeline__bar"><div class="timeline__fill" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="timeline__row"><span>${fmtShort(obj.dateStart)}</span><span>${note}</span><span>${fmtShort(obj.dateEnd)}</span></div>`;
}

function closePanel() {
  $('panel').classList.remove('is-open');
  $('panel').setAttribute('aria-hidden', 'true');
  state.current = null;
  history.replaceState(null, '', location.pathname + location.search);
  highlight(null);
  renderList();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  $('tabInfo').hidden = name !== 'info';
  $('tabChat').hidden = name !== 'chat';
  if (name === 'chat') setTimeout(() => $('text').focus(), 120);
}

/* ─────────  ЧАТ ОБЪЕКТА  ───────── */
async function loadChat(id) {
  const box = $('chat');
  box.innerHTML = '<div class="empty">Загружаем сообщения…</div>';

  const messages = await Api.messages(id);
  if (state.current !== id) return;   // пользователь уже переключился

  state.counts[id] = messages.length;
  $('chatCount').textContent = messages.length;
  const obj = state.items.find((o) => o.id === id);
  if (obj) refreshMarker(obj);
  renderList();

  if (!messages.length) {
    box.innerHTML = '<div class="empty">Пока нет ни одного сообщения.<br>Станьте первым: покажите, как идут работы.</div>';
    return;
  }

  box.innerHTML = messages.map(renderMsg).join('');
  box.querySelectorAll('.msg__photo').forEach((img) => {
    img.addEventListener('click', () => {
      $('lightboxImg').src = img.src;
      $('lightbox').hidden = false;
    });
  });
  box.scrollTop = box.scrollHeight;
}

function renderMsg(m) {
  const photo = m.photo
    ? `<img class="msg__photo" src="${esc(m.photo)}" alt="Фото с объекта" loading="lazy">`
    : '';
  const dropped = m.photoDropped
    ? '<p class="composer__hint">Фото не сохранилось: локальное хранилище браузера переполнено.</p>'
    : '';
  return `
    <article class="msg">
      <div class="msg__top">
        <span class="msg__author">${esc(m.author || 'Аноним')}</span>
        <span class="msg__time">${esc(fmtWhen(m.createdAt))}</span>
      </div>
      ${m.text ? `<p class="msg__text">${esc(m.text)}</p>` : ''}
      ${photo}${dropped}
    </article>`;
}

/** Уменьшаем фото в браузере, чтобы не гонять на сервер 10-мегабайтные снимки. */
function compress(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не похоже на изображение'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function submitMessage(e) {
  e.preventDefault();
  if (!state.current) return;

  const text = $('text').value.trim();
  if (!text && !state.photo) {
    toast('Напишите сообщение или прикрепите фото', true);
    return;
  }

  const author = $('author').value.trim() || 'Аноним';
  Api.author.set(author);

  const btn = $('sendBtn');
  btn.disabled = true;

  try {
    await Api.send(state.current, { author, text, photo: state.photo });
    $('text').value = '';
    $('text').style.height = 'auto';
    dropPhoto();
    await loadChat(state.current);
  } catch (err) {
    toast(err.message || 'Не удалось отправить сообщение', true);
  } finally {
    btn.disabled = false;
  }
}

function dropPhoto() {
  state.photo = null;
  $('photo').value = '';
  $('preview').hidden = true;
  $('previewImg').removeAttribute('src');
}

/* ─────────  СОБЫТИЯ  ───────── */
function bindUI() {
  $('search').addEventListener('input', (e) => { state.query = e.target.value; applyFilters(); });

  $('statusChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    state.status = chip.dataset.status;
    applyFilters();
  });

  $('districtFilter').addEventListener('change', (e) => { state.district = e.target.value; applyFilters(); });
  $('sortBy').addEventListener('change', (e) => { state.sort = e.target.value; applyFilters(); });

  $('toggleList').addEventListener('click', () => {
    document.body.classList.toggle('side-hidden');
    setTimeout(() => map.invalidateSize(), 280);
  });

  $('panelClose').addEventListener('click', closePanel);
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  $('composer').addEventListener('submit', submitMessage);
  $('author').value = Api.author.get();

  $('text').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });
  $('text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); }
  });

  $('photo').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Можно прикрепить только изображение', true); return; }
    try {
      state.photo = await compress(file);
      $('previewImg').src = state.photo;
      $('preview').hidden = false;
    } catch (err) {
      toast(err.message, true);
      dropPhoto();
    }
  });

  $('previewDrop').addEventListener('click', dropPhoto);

  $('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('lightbox').hidden) { $('lightbox').hidden = true; return; }
    if ($('panel').classList.contains('is-open')) closePanel();
  });
}

document.addEventListener('DOMContentLoaded', boot);
