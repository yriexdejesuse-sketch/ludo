/* ============================================================
   Moteur de jeu Ludo — DEUX DÉS (partagé navigateur + serveur, UMD)
   Règles :
   - 2 à 4 joueurs, 4 pions chacun
   - deux dés : chaque dé donne un déplacement (mêmes pions ou différents)
   - il faut un 6 (sur un des deux dés) pour sortir de la base ;
     on peut enchaîner avec l'autre dé sur le pion que l'on vient de sortir
   - relance UNIQUEMENT sur DOUBLE 6 (manger ou arriver ne donne plus de relance) ;
     trois double-6 de suite = tour perdu
   - atterrir sur un pion ennemi le renvoie à sa base
   - RECOULEMENT : sur l'anneau, reculer UNIQUEMENT pour manger ; dans le couloir adverse, avance ET recule LIBRES
   - SORTIE DE COULOIR : double 6 consomme les 2 dés (1 seul jet supp.) ; intrus peut aussi sortir en mangeant dehors ; propriétaire peut entrer dans sa maison pour manger l'intrus si dé == cellule
   - JAMAIS mixer avant/arrière dans le même jet (somme = tout en avant OU tout en arrière)
   - RÈGLE STRICTE DE CAPTURE : manger dehors avec un dé n'est possible que si un AUTRE pion peut encore jouer l'autre dé
   - APRÈS UN MANGER : le pion qui vient de manger ne rejoue plus du tout ce tour
   - cases de départ et cases étoillées = protégées
   - pions alliés empilables ; 1er à rentrer ses 4 pions gagne,
     la partie continue pour les places suivantes
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ludo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Parcours de 52 cases (sens horaire) — coordonnées [x, y] grille 15x15 */
  var RING = [
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    [7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    [14,7],[14,8],
    [13,8],[12,8],[11,8],[10,8],[9,8],
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    [7,14],[6,14],
    [6,13],[6,12],[6,11],[6,10],[6,9],
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    [0,7]
  ];

  var COLORS = ['red', 'green', 'yellow', 'blue'];

  var INFO = {
    red:    { label:'Rouge', base:[0,0], start:1,  mouth:51,
              home:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]] },
    green:  { label:'Vert',  base:[9,0], start:14, mouth:12,
              home:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]] },
    yellow: { label:'Jaune', base:[9,9], start:27, mouth:25,
              home:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]] },
    blue:   { label:'Bleu',  base:[0,9], start:40, mouth:38,
              home:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]] }
  };

  var OPPOSITE = { red:'yellow', yellow:'red', green:'blue', blue:'green' };

  var SAFE = {};
  COLORS.forEach(function (c) {
    var s = INFO[c].start;
    SAFE[s] = true;
    SAFE[(s + 8) % 52] = true;
  });

  /* position logique : -1 = base, -2 = case « trou » derrière le départ,
     0..50 = anneau, 51..56 = maison */
  function ringIdxOf(color, pos) {
    if (pos === -2) return (INFO[color].start + 51) % 52; /* le trou = juste avant le départ */
    if (pos < 0 || pos > 50) return -1;
    return (INFO[color].start + pos) % 52;
  }

  /* pion piégé dans le couloir adverse :
     pos = -(10 * (index du propriétaire + 1) + case), case = 1..5
     ex. dans le couloir du rouge (index0) : -11..-15 ; bleu (index3) : -41..-45 */
  function intruderInfo(pos) {
    if (typeof pos !== 'number' || pos > -11 || pos < -45) return null;
    var hostIdx = Math.floor((-pos) / 10) - 1;
    var cell = -pos - 10 * (hostIdx + 1);
    if (hostIdx < 0 || hostIdx > 3 || cell < 1 || cell > 5) return null;
    return { host: COLORS[hostIdx], cell: cell };
  }
  function isIntruderPos(pos) { return intruderInfo(pos) !== null; }
  function makeIntruderPos(host, cell) {
    return -(10 * (COLORS.indexOf(host) + 1) + cell);
  }

  /* tous les pions présents sur une case d'un couloir (propriétaire +
     intrus), alliés de ma couleur compris (ils bloquent) */
  function corridorAt(state, host, cell, myColor) {
    var res = [];
    state.players.forEach(function (p) {
      p.pawns.forEach(function (pos, i) {
        var pi = intruderInfo(pos);
        if (pi && pi.host === host && pi.cell === cell) {
          res.push({ color: p.color, idx: i });
          return;
        }
        if (p.color === host && pos >= 51 && pos <= 55 && pos - 50 === cell) {
          res.push({ color: p.color, idx: i });
        }
      });
    });
    return res; /* alliés compris : ils bloquent la case */
  }

  /* position logique -> cellule [x,y] ; -1 = base */
  function cellAt(color, pos) {
    var I = INFO[color];
    if (pos === -2) return RING[(I.start + 51) % 52];
    var it = intruderInfo(pos);
    if (it) return INFO[it.host].home[it.cell - 1]; /* debout dans le couloir adverse */
    if (pos < 0) return null;
    if (pos <= 50) return RING[(I.start + pos) % 52];
    return I.home[pos - 51];
  }

  /* cellule VISUELLE : 56 au centre (étape 2) - plus de confusion avec la case 55 */
  function visualCell(color, pos) {
    if (pos === 56) return INFO[color].home[5];
    return cellAt(color, pos);
  }

  function occupiedBy(state, ringI, myColor) {
    var res = [];
    state.players.forEach(function (p) {
      if (p.color === myColor) return;
      p.pawns.forEach(function (pos, i) {
        if ((pos === -2 || (pos >= 0 && pos <= 50)) && ringIdxOf(p.color, pos) === ringI) {
          res.push({ color: p.color, idx: i });
        }
      });
    });
    return res;
  }
  // Barrage : 2 pions sur sa case départ (pos 0) = infranchissable pour les adversaires
  function countOnStart(state, owner) {
    var pl = state.players.find(function(p){ return p.color===owner; });
    if (!pl) return 0;
    var c=0; pl.pawns.forEach(function(pos){ if(pos===0) c++; }); return c;
  }
  function isBlockedStart(state, absIdx, moverColor) {
    for (var i=0;i<COLORS.length;i++){
      var owner=COLORS[i];
      if(owner===moverColor) continue;
      if(INFO[owner].start===absIdx && countOnStart(state, owner)>=2) return true;
    }
    return false;
  }
  function isPathBlocked(state, moverColor, fromAbs, toAbs, steps, isForward) {
    // vérifie chaque case traversée (destination incluse) pour un déplacement sur l'anneau
    for(var s=1; s<=steps; s++){
      var curAbs = isForward ? (fromAbs + s) % 52 : ((fromAbs - s) % 52 + 52) % 52;
      if(isBlockedStart(state, curAbs, moverColor)) return true;
    }
    return false;
  }

  function createGame(colors) {
    return {
      players: colors.map(function (c) {
        return { color: c, pawns: [-1, -1, -1, -1], rank: null };
      }),
      turn: 0,
      phase: 'roll',        // roll | move | over
      dice: [null, null],
      dieUsed: [false, false],
      sixStreak: 0,         // double-6 consécutifs dans le tour
      eaten: null,          // pion qui a mangé ce tour : il ne joue plus
      turnCaptured: false,  // conservé pour compat, plus de relance
      turnArrived: false,   // conservé pour compat
      turnDir: null,       // 'fwd' | 'bwd' | null — interdit de mixer avant/arrière dans le même jet
      ranks: [],
      stats: colors.reduce(function (o, c) { o[c] = { ate: 0, lost: 0 }; return o; }, {}),
      log: ['Partie de Ludo ! Deux dés, bonne chance.'],
      over: false,
      rev: 0
    };
  }

  function currentColor(state) {
    return state.players[state.turn].color;
  }

  function trimLog(state) {
    while (state.log.length > 40) state.log.shift();
  }

  function allFinished(state) {
    return state.players.every(function (p) {
      return p.pawns.every(function (x) { return x === 56; });
    });
  }

  /* ---------- coups bruts pour une valeur de dé ---------- */
  function rawMovesFor(state, value, pawnFilter) {
    if (state.over || state.phase !== 'move' || value == null) return [];
    var pl = state.players[state.turn];
    var out = [];

    pl.pawns.forEach(function (pos, i) {
      if (pawnFilter != null && i !== pawnFilter) return;
      if (pos === 56) return;

      /* sortie de base : seulement avec un 6 */
      if (pos === -1) {
        if (value === 6) {
          var r0 = INFO[pl.color].start;
          var opp0 = occupiedBy(state, r0, pl.color);
          var isSafe0 = !!SAFE[r0];
          if (isSafe0) {
            // stacking autorisé sur le départ (sauf futur barrage à 2 pions - étape 2)
            out.push({ pawn: i, to: 0, type: 'out', capture: false });
          } else if (opp0.length === 0) {
            out.push({ pawn: i, to: 0, type: 'out', capture: false });
          } else {
            out.push({ pawn: i, to: 0, type: 'out', capture: false });
          }
        }
        return;
      }

      /* pion piégé dans un couloir adverse : il s'y déplace (avant
         normalement, recul UNIQUEMENT pour manger) ; il ne peut jamais
         en sortir tout seul (sortie = double6, voir movesForDie) */
      var it = intruderInfo(pos);
      if (it) {
        // Intrus dans le couloir adverse : avance ET recule LIBRES (sauf sortir)
        var fC = it.cell + value;
        if (fC <= 5) {
          var occF = corridorAt(state, it.host, fC, pl.color);
          if (occF.length === 0) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, fC), type: 'fwd', capture: false });
          } else if (occF.some(function (o) { return o.color !== pl.color; })) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, fC), type: 'fwd', capture: true });
          }
        }
        var bC = it.cell - value;
        if (bC >= 1) {
          var occB = corridorAt(state, it.host, bC, pl.color);
          if (occB.length === 0) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, bC), type: 'bwd', capture: false });
          } else if (occB.some(function (o) { return o.color !== pl.color; })) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, bC), type: 'bwd', capture: true });
          }
        }
        // Sortie en mangeant dehors (sans double 6) : depuis la bouche, à ±value sur l'anneau
        var mouthAbs = INFO[it.host].mouth;
        [mouthAbs + value, mouthAbs - value].forEach(function (absT) {
          var a = ((absT % 52) + 52) % 52;
          var occ = occupiedBy(state, a, pl.color);
          if (occ.length > 0 && !SAFE[a]) {
            var offT = ((a - INFO[pl.color].start) % 52 + 52) % 52;
            var toT = (offT === 51) ? -2 : offT;
            out.push({ pawn: i, to: toT, type: 'sortie_mange', capture: true });
          }
        });
        return;
      }

      /* avancer */
      if (pos === -2) {
        /* depuis le « trou » derrière le départ : toujours sur l'anneau - stacking autorisé sur cases protégées (étoile/départ) */
        var fwdG = (51 + value) % 52;
        var rg = ringIdxOf(pl.color, fwdG);
        var fromAbs = ringIdxOf(pl.color, pos);
        if (isPathBlocked(state, pl.color, fromAbs, rg, 1, true)) {
          // barrage sur le chemin - bloqué
        } else {
          var og = occupiedBy(state, rg, pl.color);
          var isSafeG = !!SAFE[rg];
          if (isSafeG) {
            out.push({ pawn: i, to: fwdG, type: 'fwd', capture: false });
          } else {
            out.push({ pawn: i, to: fwdG, type: 'fwd', capture: og.length > 0 });
          }
        }
      } else {
        var fwd = pos + value;
        if (fwd <= 56) {
          if (fwd <= 50) {
            var rf = ringIdxOf(pl.color, fwd);
            var fromAbsF = ringIdxOf(pl.color, pos);
            if (isPathBlocked(state, pl.color, fromAbsF, rf, value, true)) {
              // barrage - aucun mouvement en avant qui traverse
            } else {
              var of = occupiedBy(state, rf, pl.color);
              var isSafeF = !!SAFE[rf];
              if (isSafeF) {
                out.push({ pawn: i, to: fwd, type: 'fwd', capture: false });
              } else {
                out.push({ pawn: i, to: fwd, type: 'fwd', capture: of.length > 0 });
              }
            }
            if (!isPathBlocked(state, pl.color, ringIdxOf(pl.color, pos), rf, value, true)) {
              addEntryMoves(out, state, pl.color, i, rf); /* bouche adverse ? entrée possible */
            }
          } else {
            var laneCapt = fwd <= 55 &&
              corridorAt(state, pl.color, fwd - 50, pl.color).some(function (o) { return o.color !== pl.color; });
            out.push({ pawn: i, to: fwd, type: 'fwd', capture: laneCapt });
          }
        }
        // Propriétaire mange l'intrus DANS SA MAISON depuis n'importe où : dé == cellule
        if (pos >= -2 && pos <= 50) {
          for (var cell = 1; cell <= 5; cell++) {
            if (value !== cell) continue;
            var occHome = corridorAt(state, pl.color, cell, pl.color);
            var hasIntruder = occHome.some(function (o) { return o.color !== pl.color; });
            if (hasIntruder) {
              var toHome = 50 + cell;
              out.push({ pawn: i, to: toHome, type: 'home_retour', capture: true });
            }
          }
        }
      }

      /* reculer : UNIQUEMENT si ça mange un pion ennemi non protégé.
         L'anneau est un CERCLE : on peut reculer derrière sa case de
         départ (la case « trou », -2), jamais depuis la maison. */
      if (pos <= 50) {
        var rel = (pos === -2) ? 51 : pos;
        var absB = ((INFO[pl.color].start + rel - value) % 52 + 52) % 52;
        var off = ((absB - INFO[pl.color].start) % 52 + 52) % 52;
        var toB = (off === 51) ? -2 : off; /*51 = le trou */
        var ob = occupiedBy(state, absB, pl.color);
        if (ob.length > 0 && !SAFE[absB]) {
          out.push({ pawn: i, to: toB, type: 'bwd', capture: true });
        }
        addEntryMoves(out, state, pl.color, i, absB); /* bouche adverse atteinte en recul ? entrée */
      }
    });
    return out;
  }

  /* ENTRÉE DANS UN COULOIR ADVERSE : quand la case atteinte (en avant ou
     en recul) est la bouche d'un adversaire qui a au moins un pion dans
     son couloir (les5 cases avant sa maison), on peut à la place y ENTRER
     et manger sur la case de son choix (n'importe laquelle des5) */
  function addEntryMoves(out, state, color, pawnIdx, landAbs) {
    COLORS.forEach(function (c) {
      if (c === color) return;
      if (INFO[c].mouth !== landAbs) return;
      var cells = {};
      state.players.forEach(function (p) {
        p.pawns.forEach(function (pos) {
          if (p.color === color) return;
          var pi = intruderInfo(pos);
          if (pi && pi.host === c) { cells[pi.cell] = true; return; }
          if (p.color === c && pos >= 51 && pos <= 55) cells[pos - 50] = true;
        });
      });
      Object.keys(cells).forEach(function (k) {
        out.push({ pawn: pawnIdx, to: makeIntruderPos(c, +k), type: 'entree', capture: true });
      });
    });
  }

  /* ---------- coups autorisés pour un dé donné ----------
     RÈGLE STRICTE : une capture n'est permise que si un AUTRE pion
     peut jouer l'autre dé (tant que celui-ci n'est pas encore utilisé). */
  function movesForDie(state, dieIndex) {
    if (state.over || state.phase !== 'move' || state.dieUsed[dieIndex]) return [];
    var v = state.dice[dieIndex];
    if (v == null) return [];
    var moves = rawMovesFor(state, v);
    /* SORTIE D'UN COULOIR par double 6 : consomme LES DEUX dés, 1 seul jet supplémentaire */
    if (state.dice[0] === 6 && state.dice[1] === 6 && v === 6) {
      var plS = state.players[state.turn];
      plS.pawns.forEach(function (pos, i) {
        var itS = intruderInfo(pos);
        if (!itS) return;
        var exitPos = ((INFO[itS.host].mouth - INFO[plS.color].start) % 52 + 52) % 52;
        var re = ringIdxOf(plS.color, exitPos);
        var oe = occupiedBy(state, re, plS.color);
        if (!(oe.length > 0 && SAFE[re])) {
          moves.push({ pawn: i, to: exitPos, type: 'sortie', capture: oe.length > 0 });
        }
      });
    }
    /* pion qui a déjà mangé ce tour : plus aucun coup pour lui */
    if (state.eaten != null) {
      moves = moves.filter(function (m) { return m.pawn !== state.eaten; });
    }
    // ÉTAPE 1 FIX: on autorise de mixer avant/arrière (2ème dé peut avancer après un recul-manger avec un autre pion)
    // turnDir n'est plus filtrant

    var other = 1 - dieIndex;
    var otherPending = !state.dieUsed[other] && state.dice[other] != null;
    if (!otherPending) return moves;

    var otherV = state.dice[other];
    return moves.filter(function (m) {
      if (!m.capture) return true;
      // nouvelles captures spéciales toujours autorisées même avec un seul pion
      if (m.type === 'home_retour' || m.type === 'sortie_mange') return true;
      var pl = state.players[state.turn];
      for (var i = 0; i < pl.pawns.length; i++) {
        if (i === m.pawn) continue;
        /* le pion qui a mangé ne peut pas non plus « sauver » l'autre dé */
        if (state.eaten != null && i === state.eaten) continue;
        if (rawMovesFor(state, otherV, i).length > 0) return true;
      }
      return false; /* aucun autre pion pour l'autre dé -> capture interdite */
    });
  }

  function playableDice(state) {
    var res = [];
    if (state.phase !== 'move') return res;
    [0, 1].forEach(function (i) {
      if (!state.dieUsed[i] && state.dice[i] != null && movesForDie(state, i).length > 0) res.push(i);
    });
    return res;
  }

  /* ---------- SOMME DES DEUX DÉS ----------
     Les deux dés ensemble : soit en avant, soit en arrière (jamais mixer).
     On les consomme d'un seul coup. */
  function movesForSum(state) {
    if (state.over || state.phase !== 'move') return [];
    if (state.dieUsed[0] || state.dieUsed[1]) return [];
    if (state.dice[0] == null || state.dice[1] == null) return [];
    var v = state.dice[0] + state.dice[1];
    var all = rawMovesFor(state, v);
    return all;
  }

  function advance(state) {
    var n = state.players.length;
    var guard = 0;
    state.sixStreak = 0;
    state.turnDir = null;
    do {
      state.turn = (state.turn + 1) % n;
      guard++;
    } while (
      state.players[state.turn].pawns.every(function (x) { return x === 56; }) &&
      guard <= n * 2
    );
    state.phase = 'roll';
    if (allFinished(state)) finishRemaining(state);
  }

  function endTurn(state) {
    var wasDouble = state.dice[0] === 6 && state.dice[1] === 6;
    if (wasDouble && state.sixStreak > 0 && state.sixStreak < 3) {
      /* seule relance : double 6 */
      state.phase = 'roll';
      state.dieUsed = [true, true];
      state.turnDir = null;
      state.log.push('Double 6 — jet supplémentaire !');
      trimLog(state);
      return;
    }
    advance(state);
    trimLog(state);
  }

  function progressScore(p) {
    var done = p.pawns.filter(function (x) { return x === 56; }).length;
    var sum = p.pawns.reduce(function (a, x) {
      return a + (x === -2 ? 0 : Math.max(x, -1));
    }, 0);
    return done * 1000 + sum;
  }

  function rankSuffix(r) {
    return r === 1 ? '1re' : r + 'e';
  }

  function finishRemaining(state) {
    var rest = state.players
      .filter(function (p) { return !p.rank; })
      .sort(function (a, b) { return progressScore(b) - progressScore(a); });
    rest.forEach(function (p) {
      p.rank = state.ranks.length + 1;
      state.ranks.push(p.color);
    });
    state.over = true;
    state.phase = 'over';
  }

  /* ---------- actions ---------- */

  /* VRAI hasard : entropie matérielle du navigateur (crypto.getRandomValues),
     indépendant de tout état du jeu — repli sur Math.random si indisponible */
  function sysRandom() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] / 4294967296;
      }
    } catch (e) { /* repli ci-dessous */ }
    return Math.random();
  }

  function actionRoll(state, rng) {
    if (state.over) return { error: 'Partie terminée.' };
    if (state.phase !== 'roll') return { error: "Ce n'est pas à vous de jouer." };
    var rand = rng || sysRandom;
    var d1 = 1 + Math.floor(rand() * 6);
    var d2 = 1 + Math.floor(rand() * 6);
    var pl = state.players[state.turn];
    var dbl = d1 === 6 && d2 === 6;

    state.dice = [d1, d2];
    state.dieUsed = [false, false];
    state.eaten = null;
    state.turnCaptured = false;
    state.turnArrived = false;
    state.turnDir = null;
    state.rev++;
    state.log.push(INFO[pl.color].label + ' lance : ' + d1 + ' + ' + d2 + (dbl ? ' — double 6 !' : ''));

    if (dbl) state.sixStreak++; else state.sixStreak = 0;

    if (state.sixStreak >= 3) {
      state.log.push("Trois double-six de suite : " + INFO[pl.color].label + ' perd son tour !');
      state.sixStreak = 0;
      advance(state);
      trimLog(state);
      return { ok: true };
    }

    state.phase = 'move';
    if (!playableDice(state).length && !movesForSum(state).length) {
      state.log.push('Aucun coup possible pour ' + INFO[pl.color].label + '.');
      endTurn(state);
      trimLog(state);
      return { ok: true };
    }
    trimLog(state);
    return { ok: true };
  }

  function actionMove(state, pawnIdx, to, dieIndex) {
    if (state.over) return { error: 'Partie terminée.' };
    if (state.phase !== 'move') return { error: 'Lancez les dés d\'abord.' };
    var isSum = dieIndex === 'sum';
    if (!isSum && dieIndex !== 0 && dieIndex !== 1) return { error: 'Dé invalide.' };

    var moves = isSum ? movesForSum(state) : movesForDie(state, dieIndex);
    var mv = null;
    moves.forEach(function (m) {
      if (m.pawn === pawnIdx && m.to === to) mv = m;
    });
    if (!mv) return { error: 'Coup illégal pour ce dé.' };

    var pl = state.players[state.turn];
    var col = pl.color;
    var v = isSum ? state.dice[0] + state.dice[1] : state.dice[dieIndex];

    // direction du tour : mix autorisé (étape 1) - on garde trace mais ne bloque plus
    // if (!state.turnDir) { if (mv.type === 'bwd') state.turnDir = 'bwd'; else state.turnDir = 'fwd'; }
    pl.pawns[pawnIdx] = mv.to;
    if (isSum) { state.dieUsed[0] = true; state.dieUsed[1] = true; }
    else if (mv.type === 'sortie') { state.dieUsed[0] = true; state.dieUsed[1] = true; }
    else state.dieUsed[dieIndex] = true;
    if (mv.to === 56) state.turnArrived = true;
    state.rev++;

    var msg;
    if (mv.type === 'out') msg = INFO[col].label + ' sort un pion de la base !';
    else if (mv.type === 'bwd') msg = INFO[col].label +
      (isSum ? ' recule de ' + v + ' cases (somme des 2 dés) pour manger !'
             : ' recule de ' + v + ' case(s) pour manger !');
    else if (mv.type === 'entree') msg = INFO[col].label + ' entre dans le couloir de ' +
      INFO[intruderInfo(mv.to).host].label;
    else if (mv.type === 'sortie') msg = INFO[col].label + ' sort du couloir grâce au double 6 !';
    else if (mv.type === 'sortie_mange') msg = INFO[col].label + ' sort du couloir en mangeant dehors !';
    else if (mv.type === 'home_retour') msg = INFO[col].label + ' rentre dans sa maison pour manger l\'intrus !';
    else msg = INFO[col].label + (isSum && state.turnDir === 'bwd' ? ' recule de ' + v + ' (somme)' : ' avance de ' + v);

    var caps = [];
    var mvIt = intruderInfo(mv.to);
    if (mvIt) {
      /* debout dans un couloir (entrée ou déplacement) : tout ennemi
         sur la case est mangé (le propriétaire ou un autre intrus) */
      state.players.forEach(function (p) {
        if (p.color === col) return;
        p.pawns.forEach(function (pos, i) {
          var pi = intruderInfo(pos);
          if (pi && pi.host === mvIt.host && pi.cell === mvIt.cell) {
            p.pawns[i] = -1;
            caps.push(p.color);
            return;
          }
          if (p.color === mvIt.host && pos === 50 + mvIt.cell) {
            p.pawns[i] = -1;
            caps.push(p.color);
          }
        });
      });
    } else if (mv.to >= 51 && mv.to <= 55) {
      /* le propriétaire avance dans SON couloir : il peut manger un intrus */
      state.players.forEach(function (p) {
        if (p.color === col) return;
        p.pawns.forEach(function (pos, i) {
          var pi = intruderInfo(pos);
          if (pi && pi.host === col && pi.cell === mv.to - 50) {
            p.pawns[i] = -1;
            caps.push(p.color);
          }
        });
      });
    } else if (mv.to <= 50) {
      var ri = ringIdxOf(col, mv.to);
      state.players.forEach(function (p) {
        if (p.color === col) return;
        p.pawns.forEach(function (pos, i) {
          if ((pos === -2 || (pos >= 0 && pos <= 50)) && ringIdxOf(p.color, pos) === ri) {
            p.pawns[i] = -1;
            caps.push(p.color);
          }
        });
      });
    }
    if (caps.length) {
      state.eaten = pawnIdx; /* le pion qui mange ne rejoue plus ce tour */
      state.turnCaptured = true; /* manger → jet supplémentaire en fin de tour */
      /* bilan des captures : qui mange, qui se fait manger */
      if (!state.stats) state.stats = {};
      if (!state.stats[col]) state.stats[col] = { ate: 0, lost: 0 };
      state.stats[col].ate += caps.length;
      caps.forEach(function (c) {
        if (!state.stats[c]) state.stats[c] = { ate: 0, lost: 0 };
        state.stats[c].lost += 1;
      });
      var names = caps.map(function (c) { return INFO[c].label; }).join(' et ');
      state.log.push(msg + ' — ' + INFO[col].label + ' mange un pion de ' + names + ' !');
    } else {
      state.log.push(msg);
    }
    if (mv.type === 'sortie' || mv.type === 'sortie_mange' || mv.type === 'home_retour') {
      state.eaten = pawnIdx;
    }

    var done = pl.pawns.every(function (x) { return x === 56; });
    if (done && !pl.rank) {
      pl.rank = state.ranks.length + 1;
      state.ranks.push(col);
      state.log.push(INFO[col].label + ' rentre tous ses pions — ' + rankSuffix(pl.rank) + ' place !');
    }

    if (allFinished(state)) {
      state.over = true;
      state.phase = 'over';
      trimLog(state);
      return { ok: true };
    }

    if (done) {
      /* le joueur a fini. La partie ne continue que s'il reste au moins
         DEUX joueurs sans classement ; s'il n'en reste qu'un seul, il prend
         la dernière place et la partie s'arrête (à2 : un vainqueur suffit). */
      var un = state.players.filter(function (p) { return !p.rank; });
      if (un.length <= 1) {
        if (un.length === 1) {
          un[0].rank = state.ranks.length + 1;
          state.ranks.push(un[0].color);
          state.log.push(INFO[un[0].color].label + ' n\'a pas fini — ' +
            rankSuffix(un[0].rank) + ' place !');
        }
        state.over = true;
        state.phase = 'over';
        trimLog(state);
        return { ok: true };
      }
      advance(state);
      trimLog(state);
      return { ok: true };
    }

    if (!playableDice(state).length) {
      endTurn(state);
      trimLog(state);
      return { ok: true };
    }

    /* il reste un dé jouable : phase 'move' inchangée */
    trimLog(state);
    return { ok: true };
  }

  function finishNow(state) {
    if (state.over) return { error: 'Partie terminée.' };
    finishRemaining(state);
    state.rev++;
    state.log.push('La partie s\'arrête — classement final !');
    trimLog(state);
    return { ok: true };
  }

  return {
    RING: RING,
    COLORS: COLORS,
    INFO: INFO,
    OPPOSITE: OPPOSITE,
    SAFE: SAFE,
    cellAt: cellAt,
    visualCell: visualCell,
    ringIdxOf: ringIdxOf,
    intruderInfo: intruderInfo,
    isIntruderPos: isIntruderPos,
    createGame: createGame,
    currentColor: currentColor,
    rawMovesFor: rawMovesFor,
    movesForDie: movesForDie,
    movesForSum: movesForSum,
    playableDice: playableDice,
    actionRoll: actionRoll,
    actionMove: actionMove,
    finishNow: finishNow,
    progressScore: progressScore
  };
});
