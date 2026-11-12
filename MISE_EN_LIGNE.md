# 🚀 Mettre Ludo en ligne — GitHub Pages + Firebase (0 €)

> **Objectif** : ton jeu accessible à l'adresse
> `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/` avec le multijoueur qui
> marche entre deux joueurs (même à distance), **sans budget**.
>
> **Temps total** : ~20 minutes (dont15 de comptes à créer).
> **Aucune carte bancaire** n'est demandée nulle part.

## De quoi ça a l'air

```
  Joueur A ──► https://TON-PSEUDO.github.io/ludo/   (GitHub Pages = le jeu)
       │                      │
       │              firebase-config.js rempli
       ▼                      ▼
  Joueur B ──────────► Firebase Firestore (les parties en ligne)
                       (gratuit :50 000 lectures/jour)
```

- **GitHub Pages** héberge le jeu (toujours en ligne, HTTPS gratuit) ;
- **Firebase Firestore** stocke et synchronise les parties en ligne ;
- Le fichier `server.js` (serveur local) **ne sert que pour développer
  sur ton ordinateur** — on ne l'upload PAS.

---

## ÉTAPE 1 — Créer la base Firebase (5 min)

1. Va sur **https://console.firebase.google.com** → connecte-toi avec
   un compte Google → **« Ajouter un projet »**.
2. Nomme-le (ex. `ludo-en-ligne`) → **Google Analytics : désactivé** →
   **Créer le projet** → *Continuer*.
3. Menu de gauche : **Build → Firestore Database → « Créer une base »** :
   - **« Démarrer en mode de production »** (pas de carte bancaire) ;
   - Région : **europe-west1 (Belgique)** si proposé, sinon la plus
     proche dans la liste ;
   - **Activer**.
4. Toujours dans Firestore → onglet **« Règles »** → **Modifier les
   règles** → remplace TOUT par :

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /rooms/{code} {
         allow read, write: if true;
       }
     }
   }
   ```

   → **« Publier »**.
   *(Ces règles n'autorisent l'accès qu'à la collection `rooms` :
   c'est ce qu'utilise le jeu pour créer/rejoindre/lancer les parties.)*

5. **Paramètres du projet (⚙️ en haut) → « Vos applications »** →
   clique l'icône **Web `</>`** → nom (ex. `ludo-web`) →
   **« Enregistrer l'application »** → tu vois un bloc
   `const firebaseConfig = { ... }` → **copie-le intégralement**
   (les6 clés : apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId).

## ÉTAPE 2 — Coller ta config dans le jeu (2 min)

Tu as deux façons — celle de droite est la plus simple si tu n'as
pas d'outils sur ton ordinateur :

**A. Avant l'upload (sur ton ordinateur)** :
ouvre `public/firebase-config.js` dans un éditeur, remplace

```js
window.FIREBASE_CONFIG = null;
```

par

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  storageBucket: "ton-projet.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

(les vraies valeurs copiées à l'étape1.5) → enregistre.

**B. Après l'upload (directement sur GitHub)** :
sur la page du fichier `firebase-config.js` dans GitHub → crayon ✏️ →
colle → **Commit changes**.

> ⚠️ Ces clés sont **publiques par conception** (c'est normal pour
> Firebase côté client) : ce sont les règles de Firestore qui font la
> sécurité, pas le secret de la clé.

## ÉTAPE 3 — Créer le dépôt GitHub et publier (5 min)

1. Va sur **https://github.com** → **+ → New repository** :
   - Nom : `ludo` (ou ce que tu veux) ;
   - **Public** (obligatoire pour Pages gratuit) ;
   - **Ne coche RIEN** (pas de README) → **Create repository**.
2. Dans le dépôt vide : **Add file → Upload files** → **glisse-dépose
   les fichiers décompressés** du zip `site-github-pages.zip` :
   `index.html`, `style.css`, `engine.js`, `app.js`, `backends.js`,
   `firebase-config.js` (+ `MISE_EN_LIGNE.md` si tu veux) →
   **Commit changes**.
3. (Si tu as choisi la méthode A : tout est déjà dedans ✅. Sinon :
   ouvre `firebase-config.js` → ✏️ → colle ta config → Commit.)
4. **Settings (onglet en haut) → Pages** à gauche :
   - *Source* : **Deploy from a branch** ;
   - *Branch* : **main** → dossier **/(root)** → **Save**.
5. Attends ~1 minute. Recharge la page Settings : le lien
   **`https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`** s'affiche en haut →
   **c'est ton jeu en ligne** 🎉

## ÉTAPE 4 — Le test final (2 min)

1. Ouvre l'adresse dans **un navigateur** → menu → **En ligne** →
   **Créer une partie** → tu reçois un **code à5 lettres** ;
2. Ouvre un **autre navigateur** (ou navigation privée) → même
   adresse → **Rejoindre** → saisis le code → **Rejoindre la partie** ;
3. Les deux plateaux se synchronisent et la partie démarre → **c'est
   bon, le multijoueur marche** ✅

Tu peux maintenant envoyer le lien + le code à ton adversaire, où
qu'il soit.

---

## 🔧 Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| « Service en ligne indisponible » | `firebase-config.js` encore à `null` ou mal collé | Étape2 (vérifie qu'il y a bien `projectId`) |
| Erreur de permissions / « missing » Firestore | Règles pas publiées | Étape1.4 → **Publier** |
| « Partie introuvable (code invalide) » | Mauvais code, ou la DB n'est pas encore prête | Revérifie le code ; réessaie dans1 min |
| Page404 (site introuvable) | Pages pas activé, ou dépôt privé | Étape3.4 ; dépôt doit être **Public** |
| La partie se fige entre deux joueurs | Fermé l'onglet ou erreur réseau | recharge : l'état est dans Firestore, il revient |
| Tout marche en local mais pas en ligne | Config pas encore remplie côté GitHub | Étape2. méthode B (édition sur GitHub) |

## 📌 À savoir

- **Gratuit** : Pages (dépôt public) + Firestore Spark (50k lectures
  et20k écritures **par jour** — une partie en consomme une poignée).
  Aucune carte bancaire, aucun compte de facturation.
- **Toujours en ligne** : pas de veille, pas de réveil froid.
- **Après une modification du jeu** : re-téléverse le fichier changé
  sur GitHub (ou commit via le web) → le site se met à jour en ~1 min.
- **Le serveur local** (`node server.js`) reste pour développer et
  lancer les tests (`node test.js`, `node test_backends.js`,
  `node smoke.js`) — il n'est pas nécessaire en ligne.
- **Domaine personnalisé** (ex. `tonjeu.fr`, ~10 €/an) : possible plus
  tard via Pages → Custom domain — optionnel.
