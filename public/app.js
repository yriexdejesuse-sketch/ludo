'use strict';
/* ============================================================
   Ludo — interface : 2 dés au milieu du plateau, clic sur le pion,
   mode contre l'ordinateur (2 ou 4 joueurs), sons synthétisés
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg';
const APP_VERSION = 'v2026-11-13t';
const LABEL = { red: 'Rouge', green: 'Vert', yellow: 'Jaune', blue: 'Bleu' };
const EMOJI = { red: '🔴', green: '🟢', yellow: '🟡', blue: '🔵' };
const HEX = { red: '#e5484d', green: '#2eb67d', yellow: '#f5a524', blue: '#3b82f6' };
const DARK = { red: '#9e2f33', green: '#1e7a51', yellow: '#a86e10', blue: '#1f5bc4' };
const BASE_ORIGIN = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
const SLOT = [[75, 75], [165, 75], [75, 165], [165, 165]];
const MEDAL = ['', '🥇', '🥈', '🥉', '4️⃣'];

/* ---------- état ---------- */
let mode = null;                 // 'local' | 'ai' | 'online'
let setupKind = 'local';         // écran de préparation
let aiCount = 2;
let localCount = 2;
let simCount = 2;
let onlineCount = 2;
let G = null;
let legal = { 0: [], 1: [], sum: [] };
let you = null;                  // couleur humaine (null = hot-seat / spectateur)
let aiColors = new Set();
let hotseat = false;
let seats = [];
let started = false;
let roomNames = ['', ''];
let youSeatNum = -1;
let noteStamp = 0, lastLogLen = 0, lastRev = -1;
let logNotes = {}, toastNotes = {};
let room = { code: null, token: null };
let selectedDie = null;          // 0 | 1 | null
let animating = false;
let rollAnim = false;
let queuedCommit = null;
let watchStop = null, watchSeq = 0;
let Backend = null;              // 'http' (serveur Arena) ou 'fire' (Firebase)
let autoTimer = null, autoLastRev = null, autoStall = 0; /* mode zéro clic */
let aiTimer = null;
let simPaused = false;
let overShown = false;
let setupColors = { c1: 'red', c2: 'blue' };
let localPlayers = [
  { name: 'Joueur 1', color: 'red' },
  { name: 'Joueur 2', color: 'blue' },
  { name: 'Joueur 3', color: 'green' },
  { name: 'Joueur 4', color: 'yellow' }
];
let simPlayers = [
  { name: 'Ordi 1', color: 'red' },
  { name: 'Ordi 2', color: 'blue' },
  { name: 'Ordi 3', color: 'green' },
  { name: 'Ordi 4', color: 'yellow' }
];

const $ = (s) => document.querySelector(s);
const busy = () => animating || rollAnim;

/* ============================================================
   SONS (Web Audio — synthétisés, aucun fichier externe)
   ============================================================ */
const Snd = (() => {
  let ctx = null;
  function ac() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(freq, dur, type, peak, delay) {
    const c = ac(); if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      env(g, t0, 0.012, dur, peak || 0.14);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.08);
    } catch (e) {}
  }
  function noise(dur, peak, freq, delay, type) {
    const c = ac(); if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const n = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = type || 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 1.1;
      const g = c.createGain();
      env(g, t0, 0.005, dur, peak || 0.18);
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(t0);
    } catch (e) {}
  }
  return {
    unlock() { ac(); },
    roll() { for (let i = 0; i < 9; i++) noise(0.07, 0.15, 1400 + Math.random() * 1600, i * 0.08); },
    settle() { noise(0.07, 0.24, 950, 0); noise(0.08, 0.2, 700, 0.13); },
    step() { tone(680 + Math.random() * 280, 0.055, 'triangle', 0.09); },
    capture() {
      tone(330, 0.26, 'sawtooth', 0.16);
      tone(130, 0.34, 'square', 0.13, 0.05);
      noise(0.16, 0.18, 600, 0.02, 'lowpass');
    },
    home() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'sine', 0.13, i * 0.09)); },
    finish() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, i * 0.1)); },
    win() {
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, i * 0.12));
      [659, 784, 1047].forEach((f, i) => tone(f, 0.45, 'sine', 0.14, 0.6 + i * 0.13));
    },
    click() { tone(1150, 0.05, 'square', 0.05); }
  };
})();

/* ============================================================
   PLATEAU (SVG statique)
   ============================================================ */
function add(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (parent || $('#board')).appendChild(e);
  return e;
}
function starPath(cx, cy, r) {
  let p = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1);
  }
  return p + 'Z';
}
function arrowPath(cx, cy, dir) {
  const s = 7.5;
  if (dir === 'E') return `M${cx - 5},${cy - s} L${cx + s},${cy} L${cx - 5},${cy + s} Z`;
  if (dir === 'W') return `M${cx + 5},${cy - s} L${cx - s},${cy} L${cx + 5},${cy + s} Z`;
  if (dir === 'S') return `M${cx - s},${cy - 5} L${cx},${cy + s} L${cx + s},${cy - 5} Z`;
  return `M${cx - s},${cy + 5} L${cx},${cy - s} L${cx + s},${cy + 5} Z`;
}
const START_DIR = { red: 'E', green: 'S', yellow: 'W', blue: 'N' };

function buildBoard() {
  const svg = $('#board');
  svg.innerHTML = '';
  add('rect', { x: 0, y: 0, width: 600, height: 600, fill: '#f4f1ea', rx: 12 });

  for (const c of Object.keys(BASE_ORIGIN)) {
    const [ox, oy] = BASE_ORIGIN[c];
    const X = ox * 40, Y = oy * 40;
    add('rect', { x: X, y: Y, width: 240, height: 240, fill: HEX[c], rx: 10, stroke: DARK[c], 'stroke-width': 3 });
    add('rect', { x: X + 26, y: Y + 26, width: 188, height: 188, fill: '#fffdf7', rx: 12, stroke: DARK[c], 'stroke-width': 2 });
    SLOT.forEach(([sx, sy]) =>
      add('circle', { cx: X + sx, cy: Y + sy, r: 21, fill: HEX[c], stroke: DARK[c], 'stroke-width': 2, opacity: .9 }));
  }

  Ludo.RING.forEach((cell, i) => {
    const [x, y] = cell;
    let fill = '#fffdf7', stroke = '#3f3f46';
    const owner = Object.keys(Ludo.INFO).find(c =>
      Ludo.INFO[c].start === i || Ludo.INFO[c].mouth === i);
    if (owner) { fill = HEX[owner]; stroke = DARK[owner]; }
    add('rect', { x: x * 40, y: y * 40, width: 40, height: 40, fill, stroke, 'stroke-width': 1.6 });
  });

  Object.keys(Ludo.INFO).forEach(c => {
    const I = Ludo.INFO[c];
    [I.start, I.mouth].forEach(idx => {
      const [x, y] = Ludo.RING[idx];
      add('path', {
        d: arrowPath(x * 40 + 20, y * 40 + 20, START_DIR[c]),
        fill: '#ffffff', stroke: DARK[c], 'stroke-width': 1.2
      });
    });
    const si = (I.start + 8) % 52;
    const [sx, sy] = Ludo.RING[si];
    add('path', { d: starPath(sx * 40 + 20, sy * 40 + 20, 13), fill: '#fbbf24', stroke: '#b45309', 'stroke-width': 1.5 });
  });

  Object.keys(Ludo.INFO).forEach(c => {
    Ludo.INFO[c].home.slice(0, 5).forEach(([x, y]) => {
      add('rect', { x: x * 40, y: y * 40, width: 40, height: 40, fill: HEX[c], stroke: DARK[c], 'stroke-width': 1.6 });
      add('path', {
        d: arrowPath(x * 40 + 20, y * 40 + 20, START_DIR[c]),
        fill: 'rgba(255,255,255,.55)', stroke: 'none'
      });
    });
  });

  add('rect', { x: 240, y: 240, width: 120, height: 120, fill: '#fffdf7', stroke: '#3f3f46', 'stroke-width': 2 });
  add('path', { d: 'M240,240 L240,360 L300,300 Z', fill: HEX.red, stroke: DARK.red, 'stroke-width': 1.5 });
  add('path', { d: 'M240,240 L360,240 L300,300 Z', fill: HEX.green, stroke: DARK.green, 'stroke-width': 1.5 });
  add('path', { d: 'M360,240 L360,360 L300,300 Z', fill: HEX.yellow, stroke: DARK.yellow, 'stroke-width': 1.5 });
  add('path', { d: 'M240,360 L360,360 L300,300 Z', fill: HEX.blue, stroke: DARK.blue, 'stroke-width': 1.5 });

  [[240, 240], [360, 240], [360, 360], [240, 360]].forEach(([px, py]) => {
    add('path', {
      d: `M${px - 10},${py} L${px},${py - 10} L${px + 10},${py} L${px},${py + 10} Z`,
      fill: '#fffdf7', stroke: '#3f3f46', 'stroke-width': 1.6
    });
  });

  add('g', { id: 'pawns' });
  add('g', { id: 'hl' });
}

