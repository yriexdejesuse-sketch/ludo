# 🎲 SYRO GAMES — Le Ludo en ligne à 2, 3 ou 4 joueurs

## ▶ Joue direct : https://yriexdejesuse-sketch.github.io/ludo/

Ouvre le lien : l'onglet affiche **SYRO GAMES (v2026-11-16)**.
Si tu vois une ancienne version, fais **Ctrl+Maj+R**.

Jeu complet : **local 2/3/4 joueurs** (même écran), **vs ordinateur**, **en ligne** avec un code/lien. Thème SYRO clair/sombre, plateau qui pivote.

## 🎮 Jouer en ligne

1. **Toi** : Créer une partie en ligne → couleur + pseudo → Lancer → **code** `5AU2H` + **lien** `?room=CODE`
2. **Ton ami** : ouvre ton lien → lobby
3. **Toi (hôte)** : **▶ Lancer la partie** — rien ne démarre tout seul

Temps réel (Firestore), lien nettoyé à la sortie, plateau orienté sur ta couleur.

## Contenu

```
ludo/
├── server.js                 # serveur local (optionnel)
├── README.md                 # ce fichier (public)
├── DOCUMENTATION.md          # historique complet du projet (tracé dev)
├── MISE_EN_LIGNE.md          # guide déploiement
├── test.js                   # tests moteur (20 tests)
└── public/                   # site (servi par GitHub Pages)
    ├── index.html            # SYRO GAMES v2026-11-16
    ├── style.css             # thème SYRO
    ├── app.js                # interface + sons + IA
    ├── engine.js             # moteur de règles
    ├── backends.js           # online Firebase / serveur
    └── firebase-config.js    # projet ludo-yriex-zbv338
```

## Lancer en local

```bash
node server.js  # http://localhost:3000
```

## 🌐 Mise en ligne — déjà fait

| | État |
|---|---|
| **Site** | GitHub Pages branche `gh-pages` → URL ci-dessus |
| **Base** | Firebase Firestore `ludo-yriex-zbv338` |
| **Config** | `firebase-config.js` déjà rempli |

Voir `MISE_EN_LIGNE.md` pour refaire une mise en ligne.

## 📜 Règles v2026-11-16

- **2 dés** : chaque dé = 1 déplacement (même pion ou 2 pions). Choix auto si évident, menu si plusieurs coups. Zéro-clic si 1 seul pion sans choix.
- **Sortie** : **6 direct** (pas 4+2). Double 6 = relance, triple = tour perdu.
- **Étoiles ⭐ + départs ⭘ = protégés 100%** : on s'y empile, jamais mangé (même recul/somme).
- **Recul = uniquement pour manger** (anneau + couloir 51-55).
- **Même pion ne mixe pas** : pas d'avancer puis reculer avec le même pion dans le même tour. 2 pions différents OK.
- **5 dernières cases (51-55)** : mangent en avant ET en arrière (vers couloir ou anneau).
- **56 = maison finale intouchable**.
- **Capture stricte** : manger avec un dé exige un autre pion pour l'autre dé. Somme = uniquement pour capturer.
- Partie continue tant que 2 joueurs non classés. Bilan : plus violent / plus violenté.
