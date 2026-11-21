/* SYRO GAMES — Local Store (sans compte, sans pseudo) v2026-11-28 */
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
  function getInv(){ try{ return JSON.parse(localStorage.getItem('syro_inv')||'[]'); }catch(e){ return []; } }
  function getEq(){ try{ return JSON.parse(localStorage.getItem('syro_eq')||'{}'); }catch(e){ return {}; } }
  function renderHeader(){} // no-op sans compte
  function renderDashboard(){
    const dn=document.getElementById('dashName'); const ds=document.getElementById('dashSub');
    if(!dn) return;
    dn.textContent='Bienvenue 👋';
    if(ds) ds.textContent='Choisis ton mode et joue direct !';
  }
  function applyEquipped(){
    const eq=getEq();
    document.documentElement.dataset.pawnSkin = eq.pawn || 'pawn_classic';
    document.documentElement.dataset.boardSkin = eq.board || 'board_classic';
    document.documentElement.dataset.diceSkin = eq.dice || 'dice_classic';
    document.documentElement.dataset.soundPack = eq.sound || 'sound_tom';
  }
  function init(){
    if(!localStorage.getItem('syro_inv')) localStorage.setItem('syro_inv', JSON.stringify(SHOP_CATALOG.map(x=>x.id)));
    if(!localStorage.getItem('syro_eq')) localStorage.setItem('syro_eq', JSON.stringify({pawn:'pawn_classic', board:'board_classic', dice:'dice_classic', sound:'sound_tom'}));
    try{ localStorage.removeItem('syro_pseudo'); localStorage.removeItem('syro_xp'); }catch(e){}
    renderDashboard(); applyEquipped();
  }
  function equipItem(id){
    const item=SHOP_CATALOG.find(x=>x.id===id); if(!item) throw new Error('Item inconnu');
    const catKey=item.cat==='pion'?'pawn': item.cat==='plateau'?'board': item.cat==='de'?'dice':'sound';
    const eq=getEq(); eq[catKey]=id;
    localStorage.setItem('syro_eq', JSON.stringify(eq));
    applyEquipped();
    return eq;
  }
  function addXp(){}
  function addWin(){}
  function getCoins(){ return 0; }
  function getLeaderboard(){ return Promise.resolve([]); }
  function buyItem(id){ return Promise.resolve(equipItem(id)); }
  return { init, renderHeader, renderDashboard, equipItem, SHOP_CATALOG, getEq, getInv, getCoins, addXp, addWin, getLeaderboard, buyItem, getUser:()=>null, getProfile:()=>null, getPseudo:()=>'', setPseudo:()=>{}, friendlyError:(e)=>e.message||'Erreur' };
})();
