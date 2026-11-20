/* SYRO GAMES — Supabase Auth + XP + Boutique + Leaderboard v2026-11-20c */
'use strict';
window.SyroAuth = (function(){
  let supa=null, user=null, profile=null;
  let readyCbs=[];
  let cfg = window.SUPABASE_CONFIG;
  const SHOP_CATALOG = [
    // pions
    {id:'pawn_classic', cat:'pion', name:'Classique', price:0, preview:'🔴', desc:'Style d’origine'},
    {id:'pawn_neon', cat:'pion', name:'Néon Pulse', price:80, preview:'💎', desc:'Aura néon animée'},
    {id:'pawn_gold', cat:'pion', name:'Or Royal', price:150, preview:'👑', desc:'Pions dorés + brillance'},
    {id:'pawn_emoji', cat:'pion', name:'Emoji Fun', price:60, preview:'😎', desc:'Têtes emoji'},
    {id:'pawn_fire', cat:'pion', name:'Feu Infernal', price:200, preview:'🔥', desc:'Traînée de feu'},
    // plateaux
    {id:'board_classic', cat:'plateau', name:'Bois Classique', price:0, preview:'🪵', desc:'Plateau chaleureux'},
    {id:'board_neon', cat:'plateau', name:'Neon Night', price:100, preview:'🌃', desc:'Thème nuit néon'},
    {id:'board_savanna', cat:'plateau', name:'Savane', price:120, preview:'🦁', desc:'Tons sable / ocre'},
    {id:'board_ocean', cat:'plateau', name:'Ocean', price:120, preview:'🌊', desc:'Bleus profonds'},
    // dés
    {id:'dice_classic', cat:'de', name:'Dés Ivoire', price:0, preview:'🎲', desc:'Classique'},
    {id:'dice_crystal', cat:'de', name:'Cristal', price:90, preview:'🔮', desc:'Dés translucides'},
    {id:'dice_gold', cat:'de', name:'Dés Or', price:130, preview:'✨', desc:'Dés dorés premium'},
    // sons (cosmétique future)
    {id:'sound_pop', cat:'son', name:'Pop Fun', price:40, preview:'🔊', desc:'Sons rebondissants'},
    {id:'sound_drum', cat:'son', name:'Tambour Africain', price:70, preview:'🥁', desc:'Percussions'},
  ];
  function genPseudo(){ return 'Syro_' + Math.floor(1000+Math.random()*9000); }
  function levelFromXp(xp){ return Math.floor((xp||0)/100)+1; }
  function xpForNext(xp){ const l=levelFromXp(xp); return l*100 - (xp||0); }

  function getLocalCoins(){ return parseInt(localStorage.getItem('syro_coins')||'0'); }
  function getLocalInv(){ try{ return JSON.parse(localStorage.getItem('syro_inv')||'[]'); }catch(e){ return []; } }
  function getLocalEq(){ try{ return JSON.parse(localStorage.getItem('syro_eq')||'{}'); }catch(e){ return {}; } }

  function renderHeader(){
    const el = document.getElementById('syroUserBadge');
    if(!el) return;
    if(!user && !profile){
      const xp = parseInt(localStorage.getItem('syro_xp')||'0');
      const pseudo = localStorage.getItem('syro_pseudo')||genPseudo();
      if(!localStorage.getItem('syro_pseudo')) localStorage.setItem('syro_pseudo', pseudo);
      if(!localStorage.getItem('syro_coins')) localStorage.setItem('syro_coins','0');
      const lvl=levelFromXp(xp), next=xpForNext(xp);
      const coins=getLocalCoins();
      el.innerHTML = `<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>Lv${lvl} • ${xp} XP • ${coins}🪙</small></span>`;
      el.title='Invité — crée un compte pour garder ton XP';
      renderShopHeader();
      return;
    }
    const xp = profile ? profile.xp : 0;
    const coins = profile ? (profile.coins||0) : getLocalCoins();
    const lvl = profile ? profile.level : levelFromXp(xp);
    const pseudo = profile ? profile.pseudo : (user?.email?.split('@')[0]||'Joueur');
    el.innerHTML = `<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>Lv${lvl} • ${xp} XP • ${coins}🪙</small></span>`;
    el.title = user ? (user.email||pseudo) : '';
    renderShopHeader();
    applyEquipped();
    renderDashboard();
    // Hero : si connecté on le cache complètement (dashboard à la place)
    const hero = document.getElementById('screen-hero');
    const dash = document.getElementById('screen-dashboard');
    if(user && profile){
      // on ne fait rien ici, showScreen gère; juste préparer le hero CTA pour le cas où on y repasse
    }
  }
  function renderShopHeader(){
    const coins = profile ? (profile.coins||0) : getLocalCoins();
    const el = document.getElementById('shopCoinsBadge');
    if(el) el.textContent = coins + ' 🪙';
  }
  function applyEquipped(){
    const eq = profile ? (profile.equipped||{}) : getLocalEq();
    document.documentElement.dataset.pawnSkin = eq.pawn || 'pawn_classic';
    document.documentElement.dataset.boardSkin = eq.board || 'board_classic';
    document.documentElement.dataset.diceSkin = eq.dice || 'dice_classic';
    document.documentElement.dataset.soundPack = eq.sound || 'sound_pop';
    try{ localStorage.setItem('syro_skin_pawn', eq.pawn||'pawn_classic'); }catch(e){}
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
    if(p){ profile=p; if(!p.inventory) profile.inventory=[]; if(!p.equipped) profile.equipped={}; return p; }
    const pseudo = (u.user_metadata && u.user_metadata.pseudo) || u.email.split('@')[0] || genPseudo();
    const xp = parseInt(localStorage.getItem('syro_xp')||'0');
    const coins = parseInt(localStorage.getItem('syro_coins')||'0');
    const inv = getLocalInv();
    const eq = getLocalEq();
    const lvl = levelFromXp(xp);
    const ins = { id: u.id, pseudo, xp, level: lvl, email: u.email, coins, inventory: inv, equipped: eq };
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
    const guestBtn = document.getElementById('btnGuestContinue');
    const orSep = document.getElementById('authOrSep');
    const welcomeHint = document.querySelector('#screen-auth .hint');
    if(form) form.classList.toggle('hidden', isLogged);
    if(tabs) tabs.classList.toggle('hidden', isLogged);
    if(guestBtn) guestBtn.classList.toggle('hidden', isLogged);
    if(orSep) orSep.classList.toggle('hidden', isLogged);
    if(welcomeHint && isLogged) welcomeHint.classList.add('hidden');
    else if(welcomeHint) welcomeHint.classList.remove('hidden');
    if(connected) connected.classList.toggle('hidden', !isLogged);
    if(isLogged && info){
      info.innerHTML = `Connecté en tant que <b>${profile.pseudo}</b> (${user.email||'—'})<br><span style="color:var(--accent)">Lv${profile.level} • ${profile.xp} XP • ${profile.coins||0} 🪙</span> — ton XP est sauvegardé.`;
    }
  }
  function renderDashboard(){
    const isLogged = !!(user && profile);
    const dashName = document.getElementById('dashName');
    const dashSub = document.getElementById('dashSub');
    const dashFill = document.getElementById('dashXpFill');
    const dashNext = document.getElementById('dashXpNext');
    const dPlayed = document.getElementById('dashStatPlayed');
    const dWon = document.getElementById('dashStatWon');
    const dCoins = document.getElementById('dashStatCoins');
    const dShopHint = document.getElementById('dashShopHint');
    if(!dashName) return;
    if(isLogged){
      const xp=profile.xp||0; const coins=profile.coins||0; const lvl=profile.level||levelFromXp(xp);
      const next = xpForNext(xp); const pct = Math.round(((100-next)/100)*100);
      dashName.textContent = `Bienvenue, ${profile.pseudo} 👋`;
      dashSub.textContent = `Lv${lvl} • ${xp} XP • ${coins} 🪙 — prêt à jouer ?`;
      if(dashFill) dashFill.style.width = pct + '%';
      if(dashNext) dashNext.textContent = `+${next} XP pour Lv${lvl+1}`;
      if(dPlayed) dPlayed.textContent = profile.games_played||0;
      if(dWon) dWon.textContent = profile.games_won||0;
      if(dCoins) dCoins.textContent = coins + ' 🪙';
      if(dShopHint) dShopHint.textContent = coins + ' 🪙';
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
        if(!localStorage.getItem('syro_coins')) localStorage.setItem('syro_coins','0');
        if(!localStorage.getItem('syro_inv')) localStorage.setItem('syro_inv', JSON.stringify(['pawn_classic','board_classic','dice_classic','sound_pop']));
        if(!localStorage.getItem('syro_eq')) localStorage.setItem('syro_eq', JSON.stringify({pawn:'pawn_classic', board:'board_classic', dice:'dice_classic', sound:'sound_pop'}));
      }
      renderHeader(); renderAuthState();
      applyEquipped(); renderDashboard();
      readyCbs.forEach(cb=>cb(user,profile));
      supa.auth.onAuthStateChange(async (ev, sess)=>{
        if(sess && sess.user){
          user=sess.user;
          try{ profile=await ensureProfile(user); }catch(e){}
          if(profile){ localStorage.setItem('syro_pseudo', profile.pseudo); localStorage.setItem('syro_xp', profile.xp); }
          renderHeader(); renderAuthState(); applyEquipped();
        } else if(ev==='SIGNED_OUT'){
          user=null; profile=null;
          renderHeader(); renderAuthState(); applyEquipped();
        }
      });
      if(user){
        supa.channel('profiles_'+user.id)
          .on('postgres_changes', {event:'*', schema:'public', table:'profiles', filter:`id=eq.${user.id}`}, (payload)=>{
            if(payload.new){ profile=payload.new; localStorage.setItem('syro_xp', profile.xp); renderHeader(); renderAuthState(); applyEquipped(); }
          }).subscribe();
      }
    }catch(e){
      console.warn('Supabase init fail', e);
      renderHeader(); renderAuthState(); applyEquipped();
    }
  }
  function friendlyError(e){
    const m=(e&&e.message)||''; const c=(e&&e.code)||'';
    if(m.includes('already registered')||m.includes('already exists')||c==='user_already_exists') return 'Cet email a déjà un compte → clique Se connecter';
    if(m.includes('Invalid login')) return 'Email ou mot de passe incorrect';
    if(m.includes('Email not confirmed')) return 'Confirme ton email (vérifie tes spams) ou reconnecte-toi';
    if(m.includes('weak_password')) return 'Mot de passe trop faible (6 car. min)';
    if(m.includes('invalid_email')) return 'Email invalide';
    return m || 'Erreur';
  }
  async function addXp(amount, reason){
    const coinsGain = Math.floor(amount/2);
    const isGuest = !user;
    if(isGuest){
      let xp = parseInt(localStorage.getItem('syro_xp')||'0')+amount;
      let coins = getLocalCoins()+coinsGain;
      localStorage.setItem('syro_xp', xp);
      localStorage.setItem('syro_coins', coins);
      if(!profile) profile={pseudo:localStorage.getItem('syro_pseudo'), xp, level:levelFromXp(xp), coins};
      else { profile.xp=xp; profile.level=levelFromXp(xp); profile.coins=coins; }
      renderHeader(); return;
    }
    try{
      const newXp = (profile.xp||0)+amount;
      const newCoins = (profile.coins||0)+coinsGain;
      const newLvl = levelFromXp(newXp);
      const { error } = await supa.from('profiles').update({ xp: newXp, coins: newCoins, level: newLvl, games_played: (profile.games_played||0)+1 }).eq('id', user.id);
      if(error) throw error;
      await supa.from('xp_events').insert({ user_id: user.id, amount, reason: reason||'' });
      profile.xp=newXp; profile.coins=newCoins; profile.level=newLvl;
      localStorage.setItem('syro_xp', newXp);
      renderHeader();
    }catch(e){ console.warn('addXp fail', e); }
  }
  async function addWin(isWin){
    if(!user){ let c=getLocalCoins()+(isWin?20:5); localStorage.setItem('syro_coins', c); renderHeader(); return; }
    try{
      const upd={ games_played:(profile.games_played||0)+1, games_won:(profile.games_won||0)+(isWin?1:0), coins:(profile.coins||0)+(isWin?20:5) };
      await supa.from('profiles').update(upd).eq('id', user.id);
      Object.assign(profile, upd);
      renderHeader();
    }catch(e){}
  }
  async function getLeaderboard(limit=20){
    await ensureSupa();
    const { data, error } = await supa.from('profiles').select('pseudo,xp,level,coins,games_won,games_played').order('xp', {ascending:false}).limit(limit);
    if(error) throw error;
    return data;
  }
  async function buyItem(itemId){
    const item = SHOP_CATALOG.find(x=>x.id===itemId);
    if(!item) throw new Error('Item inconnu');
    let coins = profile ? (profile.coins||0) : getLocalCoins();
    let inv = profile ? (profile.inventory||[]) : getLocalInv();
    if(inv.includes(itemId)) throw new Error('Déjà possédé');
    if(coins < item.price) throw new Error('Pas assez de 🪙 — joue pour en gagner !');
    coins -= item.price;
    inv = [...inv, itemId];
    if(!user){
      localStorage.setItem('syro_coins', coins);
      localStorage.setItem('syro_inv', JSON.stringify(inv));
      if(profile) { profile.coins=coins; profile.inventory=inv; }
      renderHeader(); return {coins, inv};
    }
    const { error } = await supa.from('profiles').update({ coins, inventory: inv }).eq('id', user.id);
    if(error) throw error;
    profile.coins=coins; profile.inventory=inv;
    renderHeader(); return {coins, inv};
  }
  async function equipItem(itemId){
    const item = SHOP_CATALOG.find(x=>x.id===itemId);
    if(!item) throw new Error('Item inconnu');
    const catKey = item.cat==='pion'?'pawn': item.cat==='plateau'?'board': item.cat==='de'?'dice':'sound';
    let eq = profile ? (profile.equipped||{}) : getLocalEq();
    eq[catKey]=itemId;
    if(!user){
      localStorage.setItem('syro_eq', JSON.stringify(eq));
      if(profile) profile.equipped=eq;
      applyEquipped(); renderHeader(); return eq;
    }
    const { error } = await supa.from('profiles').update({ equipped: eq }).eq('id', user.id);
    if(error) throw error;
    profile.equipped=eq;
    applyEquipped(); renderHeader(); return eq;
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
      if(guestXp > (profile.xp||0)) await addXp(guestXp - (profile.xp||0), 'migration invité → compte');
    } else throw new Error('Vérifie ton email pour confirmer');
    renderHeader(); renderAuthState(); applyEquipped(); return data;
  }
  async function signInEmail(email,password){
    await ensureSupa();
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if(error) throw error;
    user=data.user; profile=await ensureProfile(user);
    renderHeader(); renderAuthState(); applyEquipped(); return data;
  }
  async function signOut(){
    if(supa) await supa.auth.signOut();
    localStorage.removeItem('syro_pseudo'); localStorage.removeItem('syro_xp');
    user=null; profile=null; renderHeader(); renderAuthState(); applyEquipped();
  }
  function onReady(cb){ if(user||profile) cb(user,profile); else readyCbs.push(cb); }
  return { init, onReady, addXp, addWin, getLeaderboard, buyItem, equipItem, SHOP_CATALOG, signInEmail, signUpEmail, signOut, levelFromXp, getUser:()=>user, getProfile:()=>profile, renderHeader, renderShopHeader, renderDashboard, friendlyError, ensureSupa, getCoins:()=> profile ? (profile.coins||0) : getLocalCoins(), getInv:()=> profile ? (profile.inventory||[]) : getLocalInv(), getEq:()=> profile ? (profile.equipped||{}) : getLocalEq() };
})();