/* ============================================================
   PIONS
   ============================================================ */
function pawnEl(color, idx) {
  const id = 'pawn-' + color + '-' + idx;
  let e = document.getElementById(id);
  if (!e) {
    e = document.createElementNS(NS, 'g');
    e.id = id;
    e.setAttribute('class', 'pawn');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', 13); c.setAttribute('fill', HEX[color]);
    c.setAttribute('stroke', DARK[color]); c.setAttribute('stroke-width', 2.5);
    const h = document.createElementNS(NS, 'circle');
    h.setAttribute('r', 4.5); h.setAttribute('cx', -4); h.setAttribute('cy', -4.5);
    h.setAttribute('fill', '#fff'); h.setAttribute('opacity', .7);
    e.appendChild(c); e.appendChild(h);
    $('#pawns').appendChild(e);
    e.addEventListener('click', (ev) => { ev.stopPropagation(); onPawnClick(color, idx); });
  }
  return e;
}
function cellCenter(color, pos) {
  const cell = Ludo.visualCell(color, pos);
  return [cell[0] * 40 + 20, cell[1] * 40 + 20];
}
function baseSlot(color, idx) {
  const [ox, oy] = BASE_ORIGIN[color];
  return [ox * 40 + SLOT[idx][0], oy * 40 + SLOT[idx][1]];
}
function stackOffsets(n) {
  if (n <= 1) return [[0, 0]];
  if (n === 2) return [[-8, 0], [8, 0]];
  if (n === 3) return [[-9, 4], [0, -7], [9, 4]];
  return [[-8, -8], [8, -8], [-8, 8], [8, 8]];
}
function playableClient() {
  if (!G || G.phase !== 'move') return [];
  return [0, 1].filter(i => !G.dieUsed[i] && G.dice[i] != null && (legal[i] || []).length > 0);
}
function syncSelection() {
  if (!G || G.phase !== 'move' || !canAct()) { selectedDie = null; return; }
  const p = playableClient();
  if (selectedDie != null && p.includes(selectedDie)) return;
  /* choix évident : un seul dé jouable — ou deux dés identiques */
  if (p.length === 1) { selectedDie = p[0]; return; }
  if (p.length > 1 && G.dice[0] === G.dice[1]) { selectedDie = p[0]; return; }
  selectedDie = null;
}
function syncPawns() {
  if (!G) return;
  document.querySelectorAll('#pawns .pawn').forEach(el => { el.style.display = 'none'; });

  const cur = Ludo.currentColor(G);
  const movable = new Set();
  if (G.phase === 'move' && canAct()) {
    const dies = selectedDie != null ? [selectedDie] : playableClient();
    dies.forEach(i => (legal[i] || []).forEach(m => movable.add(m.pawn)));
    (legal.sum || []).forEach(m => movable.add(m.pawn)); /* somme des 2 dés */
  }

  const groups = {};
  G.players.forEach(p => {
    p.pawns.forEach((pos, i) => {
      if (pos >= 0 || pos === -2 || Ludo.isIntruderPos(pos)) {
        const cell = Ludo.visualCell(p.color, pos);
        const key = cell[0] + ',' + cell[1];
        (groups[key] = groups[key] || []).push({ color: p.color, idx: i });
      }
    });
  });

  G.players.forEach(p => {
    p.pawns.forEach((pos, i) => {
      const el = pawnEl(p.color, i);
      el.style.display = '';
      let pt;
      if (pos < 0 && pos !== -2 && !Ludo.isIntruderPos(pos)) pt = baseSlot(p.color, i);
      else {
        const cell = Ludo.visualCell(p.color, pos);
        const key = cell[0] + ',' + cell[1];
        const grp = groups[key];
        const off = stackOffsets(grp.length)[grp.findIndex(g => g.color === p.color && g.idx === i)];
        pt = [cell[0] * 40 + 20 + off[0], cell[1] * 40 + 20 + off[1]];
      }
      el.style.transition = '';
      el.style.transform = `translate(${pt[0]}px,${pt[1]}px)`;
      el.classList.toggle('movable', pos !== 56 && p.color === cur && movable.has(i));
      el.classList.toggle('done', pos === 56);
    });
  });
}

/* ---------- animations de déplacement ---------- */
function waypoints(t) {
  if (t.to === -1) return { pts: [baseSlot(t.color, t.idx)], kind: 'tween' };
  if (t.to === -2 || t.from === -2 ||
      Ludo.isIntruderPos(t.to) || Ludo.isIntruderPos(t.from)) {
    return { pts: [cellCenter(t.color, t.to)], kind: 'tween' };
  }
  if (t.from === -1) return { pts: [cellCenter(t.color, t.to)], kind: 'tween' };
  const delta = t.to - t.from;
  if (Math.abs(delta) > 14) return { pts: [cellCenter(t.color, t.to)], kind: 'tween' };
  const dir = delta > 0 ? 1 : -1;
  const pts = [];
  for (let k = 1; k <= Math.abs(delta); k++) pts.push(cellCenter(t.color, t.from + dir * k));
  return { pts, kind: 'hop' };
}
function runTransition(t, done) {
  const el = pawnEl(t.color, t.idx);
  const { pts, kind } = waypoints(t);
  if (!pts.length) { done(); return; }
  let i = 0;
  const step = () => {
    if (i >= pts.length) { el.style.transition = ''; done(); return; }
    const p = pts[i++];
    el.style.transition = kind === 'hop' ? 'transform 95ms linear' : 'transform 300ms cubic-bezier(.4,0,.2,1)';
    el.style.transform = `translate(${p[0]}px,${p[1]}px)`;
    if (kind === 'hop') Snd.step();
    setTimeout(step, kind === 'hop' ? 100 : 315);
  };
  step();
}
function animateDiff(oldS, newS, after) {
  const ops = [];
  newS.players.forEach(p => {
    const o = oldS.players.find(q => q.color === p.color);
    if (!o) return;
    p.pawns.forEach((np, i) => {
      const op = o.pawns[i];
      if (np !== op) ops.push({ color: p.color, idx: i, from: op, to: np });
    });
  });
  if (!ops.length) { syncPawns(); after && after(); return; }
  animating = true;
  let active = 0;
  ops.forEach(t => {
    active++;
    if (t.to === -1 && t.from >= 0) Snd.capture();
    runTransition(t, () => {
      if (t.to === 56) Snd.home();
      active--;
      if (active <= 0) {
        animating = false;
        syncPawns();
        const q = queuedCommit; queuedCommit = null;
        if (q) q(); else { after && after(); }
      }
    });
  });
}

/* ============================================================
   DÉS AU MILIEU DU PLATEAU
   ============================================================ */
