/* Home presentation follows lobby visibility; battle state remains owned by game.js. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const lobby=document.getElementById('lobby');
 const operation=document.querySelector('.home-operation'),directory=$('multiplayerLobby');
 directory.before(operation);
 directory.before($('savedSessions'));
 let motion=true;
 try{motion=localStorage.getItem('ww2-home-motion')!=='off';}catch{}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function syncMotion(){const on=motion&&!reduced.matches;document.body.classList.toggle('home-motion',on&&!document.hidden&&!lobby.hidden);$('homeMotionToggle').textContent=reduced.matches?'Motion off · system preference':`Ambient motion: ${on?'on':'off'}`;$('homeMotionToggle').setAttribute('aria-pressed',String(on));$('homeMotionToggle').disabled=reduced.matches;}
 $('homeMotionToggle').onclick=()=>{motion=!motion;try{localStorage.setItem('ww2-home-motion',motion?'on':'off');}catch{}syncMotion();};
 document.addEventListener('visibilitychange',syncMotion);reduced.addEventListener('change',syncMotion);
 function syncHome(){
  document.body.classList.toggle('home-screen',!lobby.hidden);
  if(!lobby.hidden)document.title='DSL · Tactical Command';
  syncMotion();
 }
 function syncPreview(){
  const board=operationById(document.getElementById('scenarioSelect').value);
  if(!board)return;
  document.getElementById('homeTheater').textContent=board.theater||(operationSource(board)==='midway'?'PACIFIC':'WESTERN EUROPE');
  document.getElementById('homeMapSize').textContent=`${board.width} × ${board.height} HEXES`;
  $('operationTitle').textContent=board.name;
  $('operationSummary').textContent=board.summary||(board.naval?'Fleet combat · island landings':board.combined_arms?'Combined arms · fog of war':board.platoons?'Three platoons · a wider battlefield':'Infantry · close-quarters tactics');
  const factions=board.factions||(board.naval?{us:'Americans',de:'Japanese'}:{us:'Americans',de:'Germans'});
  $('operationFactions').textContent=`${factions.us} vs ${factions.de} · ${board.rounds} rounds${board.playtest?' · PLAYTEST':''}`;
  $('playtestNote').hidden=!board.playtest;
  $('playtestNote').textContent=board.historical_note||'Experimental aircraft rules. No altitude, fuel or facing yet. This is a fictional tactical layout, not a historical simulation.';
  document.querySelector('.home-map-footer span:last-child').textContent=board.joint_ops?(board.joint_score_target?`★ ${board.joint_objectives.length} CONTROL ZONES`:'★ THREE CONTROL ZONES'):board.linked_objectives?'★ TOWN + EITHER EXIT':board.air?'RAF STATION DEFENSE':'★ OBJECTIVE';
  document.querySelector('.home-operation').dataset.theater=operationSource(board);
 }
 if(new URLSearchParams(location.search).get('join'))document.getElementById('joinOptions').open=true;
 new MutationObserver(syncHome).observe(lobby,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('ww2:preview',syncPreview);
 syncHome();syncPreview();
});
