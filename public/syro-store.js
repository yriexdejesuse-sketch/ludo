/* SYRO GAMES — Local Store (sans compte) v2026-11-23 */
'use strict';
window.SyroAuth = (function(){
  const SHOP_CATALOG = [
    {id:'pawn_classic', cat:'pion', name:'Classique', price:0, preview:'🔴', desc:'Style d’origine'},
    {id:'pawn_neon', cat:'pion', name:'Néon Pulse', price:0, preview:'💎', desc:'Aura néon animée'},
    {id:'pawn_gold', cat:'pion', name:'Or Royal', price:0, preview:'👑', desc:'Pions dorés + brillance'},
    {id:'pawn_emoji', cat:'pion', name:'Emoji Fun', price:0, preview:'😎', desc:'Têtes emoji'},
    {id:'pawn_fire', cat:'pion', name:'Feu Infernal', price:0, preview:'🔥', desc:'Traînée de feu'},
    {id:'board_classic', cat:'plateau', name:'Bois Classique', price:0, preview:'🪵', desc:'Plateau chaleureux'},
    {id:'board_neon', cat:'plateau', name:'Neon Night', price:0, preview:'🌃', desc:'Thème nuit néon'},
    {id:'board_savanna', cat:'plateau', name:'Savane', price:0, preview:'🦁', desc:'Tons sable — comme Afrique'},
    {id:'board_ocean', cat:'plateau', name:'Ocean', price:0, preview:'🌊', desc:'Bleus profonds'},
    {id:'board_sunset', cat:'plateau', name:'Sunset', price:0, preview:'🌅', desc:'Coucher de soleil africain'},
    {id:'dice_classic', cat:'de', name:'Dés Ivoire', price:0, preview:'🎲', desc:'Classique'},
    {id:'dice_crystal', cat:'de', name:'Cristal', price:0, preview:'🔮', desc:'Dés translucides'},
    {id:'dice_gold', cat:'de', name:'Dés Or', price:0, preview:'✨', desc:'Dés dorés premium'},
    {id:'sound_pop', cat:'son', name:'Pop Fun', price:0, preview:'🔊', desc:'Sons rebondissants'},
    {id:'sound_tom', cat:'son', name:'Tom Scream', price:0, preview:'😾', desc:'Cri de Tom quand on le mange !'},
    {id:'sound_drum', cat:'son', name:'Tambour Africain', price:0, preview:'🥁', desc:'Percussions'},
  ];
  function genPseudo(){ return 'Joueur_' + Math.floor(1000+Math.random()*9000); }
  function getPseudo(){ return localStorage.getItem('syro_pseudo') || (localStorage.setItem('syro_pseudo', genPseudo()), localStorage.getItem('syro_pseudo')); }
  function setPseudo(v){ v=String(v||'').trim().slice(0,16) || genPseudo(); localStorage.setItem('syro_pseudo', v); renderHeader(); renderDashboard(); return v; }
  function getInv(){ try{ return JSON.parse(localStorage.getItem('syro_inv')||'[]'); }catch(e){ return []; } }
  function getEq(){ try{ return JSON.parse(localStorage.getItem('syro_eq')||'{}'); }catch(e){ return {}; } }
  function renderHeader(){
    const el=document.getElementById('syroUserBadge'); if(!el) return;
    const pseudo=getPseudo();
    el.innerHTML=`<span class="u-ava">🎮</span><span class="u-txt"><b>${pseudo}</b><small>SYRO GAMES</small></span>`;
    el.title='Changer de pseudo';
    const hp=document.getElementById('heroPseudo'); if(hp) hp.textContent=pseudo;
    applyEquipped();
  }
  function renderDashboard(){
    const dn=document.getElementById('dashName'); const ds=document.getElementById('dashSub');
    if(!dn) return;
    const pseudo=getPseudo();
    dn.textContent=`Bienvenue, ${pseudo} 👋`;
    if(ds) ds.textContent='Prêt à jouer ? Choisis ton mode !';
  }
  function applyEquipped(){
    const eq=getEq();
    document.documentElement.dataset.pawnSkin = eq.pawn || 'pawn_classic';
    document.documentElement.dataset.boardSkin = eq.board || 'board_classic';
    document.documentElement.dataset.diceSkin = eq.dice || 'dice_classic';
    document.documentElement.dataset.soundPack = eq.sound || 'sound_pop';
  }
  function init(){
    if(!localStorage.getItem('syro_pseudo')) localStorage.setItem('syro_pseudo', genPseudo());
    if(!localStorage.getItem('syro_inv')) localStorage.setItem('syro_inv', JSON.stringify(SHOP_CATALOG.map(x=>x.id)));
    if(!localStorage.getItem('syro_eq')) localStorage.setItem('syro_eq', JSON.stringify({pawn:'pawn_classic', board:'board_classic', dice:'dice_classic', sound:'sound_tom'}));
    renderHeader(); renderDashboard(); applyEquipped();
  }
  function equipItem(id){
    const item=SHOP_CATALOG.find(x=>x.id===id); if(!item) throw new Error('Item inconnu');
    const catKey=item.cat==='pion'?'pawn': item.cat==='plateau'?'board': item.cat==='de'?'dice':'sound';
    const eq=getEq(); eq[catKey]=id;
    localStorage.setItem('syro_eq', JSON.stringify(eq));
    applyEquipped(); renderHeader();
    return eq;
  }
  // compat: ancien code appelait addXp, addWin, etc. -> no-op
  function addXp(){}
  function addWin(){}
  function getCoins(){ return 0; }
  function getInv2(){ return getInv(); }
  function getLeaderboard(){ return Promise.resolve([]); }
  function buyItem(id){ return Promise.resolve(equipItem(id)); }
  return { init, renderHeader, renderDashboard, equipItem, SHOP_CATALOG, getEq, getInv:getInv2, getCoins, addXp, addWin, getLeaderboard, buyItem, getUser:()=>null, getProfile:()=>({pseudo:getPseudo()}), setPseudo, getPseudo, friendlyError:(e)=>e.message||'Erreur' };
})();
