/* Tests rapides du moteur Ludo (deux dés) — node test.js */
const assert = require('assert');
const L = require('./public/engine.js');

const rngFor = (vals) => { let i = 0; return () => (vals[i++] - 1) / 6; }; // [0,1[ comme Math.random

/* 1. Parties aléatoires : terminées, classement complet */
for (let g = 0; g < 200; g++) {
  const st = L.createGame(['red', 'blue']);
  let steps = 0;
  while (!st.over && steps++ < 8000) {
    if (st.phase === 'roll') L.actionRoll(st);
    else {
      const playable = L.playableDice(st);
      const sum = L.movesForSum(st);
      assert.ok(playable.length > 0 || sum.length > 0, 'phase move doit avoir un coup possible');
      if (!playable.length || (sum.length && Math.random() < 0.3)) {
        L.actionMove(st, sum[0].pawn, sum[0].to, 'sum');
      } else {
        const die = playable[Math.floor(Math.random() * playable.length)];
        const mv = L.movesForDie(st, die);
        assert.ok(mv.length > 0);
        const m = mv[Math.floor(Math.random() * mv.length)];
        L.actionMove(st, m.pawn, m.to, die);
      }
    }
  }
  assert.ok(st.over, 'la partie doit se terminer');
  assert.strictEqual(st.ranks.length, 2);
  assert.ok(st.ranks.includes('red') && st.ranks.includes('blue'));
}
console.log('✔ 200 parties aléatoires terminées');

/* 2. Recul pour manger (avec un autre pion disponible pour l'autre dé) */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [3, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [40, 10, -1, -1]; // pion sur la piste + un autre pion jouable avec 4
  st.players[1].pawns = [50, -1, -1, -1]; // bleu sur la case visée (pos 37 rouge = abs 38)
  const mv = L.movesForDie(st, 0);
  const bwd = mv.find(m => m.to === 37);
  assert.ok(bwd && bwd.type === 'bwd' && bwd.capture, 'recul-manger proposé');
  L.actionMove(st, bwd.pawn, bwd.to, 0);
  assert.strictEqual(st.players[1].pawns[0], -1, 'pion bleu renvoyé à la base');
  assert.ok(st.log.some(l => l.includes('recule')));
  assert.strictEqual(st.dieUsed[0], true);
  // ÉTAPE 1 FIX: après un recul, l'autre dé peut toujours avancer avec un autre pion
  assert.strictEqual(st.phase, 'move', 'après un recul-manger, l\'autre dé reste jouable avec un autre pion');
  assert.ok(L.movesForDie(st, 1).length > 0, 'dé 4 toujours jouable');
  const mv2 = L.movesForDie(st, 1);
  assert.ok(mv2.length > 0);
  L.actionMove(st, mv2[0].pawn, mv2[0].to, 1);
  assert.strictEqual(st.phase, 'roll', 'après les 2 dés, tour suivant');
  assert.strictEqual(st.turn, 1);
}
console.log('✔ recul pour manger');

/* 3. RÈGLE STRICTE : pas de capture si un autre pion ne peut pas jouer l'autre dé */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [3, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [19, -1, -1, -1]; // seul pion sur la piste (les autres en base)
  st.players[1].pawns = [29, 39, -1, -1]; // cible du recul (abs 17) + étoile occupée (abs 27)
  const mv = L.movesForDie(st, 0);
  assert.ok(!mv.some(m => m.to === 16), 'capture interdite : aucun autre pion pour le dé 4');
  assert.ok(mv.some(m => m.type === 'fwd'), 'il doit rester l\'avancée classique');
  // ÉTAPE 1 FIX: stacking sur étoile autorisé, donc dé 4 a un coup
  L.actionMove(st, 0, 22, 0);
  assert.strictEqual(st.phase, 'move', 'dé 4 a un coup (stacking sur étoile) -> tour continue');
  const mv2s = L.movesForDie(st, 1);
  assert.ok(mv2s.length > 0, 'dé 4 jouable via stacking');
  assert.strictEqual(mv2s[0].capture, false, 'pas de capture sur étoile');
  L.actionMove(st, mv2s[0].pawn, mv2s[0].to, 1);
  assert.strictEqual(st.phase, 'roll', 'après les 2 dés, tour suivant');
  assert.strictEqual(st.turn, 1);
}
console.log('✔ règle stricte de capture (autre dé doit être jouable)');

