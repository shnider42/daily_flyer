/* A skills journey, not a historical campaign or shared multiplayer save. */
'use strict';
(()=>{
 const chapters=[
  ['village','Your first command','Choose units, move, attack and hold an objective.'],
  ['orchard','Use your infantry tools','Cover, smoke, suppression, rally and overwatch.'],
  ['stonebridge','Cross under pressure','Roads, bottlenecks and preserving actions for combat.'],
  ['riverfront','Command a platoon','Coordinate groups, officers and several approaches.'],
  ['relay_crossing','See, report and supply','Observe, share dated contacts, fire mortars and deliver finite supplies.'],
  ['kharkov','Fight for control','Armor, ammunition, engineers and weighted control points.'],
  ['shingle_cove','Prepare a landing','Private deployment, bunkers, blind naval fire and loaded boats.'],
  ['dunkirk','Get them home','Hold the rearguard while boats evacuate marked infantry.'],
  ['iron_lantern','Call the airborne reserve','Drop scatter, Flak, Pathfinder beacons and vulnerable arrivals.'],
  ['tidal_gate','Connect the fronts','Engineering, transport, linked objectives and reinforcements.'],
  ['midway','Command the fleet','Carrier search, escorts, torpedoes, bombardment and sea control.'],
  ['britain','Take to the air','Flight paths, interception, radar, bombing and airfield service.'],
  ['fubar','Bring it all together','Air and surface layers, combined support and three control zones.'],
  ['breakwater','Plan a larger operation','Apply the full landing plan across a wider defended coast.']
 ];
 const storage='ww2-journey-v1';let progress={};
 try{const value=JSON.parse(localStorage.getItem(storage));if(value&&typeof value==='object')for(const [id,p] of Object.entries(value))if(chapters.some(c=>c[0]===id)&&p&&typeof p.code==='string'&&['started','victory','defeat'].includes(p.status))progress[id]=p;}catch{}
 const persist=()=>{try{localStorage.setItem(storage,JSON.stringify(progress));}catch{}};
 const dialog=document.createElement('dialog');dialog.id='journeyDialog';dialog.setAttribute('aria-labelledby','journeyTitle');
 dialog.innerHTML='<button id="journeyClose" class="dialog-back">Back</button><p class="eyebrow">LEARN THROUGH OPERATIONS</p><h2 id="journeyTitle">WWII Journey</h2><p>Build your command skills through fourteen operations. Start at the beginning, resume a chapter or jump to a topic. These are fictional tactical exercises, not a chronology of the war.</p><div class="journey-settings"><div><label for="journeyExperience">Your Experience</label><select id="journeyExperience"><option value="simple">Simple</option><option value="moderate">Moderate</option><option value="expert">Expert</option></select></div><div><label for="journeySide">Your army in new chapters</label><select id="journeySide"><option value="us">Allied side</option><option value="de">Axis side</option></select></div></div><p id="journeyNote"></p><p>Each chapter starts a separate solo battle with Field coach ready. Progress is saved on this browser. Wins and defeats both let you continue; you can revisit any chapter.</p><p id="journeyStatus" role="status"></p><ol id="journeyChapters"></ol>';
 document.body.append(dialog);
 const shortcut=document.createElement('button');shortcut.id='journeyFromBattle';shortcut.textContent='WWII Journey';$('guideToggle').after(shortcut);
 const available=id=>savedSessions.find(s=>s.code===progress[id]?.code);
 const current=()=>chapters.find(c=>progress[c[0]]?.code===session?.code&&progress[c[0]]?.battle===(state?.battle_number||1));
 const descriptions={simple:'Start with the basics, one action at a time. Field coach explains terms and shows where to tap.',moderate:'You know board games. Field coach concentrates on DSL choices and introduces the details as you need them.',expert:'Focus on exact costs, thresholds, interactions and tactical tradeoffs. Skip basic board-game explanations.'};
 function paint(){
  $('journeyExperience').value=ww2Experience.level;$('journeyNote').textContent=descriptions[ww2Experience.level];
  const complete=Object.values(progress).filter(p=>p.status!=='started').length;
  $('journeyStatus').textContent=`${complete} / ${chapters.length} chapters played to a result`;
  $('journeyChapters').replaceChildren(...chapters.map(([id,title,focus],index)=>{
   const row=document.createElement('li');row.className='journey-chapter';row.dataset.chapter=id;
   const number=document.createElement('span');number.className='journey-number';number.textContent=String(index+1).padStart(2,'0');
   const copy=document.createElement('div'),heading=document.createElement('h3'),text=document.createElement('p'),status=document.createElement('small'),button=document.createElement('button');
   heading.textContent=title;text.textContent=focus;
   const saved=progress[id],map=scenarios.find(s=>s.id===id),seat=available(id);
   status.textContent=`${map?.name||id.replaceAll('_',' ')}${saved?` · ${saved.status==='started'?'In progress':saved.status==='victory'?'Victory recorded':'Defeat reviewed'}${saved.side?` · ${map?.factions?.[saved.side]||(saved.side==='us'?'Allied':'Axis')}`:''}`:''}`;
   button.type='button';button.textContent=seat&&saved.status==='started'?'Resume chapter':saved?'Play chapter again':'Start chapter';button.onclick=()=>launch(id,seat&&saved.status==='started'?seat:null);button.disabled=busy;
   copy.append(heading,text,status);row.append(number,copy,button);return row;
  }));
 }
 async function launch(id,seat){
  const side=$('journeySide').value;dialog.close();
  await run(async()=>{
   if(seat){const next=await apiWithSession(seat);remember(seat);state=next;}
   else{
    remember(await api('/api/match',{ruleset:'dsl',opponent:'computer',scenario:id,side}));
    state=await apiWithSession(session);
    progress[id]={code:session.code,battle:state.battle_number||1,status:'started',side:state.side};persist();
   }
   render();
  });
  if(progress[id]?.code===session?.code&&state)ww2Learning.open();
 }
 function open(){
  if(busy||playbackSession){notify('Finish or skip the replay before opening WWII Journey.');return;}
  for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();paint();if(!dialog.open)dialog.showModal();
 }
 $('journeyClose').onclick=()=>dialog.close();$('journeyExperience').onchange=()=>{ww2Experience.set($('journeyExperience').value);paint();};
 $('learnStart').onclick=open;shortcut.onclick=open;
 document.querySelector('.home-learn').hidden=false;
 document.addEventListener('ww2:render',()=>{const chapter=current();if(chapter&&state.winner){const p=progress[chapter[0]],status=state.winner===state.side?'victory':'defeat';if(p.status!==status){p.status=status;persist();}}});
 document.addEventListener('ww2:experience',()=>{if(dialog.open)paint();});
 window.ww2Journey={open,isCurrent:()=>!!current(),chapters};
})();