function setFace(el, n) {
  el.innerHTML = '';
  el.classList.remove('empty');
  const layouts = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]
  };
  (layouts[n] || []).forEach(([x, y]) => {
    const p = document.createElement('div');
    p.className = 'pipd';
    p.style.gridRow = y + 1; p.style.gridColumn = x + 1;
    el.appendChild(p);
  });
}
function renderDice() {
  if (rollAnim) return;
  const els = [$('#die0'), $('#die1')];
  els.forEach((el, i) => {
    el.className = 'board-die';
    const v = G ? G.dice[i] : null;
    if (v == null) { el.classList.add('empty'); el.innerHTML = ''; return; }
    setFace(el, v);
    if (!G || G.over || G.phase === 'roll') return;
    if (G.phase === 'move') {
      if (G.dieUsed[i]) el.classList.add('used');
      else if (selectedDie === i) el.classList.add('sel');
      else if ((legal[i] || []).length) el.classList.add('usable');
      else el.classList.add('used');
    }
  });
}
function renderHint() {
  const h = $('#diceHint');
  if (!G || G.over || !started || rollAnim) { h.classList.add('hide'); return; }
  h.classList.remove('hide');
  const cur = Ludo.currentColor(G);
  const mine = canAct();
  if (!mine) {
    h.textContent = (mode === 'local')
      ? `Au tour de ${EMOJI[cur]} ${LABEL[cur]}`
      : `${LABEL[cur]} joue…`;
    return;
  }
  if (G.phase === 'roll') h.textContent = '👆 Clique pour lancer';
  else h.textContent = selectedDie != null ? '👆 Choisis un pion' : '👆 Choisis un dé';
}
let rollTimer = null, rollCycler = null;
function startRollAnimation() {
  rollAnim = true;
  Snd.roll();
  const d0 = $('#die0'), d1 = $('#die1');
  [d0, d1].forEach(d => {
    d.className = 'board-die rolling';
    setFace(d, 1 + Math.floor(Math.random() * 6));
  });
  $('#diceHint').classList.add('hide');
  clearInterval(rollCycler);
  rollCycler = setInterval(() => {
    setFace(d0, 1 + Math.floor(Math.random() * 6));
    setFace(d1, 1 + Math.floor(Math.random() * 6));
  }, 75);
  clearTimeout(rollTimer);
  rollTimer = setTimeout(() => {
    clearInterval(rollCycler); rollCycler = null;
    rollAnim = false;
    Snd.settle();
    renderDice(); renderPanel(); scheduleAi();
    /* à chaque lancer : le jeu calcule et PROPOSE tout recul/somme possible */
    if (G && G.phase === 'move' && started && canAct()) {
      const hasBwd = (legal.sum || []).some(m => m.capture) ||
        (legal[0] || []).some(m => m.type === 'bwd') ||
        (legal[1] || []).some(m => m.type === 'bwd');
      const hasSum = (legal.sum || []).length > 0;
      const hasEntry = (legal[0] || []).some(m => m.type === 'entree') ||
        (legal[1] || []).some(m => m.type === 'entree');
      if (hasBwd) toast('♻️ Manger en arrière possible — clique sur le pion concerné !');
      else if (hasSum) toast('♻️ Somme des 2 dés utilisable — clique sur un pion !');
      else if (hasEntry) toast('🚪 Entrée dans le couloir adverse possible — clique sur le pion !');
    }
    maybeAutoSinglePawn(); /* zéro clic si un seul pion en jeu */
  }, 950);
}
function onDieClick(i) {
  Snd.unlock();
  clearAuto();
  if (!G || busy()) return;
  if (G.phase === 'roll') { if (canAct()) doRoll(); return; }
  if (G.phase !== 'move' || !canAct()) return;
  if (G.dieUsed[i]) return;
  if (!(legal[i] || []).length) {
    if ((legal.sum || []).length && !playableClient().length)
      toast('♻️ Utilise la somme : clique directement sur le pion à manger en arrière.');
    else toast('Ce dé n\'a aucun coup possible.');
    return;
  }
  selectedDie = i;
  Snd.click();
  hideMini();
  renderPanel();
}

/* ============================================================
   MINI-CHOIX PRÈS DU PION (avancer / reculer-manger)
   ============================================================ */
function hideMini() {
  $('#miniChoice').classList.add('hidden');
  $('#hl').innerHTML = '';
}
function addMarker(color, m) {
  const cell = Ludo.visualCell(color, m.to);
  const r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', cell[0] * 40 + 3);
  r.setAttribute('y', cell[1] * 40 + 3);
  r.setAttribute('width', 34); r.setAttribute('height', 34);
  r.setAttribute('rx', 7);
  r.setAttribute('class', 'hl ' + (m.type === 'bwd' || m.type === 'entree' ? 'bwd' : 'fwd'));
  $('#hl').appendChild(r);
}
function showMiniChoice(die, opts) {
  /* opts : [{ m, die }] — die = 0 | 1 | 'sum' (somme des deux dés) */
  const color = Ludo.currentColor(G);
  const pawnPos = G.players[G.turn].pawns[opts[0].m.pawn];
  const cell = Ludo.visualCell(color, pawnPos);
  const [mx, my] = rotBoardPoint(cell[0] * 40 + 20, cell[1] * 40 + 20);
  const el = $('#miniChoice');
  el.style.left = (mx / 600 * 100) + '%';
  el.style.top = (my / 600 * 100) + '%';
  const mixed = new Set(opts.map(o => o.die)).size > 1; /* options venant de plusieurs dés */
  el.innerHTML = opts.map((o, i) => {
    const v = o.die === 'sum' ? (G.dice[0] + G.dice[1]) : G.dice[o.die];
    const src = mixed && o.die !== 'sum' ? ` · dé ${o.die + 1}` : '';
    let lbl;
    if (o.die === 'sum') lbl = `♻️ Somme des 2 dés : reculer de ${v} — manger !`;
    else if (o.m.type === 'bwd') lbl = `⬇ Reculer de ${v} — manger !${src}`;
    else if (o.m.type === 'entree') lbl = `🚪 Entrer dans le couloir — manger !${src}`;
    else if (o.m.type === 'sortie') lbl = `🚪 Sortir du couloir (double 6)${src}`;
    else if (o.m.type === 'out') lbl = `⬆ Sortir de la base${src}`;
    else lbl = `⬆ Avancer de ${v}${src}`;
    return `<button data-i="${i}" class="${o.m.type === 'bwd' ? 'bwd' : ''}">${lbl}</button>`;
  }).join('');
  el.querySelectorAll('button').forEach(b => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const o = opts[+b.dataset.i];
      hideMini();
      executeMove(o.die, o.m);
    };
  });
  el.classList.remove('hidden');
  $('#hl').innerHTML = '';
  opts.forEach(o => addMarker(color, o.m));
}

/* ============================================================
   RENDU DU PANNEAU
   ============================================================ */