/* 4. Sortie avec 6 + enchaînement avec l'autre dé sur le même pion */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [6, 3]; st.dieUsed = [false, false];
  const mv = L.movesForDie(st, 0);
  assert.ok(mv.some(m => m.type === 'out'), 'sortie possible avec le 6');
  L.actionMove(st, 0, 0, 0);            // on sort le pion avec le 6
  assert.strictEqual(st.phase, 'move');
  const mv2 = L.movesForDie(st, 1);
  assert.ok(mv2.some(m => m.pawn === 0 && m.to === 3), 'on enchaîne avec le 3 sur le pion sorti');
  L.actionMove(st, 0, 3, 1);
  assert.strictEqual(st.turn, 1, 'tour suivant');
}
console.log('✔ sortie au 6 + enchaînement de l\'autre dé');

/* 5. Double 6 = relance ; trois double-6 = tour perdu */
{
  const st = L.createGame(['red', 'blue']);
  st.players[0].pawns = [10, -1, -1, -1];
  st.players[1].pawns = [10, -1, -1, -1];
  // double 6 #1
  L.actionRoll(st, rngFor([6, 6]));
  assert.strictEqual(st.phase, 'move');
  assert.strictEqual(st.sixStreak, 1);
  let mv = L.movesForDie(st, 0);
  L.actionMove(st, mv[0].pawn, mv[0].to, 0);
  mv = L.movesForDie(st, 1);
  L.actionMove(st, mv[0].pawn, mv[0].to, 1);
  assert.strictEqual(st.phase, 'roll', 'relance après double 6');
  assert.strictEqual(st.turn, 0, 'c\'est encore à rouge');
  // double 6 #2 -> pareil
  L.actionRoll(st, rngFor([6, 6]));
  mv = L.movesForDie(st, 0); L.actionMove(st, mv[0].pawn, mv[0].to, 0);
  mv = L.movesForDie(st, 1); L.actionMove(st, mv[0].pawn, mv[0].to, 1);
  assert.strictEqual(st.phase, 'roll');
  assert.strictEqual(st.sixStreak, 2);
  // double 6 #3 -> tour perdu
  L.actionRoll(st, rngFor([6, 6]));
  assert.strictEqual(st.turn, 1, 'trois double-6 -> tour perdu');
  assert.strictEqual(st.sixes || st.sixStreak, 0);
  // un 6 simple ne redonne pas de relance
  const st2 = L.createGame(['red', 'blue']);
  st2.players[0].pawns = [10, -1, -1, -1];
  L.actionRoll(st2, rngFor([6, 2]));
  let m2 = L.movesForDie(st2, 0); L.actionMove(st2, m2[0].pawn, m2[0].to, 0);
  m2 = L.movesForDie(st2, 1); L.actionMove(st2, m2[0].pawn, m2[0].to, 1);
  assert.strictEqual(st2.turn, 1, 'pas de relance sur un 6 simple');
}
console.log('✔ double 6 = relance, triple = perdu, simple 6 = rien');

/* 6. Cases protégées */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 2]; st.dieUsed = [false, false];
  st.players[0].pawns = [7, -1, -1, -1];   // rouge avant son étoile
  st.players[1].pawns = [21, -1, -1, -1];  // bleu posé sur l'étoile rouge (ring 9)
  assert.strictEqual(L.movesForDie(st, 0).length, 1, 'atterrissage sur étoile occupée autorisé (stacking, sans capture)');
  assert.strictEqual(L.movesForDie(st, 0)[0].capture, false, 'pas de capture sur étoile protégée');
  assert.ok(L.movesForDie(st, 1).length > 0, 'le dé 2 reste jouable ailleurs');
}
console.log('✔ cases protégées');

