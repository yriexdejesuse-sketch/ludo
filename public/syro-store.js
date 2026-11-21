/* SYRO GAMES — Apparences Thématiques v2026-12-01 */
'use strict';
window.SyroAuth = (function(){
  const SHOP_CATALOG = [
    // CLASSIQUE
    {id:'pawn_classic', cat:'pion', name:'Classique', price:0, preview:'🔴', desc:'Style d’origine'},
    {id:'board_classic', cat:'plateau', name:'Classique', price:0, preview:'🟫', desc:'Bois Ludo traditionnel'},
    {id:'dice_classic', cat:'de', name:'Ivoire', price:0, preview:'🎲', desc:'Dés classiques'},
    {id:'sound_pop', cat:'son', name:'Pop', price:0, preview:'🔊', desc:'Sons rebondissants'},
    // FOOT
    {id:'pawn_foot', cat:'pion', name:'Ballon Foot', price:0, preview:'⚽', desc:'Ballon aux couleurs de ton équipe'},
    {id:'board_foot', cat:'plateau', name:'Stade', price:0, preview:'🏟️', desc:'Pelouse + tribunes + stars'},
    {id:'dice_foot', cat:'de', name:'Carton Foot', price:0, preview:'🟨', desc:'Dés style carton jaune/rouge'},
    {id:'sound_foot', cat:'son', name:'Stade', price:0, preview:'📣', desc:'Clameur du public'},
    // MUSIQUE
    {id:'pawn_music', cat:'pion', name:'Note', price:0, preview:'🎵', desc:'Note colorée'},
    {id:'board_music', cat:'plateau', name:'Scène', price:0, preview:'🎤', desc:'Scène concert + notes'},
    {id:'dice_music', cat:'de', name:'Vinyle', price:0, preview:'💿', desc:'Dés vinyle'},
    {id:'sound_music', cat:'son', name:'Mélodie', price:0, preview:'🎹', desc:'Hit musical'},
    // AFRO
    {id:'pawn_afro', cat:'pion', name:'Masque Afro', price:0, preview:'🎭', desc:'Masque traditionnel'},
    {id:'board_afro', cat:'plateau', name:'Savane Kente', price:0, preview:'🦁', desc:'Wax + savane'},
    {id:'dice_afro', cat:'de', name:'Djembé', price:0, preview:'🥁', desc:'Dés peau de tambour'},
    {id:'sound_afro', cat:'son', name:'Percus', price:0, preview:'🪘', desc:'Tams-tams africains'},
    // GAMING
    {id:'pawn_gaming', cat:'pion', name:'Manette', price:0, preview:'🎮', desc:'Manette néon'},
    {id:'board_gaming', cat:'plateau', name:'Arcade Néon', price:0, preview:'👾', desc:'Grille néon pixel'},
    {id:'dice_gaming', cat:'de', name:'Pixel', price:0, preview:'👾', desc:'Dés pixels 8-bit'},
    {id:'sound_gaming', cat:'son', name:'Arcade', price:0, preview:'🔔', desc:'Bips rétro'},
    // ANIMÉ
    {id:'pawn_anime', cat:'pion', name:'Chibi', price:0, preview:'😺', desc:'Tête chibi kawaii'},
    {id:'board_anime', cat:'plateau', name:'Manga', price:0, preview:'⛩️', desc:'Sakura + torii'},
    {id:'dice_anime', cat:'de', name:'Manga', price:0, preview:'🌸', desc:'Dés sakura'},
    {id:'sound_anime', cat:'son', name:'Kawaii', price:0, preview:'✨', desc:'Pop manga'},
    // BONUS conservés
    {id:'pawn_neon', cat:'pion', name:'Néon Pulse', price:0, preview:'💎', desc:'Aura néon'},
    {id:'pawn_gold', cat:'pion', name:'Or Royal', price:0, preview:'👑', desc:'Couronne dorée'},
    {id:'sound_tom', cat:'son', name:'Tom Scream', price:0, preview:'😾', desc:'Cri de Tom'},
  ];
  function getInv(){ try{ return JSON.parse(localStorage.getItem('syro_inv')||'[]'); }catch(e){ return []; } }
  function getEq(){ try{ return JSON.parse(localStorage.getItem('syro_eq')||'{}'); }catch(e){ return {}; } }
  function renderHeader(){}
  function renderDashboard(){
    const dn=document.getElementById('dashName'); const ds=document.getElementById('dashSub');
    if(!dn) return; dn.textContent='Bienvenue 👋'; if(ds) ds.textContent='Choisis ton mode et joue direct !';
  }
  function applyEquipped(){
    const eq=getEq();
    document.documentElement.dataset.pawnSkin = eq.pawn || 'pawn_classic';
    document.documentElement.dataset.boardSkin = eq.board || 'board_classic';
    document.documentElement.dataset.diceSkin = eq.dice || 'dice_classic';
    document.documentElement.dataset.soundPack = eq.sound || 'sound_pop';
  }
  function init(){
    if(!localStorage.getItem('syro_inv')) localStorage.setItem('syro_inv', JSON.stringify(SHOP_CATALOG.map(x=>x.id)));
    if(!localStorage.getItem('syro_eq')) localStorage.setItem('syro_eq', JSON.stringify({pawn:'pawn_classic', board:'board_classic', dice:'dice_classic', sound:'sound_pop'}));
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
  function addXp(){} function addWin(){} function getCoins(){ return 0; }
  function getLeaderboard(){ return Promise.resolve([]); }
  function buyItem(id){ return Promise.resolve(equipItem(id)); }
  return { init, renderHeader, renderDashboard, equipItem, SHOP_CATALOG, getEq, getInv, getCoins, addXp, addWin, getLeaderboard, buyItem, getUser:()=>null, getProfile:()=>null, getPseudo:()=>'', setPseudo:()=>{}, friendlyError:(e)=>e.message||'Erreur' };
})();
