# 🎲 SYRO GAMES — Le Ludo en ligne à 2, 3 ou 4 joueurs

## ▶ Joue direct : https://yriexdejesuse-sketch.github.io/ludo/

Ouvre le lien : l'onglet affiche **SYRO GAMES (v2026-11-16)**.
Si tu vois une ancienne version, fais **Ctrl+Maj+R**.

Jeu complet : **local 2/3/4 joueurs** (même écran), **vs ordinateur**, **en ligne** avec un code/lien. Thème SYRO clair/sombre, plateau qui pivote sur ta couleur.

## 🔒 Tes données sont-elles en sécurité ?

**En 2 phrases :** 
- **Aujourd'hui (dev)** les portes sont ouvertes (`allow read, write: if true`) — c'est fait exprès pour tester vite.
- **Dès qu'on active les comptes (Palier 2) on verrouille tout :** ton mot de passe est chiffré par Google, et seul toi peux toucher ton XP. Personne ne peut te le voler ou le modifier.

Détail simple :
- Mots de passe → jamais stockés en clair, Firebase les hache automatiquement
- XP → incrémenté (+10 capture, +50 victoire), pas modifiable à la main
- Connexion en HTTPS partout, projet `ludo-yriex-zbv338` hébergé en Europe

## 🎮 Jouer en ligne

1. **Toi** : Créer une partie en ligne → couleur + pseudo → Lancer → tu reçois un **code** `5AU2H` et un **lien** `?room=CODE`
2. **Ton ami** : ouvre ton lien → il arrive au lobby
3. **Toi (hôte)** : clique **▶ Lancer la partie** — rien ne démarre tout seul

Mises à jour **instantanées** (Firestore temps réel), tu quittes → le lien se nettoie, tu peux direct relancer une autre partie.

## Contenu

```
ludo/
├── server.js                 # serveur local (optionnel)
├── README.md                 # ce fichier
├── DOCUMENTATION.md          # règles + archi + historique complet
├── MISE_EN_LIGNE.md          # guide mise en ligne
├── test.js                   # tests moteur (20 tests)
└── public/                   # le site (servi par GitHub Pages)
    ├── index.html            # SYRO GAMES v2026-11-16
    ├── style.css             # thème SYRO clair/sombre
    ├── app.js                # interface + sons + IA
    ├── engine.js             # moteur de règles strictes
    ├── backends.js           # online : Firebase (Pages) ou serveur (local)
    └── firebase-config.js    # projet ludo-yriex-zbv338 (déjà rempli)
```

## Lancer en local

```bash
node server.js  # http://localhost:3000
```

## 🌐 Mise en ligne — déjà fait ✓

| | État |
|---|---|
| **Site** | GitHub Pages branche `gh-pages` → URL ci-dessus |
| **Base** | Firebase Firestore `ludo-yriex-zbv338` |
| **Config** | `firebase-config.js` déjà rempli |
| **Règles actuelles** | `allow read, write: if true` sur `/rooms` (dev) → verrouillage prévu Palier 2 |

Refaire une mise en ligne : voir `MISE_EN_LIGNE.md`.

## 📜 Règles v2026-11-16 (SYRO strict)

- **2 dés** : chaque dé = un déplacement (même pion ou 2 pions). Choix auto si évident, menu si plusieurs coups.
- **Sortie** : il faut un **6 direct** (pas 4+2=6). Enchaînement possible avec l'autre dé.
- **Relance** : uniquement sur **double 6** (3 double-6 = tour perdu). Manger ou arriver ne relance plus.
- **Étoiles ⭐ + départs ⭘ = protégés à 100%** : on peut s'y empiler mais jamais manger dessus, même en reculant ou avec la somme.
- **Recul = uniquement pour manger** (partout : anneau + couloir 51-55). Avancer toujours possible.
- **Même pion ne peut pas avancer puis reculer** dans le même tour. 2 pions différents oui.
- **5 dernières cases (51-55)** : peuvent manger en avant ET en arrière (vers le couloir ou l'anneau).
- **Maison 56 = intouchable**, intrus dans couloir adverse avance/recule libre, sortie par double 6 uniquement.
- **Capture stricte** : manger avec un dé exige qu'un autre pion puisse jouer l'autre dé. Somme des 2 dés = uniquement pour capturer.
- Partie continue tant qu'il reste 2 joueurs non classés. Bilan final : plus violent / plus violenté.
