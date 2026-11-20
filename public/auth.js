/* SYRO GAMES — Auth + XP (Palier 2) v2026-11-17cb */
'use strict';
window.SyroAuth = (function(){
  let app=null, auth=null, db=null, apiFS=null, authMod=null, user=null, profile=null;
  let readyCbs=[];

  function genPseudo(){ return 'Syro_' + Math.floor(1000+Math.random()*9000); }
  function levelFromXp(xp){ return Math.floor((xp||0)/100)+1; }
  function xpForNext(xp){ const l=levelFromXp(xp); return l*100 - (xp||0); }

  function friendlyError(e){
    const c = (e && e.code) || '';
    if(c.includes('operation-not-allowed')) return 'Active Email/Mdp dans Firebase Console → Authentication → Méthode de connexion';
    if(c.includes('email-already-in-use')) return 'Cet email a déjà un compte → clique Se connecter';
    if(c.includes('invalid-email')) return 'Email invalide';
    if(c.includes('weak-password')) return 'Mot de passe trop faible (6 caractères min)';
    if(c.includes('wrong-password')||c.includes('invalid-credential')) return 'Email ou mot de passe incorrect';
    if(c.includes('user-not-found')) return 'Aucun compte avec cet email';
    if(c.includes('network-request-failed')) return 'Pas de réseau — réessaie';
    return (e && e.message) || 'Erreur inconnue';
  }

  async function ensureModules(){
    if(app && auth && db) return;
    const cfg = window.FIREBASE_CONFIG;
    if(!cfg || !cfg.projectId) throw new Error('Firebase non configuré');
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    if(appMod.getApps && appMod.getApps().length) app = appMod.getApps()[0];
    else app = appMod.initializeApp(cfg);
    auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);
    apiFS = fsMod;
    window._syroApp = app; window._syroAuth = auth; window._syroDB = db;
  }

  async function ensureProfile(u){
    if(!u) return null;
    const ref = apiFS.doc(db, 'users', u.uid);
    const snap = await apiFS.getDoc(ref);
    if(snap.exists()){
      profile = snap.data();
      if(profile.pseudo==null) { profile.pseudo=genPseudo(); await apiFS.updateDoc(ref,{pseudo:profile.pseudo}); }
      if(profile.xp==null) profile.xp=0;
      if(profile.level==null) profile.level=levelFromXp(profile.xp);
      return profile;
    } else {
      const isAnon = u.isAnonymous;
      const pseudo = isAnon ? genPseudo() : (u.displayName || (u.email?u.email.split('@')[0]:null) || genPseudo());
      profile = { uid: u.uid, pseudo, xp: 0, level: 1, email: u.email||null, isAnon, createdAt: Date.now() };
      await apiFS.setDoc(ref, profile);
      return profile;
    }
  }

  function renderHeader(){
    const el = document.getElementById('syroUserBadge');
    if(!el) return;
    if(!user){
      el.innerHTML = '<span style="opacity:.7">Connexion...</span>';
      return;
    }
    const xp = profile ? profile.xp : 0;
    const lvl = profile ? profile.level : levelFromXp(xp);
    const pseudo = profile ? profile.pseudo : (user.isAnonymous? 'Invité' : (user.email||'Joueur'));
    const next = xpForNext(xp);
    el.innerHTML = `<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>Lv${lvl} • ${xp} XP • +${next} prochain</small></span>`;
    el.title = user.isAnonymous ? 'Compte invité — ton XP sera gardé si tu crées un compte' : (user.email||pseudo);
  }

  async function addXp(amount, reason){
    if(!user || !profile || !db) {
      // offline fallback
      let xp = parseInt(localStorage.getItem('syro_xp')||'0')+amount;
      localStorage.setItem('syro_xp', xp);
      if(profile){ profile.xp=xp; profile.level=levelFromXp(xp); renderHeader(); }
      return;
    }
    try{
      const ref = apiFS.doc(db, 'users', user.uid);
      profile.xp = (profile.xp||0)+amount;
      profile.level = levelFromXp(profile.xp);
      renderHeader();
      localStorage.setItem('syro_xp', profile.xp);
      await apiFS.updateDoc(ref, { xp: apiFS.increment(amount), level: profile.level });
      console.log('[SYRO XP] +'+amount, reason, '→', profile.xp);
    }catch(e){ console.warn('addXp fail', e); }
  }

  async function init(){
    try{
      await ensureModules();
      // listen auth
      authMod.onAuthStateChanged(auth, async (u)=>{
        user = u;
        if(!u){
          try{
            const cred = await authMod.signInAnonymously(auth);
            user = cred.user;
          }catch(e){
            console.warn('Anonymous sign-in failed', e);
            const fake = { uid: 'offline_'+Math.random().toString(36).slice(2), isAnonymous:true, email:null };
            user = fake;
            profile = { pseudo: genPseudo(), xp: parseInt(localStorage.getItem('syro_xp')||'0'), level: levelFromXp(parseInt(localStorage.getItem('syro_xp')||'0')) };
            renderHeader();
            readyCbs.forEach(cb=>cb(user, profile));
            return;
          }
        }
        try{
          profile = await ensureProfile(user);
        }catch(e){ console.warn('ensureProfile', e); profile={pseudo:genPseudo(), xp:0, level:1}; }
        renderHeader();
        if(profile){
          localStorage.setItem('syro_xp', profile.xp);
          localStorage.setItem('syro_pseudo', profile.pseudo);
        }
        readyCbs.forEach(cb=>cb(user, profile));
        // live profile
        try{
          const ref = apiFS.doc(db, 'users', user.uid);
          apiFS.onSnapshot(ref, (snap)=>{
            if(snap.exists()){
              profile = snap.data();
              localStorage.setItem('syro_xp', profile.xp);
              renderHeader();
            }
          });
        }catch(e){}
      });
    }catch(e){
      console.warn('SyroAuth init fail', e);
      const xp = parseInt(localStorage.getItem('syro_xp')||'0');
      profile = { pseudo: localStorage.getItem('syro_pseudo')||genPseudo(), xp, level: levelFromXp(xp) };
      user = { uid:'offline', isAnonymous:true };
      renderHeader();
      setTimeout(()=>readyCbs.forEach(cb=>cb(user,profile)), 200);
    }
  }

  async function linkToEmail(email, password){
    await ensureModules();
    if(!user) throw new Error('Pas connecté');
    const emailCred = authMod.EmailAuthProvider.credential(email, password);
    if(user.isAnonymous){
      const res = await authMod.linkWithCredential(user, emailCred);
      user = res.user;
      const ref = apiFS.doc(db, 'users', user.uid);
      await apiFS.updateDoc(ref, { email, isAnon: false });
      profile.email = email; profile.isAnon=false;
      renderHeader();
      return res;
    } else {
      throw new Error('Déjà connecté avec un compte');
    }
  }

  async function signInEmail(email, password){
    await ensureModules();
    const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
    user = cred.user;
    profile = await ensureProfile(user);
    renderHeader();
    return cred;
  }

  async function signUpEmail(email, password){
    await ensureModules();
    if(user && user.isAnonymous){
      try{
        const r = await linkToEmail(email,password);
        return r;
      }catch(e){
        if(e.code && e.code.includes('email-already-in-use')){
          throw e; // propagate friendly
        }
        console.warn('link failed, fallback create', e);
      }
    }
    const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
    user = cred.user;
    const oldXp = parseInt(localStorage.getItem('syro_xp')||'0');
    profile = await ensureProfile(user);
    if(oldXp > (profile.xp||0)){
      await addXp(oldXp - (profile.xp||0), 'migration anon → compte');
    }
    renderHeader();
    return cred;
  }

  async function signOut(){
    if(auth) await authMod.signOut(auth);
    localStorage.removeItem('syro_xp');
    location.reload();
  }

  function onReady(cb){ if(user && profile) cb(user,profile); else readyCbs.push(cb); }

  return { init, onReady, addXp, linkToEmail, signInEmail, signUpEmail, signOut, levelFromXp, getUser:()=>user, getProfile:()=>profile, renderHeader, friendlyError };
})();
