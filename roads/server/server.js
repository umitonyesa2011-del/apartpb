#!/usr/bin/env node
/* ─────────────────────────────────────────────
   server.js — минимальный backend для общего чата.

   Без внешних зависимостей: только стандартная библиотека Node.js.
   Запуск:  node server/server.js  (из папки roads/)
   Порт:    PORT=8080 node server/server.js

   Что делает:
     • отдаёт статику сайта (index.html, assets, data);
     • GET  /api/health                — проверка, что backend жив;
     • GET  /api/objects               — данные объектов ремонта;
     • GET  /api/chat-counts           — { id: количество сообщений };
     • GET  /api/chat/:objectId        — сообщения объекта;
     • POST /api/chat/:objectId        — новое сообщение (+ фото в base64);
     • GET  /uploads/:file             — загруженные фотографии.

   Сообщения лежат в server/data/chat.json, фотографии — в server/uploads/.
   ───────────────────────────────────────────── */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname, '..');          // roads/
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');

const MAX_BODY = 8 * 1024 * 1024;                    // 8 МБ на запрос
const MAX_TEXT = 1000;
const MAX_AUTHOR = 40;
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ─────────  хранилище чата  ───────── */
let chat = {};
try {
  chat = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
} catch {
  chat = {};
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = CHAT_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(chat, null, 2), (err) => {
      if (err) return console.error('Не удалось сохранить чат:', err.message);
      fs.rename(tmp, CHAT_FILE, (e) => e && console.error('Ошибка записи чата:', e.message));
    });
  }, 200);
}

/* ─────────  простая защита от флуда  ───────── */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (list.length >= RATE_LIMIT.max) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  return false;
}

/* ─────────  утилиты ответа  ───────── */
function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendFile(res, file) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — не найдено');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' || ext === '.json' ? 'no-store' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('Некорректный JSON')); }
    });
    req.on('error', reject);
  });
}

const isSafeId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** dataURL → файл в uploads/, возвращает публичный путь. */
function savePhoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 6 * 1024 * 1024) return null;
  const name = crypto.randomBytes(12).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return 'uploads/' + name;
}

/* ─────────  маршрутизация  ───────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(url.pathname);
  const ip = req.socket.remoteAddress || 'unknown';

  // --- API ---
  if (pathname === '/api/health') return sendJson(res, 200, { ok: true, mode: 'server' });

  if (pathname === '/api/objects') {
    return fs.readFile(path.join(ROOT, 'data', 'objects.json'), 'utf8', (err, txt) => {
      if (err) return sendJson(res, 500, { error: 'Файл data/objects.json не найден' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(txt);
    });
  }

  if (pathname === '/api/chat-counts') {
    const counts = {};
    for (const id of Object.keys(chat)) counts[id] = chat[id].length;
    return sendJson(res, 200, counts);
  }

  const chatMatch = /^\/api\/chat\/(.+)$/.exec(pathname);
  if (chatMatch) {
    const id = chatMatch[1];
    if (!isSafeId(id)) return sendJson(res, 400, { error: 'Некорректный идентификатор объекта' });

    if (req.method === 'GET') return sendJson(res, 200, chat[id] || []);

    if (req.method === 'POST') {
      if (rateLimited(ip)) return sendJson(res, 429, { error: 'Слишком много сообщений, попробуйте позже' });

      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }

      const text = String(body.text || '').trim().slice(0, MAX_TEXT);
      const author = String(body.author || 'Аноним').trim().slice(0, MAX_AUTHOR) || 'Аноним';

      let photo = null;
      if (body.photo) {
        try { photo = savePhoto(body.photo); }
        catch (e) { return sendJson(res, 500, { error: 'Не удалось сохранить фото' }); }
        if (!photo) return sendJson(res, 400, { error: 'Фото должно быть JPEG/PNG/WebP и меньше 6 МБ' });
      }

      if (!text && !photo) return sendJson(res, 400, { error: 'Пустое сообщение' });

      const msg = {
        id: crypto.randomBytes(8).toString('hex'),
        objectId: id,
        author, text, photo,
        createdAt: new Date().toISOString()
      };
      (chat[id] = chat[id] || []).push(msg);
      persist();
      return sendJson(res, 201, msg);
    }

    res.writeHead(405, { Allow: 'GET, POST' });
    return res.end();
  }

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Неизвестный метод API' });

  // --- фотографии ---
  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(name)) {
      res.writeHead(404); return res.end();
    }
    return sendFile(res, path.join(UPLOAD_DIR, name));
  }

  // --- статика ---
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('403');
  }
  sendFile(res, file);
});

server.listen(PORT, () => {
  console.log(`Дороги СПб: http://localhost:${PORT}`);
  console.log(`Статика:    ${ROOT}`);
  console.log(`Чат:        ${CHAT_FILE}`);
});
