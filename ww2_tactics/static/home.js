/* Home presentation follows lobby visibility; battle state remains owned by game.js. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const lobby=document.getElementById('lobby');
 function syncHome(){
  document.body.classList.toggle('home-screen',!lobby.hidden);
  if(!lobby.hidden)document.title='DSL · Tactical Command';
 }
 function syncPreview(){
  const board=scenarios.find(s=>s.id===document.getElementById('scenarioSelect').value);
  if(!board)return;
  document.getElementById('homeTheater').textContent=board.id==='midway'?'PACIFIC':'EUROPE';
  document.getElementById('homeMapSize').textContent=`${board.width} × ${board.height} HEXES`;
 }
 if(new URLSearchParams(location.search).get('join'))document.getElementById('joinOptions').open=true;
 new MutationObserver(syncHome).observe(lobby,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('ww2:preview',syncPreview);
 syncHome();syncPreview();
});
