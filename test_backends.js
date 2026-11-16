/* Tests du backend « Firebase » avec un Firestore simulé — node test_backends.js */
const assert = require('assert');
const engine = require('./public/engine.js');
const Backends = require('./public/backends.js');

/* ---------- Firestore simulé (sémantique proche du vrai) ---------- */
function makeMockFirestore() {
  const store = new Map();          // path -> data (copie)
  const listeners = new Map();      // path -> Set<fn>
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function put(path, data) {
    store.set(path, clone(data));
    (listeners.get(path) || []).forEach(fn => queueMicrotask(fn));
  }
  const api = {
    doc(db, col, id) { return { path: col + '/' + id }; },
    async getDoc(ref) {
      const d = store.get(ref.path);
      return { exists: () => !!d, data: () => (d ? clone(d) : undefined) };
    },
    async setDoc(ref, data) { put(ref.path, data); },
    async runTransaction(db, fn) {
      const pending = new Map();
      const tx = {
        async get(ref) {
          const d = store.get(ref.path);
          return { exists: () => !!d, data: () => (d ? clone(d) : undefined) };
        },
        set(ref, data) { pending.set(ref.path, clone(data)); }
      };
      const res = await fn(tx);           // si fn throw -> abort, rien n'est écrit
      for (const [p, v] of pending) put(p, v);
      return res;
    },
    onSnapshot(ref, cb) {
      if (!listeners.has(ref.path)) listeners.set(ref.path, new Set());
      const fn = () => {
        const d = store.get(ref.path);
        cb({ exists: () => !!d, data: () => (d ? clone(d) : undefined) });
      };
      listeners.get(ref.path).add(fn);
      queueMicrotask(fn);
      return () => listeners.get(ref.path).delete(fn);
    }
  };
  return { api, store };
}

const mock = makeMockFirestore();
const fire = Backends.makeFire({
  engine,
  config: { projectId: 'test-projet' },
  loadFirestore: async () => ({ db: {}, api: mock.api }),
  hashFn: async (t) => 'H(' + t + ')'
});
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));