function canAct() {
  if (!G || G.over || !started) return false;
  if (mode === 'local') return true;
  if (!you) return false;
  return Ludo.currentColor(G) === you;
}
function pawnPips(p) {
  return p.pawns.map(pos => {
    let cls = 'pip';
    if (pos === 56) cls += ' done';
    else if (pos >= 51) cls += ' home';
    else if (pos >= 0 || pos === -2 || Ludo.isIntruderPos(pos)) cls += ' track';
    return `<span class="${cls}"></span>`;
  }).join('');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function nameOf(color) {
  const i = (G && G.players ? G.players : []).findIndex(p => p.color === color);
  const nm = (i >= 0 && roomNames) ? String(roomNames[i] || '').trim() : '';
  return nm || LABEL[color];
}
function harvestLogNotes() {
  if (!G) return;
  if (G.rev < lastRev) { logNotes = {}; toastNotes = {}; }
  lastRev = G.rev;
  if (!G.log) return;
  if (G.log.length < lastLogLen) { lastLogLen = G.log.length; return; }
  for (let i = lastLogLen; i < G.log.length; i++) {
    const line = G.log[i];
    ['red', 'green', 'yellow', 'blue'].forEach((c) => {
      if (new RegExp('\\b' + LABEL[c] + '\\b', 'i').test(line)) logNotes[c] = { msg: line, stamp: ++noteStamp };
    });
  }
  lastLogLen = G.log.length;
}
function boxNoteFor(color) {
  const a = logNotes[color], b = toastNotes[color];
  if (b && (!a || b.stamp >= a.stamp)) return b.msg;
  return a ? a.msg : '';
}
/* ── orientation du plateau : la case de la couleur du joueur est TOUJOURS
   en bas à gauche de son écran (red -90° / green 180° / yellow +90° / blue 0°) ── */
const BOARD_ROT = { blue: 0, yellow: 90, red: -90, green: 180 };
let boardDeg = 0;
function boardRefColor() {
  if (!G || !G.players || !G.players[0]) return null;
  if (you && (mode === 'online' || mode === 'ai')) return you;
  return G.players[0].color; /* partie locale : écran orienté sur le joueur1 */
}
function applyBoardOrientation() {
  const ref = boardRefColor();
  boardDeg = ref ? (BOARD_ROT[ref] || 0) : 0;
  const svg = $('#board');
  if (svg) svg.style.transform = boardDeg ? `rotate(${boardDeg}deg)` : '';
}
/* point du viewBox 600x600 après la rotation (mini-choix, etc.) */
function rotBoardPoint(x, y) {
  const dx = x - 300, dy = y - 300;
  if (boardDeg === 90) return [300 - dy, 300 + dx];
  if (boardDeg === -90) return [300 + dy, 300 - dx];
  if (boardDeg === 180) return [300 - dx, 300 - dy];
  return [x, y];
}
function renderChrome() {
  if (!G) return;
  const cur = Ludo.currentColor(G);
  const mine = canAct();
  const banner = $('#turnBanner');
  banner.classList.remove('me');

  let main, hint = '';
  if (G.over) main = '🏁 Partie terminée';
  else if (!started) main = '⏳ En attente du lancement par l\'hôte…';
  else if (mode === 'local') main = `Au tour de ${EMOJI[cur]} ${nameOf(cur)}`;
  else if (mine) { main = `${EMOJI[cur]} À toi de jouer !`; banner.classList.add('me'); }
  else if (mode === 'ai') main = `${EMOJI[cur]} ${nameOf(cur)} (ordinateur)…`;
  else main = `⏳ Au tour de ${EMOJI[cur]} ${nameOf(cur)}`;

  if (mine && !G.over && started && !busy()) {
    if (G.phase === 'roll') hint = 'Clique sur les deux dés au milieu du plateau';
    else if (G.phase === 'move') {
      if (selectedDie != null) hint = 'Clique sur un pion pour le déplacer';
      else hint = 'Choisis un dé, ou clique sur un pion pour voir ses coups';
    }
  }
  banner.innerHTML = main + (hint ? `<br><small style="font-weight:500;color:var(--muted)">${hint}</small>` : '');

  harvestLogNotes();
  $('#players').innerHTML = G.players.map(p => {
    const active = !G.over && started && cur === p.color;
    let tag = '';
    if (!hotseat && started && you) {
      tag = (p.color === you) ? ' (vous)' : (mode === 'ai' ? ' (ordinateur)' : ' (ami)');
    }
    const note = boxNoteFor(p.color);
    return `<div class="pcard ${active ? 'active' : ''}">
      <span class="chip" style="background:${HEX[p.color]}"></span>
      <span class="who"><b>${esc(nameOf(p.color))}${tag}</b>
        <small>${p.pawns.filter(x => x === 56).length}/4 à la maison${p.rank ? ' — ' + MEDAL[p.rank] : ''}</small>
        ${note ? `<small class="pcard-note">${esc(note)}</small>` : ''}</span>
      <span class="pips">${pawnPips(p)}</span>
      <span class="medal">${p.rank ? MEDAL[p.rank] : ''}</span>
    </div>`;
  }).join('');

  const showFinish = !G.over && started && G.ranks.length > 0;
  $('#finishBtn').classList.toggle('hidden', !showFinish);

  $('#log').innerHTML = G.log.slice(-16).map(l => `<p>${l}</p>`).join('');
  $('#log').scrollTop = $('#log').scrollHeight;

  renderDice();
  renderHint();
}
function renderPanel() {
  applyBoardOrientation();
  renderChrome();
  syncPawns();
  checkOver();
  updateSimPauseUI();
  scheduleAi();
}
function toast(msg) {
  if (!msg) return;
  /* en jeu : la note part dans la case du joueur concerné — RIEN sur le plateau */
  const hit = ['red', 'green', 'yellow', 'blue'].filter((c) =>
    new RegExp('\\b' + LABEL[c] + '\\b', 'i').test(msg));
  const stamp = ++noteStamp;
  if (hit.length) hit.forEach((c) => { toastNotes[c] = { msg, stamp }; });
  else {
    let target = you;
    if (!target && G && G.players && G.players[G.turn]) target = G.players[G.turn].color;
    if (target) toastNotes[target] = { msg, stamp };
  }
  const inGame = !document.querySelector('#screen-game').classList.contains('hidden');
  if (inGame) { renderPanel(); return; }
  /* hors du jeu (menu/lobby) : barre en haut, jamais sur un plateau */
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ============================================================
   APPLICATION D'ÉTAT (diff -> animation + sons)
   ============================================================ */
function diceChanged(a, b) {
  return a.dice[0] !== b.dice[0] || a.dice[1] !== b.dice[1];
}
function playStateSounds(oldS, newS) {
  if (newS.ranks.length > oldS.ranks.length && !newS.over) Snd.finish();
  if (newS.over && !oldS.over) Snd.win();
}
function commitState(newG, newLegal, animate, oldState) {
  const old = oldState || G;

  /* une animation est déjà en cours : on diffère l'application */
  if (animate && animating && newG !== old) {
    queuedCommit = () => commitState(newG, newLegal, true);
    return;
  }

  G = newG;
  if (newLegal) legal = newLegal;
  else if (G.phase === 'move') legal = {
    0: Ludo.movesForDie(G, 0),
    1: Ludo.movesForDie(G, 1),
    sum: Ludo.movesForSum(G)
  };
  else legal = { 0: [], 1: [], sum: [] };

  if (!old) { syncSelection(); renderPanel(); return; }

  const revChanged = old.rev !== G.rev;
  if (!revChanged) {
    if (animating || rollAnim) renderChrome();
    else renderPanel();
    return;
  }

  hideMini();
  playStateSounds(old, G);
  syncSelection();

  const rolled = old.phase === 'roll' &&
    (diceChanged(old, G) || G.phase === 'move');

  if (animate && rolled && old.phase !== 'over') {
    startRollAnimation();
    renderChrome();
    syncPawns();
    return;
  }
  if (animate && old.phase !== 'over') {
    renderChrome();
    animateDiff(old, G, () => { renderPanel(); });
    return;
  }
  renderPanel();
}

/* ============================================================
   ACTIONS DE JEU
   ============================================================ */
async function doRoll(force) {
  if ((!canAct() && !force) || !G || G.phase !== 'roll' || busy()) return;
  hideMini();
  clearAuto();
  selectedDie = null;
  if (mode === 'local' || mode === 'ai' || mode === 'sim') {
    const old = JSON.parse(JSON.stringify(G));
    const r = Ludo.actionRoll(G);
    if (r.error) { toast(r.error); return; }
    commitState(G, null, true, old);
  } else {
    const resp = await postAction({ type: 'roll' });
    if (resp.error) { toast(resp.error); return; }
    applyServer(resp, true);
  }
}
async function executeMove(die, m, force) {
  if ((!canAct() && !force) || busy()) return;
  hideMini();
  if (mode === 'local' || mode === 'ai' || mode === 'sim') {
    const old = JSON.parse(JSON.stringify(G));
    const r = Ludo.actionMove(G, m.pawn, m.to, die);
    if (r.error) { toast(r.error); return; }
    commitState(G, null, true, old);
    /* plus de commentaire sur le plateau à chaque coup (le journal reste
       visible dans le panneau de droite) */
  } else {
    const resp = await postAction({ type: 'move', pawn: m.pawn, to: m.to, die });
    if (resp.error) { toast(resp.error); return; }
    applyServer(resp, true);
  }
  /* si le reste du tour n'offre plus aucun choix (pion unique, dé sans
     alternative), l'auto-jeu reprend tout seul */
  maybeAutoSinglePawn();
}
function onPawnClick(color, idx) {
  Snd.unlock();
  clearAuto();
  if (!G || G.over || busy() || G.phase !== 'move' || !canAct()) return;
  if (color !== Ludo.currentColor(G)) return;

  /* option « somme des deux dés » (recul-capture combiné) */
  const sumMs = (legal.sum || []).filter(m => m.pawn === idx);

  const p = playableClient();
  if (!p.length && !sumMs.length) return;

  /* quels dés peuvent déplacer ce pion individuellement ? */
  const candidates = p.filter(d => (legal[d] || []).some(m => m.pawn === idx));
  if (!candidates.length) {
    /* aucun dé seul ne le peut : la somme des 2 dés est le seul choix → évident */
    if (sumMs.length === 1) { executeMove('sum', sumMs[0]); return; }
    if (sumMs.length > 1) {
      const optsTmp = sumMs.map(m => ({ m, die: 'sum' }));
      if (optsTmp.length === 1) { executeMove('sum', optsTmp[0].m); return; }
      showMiniChoice('sum', optsTmp);
      return;
    }
    toast('Ce pion ne peut pas bouger pour l\'instant.');
    return;
  }

  /* choix évident : le dé sélectionné s'il convient, sinon le seul dé qui convient,
     ou les deux dés identiques (double) */
  let die = null;
  if (selectedDie != null && candidates.includes(selectedDie)) die = selectedDie;
  else if (candidates.length === 1) die = candidates[0];
  else if (selectedDie == null && G.dice[0] === G.dice[1]) die = candidates[0];

  if (die == null) {
    /* pas de dé choisi : le jeu ne refuse JAMAIS — il montre toutes les
       options libellées (avancer / reculer / somme) et ne joue seul que
       s'il n'y a qu'un seul coup possible */
    const optsAll = [];
    candidates.forEach(d => (legal[d] || [])
      .filter(m => m.pawn === idx)
      .forEach(m => optsAll.push({ m, die: d })));
    sumMs.forEach(m => optsAll.push({ m, die: 'sum' }));
    if (optsAll.length === 1) executeMove(optsAll[0].die, optsAll[0].m);
    else showMiniChoice(candidates[0], optsAll);
    return;
  }

  const changed = die !== selectedDie;
  selectedDie = die;
  const ms = (legal[die] || []).filter(m => m.pawn === idx);

  /* les options de ce pion : coups du dé choisi… */
  const opts = ms.map(m => ({ m, die }));
  /* …le recul de l'AUTRE dé (ne jamais rater un manger en arrière)… */
  if (G.dice[0] !== G.dice[1]) {
    const other = 1 - die;
    if (!G.dieUsed[other]) (legal[other] || [])
      .filter(m => m.pawn === idx && m.type === 'bwd')
      .forEach(m => opts.push({ m, die: other }));
  }
  /* …et la somme des deux dés */
  sumMs.forEach(m => opts.push({ m, die: 'sum' }));

  if (changed) renderPanel();          /* le dé sélectionné vient de basculer */
  if (opts.length === 1) executeMove(opts[0].die, opts[0].m);
  else showMiniChoice(die, opts);
}
async function doFinish() {
  if (!G || G.over) return;
  if (!confirm('Arrêter la partie ici et établir le classement ?')) return;
  if (mode === 'local' || mode === 'ai' || mode === 'sim') {
    const old = JSON.parse(JSON.stringify(G));
    Ludo.finishNow(G);
    commitState(G, null, true, old);
  } else {
    const resp = await postAction({ type: 'finish' });
    if (resp.error) { toast(resp.error); return; }
    applyServer(resp, false);
  }
}

/* ============================================================
   ORDINATEUR (IA)
   ============================================================ */
function isAiTurn() {
  if (mode === 'sim' && G && !G.over && started) return true;
  return mode === 'ai' && G && !G.over && started && aiColors.has(Ludo.currentColor(G));
}
function setSimPaused(v){
  simPaused = !!v;
  if (simPaused){ clearTimeout(aiTimer); aiTimer=null; clearAuto(); }
  else if (mode==='sim' && started && G && !G.over) scheduleAi();
  updateSimPauseUI();
}
function updateSimPauseUI(){
  const wrap = document.querySelector('#simControls');
  const btn = document.querySelector('#simPauseBtn');
  const ov = document.querySelector('#simPauseOverlay');
  const show = mode==='sim' && started && !G.over;
  if (wrap) wrap.classList.toggle('hidden', !show);
  if (ov) ov.classList.toggle('hidden', !simPaused || !show);
  if (btn){
    btn.textContent = simPaused ? '▶️ Reprendre' : '⏸️ Pause';
    btn.classList.toggle('primary', !simPaused);
    btn.classList.toggle('warn', simPaused);
  }
  const hint = document.querySelector('#diceHint');
  if (hint && mode==='sim' && show) hint.textContent = simPaused ? '⏸️ Simulation en pause' : '🔬 Simulation en cours…';
}
function scheduleAi() {
  clearTimeout(aiTimer); aiTimer = null;
  if (simPaused) return;
  if (!isAiTurn() || busy()) return;
  const sim = mode === 'sim';
  aiTimer = setTimeout(aiStep, sim ? (G.phase === 'roll' ? 420 : 260) : (G.phase === 'roll' ? 650 : 430));
}
function aiStep() {
  aiTimer = null;
  if (simPaused) return;
  if (!isAiTurn() || busy()) { if (isAiTurn()) scheduleAi(); return; }
  if (G.phase === 'roll') { doRoll(true); return; }
  if (G.phase === 'move') {
    const best = pickAiMove();
    if (best) executeMove(best.die, best.m, true);
    else scheduleAi();
  }
}
function pickAiMove() {
  let best = null;
  [0, 1].forEach(i => {
    if (G.dieUsed[i]) return;
    (legal[i] || []).forEach(m => {
      const s = scoreAi(m, i);
      if (!best || s > best.s) best = { die: i, m, s };
    });
  });
  /* somme des deux dés : recul-capture combiné */
  (legal.sum || []).forEach(m => {
    const s = scoreAi(m, 'sum');
    if (!best || s > best.s) best = { die: 'sum', m, s };
  });
  return best;
}
function scoreAi(m, dieIdx) {
  const v = dieIdx === 'sum' ? (G.dice[0] + G.dice[1]) : G.dice[dieIdx];
  const col = Ludo.currentColor(G);
  let s = Math.random() * 8;
  if (m.to === 56) s += 160;              // rentrer un pion
  if (m.capture) s += 110;                // manger
  if (m.type === 'out') s += 80;          // sortir de la base
  s += m.to * 0.4;                        // avancer
  if (m.to <= 50 && !Ludo.isIntruderPos(m.to)) {
    const d = Ludo.ringIdxOf(col, m.to);
    if (Ludo.SAFE[d]) s += 26;
    else {
      let danger = false;
      for (const p of G.players) {
        if (p.color === col) continue;
        for (const pos of p.pawns) {
          if ((pos < 0 && pos !== -2) || pos > 50) continue;
          const r = Ludo.ringIdxOf(p.color, pos);
          const f = (d - r + 52) % 52; if (f >= 1 && f <= 6) danger = true;
          const b = (r - d + 52) % 52; if (b >= 1 && b <= 6) danger = true;
        }
        if (danger) break;
      }
      if (danger) s -= 55;                // risque d'être mangé
    }
  }
  return s;
}

/* ============================================================
   ÉCRANS / DÉMARRAGE
   ============================================================ */
function renderMyColor() {
  const el = document.querySelector('#myColorBadge');
  if (!el) return;
  const onGame = !document.querySelector('#screen-game').classList.contains('hidden');
  const onLobby = !document.querySelector('#screen-lobby').classList.contains('hidden');
  let html = '';
  if (onGame || onLobby) {
    if ((mode === 'online' || mode === 'ai') && you) {
      html = `<span class="chip" style="background:${HEX[you]}"></span> Ta couleur : ${LABEL[you]}`;
    } else if (mode === 'local' && G && G.players) {
      html = G.players.map((p) => `<span class="chip" style="background:${HEX[p.color]}"></span> ${LABEL[p.color]}`)
        .join('<span style="opacity:.45"> · </span>');
    }
  }
  el.innerHTML = html;
  el.classList.toggle('hidden', !html);
}
function showScreen(name) {
  clearAuto();
  ['menu', 'setup', 'lobby', 'game'].forEach(s =>
    $('#screen-' + s).classList.toggle('hidden', s !== name));
  if (name==='menu') setSimPaused(false);
  if (mode === 'online' && room.code && (name === 'lobby' || name === 'game')) startWatch();
  else stopWatch();
  renderMyColor();
  updateSimPauseUI();
}
function checkOver() {
  if (G && G.over && !overShown) {
    overShown = true;
    setTimeout(showOver, 900);
  }
}
function showOver() {
  const list = $('#overList');
  const order = G.ranks.slice();
  G.players.forEach(p => { if (!order.includes(p.color)) order.push(p.color); });
  list.innerHTML = order.map((c, i) =>
    `<li>${MEDAL[i + 1] || (i + 1) + '.'} <span class="chip" style="background:${HEX[c]}"></span> <b style="color:${HEX[c]}">${esc(nameOf(c))}</b></li>`).join('');
  renderBilan();
  $('#modalOver').classList.remove('hidden');
}
/* bilan des captures : le plus violent (pions mangés) et le plus violenté
   (pions perdus), plus le tableau complet */
function renderBilan() {
  const el = $('#overBilan');
  if (!el) return;
  const st = G.stats || {};
  const rows = G.players.map(p => ({
    c: p.color,
    ate: (st[p.color] && st[p.color].ate) || 0,
    lost: (st[p.color] && st[p.color].lost) || 0
  }));
  const maxA = Math.max(0, ...rows.map(r => r.ate));
  const maxL = Math.max(0, ...rows.map(r => r.lost));
  let b = '';
  if (maxA === 0 && maxL === 0) {
    b = '<p class="bilan-line">😌 Aucune capture pendant la partie.</p>';
  } else {
    if (maxA > 0) {
      const vil = rows.filter(r => r.ate === maxA).map(r => esc(nameOf(r.c))).join(', ');
      b += `<p class="bilan-line">🗡️ <b>Le plus violent :</b> ${vil} — ` +
        `${maxA} pion${maxA > 1 ? 's' : ''} mangé${maxA > 1 ? 's' : ''}</p>`;
    }
    if (maxL > 0) {
      const vic = rows.filter(r => r.lost === maxL).map(r => esc(nameOf(r.c))).join(', ');
      b += `<p class="bilan-line">😵 <b>Le plus violenté :</b> ${vic} — ` +
        `${maxL} pion${maxL > 1 ? 's' : ''} perdu${maxL > 1 ? 's' : ''}</p>`;
    }
  }
  b += '<table class="bilan-table"><tr><th></th><th>mangés</th><th>perdus</th></tr>' +
    rows.map(r => `<tr><td><span class="chip" style="background:${HEX[r.c]}"></span> <b style="color:${HEX[r.c]}">${esc(nameOf(r.c))}</b></td>` +
      `<td>${r.ate}</td><td>${r.lost}</td></tr>`).join('') +
    '</table>';
  el.innerHTML = b;
}

function renderSwatches(container, current, onPick) {
  container.innerHTML = '';
  Ludo.COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === current ? ' sel' : '');
    b.style.background = HEX[c];
    b.textContent = c === current ? '✓' : '';
    b.title = LABEL[c];
    b.onclick = () => onPick(c);
    container.appendChild(b);
  });
}
function renderSetup() {
  const isAi = setupKind === 'ai', isOnline = setupKind === 'online', isSim = setupKind === 'sim';
  $('#setupTitle').textContent =
    isAi ? 'Jouer contre l\'ordinateur' :
    isOnline ? (onlineCount === 2 ? 'Partie en ligne à deux' : 'Partie en ligne à ' + onlineCount + ' joueurs') :
    isSim ? (simCount === 2 ? 'Simulateur à deux' : 'Simulateur à ' + simCount + ' joueurs') :
    (localCount === 2 ? 'Partie locale à deux' : 'Partie locale à ' + localCount + ' joueurs');
  const isLocal = !isAi && !isOnline && !isSim;
  $('#pick1Title').textContent = (isAi || isOnline) ? 'Ta couleur' : 'Joueur 1';
  $('#pick1').parentElement.classList.toggle('hidden', isLocal);
  $('#pick2Block').classList.toggle('hidden', !isLocal ? true : false);
  // en local on cache les pick1/pick2 simples, on affiche le bloc complet
  if (isLocal) {
    $('#pick1').parentElement.classList.add('hidden');
    $('#pick2Block').classList.add('hidden');
    $('#localPlayersBlock').classList.remove('hidden');
    // ajuster la taille de localPlayers selon localCount
    while (localPlayers.length < localCount) {
      const used = localPlayers.slice(0, localCount-1).map(p=>p.color);
      const avail = Ludo.COLORS.find(c=>!used.includes(c)) || Ludo.COLORS[localPlayers.length % 4];
      localPlayers.push({ name: 'Joueur ' + (localPlayers.length+1), color: avail });
    }
    const cont = $('#localPlayers');
    cont.innerHTML = '';
    for (let i=0;i<localCount;i++) {
      const pl = localPlayers[i];
      const row = document.createElement('div');
      row.className = 'local-player-row';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap';
      const lab = document.createElement('span');
      lab.textContent = 'Joueur ' + (i+1);
      lab.style.cssText = 'min-width:70px;font-weight:600';
      const inp = document.createElement('input');
      inp.type='text'; inp.value=pl.name; inp.placeholder='Nom'; inp.maxLength=16;
      inp.style.cssText = 'flex:1;min-width:90px;padding:6px 8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f1f5f9';
      inp.oninput = (e)=>{ localPlayers[i].name = e.target.value; };
      const sw = document.createElement('div');
      sw.className = 'swatches';
      sw.style.cssText = 'display:flex;gap:6px';
      Ludo.COLORS.forEach(c=>{
        const b=document.createElement('button');
        const taken = localPlayers.some((p,idx)=> idx!==i && p.color===c);
        b.className='swatch' + (c===pl.color?' sel':'') + (taken?' taken':'');
        b.style.background=HEX[c];
        b.style.opacity=taken?'0.35':'';
        b.title=LABEL[c] + (taken?' (déjà pris)':'');
        b.textContent=c===pl.color?'✓':'';
        b.onclick=()=>{
          const otherIdx = localPlayers.findIndex((p,idx)=> idx!==i && p.color===c);
          if (otherIdx!==-1) {
            const tmp=localPlayers[otherIdx].color;
            localPlayers[otherIdx].color=pl.color;
            localPlayers[i].color=c;
          } else {
            localPlayers[i].color=c;
          }
          renderSetup();
        };
        sw.appendChild(b);
      });
      row.appendChild(lab); row.appendChild(inp); row.appendChild(sw);
      cont.appendChild(row);
    }
  } else {
    $('#localPlayersBlock').classList.add('hidden');
    $('#pick1').parentElement.classList.remove('hidden');
  }
  $('#localCountBlock').classList.toggle('hidden', !isLocal);
  $('#aiCountBlock').classList.toggle('hidden', !isAi);
  $('#simCountBlock').classList.toggle('hidden', !isSim);
  $('#simPlayersBlock').classList.toggle('hidden', !isSim);
  $('#onlineCountBlock').classList.toggle('hidden', !isOnline);
  if (isSim) {
    // ajuster simPlayers selon simCount
    while (simPlayers.length < simCount) {
      const used = simPlayers.slice(0, simCount-1).map(p=>p.color);
      const avail = Ludo.COLORS.find(c=>!used.includes(c)) || Ludo.COLORS[simPlayers.length % 4];
      simPlayers.push({ name: 'Ordi ' + (simPlayers.length+1), color: avail });
    }
    const contS = $('#simPlayers');
    contS.innerHTML = '';
    for (let i=0;i<simCount;i++) {
      const pl = simPlayers[i];
      const row = document.createElement('div');
      row.className = 'local-player-row';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap';
      const lab = document.createElement('span');
      lab.textContent = 'Ordi ' + (i+1);
      lab.style.cssText = 'min-width:70px;font-weight:600';
      const inp = document.createElement('input');
      inp.type='text'; inp.value=pl.name; inp.placeholder='Nom'; inp.maxLength=16;
      inp.style.cssText = 'flex:1;min-width:90px;padding:6px 8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f1f5f9';
      inp.oninput = (e)=>{ simPlayers[i].name = e.target.value; };
      const sw = document.createElement('div');
      sw.className = 'swatches'; sw.style.cssText = 'display:flex;gap:6px';
      Ludo.COLORS.forEach(c=>{
        const b=document.createElement('button');
        const taken = simPlayers.some((p,idx)=> idx!==i && p.color===c && idx < simCount);
        b.className='swatch' + (c===pl.color?' sel':'') + (taken?' taken':'');
        b.style.background=HEX[c]; b.style.opacity=taken?'0.35':'';
        b.title=LABEL[c] + (taken?' (déjà pris)':'');
        b.textContent=c===pl.color?'✓':'';
        b.onclick=()=>{
          const otherIdx = simPlayers.findIndex((p,idx)=> idx!==i && p.color===c && idx < simCount);
          if (otherIdx!==-1) { const tmp=simPlayers[otherIdx].color; simPlayers[otherIdx].color=pl.color; simPlayers[i].color=c; } else simPlayers[i].color=c;
          renderSetup();
        };
        sw.appendChild(b);
      });
      row.appendChild(lab); row.appendChild(inp); row.appendChild(sw);
      contS.appendChild(row);
    }
  }
  $('#onlineNameBlock').classList.toggle('hidden', !isOnline);
  $('#setupHint').textContent = isAi
    ? (aiCount === 4 ? 'Tu joues contre 3 ordinateurs.' : aiCount === 3 ? 'Tu joues contre 2 ordinateurs.' : 'Tu joues contre 1 ordinateur.')
    : 'Tous les parcours ont la même longueur : choisis ce que tu veux !';

  if (!isLocal) {
    renderSwatches($('#pick1'), setupColors.c1, (c) => {
      setupColors.c1 = c;
      if (!isAi && !isOnline && setupColors.c2 === c) {
        setupColors.c2 = Ludo.COLORS.find(x => x !== c);
      }
      renderSetup();
    });
    if (!isAi && !isOnline) {
      renderSwatches($('#pick2'), setupColors.c2, (c) => {
        setupColors.c2 = c;
        if (setupColors.c1 === c) setupColors.c1 = Ludo.COLORS.find(x => x !== c);
        renderSetup();
      });
    }
  }
}

