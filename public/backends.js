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
      createRoom: (color) => call('POST', '/api/rooms', { color }),
      joinRoom: (code) => call('POST', '/api/rooms/' + code + '/join', {}),
      getState: (code, token) => call('GET', '/api/rooms/' + code + (token ? '?token=' + token : '')),
      action: (code, token, action) => call('POST', '/api/rooms/' + code + '/action', { token, action }),
      async watch(code, token, cb) {
        let stopped = false;
        const tick = async () => {
          if (stopped) return;
          const r = await this.getState(code, token);
          if (!stopped && r && !r.error) cb(r);
        };
        tick();
        const iv = setInterval(tick, 750);
        return () => { stopped = true; clearInterval(iv); };
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

    /* même forme de réponse que le serveur Node */
    async function publicOf(room, token) {
      const seatHash = token ? await hash(token) : null;
      let seat = -1;
      (room.seats || []).forEach((s, i) => { if (s && s.tokenHash === seatHash) seat = i; });
      const you = seat >= 0 ? { seat, color: room.state.players[seat].color } : null;
      const started = !!(room.seats || []).length && (room.seats || []).every(Boolean);
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
        seats: room.state.players.map((p, i) => ({
          seat: i, color: p.color, joined: !!(room.seats && room.seats[i])
        }))
      };
    }

    return {
      name: 'fire',
      async createRoom(color) {
        const { db, api } = await sdk();
        const token = uid();
        const state = engine.createGame([color, engine.OPPOSITE[color] || 'blue']);
        const tokenHash = await hash(token);
        let code = genCode();
        for (let i = 0; i < 6; i++) {
          const ref = api.doc(db, 'rooms', code);
          const snap = await api.getDoc(ref);
          if (!snap.exists()) {
            const room = {
              state,
              seats: [{ tokenHash }, null],
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
      async joinRoom(code) {
        const { db, api } = await sdk();
        const token = uid();
        const tokenHash = await hash(token);
        const ref = api.doc(db, 'rooms', code);
        try {
          const room = await api.runTransaction(db, async (tr) => {
            const snap = await tr.get(ref);
            if (!snap.exists()) throw { error: 'Partie introuvable (code invalide).' };
            const data = snap.data();
            if (data.seats && data.seats[1]) throw { error: 'full' };
            const seats = [data.seats[0], { tokenHash }];
            const next = Object.assign({}, data, { seats, updatedAt: Date.now() });
            tr.set(ref, next);
            return next;
          });
          const pub = await publicOf(room, token);
          return Object.assign({ code, token }, pub);
        } catch (e) {
          return { error: (e && e.error) || 'Erreur réseau.' };
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
            if (!data.seats.every(Boolean)) throw { error: 'En attente du second joueur…' };

            const st = data.state;
            const a = action || {};
            const myColor = st.players[seat].color;
            let r, newSt = st;
            if (a.type === 'roll') {
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
            tr.set(ref, next);
            return { state: newSt, seats: data.seats };
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
          () => { if (!stopped) cb({ error: 'Connexion perdue.' }); });
        return () => { stopped = true; try { unsub(); } catch (e) {} };
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