/* 7. Fin de partie : elle ne s'arrête que lorsqu'un seul joueur n'a pas fini */
{
  /* à2 joueurs : un vainqueur suffit → fin immédiate, l'autre = dernier */
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 5]; st.dieUsed = [false, true];
  st.players[0].pawns = [56, 56, 56, 55];
  L.actionMove(st, 3, 56, 0);
  assert.strictEqual(st.ranks[0], 'red', '1re place');
  assert.ok(st.over, '2 joueurs : un vainqueur = fin immédiate');
  assert.deepStrictEqual(st.ranks, ['red', 'blue'], 'le dernier prend la 2e place');

  /* à4 joueurs : ça continue tant qu'au moins2 n'ont pas fini */
  const st4 = L.createGame(['red', 'green', 'yellow', 'blue']);
  st4.phase = 'move'; st4.dice = [1, 5]; st4.dieUsed = [false, true];
  st4.players[0].pawns = [56, 56, 56, 55];
  L.actionMove(st4, 3, 56, 0);
  assert.ok(!st4.over, '4 joueurs :3 sans finir = on continue');
  assert.deepStrictEqual(st4.ranks, ['red']);
  st4.phase = 'move'; st4.dice = [1, 5]; st4.dieUsed = [false, true];
  st4.turn = 1;
  st4.players[1].pawns = [56, 56, 56, 55];
  L.actionMove(st4, 3, 56, 0);
  assert.ok(!st4.over, '4 joueurs :2 sans finir = on continue');
  st4.phase = 'move'; st4.dice = [1, 5]; st4.dieUsed = [false, true];
  st4.turn = 2;
  st4.players[2].pawns = [56, 56, 56, 55];
  L.actionMove(st4, 3, 56, 0);
  assert.ok(st4.over, '4 joueurs :1 seul sans finir = fin de partie');
  assert.deepStrictEqual(st4.ranks, ['red', 'green', 'yellow', 'blue'],
    'le dernier sans finir est classé automatiquement');

  /* le bouton « Terminer » reste disponible (classement par progression) */
  const st5 = L.createGame(['red', 'blue']);
  st5.players[0].pawns = [10, -1, -1, -1];
  L.finishNow(st5);
  assert.ok(st5.over && st5.ranks.length === 2, ' Terminer : classement complet');
}
console.log('✔ fin de partie : un seul joueur sans finir = arrêt (bilan compris)');

/* 8. SOMME DES DEUX DÉS : recul-capture combiné (les deux dés d'un coup) */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [3, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [10, -1, -1, -1]; // pos 10 → somme 7 → pos 3 (abs 4)
  st.players[1].pawns = [16, -1, -1, -1]; // bleu sur la case visée
  const sum = L.movesForSum(st);
  assert.ok(sum.length >= 1, 'somme proposée');
  const b = sum.find(m => m.to === 3);
  assert.ok(b && b.type === 'bwd' && b.capture, 'bien un recul-capture en somme');
  // un dé déjà utilisé → plus de somme
  st.dieUsed[1] = true;
  assert.strictEqual(L.movesForSum(st).length, 0, 'somme impossible si un dé est déjà utilisé');
  st.dieUsed[1] = false;
  // exécution du recul en somme
  const r = L.actionMove(st, b.pawn, b.to, 'sum');
  assert.ok(!r.error, r.error);
  assert.strictEqual(st.players[1].pawns[0], -1, 'pion bleu mangé par la somme');
  assert.deepStrictEqual(st.dieUsed, [true, true], 'les deux dés utilisés d\'un coup');
  assert.ok(st.log.some(l => l.includes('somme')), 'journal : somme des 2 dés');
  assert.strictEqual(st.phase, 'roll', 'plus aucun dé -> tour suivant');
}
console.log('✔ somme des deux dés (recul-capture combiné)');

/* 9. Aucun recul depuis la maison */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [3, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [52, -1, -1, -1]; // en maison
  st.players[1].pawns = [10, -1, -1, -1]; // cible qu'un recul illégal toucherait
  const mv = L.movesForDie(st, 0);
  assert.ok(!mv.some(m => m.type === 'bwd'), 'pas de recul depuis la maison');
  assert.strictEqual(L.movesForSum(st).length, 0, 'pas de somme non plus');
}
console.log('✔ aucun recul depuis la maison');