function clearFx() {
  clearInterval(rollCycler); rollCycler = null;
  clearTimeout(rollTimer);
  clearTimeout(aiTimer); aiTimer = null;
  clearAuto();
  animating = false; rollAnim = false;
  queuedCommit = null;
}

/* ---------- mode « zéro clic » : un seul pion en jeu = le jeu joue seul ---------- */
function clearAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  autoLastRev = null; autoStall = 0;
}
function activeCount() {
  if (!G) return 99;
  return G.players[G.turn].pawns.filter(
    p => p === -2 || Ludo.isIntruderPos(p) || (p >= 0 && p < 56)).length;
}
/* Y a-t-il un VRAI choix à faire ? L'auto-jeu n'a le droit de jouer que
   les coups sans alternative :
   - un dé encore jouable propose ≥2 coups (ex. un6 : sortir un pion de la
     base OU avancer celui qui est déjà en jeu) ;
   - ou une capture à la somme des2 dés est possible (recul vs avancer). */
function humanChoiceNeeded() {
  if (!G) return false;
  for (const i of [0, 1]) {
    if (G.dieUsed[i]) continue;
    if ((legal[i] || []).length >= 2) return true;
  }
  // somme : seul un recul-manger (capture) exige un vrai choix humain
  if ((legal.sum || []).some(m => m.capture)) return true;
  return false;
}
function humanChoiceHint() {
  const six = [0, 1].some(i => !G.dieUsed[i] && G.dice[i] === 6 &&
    (legal[i] || []).length >= 2);
  if (six) toast("🎲 6 ! À toi de choisir : clique sur un pion de la BASE pour sortir, ou sur ton pion EN JEU pour avancer.");
  else toast('♻️ Manger en arrière avec la somme possible — clique sur le pion concerné !');
}
function maybeAutoSinglePawn() {
  if (window.__LUDO_AUTOPLAY__ === false) return;
  if (!G || G.over || G.phase !== 'move' || !canAct()) return;
  if (activeCount() !== 1) return;
  clearAuto();
  autoTimer = setTimeout(autoStep, 600);
}
function autoStep() {
  autoTimer = null;
  if (window.__LUDO_AUTOPLAY__ === false) return;
  if (!G || G.over || G.phase !== 'move' || !canAct()) return;
  if (activeCount() !== 1) return;          /* un2e pion est sorti : l'humain reprend */
  if (busy()) { autoTimer = setTimeout(autoStep, 350); return; }
  if (G.rev === autoLastRev) {              /* en attente d'une réponse en ligne */
    autoStall++;
    if (autoStall > 4) { clearAuto(); return; }
    autoTimer = setTimeout(autoStep, 400);
    return;
  }
  autoStall = 0;
  /* un vrai choix attend l'humain (ex.6 : sortir ou avancer) → on s'arrête
     et on l'invite à décider ; l'auto ne reprendra que s'il ne reste plus
     aucun choix (ou au jet suivant) */
  if (humanChoiceNeeded()) { clearAuto(); humanChoiceHint(); return; }
  const best = pickAiMove();                /* le meilleur coup du pion unique */
  if (!best) return;
  autoLastRev = G.rev;
  executeMove(best.die, best.m);
  if (!autoTimer) autoTimer = setTimeout(autoStep, 900);
}
function startSim() {
  mode = 'sim'; hotseat = false; you = null;
  const cols = simPlayers.slice(0, simCount).map(p=>p.color);
  const names = simPlayers.slice(0, simCount).map(p=>p.name.trim()||('Ordi '+(simPlayers.indexOf(p)+1)));
  started = true; overShown = false; selectedDie = null; simPaused = false;
  clearFx();
  $('#modalOver').classList.add('hidden');
  G = Ludo.createGame(cols);
  roomNames = names.slice(); while (roomNames.length < 4) roomNames.push('');
  aiColors = new Set(cols); // toutes les couleurs sont des IA
  seats = G.players.map((p,i)=>({ seat:i, color:p.color, joined:true }));
  legal = { 0:[],1:[], sum:[] };
  showScreen('game');
  renderPanel();
}
function startLocal() {
  mode = 'local'; hotseat = true; you = null; aiColors = new Set();
  started = true; overShown = false; selectedDie = null;
  clearFx();
  $('#modalOver').classList.add('hidden');
  const cols = localPlayers.slice(0, localCount).map(p=>p.color);
  const names = localPlayers.slice(0, localCount).map(p=>p.name.trim()||('Joueur '+(localPlayers.indexOf(p)+1)));
  G = Ludo.createGame(cols);
  roomNames = names.slice();
  // compléter roomNames pour l'affichage des 4 couleurs
  while (roomNames.length < 4) roomNames.push('');
  seats = G.players.map((p, i) => ({ seat: i, color: p.color, joined: true }));
  legal = { 0: [], 1: [], sum: [] };
  showScreen('game');
  renderPanel();
}
function startAiGame() {
  mode = 'ai'; hotseat = false; overShown = false; selectedDie = null;
  started = true;
  clearFx();
  $('#modalOver').classList.add('hidden');
  const human = setupColors.c1;
  const others = Ludo.COLORS.filter(c => c !== human);
  const ais = aiCount === 2 ? [Ludo.OPPOSITE[human]] : aiCount === 3 ? others.slice(0,2) : others;
  aiColors = new Set(ais);
  you = human;
  G = Ludo.createGame([human, ...ais]);
  seats = G.players.map((p, i) => ({ seat: i, color: p.color, joined: true }));
  legal = { 0: [], 1: [], sum: [] };
  showScreen('game');
  renderPanel();
}

