/* SYRO GAMES — Auth + XP (Palier 2) */
'use strict';
window.SyroAuth = (function(){
  let app=null, auth=null, db=null, apiFS=null, user=null, profile=null;
  let readyCbs=[];

  function genPseudo(){
    return 'Syro_' + Math.floor(1000+Math.random()*9000);
  }
  function levelFromXp(xp){ return Math.floor((xp||0)/100)+1; }
  function xpForNext(xp){ const l=levelFromXp(xp); return l*100 - (xp||0); }

  async function ensureModules(){
    if(app && auth && db) return;
    const cfg = window.FIREBASE_CONFIG;
    if(!cfg || !cfg.projectId) throw new Error('Firebase non configuré');
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    app = appMod.initializeApp ? (appMod.getApps().length? appMod.getApps()[0] : appMod.initializeApp(cfg)) : null;
    // compat: if getApps not available, just init
    if(!app) app = appMod.initializeApp(cfg);
    auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);
    apiFS = fsMod;
    // keep global for backends.js reuse
    window._syroApp = app; window._syroAuth = auth; window._syroDB = db;
  }

  async function ensureProfile(u){
    if(!u) return null;
    const ref = apiFS.doc(db, 'users', u.uid);
    const snap = await apiFS.getDoc(ref);
    if(snap.exists()){
      profile = snap.data();
      // migrate if missing fields
      if(profile.pseudo==null){ profile.pseudo=genPseudo(); }
      if(profile.xp==null) profile.xp=0;
      if(profile.level==null) profile.level=levelFromXp(profile.xp);
      return profile;
    } else {
      const isAnon = u.isAnonymous;
      const pseudo = isAnon ? genPseudo() : (u.displayName || u.email.split('@')[0] || genPseudo());
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
    const pseudo = profile ? profile.pseudo : (user.isAnonymous? 'Invité' : user.email);
    const next = xpForNext(xp);
    el.innerHTML = `<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>Lv${lvl} • ${xp} XP • +${next} prochain</small></span>`;
    el.title = user.isAnonymous ? 'Compte invité — ton XP sera gardé si tu crées un compte' : (user.email||'');
  }

  async function addXp(amount, reason){
    if(!user || !profile) return;
    try{
      const ref = apiFS.doc(db, 'users', user.uid);
      // increment local optimistically
      profile.xp = (profile.xp||0)+amount;
      profile.level = levelFromXp(profile.xp);
      renderHeader();
      await apiFS.updateDoc(ref, { xp: apiFS.increment(amount), level: profile.level });
      console.log('[SYRO XP] +'+amount, reason, '→', profile.xp);
    }catch(e){ console.warn('addXp fail', e); }
  }

  async function init(){
    try{
      await ensureModules();
      apiFS.enableNetwork && await apiFS.enableNetwork(db).catch(()=>{});
      auth.onAuthStateChanged(async (u)=>{
        user = u;
        if(!u){
          // sign in anonymously
          try{
            const cred = await auth.signInAnonymously(auth);
            user = cred.user;
          }catch(e){
            console.warn('Anonymous sign-in failed', e);
            // fallback: show guest without firebase
            const fake = { uid: 'offline_'+Math.random().toString(36).slice(2), isAnonymous:true, email:null };
            user = fake;
            profile = { pseudo: genPseudo(), xp: parseInt(localStorage.getItem('syro_xp')||'0'), level: levelFromXp(parseInt(localStorage.getItem('syro_xp')||'0')) };
            renderHeader();
            readyCbs.forEach(cb=>cb(user, profile));
            return;
          }
        }
        profile = await ensureProfile(user);
        renderHeader();
        localStorage.setItem('syro_xp', profile.xp);
        localStorage.setItem('syro_pseudo', profile.pseudo);
        readyCbs.forEach(cb=>cb(user, profile));
        // listen profile changes
        const ref = apiFS.doc(db, 'users', user.uid);
        apiFS.onSnapshot(ref, (snap)=>{
          if(snap.exists()){
            profile = snap.data();
            localStorage.setItem('syro_xp', profile.xp);
            renderHeader();
          }
        });
      });
    }catch(e){
      console.warn('SyroAuth init fail', e);
      // offline fallback
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
    const cred = window.SyroAuth._cred ? window.SyroAuth._cred : null;
    // create credential
    const { EmailAuthProvider, linkWithCredential, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const emailCred = EmailAuthProvider.credential(email, password);
    if(user.isAnonymous){
      const res = await linkWithCredential(user, emailCred);
      user = res.user;
      // update profile doc
      const ref = apiFS.doc(db, 'users', user.uid);
      await apiFS.updateDoc(ref, { email, isAnon: false });
      profile.email = email; profile.isAnon=false;
      renderHeader();
      return res;
    } else {
      // already has account, just sign in?
      throw new Error('Déjà connecté avec un compte');
    }
  }

  async function signInEmail(email, password){
    await ensureModules();
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    user = cred.user;
    profile = await ensureProfile(user);
    renderHeader();
    return cred;
  }

  async function signUpEmail(email, password){
    await ensureModules();
    // if anonymous, link, else create
    if(user && user.isAnonymous){
      try{ return await linkToEmail(email,password); }catch(e){
        // link failed (e.g., email exists), fallback to create
        console.warn('link failed', e);
      }
    }
    const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    user = cred.user;
    // if had old anonymous XP, migrate? Keep max
    const oldXp = parseInt(localStorage.getItem('syro_xp')||'0');
    profile = await ensureProfile(user);
    if(oldXp > (profile.xp||0)){
      await addXp(oldXp - (profile.xp||0), 'migration anon → compte');
    }
    renderHeader();
    return cred;
  }

  async function signOut(){
    if(auth) await auth.signOut();
    localStorage.removeItem('syro_xp');
    location.reload();
  }

  function onReady(cb){ if(user) cb(user,profile); else readyCbs.push(cb); }

  return { init, onReady, addXp, linkToEmail, signInEmail, signUpEmail, signOut, levelFromXp, getUser:()=>user, getProfile:()=>profile, renderHeader };
})();