(async () => {
  /* pick() : sans config -> http, avec config -> fire */
  assert.strictEqual(Backends.pick({ engine, config: null, fetchFn: () => {} }).name, 'http');
  assert.strictEqual(Backends.pick({ engine, config: { projectId: 'x' }, loadFirestore: () => {} }).name, 'fire');
  console.log('✔ sélection du backend (Firebase si configuré, sinon serveur)');

  /* création */
  const a = await fire.createRoom('red', 'Yriex');
  assert.ok(!a.error, a.error);
  assert.ok(/^[A-Z0-9]{5}$/.test(a.code), 'code: ' + a.code);
  assert.strictEqual(a.started, false, 'pas encore de second joueur');
  assert.strictEqual(a.you.seat, 0);
  assert.deepStrictEqual(a.state.players.map(p => p.color), ['red', 'yellow']);
  assert.strictEqual(a.state.phase, 'roll');
  assert.strictEqual(a.names[0], 'Yriex', 'nom de l\'hôte conservé');
  console.log('✔ création de partie Firebase, code =', a.code);

  /* état avec le token de l'hôte */
  const s0 = await fire.getState(a.code, a.token);
  assert.strictEqual(s0.you.seat, 0);
  assert.strictEqual(s0.started, false);

  /* deuxième joueur rejoint — PAS de démarrage automatique */
  const b = await fire.joinRoom(a.code, 'Amina');
  assert.ok(!b.error, b.error);
  assert.strictEqual(b.you.seat, 1);
  assert.strictEqual(b.started, false, 'aucun démarrage auto : l\'hôte doit lancer');
  assert.strictEqual(b.names[1], 'Amina', 'nom du rejoignant conservé');
  const tokens = [a.token, b.token];
  console.log('✔ join → lobby (2 joueurs, en attente du top de l\'hôte)');

  /* couleurs libres dans le lobby + jet interdit avant le lancement */
  const col = await fire.action(a.code, a.token, { type: 'color', color: 'green' });
  assert.ok(!col.error, col.error);
  assert.strictEqual(col.state.players[0].color, 'green');
  const pre = await fire.action(a.code, a.token, { type: 'roll' });
  assert.ok(pre.error, 'le jet doit être refusé avant le lancement');
  /* le top de l'hôte démarre la partie */
  const st0 = await fire.action(a.code, a.token, { type: 'start' });
  assert.ok(!st0.error, st0.error);
  assert.strictEqual(st0.started, true, 'le top de l\'hôte démarre la partie');
  const nope = await fire.action(a.code, b.token, { type: 'start' });
  assert.ok(nope.error, 'seul l\'hôte peut lancer');
  console.log('✔ couleur + top de l\'hôte (seul l\'hôte peut lancer)');

  /* join supplémentaire -> complet ; observateur sans token */
  const c = await fire.joinRoom(a.code);
  assert.strictEqual(c.error, 'full');
  const spec = await fire.getState(a.code, null);
  assert.strictEqual(spec.you, null);
  assert.strictEqual(spec.started, true);
  console.log('✔ salle complète + mode observation');

  /* validations : hors tour, mauvais token */
  let r = await fire.action(a.code, b.token, { type: 'roll' });
  assert.ok(r.error, 'doit refuser le jet hors tour');
  r = await fire.action(a.code, 'mauvais-token', { type: 'roll' });
  assert.ok(/Token/.test(r.error), r.error);
  console.log('✔ validations (tour et token)');

  /* on lance les dés jusqu'à obtenir un coup (il faut un 6 pour sortir) */
  let resp = await fire.getState(a.code, a.token);
  let st = resp.state;
  let gr = 0;
  while (st.phase !== 'move' && gr++ < 40) {
    const out = await fire.action(a.code, tokens[st.turn], { type: 'roll' });
    assert.ok(!out.error, out.error);
    st = out.state;
  }
  assert.strictEqual(st.phase, 'move', 'doit obtenir un coup jouable');

  /* coup illégal puis vrai coup */
  r = await fire.action(a.code, tokens[st.turn], { type: 'move', pawn: 0, to: 99, die: 0 });
  assert.ok(r.error, 'coup illégal refusé');
  resp = await fire.getState(a.code, tokens[st.turn]);
  const playable = [0, 1].filter(i => resp.legal[i] && resp.legal[i].length);
  assert.ok(playable.length > 0, 'un dé doit être jouable');
  const die = playable[0];
  const mv = resp.legal[die][0];
  const done = await fire.action(a.code, tokens[st.turn], { type: 'move', pawn: mv.pawn, to: mv.to, die });
  assert.ok(!done.error, done.error);
  assert.strictEqual(done.state.dieUsed[die], true);
  console.log('✔ coup joué via transaction Firestore (coup illégal refusé avant)');

  /* l'écoute en direct reçoit les mises à jour puis se stoppe */
  let updates = 0;
  const stop = await fire.watch(a.code, a.token, () => { updates++; });
  await tick();
  assert.ok(updates >= 1, 'premier état reçu');
  /* une action valide selon l'état courant */
  let wst = (await fire.getState(a.code, a.token)).state;
  let wresp;
  if (wst.phase === 'roll') {
    wresp = await fire.action(a.code, tokens[wst.turn], { type: 'roll' });
  } else {
    const s2 = await fire.getState(a.code, tokens[wst.turn]);
    const pl = [0, 1].filter(i => s2.legal[i] && s2.legal[i].length);
    const d2 = pl[0];
    const m2 = s2.legal[d2][0];
    wresp = await fire.action(a.code, tokens[wst.turn], { type: 'move', pawn: m2.pawn, to: m2.to, die: d2 });
  }
  assert.ok(!wresp.error, wresp.error);
  await tick();
  assert.ok(updates >= 2, 'mise à jour reçue après action');
  const before = updates;
  stop();
  await tick();
  assert.strictEqual(updates, before, 'plus de notifications après stop');
  console.log('✔ écoute en direct (onSnapshot) + arrêt propre');

  /* partie complète jouée à travers le backend */
  let guard = 0;
  st = (await fire.getState(a.code, a.token)).state;
  while (!st.over && guard++ < 6000) {
    const tok = tokens[st.turn];
    if (st.phase === 'roll') {
      const out = await fire.action(a.code, tok, { type: 'roll' });
      assert.ok(!out.error, out.error);
      st = out.state;
    } else {
      const out0 = await fire.getState(a.code, tok);
      // gérer aussi la somme des 2 dés
      const hasSum = out0.legal.sum && out0.legal.sum.length;
      const pl = [0, 1].filter(i => out0.legal[i] && out0.legal[i].length);
      assert.ok(pl.length > 0 || hasSum, 'phase move doit avoir un dé jouable');
      let d, m;
      if (!pl.length || (hasSum && Math.random() < 0.3)) {
        m = out0.legal.sum[Math.floor(Math.random()*out0.legal.sum.length)];
        d = 'sum';
      } else {
        d = pl[Math.floor(Math.random() * pl.length)];
        m = out0.legal[d][Math.floor(Math.random() * out0.legal[d].length)];
      }
      const out = await fire.action(a.code, tok, { type: 'move', pawn: m.pawn, to: m.to, die: d });
      assert.ok(!out.error, out.error);
      st = out.state;
    }
  }
  assert.ok(st.over, 'la partie doit se terminer');
  assert.strictEqual(st.ranks.length, 2);
  console.log('✔ partie complète via Firebase (' + guard + ' actions), classement =', st.ranks.join(' / '));

  /* redémarrage */
  const re = await fire.action(a.code, a.token, { type: 'restart' });
  assert.ok(!re.error, re.error);
  assert.strictEqual(re.state.over, false);
  assert.strictEqual(re.started, false, 'rejouer → retour au lobby (l\'hôte relancera)');
  assert.strictEqual(re.state.rev, 0);
  assert.deepStrictEqual(re.state.players[0].pawns, [-1, -1, -1, -1]);
  console.log('✔ redémarrage de la partie');

  console.log('\nTous les tests backend passent ✅');
})().catch(e => { console.error('❌', e); process.exit(1); });
