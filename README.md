# 🎲 Ludo — jeu en ligne à deux ou à quatre

Jeu de Ludo complet : **local à deux**, **contre l'ordinateur** (2 ou 4 joueurs),
ou **en ligne avec un ami** (partage d'un code / lien).

## Contenu

```
ludo/
├── server.js                 # serveur optionnel (utilisé sur Arena / en local)
├── package.json
├── README.md
└── public/
    ├── index.html            # l'interface
    ├── style.css
    ├── app.js                # interface, animations, sons, IA
    ├── engine.js             # moteur de règles (partagé)
    ├── backends.js           # partie en ligne : Firebase OU le serveur
    └── firebase-config.js    # ⚙️ À REMPLIR pour le mode en ligne statique
```

## Lancer le jeu sur ton ordinateur

```bash
node server.js        # ou : npm start
# puis ouvrir http://localhost:3000
```

Aucune dépendance : `npm install` n'est même pas nécessaire.

---

# 🌐 Mettre le jeu en ligne pour tes amis

## ✅ Option E (recommandée) — Firebase + GitHub Pages : gratuit, permanent, sans serveur

Le jeu se connecte à **Firebase Firestore** (base de données gratuite de Google)
directement depuis le navigateur. Plus besoin de serveur : le site tient sur
n'importe quel hébergement **statique**.

### Étape 1 — Créer le projet Firebase (5 minutes, gratuit)

1. Va sur **https://console.firebase.google.com** → **Ajouter un projet**
   (nom au choix, Analytics facultatif).
2. Dans le projet : menu **Build → Firestore Database → Créer une base**
   → choisis **« Démarrer en mode test »** → région proche → *Créer*.
3. Onglet **Règles** → remplace par :

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

   → **Publier**. *(Règles ouvertes : le jeu est prévu entre amis ; le code de
   la partie et les jetons gardent la porte fermée aux curieux.)*
4. **Paramètres du projet** (icône engrenage) → **Vos applications** →
   créer une app **Web (</>)** → donne-lui un nom → copie l'objet
   `const firebaseConfig = { ... }`.

### Étape 2 — Coller la configuration dans le jeu

Ouvre `public/firebase-config.js` et colle ta configuration à la place de `null` :

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  ...
};
```

> Le jeu détecte tout seul : **config rempli → Firebase** /
> **config vide → le serveur** (mode Arena). Tu peux garder les deux.

### Étape 3 — Mettre le jeu sur GitHub Pages (5 minutes, gratuit)

1. Crée un dépôt **GitHub** et envoie-y **le contenu du dossier `ludo/`**
   (`server.js`, `package.json`, `README.md`, `public/`… à la racine).
2. Sur GitHub : **Settings → Pages → Build and deployment →**
   *Source: Deploy from a branch* → branche `main`, dossier **`/ (root)`** → Save.
3. Attend1-2 min : ton jeu est sur
   `https://ton-nom.github.io/nom-du-depot/`

> **Astuce** : si GitHub Pages sert mal les fichiers, déplace `public/` à la
> racine (ou configure Pages pour servir `public/`). L'important est que
> `index.html` soit accessible à l'URL racine.

### Étape 4 — Partager 🎉

Envoie le lien à ton ami → il ouvre → **Créer une partie** → il te donne un
**code** (ou le lien `?room=CODE`) → tu rejoins → vous jouez.

- Les mises à jour sont **temps réel** (écoute `onSnapshot`, aucun rafraîchissement).
- **Gratuit** : le plan gratuit Firestore couvre des milliers de parties/jour.
- Les salles inactives sont oubliées naturellement (tu peux nettoyer dans la
  console Firebase si besoin).

## Les autres options (résumé)

| Option | Lien à partager | Coût | Remarque |
|---|---|---|---|
| **A. Aperçu Arena** | lien de l'aperçu en direct | gratuit | marche tant que la session est ouverte |
| **B. Render.com** | `https://ton-jeu.onrender.com` | gratuit | exécute `server.js` ; veille ~15 min |
| **C. Oracle Cloud VM** | `https://ton-domaine` | gratuit (Always Free) | allumé 24h/24, un peu technique |
| **D. VPS payant** | domaine au choix | ~2-7 €/mois | le plus simple côté admin |
| **E. Firebase + Pages** ✅ | `https://ton-nom.github.io/...` | gratuit | **sans serveur, permanent** |

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
- sons : lancer des dés, pas du pion, capture, maison, fin de partie
