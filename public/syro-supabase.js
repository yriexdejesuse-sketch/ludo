/* SYRO GAMES — Supabase Auth + XP (remplace Firebase pour Palier 2) */
'use strict';
window.SyroAuth = (function(){
  let supa=null, user=null, profile=null;
  let readyCbs=[];
  let cfg = window.SUPABASE_CONFIG;

  function genPseudo(){ return 'Syro_' + Math.floor(1000+Math.random()*9000); }
  function levelFromXp(xp){ return Math.floor((xp||0)/100)+1; }
  function xpForNext(xp){ const l=levelFromXp(xp); return l*100 - (xp||0); }

  function renderHeader(){
    const el = document.getElementById('syroUserBadge');
    if(!el) return;
    if(!user && !profile){
      const xp = parseInt(localStorage.getItem('syro_xp')||'0');
      const pseudo = localStorage.getItem('syro_pseudo')||genPseudo();
      if(!localStorage.getItem('syro_pseudo')) localStorage.setItem('syro_pseudo', pseudo);
      const lvl=levelFromXp(xp), next=xpForNext(xp);
      el.innerHTML = `<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>Lv${lvl} • ${xp} XP • +${next} prochain</small></span>`;
      el.title='Invité — crée un compte pour garder ton XP';
      return;
    }
    const xp = profile ? profile.xp : 0;
    const lvl = profile ? profile.level : levelFromXp(xp);
    const pseudo = profile ? profile.pseudo : (user?.email?.split('@')[0]||'Joueur');
    const next = xpForNext(xp);
    el.innerHTML = `<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>Lv${lvl} • ${xp} XP • +${next} prochain</small></span>`;
    el.title = user ? (user.email||pseudo) : '';
  }

  async function ensureSupa(){
    if(supa) return supa;
    if(!cfg || !cfg.url) throw new Error('Supabase non configuré');
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supa = mod.createClient(cfg.url, cfg.anonKey);
    window._syroSupa = supa;
    return supa;
  }

  async function fetchProfile(uid){
    const { data, error } = await supa.from('profiles').select('*').eq('id', uid).single();
    if(error && error.code!=='PGRST116') throw error;
    return data;
  }

  async function ensureProfile(u){
    let p = await fetchProfile(u.id);
    if(p){ profile=p; return p; }
    // create
    const pseudo = (u.user_metadata && u.user_metadata.pseudo) || u.email.split('@')[0] || genPseudo();
    const xp = parseInt(localStorage.getItem('syro_xp')||'0');
    const lvl = levelFromXp(xp);
    const ins = { id: u.id, pseudo, xp, level: lvl, email: u.email };
    const { data, error } = await supa.from('profiles').insert(ins).select().single();
    if(error) throw error;
    profile=data;
    return data;
  }

  function renderAuthState(){
    const form = document.getElementById('authForm');
    const tabs = document.getElementById('authTabs');
    const connected = document.getElementById('authConnected');
    const info = document.getElementById('authConnectedInfo');
    const isLogged = !!(user && profile);
    if(form) form.classList.toggle('hidden', isLogged);
    if(tabs) tabs.classList.toggle('hidden', isLogged);
    if(connected) connected.classList.toggle('hidden', !isLogged);
    if(isLogged && info){
      info.innerHTML = `Connecté en tant que <b>${profile.pseudo}</b> (${user.email||'—'})<br><span style="color:var(--accent)">Lv${profile.level} • ${profile.xp} XP</span> — ton XP est sauvegardé.`;
    }
  }

  async function init(){
    try{
      await ensureSupa();
      const { data: { session } } = await supa.auth.getSession();
      if(session && session.user){
        user=session.user;
        profile=await ensureProfile(user);
      } else {
        if(!localStorage.getItem('syro_pseudo')) localStorage.setItem('syro_pseudo', genPseudo());
        if(!localStorage.getItem('syro_xp')) localStorage.setItem('syro_xp','0');
      }
      renderHeader(); renderAuthState();
      readyCbs.forEach(cb=>cb(user,profile));
      supa.auth.onAuthStateChange(async (ev, sess)=>{
        if(sess && sess.user){
          user=sess.user;
          try{ profile=await ensureProfile(user); }catch(e){}
          if(profile){ localStorage.setItem('syro_pseudo', profile.pseudo); localStorage.setItem('syro_xp', profile.xp); }
          renderHeader(); renderAuthState();
        } else if(ev==='SIGNED_OUT'){
          user=null; profile=null;
          renderHeader(); renderAuthState();
        }
      });
      if(user){
        supa.channel('profiles_'+user.id)
          .on('postgres_changes', {event:'*', schema:'public', table:'profiles', filter:`id=eq.${user.id}`}, (payload)=>{
            if(payload.new){ profile=payload.new; localStorage.setItem('syro_xp', profile.xp); renderHeader(); renderAuthState(); }
          }).subscribe();
      }
    }catch(e){
      console.warn('Supabase init fail', e);
      renderHeader(); renderAuthState();
    }
  }

  function friendlyError(e){
    const m=(e&&e.message)||'';
    const c=(e&&e.code)||'';
    if(m.includes('already registered')||m.includes('already exists')||c==='user_already_exists') return 'Cet email a déjà un compte → clique Se connecter';
    if(m.includes('Invalid login')) return 'Email ou mot de passe incorrect';
    if(m.includes('Email not confirmed')) return 'Confirme ton email (vérifie tes spams) ou reconnecte-toi';
    if(m.includes('weak_password')) return 'Mot de passe trop faible (6 car. min)';
    if(m.includes('invalid_email')) return 'Email invalide';
    if(m.includes('configuration-not-found')||m.includes('Auth')) return 'Supabase OK — réessaie';
    return m || 'Erreur';
  }

  async function addXp(amount, reason){
    const isGuest = !user;
    if(isGuest){
      let xp = parseInt(localStorage.getItem('syro_xp')||'0')+amount;
      localStorage.setItem('syro_xp', xp);
      // update local profile for header
      if(!profile) profile={pseudo:localStorage.getItem('syro_pseudo'), xp, level:levelFromXp(xp)};
      else { profile.xp=xp; profile.level=levelFromXp(xp); }
      renderHeader();
      console.log('[SYRO XP guest] +'+amount, reason, '→', xp);
      return;
    }
    try{
      const newXp = (profile.xp||0)+amount;
      const newLvl = levelFromXp(newXp);
      const { error } = await supa.from('profiles').update({ xp: newXp, level: newLvl }).eq('id', user.id);
      if(error) throw error;
      // also log event
      await supa.from('xp_events').insert({ user_id: user.id, amount, reason: reason||'' });
      profile.xp=newXp; profile.level=newLvl;
      localStorage.setItem('syro_xp', newXp);
      renderHeader();
      console.log('[SYRO XP] +'+amount, reason, '→', newXp);
    }catch(e){ console.warn('addXp fail', e); }
  }

  async function signUpEmail(email,password){
    await ensureSupa();
    const pseudo = localStorage.getItem('syro_pseudo')||genPseudo();
    const { data, error } = await supa.auth.signUp({ email, password, options:{ data:{pseudo} } });
    if(error) throw error;
    user=data.user;
    if(data.session) {
      profile=await ensureProfile(user);
      const guestXp = parseInt(localStorage.getItem('syro_xp')||'0');
      if(guestXp > (profile.xp||0)){
        await addXp(guestXp - (profile.xp||0), 'migration invité → compte');
      }
    } else {
      throw new Error('Vérifie ton email pour confirmer');
    }
    renderHeader(); renderAuthState();
    return data;
  }

  async function signInEmail(email,password){
    await ensureSupa();
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if(error) throw error;
    user=data.user;
    profile=await ensureProfile(user);
    renderHeader(); renderAuthState();
    return data;
  }

  async function signOut(){
    if(supa) await supa.auth.signOut();
    localStorage.removeItem('syro_pseudo');
    localStorage.removeItem('syro_xp');
    user=null; profile=null;
    renderHeader(); renderAuthState();
  }

  function onReady(cb){ if(user||profile) cb(user,profile); else readyCbs.push(cb); }

  return { init, onReady, addXp, signInEmail, signUpEmail, signOut, levelFromXp, getUser:()=>user, getProfile:()=>profile, renderHeader, friendlyError, ensureSupa };
})();
