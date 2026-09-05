(function () {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function fmt(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

  /* ---------- контакты во всех местах страницы ---------- */
  function fillContacts() {
    $$('#headerPhone span, #bigPhone').forEach(function (el) { el.textContent = CONTACTS.phone; });
    $$('#headerPhone, #bigPhone, #fab, #footPhone, #heroCall, #ctaCall, #quickCall, #okTel').forEach(function (el) {
      if (el) el.href = CONTACTS.phoneHref;
    });
    var footPhone = $('#footPhone');
    if (footPhone) footPhone.textContent = CONTACTS.phone;
    var quickNum = $('#quickCallNum');
    if (quickNum) quickNum.textContent = CONTACTS.phone;
    $$('#phoneInline, .phoneInline2').forEach(function (el) { el.textContent = CONTACTS.phone; });
    var hours = $('#heroHours');
    if (hours) hours.textContent = CONTACTS.hours;
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ---------- преимущества ---------- */
  function renderAdvantages() {
    var grid = $('#advGrid');
    if (!grid) return;
    grid.innerHTML = ADVANTAGES.map(function (a) {
      return '<div class="card advCard">' +
        '<div class="advCard__icon">' + a.icon + '</div>' +
        '<h3>' + a.title + '</h3>' +
        '<p>' + a.text + '</p>' +
        '</div>';
    }).join('');
  }

  /* ---------- прайс-лист + вкладки категорий ---------- */
  function renderPrices() {
    var tabs = $('#priceTabs'), list = $('#priceList'), select = $('#serviceSelect');
    if (!tabs || !list) return;

    tabs.innerHTML = PRICES.map(function (cat, i) {
      return '<button class="priceTab' + (i === 0 ? ' is-active' : '') + '" data-i="' + i + '">' + cat.category + '</button>';
    }).join('');

    function renderList(i) {
      var cat = PRICES[i];
      list.innerHTML = cat.items.map(function (it) {
        return '<div class="priceRow" data-name="' + it.name.replace(/"/g, '&quot;') + '" data-price="' + it.price + '">' +
          '<span class="priceRow__name">' + it.name +
            (it.duration ? '<span class="priceRow__duration">' + it.duration + '</span>' : '') +
          '</span>' +
          '<span class="priceRow__dots"></span>' +
          '<span class="priceRow__price">' + fmt(it.price) + '</span>' +
          '<button type="button" class="btn btn--ghost priceRow__pick">Выбрать</button>' +
          '</div>';
      }).join('');
    }
    renderList(0);

    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.priceTab');
      if (!btn) return;
      $$('.priceTab', tabs).forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      renderList(+btn.dataset.i);
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.priceRow__pick');
      if (!btn) return;
      var row = btn.closest('.priceRow');
      selectService(row.dataset.name, +row.dataset.price);
      var booking = $('#booking');
      if (booking) booking.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    if (select) {
      var opts = [];
      PRICES.forEach(function (cat) {
        opts.push('<optgroup label="' + cat.category + '">');
        cat.items.forEach(function (it) {
          opts.push('<option value="' + it.name.replace(/"/g, '&quot;') + '" data-price="' + it.price + '">' +
            it.name + ' — ' + fmt(it.price) + (it.duration ? ' (' + it.duration + ')' : '') + '</option>');
        });
        opts.push('</optgroup>');
      });
      select.innerHTML = opts.join('');
    }
  }

  function selectService(name, price) {
    var select = $('#serviceSelect');
    if (!select) return;
    var found = $$('option', select).find(function (o) { return o.value === name; });
    if (found) select.value = name;
  }

  /* ---------- форма записи ---------- */
  function initBooking() {
    var form = $('#bookForm'), ok = $('#ok');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var name = (data.get('name') || '').trim();
      var phone = (data.get('phone') || '').trim();
      var time = (data.get('time') || '').trim();
      var select = $('#serviceSelect');
      var serviceOpt = select.options[select.selectedIndex];
      var service = serviceOpt ? serviceOpt.value : '';
      var price = serviceOpt ? serviceOpt.dataset.price : '';

      var lines = [
        'Запись в The Cult barbershop',
        'Имя: ' + name,
        'Телефон: ' + phone,
        'Услуга: ' + service + (price ? ' (' + fmt(+price) + ')' : '')
      ];
      if (time) lines.push('Время: ' + time);
      var text = lines.join('\n');

      var okSms = $('#okSms'), okTel = $('#okTel'), okText = $('#okText');
      if (okSms) okSms.href = CONTACTS.smsHref + '?body=' + encodeURIComponent(text);
      if (okTel) okTel.href = CONTACTS.phoneHref;
      if (okText) {
        okText.textContent = 'Нажмите «Отправить СМС мастеру» — откроется приложение сообщений с готовым текстом на номер ' +
          CONTACTS.phone + '. Либо позвоните напрямую.';
      }

      form.hidden = true;
      if (ok) ok.hidden = false;
    });

    var back = $('#okBack');
    if (back) {
      back.addEventListener('click', function () {
        $('#ok').hidden = true;
        form.hidden = false;
      });
    }
  }

  /* ---------- мобильное меню ---------- */
  function initNav() {
    var header = $('#header'), nav = $('#nav'), burger = $('#burger');
    if (!header || !nav || !burger) return;

    burger.addEventListener('click', function () {
      nav.classList.toggle('is-open');
      burger.classList.toggle('is-open');
    });
    $$('#nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open'); burger.classList.remove('is-open');
      });
    });

    var lastY = window.scrollY;
    window.addEventListener('scroll', function () {
      header.classList.toggle('is-scrolled', window.scrollY > 10);
      lastY = window.scrollY;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fillContacts();
    renderAdvantages();
    renderPrices();
    initBooking();
    initNav();
  });
})();
