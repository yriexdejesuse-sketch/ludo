'use strict';
/* ============================================================
   Ludo — interface : 2 dés au milieu du plateau, clic sur le pion,
   mode contre l'ordinateur (2 ou 4 joueurs), sons synthétisés
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg';
const APP_VERSION = 'v2026-11-23';
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
    click() { tone(1150, 0.05, 'square', 0.05); },
    shopBuy(){ [880,1100,1320].forEach((f,i)=>tone(f,0.18,'sine',0.15,i*0.07)); },
    coin(){ tone(1200,0.12,'triangle',0.18); tone(1800,0.12,'sine',0.12,0.08); }
  };
})();
// mute wrapper + haptics + confetti
(function(){
  const _orig = Snd;
  const isMuted = ()=> document.documentElement.dataset.sound==='off';
  ['roll','settle','step','capture','home','finish','win','click','shopBuy','coin'].forEach(k=>{
    const fn=_orig[k]; _orig[k]=function(){ if(isMuted()) return; return fn.apply(this, arguments); };
  });
})();
let tomAudio=null;
function playTomScream(){
  if(document.documentElement.dataset.sound==='off') return;
  const eq = window.SyroAuth ? window.SyroAuth.getEq() : {};
  if(eq.sound && eq.sound!=='sound_tom' && eq.sound!=='sound_pop') return; // only when Tom selected or default
  try{
    if(!tomAudio){ tomAudio=new Audio('sounds/tom-scream.mp3'); tomAudio.volume=0.85; }
    tomAudio.currentTime=0; tomAudio.play().catch(()=>{});
    haptic(40);
  }catch(e){}
}
function haptic(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms||20); }catch(e){} }
function confettiBurst(){
  const c=document.getElementById('confetti'); if(!c) return;
  c.classList.remove('hidden'); c.width=innerWidth; c.height=innerHeight;
  const ctx=c.getContext('2d'); const parts=[...Array(120)].map(()=>({x:Math.random()*c.width, y:-10, vx:(Math.random()-0.5)*8, vy:Math.random()*6+4, r:Math.random()*6+3, col:`hsl(${35+Math.random()*25},100%,55%)`, rot:Math.random()*360, vr:(Math.random()-0.5)*12}));
  let t=0; (function loop(){
    t++; ctx.clearRect(0,0,c.width,c.height);
    parts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.18; p.rot+=p.vr; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180); ctx.fillStyle=p.col; ctx.fillRect(-p.r,-p.r,p.r*2,p.r*2); ctx.restore(); });
    if(t<160) requestAnimationFrame(loop); else { ctx.clearRect(0,0,c.width,c.height); c.classList.add('hidden'); }
  })();
}
function captureShake(){ const b=document.getElementById('board'); if(!b) return; b.classList.remove('capture-shake'); void b.offsetWidth; b.classList.add('capture-shake'); b.addEventListener('animationend',()=>b.classList.remove('capture-shake'),{once:true}); }
function updateOnlineBar(online, pingMs){
  const bar=document.getElementById('onlineBar'); if(!bar) return;
  if(mode!=='online'){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.classList.toggle('offline', !online);
  const txt=document.getElementById('onlineBarText');
  const ping=document.getElementById('onlinePing');
  if(txt) txt.textContent = online ? '● En ligne — temps réel' : '○ Reconnexion…';
  if(ping) ping.textContent = online && pingMs ? ` ${pingMs}ms` : '';
}
let _lastPing=0;
function trackPing(start){ _lastPing = Date.now()-start; updateOnlineBar(true, _lastPing); }

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
// --- ZOLEM FLUIDE : glisse de l'attaquant + envol du mangé chevauché ---
function runFluidCapture(attackers, captured, onDone){
  // attaquants : glisse fluide (pas de hop saccadé) + léger scale à l'impact
  attackers.forEach(t=>{
    const el = pawnEl(t.color, t.idx);
    const toPt = (t.to===-1? baseSlot(t.color,t.idx) : t.from===-1? cellCenter(t.color,t.to) : cellCenter(t.color,t.to));
    // si c'était un hop, on force un seul glisse pour le manger (fluide)
    el.style.transition = 'transform 360ms cubic-bezier(0.22,1,0.36,1)';
    el.style.transform = `translate(${toPt[0]}px,${toPt[1]}px)`;
    // petit bump au moment de l'impact
    setTimeout(()=>{ el.style.transition='transform 120ms cubic-bezier(0.34,1.56,0.64,1)'; el.style.transform=`translate(${toPt[0]}px,${toPt[1]}px) scale(1.08)`; setTimeout(()=>{ el.style.transform=`translate(${toPt[0]}px,${toPt[1]}px) scale(1)`; el.style.transition=''; },130); }, 270);
  });
  // déclenche son + shake pile à l'impact (70% du glisse)
  setTimeout(()=>{ if(captured.length){ playTomScream(); haptic(30); captureShake(); } }, 240);
  // mangés : s'écrasent puis s'envolent vers la base (chevauché, pas après)
  setTimeout(()=>{
    if(!captured.length){ onDone(); return; }
    let left=captured.length;
    captured.forEach(t=>{
      const el = pawnEl(t.color, t.idx);
      const base = baseSlot(t.color, t.idx);
      // 1) hit : écrase + fade rapide sur place
      el.style.transition = 'transform 140ms cubic-bezier(0.4,0,0.2,1), opacity 140ms ease';
      // garde sa position actuelle visuelle (elle n'a pas bougé) puis scale down
      const cur = el.style.transform || '';
      // on force l'échelle sur place
      el.style.transform = cur.replace(/scale\([^)]+\)/g,'').trim() + ' scale(0.65)';
      el.style.opacity = '0.55';
      el.style.filter = 'brightness(1.2)';
      setTimeout(()=>{
        // 2) envol vers la base
        el.style.transition = 'transform 440ms cubic-bezier(0.33,0,0.2,1), opacity 320ms ease, filter 300ms ease';
        el.style.transform = `translate(${base[0]}px,${base[1]}px) scale(1)`;
        el.style.opacity = '1';
        el.style.filter = '';
        setTimeout(()=>{ el.style.transition=''; if(--left<=0) onDone(); }, 460);
      }, 150);
    });
  }, 220);
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
  const attackers = ops.filter(t=> t.to!==-1);
  const captured = ops.filter(t=> t.to===-1);
  // cas ZOLEM (manger) → anim fluide chevauchée, sinon anim normale séquentielle
  if(captured.length && attackers.length){
    runFluidCapture(attackers, captured, ()=>{
      // arrivée maison éventuelle
      attackers.forEach(t=>{ if(t.to===56){ Snd.home(); haptic(25); const el=pawnEl(t.color,t.idx); el.classList.add('home-bounce'); setTimeout(()=>el.classList.remove('home-bounce'),700); } });
      animating=false; syncPawns(); applySkinsToBoard();
      const q=queuedCommit; queuedCommit=null; if(q) q(); else after&&after();
    });
    return;
  }
  // pas de capture : anim classique
  let active = 0;
  const runBatch=(batch, cb)=>{
    if(!batch.length) return cb();
    let active=batch.length;
    batch.forEach(t=>{
      runTransition(t, ()=>{
        if(t.to===56){ Snd.home(); haptic(25); const el=pawnEl(t.color,t.idx); el.classList.add('home-bounce'); setTimeout(()=>el.classList.remove('home-bounce'),700); }
        if(--active<=0) cb();
      });
    });
  };
  runBatch(attackers.length? attackers : captured, ()=>{
    animating=false; syncPawns(); applySkinsToBoard();
    const q=queuedCommit; queuedCommit=null; if(q) q(); else after&&after();
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
function applyDiceSkins(){
  let skin='dice_classic';
  try{ if(window.SyroAuth && SyroAuth.getEq) skin=SyroAuth.getEq().dice || skin; else { const eq=JSON.parse(localStorage.getItem('syro_eq')||'{}'); skin=eq.dice||skin; } }catch(e){}
  document.documentElement.dataset.diceSkin = skin||'dice_classic';
  [$('#die0'),$('#die1')].forEach(el=>{ if(!el) return; el.classList.remove('skin-crystal','skin-gold'); if(skin==='dice_crystal') el.classList.add('skin-crystal'); if(skin==='dice_gold') el.classList.add('skin-gold'); });
}
function renderDice() {
  if (rollAnim) return;
  applyDiceSkins();
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
  // Position initiale : au-dessus du pion (défaut)
  el.style.transform = 'translate(-50%, -135%)';
  el.style.maxHeight = '42vh'; el.style.overflowY = 'auto'; el.style.zIndex = '50';
  // Fix : le pion en haut était caché sous le header sticky (z-index 40)
  requestAnimationFrame(()=>{
    const header = document.querySelector('.ludo-header');
    const headerBottom = header ? header.getBoundingClientRect().bottom + 8 : 8;
    const boardWrap = document.querySelector('.board-wrap');
    const boardRect = boardWrap ? boardWrap.getBoundingClientRect() : null;
    let r = el.getBoundingClientRect();
    const pad = 8;
    // Si pas assez de place au-dessus (pion en haut) → passer en dessous
    const needBelow = (my < 130) || (r.top < headerBottom + 6);
    if(needBelow){
      el.style.transform = 'translate(-50%, 14%)';
      // re-mesurer après flip
      r = el.getBoundingClientRect();
    }
    // Clamp horizontal + vertical pour rester visible (viewport + board)
    requestAnimationFrame(()=>{
      const r2 = el.getBoundingClientRect();
      let dx = 0, dy = 0;
      const leftLimit = boardRect ? boardRect.left + pad : pad;
      const rightLimit = boardRect ? boardRect.right - pad : innerWidth - pad;
      if(r2.left < leftLimit) dx = leftLimit - r2.left;
      if(r2.right > rightLimit) dx = rightLimit - r2.right;
      if(r2.top < headerBottom) dy = headerBottom - r2.top;
      if(r2.bottom > innerHeight - pad) dy = (innerHeight - pad) - r2.bottom;
      // Ne pas sortir du board par le haut non plus
      if(boardRect && r2.top < boardRect.top + pad) dy = Math.max(dy, (boardRect.top + pad) - r2.top);
      if(dx||dy){
        const curLeft = parseFloat(el.style.left)||0;
        const curTop = parseFloat(el.style.top)||0;
        if(dx) el.style.left = `calc(${curLeft}% + ${dx}px)`;
        if(dy) el.style.top = `calc(${curTop}% + ${dy}px)`;
      }
    });
  });
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
  window.showScreen = showScreen;
  clearAuto();
  ['hero', 'dashboard', 'menu', 'setup', 'lobby', 'game', 'shop'].forEach(s =>{
    const el=document.getElementById('screen-' + s);
    if(el) el.classList.toggle('hidden', s !== name);
  });
  if(name==='dashboard' && window.SyroAuth) SyroAuth.renderDashboard();
  if(name==='shop') renderShop();
  // leaderboard removed
  if (name==='menu' || name==='hero') setSimPaused(false);
  if (mode === 'online' && room.code && (name === 'lobby' || name === 'game')) startWatch();
  else stopWatch();
  renderMyColor();
  updateSimPauseUI();
  // scroll top + online bar
  window.scrollTo({top:0, behavior:'smooth'});
  if(name!=='game' && name!=='lobby') updateOnlineBar(true);
}
let _shopCat='pion';
function renderShop(){
  const grid=document.getElementById('shopGrid'); if(!grid || !window.SyroAuth) return;
  const coinsBtn=document.getElementById('shopCoinsBig'); if(coinsBtn) coinsBtn.textContent='Tout gratuit ✨';
  document.querySelectorAll('#shopTabs button').forEach(b=> b.classList.toggle('sel', b.dataset.cat===_shopCat));
  const eq=SyroAuth.getEq()||{};
  const items=SyroAuth.SHOP_CATALOG.filter(x=>x.cat===_shopCat);
  grid.innerHTML = items.map(it=>{
    const owned = true; // tout gratuit
    const catKey = it.cat==='pion'?'pawn': it.cat==='plateau'?'board': it.cat==='de'?'dice':'sound';
    const equipped = eq[catKey]===it.id;
    return `<div class="shop-card ${owned?'owned':''} ${equipped?'equipped':''}">
      <div class="sc-prev">${it.preview}</div>
      <h4>${it.name}</h4>
      <p>${it.desc}</p>
      <div class="sc-price">Gratuit ✨${equipped?'<br><span style="color:var(--accent)">● équipé</span>':''}</div>
      <div class="sc-actions">${equipped ? `<span style="font-size:.8rem; color:var(--accent); font-weight:800">Équipé</span>` : `<button class="equip" data-equip="${it.id}">Équiper</button>`}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-equip]').forEach(b=> b.onclick=async()=>{
    try{ await SyroAuth.equipItem(b.dataset.equip); Snd.coin(); haptic(20); toast('Équipé ✓'); renderShop(); applySkinsToBoard(); }
    catch(e){ toast(e.message); }
  });
}
function applySkinsToBoard(){
  const eq = window.SyroAuth ? SyroAuth.getEq() : {};
  const boardSkin = eq.board || 'board_classic';
  document.documentElement.dataset.boardSkin = boardSkin;
  // pawn skins via body class
  document.querySelectorAll('.pawn').forEach(p=>{
    p.classList.remove('pawn-skin-neon','pawn-skin-gold','pawn-skin-fire');
    const ps = eq.pawn || 'pawn_classic';
    if(ps==='pawn_neon') p.classList.add('pawn-skin-neon');
    if(ps==='pawn_gold') p.classList.add('pawn-skin-gold');
    if(ps==='pawn_fire') p.classList.add('pawn-skin-fire');
  });
  if(window.SyroAuth) SyroAuth.renderHeader();
}
async function renderLeaderboard(){
  const box=document.getElementById('leaderboardList'); if(!box) return;
  box.innerHTML='<p class="hint">Chargement…</p>';
  try{
    const rows=await SyroAuth.getLeaderboard(50);
    if(!rows.length){ box.innerHTML='<p class="hint">Pas encore de joueurs — sois le premier !</p>'; return; }
    const mePseudo = (()=>{ try{ return (SyroAuth.getProfile()&&SyroAuth.getProfile().pseudo) || localStorage.getItem('syro_pseudo'); }catch(e){ return '' }})();
    box.innerHTML = rows.map((r,i)=>{
      const medal = i===0?'🥇' : i===1?'🥈' : i===2?'🥉' : (i+1)+'.';
      const isMe = r.pseudo===mePseudo;
      return `<div class="lb-row ${i<3?'top'+(i+1):''} ${isMe?'me':''}">
        <div class="lb-rank">${medal}</div>
        <div class="lb-info"><b>${esc(r.pseudo)}</b><small>Lv${r.level} • ${r.games_won||0} victoires • ${r.games_played||0} parties</small></div>
        <div class="lb-xp">${r.xp} XP<br><small style="color:var(--muted)">${r.coins||0}🪙</small></div>
      </div>`;
    }).join('');
  }catch(e){ box.innerHTML='<p class="error">Erreur classement : '+esc(e.message)+'</p>'; }
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
  confettiBurst(); haptic(50);
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
function clearRoomUrl(){
  try { history.replaceState(null, '', location.pathname); } catch(e){}
  room = { code: null, token: null };
}
function quitOnlineToHome(){
  stopWatch();
  clearRoomUrl();
  mode = null;
  started = false;
  showScreen('hero');
}
function onRoomState(resp) {
  if (!resp) return;
  if (resp._transient) { /* Firestore reconnexion automatique — pas de kick */ return; }
  if (resp.error) {
    const fatal = /introuvable|n'existe plus|invalide|introuvable/i.test(resp.error);
    if (fatal) {
      stopWatch();
      clearRoomUrl();
      showScreen('hero');
    }
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
  // Hero SYRO GAMES → navigation fluide (remplace le script inline)
  const goMenu = () => showScreen('menu');
  const goHero = () => { stopWatch(); showScreen('hero'); };
  const goAuth = () => showScreen('auth');
  if ($('#btnPlayGuest')) $('#btnPlayGuest').onclick = goMenu;
  if ($('#btnShowLogin')) $('#btnShowLogin').onclick = goAuth;
  if ($('#btnGuestContinue')) $('#btnGuestContinue').onclick = goMenu;
  if ($('#btnBackHero')) $('#btnBackHero').onclick = goHero;
  if ($('#linkRulesHero')) $('#linkRulesHero').onclick = (e)=>{ e.preventDefault(); $('#modalRules').classList.remove('hidden'); };
  if ($('#btnBackToHero')) $('#btnBackToHero').onclick = goHero;

  // Menu (les deux versions hero+menu utilisent les mêmes handlers)
  const bindMode = (id, kind) => {
    const el = document.getElementById(id);
    const el2 = document.getElementById(id+'2');
    const h = () => { setupKind = kind; renderSetup(); showScreen('setup'); };
    if (el) el.onclick = h;
    if (el2) el2.onclick = h;
  };
  bindMode('btnAi', 'ai');
  bindMode('btnLocal', 'local');
  bindMode('btnSim', 'sim');
  bindMode('btnCreate', 'online');
  const j1 = $('#btnJoinShow'), j2 = $('#btnJoinShow2');
  const toggleJoin = () => {
    const box = $('#joinBox'); if (!box) return;
    // joinBox est dans le menu, on s'assure d'être sur le menu
    if (document.getElementById('screen-menu').classList.contains('hidden')) showScreen('menu');
    box.classList.toggle('hidden');
    $('#joinError').textContent = '';
    setTimeout(()=>{ const i=$('#joinCode'); if(i) i.focus(); }, 50);
  };
  if (j1) j1.onclick = toggleJoin;
  if (j2) j2.onclick = toggleJoin;
  if ($('#btnJoin')) $('#btnJoin').onclick = () => { mode = 'online'; hotseat = false; joinOnline($('#joinCode').value, false); };
  const jc = $('#joinCode'); if (jc) jc.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });

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
  $('#btnLeaveLobby').onclick = () => {
    if (!confirm('Quitter le salon ?')) return;
    quitOnlineToHome();
  };
  $('#btnLeave').onclick = () => {
    if (mode === 'online' && !confirm('Quitter la partie ?')) return;
    clearTimeout(aiTimer);
    setSimPaused(false);
    if (mode === 'online') quitOnlineToHome();
    else { stopWatch(); showScreen('hero'); }
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
    else if (mode === 'sim') startSim();
    else {
      const resp = await postAction({ type: 'restart' });
      if (resp.error) { toast(resp.error); return; }
      applyServer(resp, false);
      if (!started) { showScreen('lobby'); renderLobby(); }
    }
  };
  $('#btnOverMenu').onclick = () => {
    $('#modalOver').classList.add('hidden');
    if (mode === 'online') quitOnlineToHome();
    else { const logged=window.SyroAuth && SyroAuth.getUser && SyroAuth.getUser(); if(logged) showScreen('dashboard'); else showScreen('hero'); }
  };

  function goHome(){
    const logged = window.SyroAuth && SyroAuth.getUser && SyroAuth.getUser();
    if(logged) showScreen('dashboard'); else showScreen('hero');
  }
  // Nav header neuve v2026-11-23
  const navShop = document.getElementById('btnNavShop'); if(navShop) navShop.onclick=()=> showScreen('shop');
  const navBoard = document.getElementById('btnNavBoard'); if(navBoard) navBoard.onclick=()=> { _shopCat='plateau'; showScreen('shop'); };
  const brandHome = document.getElementById('brandHome'); if(brandHome) brandHome.onclick=()=> goHome();
  const heroShop = document.getElementById('heroShopBtn'); if(heroShop) heroShop.onclick=()=> showScreen('shop');
  const heroBoard = document.getElementById('heroBoardBtn'); if(heroBoard) heroBoard.onclick=()=> showScreen('leaderboard');
  const shopBack = document.getElementById('btnShopBack'); if(shopBack) shopBack.onclick=()=> goHome();
  const boardBack = document.getElementById('btnBoardBack'); if(boardBack) boardBack.onclick=()=> goHome();
  const boardRefresh = document.getElementById('btnBoardRefresh'); if(boardRefresh) boardRefresh.onclick=()=> renderLeaderboard();
  const dashPlay = document.getElementById('dashPlay'); if(dashPlay) dashPlay.onclick=()=> showScreen('menu');
  const dashOnline = document.getElementById('dashOnline'); if(dashOnline) dashOnline.onclick=()=> { setupKind='online'; renderSetup(); showScreen('setup'); };
  const dashBot = document.getElementById('dashBot'); if(dashBot) dashBot.onclick=()=> { setupKind='ai'; renderSetup(); showScreen('setup'); };
  const dashShop = document.getElementById('dashShop'); if(dashShop) dashShop.onclick=()=> showScreen('shop');
  const syroBadge = document.getElementById('syroUserBadge'); if(syroBadge) syroBadge.onclick=()=>{
    const cur=localStorage.getItem('syro_pseudo')||'Joueur';
    const nxt=prompt('Ton pseudo :', cur); if(nxt!==null){ const v=nxt.trim().slice(0,16); if(v){ localStorage.setItem('syro_pseudo', v); if(window.SyroAuth){ SyroAuth.renderHeader(); SyroAuth.renderDashboard(); } toast('Pseudo : '+v); } }
  };
  const heroPseudoLink=document.getElementById('linkChangeName'); if(heroPseudoLink) heroPseudoLink.onclick=(e)=>{ e.preventDefault(); document.getElementById('syroUserBadge')?.click(); };
  const btnPlayGuest=document.getElementById('btnPlayGuest'); if(btnPlayGuest) btnPlayGuest.onclick=()=> showScreen('menu');
  const dashBoardBtn = document.getElementById('dashBoard'); if(dashBoardBtn) dashBoardBtn.onclick=()=> { _shopCat='plateau'; showScreen('shop'); };
  const dashSettings = document.getElementById('dashSettings'); if(dashSettings) dashSettings.onclick=()=> showScreen('auth');
  document.querySelectorAll('#shopTabs button').forEach(b=> b.onclick=()=>{ _shopCat=b.dataset.cat; renderShop(); });
  const btnSound = document.getElementById('btnSound'); if(btnSound) btnSound.onclick=()=>{
    const isOff=document.documentElement.dataset.sound==='off';
    if(isOff){ delete document.documentElement.dataset.sound; localStorage.setItem('syro_sound','on'); btnSound.textContent='🔊'; toast('Son activé'); }
    else { document.documentElement.dataset.sound='off'; localStorage.setItem('syro_sound','off'); btnSound.textContent='🔇'; toast('Son coupé'); }
  };
  // Online ping tracker
  const _origPost = window.postAction; // will be defined later, wrap applyServer instead
  // hook fetch for ping
  const _fetchOrig = window.fetch;
  if(_fetchOrig){
    const origFetch=window.fetch;
    window.fetch = async function(u,o){
      const s=Date.now();
      const r=await origFetch(u,o);
      try{ if(String(u).includes('/api/rooms')) trackPing(s); }catch(e){}
      return r;
    };
  }

  // Palier 2 — Auth SYRO (onglets premium)
  let authMode = 'login';
  function setAuthMode(m){
    authMode = m;
    document.querySelectorAll('.auth-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===m));
    const hint = document.getElementById('authTabHint');
    const btn = document.getElementById('btnAuthPrimary');
    const sw = document.getElementById('authSwitchHint');
    if(m==='login'){
      if(hint) hint.textContent='Déjà un compte ? Connecte-toi pour retrouver ton XP.';
      if(btn) btn.textContent='Se connecter →';
      if(sw) sw.innerHTML='Pas encore de compte ? <a href=\"#\" id=\"linkToSignup\">Créer un compte</a>';
    } else {
      if(hint) hint.textContent='Nouveau chez SYRO ? Crée ton compte — ton XP invité sera gardé.';
      if(btn) btn.textContent='Créer mon compte →';
      if(sw) sw.innerHTML='Déjà un compte ? <a href=\"#\" id=\"linkToLogin\">Se connecter</a>';
    }
    // rebind links
    const l1=document.getElementById('linkToSignup'); if(l1) l1.onclick=(e)=>{e.preventDefault(); setAuthMode('signup');};
    const l2=document.getElementById('linkToLogin'); if(l2) l2.onclick=(e)=>{e.preventDefault(); setAuthMode('login');};
    const err=document.getElementById('authError'); if(err) err.textContent='';
  }
  document.querySelectorAll('.auth-tab').forEach(b=> b.onclick=()=> setAuthMode(b.dataset.tab));
  // init
  setAuthMode('login');
  const doAuth = async ()=>{
    const email = document.getElementById('authEmail')?.value.trim();
    const pass = document.getElementById('authPassword')?.value.trim();
    const errEl = document.getElementById('authError');
    if(errEl) errEl.textContent='';
    if(!email || !pass){ if(errEl) errEl.textContent='Email + mot de passe requis (6 car. min)'; return; }
    const btn = document.getElementById('btnAuthPrimary');
    if(btn) btn.disabled=true;
    if(errEl) errEl.textContent='Chargement...';
    try{
      if(authMode==='login') await SyroAuth.signInEmail(email, pass);
      else await SyroAuth.signUpEmail(email, pass);
      if(errEl) errEl.textContent='';
      toast(authMode==='login'?'Connecté ✓':'Compte créé ✓ — XP gardé');
      if(window.SyroAuth && SyroAuth.renderAuthState) SyroAuth.renderAuthState();
    }catch(e){
      const msg = (window.SyroAuth && SyroAuth.friendlyError) ? SyroAuth.friendlyError(e) : (e.message||'Erreur');
      if(errEl) errEl.textContent = msg;
    }finally{
      if(btn) btn.disabled=false;
    }
  };
  if($('#btnAuthPrimary')) $('#btnAuthPrimary').onclick = doAuth;
  if($('#btnGoMenu')) $('#btnGoMenu').onclick = ()=> showScreen('menu');
  if($('#btnLogout')) $('#btnLogout').onclick = async ()=>{ await SyroAuth.signOut(); toast('Déconnecté'); };
  // Enter key
  ['authEmail','authPassword'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter') doAuth(); });
  });

  $('#board').addEventListener('click', () => hideMini());
  document.addEventListener('click', () => Snd.unlock(), { passive: true });
}