/* 10. APRÈS UN MANGER : le pion qui a mangé ne rejoue plus ce tour (même direction) */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [36, 10, -1, -1];  // 36 +1 -> bouche bleu + entree
  st.players[1].pawns = [52, -1, -1, -1];  // bleu en case2 de son couloir
  const mv = L.movesForDie(st, 0);
  const ent = mv.find(m => m.type === 'entree');
  assert.ok(ent, 'entrée-manger proposée');
  L.actionMove(st, ent.pawn, ent.to, 0);
  assert.strictEqual(st.eaten, 0, 'pion verrouillé après le manger');
  const mv2 = L.movesForDie(st, 1);
  assert.ok(!mv2.some(m => m.pawn === 0), 'le pion qui a mangé ne rejoue plus avec l\'autre dé');
  assert.ok(mv2.some(m => m.pawn === 1), 'l\'autre pion, lui, peut jouer le dé 4 (même direction avant)');
  // nouveau jet = déverrouillage
  st.phase = 'roll';
  L.actionRoll(st, rngFor([5, 2]));
  assert.strictEqual(st.eaten, null, 'nouveau jet : déverrouillé');
}
console.log('✔ après un manger, le pion ne rejoue plus (déverrouillé au jet suivant)');

/* 11. Un pion qui rentre à la maison : le tour continue avec l'autre dé */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [3, 2]; st.dieUsed = [false, false];
  st.players[0].pawns = [40, 45, 55, -1];
  L.actionMove(st, 2, 56, 0);           // rentre à la maison avec le 3
  assert.strictEqual(st.phase, 'move', 'le tour continue après une arrivée à la maison');
  assert.strictEqual(st.eaten, null, 'rentrer ne verrouille pas le pion');
  assert.ok(L.movesForDie(st, 1).length > 0, 'l\'autre dé reste jouable');
}
console.log('✔ arrivée à la maison : le tour continue avec l\'autre dé');

/* 12. Après un manger : phase 'move' conservée si même direction */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [36, 10, -1, -1];
  st.players[1].pawns = [52, -1, -1, -1];
  const ent = L.movesForDie(st, 0).find(m => m.type === 'entree');
  L.actionMove(st, ent.pawn, ent.to, 0);
  assert.strictEqual(st.phase, 'move', 'le tour continue après le manger');
  assert.ok(L.movesForDie(st, 1).some(m => m.pawn === 1),
    'un AUTRE pion doit pouvoir jouer le deuxième dé (même direction)');
}
console.log('✔ après un manger : le tour continue, un autre pion joue le 2e dé');

/* 13. Manger ne donne PLUS de relance (seul le double 6 relance) */
{
  const st = L.createGame(['red', 'yellow']);
  st.phase = 'move'; st.dice = [4, 3]; st.dieUsed = [false, false];
  st.players[0].pawns = [10, 30, -1, -1];
  st.players[1].pawns = [40, -1, -1, -1];
  const cap = L.movesForDie(st, 0).find(m => m.to === 14 && m.capture);
  assert.ok(cap, 'capture possible avec le4');
  L.actionMove(st, cap.pawn, cap.to, 0);
  assert.strictEqual(st.turnCaptured, true, 'manger enregistre');
  assert.strictEqual(st.stats.red.ate, 1);
  assert.strictEqual(st.stats.yellow.lost, 1);
  const m2 = L.movesForDie(st, 1)[0];
  assert.ok(m2, 'l\'autre dé reste jouable');
  L.actionMove(st, m2.pawn, m2.to, 1);
  assert.strictEqual(st.phase, 'roll', 'après les 2 dés, tour suivant');
  assert.strictEqual(st.turn, 1, 'manger ne redonne plus le tour → à jaune');
  // pas de message "jet supplémentaire" sur un manger
  L.actionRoll(st, rngFor([2, 3]));
  assert.strictEqual(st.turnCaptured, false);
}
console.log('✔ manger ne donne plus de jet supplémentaire');

