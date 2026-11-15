# 🎲 Ludo — Documentation complète du projet

> **Document de cession destiné à un développeur** (et aux porteurs du projet).
> Il raconte le parcours complet : de quoi ça marche, comment c'est construit,
> quelles règles sont implémentées (et pourquoi), et **comment modifier le
> projet** sans casser le reste.
>
> Dernière mise à jour : novembre 2026 — l'état du code est celui décrit ici
> (15 tests moteur + tests backends + scénario E2E au vert).

---

##1. Présentation

**Un jeu de Ludo (type Parchís) jouable dans un navigateur**, en français,
avec des **règles maison** précises (voir §6). Deux dés par jet, décisions du
joueur à chaque étape, mode multijoueur en ligne, partie contre l'ordinateur,
classement complet à la fin (1er, 2e, 3e, dernier) et **bilan des captures**
(le plus violent / le plus violenté).

**Stack : zéro framework, zéro build.** Du JavaScript vanilla, un SVG pour le
plateau, un serveur Node minimal pour le multijoueur local (et Firebase en
option). Tout se modifie avec un éditeur de texte, on recharge la page.

| Partie | Technologie |
|---|---|
| Interface | HTML + CSS + JavaScript vanilla (SPA4 écrans) |
| Plateau | SVG généré à la volée (`buildBoard`) |
| Moteur de jeu | `engine.js` — pur, sans DOM, testable sous Node |
| Multijoueur | Serveur Node (API REST + fichiers statiques) **ou** Firebase |
| Sons | WebAudio synthétisé (`Snd` — aucun fichier audio) |
| Tests | Node (moteur + backends) + JSDOM (bout en bout) |

---

##2. Démarrage rapide

```bash
# lancer le serveur (port3000 par défaut, variable PORT)
cd ludo && node server.js
# → ouvrir http://localhost:3000

# ── les3 suites de tests (tout doit passer) ──
node test.js               # moteur :15 règles/jeu (« Tous les tests passent ✅ »)
node test_backends.js      # API + Firebase factice (« Tous les tests backend passent ✅ »)
cd ../ludotest && node smoke.js   # E2E navigateur (JSDOM) — le serveur doit tourner
```

> Les tests E2E (`smoke.js`) chargent la **vraie page sur le vrai serveur** :
> ils lancent le serveur d'abord. Ils pilotent la page via les crochets de
> test `__LUDO_TEST__()`, `__LUDO_TEST__SET__(fn)` et le flag
> `__LUDO_AUTOPLAY__` (voir §10).

---

##3. Arborescence

```
ludo/
├── DOCUMENTATION.md        ← ce document
├── README.md               ← règles + guide d'hébergement (déploiement)
├── server.js               ← serveur HTTP : fichiers statiques + API salles (≈194 l.)
├── test.js                 ← tests moteur :15 scénarios (≈314 l.)
├── test_backends.js        ← tests de l'API + Firebase factice (≈185 l.)
└── public/
    ├── index.html          ← structure : écrans menu/préparation/lobby/partie, modales (≈163 l.)
    ├── style.css           ← tout le style (plateau, dés, mini-choix, modales…) (≈248 l.)
    ├── engine.js           ← ★ LE MOTEUR : règles pures, sans DOM (≈493 l.)
    ├── app.js              ← ★ L'INTERFACE : rendu, clics, animations, IA, en ligne (≈1237 l.)
    ├── backends.js         ← couche multijoueur : HTTP (défaut) ou Firebase (≈238 l.)
    └── firebase-config.js  ← config Firebase (vide = on utilise le serveur HTTP)

ludotest/
├── smoke.js                ← tests E2E (JSDOM) —≈515 l.
└── node_modules/           ← dépendances de test (jsdom) — hors snapshot
```