async function init() {
  document.title = 'SYRO GAMES — Ludo à 2 ou 4 joueurs (' + APP_VERSION + ')';
  buildBoard();
  bind();
  // Palier 2 : auth + XP
  if(window.SyroAuth) { SyroAuth.init(); setTimeout(()=>{ try{ applySkinsToBoard(); }catch(e){} }, 800); }
  const _ub = document.getElementById('syroUserBadge');
  if(_ub) _ub.onclick = ()=> showScreen('auth');
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
    const jc = $('#joinCode'); if (jc) jc.value = rc;
    await joinOnline(rc, true);
    return;
  }
  // Accueil intelligent : connecté → dashboard, invité → hero
  setTimeout(()=>{
    const logged = window.SyroAuth && SyroAuth.getUser && SyroAuth.getUser();
    if(logged) showScreen('dashboard'); else showScreen('hero');
  }, 600);
  // si login arrive après (async), on bascule auto
  if(window.SyroAuth) SyroAuth.onReady(()=>{ const u=SyroAuth.getUser(); if(u && document.getElementById('screen-hero') && !document.getElementById('screen-hero').classList.contains('hidden')) showScreen('dashboard'); });
  else showScreen('hero');

  // FLUIDITÉ : si l'utilisateur revient sur l'onglet, on re-sync sans refresh manuel
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mode === 'online' && room.code) {
      // le watch Firestore/HTTP se recharge seul, mais on force un getState pour les vieux onglets en arrière-plan
      Backend.getState(room.code, room.token).then(r=>{ if(r && !r.error) applyServer(r,false); }).catch(()=>{});
    }
  });
  // Si l'utilisateur efface le ?room à la main ou fait retour navigateur
  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(location.search).get('room');
    if (!p && mode === 'online' && !document.querySelector('#screen-game').classList.contains('hidden')) {
      stopWatch();
      room = { code:null, token:null };
    }
  });
  // Fluidité online : reconnexion auto + barre état
  let _onlineWatchdog=null;
  function startOnlineWatchdog(){
    if(_onlineWatchdog) clearInterval(_onlineWatchdog);
    _onlineWatchdog=setInterval(async()=>{
      if(mode!=='online' || !room.code) return;
      if(!navigator.onLine){ updateOnlineBar(false); return; }
      // si watch bloqué >5s sans tick, force refresh
      try{ const s=Date.now(); const r=await Backend.getState(room.code, room.token); if(r&&!r.error){ applyServer(r,false); trackPing(s); } else if(r&&r.error) updateOnlineBar(false); }catch(e){ updateOnlineBar(false); }
    }, 3000);
  }
  const _origStartWatch = startWatch;
  startWatch = async function(){ const r=await _origStartWatch.apply(this, arguments); updateOnlineBar(navigator.onLine!==false); startOnlineWatchdog(); return r; };
  const _origStopWatch = stopWatch;
  stopWatch = function(){ if(_onlineWatchdog){ clearInterval(_onlineWatchdog); _onlineWatchdog=null; } updateOnlineBar(true); return _origStopWatch.apply(this, arguments); };
  window.addEventListener('online', ()=> updateOnlineBar(true));
  window.addEventListener('offline', ()=> updateOnlineBar(false));
  // PWA : save beforeinstallprompt
  let _deferredPrompt=null;
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); _deferredPrompt=e; });
}
init();