/* 14. Arriver à la maison ne donne PLUS de relance */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [55, 40, -1, -1];
  L.actionMove(st, 0, 56, 0);
  assert.strictEqual(st.turnArrived, true);
  const m2 = L.movesForDie(st, 1)[0];
  L.actionMove(st, m2.pawn, m2.to, 1);
  assert.strictEqual(st.phase, 'roll', 'après les 2 dés, tour suivant');
  assert.strictEqual(st.turn, 1, 'arriver ne redonne plus le tour');
}
console.log('✔ arriver à la maison ne donne plus de jet supplémentaire');

/* 15. Recul derrière la case de départ (le « trou », position -2) */
{
  const st = L.createGame(['red', 'yellow']);
  st.phase = 'move'; st.dice = [1, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [0, 30, -1, -1];   // rouge vient de sortir
  st.players[1].pawns = [25, -1, -1, -1];  // jaune sur le trou rouge (abs0)
  assert.deepStrictEqual(L.cellAt('red', -2), [0, 6], 'cellule du trou');
  const bwd = L.movesForDie(st, 0).find(m => m.to === -2);
  assert.ok(bwd && bwd.type === 'bwd' && bwd.capture, 'recul derrière le départ proposé');
  L.actionMove(st, bwd.pawn, -2, 0);
  assert.strictEqual(st.players[1].pawns[0], -1, 'jaune mangé sur le trou');
  assert.strictEqual(st.players[0].pawns[0], -2, 'rouge posé sur le trou');
  // ÉTAPE 1 FIX: après un recul-manger, l'autre dé peut avancer
  assert.strictEqual(st.phase, 'move', 'après un recul-manger, l\'autre dé reste jouable');
  assert.ok(L.movesForDie(st, 1).length > 0, 'dé 4 jouable après recul');
  const mv2b = L.movesForDie(st, 1);
  L.actionMove(st, mv2b[0].pawn, mv2b[0].to, 1);
  assert.strictEqual(st.phase, 'roll', 'après les 2 dés, tour suivant');
  assert.strictEqual(st.turn, 1, 'tour à jaune');
  // on remet à rouge pour tester le déverrouillage du trou
  st.turn = 0; st.phase = 'move'; st.dice = [4, 2]; st.dieUsed = [false, false]; st.turnDir = null; st.eaten = null;
  const mv3 = L.movesForDie(st, 0);
  assert.ok(mv3.some(m => m.pawn === 0 && m.to === 3),
    'depuis le trou : avancer de 4 = case de départ (pos 0) + 3');
}
console.log('✔ recul derrière la case de départ (le trou) + repartie depuis le trou');

/* 16. Entrée dans le couloir adverse (en avançant) */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [36, 10, -1, -1];  // rouge : +1 -> bouche du bleu (abs38)
  st.players[1].pawns = [52, -1, -1, -1];  // bleu dans SON couloir (case2)
  const ent = L.movesForDie(st, 0).find(m => m.type === 'entree');
  assert.ok(ent, 'entrée dans le couloir proposée (dé1)');
  assert.strictEqual(ent.to, -42, 'cible = case2 du couloir du bleu');
  L.actionMove(st, ent.pawn, ent.to, 0);
  assert.strictEqual(st.players[1].pawns[0], -1, 'le pion bleu est mangé (retour en base)');
  assert.ok(L.intruderInfo(st.players[0].pawns[0]), 'le rouge est debout dans le couloir');
  assert.deepStrictEqual(L.intruderInfo(st.players[0].pawns[0]), { host: 'blue', cell: 2 });
  assert.strictEqual(st.stats.red.ate, 1, 'bilan : rouge a mangé');
  assert.strictEqual(st.stats.blue.lost, 1, 'bilan : bleu a perdu');
  assert.strictEqual(st.turnCaptured, true, 'manger = jet supplémentaire');
  assert.ok(L.movesForDie(st, 1).some(m => m.pawn === 1), 'l\'autre pion joue le2e dé');
}
console.log('✔ entrée dans le couloir adverse (en avançant)');

