/* ==========================================================================
   Логика лендинга: каталог квартир, календарь бронирования, форма заявки
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* Тёплые землистые тона: у каждой квартиры свой оттенок,
     но все они из одной песочной гаммы. */
  var ACCENTS = {
    violet: ['#B4552F', '#D08A5A'],   /* терракота    */
    sky:    ['#A9744A', '#C79A6D'],   /* охра         */
    teal:   ['#6E8A5F', '#96AE7F'],   /* шалфей       */
    amber:  ['#C08A2E', '#DFB264'],   /* мёд          */
    rose:   ['#A85E5E', '#C98D84']    /* пыльная роза */
  };

  var MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  var MONTHS_OF = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var DOW = ['пн','вт','ср','чт','пт','сб','вс'];

  /* ─── утилиты ────────────────────────────────────────────────────── */
  function money(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

  function iso(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function fromIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function nightsBetween(a, b) { return Math.round((fromIso(b) - fromIso(a)) / 86400000); }
  function human(s) { var d = fromIso(s); return d.getDate() + ' ' + MONTHS_OF[d.getMonth()]; }

  /* Слово «ночь» в нужном падеже */
  function plural(n, forms) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  /* Красивая заглушка вместо фото, пока в images/ нет настоящих файлов */
  function placeholder(apt, i) {
    var c = ACCENTS[apt.accent] || ACCENTS.violet;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">' +
        '<defs>' +
          '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="800" height="600" fill="#EFE6D8"/>' +
        '<rect width="800" height="600" fill="url(#g)" opacity=".22"/>' +
        '<g fill="none" stroke="url(#g)" stroke-width="3" opacity=".85">' +
          '<path d="M-20 380 C 180 300, 300 470, 480 390 S 720 300, 840 360"/>' +
          '<path d="M-20 450 C 200 380, 320 530, 520 450 S 740 380, 840 430" opacity=".6"/>' +
        '</g>' +
        '<g transform="translate(400 268)" fill="none" stroke="#3A2C22" stroke-opacity=".55" ' +
          'stroke-width="9" stroke-linejoin="round" stroke-linecap="round">' +
          '<path d="M-70 4 L0 -56 L70 4"/><path d="M-52 -4 V62 H52 V-4"/><path d="M-14 62 V22 H14 V62"/>' +
        '</g>' +
        '<text x="400" y="416" text-anchor="middle" fill="#3A2C22" fill-opacity=".85" ' +
          'font-family="Manrope,Arial,sans-serif" font-size="34" font-weight="700">' +
          apt.area + ' м² · ' + apt.beds +
        '</text>' +
        '<text x="400" y="456" text-anchor="middle" fill="#6B5B4B" fill-opacity=".8" ' +
          'font-family="Manrope,Arial,sans-serif" font-size="20" font-weight="600">' +
          'фотографии — в объявлении на Avito' +
        '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ─── контакты ───────────────────────────────────────────────────── */
  function initContacts() {
    $$('#headerPhone, #bigPhone, #footPhone, #fab, #okTel').forEach(function (el) {
      el.setAttribute('href', CONTACTS.phoneHref);
    });
    $('#headerPhone').lastElementChild.textContent = CONTACTS.phone;
    $('#bigPhone').textContent = CONTACTS.phone;
    $('#footPhone').textContent = CONTACTS.phone;
    $('#ctaWa').href = CONTACTS.whatsapp;
    $('#year').textContent = new Date().getFullYear();
  }

  /* ─── цифры ──────────────────────────────────────────────────────── */
  function initStats() {
    var items = [
      [STATS.years, 'года на рынке аренды'],
      [STATS.reply, 'ответ на заявку'],
      [STATS.commission, 'комиссия за бронь'],
      [STATS.checkin, 'заселение в любое время']
    ];
    $('#stats').innerHTML = items.map(function (it) {
      return '<div class="stat reveal"><b class="grad">' + it[0] + '</b><span>' + it[1] + '</span></div>';
    }).join('');
  }

  /* ─── преимущества ───────────────────────────────────────────────── */
  function initAdvantages() {
    var list = [
      { i: '🗝', c: 'violet', t: 'Больше года на рынке', d: 'Сдаю квартиры посуточно уже более года. Процесс отлажен: от быстрого ответа на заявку до уборки перед вашим приездом.' },
      { i: '🏢', c: 'teal',   t: 'Свой фонд квартир', d: 'Сдаю не одну квартиру, а несколько — в разных районах. Если ваши даты заняты в одной, подберу похожую по цене и площади.' },
      { i: '🤝', c: 'amber',  t: 'Без комиссий', d: 'Работаю напрямую как собственник. Никаких агентских процентов и скрытых доплат — цена в календаре и есть итоговая.' },
      { i: '🕛', c: 'sky',    t: 'Заселение 24/7', d: 'Ночной поезд или ранний рейс — не проблема. Встречу лично или пришлю код от сейфа с ключами.' },
      { i: '✨', c: 'rose',   t: 'Чистота как в отеле', d: 'Свежее бельё и полотенца, полная уборка после каждого гостя, средства гигиены и всё для завтрака.' },
      { i: '📄', c: 'violet', t: 'Документы для отчёта', d: 'Оформляю договор и предоставляю закрывающие документы — удобно для командировки.' }
    ];
    $('#advGrid').innerHTML = list.map(function (a) {
      var c = ACCENTS[a.c];
      return '<article class="adv reveal">' +
        '<span class="adv__line" style="background:linear-gradient(90deg,' + c[0] + ',' + c[1] + ')"></span>' +
        '<div class="adv__ico" style="background:linear-gradient(135deg,' + c[0] + '33,' + c[1] + '1a)">' + a.i + '</div>' +
        '<h3>' + a.t + '</h3><p>' + a.d + '</p></article>';
    }).join('');
  }

  /* ─── карточки квартир ───────────────────────────────────────────── */
  function initApartments() {
    var pinSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/>' +
      '<circle cx="12" cy="10" r="3"/></svg>';

    $('#aptGrid').innerHTML = APARTMENTS.map(function (a) {
      var c = ACCENTS[a.accent] || ACCENTS.violet;
      var photos = (a.photos && a.photos.length ? a.photos : ['']);
      var slides = photos.map(function (p, i) {
        var base = p ? p.replace(/\.[a-z0-9]+$/i, '') : '';
        var src = p ? 'images/' + p : placeholder(a, i);
        return '<img src="' + src + '" alt="' + a.title + ' — фото ' + (i + 1) + '" ' +
               'loading="lazy" data-base="' + base + '" data-ph="' + placeholder(a, i) + '" ' +
               'style="' + (i ? 'display:none' : '') + '">';
      }).join('');
      var dots = photos.length > 1
        ? '<div class="apt__dots">' + photos.map(function (_, i) {
            return '<i class="' + (i ? '' : 'on') + '"></i>';
          }).join('') + '</div>'
        : '';

      return '<article class="apt reveal" data-id="' + a.id + '" data-rooms="' + a.rooms + '" data-guests="' + a.guests + '">' +
        '<div class="apt__media" data-slider>' +
          '<span class="apt__badge" style="background:linear-gradient(100deg,' + c[0] + ',' + c[1] + ')">' + a.badge + '</span>' +
          slides + dots +
          '<span class="apt__price">' + (a.priceFrom ? 'от ' : '') + money(a.price) + ' <small>/ сутки</small></span>' +
        '</div>' +
        '<div class="apt__body">' +
          '<h3 class="apt__title">' + a.title + '</h3>' +
          '<div class="apt__geo">' + pinSvg + '<span>' + (a.district || CONTACTS.city) + '</span></div>' +
          '<div class="apt__meta">' +
            '<span>' + a.rooms + '-комн.</span><span>' + a.area + ' м²</span>' +
            '<span>' + a.beds + '</span><span>до ' + a.guests + ' гостей</span>' +
          '</div>' +
          '<p class="apt__about">' + a.about + '</p>' +
          '<ul class="apt__feat">' + a.features.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' +
          '<div class="apt__btns">' +
            '<button class="btn btn--primary" data-book="' + a.id + '">Забронировать</button>' +
            '<a class="btn btn--outline" href="' + a.avito + '" target="_blank" rel="noopener nofollow">Смотреть на Avito</a>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    /* если настоящего фото ещё нет — подставляем нарисованную заглушку */
    /* Файла с таким расширением может не быть — пробуем остальные,
       и только потом показываем нарисованную заглушку. */
    var EXT = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.PNG'];

    $$('#aptGrid img').forEach(function (img) {
      var base = (img.dataset.base || '');
      var tried = 0;
      var next = function () {
        if (!base) { img.src = img.dataset.ph; return; }
        while (tried < EXT.length) {
          var candidate = 'images/' + base + EXT[tried++];
          if (img.getAttribute('src') !== candidate) { img.src = candidate; return; }
        }
        if (img.src !== img.dataset.ph) img.src = img.dataset.ph;
      };
      img.addEventListener('error', next);
      if (img.complete && img.naturalWidth === 0) next();   // ошибка успела произойти раньше
    });

    /* мини-слайдер: клик по фото листает, двойной — открывает лайтбокс */
    $$('[data-slider]').forEach(function (box) {
      var imgs = $$('img', box), dotsEl = $$('.apt__dots i', box), idx = 0;
      if (imgs.length < 2) { box.addEventListener('click', function () { openLb(imgs, 0); }); return; }
      var timer = null;
      box.addEventListener('click', function (e) {
        if (timer) { clearTimeout(timer); timer = null; openLb(imgs, idx); return; }
        timer = setTimeout(function () {
          timer = null;
          imgs[idx].style.display = 'none';
          if (dotsEl[idx]) dotsEl[idx].classList.remove('on');
          idx = (idx + 1) % imgs.length;
          imgs[idx].style.display = '';
          if (dotsEl[idx]) dotsEl[idx].classList.add('on');
        }, 220);
        e.preventDefault();
      });
    });

    /* фильтры */
    var filters = [
      { k: 'all', t: 'Все квартиры' },
      { k: '1',   t: '1-комнатные' },
      { k: '2',   t: '2-комнатные' },
      { k: 'big', t: 'Для компании (4+)' }
    ];
    $('#filters').innerHTML = filters.map(function (f, i) {
      return '<button class="chip' + (i ? '' : ' is-active') + '" data-filter="' + f.k + '">' + f.t + '</button>';
    }).join('');

    $('#filters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      $$('#filters .chip').forEach(function (c) { c.classList.toggle('is-active', c === b); });
      var k = b.dataset.filter;
      $$('#aptGrid .apt').forEach(function (card) {
        var ok = k === 'all'
          || (k === 'big' && +card.dataset.guests >= 4)
          || card.dataset.rooms === k;
        card.classList.toggle('is-hidden', !ok);
      });
    });

    /* «Забронировать» → выбрать квартиру в календаре и прокрутить к нему */
    $('#aptGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]');
      if (!b) return;
      selectApartment(b.dataset.book);
      $('#calendar').scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ─── лайтбокс ───────────────────────────────────────────────────── */
  var lbList = [], lbIdx = 0;
  function openLb(imgs, i) {
    lbList = imgs.map(function (im) { return im.src; });
    lbIdx = i;
    $('#lbImg').src = lbList[lbIdx];
    $('#lb').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLb() { $('#lb').hidden = true; document.body.style.overflow = ''; }
  function stepLb(d) {
    if (!lbList.length) return;
    lbIdx = (lbIdx + d + lbList.length) % lbList.length;
    $('#lbImg').src = lbList[lbIdx];
  }
  function initLightbox() {
    $('#lbClose').addEventListener('click', closeLb);
    $('#lbPrev').addEventListener('click', function (e) { e.stopPropagation(); stepLb(-1); });
    $('#lbNext').addEventListener('click', function (e) { e.stopPropagation(); stepLb(1); });
    $('#lb').addEventListener('click', function (e) { if (e.target === $('#lb')) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if ($('#lb').hidden) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') stepLb(-1);
      if (e.key === 'ArrowRight') stepLb(1);
    });
  }

  /* ─── КАЛЕНДАРЬ ──────────────────────────────────────────────────── */
  var current = APARTMENTS[0];
  var view = (function () { var d = today(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  var start = null, end = null;

  function busySet() {
    var s = {};
    (current.booked || []).forEach(function (d) { s[d] = true; });
    return s;
  }
  function rangeHasBusy(a, b) {
    var busy = busySet(), d = fromIso(a), stop = fromIso(b);
    while (d < stop) { if (busy[iso(d)]) return true; d = addDays(d, 1); }
    return false;
  }

  /* если гость снова взялся за календарь — прячем экран «заявка сформирована» */
  function resetOk() {
    var ok = $('#ok');
    if (ok && !ok.hidden) { ok.hidden = true; $('#bookForm').hidden = false; }
  }

  function renderChips() {
    $('#aptChips').innerHTML = APARTMENTS.map(function (a) {
      return '<button class="chip' + (a.id === current.id ? ' is-active' : '') + '" data-apt="' + a.id + '">' +
        a.rooms + '-к · ' + a.area + ' м² · ' + money(a.price) + '</button>';
    }).join('');
  }

  function selectApartment(id) {
    var a = APARTMENTS.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    current = a;
    if (start && end && rangeHasBusy(start, end)) { start = null; end = null; }
    resetOk();
    renderChips(); renderCalendar(); renderSummary();
  }

  function monthHtml(base) {
    var y = base.getFullYear(), m = base.getMonth();
    var first = new Date(y, m, 1);
    var shift = (first.getDay() + 6) % 7;                 // неделя с понедельника
    var total = new Date(y, m + 1, 0).getDate();
    var busy = busySet(), t = iso(today());

    var cells = '';
    for (var i = 0; i < shift; i++) cells += '<button class="day is-empty" disabled></button>';

    for (var d = 1; d <= total; d++) {
      var date = new Date(y, m, d), key = iso(date);
      var past = key < t;
      var isBusy = !!busy[key];
      var we = date.getDay() === 0 || date.getDay() === 6;
      var cls = ['day'];
      if (we && !past) cls.push('is-we');
      if (key === t) cls.push('is-today');
      if (isBusy) cls.push('is-busy');

      if (start && end && key >= start && key <= end) {
        if (key === start || key === end) {
          cls.push('is-edge');
          cls.push(start === end ? 'is-only' : (key === start ? 'is-start' : 'is-end'));
        } else cls.push('is-range');
      } else if (start && !end && key === start) {
        cls.push('is-edge', 'is-only');
      }

      cells += '<button class="' + cls.join(' ') + '" data-date="' + key + '"' +
               (past || isBusy ? ' disabled' : '') + '>' + d + '</button>';
    }

    return '<div class="month">' +
      '<div class="month__name">' + MONTHS[m] + ' ' + y + '</div>' +
      '<div class="month__dow">' + DOW.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="month__days">' + cells + '</div></div>';
  }

  function renderCalendar() {
    var next = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    $('#calGrids').innerHTML = monthHtml(view) + monthHtml(next);
    $('#calTitle').textContent = MONTHS[view.getMonth()] + ' — ' + MONTHS[next.getMonth()] + ' ' + next.getFullYear();
    var now = today();
    $('#prevMonth').disabled = view <= new Date(now.getFullYear(), now.getMonth(), 1);
  }

  function pickDate(key) {
    if (!start || (start && end)) { start = key; end = null; }
    else if (key === start) { end = null; }
    else if (key < start) { start = key; }
    else if (rangeHasBusy(start, key)) { start = key; end = null; }
    else { end = key; }
    resetOk();
    renderCalendar(); renderSummary();
  }

  function renderSummary() {
    var box = $('#sum');
    if (!start || !end) {
      box.innerHTML = '<p class="sum__empty">Выберите в календаре <b>дату заезда</b>, затем <b>дату выезда</b> — стоимость посчитается автоматически.</p>';
      return;
    }
    var n = nightsBetween(start, end);
    var total = n * current.price;
    box.innerHTML =
      '<div class="sum__row"><span>Квартира</span><span>' + current.rooms + '-к, ' + current.area + ' м²</span></div>' +
      '<div class="sum__row"><span>Заезд</span><span>' + human(start) + ', с 14:00</span></div>' +
      '<div class="sum__row"><span>Выезд</span><span>' + human(end) + ', до 12:00</span></div>' +
      '<div class="sum__row"><span>' + n + ' ' + plural(n, ['ночь', 'ночи', 'ночей']) + ' × ' + money(current.price) + '</span><span>' + money(total) + '</span></div>' +
      '<div class="sum__row sum__total"><span>Итого</span><span>' + money(total) + '</span></div>';
  }

  function initCalendar() {
    renderChips(); renderCalendar(); renderSummary();

    $('#aptChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-apt]');
      if (b) selectApartment(b.dataset.apt);
    });
    $('#calGrids').addEventListener('click', function (e) {
      var b = e.target.closest('[data-date]');
      if (b && !b.disabled) pickDate(b.dataset.date);
    });
    $('#prevMonth').addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCalendar();
    });
    $('#nextMonth').addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCalendar();
    });
  }

  /* ─── форма заявки ───────────────────────────────────────────────── */
  function initForm() {
    var form = $('#bookForm');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!start || !end) {
        $('#calendar').scrollIntoView({ behavior: 'smooth' });
        $('#sum').animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
           { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
          { duration: 320 }
        );
        return;
      }

      var el = form.elements;                                   // form.name — это атрибут формы, не поле
      var data = {
        name:   el.name.value.trim(),
        phone:  el.phone.value.trim(),
        guests: el.guests.value,
        note:   el.note.value.trim()
      };
      var bad = false;
      [['name', data.name.length >= 2], ['phone', data.phone.replace(/\D/g, '').length >= 10]]
        .forEach(function (p) {
          var ok = p[1];
          el[p[0]].closest('.field').classList.toggle('is-error', !ok);
          if (!ok) bad = true;
        });
      if (bad) return;

      var n = nightsBetween(start, end);
      var total = n * current.price;

      var msg =
        'Здравствуйте! Хочу забронировать квартиру.\n\n' +
        '🏠 ' + current.title + ' (' + (current.district || CONTACTS.city) + ')\n' +
        '📅 Заезд: ' + human(start) + ' — выезд: ' + human(end) + '\n' +
        '🌙 ' + n + ' ' + plural(n, ['ночь', 'ночи', 'ночей']) + ', гостей: ' + data.guests + '\n' +
        '💰 Примерно: ' + money(total) + '\n\n' +
        '👤 ' + data.name + '\n📞 ' + data.phone +
        (data.note ? '\n💬 ' + data.note : '') +
        '\n\nСсылка на объявление: ' + current.avito;

      try {
        var log = JSON.parse(localStorage.getItem('apartpb_requests') || '[]');
        log.push({ at: new Date().toISOString(), apt: current.id, start: start, end: end, total: total, client: data });
        localStorage.setItem('apartpb_requests', JSON.stringify(log.slice(-50)));
      } catch (err) { /* localStorage может быть недоступен — не критично */ }

      $('#okText').innerHTML =
        '<b>' + current.title + '</b><br>' +
        human(start) + ' — ' + human(end) + ' · ' + n + ' ' + plural(n, ['ночь', 'ночи', 'ночей']) +
        ' · ' + money(total) + '<br><br>' +
        'Отправьте детали в WhatsApp или позвоните — подтверждаю бронь в течение 15 минут.';
      $('#okWa').href = CONTACTS.whatsapp + '?text=' + encodeURIComponent(msg);
      form.hidden = true;
      $('#ok').hidden = false;
    });

    form.addEventListener('input', function (e) {
      var f = e.target.closest('.field');
      if (f) f.classList.remove('is-error');
    });

    $('#okBack').addEventListener('click', function () {
      $('#ok').hidden = true;
      form.hidden = false;
      $('#calendar').scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ─── вопросы и ответы ────────────────────────────────────────────── */
  function initFaq() {
    $('#faqList').innerHTML = FAQ.map(function (f) {
      return '<div class="faq__item reveal"><button class="faq__q" type="button">' +
        '<span>' + f.q + '</span><i>+</i></button>' +
        '<div class="faq__a"><p>' + f.a + '</p></div></div>';
    }).join('');

    $('#faqList').addEventListener('click', function (e) {
      var q = e.target.closest('.faq__q');
      if (!q) return;
      var item = q.parentElement, a = $('.faq__a', item), open = item.classList.contains('is-open');
      $$('.faq__item', $('#faqList')).forEach(function (it) {
        it.classList.remove('is-open');
        $('.faq__a', it).style.maxHeight = null;
      });
      if (!open) { item.classList.add('is-open'); a.style.maxHeight = a.scrollHeight + 'px'; }
    });
  }

  /* ─── интерфейс: меню, шапка, анимация появления ─────────────────── */
  function initUI() {
    var header = $('#header'), nav = $('#nav'), burger = $('#burger');

    burger.addEventListener('click', function () {
      nav.classList.toggle('is-open');
      burger.classList.toggle('is-open');
    });
    $$('#nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open'); burger.classList.remove('is-open');
      });
    });

    var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 12); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en, i) {
          if (!en.isIntersecting) return;
          en.target.style.transitionDelay = Math.min(i * 70, 350) + 'ms';
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        });
      }, { threshold: .12, rootMargin: '0px 0px -40px' });
      $$('.reveal').forEach(function (el) { io.observe(el); });
    } else {
      $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
    }
  }

  /* ─── микроразметка для поисковиков (Schema.org) ─────────────────── */
  function initSeo() {
    var base = location.origin + location.pathname.replace(/index\.html$/, '');

    var org = {
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: 'КвартирыСПб — квартиры посуточно от собственника',
      description: 'Посуточная аренда квартир в Санкт-Петербурге от собственника, без комиссии и посредников.',
      url: base,
      telephone: CONTACTS.phoneHref.replace('tel:', ''),
      priceRange: Math.min.apply(null, APARTMENTS.map(function (a) { return a.price; })) + '–' +
                  Math.max.apply(null, APARTMENTS.map(function (a) { return a.price; })) + ' RUB',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Санкт-Петербург',
        addressCountry: 'RU'
      },
      areaServed: { '@type': 'City', name: 'Санкт-Петербург' },
      openingHours: 'Mo-Su 00:00-23:59'
      // Рейтинг (aggregateRating) сюда добавляем только с реальными отзывами:
      // размечать выдуманные оценки запрещено правилами Google и Яндекса.
    };

    var list = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: APARTMENTS.map(function (a, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Apartment',
            name: a.title,
            description: a.about,
            numberOfRooms: a.rooms,
            occupancy: { '@type': 'QuantitativeValue', maxValue: a.guests },
            floorSize: { '@type': 'QuantitativeValue', value: a.area, unitCode: 'MTK' },
            address: {
              '@type': 'PostalAddress',
              addressLocality: a.district || CONTACTS.city,
              addressCountry: 'RU'
            },
            amenityFeature: a.features.map(function (f) {
              return { '@type': 'LocationFeatureSpecification', name: f, value: true };
            }),
            potentialAction: {
              '@type': 'ReserveAction',
              target: base + '#calendar',
              result: { '@type': 'LodgingReservation', name: 'Бронирование ' + a.title }
            },
            offers: {
              '@type': 'Offer',
              price: a.price,
              priceCurrency: 'RUB',
              availability: 'https://schema.org/InStock',
              url: base + '#calendar',
              priceSpecification: {
                '@type': 'UnitPriceSpecification',
                price: a.price,
                priceCurrency: 'RUB',
                unitCode: 'DAY',
                unitText: 'сутки'
              }
            }
          }
        };
      })
    };

    var faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(function (f) {
        return {
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        };
      })
    };

    [org, list, faq].forEach(function (obj) {
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(obj);
      document.head.appendChild(s);
    });
  }

  /* ─── старт ──────────────────────────────────────────────────────── */
  initContacts();
  initStats();
  initAdvantages();
  initApartments();
  initFaq();
  initCalendar();
  initForm();
  initLightbox();
  initUI();
  initSeo();
})();
