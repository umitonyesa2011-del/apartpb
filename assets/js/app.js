(function () {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function fmt(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

  /* ---------- линейные иконки (единый стиль с шапкой/hero) ---------- */
  var ICONS = {
    scissors: '<path d="M6.3 9.3a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.3 18.7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM20 5 7.7 17.3M13.6 13.6 20 20M7.7 7.7 11 11"/>',
    razor: '<path d="M4 20 13.5 10.5M13.5 10.5 20 4l1 1-6.5 6.5M13.5 10.5l3 3M9 15l-5 5"/>',
    drop: '<path d="M12 3.5s6 6.8 6 11a6 6 0 1 1-12 0c0-4.2 6-11 6-11Z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/>',
    pin: '<path d="M12 21s7-7.4 7-12.2A7 7 0 1 0 5 8.8C5 13.6 12 21 12 21Z"/><circle cx="12" cy="8.8" r="2.4"/>'
  };

  /* ---------- появление секций при прокрутке ---------- */
  function initReveal() {
    var els = $$('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) return;
    els.forEach(function (el, i) {
      el.style.transitionDelay = (i % 3) * 70 + 'ms';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .15, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

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
    var list = $('#advGrid');
    if (!list) return;
    list.innerHTML = ADVANTAGES.map(function (a) {
      return '<div class="featureItem reveal">' +
        '<div class="featureItem__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[a.icon] || '') + '</svg></div>' +
        '<div class="featureItem__body"><h3>' + a.title + '</h3><p>' + a.text + '</p></div>' +
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
    initReveal();
  });
})();