**Règle d'or : `engine.js` ne touche jamais au DOM, `app.js` ne contient
jamais de règles de jeu.** Toute logique de Ludo vit dans le moteur ; toute
décision d'affichage dans l'interface. C'est ce qui rend le moteur testable
seul (d'où les15 tests en une seconde).

---

##4. Architecture & flux

```
                 ┌────────────────────────────────────────────┐
                 │                index.html                  │
                 │  écrans : menu → setup → lobby → partie    │
                 └───────────────┬────────────────────────────┘
                                 │ charge
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
 ┌──────▼──────┐          ┌──────▼──────┐           ┌──────▼──────┐
 │  engine.js  │◄─────────│   app.js    │──────────►│ backends.js │
 │ règles pures│  appelle │  interface  │  3 modes  │ HTTP ou FB  │
 │ (testées)   │          │ (rendu/clic)│           └──────┬──────┘
 └─────────────┘          └──────┬──────┘                  │
                                 │ mode local/IA    ┌───────▼────────┐
                                 │ (état en mémoire)│   server.js    │
                                 │                  │ statique + API │
                                 │        ┌─────────┤ /api/rooms…    │
                                 │        │ en ligne└────────────────┘
                                 ▼        ▼
                              état G (une seule source de vérité)
```

**Les3 modes de jeu** (tous partagent le même moteur et la même interface) :

| Mode | `mode` | Qui joue | État stocké |
|---|---|---|---|
| **Locale (2 joueurs)** | `'local'` |2 humains sur le même écran (hot-seat) | mémoire du navigateur |
| **Contre l'ordinateur** (2 ou4 joueurs) | `'ai'` |1 humain +1 ou3 IA | mémoire du navigateur |
| **En ligne (2 joueurs)** | `'online'` |2 humains, chacun son navigateur | serveur (ou Firebase) |

- Hot-seat : `you = null`, chaque siège joue à son tour.
- IA : `you` = couleur humaine, `aiColors` = ensemble des couleurs IA.
- En ligne : `room.code` + `room.token` (identifie le siège), état synchronisé
  par `watch` (polling750 ms côté HTTP, `onSnapshot` côté Firebase).

---

##5. Le moteur (`engine.js`)

###5.1 API exportée (ce que `Ludo.*` propose)

| Fonction / constante | Rôle |
|---|---|
| `createGame(colors)` | crée l'état initial (voir §5.2) |
| `actionRoll(state, rng?)` | lance les2 dés → phase `'move'` |
| `actionMove(state, pawn, to, die)` | joue un coup (`die` = `0`, `1` ou `'sum'`) |
| `movesForDie(state, i)` | coups légaux pour le dé i |
| `movesForSum(state)` | coups légaux à la **somme** des2 dés (reculs seulement) |
| `playableDice(state)` | dés encore jouables |
| `finishNow(state)` | bouton « Terminer » → classement par progression |
| `currentColor(state)` | couleur du joueur au trait |
| `ringIdxOf(color, pos)` | position logique → case absolue (0..51) |
| `intruderInfo(pos) / isIntruderPos(pos)` | décode un pion debout dans un couloir adverse (`{host, cell}` ou `null`) |
| `cellAt / visualCell(color, pos)` | position logique → cellule SVG `[x,y]` |
| `RING, COLORS, INFO, OPPOSITE, SAFE` | géométrie et constantes du plateau |
| `progressScore(player)` | score de progression (pour le classement) |

###5.2 L'état de partie (`state`) — source unique de vérité

```js
{
  players: [ { color:'red', pawns:[-1,-1,-1,-1], rank:null }, … ],
  turn:    0,                 // index du joueur au trait
  phase:   'roll',            // 'roll' → 'move' → ('roll' | 'over')
  dice:    [null, null],      // valeurs du jet courant
  dieUsed: [false, false],    // chaque dé = un déplacement
  sixStreak: 0,               // doubles6 consécutifs (3 = tour perdu)
  eaten:   null,              // index du pion qui a mangé ce tour (verrou)
  turnCaptured: false,        // a mangé pendant ce jet → jet supplémentaire
  turnArrived: false,         // pion rentré → jet supplémentaire
  ranks:   [],                // couleurs classées dans l'ordre d'arrivée
  stats:   { red:{ate:0,lost:0}, … },   // bilan des captures
  log:     ['…'],             // journal (max40 lignes, affiché à droite)
  over:    false,
  rev:     0                  // compteur d'itération (synchro en ligne)
}
```

###5.3 Système de positions — LE point crucial

```
position logique d'un pion :
   -1  = en base
   -2  = LE TROU — case de l'anneau juste derrière sa ligne de départ
 0..50  = l'anneau (52 cases, cercle partagé par les4 couleurs)
 51..56 = la maison (51 = première case intérieure,56 = arrivée)
 -(10×(c+1)+k) = debout dans le COULOIR adverse de la couleur d'index c,
                  case k (1..5) ; ex. couloir du bleu = -41..-45

case absolue (0..51) = (start[color] + pos) % 52     // pour pos ∈ [-2..50]
cellule du couloir   = INFO[host].home[k-1]          // pour un pion piégé
```

```
            CASES DE DÉPART / BOUCHES (anneau52 cases)
   rouge : départ 1 , bouche 51 , trou 0        ⭐=départ 🏠=bouche
   vert  : départ 14, bouche 12 , trou13
   jaune : départ 27, bouche 25 , trou26
   bleu  : départ 40, bouche 38 , trou39

   ORDRE SUR L'ANNEAU (sens horaire) — exemple côté rouge :
        … → [50] → [51 = bouche 🏠] → [0 = TROU] → [1 = départ ⭐] → [2] …
                              │                        │
                    le pion bifurque            un ennemi ici est
                    vers la maison              mangeable en recul de1
```

- **`SAFE` (cases protégées, pas de capture)** = les départs et les cases
  +8 : `{1,9, 14, 22, 27, 35, 40, 48}`. **Les trous (0,13,26,39) ne sont
  PAS protégés** → on peut y manger.
- Le trou n'existe que **pour ta couleur** (les autres y passent normalement) ;
  en position `pos = -2`, `ringIdxOf` renvoie `(start+51)%52`.
- Jamais de `pos =51` dans l'anneau : un recul qui aboutirait sur la case51
  est **mapé en `-2`** (le trou). La maison commence à51 *logique* (intérieure).

###5.4 Rôles des fonctions internes

| Fonction | Rôle |
|---|---|
| `rawMovesFor(state, value)` | génère **tous** les coups pour une valeur de dé : sortie (`out`), avancer (`fwd`), reculer-manger (`bwd`), depuis le trou |
| `movesForDie` | applique les **règles strictes** (verrou du pion qui a mangé, protection des cases SAFE, interdit le recul-capture au dé simple pour un pion seul…) |
| `movesForSum` | reculs-capture **avec la somme des2 dés** (filtre `type:'bwd'`) — autorisés même avec un pion seul |
| `actionMove` | applique le déplacement, gère capture (boucle sur les ennemis sur la case), verrou, arrivée, classement, fin de partie, statistiques |
| `actionRoll` | tire les2 dés, réinitialise les verrous (`eaten`, `turnCaptured`, `turnArrived`) |
| `endTurn` | passe la main — **branches de relance** (double6 / manger / maison) |
| `advance` | joueur suivant (saute les joueurs classés) |
| `finishRemaining` | classe tout le monde par progression (fin manuelle) |

---

##6. Règles implémentées (spécification maison)

> Ce sont les règles **décidées par le projet** (cf. §12 — historique).
> Un développeur doit les respecter : ce ne sont pas les règles officielles
> du Parchís.

1. **Deux dés par jet** ; chaque dé = **un** déplacement ; on choisit **le dé
   puis le pion** ; si un pion a plusieurs coups possibles → mini-choix près
   du pion (libellés : « Avancer (dé3) », « Reculer (dé3) »…).
2. **Sortie au6** : un6 sort un pion de la base (le pion peut ensuite
   enchaîner avec l'autre dé). **Un6 simple ne donne PAS de jet en plus.**
3. **Jets supplémentaires (relance)** sur :
   - le **double6** (3 doubles6 de suite = **tour perdu**) ;
   - **un manger** (capture) ;
   - **une arrivée à la maison** (même le pion qui rentre n'est pas revêtu
     d'obligation de rejouer avec ce pion — le jet suivant est offert).
4. **Recul (en arrière) UNIQUEMENT pour manger** un pion ennemi non protégé ;
   **jamais depuis la maison**. L'anneau est un cercle : le recul peut
   traverser le trou (`pos -2`) — y compris derrière sa propre ligne de
   départ (règle du « trou », validée en jeu).
5. **Règle stricte de capture** (règle maison du projet) :
   - manger avec un dé **seul** n'est possible **que si un autre pion du
     joueur peut encore jouer l'autre dé** ;
   - **pion seul en jeu → pas de manger au dé simple** ;
   - en revanche **la somme des2 dés peut manger** (recul combiné) si elle
     tombe pile sur l'ennemi — autorisée même avec un pion seul.
6. **Après un manger, le pion qui a mangé ne rejoue plus du tout ce tour**
   (verrou `eaten`, déverrouillé au jet suivant).
7. **Cases protégées** (étoiles) : départ et case+8 de chaque couleur →
   impossible d'y atterrir si un pion y est déjà.
8. **Le trou** (case juste avant son départ) est une case **ordinaire et non
   protégée** : un pion qui vient de sortir peut reculer dessus pour manger
   l'ennemi qui s'y trouve (mini-choix « Reculer »), et un pion peut
   s'y arrêter en avançant.
9. **Fin de partie** : la partie continue **tant qu'au moins deux joueurs
   n'ont pas fini** ; dès qu'il n'en reste qu'un seul → il prend la dernière
   place et **la partie s'arrête** (donc à2 joueurs : **un vainqueur suffit** ;
   à4 : on établit2e et3e puis on s'arrête). Le bouton « Terminer » reste
   disponible (classement par progression).
10. **Bilan final** : le modal des résultats affiche le **plus violent**
    (le plus de pions mangés), le **plus violenté** (le plus de pions perdus)
    et un tableau mangés/perdus par couleur (provenance : `state.stats`).
11. **Partie qui continue après la1re victoire** (pour le classement) —
    conséquence directe de la règle9.
12. **Couloir adverse** : quand un pion atterrit (en avant **ou** en
    recul) sur la **bouche** d'un adversaire dont au moins un pion est
    dans son couloir (les5 cases avant sa maison), il peut **entrer dans
    ce couloir et manger** le pion visé sur n'importe laquelle des5
    cases (mini-choix « 🚪 Entrer dans le couloir »). Une fois dedans :
    il s'y déplace (avant jusqu'à la case5, **recul uniquement pour
    manger**), mange les pions du propriétaire qu'il atteint, **ne peut
    en sortir que par un double6** (→ réapparaît sur la bouche + jet
    supplémentaire ; le pion sorti ne rejoue plus ce tour). Le
    propriétaire peut **manger l'intrus** dans son couloir (capture
    normale : retour en base + jet supplémentaire). La règle stricte de
    capture s'applique aussi là-bas.

13. **Lobby en ligne** : chaque joueur écrit son **nom** (affiché dans
    les cartes du lobby/du jeu et dans la bannière du tour) et choisit sa
    **couleur** dans le lobby (tant que rien n'a commencé ; une couleur
    déjà prise est refusée). **Rien ne démarre tout seul** : seul
    l'hôte (siège0) clique « ▶ Lancer la partie » quand les deux sont
    prêts ; « Rejouer » ramène au lobby (l'hôte relancera).
14. **Commentaires hors plateau** : aucun message posé sur le plateau
    (en mobile ils gênaient le clic sur les pions). **Tout** part dans la
    **case du joueur concerné** : le dernier message du journal qui cite
    cette couleur **et** les retours transitoires (erreurs, invites
    «6 ! », recul possible… — ciblés sur la couleur citée, sinon sur le
    joueur courant). Fusion journal + retours par horodatage interne
    (`logNotes` / `toastNotes` + `noteStamp`). La **barre flottante**
    (`#toast`, en haut) ne s'affiche **que hors du jeu** (menu/lobby) —
    il n'y a jamais de plateau à l'écran à ce moment-là.
15. **Badge de couleur** : pastille fixe **en bas à gauche** de l'écran
    (`#myColorBadge`) — en ligne et contre l'ordinateur : **ta couleur**
    (« Ta couleur : Rouge ») ; en local : les **deux** couleurs. Rafraîchi
    par `renderMyColor()` (appelé depuis `showScreen`, `renderChrome` et
    `renderLobby`).
16. **Orientation du plateau** : la **case de départ** de la couleur du
    joueur regarde **toujours le coin bas-gauche de son écran** — le
    plateau pivote (`#board` + `BOARD_ROT` : 🔵0°, 🟡+90°, 🔴-90°,
    🟢180°). Référence : en ligne/IA = **ta couleur** (`you`), en local =
    celle du **joueur1** (un seul écran). Appelé à chaque `renderPanel()`
    (`applyBoardOrientation()`), transition CSS douce, et le mini-choix
    suit via `rotBoardPoint()` (rotation du point du viewBox).

### Choix évidents (simplifications d'interface)

- Clic sur un pion = **menu libellé de tous ses coups** (jamais de refus).
- Un seul dé jouable → sélection automatique ; doubles → dé présélectionné ;
  après un coup, le dé restant se re-sélectionne tout seul.
- Bascule automatique : si le pion cliqué n'est jouable que par l'autre dé.
- **Mode zéro clic** : avec **exactement un seul pion en jeu**, le jeu joue
  les deux dés **tout seul — mais uniquement quand il n'y a aucun choix**.
  **Dès qu'un vrai choix existe, le jeu s'arrête et invite le joueur** :
  - un dé propose ≥2 coups (cas typique : **un6 → sortir un pion OU
    avancer celui qui est en jeu**) → toast « 🎲6 ! À toi de choisir… » ;
  - ou une **capture à la somme** est possible → toast « ♻️ Manger en
    arrière… ».
  *(Implémentation : `humanChoiceNeeded()` / `humanChoiceHint()` /
  `autoStep()` dans `app.js`.)*
- **Les commentaires de coup n'apparaissent plus sur le plateau** (le
  journal reste dans le panneau de droite) ; les messages fonctionnels
  (propositions, invitations) s'affichent en **bas de l'écran** (`.toast`
  en `position:fixed`) pour ne jamais cacher de pions.

### IA (ordinateur)

- `pickAiMove()` choisit le meilleur coup selon `scoreAi()` :
  maison **+160**, manger **+110**, sortir **+80**, avancer `+0,4×case`,
  case protégée **+26**, case dangereuse (ennemi à1..6 cases) **−55**,
  aléatoire **+0..8**.
- Délais : lancer650 ms, coup430 ms. Le mode zéro clic humain utilise les
  mêmes scores (`autoStep`), mais **bridé par `humanChoiceNeeded()`**.

---

##7. Flux de jeu côté interface (`app.js`)

###7.1 Déroulé d'un tour (humain)

```
phase 'roll' :  #diceHint cliqué → doRoll()
                → engine.actionRoll → commitState(anim)
                → startRollAnimation (950 ms) → à la fin :
                     • toast « ♻️ Manger en arrière possible… » si recul existant
                     • maybeAutoSinglePawn()  ← mode zéro clic

phase 'move' :  clic sur un dé      → onDieClick(i) → selectedDie = i
                clic sur un pion    → onPawnClick(color, idx)
                     •1 seule option      → exécution directe
                     • plusieurs options  → showMiniChoice(...) près du pion
                executeMove(die, m) → engine.actionMove → commitState/applyServer
                     • animation (waypoints), son, journal, relance éventuelle
                     • maybeAutoSinglePawn() ← reprend l'auto si plus aucun choix

si plus aucun dé jouable → endTurn() → relance ou joueur suivant
si over → showOver() (classement + bilan)
```

###7.2 Les grandes fonctions de `app.js`

| Zone | Fonctions clés |
|---|---|
| **État global** | `G` (état de partie), `legal` (`{0:[],1:[],sum:[]}`), `mode`, `you`, `selectedDie`, `room` |
| **Plateau** | `buildBoard()` (SVG), `syncPawns()` (positions + pile), `cellCenter`, `baseSlot` |
| **Animations** | `animateDiff` (diff ancien/nouveau état), `waypoints`, `runTransition`, `commitState` |
| **Rendu** | `renderPanel` → `renderChrome` (bannière/journal) + `syncPawns` + `renderDice` + `renderHint` |
| **Interactions** | `doRoll`, `onDieClick`, `onPawnClick`, `showMiniChoice`, `executeMove`, `doFinish` |
| **Auto / IA** | `maybeAutoSinglePawn`, `humanChoiceNeeded`, `autoStep`, `scheduleAi`, `aiStep`, `pickAiMove`, `scoreAi` |
| **En ligne** | `startWatch`, `onRoomState`, `postAction`, `applyServer`, `commitState` |
| **Fin** | `checkOver`, `showOver`, `renderBilan` |
| **Écrans** | `showScreen`, `renderSetup`, `startLocal`, `startAiGame` |
| **Divers** | `Snd` (sons), `toast`, `busy()` (= `animating \|\| rollAnim`) |

###7.3 Gestion du temps / animations

- `busy()` — empêche tout clic pendant une animation (le zéro clic le sait
  aussi : `autoStep` se repousse de350 ms si `busy()`).
- Verrou réseau : `autoLastRev` / `autoStall` évitent que l'auto rejoue
  pendant un échange en ligne (max4 attentes puis arrêt).
- `queuedCommit` — un état reçu pendant une animation est rejoué après.

---

##8. Multijoueur

###8.1 `backends.js` — deux fournisseurs

| | **http** (défaut) | **fire** (Firebase) |
|---|---|---|
| Activation | toujours | si `firebase-config.js` a un `projectId` |
| État | en mémoire du serveur `server.js` | Firestore (partageable sans serveur) |
| Synchro | polling `GET /api/rooms/:code` toutes les **750 ms** | `onSnapshot` en direct |
| Tests | `test_backends.js` (API réelle) | `test_backends.js` (Firestore factice) |

Interface commune (appelée par `app.js`) : `createRoom(color, name)`,
`joinRoom(code, name)`, `getState(code, token)`, `action(code, token, action)`,
`watch(code, token, cb)` — les deux fournisseurs implémentent exactement
ces5 méthodes. Les réponses publient `names` (2 chaînes : noms des joueurs)
et `started` (vrai **seulement** après le top de l'hôte).

###8.2 API REST du serveur (`server.js`)

| Route | Corps / params | Rôle |
|---|---|---|
| `POST /api/rooms` | `{color, name}` | crée une salle → `{code, token, state, names}` |
| `POST /api/rooms/:code/join` | `{name}` | rejoint →2e `{token, state, names}` (refus `403 full` si complet) |
| `GET /api/rooms/:code?token=` | — | récupère l'état (`publicState` masque l'autre token) |
| `POST /api/rooms/:code/action` | `{token, action}` | joue une action (voir ci-dessous) |
| `GET /*` | — | fichiers statiques de `public/` |

`action` ∈ :
```json
{ "type": "start" }                                   // top de l'hôte (siège0 seul)
{ "type": "color", "color": "green" }                 // changer de couleur (lobby, avant start)
{ "type": "roll" }
{ "type": "move",  "pawn": 0, "to": 14, "die": 0 }     // die :0 |1 | "sum"
{ "type": "finish" }                                    // bouton Terminer
{ "type": "restart" }                                   // rejouer (après over)
```
Le serveur **revérifie tout** (tour du siège, légalité via le moteur) :
c'est le serveur qui a toujours raison (état revérifié par le moteur). Salles purgées après2 h d'inactivité.
**En ligne =2 joueurs maximum** (2e siège seulement).
**Démarrage** : une salle rejointe n'est PAS lancée — `started` ne devient
vrai qu'après l'action `start` de l'hôte (siège0 ; le siège1 est refusé) ;
`restart` remet `started = false` (retour au lobby, l'hôte relancera).
Les noms vivent dans `room.names` (hors `state`, le moteur n'y touche pas).
**Couleurs** : l'action `color` reconstruit l'état via `createGame`
(uniquement tant que `!started`, couleurs distinctes exigées).

---

##9. Fin de partie & bilan

- **Déclencheur** : dans `actionMove`, après l'arrivée d'un pion (`done`),
  on compte les joueurs **sans rang** :
  - `≥2` → `advance()` (on continue, on établit les places suivantes) ;
  - `≤1` → ce joueur prend la dernière place, `over = true`, `phase='over'`.
- `finishNow` (bouton « Terminer ») → `finishRemaining` : classe tous les
  restants par `progressScore` (maison ×1000 + avancement).
- **Bilan** : `state.stats[color] = {ate, lost}` alimenté dans `actionMove`
  à chaque capture ; `renderBilan()` construit le HTML dans `#overBilan`
  (modal des résultats) : ligne « 🗡️ Le plus violent », ligne
  « 😵 Le plus violenté », puis le tableau complet (égalités comprises ;
  si zéro capture : « 😌 Aucune capture pendant la partie »).

---

##10. Tests

###10.1 `test.js` — moteur (20 scénarios, ~0,4 s)

| # | Ce qu'il verrouille |
|---|---|
|1|200 parties aléatoires : jamais d'erreur, ça termine toujours |
|2|recul pour manger |
|3|règle stricte (pion seul → pas de recul simple) |
|4|sortie au6 + enchaînement de l'autre dé |
|5|double6 relance / triple6 perdu / simple6 rien |
|6|cases protégées |
|7|**fin de partie** : à2 un vainqueur suffit ; à4 on continue tant qu'≥2 non finis ; « Terminer » |
|8|somme des2 dés = recul-capture combiné |
|9|aucun recul depuis la maison |
|10|verrou du pion qui a mangé (déverrouillé au jet suivant) |
|11|arrivée maison = tour qui continue avec l'autre dé |
|12|après un manger, un AUTRE pion joue le2e dé |
|13|manger = jet supplémentaire **+ compteurs `stats`** |
|14|pion à la maison = jet supplémentaire |
|15|**trou** : recul derrière le départ + repartie depuis le trou |
|16|**entrée dans le couloir** (en avançant) : proposition, capture, stats |
|17|entrée **en recul**, sur n'importe quelle case (case5) |
|18|pion piégé : déplacements internes, recul = manger, pas de sortie |
|19|**sortie = double6** + jet supplémentaire (un6 simple ne sort pas) |
|20|le propriétaire **mange l'intrus** dans son couloir (+ règle stricte) |

###10.2 `smoke.js` — E2E (JSDOM, vraie page, vrai serveur)

Enchaîne : partie locale (clics réels), mini-choix, verrou du mangeur,
choix évidents, doubles, somme, **zéro clic**, **le6 qui attend le choix**,
reprise auto après choix, **trou**, puis IA à4, puis en ligne (2 fenêtres).

**Flux en ligne vérifié en E2E** : aucun démarrage automatique (le
rejoignant arrive au lobby), **noms affichés des deux côtés**, puis le
**top de l'hôte** qui fait entrer les deux joueurs dans le jeu et la
synchro des dés. Le harness neutralise `firebase-config.js` (remplacement
du `<script>` par `FIREBASE_CONFIG = null`) pour rester sur le backend
HTTP — jsdom29 n'expose plus `ResourceLoader`.

###10.3 Crochets de test (dans `app.js`)

```js
window.__LUDO_TEST__()            // snapshot {phase, dice, dieUsed, turn, legalLen…}
window.__LUDO_TEST__SET__(fn)     // modifie l'état VIVANT (fn reçoit le state réel)
window.__LUDO_AUTOPLAY__ = false  // désactive l'auto-jeu pour piloter à la main
window.__errors                   // erreurs JS capturées par la page
```
**Pièges :**
- le snapshot `__LUDO_TEST__()` **ne contient pas `players`** — pour lire les
  pions, utiliser le motif `snapLive(w)` de `smoke.js` (capture via `SET`) ;
- les fonctions passées à `SET` s'exécutent **côté Node** : pas de `window`
  ni de `Ludo` dedans, seulement l'argument `st` (et les fermetures Node) ;
- un `SET` qui change les dés déclenche l'animation de lancer → donc
  `maybeAutoSinglePawn` (utile pour tester le zéro clic sans cliquer) ;
- pensez à `st.eaten = null` dans un `SET` de reprise (verrou résiduel).

---

##11. Guide de modification (« je veux changer X »)

| Je veux… | Je touche… | Où exactement |
|---|---|---|
| **Changer une règle de déplacement / capture / recul** | `engine.js` | `rawMovesFor()` (génération), `movesForDie()` (filtres stricts) |
| **Autoriser / interdire une capture** | `engine.js` | `movesForDie` (bloc `bwd`), `SAFE` pour les cases protégées |
| **Changer les relances (jets supplémentaires)** | `engine.js` | `actionRoll` (réinitialisation des drapeaux), `endTurn` (branches), `actionMove` (pose `turnCaptured` / `turnArrived`) |
| **Changer la condition de fin** | `engine.js` | `actionMove`, bloc `if (done)` (comptage « sans rang »), `finishRemaining` |
| **Ajouter une statistique de fin** | `engine.js` + `app.js` | compteur dans `actionMove`, affichage dans `renderBilan` |
| **Rendre l'IA plus forte / plus bête** | `app.js` | `scoreAi()` (pondérations), délais dans `scheduleAi` |
| **Modifier le mode zéro clic / les choix évidents** | `app.js` | `humanChoiceNeeded`, `autoStep`, `onPawnClick`, `syncSelection` |
| **Changer un message / une invite** | `app.js` | `toast(…)` aux emplacements concernés, `renderHint` |
| **Modifier le plateau (couleurs, cases, étoiles)** | `engine.js` | `RING`, `INFO` (départs/bouches), `SAFE` — puis `buildBoard` si forme |
| **Ajouter un écran ou un bouton** | `index.html` + `style.css` + `app.js` | structure, style, `showScreen` / gestionnaire |
| **Ajouter une route API** | `server.js` | fonction `api()` (même motif que les routes existantes) |
| **Passer en ligne sur Firebase** | `firebase-config.js` | renseigner `projectId` (auto-activation, cf. `backends.js`) |
| **Ajouter un test** | `test.js` (moteur) ou `ludotest/smoke.js` (E2E) | suivre le motif des tests voisins |
| **Changer les règles affichées au joueur** | `README.md` + modale règles (`index.html`) | texte des règles |

**Check-list avant de rendre une modification :**
```bash
node --check public/engine.js && node --check public/app.js   # syntaxe
node test.js && node test_backends.js                         # règles
cd ../ludotest && node smoke.js                               # E2E (serveur lancé)
# puis redémarrer le serveur si engine.js / app.js ont bougé :
#   kill $(ss -ltnp | grep :3000 | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
#   cd ludo && node server.js &
```

---

##12. Historique du parcours (pourquoi le code est comme ça)

Le projet s'est construit **par vagues de règles validées avec le
commanditaire** — comprendre ce parcours évite de « simplifier » une règle
qui est en fait un choix assumé.

1. **Cadrage initial** (4 questions ouvertes) : modes = locale **et** en
   ligne ; sortie = **au6** ; recul = **manger seul** ; victoire = **custom**
   (la partie continue pour le classement). Puis règle stricte de capture
   (un seul pion en jeu = pas de manger au dé simple) — *règle maison
   réaffirmée plusieurs fois par le commanditaire*.
2. **Deux dés** : chaque dé = un coup ; on choisit le dé puis le pion ;
   mini-choix près du pion ; menu libellé au clic sur un pion (jamais de
   refus).
3. **Choix évidents** : sélection auto du dé unique / après le1er coup ;
   doubles sans choix de dé ; bascule automatique.
4. **Somme des2 dés** : recul-capture combiné (les2 dés d'un coup) proposé
   automatiquement quand il est possible.
5. **Verrous du manger** : pion qui a mangé bloqué le reste du tour ;
   l'IA calcule et **propose** tout recul possible à chaque jet.
6. **Relances** : double6 **+ manger + maison** (3 doubles6 = tour perdu) ;
   **zéro clic** quand un seul pion est en jeu ; menus libellés systématiques.
7. **Le trou** : case derrière la ligne de départ ouverte au recul-manger
   (position sentinelle `-2`), même pour le pion qui vient de sortir.
8. **Dernière vague** : le **6 avec un seul pion** ne se joue plus tout seul
   (le joueur décide sortir vs avancer) ; **bilan de fin** (plus violent /
   plus violenté) ; **fin de partie** = arrêt dès qu'un seul joueur n'a pas
   fini ; **commentaires retirés du plateau** (journal uniquement) + messages
   restants déplacés hors du plateau.
9. **Lobby, noms, top de l'hôte** (round14) : noms saisis à la
   création/rejoindre, **couleurs libres dans le lobby**, **démarrage
   manuel par l'hôte** (plus aucun auto-start) ; **commentaires dans la
   case du joueur concerné** (toast en haut, plus rien sur le plateau) ;
   retour au lobby après « Rejouer ». **Contrainte permanente** : mettre
   `DOCUMENTATION.md` + `README.md` à jour **à chaque modification**.
10. **Round14bis** : plus **aucune** barre flottante en jeu (tout part
    dans les cases — les retours d'erreur y compris) ; **badge de
    couleur en bas à gauche** (online/IA = ta couleur, local = les deux) ;
    **version visible** (`APP_VERSION` dans le titre de l'onglet + le
    titre du lobby) pour diagnostiquer les onglets périmés à distance.
11d. **Partie locale à 3/4 joueurs** : sélecteur `#localCount` (2/3/4)
    sur l'écran de choix local — les joueurs 3 et 4 reçoivent
    **automatiquement** les couleurs restantes (`#localExtra` les
    affiche) ; `startLocal()` assemble `cols` sur `localCount` puis
    `createGame` (moteur générique — `test.js` simule des parties à 3
    et 4 jusqu'au classement complet ; smoke vérifie le câblage du
    sélecteur ; `play4.js` démarre réellement une partie à 4 : 4 cartes,
    16 pions).
11c. **README restructuré** (demande « revois le README ») : le lien
    live + le mode d'emploi « jouer en ligne » sont **en tête** ; arbre
    des fichiers corrigé (`firebase-config.js` **déjà rempli** — plus
    « À REMPLIR », + `DOCUMENTATION.md`/`MISE_EN_LIGNE.md`/tests) ;
    section mise en ligne reformulée : **« c'est déjà fait ✓ »** (état
    réel : Pages = branche `gh-pages`, projet `ludo-yriex-zbv338`) au
    lieu d'un tutoriel depuis zéro, renvoi vers `MISE_EN_LIGNE.md` pour
    le détail ; flux d'invitation ré-aligné (hôte crée → envoie le lien →
    l'ami rejoint → **l'hôte lance**).
11b. **Round14quater** : le plateau **pivote pour que la case du joueur
    soit en bas à gauche** de son écran (règle16) — vérifié par
    `ludotest/shot_orient.js` (vert → `rotate(180deg)`, case verte en
    bas à gauche) + assertions dans `test_live.js` (hôte et ami reçoivent
    des orientations **différentes**).
11. **Round14ter** : la pastille `#diceHint` (« 👆 Clique pour lancer »)
    est **sortie du plateau** — elle vit désormais dans `.panel` (jamais
    de commentaire sur le plateau, mobile comme bureau). Correctif
    d'alignement : en mobile le `.game-layout` est en **`display:block`**
    (et non flex column) — en flex column le SVG ne repropage pas sa
    hauteur (**contribution de300 px au lieu de334** : c'est la taille
    intrinsèque par défaut des SVG), le plateau débordait de34 px et
    recouvrait le bandeau du tour. Mesures de non-régression :
    `ludotest/measure.js` / `measure_desktop.js` (chevauchements
    plateau/bandeau + pastille sur plateau = false/false).

---

##13. Pièges & conventions (à lire avant de toucher)

1. **`pos = -2` (le trou)** doit être géré partout où l'on teste une
   position : `ringIdxOf`, `cellAt`, `occupiedBy`, boucle de capture,
   `syncPawns`, `waypoints`, `scoreAi`, `activeCount`. Un `pos < 0` naive
   le confond avec la base (`-1`).
2. **`51` n'est jamais une position d'anneau** côté recul (mapé en `-2`) ;
   la maison occupe `51..56` en logique intérieure.
3. **L'état est muté par le moteur** (`actionRoll`/`actionMove` modifient
   `state` en place) — l'interface clone l'ancien état avant (`old`) pour
   calculer l'animation.
4. **`legal` est recalculé** à chaque application d'état
   (`movesForDie` + `movesForSum`) — ne jamais le persister.
5. **L'IA n'a pas le droit de se tromper de tour** : `aiStep` vérifie
   `isAiTurn()` ; l'humain `canAct()`.
6. **Les scores de l'IA ne s'appliquent jamais en tant que règles** —
   `pickAiMove` ne choisit que *parmi* les coups renvoyés par le moteur.
7. **En ligne, le client ne décide de rien** : tout passe par le serveur,
   qui rejoue l'action avec le moteur (un modificateur de client ne peut
   donc pas tricher).
8. **Les tests sont le filet de sécurité** : toute règle touchée doit
   laisser les3 suites vertes (§10). Le scénario1 des tests moteur joue
   **200 parties aléatoires** — il attrape l'essentiel des régressions.
9. **Langue** : toute l'interface et le journal sont **en français** —
   garder cette convention dans les nouveaux textes.
10. **README.md** reste le document « joueurs/hébergement » ; **ce document**
    est le document « développeur ». Les deux doivent rester cohérents.

---

### Où commencer si on est nouveau1. Lire `engine.js` de haut en bas (493 lignes : c'est tout le jeu).
2. Ouvrir `app.js` et suivre `doRoll → onDieClick → onPawnClick → executeMove`.
3. Lancer `node test.js` : chaque test décrit une règle en clair.
4. Lancer le serveur, jouer une partie locale, ouvrir la console du navigateur.
5. Revenir à ce document §11 chaque fois qu'on veut modifier quelque chose.
