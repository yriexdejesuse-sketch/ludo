/* ============================================================
   backends « parties en ligne » — deux implémentations :
   - HttpBackend : via le serveur Node (server.js) — utilisé sur Arena
   - FireBackend : via Firebase Firestore — utilisé sur hébergement
     statique (GitHub Pages…) quand firebase-config.js est rempli
   Les deux renvoient la même forme de réponse :
     {state, legal:{0:[],1:[]}, you, started, seats}
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LudoBackends = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function uid() {
    try { return crypto.randomUUID(); } catch (e) {}
    let s = '';
    const b = new Uint8Array(16);
    (crypto.getRandomValues || Math.random.bind(Math))(b);
    for (let i = 0; i < 16; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }
  function genCode() {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const b = new Uint8Array(5);
    crypto.getRandomValues(b);
    let s = '';
    for (let i = 0; i < 5; i++) s += A[b[i] % A.length];
    return s;
  }
  async function defaultHash(token) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      /* contexte non sécurisé : simple masquage */
      return 'h_' + token;
    }
  }

  /* ---------------- via le serveur Node (Arena) ---------------- */
  function makeHttp(opts) {
    const f = opts.fetchFn;
    async function call(method, url, body) {
      try {
        const r = await f(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined
        });
        return await r.json();
      } catch (e) {
        return { error: 'Service en ligne indisponible (serveur ou Firebase non configuré).' };
      }
    }
    return {
      name: 'http',
      createRoom: (color, name, count) => call('POST', '/api/rooms', { color, name, count }),
      joinRoom: (code, name) => call('POST', '/api/rooms/' + code + '/join', { name }),
      getState: (code, token) => call('GET', '/api/rooms/' + code + (token ? '?token=' + token : '')),
      action: (code, token, action) => call('POST', '/api/rooms/' + code + '/action', { token, action }),
      async watch(code, token, cb) {
        let stopped = false;
        let failCount = 0;
        const tick = async () => {
          if (stopped) return;
          const r = await this.getState(code, token);
          if (stopped) return;
          if (!r) return;
          if (r.error) {
            // erreur fatale (salle supprimée / token invalide) → on prévient l'app qui quittera
            if (/introuvable|n'existe plus|invalide/i.test(r.error)) cb(r);
            else {
              failCount++;
              if (failCount === 3) console.warn('[SYRO] synchro en attente...', r.error);
            }
            return;
          }
          failCount = 0;
          cb(r);
        };
        tick();
        const iv = setInterval(tick, 500);
        const onVis = () => { if (!stopped && document.visibilityState === 'visible') tick(); };
        try { document.addEventListener('visibilitychange', onVis); } catch(e){}
        return () => { stopped = true; clearInterval(iv); try { document.removeEventListener('visibilitychange', onVis); } catch(e){} };
      }
    };
  }

  /* ---------------- via Firebase Firestore ---------------- */
  function makeFire(opts) {
    const engine = opts.engine;
    const config = opts.config;
    const loadFirestore = opts.loadFirestore;
    const hash = opts.hashFn || defaultHash;
    let sdkP = null;
    function sdk() {
      if (!sdkP) sdkP = Promise.resolve(loadFirestore(config));
      return sdkP;
    }
    const cleanName = (v) => String(v == null ? '' : v).trim().slice(0, 16);

    /* même forme de réponse que le serveur Node */
    async function publicOf(room, token) {
      const seatHash = token ? await hash(token) : null;
      let seat = -1;
      (room.seats || []).forEach((s, i) => { if (s && s.tokenHash === seatHash) seat = i; });
      const you = seat >= 0 ? { seat, color: room.state.players[seat].color } : null;
      const started = !!room.started && !!(room.seats || []).length && (room.seats || []).every(Boolean);
      let legal = { 0: [], 1: [], sum: [] };
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
        seats: room.state.players.map((p, i) => ({
          seat: i, color: p.color, joined: !!(room.seats && room.seats[i])
        }))
      };
    }

    return {
      name: 'fire',
      async createRoom(color, name, count) {
        const { db, api } = await sdk();
        const token = uid();
        const max = Math.min(4, Math.max(2, parseInt(count,10) || 2));
        const others = engine.COLORS.filter(c=>c!==color);
        let colors;
        if (max===2) colors=[color, engine.OPPOSITE[color] || others[0]];
        else colors=[color, ...others.slice(0,max-1)];
        const state = engine.createGame(colors);
        const tokenHash = await hash(token);
        let code = genCode();
        for (let i = 0; i < 6; i++) {
          const ref = api.doc(db, 'rooms', code);
          const snap = await api.getDoc(ref);
          if (!snap.exists()) {
            const seats = Array(max).fill(null); seats[0]={ tokenHash };
            const names = Array(max).fill(null); names[0]=cleanName(name);
            const room = {
              state,
              seats,
              names,
              max,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await api.setDoc(ref, room);
            const pub = await publicOf(room, token);
            return Object.assign({ code, token }, pub);
          }
          code = genCode();
        }
        return { error: 'Impossible de créer une partie (réessayez).' };
      },
      async joinRoom(code, name) {
        const { db, api } = await sdk();
        const token = uid();
        const tokenHash = await hash(token);
        const ref = api.doc(db, 'rooms', code);
        try {
          const room = await api.runTransaction(db, async (tr) => {
            const snap = await tr.get(ref);
            if (!snap.exists()) throw { error: 'Partie introuvable (code invalide).' };
            const data = snap.data();
            const maxSeats = data.max || (data.seats||[]).length || 2;
            if (data.seats && data.seats.every(s=>s)) throw { error: 'full', max: maxSeats };
            const emptyIdx = (data.seats||[]).findIndex(s=>!s);
            if (emptyIdx < 0) throw { error: 'full', max: maxSeats };
            const seats = (data.seats||[]).slice(); seats[emptyIdx]={ tokenHash };
            const names = (data.names || Array(maxSeats).fill('')).slice();
            while (names.length < maxSeats) names.push('');
            names[emptyIdx] = cleanName(name);
            const next = Object.assign({}, data, { seats, names, updatedAt: Date.now() });
            tr.set(ref, next);
            return next;
          });
          const pub = await publicOf(room, token);
          return Object.assign({ code, token }, pub);
        } catch (e) {
          return { error: (e && e.error) || 'Erreur réseau.', max: e && e.max };
        }
      },
      async getState(code, token) {
        const { db, api } = await sdk();
        const ref = api.doc(db, 'rooms', code);
        const snap = await api.getDoc(ref);
        if (!snap.exists()) return { error: 'Partie introuvable (code invalide).' };
        return publicOf(snap.data(), token || null);
      },
      async action(code, token, action) {
        const { db, api } = await sdk();
        const tokenHash = await hash(token);
        const ref = api.doc(db, 'rooms', code);
        try {
          const out = await api.runTransaction(db, async (tr) => {
            const snap = await tr.get(ref);
            if (!snap.exists()) throw { error: 'Partie introuvable.' };
            const data = snap.data();
            let seat = -1;
            (data.seats || []).forEach((s, i) => { if (s && s.tokenHash === tokenHash) seat = i; });
            if (seat < 0) throw { error: 'Token invalide.' };
            const a = action || {};
            if (a.type !== 'color' && !data.seats.every(Boolean)) throw { error: 'En attente du second joueur…' };
            if (a.type !== 'color' && a.type !== 'start' && !data.started) throw { error: 'La partie n\'est pas encore commencée.' };

            const st = data.state;
            const myColor = st.players[seat].color;
            let r, newSt = st;
            if (a.type === 'start') {
              if (seat !== 0) r = { error: 'Seul l\'hôte peut lancer la partie.' };
              else r = { ok: true };
            } else if (a.type === 'color') {
              if (data.started) r = { error: 'La partie a déjà commencé.' };
              else if (!engine.COLORS.includes(a.color)) r = { error: 'Couleur inconnue.' };
              else {
                const colors = st.players.map((p, i) => i === seat ? a.color : p.color);
                if (new Set(colors).size !== colors.length) r = { error: 'Cette couleur est déjà prise.' };
                else { newSt = engine.createGame(colors); r = { ok: true }; }
              }
            } else if (a.type === 'roll') {
              if (st.over) r = { error: 'Partie terminée.' };
              else if (engine.currentColor(st) !== myColor) r = { error: "Ce n'est pas à vous de jouer." };
              else r = engine.actionRoll(st);
            } else if (a.type === 'move') {
              if (st.over) r = { error: 'Partie terminée.' };
              else if (engine.currentColor(st) !== myColor) r = { error: "Ce n'est pas à vous de jouer." };
              else r = engine.actionMove(st, a.pawn, a.to, a.die);
            } else if (a.type === 'finish') {
              if (st.over) r = { error: 'Partie terminée.' };
              else if (engine.currentColor(st) !== myColor && st.ranks.length === 0) r = { error: "Ce n'est pas à vous de jouer." };
              else r = engine.finishNow(st);
            } else if (a.type === 'restart') {
              if (!st.over) r = { error: 'La partie est encore en cours.' };
              else { newSt = engine.createGame(st.players.map(p => p.color)); r = { ok: true }; }
            } else r = { error: 'Action inconnue.' };
            if (r.error) throw r;

            const next = Object.assign({}, data, { state: newSt, updatedAt: Date.now() });
            if (a.type === 'start') next.started = true;
            if (a.type === 'restart') next.started = false;
            tr.set(ref, next);
            return next;
          });
          return publicOf(out, token);
        } catch (e) {
          return { error: (e && e.error) || (e && e.message) || 'Erreur réseau.' };
        }
      },
      async watch(code, token, cb) {
        const { db, api } = await sdk();
        const ref = api.doc(db, 'rooms', code);
        let stopped = false;
        const unsub = api.onSnapshot(ref,
          (snap) => {
            if (stopped) return;
            if (!snap.exists()) { cb({ error: 'La partie n\'existe plus.' }); return; }
            publicOf(snap.data(), token || null).then(pub => { if (!stopped) cb(pub); });
          },
          (err) => {
            console.warn('[SYRO] Firestore watch erreur', err && err.message);
            // transient : onSnapshot se reconnecte seul, on ne kick pas
            if (!stopped) try{ cb({ _transient:true, error:'Connexion faible…' }); } catch(e){}
          });
        const onVis = () => {
          if (stopped || document.visibilityState !== 'visible') return;
          api.getDoc(ref).then(snap=>{
            if (stopped || !snap.exists()) return;
            publicOf(snap.data(), token || null).then(pub=>{ if(!stopped) cb(pub); });
          }).catch(()=>{});
        };
        try { document.addEventListener('visibilitychange', onVis); } catch(e){}
        return () => { stopped = true; try { unsub(); } catch (e) {} try { document.removeEventListener('visibilitychange', onVis); } catch(e){} };
      }
    };
  }

  function pick(opts) {
    const cfg = opts.config;
    if (cfg && cfg.projectId) return makeFire(opts);
    return makeHttp(opts);
  }

  return { makeHttp, makeFire, pick };
});