/* 17. Entrée en RECUL, sur la dernière case (case5) */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [3, 4]; st.dieUsed = [false, false];
  st.players[0].pawns = [40, 10, -1, -1];  // -3 -> bouche du bleu (abs38) en reculant
  st.players[1].pawns = [55, -1, -1, -1];  // bleu en case5 de son couloir
  const ent = L.movesForDie(st, 0).find(m => m.type === 'entree');
  assert.ok(ent, 'entrée par le recul proposée');
  assert.strictEqual(ent.to, -45, 'cible = case5 du couloir du bleu');
  L.actionMove(st, ent.pawn, ent.to, 0);
  assert.strictEqual(st.players[1].pawns[0], -1, 'mangé en case5');
  assert.deepStrictEqual(L.intruderInfo(st.players[0].pawns[0]), { host: 'blue', cell: 5 });
}
console.log('✔ entrée dans le couloir en recul (n\'importe quelle case)');

/* 18. Le pion piégé s\'y déplace : avant normal, recul = manger seulement,
       pas de sortie sans double6 */
{
  /* (a) avancer et manger le propriétaire */
  const a = L.createGame(['red', 'blue']);
  a.phase = 'move'; a.dice = [1, 4]; a.dieUsed = [false, false];
  a.players[0].pawns = [-42, 10, -1, -1];  // rouge en case2 du couloir du bleu
  a.players[1].pawns = [53, -1, -1, -1];   // bleu en case3
  const f = L.movesForDie(a, 0).find(m => m.pawn === 0 && m.type === 'fwd');
  assert.ok(f && f.capture, 'avancer sur le propriétaire = manger');
  L.actionMove(a, f.pawn, f.to, 0);
  assert.strictEqual(a.players[1].pawns[0], -1, 'propriétaire mangé dans SON couloir');
  assert.deepStrictEqual(L.intruderInfo(a.players[0].pawns[0]), { host: 'blue', cell: 3 });

  /* (b) recul libre dans le couloir adverse (nouvelle règle) */
  const b = L.createGame(['red', 'blue']);
  b.phase = 'move'; b.dice = [1, 2]; b.dieUsed = [false, false];
  b.players[0].pawns = [-43, 10, -1, -1];  // case3
  b.players[1].pawns = [-1, 51, -1, -1];   // bleu en case1
  const m1 = L.movesForDie(b, 0);
  assert.ok(m1.some(m => m.pawn === 0 && m.to === -42 && !m.capture), 'recul libre sur case vide autorisé');
  const m2 = L.movesForDie(b, 1);
  const bw = m2.find(m => m.pawn === 0 && m.type === 'bwd');
  assert.ok(bw && bw.to === -41 && bw.capture, 'recul sur case occupée = manger');

  /* (c) case5 : aucune avancée, pas de sortie sans double6 ni capture dehors */
  const c = L.createGame(['red', 'blue']);
  c.phase = 'move'; c.dice = [3, 4]; c.dieUsed = [false, false];
  c.players[0].pawns = [-45, 10, -1, -1];
  assert.ok(!L.movesForDie(c, 0).some(m => m.pawn === 0 && m.type === 'fwd'),
    'au bout du couloir : impossible d\'avancer au-delà de la case5');
  assert.ok(!L.movesForDie(c, 0).some(m => m.type === 'sortie'),
    'pas de sortie sans double6');
}
console.log('✔ pion dans le couloir : déplacements internes + sortie interdite');

