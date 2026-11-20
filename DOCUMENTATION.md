# SYRO GAMES — Documentation complète

> Dernière mise à jour : 20 novembre 2026 — **v2026-11-16** — SYRO GAMES rebrand + moteur strict + online fluide

## 1. Présentation

**SYRO GAMES** — Jeu de Ludo multijoueur (2-4 joueurs) en navigateur, local / vs IA / en ligne. Thème clair/sombre SYRO, plateau orienté sur ta couleur.

**Stack :** HTML/CSS/JS vanilla, SVG plateau, Node optionnel, Firebase Firestore pour le online (projet `ludo-yriex-zbv338`). `engine.js` = règles pures testables.

## 2. Sécurité des données — expliqué simplement

**Aujourd'hui (dev) :** règles Firestore ouvertes `allow read, write: if true` sur `/rooms` → pratique pour tester, pas safe pour comptes.

**Dès Palier 2 (comptes + XP) on verrouille :**
- **Mots de passe chiffrés par Firebase Auth** (jamais en clair)
- **Règles par UID :** `users/{uid}` → `allow write: if request.auth.uid == uid` (seul toi touches ton XP)
- **XP anti-triche :** incrément `FieldValue.increment(10)` pas `xp=9999`, bond max vérifié
- **HTTPS partout**, hébergement Europe `europe-west1`
- **Retrait RGPD :** bouton Supprimer mon compte prévu

## 3. Arborescence

```
ludo/
├── public/
│   ├── index.html        # SYRO GAMES v2026-11-16 (hero + menu + jeu)
│   ├── style.css         # thème SYRO
│   ├── app.js            # interface v2026-11-16
│   ├── engine.js         # moteur strict v2026-11-16
│   ├── backends.js       # Firebase temps réel 500ms + visibilité
│   └── firebase-config.js # ludo-yriex-zbv338
├── server.js
├── test.js (20 tests ✅)
└── README.md / DOCUMENTATION.md / MISE_EN_LIGNE.md
```

## 4. Moteur v2026-11-16 — règles strictes

1. **2 dés** : chaque dé = 1 déplacement. Choix auto si évident, menu sinon. Zéro-clic si 1 seul pion sans choix.
2. **Sortie au 6 direct** (pas somme 4+2). Double 6 = relance, triple = tour perdu.
3. **Étoiles ⭐ + départs ⭘ protégés 100%** : `SAFE = {start, start+8}` → `rawMovesFor` pousse `capture:false` dessus, `actionMove` vérifie `if(SAFE[ri]) ne mange pas`, `movesForSum` filtré. On s'empile (offset -8/+8), on ne mange jamais.
4. **Recul = uniquement pour manger** : `rawMovesFor` ne pousse `bwd` que si `occupiedBy.length>0 && !SAFE[abs]`. Valable anneau (-2..50) + couloir 51-55 (nouveau : corridor backward).
5. **Anti-mix même pion** : `state.pawnDir = {pawnIdx: 'fwd'|'bwd'}` posé à `actionMove`, filtré dans `movesForDie`/`movesForSum` → même pion ne peut pas faire fwd puis bwd. 2 pions différents OK.
6. **5 dernières cases 51-55** : `pos>=51&&pos<=55` → avancement `fwd=pos+value` avec `corridorAt` capture, recul `toB=pos-value` reste couloir ou retombe anneau avec `ringIdxOf` + `SAFE` check.
7. **Maison saut supprimé** : ancien `home_retour` (n'importe où → 50+cell si dé==cell) retiré.
8. **Couloir adverse** : intrus `makeIntruderPos(host,cell)` avance/recule libre (1..5), sortie par double 6 ou `sortie_mange` depuis bouche ±value.
9. **Capture stricte** : manger avec un dé exige autre pion pour l'autre dé (`rawMovesFor(otherV).length>0`). Somme = uniquement capture, consomme 2 dés.
10. **Fin** : `over` quand 1 seul non classé reste → `finishRemaining` par `progressScore`.

## 5. Online fluide v2026-11-15

- `backends.js` : HTTP polling 500ms + `visibilitychange` re-sync, Firebase `onSnapshot` avec `transient` non fatal, `clearRoomUrl()` sur quit.
- `app.js` : `quitOnlineToHome()` nettoie `?room`, `showScreen('hero')`, `pawnDir` reset, `bind()` gère hero via `showScreen` (plus de doublon menu hero).
- `index.html` : hero = landing pur, menu = seul endroit avec 5 modes + joinBox.

## 6. Historique

- **v2026-11-14** : Palier 1 SYRO visuel (header/hero/thème) + rebrand LUDO AFRIK → SYRO GAMES
- **v2026-11-15** : Online fluide + accueil sans doublons + lien salon fix
- **v2026-11-16** : Moteur strict (étoiles strictes, anti-mix même pion, 5 cases recul, suppression saut maison, capture universelle) — 20 tests passent

## 7. Tests

```bash
node --check public/engine.js && node --check public/app.js
node test.js # 20 tests moteur ✅
```

## 8. Roadmap SYRO

- ✅ Palier 1 Visuel
- ⏳ Palier 2 Comptes + XP (prochain — verrouillage sécurité)
- ⏳ Palier 3 Personnages
- ⏳ Palier 4 Visio
- ⏳ Palier 5 Multi-jeux
