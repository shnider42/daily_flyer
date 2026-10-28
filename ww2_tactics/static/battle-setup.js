/* Creation settings follow the selected operation's actual faction names. */
'use strict';
(()=>{
 const assignmentNote=document.createElement('p');assignmentNote.id='armyAssignment';$('battleOptions').append(assignmentNote);
 const presentations=[];
 for(const [dialogId,prefix] of [['soloDialog','solo'],['namedGameDialog','multiplayer'],['rematchDialog','rematch']]){
  const panel=document.createElement('section');panel.className='experience-control setup-experience';
  const label=document.createElement('label'),select=document.createElement('select'),note=document.createElement('p'),guide=document.createElement('p');
  select.id=prefix+'Experience';select.dataset.experienceSelect='';label.htmlFor=select.id;label.textContent='Your guidance';
  for(const level of ['simple','moderate','expert'])select.add(new Option(ww2Experience.describe(level).label,level));
  note.id=prefix+'ExperienceNote';note.dataset.experienceNote='';select.setAttribute('aria-describedby',note.id);
  guide.id=prefix+'SetupGuide';guide.className='setup-guide';panel.append(label,select,note);
  // Creation handlers update the existing h2 + p introduction in place.
  // Keep that adjacency while adding the presentation controls after it.
  ($(dialogId).querySelector('h2 + p')||$(dialogId).querySelector('h2')).after(panel,guide);presentations.push({select,note,guide,prefix});
 }
 const recovery=document.createElement('p');recovery.id='battleRecoveryHelp';$('battleOptions').querySelector('summary').after(recovery);
 const rematchNotice=$('rematchDialog').querySelector('h2 ~ p:not(.setup-guide)');
 const labels=id=>operationById($(id).value)?.factions||{us:'Americans',de:operationSource(operationById($(id).value))==='midway'?'Japanese':'Germans'};
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
  for(const {select,note,guide,prefix} of presentations){
   select.value=ww2Experience.level;note.textContent=ww2Experience.describe().summary;
   const board=operationById($(prefix==='solo'?'soloScenario':prefix==='rematch'?'rematchScenario':'scenarioSelect').value);
   const facts=board?`${board.width} × ${board.height} hexes · ${board.rounds} rounds.`:'';
   guide.textContent=prefix==='solo'?ww2Experience.pick('Choose a battlefield and your army, then start. Read the mission goal before moving your first unit.',`Choose the army whose role you want to practice. ${facts} The first-turn order is shown below.`,`${facts} Review the scenario briefing and army assignment before starting.`):prefix==='rematch'?(state?.ai_side?ww2Experience.pick('Choose the next battlefield and whether to swap armies. Start next battle begins the new solo game.',`${facts} A solo rematch starts directly. An unfinished battle is replaced without awarding a win.`,`${facts} These settings start a new solo battle directly; there is no second player’s acceptance.`):ww2Experience.pick('Choose the next battlefield and whether to swap armies. Your opponent gets a proposal to accept.',`${facts} Proposing a new battle does not start it. Your opponent must accept; an unfinished battle is then replaced without a win.`,`${facts} The next battle uses these settings only after both commanders agree.`)):coop?ww2Experience.pick('Name the game and choose how much each player commands. Friends pick a place in either army before the host starts.', 'Unit or platoon control changes each player’s responsibility. Unclaimed groups can use computer commanders; their difficulty is a separate setting from Experience.', 'Review command size and default computer difficulty. Assignments and per-group difficulty can be checked in the cooperative lobby before starting.'):ww2Experience.pick('Give the game a name, choose your army, and create an invitation for a friend.',`${facts} Choose armies yourself, assign them randomly, or use a recorded coin flip. The game name will be public.`,`${facts} Review the public lobby name, assignment method and first-turn army before creating the game.`);
  }
  rematchNotice.textContent=state?.ai_side?'The next solo battle starts directly. An unfinished battle is replaced without awarding a win.':'Your opponent must accept. An unfinished battle will be abandoned without awarding a win.';
  recovery.textContent=ww2Experience.pick('Confirmed orders save automatically. MOVE continues this battle on another device. SAVE keeps a separate checkpoint.', 'MOVE reconnects the same live seat. Loading a SAVE creates an independent battle at that checkpoint; later moves in either copy stay separate.', 'Confirmed orders are persisted automatically. MOVE restores access to the live seat; SAVE restores an independent checkpoint with its saved rules and history.');
  $('transferButton').textContent=ww2Experience.level==='simple'?'Continue on another device':'Continue on another device · MOVE';
  $('saveButton').textContent=ww2Experience.level==='simple'?'Save a checkpoint':'Create a checkpoint · SAVE';
 }
 for(const id of ['multiplayerMode','soloScenario','soloSide','rematchScenario','scenarioSelect','teamAssignment','multiplayerSide'])$(id).addEventListener('change',sync);
 for(const id of ['soloDialog','namedGameDialog','rematchDialog'])new MutationObserver(sync).observe($(id),{attributes:true,attributeFilter:['open']});
 document.addEventListener('ww2:preview',sync);
 document.addEventListener('ww2:experience',sync);
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
