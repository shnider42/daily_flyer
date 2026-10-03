/* One result announcement per battle. Replay finishes before showing the result. */
'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.id='battleResultDialog';dialog.setAttribute('aria-labelledby','battleResultTitle');
 dialog.innerHTML='<p class="eyebrow">BATTLE COMPLETE</p><h2 id="battleResultTitle"></h2><p id="battleResultArmies"></p><p id="battleResultReason"></p><p id="battleResultProgress"></p><div class="result-actions"><button id="resultReview">Review battlefield</button><button id="resultRematch">Play again</button><button id="resultJourney" hidden>Continue WWII Journey</button><button id="resultHome">Back to operations</button></div>';
 document.body.append(dialog);
 const reopen=document.createElement('button');reopen.type='button';reopen.id='showBattleResult';reopen.textContent='View battle result';$('battleReport').append(reopen);
 const seen=new Set();
 const key=()=>`${session?.code}:${state?.battle_number||1}:${state?.winner}`;
 function fill(){
  const won=state.winner===state.side;
  dialog.dataset.result=won?'victory':'defeat';
  $('battleResultTitle').textContent=won?'Victory':'Defeat';
  $('battleResultArmies').textContent=`${sideLabel(state.winner)} won ${state.scenario.name} · Round ${state.battle_result?.round||Math.min(state.round,state.scenario.rounds)}.`;
  $('battleResultReason').textContent=state.resigned_by?(state.resigned_by===state.side?'You resigned this battle.':'Your opponent resigned this battle.'):(state.battle_result?.reason||'The battle has ended. Review the mission and final battlefield.');
  $('battleResultProgress').textContent=ww2Briefing.mission({...state,round:Math.min(state.round,state.scenario.rounds)}).progress;
  $('resultRematch').textContent=state.ai_side?'Play again':'Propose next battle';$('resultRematch').disabled=!!state.rematch||busy;
  $('resultJourney').hidden=!window.ww2Journey?.isCurrent();
 }
 function open(){
  if(!state?.winner||busy||playbackSession||$('game').hidden||lobbyMode)return;
  fill();for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
  if(!dialog.open)dialog.showModal();
  seen.add(key());try{sessionStorage.setItem('ww2-result:'+key(),'seen');}catch{}
 }
 $('resultReview').onclick=()=>dialog.close();
 $('resultRematch').onclick=()=>{dialog.close();$('rematchButton').click();};
 $('resultHome').onclick=()=>{dialog.close();$('leave').click();};
 $('resultJourney').onclick=()=>{dialog.close();window.ww2Journey?.open();};
 reopen.onclick=open;
 function sync(){
  if(!state?.winner||$('game').hidden||lobbyMode){dialog.close();return;}
  if(playbackSession){dialog.close();return;}
  if(dialog.open){fill();return;}
  let shown=seen.has(key());try{shown=shown||sessionStorage.getItem('ww2-result:'+key())==='seen';}catch{}
  if(!shown)open();
 }
 let timer;const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,0);};
 for(const event of ['ww2:render','ww2:playback'])document.addEventListener(event,schedule);
 new MutationObserver(schedule).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 window.ww2Result={open};
})();
