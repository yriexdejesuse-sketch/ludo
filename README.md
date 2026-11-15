# 🎲 Ludo — jeu en ligne à deux ou à quatre

## ▶ Le jeu est déjà en ligne : https://yriexdejesuse-sketch.github.io/ludo/

Ouvre le lien : l'onglet affiche la **version** (ex. `(v2026-11-13d)`) —
si elle manque, rafraîchis avec **Ctrl+Maj+R**.

Jeu de Ludo complet : **local à 2, 3 ou 4 joueurs** (même écran),
**contre l'ordinateur** (2 ou 4 joueurs), ou **en ligne avec un ami**
(partage d'un code / lien).

## 🎮 Jouer en ligne à deux

1. **Toi** : « Créer une partie » → choisis ta couleur + tape ton nom →
   « Lancer » → tu reçois un **code** (ex. `5AU2H`) et un **lien**
   `…?room=CODE`.
2. **Ton ami** : il ouvre **ton lien** (ou tape le code sur la page
   d'accueil) → il arrive dans le lobby.
3. **Toi, l'hôte** : clique **« ▶ Lancer la partie »** quand il est
   prêt — **rien ne démarre tout seul**.

Mises à jour **temps réel** (aucun rafraîchissement), plateau orienté
sur la couleur de chaque joueur, commentaires dans les cases des
joueurs concernés.

## Contenu

```
ludo/
├── server.js                 # serveur optionnel (Arena / local)
├── package.json
├── README.md                 # ce fichier
├── DOCUMENTATION.md          # règles internes, décisions, historique
├── MISE_EN_LIGNE.md          # guide complet de mise en ligne
├── test.js                   # tests du moteur de règles
├── test_backends.js          # tests du backend en ligne
├── site-github-pages.zip     # copie du site pour GitHub Pages
└── public/                   # ← le site lui-même (servi par Pages)
    ├── index.html            # l'interface
    ├── style.css
    ├── app.js                # interface, animations, sons, IA, orientation
    ├── engine.js             # moteur de règles (partagé)
    ├── backends.js           # partie en ligne : Firebase OU le serveur
    └── firebase-config.js    # ✅ déjà rempli (projet ludo-yriex-zbv338)
```

## Lancer le jeu sur ton ordinateur

```bash
node server.js        # ou : npm start
# puis ouvrir http://localhost:3000
```

Aucune dépendance : `npm install` n'est même pas nécessaire.

---

# 🌐 Mise en ligne — c'est déjà fait ✓

Tout est déjà configuré et hébergé dans ce dépôt :

| | État actuel |
|---|---|
| **Site** | GitHub Pages sert la branche **`gh-pages`** (contenu de `public/` à la racine) → l'URL ci-dessus ; redéployée à chaque mise à jour |
| **Base de données** | Firebase **Firestore**, projet **`ludo-yriex-zbv338`** (gratuit) |
| **Config** | `public/firebase-config.js` **déjà rempli** — ne pas l'écraser |
| **Règles Firestore** | ouvertes sur `/rooms/{code}` (le jeu est prévu entre amis) |

Les étapes détaillées (recréer un projet, règles, config, déploiement)
sont dans **`MISE_EN_LIGNE.md`**.

### Résumé — si tu veux refaire ta propre mise en ligne

1. **Firebase** (gratuit,5 min) : **console.firebase.google.com** →
   *Ajouter un projet* → **Build → Firestore Database → Créer une base**
   → « Démarrer en mode test » → onglet **Règles** →

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /rooms/{roomId} {
         allow read, write: if true;
       }
     }
   }
   ```

   → **Publier**. Puis **Paramètres du projet → Vos applications →
   Web (</>)** → copier l'objet `firebaseConfig`.
2. **Config** : colle-le dans `public/firebase-config.js`
   (`window.FIREBASE_CONFIG = { … }`) — *dans ce dépôt, c'est déjà
   rempli*. Détection automatique : **config remplie → Firebase** /
   **config vide → le serveur** (mode Arena) — les deux coexistent.
3. **GitHub Pages** (gratuit) : dépôt GitHub → **Settings → Pages →
   Deploy from a branch** → soit la branche **`gh-pages`** avec le
   contenu de `public/` à la racine (**comme ici**), soit `main` avec
   `public/` déplacé à la racine → 1-2 min →
   `https://ton-nom.github.io/nom-du-depot/`.
4. **Partager** : tu crées la partie, tu envoies le **lien** à ton ami,
   il rejoint, **tu lances** 🎉.

## Les autres options (résumé)

