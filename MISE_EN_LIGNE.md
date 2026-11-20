# 🚀 Mettre SYRO GAMES en ligne — Vercel (0 €)

> **Hébergement unique : Vercel** `syro-ludo.vercel.app`
> GitHub Pages supprimé (`gh-pages` → 404). Aucune carte bancaire.

## Déploiement actuel

```
main (GitHub) ──► Vercel (Root Directory = public) ──► https://syro-ludo.vercel.app
  public/index.html, style.css, app.js, syro-store.js, sounds/tom-scream.mp3 ...
  vercel.json { git.deploymentEnabled: { main:true, gh-pages:false } }
```

- **Prod** : `main` → Vercel Production (auto-deploy à chaque `git push origin main`)
- **Preview Error bloqué** : `public/vercel.json { git.deploymentEnabled:false }` sur `gh-pages` si recréé

## Déployer une mise à jour

```bash
cd ludo
# modifier public/...
git add public/app.js public/style.css public/index.html vercel.json
git commit -m "fix: ..."
TOKEN="ghp_xxx" git push origin main
# Vercel déploie en ~8s → https://syro-ludo.vercel.app (Ctrl+Maj+R)
```

## Vérifier

```bash
curl -sI https://syro-ludo.vercel.app/ | grep -E "HTTP|age"
curl -s https://syro-ludo.vercel.app/index.html | grep "v=2026"
```

## Local

```bash
node server.js  # http://localhost:3000 (sert public/)
```

## Firebase (online)

Config déjà dans `public/firebase-config.js` (projet `ludo-yriex-zbv338`).
Règles Firestore : `rooms/{code}` read/write `if true`.

## Dépannage

| Symptôme | Solution |
|---|---|
| Ancienne version affichée | Ctrl+Maj+R (cache) + vérifier `?v=2026-11-24` dans index.html |
| Vercel Preview Error rouge | normal si push sur `gh-pages` — supprimé. Vérifier `vercel.json` |
| `?room=CODE` ne marche pas | Vérifier Firestore Rules publiées |
