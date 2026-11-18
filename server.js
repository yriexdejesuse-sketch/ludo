/* ============================================================
   Serveur Ludo — statiques + API de partie en ligne (Node, zéro dépendance)
   POST /api/rooms                {color, name}      -> créer, rejoint en seat 0
   POST /api/rooms/:code/join     {name}             -> rejoint en seat 1
   GET  /api/rooms/:code?token=..                    -> état de la partie
   POST /api/rooms/:code/action   {token, action}    -> start | color | roll | move | finish | restart
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

const cleanName = (v) => String(v == null ? '' : v).trim().slice(0, 16);

function createRoom(color, name, count) {
  const max = Math.min(4, Math.max(2, parseInt(count,10) || 2));
  const others = engine.COLORS.filter(c=>c!==color);
  let colors;
  if (max===2) colors=[color, engine.OPPOSITE[color] || others[0]];
  else colors=[color, ...others.slice(0,max-1)];
  let code = rndCode();
  while (rooms.has(code)) code = rndCode();
  const seats = Array(max).fill(null); seats[0]={ token: rndToken() };
  const names = Array(max).fill(null); names[0]=cleanName(name);
  const room = {
    code,
    state: engine.createGame(colors),
    seats, names, max,
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
  const started = room.started === true && room.seats.every(Boolean);
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
    names: (room.names || ['', '']).slice(),
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
    const room = createRoom(color, body.name, body.count);
    room.lastActivity = Date.now();
    return send(res, 200, { code: room.code, token: room.seats[0].token, ...publicState(room, room.seats[0].token) });
  }

  if (parts[1] !== 'rooms' || !parts[2]) return send(res, 404, { error: 'Inconnu.' });
  const room = rooms.get(parts[2].toUpperCase());
  if (!room) return send(res, 404, { error: 'Partie introuvable (code invalide).' });
  room.lastActivity = Date.now();

  /* POST /api/rooms/:code/join */
  if (method === 'POST' && parts[3] === 'join') {
    if (room.seats.every(s=>s)) return send(res, 403, { error: 'full', max: room.max || room.seats.length });
    const emptyIdx = room.seats.findIndex(s=>!s);
    if (emptyIdx < 0) return send(res, 403, { error: 'full', max: room.max || room.seats.length });
    const jbody = await readBody(req);
    room.seats[emptyIdx] = { token: rndToken() };
    room.names = room.names || Array(room.max||2).fill('');
    while (room.names.length < (room.max||room.seats.length)) room.names.push('');
    room.names[emptyIdx] = cleanName(jbody.name);
    return send(res, 200, { code: room.code, token: room.seats[emptyIdx].token, ...publicState(room, room.seats[emptyIdx].token) });
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
    const a = body.action || {};
    if (a.type !== 'color' && !room.seats.every(Boolean)) return send(res, 400, { error: 'En attente du second joueur…' });
    if (a.type !== 'color' && a.type !== 'start' && !room.started) return send(res, 400, { error: 'La partie n\'est pas encore commencée.' });

    const st = room.state;
    let r;
    if (a.type === 'start') {
      if (seat !== 0) r = { error: 'Seul l\'hôte peut lancer la partie.' };
      else { room.started = true; r = { ok: true }; }
    } else if (a.type === 'color') {
      if (room.started) r = { error: 'La partie a déjà commencé.' };
      else if (!engine.COLORS.includes(a.color)) r = { error: 'Couleur inconnue.' };
      else {
        const colors = st.players.map((p, i) => i === seat ? a.color : p.color);
        if (new Set(colors).size !== colors.length) r = { error: 'Cette couleur est déjà prise.' };
        else { room.state = engine.createGame(colors); r = { ok: true }; }
      }
    } else if (a.type === 'roll') {
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
      else { room.state = engine.createGame(st.players.map(p => p.color)); room.started = false; r = { ok: true }; }
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