| Option | Lien à partager | Coût | Remarque |
|---|---|---|---|
| **A. Aperçu Arena** | lien de l'aperçu en direct | gratuit | marche tant que la session est ouverte |
| **B. Render.com** | `https://ton-jeu.onrender.com` | gratuit | exécute `server.js` ; veille ~15 min |
| **C. Oracle Cloud VM** | `https://ton-domaine` | gratuit (Always Free) | allumé 24h/24, un peu technique |
| **D. VPS payant** | domaine au choix | ~2-7 €/mois | le plus simple côté admin |
| **E. Firebase + Pages** ✅ | `https://ton-nom.github.io/...` | gratuit | **sans serveur, permanent** — **c'est ce qui est utilisé ici** |

---

## Règles implémentées

- 2 dés ; chaque dé = un déplacement ; **choix évidents simplifiés**
  (2e dé automatique après le 1er coup, bascule automatique de dé si le pion
  n'est jouable que par l'autre dé ; clic sur un pion = **menu libellé** de
  tous ses coups, jamais de refus ; **mode zéro clic : avec un seul pion en
  jeu, le jeu joue les deux dés tout seul — mais uniquement quand il n'y a
  AUCUN choix : si un6 sort, le jeu s'arrête et c'est à toi de décider
  (sortir un nouveau pion ou avancer ton pion en jeu)** ; idem pour une
  éventuelle capture à la somme des2 dés)
- un 6 sort de la base (enchaînement possible avec l'autre dé) ;
  relance sur **double 6**, sur **un manger** et sur **une arrivée à la
  maison** ; **3 double-6 de suite = tour perdu**
- **recul uniquement pour manger** (mini-choix près du pion), jamais depuis
  la maison ; le jeu **calcule et propose à chaque lancer** tout manger en
  arrière possible (avec l'un des deux dés ou la **somme des deux dés** :
  si les 2 dés sont encore dispo et que leur somme permet un recul sur un
  pion ennemi, le jeu propose d'utiliser les deux d'un coup) ;
  **recul derrière sa propre ligne de départ** : l'anneau est un cercle —
  un pion qui vient de sortir peut reculer sur la case « trou » située
  juste avant son départ et y manger un ennemi (premier pion en jeu
  compris)
- **couloir adverse** : quand un pion atterrit sur la bouche d'un
  adversaire dont un pion est dans son couloir (les5 cases avant sa
  maison), on peut **entrer dans le couloir et le manger** — en avant ou
  en recul, sur la case de son choix ; le pion entré s'y déplace (avant
  normal, **recul = manger seulement**) et **ne peut en sortir que par un
  double6** (retour sur la bouche + jet supplémentaire) ; le propriétaire
  peut, lui, **manger l'intrus** dans son propre couloir
- **en ligne** : chacun écrit **son nom** (affiché dans les cartes du
  lobby/du jeu) et choisit **sa couleur** dans le lobby — **rien ne
  démarre tout seul : c'est l'hôte qui donne le top** (« ▶ Lancer la
  partie ») quand les deux joueurs sont prêts ; « Rejouer » ramène au
  lobby (l'hôte relancera)
- **commentaires hors plateau** : plus **aucun** message flottant sur le
  plateau (en mobile ils gênaient le clic sur les pions) — **tout** part
  dans **la case du joueur concerné** : le dernier message du journal qui
  le cite, mais aussi les erreurs et les invites («6 ! à toi de choisir »
 …) ; une petite barre n'apparaît que dans les menus (jamais sur un
  plateau) ; la pastille « 👆 Clique pour lancer » vit dans le
  **panneau** sous le plateau, plus jamais dessus
- **plateau orienté sur toi** : le plateau **pivote** pour que ta case
  de départ soit **en bas à gauche de ton écran** (rouge -90°, vert
  180°, jaune +90°, bleu0°) — en ligne et contre l'ordinateur : ta
  couleur ; en local : le joueur1
- **badge de couleur** : une pastille fixe **en bas à gauche** de
  l'écran te montre ta couleur — en ligne et contre l'ordinateur
  (« Ta couleur : Rouge »), les deux couleurs en partie locale
- **règles du manger** : **capture stricte** (un autre pion doit pouvoir
  jouer l'autre dé — sinon un seul pion en jeu = pas de manger) ;
  **après un manger, le pion qui a mangé ne rejoue plus** du tout ce tour ;
  départs ⭘ et étoiles ⭐ protégés
- 1er à rentrer ses 4 pions gagne ; la partie continue **tant qu'au moins
  deux joueurs n'ont pas fini** — dès qu'il n'en reste qu'un seul, il prend
  la dernière place et **la partie s'arrête** (donc à deux, un vainqueur
  suffit) ; à la fin, un **bilan** affiche le plus violent (pions mangés)
  et le plus violenté (pions perdus), avec le tableau des captures
- **dés vraiment aléatoires** : chaque jet utilise
  `crypto.getRandomValues()` (entropie matérielle du navigateur) — le
  résultat ne dépend d'aucun état ni d'aucun historique du jeu ; repli
  automatique sur `Math.random` si l'API est indisponible
- sons : lancer des dés, pas du pion, capture, maison, fin de partie
