/* Creation settings follow the selected operation's actual faction names. */
'use strict';
(()=>{
 const assignmentNote=document.createElement('p');assignmentNote.id='armyAssignment';$('battleOptions').append(assignmentNote);
 const labels=id=>scenarios.find(s=>s.id===$(id).value)?.factions||{us:'Americans',de:$(id).value==='midway'?'Japanese':'Germans'};
 function fill(select,armies){const value=select.value||'us';select.replaceChildren(...['us','de'].map(id=>new Option(armies[id],id)));select.value=value;}
 function sync(){
  const solo=labels('soloScenario'),multi=labels('scenarioSelect');
  fill($('soloSide'),solo);fill($('multiplayerSide'),multi);
  $('soloArmyHelp').textContent=`You command ${solo[$('soloSide').value]}; the computer commands ${solo[$('soloSide').value==='us'?'de':'us']}. ${solo.us} take the first turn. If that is the computer, its opening turn resolves before yours.`;
  const coop=$('multiplayerMode').value==='cooperative';
  $('cooperativeCreation').hidden=!coop;
  $('teamAssignment').hidden=coop;document.querySelector('label[for=teamAssignment]').hidden=coop;
  $('namedGameHelp').textContent=coop?'Players choose either army and a command group. Unclaimed groups become computers when the host starts.':'This name and both commander names will be visible in the multiplayer lobby. Anyone can join the open opponent seat.';
  const method=coop?'selected':$('teamAssignment').value;
  $('multiplayerArmyChoice').hidden=method!=='selected';
  $('teamAssignmentHelp').textContent=method==='coin_flip'?`One server coin toss: Heads gives you ${multi.us}; Tails gives you ${multi.de}. Your friend receives the other army. The recorded result stays with this battle.`:method==='random'?'The server assigns each army with an equal chance when you create the game. Your friend receives the other army.':`You command ${multi[$('multiplayerSide').value]}; your friend commands ${multi[$('multiplayerSide').value==='us'?'de':'us']}.`;
 }
 for(const id of ['multiplayerMode','soloScenario','soloSide','scenarioSelect','teamAssignment','multiplayerSide'])$(id).addEventListener('change',sync);
 for(const id of ['soloDialog','namedGameDialog'])new MutationObserver(sync).observe($(id),{attributes:true,attributeFilter:['open']});
 document.addEventListener('ww2:preview',sync);
 window.ww2BattleSetup={sync,multiplayer(){return $('multiplayerMode').value==='cooperative'?{opponent:'cooperative',control_size:$('coopControlSize').value,difficulty:$('coopDefaultDifficulty').value,side:$('multiplayerSide').value}:{team_assignment:$('teamAssignment').value,side:$('multiplayerSide').value};}};
 document.addEventListener('ww2:render',()=>{
  if(!state)return;if(state.coop){assignmentNote.hidden=true;return;}
  const other=state.side==='us'?'de':'us',assignment=state.team_assignment;
  const result=assignment?.method==='coin_flip'?`Coin flip: ${assignment.coin==='heads'?'Heads':'Tails'}. `:assignment?.method==='random'?'Armies assigned randomly. ':'';
  assignmentNote.hidden=!assignment;assignmentNote.textContent=assignment?`${result}The creator received ${sideLabel(assignment.creator_side)}. You command ${sideLabel(state.side)}; ${sideLabel('us')} take the first combat turn.`:'';
  $('waiting').querySelector('h2').textContent=`Waiting for the ${sideLabel(other)} commander.`;
  $('waiting').querySelector('p').textContent=`${result}You command ${sideLabel(state.side)}. Share this invitation for your friend to command ${sideLabel(other)}.`;
 });
 sync();
})();
