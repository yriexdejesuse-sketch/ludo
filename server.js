/* ============================================================
   Serveur Ludo — statiques + API de partie en ligne (Node, zéro dépendance)
   POST /api/rooms                {color}            -> créer, rejoint en seat 0
   POST /api/rooms/:code/join     {}                 -> rejoint en seat 1
   GET  /api/rooms/:code?token=..                    -> état de la partie
   POST /api/rooms/:code/action   {token, action}    -> roll | move | finish | restart
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const engine = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const rooms = new Map();

function rndCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(5);
  let s = '';
  for (let i = 0; i < 5; i++) s += A[b[i] % A.length];
  return s;
}
const rndToken = () => crypto.randomBytes(16).toString('hex');

function createRoom(color) {
  const opp = engine.OPPOSITE[color] || 'blue';
  let code = rndCode();
  while (rooms.has(code)) code = rndCode();
  const room = {
    code,
    state: engine.createGame([color, opp]),
    seats: [{ token: rndToken() }, null],
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function publicState(room, token) {
  let seat = -1;
  if (token) seat = room.seats.findIndex(s => s && s.token === token);
  const you = seat >= 0 ? { seat, color: room.state.players[seat].color } : null;
  let legal = { 0: [], 1: [], sum: [] };
  const started = room.seats.every(Boolean);
  if (you && started && room.state.phase === 'move' &&
      engine.currentColor(room.state) === you.color) {
    legal = {
      0: engine.movesForDie(room.state, 0),
      1: engine.movesForDie(room.state, 1),
      sum: engine.movesForSum(room.state)
    };
  }
  return {
    state: room.state,
    legal,
    you,
    started,
    seats: room.state.players.map((p, i) => ({ seat: i, color: p.color, joined: !!room.seats[i] }))
  };
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',...]
  const method = req.method;

  /* POST /api/rooms */
  if (method === 'POST' && parts.length === 2 && parts[1] === 'rooms') {
    const body = await readBody(req);
    const color = engine.COLORS.includes(body.color) ? body.color : 'red';
    const room = createRoom(color);
    room.lastActivity = Date.now();
    return send(res, 200, { code: room.code, token: room.seats[0].token, ...publicState(room, room.seats[0].token) });
  }

  if (parts[1] !== 'rooms' || !parts[2]) return send(res, 404, { error: 'Inconnu.' });
  const room = rooms.get(parts[2].toUpperCase());
  if (!room) return send(res, 404, { error: 'Partie introuvable (code invalide).' });
  room.lastActivity = Date.now();

  /* POST /api/rooms/:code/join */
  if (method === 'POST' && parts[3] === 'join') {
    if (room.seats[1]) return send(res, 403, { error: 'full' });
    room.seats[1] = { token: rndToken() };
    return send(res, 200, { code: room.code, token: room.seats[1].token, ...publicState(room, room.seats[1].token) });
  }

  /* GET /api/rooms/:code */
  if (method === 'GET' && !parts[3]) {
    const token = url.searchParams.get('token');
    return send(res, 200, publicState(room, token));
  }

  /* POST /api/rooms/:code/action */
  if (method === 'POST' && parts[3] === 'action') {
    const body = await readBody(req);
    const token = body.token;
    const seat = room.seats.findIndex(s => s && s.token === token);
    if (seat < 0) return send(res, 403, { error: 'Token invalide.' });
    if (!room.seats.every(Boolean)) return send(res, 400, { error: 'En attente du second joueur…' });

    const st = room.state;
    const a = body.action || {};
    let r;
    if (a.type === 'roll') {
      if (st.over) r = { error: 'Partie terminée.' };
      else if (engine.currentColor(st) !== st.players[seat].color) r = { error: "Ce n'est pas à vous de jouer." };
      else r = engine.actionRoll(st);
    } else if (a.type === 'move') {
      if (st.over) r = { error: 'Partie terminée.' };
      else if (engine.currentColor(st) !== st.players[seat].color) r = { error: "Ce n'est pas à vous de jouer." };
      else r = engine.actionMove(st, a.pawn, a.to, a.die);
    } else if (a.type === 'finish') {
      if (st.over) r = { error: 'Partie terminée.' };
      else if (engine.currentColor(st) !== st.players[seat].color && st.ranks.length === 0) r = { error: "Ce n'est pas à vous de jouer." };
      else r = engine.finishNow(st);
    } else if (a.type === 'restart') {
      if (!st.over) r = { error: 'La partie est encore en cours.' };
      else { room.state = engine.createGame(st.players.map(p => p.color)); r = { ok: true }; }
    } else {
      r = { error: 'Action inconnue.' };
    }
    if (r.error) return send(res, 400, r);
    return send(res, 200, publicState(room, token));
  }

  return send(res, 404, { error: 'Inconnu.' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(PUB, p));
  if (!fp.startsWith(PUB + path.sep) && fp !== PUB) {
    res.writeHead(403); res.end('Interdit'); return;
  }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Erreur serveur.' });
  }
});

/* Purge des parties abandonnées (> 2 h d'inactivité) */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.lastActivity > 2 * 3600e3) rooms.delete(code);
}, 10 * 60e3).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log('Ludo prêt sur le port ' + PORT);
});