/* ============================================================
   RÉSEAU (partie en ligne) — Firebase si configuré, sinon le serveur
   ============================================================ */
async function startWatch() {
  const seq = ++watchSeq;
  if (watchStop) { try { watchStop(); } catch (e) {} watchStop = null; }
  if (mode !== 'online' || !room.code || !Backend) return;
  try {
    const stop = await Backend.watch(room.code, room.token, onRoomState);
    if (seq !== watchSeq) { try { stop && stop(); } catch (e) {} return; }
    watchStop = stop;
  } catch (e) { /* réessaiera au prochain affichage */ }
}
function stopWatch() {
  watchSeq++;
  if (watchStop) { try { watchStop(); } catch (e) {} watchStop = null; }
}
function onRoomState(resp) {
  if (!resp) return;
  if (resp.error) {
    stopWatch();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    showScreen('menu');
    toast(resp.error);
    return;
  }
  applyServer(resp, true);
}
async function postAction(action) {
  return Backend.action(room.code, room.token, action);
}
function roomLink() {
  return location.origin + location.pathname + '?room=' + room.code;
}
function applyServer(resp, animate) {
  const wasStarted = started;
  you = resp.you ? resp.you.color : null;
  youSeatNum = (resp.you && typeof resp.you.seat === 'number') ? resp.you.seat : -1;
  seats = resp.seats || seats;
  if (resp.names && resp.names.length >= 2) { roomNames = resp.names.slice(); while(roomNames.length < 4) roomNames.push(''); }
  started = resp.started === true;
  if (started && !wasStarted && mode === 'online') showScreen('game');
  if (!started && wasStarted && mode === 'online' &&
      !document.querySelector('#screen-game').classList.contains('hidden')) showScreen('lobby');
  if (G && overShown && !resp.state.over) {
    overShown = false;
    $('#modalOver').classList.add('hidden');
  }
  commitState(resp.state, resp.legal, animate);
  if (mode === 'online' && !document.querySelector('#screen-lobby').classList.contains('hidden')) renderLobby();
}
function renderLobby() {
  const box = document.querySelector('#lobbyPlayers');
  if (!box) return;
  const list = seats || [];
  box.innerHTML = list.map((s) => {
    const raw = roomNames[s.seat] ? String(roomNames[s.seat]).trim() : '';
    const nm = raw || (s.joined ? 'Joueur ' + (s.seat + 1) : 'en attente…');
    const isYou = s.joined && s.seat === youSeatNum;
    const st = !s.joined ? '<small class="lobby-st">en attente…</small>'
      : isYou ? `<small class="lobby-st">toi${youSeatNum === 0 ? ' — hôte' : ''}</small>`
      : '<small class="lobby-st">prêt ✓</small>';
    let sw = '';
    if (s.joined && !started) {
      sw = '<span class="mini-sws">' + Ludo.COLORS.map((c) =>
        `<button class="mini-sw${c === s.color ? ' sel' : ''}" data-color="${c}" style="background:${HEX[c]}" ` +
        `title="${LABEL[c]}"${s.seat === youSeatNum ? '' : ' disabled'}></button>`).join('') + '</span>';
    }
    return `<div class="pcard lobby-card${s.joined ? ' joined' : ''}">
      <span class="chip" style="background:${HEX[s.color]}"></span>
      <span class="who"><b>${esc(nm)}</b>${st}</span>${sw}
    </div>`;
  }).join('');
  box.querySelectorAll('.mini-sw:not([disabled])').forEach((btn) => {
    btn.onclick = async () => {
      const r = await postAction({ type: 'color', color: btn.dataset.color });
      if (r && r.error) toast(r.error);
      else if (r) applyServer(r, false);
    };
  });
  const total = list.length;
  const joined = list.filter(s=>s.joined).length;
  const allJoined = total>=2 && list.every(s=>s.joined);
  const both = allJoined; // compat
  const host = youSeatNum === 0;
  const inv = document.querySelector('#lobbyInvite');
  if (inv) inv.textContent = total>2 ? 'Envoie ce code (ou le lien) à tes amis :' : 'Envoie ce code (ou le lien) à ton ami :';
  const t = document.querySelector('#lobbyTitle');
  if (t) t.textContent = (!allJoined ? 'Partie créée ! ('+joined+'/'+total+')' : (host ? 'Tout le monde est prêt !' : 'Tu as rejoint !')) + ' · ' + APP_VERSION;
  const startBtn = document.querySelector('#btnHostStart');
  if (startBtn) startBtn.classList.toggle('hidden', !(host && allJoined && !started));
  const wait = document.querySelector('#lobbyWaiting');
  if (wait) {
    if (started) wait.classList.add('hidden');
    else if (!allJoined) {
      wait.classList.remove('hidden');
      wait.innerHTML = host
        ? '<span class="spinner"></span> En attente des autres joueurs ('+joined+'/'+total+')… partage le lien&nbsp;!'
        : '<span class="spinner"></span> En attente que l\'hôte lance la partie ('+joined+'/'+total+')…';
    } else if (!host) {
      wait.classList.remove('hidden');
      wait.innerHTML = '<span class="spinner"></span> L\'hôte va lancer la partie…';
    } else {
      wait.classList.remove('hidden');
      wait.innerHTML = '✅ Tout le monde est prêt — lance la partie&nbsp;!';
    }
  }
}
async function createOnline() {
  const nameEl = document.querySelector('#onlineName');
  const resp = await Backend.createRoom(setupColors.c1, nameEl ? nameEl.value : '', onlineCount);
  if (resp.error) { alert(resp.error); return; }
  room = { code: resp.code, token: resp.token };
  localStorage.setItem('ludo_t_' + room.code, room.token);
  try { history.replaceState(null, '', '?room=' + room.code); } catch (e) {}
  $('#lobbyCode').textContent = room.code;
  $('#lobbyLink').value = roomLink();
  overShown = false;
  showScreen('lobby'); /* démarre l'écoute (startWatch) */
  renderLobby();
}
async function joinOnline(code, allowSpectate) {
  code = (code || '').trim().toUpperCase();
  if (!code) { showJoinError('Entre un code.'); return; }
  /* déjà un token enregistré pour cette partie ? */
  const saved = localStorage.getItem('ludo_t_' + code);
  if (saved) {
    const r = await Backend.getState(code, saved);
    if (r && !r.error && r.you) {
      room = { code, token: saved };
      overShown = false;
      applyServer(r, false);
      showScreen(r.started ? 'game' : 'lobby');
      if (!r.started) {
        $('#lobbyCode').textContent = code;
        $('#lobbyLink').value = roomLink();
        renderLobby();
      }
      return;
    }
    localStorage.removeItem('ludo_t_' + code);
  }
  const joinNameEl = document.querySelector('#joinName');
  const resp = await Backend.joinRoom(code, joinNameEl ? joinNameEl.value : '');
  if (resp && resp.error === 'full') {
    const msg = resp.max ? 'Cette partie est complète ('+resp.max+' joueurs max).' : 'Cette partie a déjà 2 joueurs.';
    if (!allowSpectate) { showJoinError(msg); return; }
    const r = await Backend.getState(code, null);
    if (r && !r.error) {
      room = { code, token: null };
      overShown = false;
      applyServer(r, false);
      showScreen('game');
      toast('Mode observation 👁');
    } else showJoinError('Code invalide ou partie introuvable.');
    return;
  }
  if (!resp || resp.error) { showJoinError((resp && resp.error) || 'Erreur réseau.'); return; }
  room = { code: resp.code, token: resp.token };
  localStorage.setItem('ludo_t_' + room.code, room.token);
  try { history.replaceState(null, '', '?room=' + room.code); } catch (e) {}
  overShown = false;
  applyServer(resp, false);
  showScreen(resp.started ? 'game' : 'lobby');
  if (!resp.started) renderLobby();
}
function showJoinError(msg) {
  $('#joinBox').classList.remove('hidden');
  $('#joinError').textContent =
    msg === 'Partie introuvable (code invalide).' ? 'Code invalide ou partie introuvable.' : msg;
}

