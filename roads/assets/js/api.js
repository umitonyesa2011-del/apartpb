/* ─────────────────────────────────────────────
   api.js — доступ к данным.

   Два режима работы:
   1. «Сервер» — если рядом поднят server/server.js, чат общий для всех
      посетителей (сообщения и фото лежат на сервере).
   2. «Локальный» — сервера нет (открыли index.html как файл или на статике
      вроде GitHub Pages). Тогда чат сохраняется в localStorage браузера
      и виден только этому пользователю.
   ───────────────────────────────────────────── */

const Api = (() => {
  const LS_KEY = 'roads-spb-chat-v1';
  const LS_NAME = 'roads-spb-author';
  let online = false;

  /* ---------- localStorage ---------- */
  function lsAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  }
  function lsSave(store) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store));
      return true;
    } catch {
      return false; // переполнена квота (обычно из-за фотографий)
    }
  }

  /* ---------- общее ---------- */
  async function json(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  return {
    get online() { return online; },

    /** Проверяем, отвечает ли backend. */
    async init() {
      try {
        const res = await fetch('api/health', { cache: 'no-store' });
        online = res.ok;
      } catch {
        online = false;
      }
      return online;
    },

    /** Список объектов ремонта. */
    async objects() {
      const url = online ? 'api/objects' : 'data/objects.json';
      const data = await json(url, { cache: 'no-store' });
      return {
        source: data.source || 'demo',
        generatedAt: data.generatedAt || null,
        note: data.note || '',
        items: Array.isArray(data.items) ? data.items : []
      };
    },

    /** Количество сообщений по всем объектам: { objectId: n }. */
    async counts() {
      if (online) {
        try { return await json('api/chat-counts', { cache: 'no-store' }); }
        catch { return {}; }
      }
      const store = lsAll();
      const out = {};
      for (const id of Object.keys(store)) out[id] = store[id].length;
      return out;
    },

    /** Сообщения одного объекта, от старых к новым. */
    async messages(objectId) {
      if (online) {
        try { return await json('api/chat/' + encodeURIComponent(objectId), { cache: 'no-store' }); }
        catch { return []; }
      }
      return lsAll()[objectId] || [];
    },

    /**
     * Отправка сообщения.
     * @param {string} objectId
     * @param {{author:string, text:string, photo:string|null}} msg
     */
    async send(objectId, msg) {
      const payload = {
        author: (msg.author || 'Аноним').slice(0, 40),
        text: (msg.text || '').slice(0, 1000),
        photo: msg.photo || null
      };

      if (online) {
        return json('api/chat/' + encodeURIComponent(objectId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const saved = {
        id: 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        objectId,
        author: payload.author,
        text: payload.text,
        photo: payload.photo,
        createdAt: new Date().toISOString()
      };
      const store = lsAll();
      (store[objectId] = store[objectId] || []).push(saved);

      if (!lsSave(store)) {
        // не влезло — пробуем сохранить хотя бы текст
        saved.photo = null;
        saved.photoDropped = true;
        if (!lsSave(store)) throw new Error('Локальное хранилище переполнено');
      }
      return saved;
    },

    /** Имя автора запоминаем между сессиями. */
    author: {
      get() { try { return localStorage.getItem(LS_NAME) || ''; } catch { return ''; } },
      set(v) { try { localStorage.setItem(LS_NAME, v); } catch { /* приватный режим */ } }
    }
  };
})();
