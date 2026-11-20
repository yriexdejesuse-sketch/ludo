/* ============================================================
   Moteur de jeu Ludo — DEUX DÉS (partagé navigateur + serveur, UMD)
   Règles SYRO GAMES v2026-11-15 :
   - 2 à 4 joueurs, 4 pions chacun
   - deux dés : chaque dé donne un déplacement (même pion ou différents)
   - il faut un 6 (sur un des deux dés) pour sortir de la base
   - relance UNIQUEMENT sur DOUBLE 6 ; trois double-6 = tour perdu
   - atterrir sur pion ennemi le renvoie à sa base SAUF sur case protégée
   - ⭐ ÉTOILES + DÉPARTS = 100% protégés — jamais mangeable, même en reculant, même avec la somme
   - RECUL : UNIQUEMENT pour manger (partout sur le plateau, y compris les 5 dernières cases 51-55)
   - AVANCE/RECUL dans le même tour : AUTORISÉ mais PAS avec le même pion (dir différente = pion différent)
   - MAISON : un pion dans ton couloir 51-55 ne peut être mangé QUE depuis le couloir ou l'anneau par comptage exact — plus de saut magique depuis n'importe où
   - Intrus dans couloir adverse : avance + recule libres à l'intérieur
   - 56 = maison finale = intouchable
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ludo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  function ringIdxOf(color, pos) {
    if (pos === -2) return (INFO[color].start + 51) % 52;
    if (pos < 0 || pos > 50) return -1;
    return (INFO[color].start + pos) % 52;
  }

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
    return res;
  }

  function cellAt(color, pos) {
    var I = INFO[color];
    if (pos === -2) return RING[(I.start + 51) % 52];
    var it = intruderInfo(pos);
    if (it) return INFO[it.host].home[it.cell - 1];
    if (pos < 0) return null;
    if (pos <= 50) return RING[(I.start + pos) % 52];
    return I.home[pos - 51];
  }

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
      phase: 'roll',
      dice: [null, null],
      dieUsed: [false, false],
      sixStreak: 0,
      eaten: null,
      turnCaptured: false,
      turnArrived: false,
      pawnDir: {}, // SYRO 2026-11-15 : pion -> 'fwd'|'bwd' pour interdire même pion qui fait les 2 sens
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

      if (pos === -1) {
        if (value === 6) {
          var r0 = INFO[pl.color].start;
          // sortie de base : étoiles/départs protégés ne bloquent pas la sortie, mais on ne mange pas dessus
          out.push({ pawn: i, to: 0, type: 'out', capture: false, dir: 'fwd' });
        }
        return;
      }

      var it = intruderInfo(pos);
      if (it) {
        var fC = it.cell + value;
        if (fC <= 5) {
          var occF = corridorAt(state, it.host, fC, pl.color);
          if (occF.length === 0) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, fC), type: 'fwd', capture: false, dir: 'fwd' });
          } else if (occF.some(function (o) { return o.color !== pl.color; })) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, fC), type: 'fwd', capture: true, dir: 'fwd' });
          }
        }
        var bC = it.cell - value;
        if (bC >= 1) {
          var occB = corridorAt(state, it.host, bC, pl.color);
          if (occB.length === 0) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, bC), type: 'bwd', capture: false, dir: 'bwd' });
          } else if (occB.some(function (o) { return o.color !== pl.color; })) {
            out.push({ pawn: i, to: makeIntruderPos(it.host, bC), type: 'bwd', capture: true, dir: 'bwd' });
          }
        }
        var mouthAbs = INFO[it.host].mouth;
        [mouthAbs + value, mouthAbs - value].forEach(function (absT) {
          var a = ((absT % 52) + 52) % 52;
          var occ = occupiedBy(state, a, pl.color);
          if (occ.length > 0 && !SAFE[a]) {
            var offT = ((a - INFO[pl.color].start) % 52 + 52) % 52;
            var toT = (offT === 51) ? -2 : offT;
            out.push({ pawn: i, to: toT, type: 'sortie_mange', capture: true, dir: a === mouthAbs + value ? 'fwd' : 'bwd' });
          }
        });
        return;
      }

      // CAS COULOIR FINAL 51-55 (les 5 dernières cases avant maison)
      if (pos >= 51 && pos <= 55) {
        // AVANCER dans couloir / vers maison
        var fwd = pos + value;
        if (fwd <= 56) {
          if (fwd <= 55) {
            var laneCaptF = corridorAt(state, pl.color, fwd - 50, pl.color).some(function (o) { return o.color !== pl.color; });
            out.push({ pawn: i, to: fwd, type: 'fwd', capture: laneCaptF, dir: 'fwd' });
          } else {
            // fwd == 56 maison -> pas de capture
            out.push({ pawn: i, to: fwd, type: 'fwd', capture: false, dir: 'fwd' });
          }
        }
        // RECULER depuis couloir : UNIQUEMENT pour manger, comme partout ailleurs
        var toB = pos - value;
        if (toB >= 51) {
          // reste dans couloir
          var occC = corridorAt(state, pl.color, toB - 50, pl.color);
          if (occC.some(function(o){ return o.color !== pl.color; })) {
            out.push({ pawn: i, to: toB, type: 'bwd', capture: true, dir: 'bwd' });
          }
        } else if (toB >= 0 && toB <= 50) {
          // retombe sur l'anneau
          var absB2 = ringIdxOf(pl.color, toB);
          if (absB2 >= 0 && !SAFE[absB2]) {
            var ob2 = occupiedBy(state, absB2, pl.color);
            if (ob2.length > 0) out.push({ pawn: i, to: toB, type: 'bwd', capture: true, dir: 'bwd' });
          }
          // entrée adverse en recul depuis couloir aussi possible
          var fromAbsCor = ringIdxOf(pl.color, pos >=51 ? pos : pos); // pos 51-55 -> pas sur anneau, on approxime par mouth
          // pour le couloir, l'abs de départ est la bouche
          var mouthForCor = INFO[pl.color].mouth;
          // distance anneau jusqu'à bouche adverse depuis la bouche
          addExactEntryMoves(out, state, pl.color, i, mouthForCor, value);
        } else if (toB === -2 || toB < 0) {
          // recul très grand depuis couloir jusqu'au trou -> on autorise si capture sur le trou (rare)
          var absHole = (INFO[pl.color].start + 51) % 52;
          if (!SAFE[absHole]) {
            var obH = occupiedBy(state, absHole, pl.color);
            if (obH.length > 0 && toB === -2) out.push({ pawn: i, to: -2, type: 'bwd', capture: true, dir: 'bwd' });
          }
        }
        // entrée dans couloir adverse depuis le couloir (comptage exact)
        // on utilise la bouche comme point de départ pour le calcul
        addExactEntryMoves(out, state, pl.color, i, INFO[pl.color].mouth, value);
        return;
      }

      // CAS ANNEAU normal (0-50 et -2 trou)
      if (pos === -2) {
        var fwdG = (51 + value) % 52;
        var rg = ringIdxOf(pl.color, fwdG);
        var fromAbs = ringIdxOf(pl.color, pos);
        if (!isPathBlocked(state, pl.color, fromAbs, rg, 1, true)) {
          var og = occupiedBy(state, rg, pl.color);
          var isSafeG = !!SAFE[rg];
          if (isSafeG) {
            out.push({ pawn: i, to: fwdG, type: 'fwd', capture: false, dir: 'fwd' });
          } else {
            out.push({ pawn: i, to: fwdG, type: 'fwd', capture: og.length > 0, dir: 'fwd' });
          }
        }
      } else {
        var fwd2 = pos + value;
        if (fwd2 <= 56) {
          if (fwd2 <= 50) {
            var rf = ringIdxOf(pl.color, fwd2);
            var fromAbsF = ringIdxOf(pl.color, pos);
            if (!isPathBlocked(state, pl.color, fromAbsF, rf, value, true)) {
              var ofw = occupiedBy(state, rf, pl.color);
              var isSafeF = !!SAFE[rf];
              if (isSafeF) {
                out.push({ pawn: i, to: fwd2, type: 'fwd', capture: false, dir: 'fwd' });
              } else {
                out.push({ pawn: i, to: fwd2, type: 'fwd', capture: ofw.length > 0, dir: 'fwd' });
              }
            }
            var fromAbsExact = ringIdxOf(pl.color, pos);
            addExactEntryMoves(out, state, pl.color, i, fromAbsExact, value);
          } else {
            var laneCapt = fwd2 <= 55 &&
              corridorAt(state, pl.color, fwd2 - 50, pl.color).some(function (o) { return o.color !== pl.color; });
            out.push({ pawn: i, to: fwd2, type: 'fwd', capture: laneCapt, dir: 'fwd' });
          }
        }
      }

      // RECUL sur anneau : UNIQUEMENT si ça mange un pion ennemi non protégé
      if (pos <= 50) {
        var rel = (pos === -2) ? 51 : pos;
        var absB = ((INFO[pl.color].start + rel - value) % 52 + 52) % 52;
        var off = ((absB - INFO[pl.color].start) % 52 + 52) % 52;
        var toBw = (off === 51) ? -2 : off;
        var ob = occupiedBy(state, absB, pl.color);
        if (ob.length > 0 && !SAFE[absB]) {
          out.push({ pawn: i, to: toBw, type: 'bwd', capture: true, dir: 'bwd' });
        }
        var fromAbsB = ringIdxOf(pl.color, pos === -2 ? -2 : pos);
        addExactEntryMoves(out, state, pl.color, i, fromAbsB, value);
      }
    });
    return out;
  }

  function addExactEntryMoves(out, state, color, pawnIdx, fromAbs, value) {
    if (fromAbs < 0) return;
    COLORS.forEach(function (host) {
      if (host === color) return;
      var mouthAbs = INFO[host].mouth;
      var distFwd = (mouthAbs - fromAbs + 52) % 52;
      var distBwd = (fromAbs - mouthAbs + 52) % 52;
      for (var cell = 1; cell <= 5; cell++) {
        var occ = corridorAt(state, host, cell, color);
        var hasEnemy = occ.some(function(o){ return o.color !== color; });
        if (!hasEnemy) continue;
        if (distFwd + cell === value) {
          var already = out.some(function(m){ return m.pawn===pawnIdx && m.to===makeIntruderPos(host, cell) && m.dir==='fwd'; });
          if (!already) out.push({ pawn: pawnIdx, to: makeIntruderPos(host, cell), type: 'entree', capture: true, dir: 'fwd' });
        }
        if (distBwd + cell === value) {
          var already2 = out.some(function(m){ return m.pawn===pawnIdx && m.to===makeIntruderPos(host, cell) && m.dir==='bwd'; });
          if (!already2) out.push({ pawn: pawnIdx, to: makeIntruderPos(host, cell), type: 'entree', capture: true, dir: 'bwd' });
        }
      }
    });
  }

  function movesForDie(state, dieIndex) {
    if (state.over || state.phase !== 'move' || state.dieUsed[dieIndex]) return [];
    var v = state.dice[dieIndex];
    if (v == null) return [];
    var moves = rawMovesFor(state, v);
    if (state.dice[0] === 6 && state.dice[1] === 6 && v === 6) {
      var plS = state.players[state.turn];
      plS.pawns.forEach(function (pos, i) {
        var itS = intruderInfo(pos);
        if (!itS) return;
        var exitPos = ((INFO[itS.host].mouth - INFO[plS.color].start) % 52 + 52) % 52;
        var re = ringIdxOf(plS.color, exitPos);
        var oe = occupiedBy(state, re, plS.color);
        if (!(oe.length > 0 && SAFE[re])) {
          moves.push({ pawn: i, to: exitPos, type: 'sortie', capture: oe.length > 0, dir: 'fwd' });
        }
      });
    }
    if (state.eaten != null) {
      moves = moves.filter(function (m) { return m.pawn !== state.eaten; });
    }
    // SYRO 2026-11-15 : même pion ne peut pas faire fwd puis bwd (ou inverse) dans le même tour
    if (state.pawnDir) {
      moves = moves.filter(function(m){
        var d = state.pawnDir[m.pawn];
        if (!d) return true;
        return m.dir === d;
      });
    }
    var other = 1 - dieIndex;
    var otherPending = !state.dieUsed[other] && state.dice[other] != null;
    if (!otherPending) return moves;
    var otherV = state.dice[other];
    return moves.filter(function (m) {
      if (!m.capture) return true;
      var pl = state.players[state.turn];
      for (var i = 0; i < pl.pawns.length; i++) {
        if (i === m.pawn) continue;
        if (state.eaten != null && i === state.eaten) continue;
        if (rawMovesFor(state, otherV, i).length > 0) return true;
      }
      return false;
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

  function movesForSum(state) {
    if (state.over || state.phase !== 'move') return [];
    if (state.dieUsed[0] || state.dieUsed[1]) return [];
    if (state.dice[0] == null || state.dice[1] == null) return [];
    // SYRO 2026-11-15 : somme ne peut pas mixer si le même pion a déjà une direction
    if (state.pawnDir && Object.keys(state.pawnDir).length) {
      // si un pion a déjà joué, la somme avec ce même pion doit respecter sa dir
      // (géré via filtrage ci-dessous)
    }
    var v = state.dice[0] + state.dice[1];
    var all = rawMovesFor(state, v);
    var filtered = all.filter(function(m){ return m.capture; });
    if (state.pawnDir) {
      filtered = filtered.filter(function(m){
        var d = state.pawnDir[m.pawn];
        if (!d) return true;
        return m.dir === d;
      });
    }
    // somme : on ne garde que les captures (recul/entree) — pas de sortie de base
    return filtered.filter(function(m){ return m.type !== 'out'; });
  }

  function advance(state) {
    var n = state.players.length;
    var guard = 0;
    state.sixStreak = 0;
    state.pawnDir = {};
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
      state.phase = 'roll';
      state.dieUsed = [true, true];
      state.pawnDir = {};
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

  function sysRandom() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] / 4294967296;
      }
    } catch (e) { }
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
    state.pawnDir = {};
    state.turnCaptured = false;
    state.turnArrived = false;
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

    pl.pawns[pawnIdx] = mv.to;
    if (isSum) { state.dieUsed[0] = true; state.dieUsed[1] = true; }
    else if (mv.type === 'sortie') { state.dieUsed[0] = true; state.dieUsed[1] = true; }
    else state.dieUsed[dieIndex] = true;
    if (mv.to === 56) state.turnArrived = true;
    // mémorise la direction de ce pion pour ce tour (anti-mix même pion)
    if (!state.pawnDir) state.pawnDir = {};
    state.pawnDir[pawnIdx] = mv.dir || (mv.type === 'bwd' ? 'bwd' : 'fwd');
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
    else msg = INFO[col].label + (isSum && mv.dir === 'bwd' ? ' recule de ' + v + ' (somme)' : ' avance de ' + v);

    var caps = [];
    var mvIt = intruderInfo(mv.to);
    if (mvIt) {
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
    } else if (mv.to <= 50 || mv.to === -2) {
      var ri = ringIdxOf(col, mv.to);
      if (ri >= 0 && !SAFE[ri]) {
        state.players.forEach(function (p) {
          if (p.color === col) return;
          p.pawns.forEach(function (pos, i) {
            var checkRi = -1;
            if (pos === -2 || (pos >= 0 && pos <= 50)) checkRi = ringIdxOf(p.color, pos);
            if (checkRi === ri) {
              p.pawns[i] = -1;
              caps.push(p.color);
            }
          });
        });
      } else if (ri >= 0 && SAFE[ri]) {
        // étoile/départ protégé : on ne mange jamais, même si on atterrit dessus
      }
    }
    if (caps.length) {
      if(typeof window !== 'undefined' && window.SyroAuth && window.SyroAuth.addXp) try{ window.SyroAuth.addXp(10*caps.length,'Capture'); }catch(e){}
      state.eaten = pawnIdx;
      state.turnCaptured = true;
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
    if (mv.type === 'sortie' || mv.type === 'sortie_mange') {
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

    if (!playableDice(state).length && !movesForSum(state).length) {
      endTurn(state);
      trimLog(state);
      return { ok: true };
    }

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