/* ============================================================
   ÉVÉNEMENTS / INIT
   ============================================================ */
function bind() {
  $('#btnAi').onclick = () => { setupKind = 'ai'; renderSetup(); showScreen('setup'); };
  $('#btnLocal').onclick = () => { setupKind = 'local'; renderSetup(); showScreen('setup'); };
  $('#btnSim').onclick = () => { setupKind = 'sim'; renderSetup(); showScreen('setup'); };
  $('#btnCreate').onclick = () => { setupKind = 'online'; renderSetup(); showScreen('setup'); };
  $('#btnJoinShow').onclick = () => {
    $('#joinBox').classList.toggle('hidden');
    $('#joinError').textContent = '';
    $('#joinCode').focus();
  };
  $('#btnJoin').onclick = () => { mode = 'online'; hotseat = false; joinOnline($('#joinCode').value, false); };
  $('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });

  $('#btnBackMenu').onclick = () => showScreen('menu');
  $('#btnStart').onclick = () => {
    if (setupKind === 'ai') startAiGame();
    else if (setupKind === 'online') { mode = 'online'; hotseat = false; createOnline(); }
    else if (setupKind === 'sim') startSim();
    else startLocal();
  };
  $('#aiCount').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      aiCount = +b.dataset.n;
      $('#aiCount').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
      renderSetup();
    };
  });
  $('#simCount').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      simCount = +b.dataset.n;
      $('#simCount').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
      renderSetup();
    };
  });
  $('#localCount').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      localCount = +b.dataset.n;
      $('#localCount').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
      renderSetup();
    };
  });
  $('#onlineCount').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      onlineCount = +b.dataset.n;
      $('#onlineCount').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
      renderSetup();
    };
  });

  $('#btnCopy').onclick = async () => {
    const inp = $('#lobbyLink');
    try { await navigator.clipboard.writeText(inp.value); } catch (e) { inp.select(); document.execCommand('copy'); }
    toast('Lien copié !');
  };
  $('#btnHostStart').onclick = async () => {
    if (!room || !room.code) return;
    const r = await postAction({ type: 'start' });
    if (r && r.error) toast(r.error);
    else if (r) applyServer(r, false);
  };
  $('#btnLeaveLobby').onclick = () => { stopWatch(); showScreen('menu'); };
  $('#btnLeave').onclick = () => {
    if (mode === 'online' && !confirm('Quitter la partie ? (tu pourras revenir avec le lien)')) return;
    stopWatch();
    clearTimeout(aiTimer);
    setSimPaused(false);
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    showScreen('menu');
  };

  const simBtn=$('#simPauseBtn'); if(simBtn) simBtn.onclick = () => setSimPaused(!simPaused);
  $('#die0').onclick = () => onDieClick(0);
  $('#die1').onclick = () => onDieClick(1);
  $('#diceHint').onclick = () => {
    if (!G || busy()) return;
    if (G.phase === 'roll' && canAct()) doRoll();
  };
  $('#finishBtn').onclick = doFinish;

  const openRules = () => $('#modalRules').classList.remove('hidden');
  ['#btnRules', '#btnRules2', '#btnRules3'].forEach(s => { $(s).onclick = openRules; });
  $('#btnCloseRules').onclick = () => $('#modalRules').classList.add('hidden');
  $('#modalRules').onclick = (e) => { if (e.target.id === 'modalRules') $('#modalRules').classList.add('hidden'); };

  $('#btnReplay').onclick = async () => {
    $('#modalOver').classList.add('hidden');
    overShown = false;
    if (mode === 'local') startLocal();
    else if (mode === 'ai') startAiGame();
    else {
      const resp = await postAction({ type: 'restart' });
      if (resp.error) { toast(resp.error); return; }
      applyServer(resp, false);
      if (!started) { showScreen('lobby'); renderLobby(); }
    }
  };
  $('#btnOverMenu').onclick = () => {
    $('#modalOver').classList.add('hidden');
    stopWatch(); showScreen('menu');
  };

  $('#board').addEventListener('click', () => hideMini());
  document.addEventListener('click', () => Snd.unlock(), { passive: true });
}

