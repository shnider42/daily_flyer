/* Experimental desktop presentation. Reparent the real controls: no copied
   order handlers, legality calculation, enemy queries or game-state changes. */
'use strict';
(()=>{
 let screen=null,anchors=[],dialogs=[],portraitKey='',noticeKey='',capacityKey='',capacity=0;
 const el=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 const setText=(n,text)=>{if(n.textContent!==text)n.textContent=text;};
 function move(n,to){if(typeof n==='string')n=document.querySelector(n);if(!n)return;const a=document.createComment('experimental desktop anchor');n.before(a);anchors.push([n,a]);to.append(n);}
 function open(id){
  if(!screen)return;
  if(playbackSession){playbackSession.paused=true;clearTimeout(playbackTimer);$('pausePlayback').textContent='Resume';}
  for(const d of document.querySelectorAll('dialog[open]'))if(d.id!==id)d.close();
  const d=$(id);if(d&&!d.open)d.showModal();
 }
 function sheet(id,title){
  const d=el('dialog',id);d.className='experimental-sheet';d.setAttribute('aria-labelledby',id+'Title');
  const head=el('div');head.className='experimental-sheet-heading';const close=el('button',id+'Close','Back to map');close.type='button';close.onclick=()=>d.close();
  head.append(el('h2',id+'Title',title),close);d.append(head);document.body.append(d);dialogs.push(d);return d;
 }
 function button(id,label,dialog){const b=el('button',id,label);b.type='button';b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls',dialog);b.onclick=()=>open(dialog);return b;}
 function mount(){
  document.body.classList.add('experimental-desktop');ww2Desktop.refreshPreferences();
  screen=el('section','experimentalDesktopScreen');screen.setAttribute('aria-label','Experimental desktop battle');$('game').append(screen);
  const top=el('header','experimentalDesktopTop'),turn=el('div','experimentalTurn');move('#turnBanner',turn);turn.append(el('span','experimentalRound'));
  top.append(button('experimentalRosterOpen','Units','experimentalRoster'),turn);move('.mission',top);
  top.append(button('experimentalBattleOpen','Battle','experimentalBattle'));move('#desktopViewMenu',top);screen.append(top);
  const field=el('section','experimentalField');field.setAttribute('aria-label','Battlefield');move('#mapWrap',field);move('.map-tools',field);
  const notice=button('experimentalNotice','Battle report','experimentalBattle');notice.hidden=true;field.append(notice);screen.append(field);
  const dock=el('section','experimentalCommandBar');dock.setAttribute('aria-label','Selected unit and orders');
  const unit=el('div','experimentalUnit'),inspect=button('experimentalUnitOpen','Select a unit','experimentalUnitDetails');inspect.dataset.help='Open unit status, role, weapon details and target odds.';unit.append(inspect);move('#hint',unit);dock.append(unit);move('#orders',dock);
  const navigation=el('div','experimentalNavigation');move('#orderHistory',navigation);move('#desktopActionDock',navigation);dock.append(navigation);screen.append(dock);
  move('#playbackPanel',screen);
  const roster=sheet('experimentalRoster','Your units');move('.desktop-forces',roster);
  const details=sheet('experimentalUnitDetails','Unit details');
  for(const id of ['selection','unitPurpose','roleBrief','unitMechanics','odds'])move('#'+id,details);
  details.append(el('p','experimentalRecipients'));
  const battle=sheet('experimentalBattle','Battle & reports');
  for(const selector of ['.game-title','.status-line','#waiting','#battleReport','#rematchProposal','#incoming','#signalNotice','#airliftReport','#simpleOutcome','#combat','#replayTurn','#computerReview','#supportStatus','#battleOptions','#seriesScore','#homeBattles','#rulesButton','#missionHint','.team-legend','.terrain-legend','.journal'])move(selector,battle);
  // Selection redraws the roster, detaching the clicked button. Close before
  // that redraw; the existing chooseUnit handler already reveals the unit.
  roster.addEventListener('click',e=>{if(e.target.closest('#roster button'))roster.close();},true);
  portraitKey=noticeKey=capacityKey='';
 }
 function unmount(){
  if(!screen)return;
  for(const d of dialogs)d.close();
  for(const [n,a] of anchors)a.replaceWith(n);anchors=[];
  for(const d of dialogs)d.remove();dialogs=[];screen.remove();screen=null;
  document.body.classList.remove('experimental-desktop');
  ww2Desktop.refreshPreferences();
 }
 function sync(){
  const eligible=window.ww2Desktop?.active&&ww2ViewMode.mode==='experimental'&&state?.ruleset==='dsl'&&!$('game').hidden&&!lobbyMode;
  if(!eligible){unmount();return;}
  if(!screen)mount();
  const playing=!!playbackSession,own=state.units.filter(u=>u.side===state.side),unit=own.find(u=>u.id===selected&&u.hp>0),dad=!!window.ww2Dad?.enabled;
  screen.classList.toggle('experimental-replaying',playing);
  const stamp=[state.code,state.battle_number,...own.map(u=>u.id+':'+u.kind)].join('|');
  if(capacityKey!==stamp){capacityKey=stamp;capacity=Math.max(0,...own.map(u=>unitOrderCapabilities(u).length));}
  // Capacity is reserved for the army, never the selected unit. Switching from
  // infantry to an engineer or commander must not move the map's lower edge.
  const columns=innerWidth>=1600?8:6,rows=Math.max(1,Math.ceil(capacity/columns));
  for(const [name,value] of [['--experimental-columns',columns],['--experimental-rows',rows]])if(screen.style.getPropertyValue(name)!==String(value))screen.style.setProperty(name,String(value));
  setText($('experimentalRosterOpen'),`Units · ${own.filter(u=>u.hp>0).length}`);$('experimentalRosterOpen').disabled=playing||busy;
  setText($('experimentalRound'),`Round ${state.round}/${state.scenario.rounds}`);
  const phase=ww2Briefing.phase(state);$('experimentalTurn').dataset.phase=phase.id;
  const inspect=$('experimentalUnitOpen'),key=[unit?.id,unit?.kind,unit?.display_name,unit?.hp,unit?.ap,unit?.pinned,unit?.immobilized,unit?.ammo,unit?.reserve,unit?.carrier_id,target,dad].join('|');
  if(key!==portraitKey){
   portraitKey=key;inspect.replaceChildren();
   if(unit){const portrait=window.makeUnitPortrait?.(unit);if(portrait)inspect.append(portrait);const text=el('span'),name=el('strong',null,unitTypeName(unit)),meta=el('span',null,`${unit.platoon?unit.platoon+unit.number+' · ':''}${unit.hp}${unit.max_hp?'/'+unit.max_hp:''} ${state.naval_version&&unit.kind!=='amphibious'?'hull':'strength'} · ${unit.ap} AP${unit.pinned?' · PINNED':''}${unit.immobilized?' · TRACKS DISABLED':''}${unit.ammo?' · '+unit.ammo.toUpperCase():''}${unit.reserve?' · RESERVE':''}${unit.carrier_id?' · ABOARD':''}`);text.append(name,meta,el('small',null,'Unit details ›'));inspect.append(text);inspect.dataset.unitId=unit.id;}
   else{inspect.append(el('strong',null,'Select a unit'),el('span',null,'On the map or in Units'));delete inspect.dataset.unitId;}
  }
  inspect.disabled=!unit||playing||busy;
  setText($('experimentalRecipients'),$('commandOrders').querySelector('p')?.textContent||'');
  const alerts=['incoming','signalNotice','airliftReport','simpleOutcome'].map(id=>$(id)).filter(n=>!n.hidden&&n.textContent.trim());
  const alert=alerts.map(n=>n.textContent.trim()).join(' · '),notice=$('experimentalNotice');notice.hidden=!alert||playing;setText(notice,alert.length>150?alert.slice(0,147)+'…':alert);notice.setAttribute('aria-label',alert+'. Open battle reports.');
  const change=[state.code,state.battle_number,state.ready,state.winner,JSON.stringify(state.rematch)].join('|');
  if(!playing&&change!==noticeKey){noticeKey=change;if(!state.ready||state.winner||state.rematch)open('experimentalBattle');}
  if(playing)for(const d of dialogs)d.close();
 }
 window.ww2ExperimentalDesktop={get active(){return !!screen;},openContaining(n){const d=n?.closest('.experimental-sheet');if(d){open(d.id);return true;}if(n?.closest('#desktopViewMenu')){$('desktopViewMenu').open=true;return true;}return false;}};
 for(const event of ['ww2:render','ww2:playback','ww2:layout','ww2:dad-mode','ww2:busy'])document.addEventListener(event,sync);
 document.addEventListener('ww2:before-layout',unmount);
 window.addEventListener('resize',()=>{if(screen)sync();});
 new MutationObserver(()=>{if($('game').hidden)unmount();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
})();
