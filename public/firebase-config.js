/* ============================================================
   ⚙️ CONFIGURATION FIREBASE (à remplir une seule fois)
   ------------------------------------------------------------
   1. Va sur https://console.firebase.google.com → « Ajouter un projet »
      (nom au choix, Analytics désactivé — gratuit, sans carte bancaire)
   2. Build → Firestore Database → « Créer une base »
      → **mode de production** → région (ex. europe-west1) → Enable
   3. Dans Firestore → « Règles » → colle le bloc ci-dessous → Publier :
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /rooms/{code} {
              allow read, write: if true;
            }
          }
        }
   4. Paramètres du projet (⚙️) → « Vos applications » → Web (</>)
      → nom → Register → copie l'objet `firebaseConfig` et colle-le
      À LA PLACE DE `null` ci-dessous (il contient apiKey, projectId…).
   Le jeu détecte automatiquement : si c'est rempli → Firebase,
   sinon → le serveur local (Arena).
   ============================================================ */
window.FIREBASE_CONFIG = null;

/* Exemple (remplace par ta vraie configuration) :
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  storageBucket: "ton-projet.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/