/* 19. Sortie = double6 + jet supplémentaire */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [6, 6]; st.dieUsed = [false, false];
  st.sixStreak = 1;                          // double6 venu du jet
  st.players[0].pawns = [-42, -1, -1, -1];   // rouge piégé (case2 du couloir bleu)
  st.players[1].pawns = [-1, -1, -1, -1];
  const so = L.movesForDie(st, 0).find(m => m.type === 'sortie');
  assert.ok(so, 'double6 = sortie possible');
  assert.strictEqual(so.to, 37, 'réapparaît sur la bouche du bleu (abs38)');
  L.actionMove(st, so.pawn, so.to, 0);
  assert.strictEqual(st.players[0].pawns[0], 37, 'de retour sur l\'anneau');
  assert.strictEqual(st.eaten, 0, 'le pion sorti ne rejoue plus');
  // sortie consomme les 2 dés → plus de dé jouable, relance directe
  assert.strictEqual(st.dieUsed[0], true);
  assert.strictEqual(st.dieUsed[1], true);
  assert.strictEqual(st.phase, 'roll', 'double6 sortie = relance directe');
  assert.strictEqual(st.turn, 0, 'encore à rouge');
  assert.ok(st.log.some(l => l.includes('jet supplémentaire')));

  /* un6 simple (sans double) ne sort pas */
  const s2 = L.createGame(['red', 'blue']);
  s2.phase = 'move'; s2.dice = [6, 3]; s2.dieUsed = [false, false];
  s2.players[0].pawns = [-42, -1, -1, -1];
  assert.ok(!L.movesForDie(s2, 0).some(m => m.type === 'sortie'),
    'un6 simple ne fait pas sortir');
}
console.log('✔ sortie du couloir = double6 + jet supplémentaire');

/* 20. Le propriétaire peut manger l\'intrus dans son couloir (et règle
       stricte toujours valable) */
{
  const st = L.createGame(['red', 'blue']);
  st.phase = 'move'; st.dice = [1, 4]; st.dieUsed = [false, false];
  st.turn = 1;                                // c\'est à bleu
  st.players[0].pawns = [-41, -1, -1, -1];    // intrus rouge en case1 du couloir bleu
  st.players[1].pawns = [50, 10, -1, -1];     // bleu sur sa bouche -> case1
  const mv = L.movesForDie(st, 0).find(m => m.pawn === 0);
  assert.ok(mv && mv.to === 51 && mv.capture, 'le propriétaire mange l\'intrus en entrant');
  L.actionMove(st, mv.pawn, mv.to, 0);
  assert.strictEqual(st.players[0].pawns[0], -1, 'intrus renvoyé en base');
  assert.strictEqual(st.stats.blue.ate, 1, 'bilan : bleu a mangé');

  /* nouvelle règle : même seul, on peut rentrer dans sa maison pour manger l'intrus (dé == cellule) */
  const s2 = L.createGame(['red', 'blue']);
  s2.phase = 'move'; s2.dice = [1, 4]; s2.dieUsed = [false, false];
  s2.turn = 1;
  s2.players[0].pawns = [-41, -1, -1, -1];
  s2.players[1].pawns = [50, -1, -1, -1];     // seul pion, mais home_retour autorisé
  assert.strictEqual(L.movesForDie(s2, 0).filter(m => m.pawn === 0).length, 1,
    'même seul, le propriétaire peut rentrer chez lui pour manger (dé == cellule)');
}
console.log('✔ le propriétaire mange l\'intrus dans son couloir (règle stricte)');

/* parties locales à 3 et 4 joueurs : moteur générique (classement complet) */
for (const colors of [['red', 'green', 'yellow'],
                      ['red', 'green', 'yellow', 'blue']]) {
  const st = L.createGame(colors);
  let steps = 0;
  while (!st.over && steps++ < 12000) {
    if (st.phase === 'roll') L.actionRoll(st);
    else {
      const playable = L.playableDice(st);
      const sum = L.movesForSum(st);
      assert.ok(playable.length > 0 || sum.length > 0, 'coup possible attendu');
      if (!playable.length || (sum.length && Math.random() < 0.3)) {
        L.actionMove(st, sum[0].pawn, sum[0].to, 'sum');
      } else {
        const die = playable[Math.floor(Math.random() * playable.length)];
        const mv = L.movesForDie(st, die);
        const m = mv[Math.floor(Math.random() * mv.length)];
        L.actionMove(st, m.pawn, m.to, die);
      }
    }
  }
  assert.ok(st.over, colors.length + ' joueurs : la partie doit se terminer');
  assert.strictEqual(st.ranks.length, colors.length, 'classement complet');
  assert.strictEqual(new Set(colors).size, colors.length, 'couleurs toutes distinctes');
}
console.log('✔ parties locales à 3 et 4 joueurs terminées, classement complet');

console.log('\nTous les tests passent ✅');