async function init() {
  document.title = 'Ludo — jeu à deux ou à quatre (' + APP_VERSION + ')';
  buildBoard();
  bind();
  /* backend de partie en ligne : Firebase si configuré, sinon le serveur (Arena) */
  Backend = LudoBackends.pick({
    engine: Ludo,
    config: window.FIREBASE_CONFIG || null,
    fetchFn: (u, o) => fetch(u, o),
    loadFirestore: async (cfg) => {
      const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
      const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      const app = appMod.initializeApp(cfg);
      return { db: fsMod.getFirestore(app), api: fsMod };
    }
  });
  window.__LUDO_TEST__ = () => ({
    mode, phase: G && G.phase, turn: G && G.turn, over: G && G.over,
    dice: G && G.dice.slice(), logLen: G && G.log.length,
    selectedDie, you, current: G && Ludo.currentColor(G),
    ranks: G && G.ranks.slice(),
    legalLen: [(legal[0] || []).length, (legal[1] || []).length],
    sumLen: (legal.sum || []).length,
    bwdLen: (legal[0] || []).concat(legal[1] || []).filter(m => m.type === 'bwd').length,
    dieUsed: G && G.dieUsed.slice()
  });
  /* test uniquement : fabrique un état pour valider l'interface */
  window.__LUDO_TEST__SET__ = (mut) => {
    if (!G) return;
    clearAuto();
    const old = JSON.parse(JSON.stringify(G));
    mut(G);
    G.rev++;
    commitState(G, null, true, old);
  };
  const params = new URLSearchParams(location.search);
  const rc = params.get('room');
  if (rc) {
    mode = 'online'; hotseat = false;
    $('#joinCode').value = rc;
    await joinOnline(rc, true);
    return;
  }
  showScreen('menu');
}
init();
