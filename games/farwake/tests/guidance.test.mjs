import test from 'node:test';
import assert from 'node:assert/strict';
import {GuidanceController,GUIDANCE_ACTIONS,GUIDANCE_LIMIT,GUIDANCE_VERSION,GUIDANCE_LEVELS,guidancePolicy,guidanceProgress,guidanceProfileKey} from '../dist/guidance.mjs';

const ship=(extra={})=>({playing:true,mode:'ship',device:'keyboard',systemId:'home',vesselId:'cinder',ship:{speed:25},...extra});
const person=(extra={})=>({playing:true,mode:'person',device:'keyboard',systemId:'home',locationId:'port',vesselId:'cinder',person:{health:100},...extra});
let serial=0;
function success(guide,action,ctx,n=1){for(let i=0;i<n;i++)assert.equal(guide.record({action,id:`actual-use-${++serial}`,success:true},ctx),true);}
function flew(guide,ctx=ship(),n=1){for(const action of ['flight-thrust','flight-turn','flight-strafe','flight-brake'])success(guide,action,ctx,n);}
function walked(guide,ctx=person(),n=1){success(guide,'person-move',ctx,n);}

test('first departure teaches thrust and turn; an imminent dock then outranks advanced strafe',()=>{
  const guide=new GuidanceController(),ctx=ship({docking:{id:'haven',name:'Haven',inRange:true,speed:90}});
  assert.equal(guide.update(ctx).successAction,'flight-thrust');
  for(let n=0;n<30;n++)guide.update(ctx);
  assert.equal(guide.count('flight-thrust'),0,'rendering time is not a successful use');
  success(guide,'flight-thrust',ctx);
  assert.equal(guide.update(ctx).successAction,'flight-turn');
  success(guide,'flight-turn',ctx);
  const slow=guide.update(ctx);assert.equal(slow.id,'dock:slow');assert.equal(slow.controlTarget,'brakeButton');
  assert.equal(guide.update({...ctx,docking:{...ctx.docking,speed:10}}).id,'dock');
  assert.equal(guide.count('dock'),0,'slowing beside a port is not docking');
});

test('two distinct successful rounds teach flight and then stop automatic flight prompts',()=>{
  const guide=new GuidanceController(),ctx=ship();
  for(let round=1;round<=2;round++)for(const action of ['flight-thrust','flight-turn','flight-strafe','flight-brake']){
    const prompt=guide.update(ctx);assert.equal(prompt.successAction,action);assert.equal(prompt.attempt,round);
    assert.equal(prompt.repeated,round===2);success(guide,action,ctx);
  }
  assert.equal(guide.update(ctx),null);
  assert.equal(guide.exportState().flows.flight.keyboard.complete,true);
  assert.equal(guide.record({action:'flight-thrust',id:'third-use',success:true},ctx),false);
  assert.equal(guide.count('flight-thrust',ctx),GUIDANCE_LIMIT);
});

test('only confirmed local successes with distinct IDs count, including across input changes',()=>{
  const guide=new GuidanceController({profileId:'captain-a'}),ctx=ship({profileId:'captain-a'});
  for(const event of [
    {action:'dock',id:'failed',success:false},{action:'dock',id:'pending'},
    {action:'dock',success:true},{action:'unknown',id:'unknown',success:true},
    {action:'dock',id:'remote',success:true,local:false},
    {action:'dock',id:'wrong-profile',success:true,profileId:'captain-b'},
    {action:'dock',id:'wrong-scope',success:true,testMode:true}
  ])assert.equal(guide.record(event,ctx),false);
  assert.equal(guide.record({action:'dock',id:'docked-1',ok:true},ctx),true);
  assert.equal(guide.record({action:'dock',id:'docked-1',success:true},ctx),false);
  assert.equal(guide.record({action:'dock',id:'docked-1',success:true},{...ctx,device:'touch'}),false,'one authoritative arrival cannot count twice after switching layout');
  assert.equal(guide.count('dock'),1);
});

test('desktop and touch learn their real control layouts independently without resetting semantic progress',()=>{
  const guide=new GuidanceController(),keyboard=ship(),touch=ship({device:'touch'});
  flew(guide,keyboard,2);success(guide,'dock',keyboard,2);
  assert.equal(guide.update(keyboard),null);
  const prompt=guide.update(touch);assert.equal(prompt.successAction,'flight-thrust');assert.match(prompt.body,/left flight stick/);assert.match(prompt.body,/drifting/);
  assert.equal(guide.count('dock',touch),2);
  success(guide,'flight-thrust',touch);success(guide,'flight-turn',touch);
  const strafe=guide.update(touch);assert.equal(strafe.successAction,'flight-strafe');assert.equal(strafe.controlTarget,'aimStick');assert.match(strafe.body,/right stick.*left or right/);assert.doesNotMatch(strafe.body,/fires|shoots/);
  const mirrored=guide.update({...touch,leftHanded:true});assert.match(mirrored.body,/left stick.*left or right/);assert.equal(mirrored.completed,0);
  success(guide,'flight-strafe',touch);
  const brake=guide.update({...touch,ship:{speed:25,heavy:true}});assert.match(brake.body,/BRAKE/);assert.match(brake.body,/larger hull/);assert.equal(brake.controlTarget,'brakeButton');
  assert.equal(guide.count('flight-thrust',keyboard),2);
});

test('first docking explains approach, inertia, and the visible action; a second arrival rearms only after departure',()=>{
  const guide=new GuidanceController(),base=ship({intent:'dock',device:'touch',docking:{id:'haven',name:'Haven',inRange:false,speed:70}});flew(guide,base,2);
  assert.equal(guide.update(base).id,'dock:approach');
  const near={...base,docking:{...base.docking,inRange:true}};
  assert.equal(guide.update(near).id,'dock:slow');
  const slow={...near,docking:{...near.docking,speed:8}};
  assert.match(guide.update(slow).body,/Tap DOCK/);success(guide,'dock',slow);
  guide.update(person({device:'touch',locationId:'haven'}));
  assert.equal(guide.update(slow),null,'launching from the same port does not demand redocking');
  guide.update(base);const second=guide.update(slow);assert.equal(second.successAction,'dock');assert.equal(second.attempt,2);
  success(guide,'dock',slow);guide.update(base);assert.equal(guide.update(slow),null);
});

test('first person-mode arrival teaches walking before NPC or job-board instructions',()=>{
  const guide=new GuidanceController(),ctx=person({nearby:{type:'npc',id:'mara',name:'Mara',controlLabel:'TALK'},device:'touch'});
  assert.equal(guide.update(ctx).successAction,'person-move');
  assert.match(guide.update(ctx).body,/left WALK stick/);
  success(guide,'person-move',ctx);
  const talk=guide.update(ctx);assert.equal(talk.successAction,'person-use');assert.match(talk.body,/Tap TALK/);assert.equal(talk.controlTarget,'contextButton');
  success(guide,'person-use',ctx);
  assert.equal(guide.update(ctx).successAction,'person-move','the same completed conversation does not keep taking the cue');
  const next={...ctx,nearby:{type:'npc',id:'sol',name:'Sol',controlLabel:'Talk · Sol'}};
  const second=guide.update(next);assert.equal(second.successAction,'person-use');assert.equal(second.attempt,2);assert.match(second.body,/Tap Talk · Sol/);
  success(guide,'person-use',next);success(guide,'person-move',ctx);
  assert.equal(guide.update({...ctx,nearby:{type:'npc',id:'third',name:'Another local'}}),null);
});

test('planet landing and station docking copy matches the actual context button label',()=>{
  const guide=new GuidanceController(),ctx=ship({device:'touch',docking:{id:'morrow',name:'Morrow',inRange:true,speed:3},nearby:{type:'dock',id:'morrow',name:'Morrow',controlLabel:'Land'}});flew(guide,ctx,2);
  const land=guide.update(ctx);assert.match(land.body,/Tap Land to land/);assert.match(land.title,/Land on Morrow/);assert.doesNotMatch(land.body,/Tap DOCK/);
  const dock=guide.update({...ctx,docking:{...ctx.docking,id:'kettle',name:'Kettle'},nearby:{...ctx.nearby,id:'kettle',name:'Kettle',controlLabel:'Dock'}});assert.match(dock.body,/Tap Dock to dock/);
  flew(guide,ship(),2);assert.match(guide.update({...ctx,device:'keyboard'}).body,/Press E to land/);
});

test('jobs advance through accept, real work and turn-in, and never reopen a finished relay',()=>{
  const guide=new GuidanceController(),ctx=person();walked(guide,ctx,2);
  const board={...ctx,nearby:{type:'jobboard',id:'exchange'},job:{id:'repair-contract',nearBoard:true}};
  assert.equal(guide.update(board).successAction,'job-accept');
  assert.match(guide.update({...board,dialogKind:'jobs'}).body,/Accept/);success(guide,'job-accept',board);
  const relay={...ctx,nearby:{type:'work',id:'relay-1',name:'Power relay'},job:{id:'repair-contract',accepted:true,nearWork:true}};
  assert.equal(guide.update(relay).id,'work');
  assert.match(guide.update({...relay,dialogKind:'repair'}).body,/reference arrow.*Reconnect relay/);
  success(guide,'work',relay);
  const completed={...relay,nearby:{...relay.nearby,completed:true},job:{...relay.job,workCompleted:true}};
  const next=guide.update(completed);assert.equal(next.id,'work:approach');assert.equal(next.controlTarget,'stick');assert.match(next.body,/finished relays do not need repeating/);
  const relay2={...relay,nearby:{...relay.nearby,id:'relay-2'}};
  assert.equal(guide.update(relay2).attempt,2);success(guide,'work',relay2);
  const ready={...ctx,job:{id:'repair-contract',accepted:true,ready:true}};
  assert.equal(guide.update(ready).id,'job-turn-in:approach');
  assert.equal(guide.update({...ready,job:{...ready.job,nearBoard:true}}).id,'job-turn-in:use');
  const confirm={...board,job:{...board.job,accepted:true,ready:true},dialogKind:'jobs'};
  assert.equal(guide.update(confirm).id,'job-turn-in:confirm');assert.equal(guide.count('job-turn-in'),0);
  success(guide,'job-turn-in',confirm);assert.equal(guide.count('job-turn-in'),1);
});

test('mining teaches a held beam and salvage teaches collection without inventing ore success',()=>{
  const guide=new GuidanceController(),ctx=ship({device:'touch',intent:'mining',mining:{id:'rock-1',inRange:false,holdFull:false}});flew(guide,ctx,2);
  assert.equal(guide.update(ctx).id,'mine:approach');
  const close={...ctx,mining:{...ctx.mining,inRange:true}};
  assert.match(guide.update(close).body,/Hold MINE/);assert.equal(guide.count('mine'),0);
  success(guide,'mine',close);assert.equal(guide.update(close),null);
  const next={...close,mining:{...close.mining,id:'rock-2'}};assert.equal(guide.update(next).attempt,2);success(guide,'mine',next);
  assert.equal(guide.update({...close,mining:{...close.mining,id:'rock-3'}}),null);
  const salvage={...ctx,intent:null,mining:null,nearby:{type:'salvage',id:'scrap'}};
  assert.equal(guide.update(salvage).successAction,'salvage');assert.match(guide.update(salvage).body,/COLLECT/);
  assert.equal(guide.count('salvage'),0);
  assert.equal(guide.update({...ctx,mining:{...ctx.mining,inRange:true,holdFull:true}}),null);
});

test('a visible hostile prioritizes firing over first flight drills, incidental ore and salvage',()=>{
  const guide=new GuidanceController(),ctx=ship({device:'touch',ship:{speed:10,threat:true},mining:{id:'near-rock',inRange:true,holdFull:false},nearby:{type:'salvage',id:'near-scrap'}});
  const fire=guide.update(ctx);assert.equal(fire.successAction,'ship-fire');assert.equal(fire.controlTarget,'fireButton');assert.match(fire.body,/press FIRE/);
  assert.equal(guide.update({...ctx,docking:{id:'haven',name:'Haven',inRange:true,speed:3}}).successAction,'dock','the available escape interaction keeps its contextual priority');
  assert.equal(guide.update({...ctx,ship:{...ctx.ship,threat:false}}).successAction,'flight-thrust','quiet flight resumes learning after danger');
});

test('accepted non-work contracts never send the player looking for relay work, while ready contracts still get turn-in help',()=>{
  const guide=new GuidanceController(),ctx=person();walked(guide,ctx,2);
  for(const type of ['mining','delivery','survey','bounty']){
    const job={id:type+'-contract',type,accepted:true,ready:false};
    assert.equal(guide.update({...ctx,job}),null,`${type} does not require an unfinished workstation`);
    assert.equal(guide.update({...ctx,job:{...job,ready:true}}).successAction,'job-turn-in');
  }
  const freelance=guide.update({...ctx,job:{id:'ore-contract',type:'mining',accepted:true},nearby:{id:'relay',type:'work'}});
  assert.equal(freelance.id,'work','an actual nearby unfinished relay still offers optional local work');
});

test('person combat teaches visible equipment, independent aim, explicit fire and actual hits twice',()=>{
  const guide=new GuidanceController(),ctx=person({locationId:'enemy-deck',combat:{active:true,ready:true,targetVisible:true}});walked(guide,ctx,2);
  for(let round=1;round<=2;round++){
    const aim=guide.update(ctx);assert.equal(aim.successAction,'person-aim');assert.match(aim.body,/equipped weapon/);assert.match(aim.body,/mouse.*arrow key/);assert.equal(aim.attempt,round);success(guide,'person-aim',ctx);
    const fire=guide.update(ctx);assert.equal(fire.successAction,'person-fire');assert.match(fire.body,/Space or left-click/);assert.match(fire.body,/READY/);success(guide,'person-fire',ctx);
    const hit=guide.update(ctx);assert.equal(hit.successAction,'person-hit');assert.match(hit.body,/damage number.*DOWN/);assert.equal(guide.count('person-hit',ctx),round-1,'a fired shot is not a confirmed hit');success(guide,'person-hit',ctx);
  }
  assert.equal(guide.update(ctx),null);
});

test('combat replaces obsolete aiming tips with line-of-sight guidance and clears when the fight ends',()=>{
  const guide=new GuidanceController(),ctx=person({device:'touch',boarding:{id:'target',kind:'assault',phase:'active',canReturn:true},combat:{active:true,targetVisible:true}});walked(guide,ctx,2);
  assert.match(guide.update(ctx).body,/right AIM stick.*also fires/);
  const blocked=guide.update({...ctx,combat:{active:true,blocked:true}});assert.equal(blocked.id,'combat:clear-shot');assert.equal(blocked.controlTarget,'stick');assert.match(blocked.body,/stop at walls/);
  const won={...ctx,combat:{active:false},boarding:{...ctx.boarding,phase:'won',atAirlock:false,canTakeHelm:true}};
  assert.equal(guide.update(won).id,'return-airlock:approach');
  assert.doesNotMatch(guide.update(won).body,/Fire|AIM/);
  assert.equal(guide.update({...won,person:{health:0,down:true}}),null);
});

test('boarding uses a real eligible contact, and return and helm instructions respect physical permissions',()=>{
  const guide=new GuidanceController(),ctx=ship({intent:'boarding'});flew(guide,ctx,2);
  assert.equal(guide.update(ctx),null,'intent cannot invent a disabled ship');
  const target={...ctx,nearby:{type:'board',id:'raider',name:'Raider',hostile:true,disabled:true,inRange:false}};
  assert.equal(guide.update(target).id,'board-enemy:approach');
  const close={...target,nearby:{...target.nearby,inRange:true}};assert.equal(guide.update(close).id,'board-enemy');
  assert.equal(guide.update({...close,nearby:{...close.nearby,canBoard:false}}),null);
  assert.notEqual(guide.update({...close,nearby:{...close.nearby,disabled:false}})?.successAction,'board-enemy');
  success(guide,'board-enemy',close);
  const deck=person({device:'touch',locationId:'raider-deck',boarding:{id:'raider',kind:'assault',phase:'won',canReturn:true,canTakeHelm:true}});walked(guide,deck,2);
  assert.equal(guide.update(deck).id,'return-airlock:approach');
  const airlock={...deck,boarding:{...deck.boarding,atAirlock:true}};assert.match(guide.update(airlock).body,/Tap AIRLOCK/);
  const bridge={...deck,intent:'helm',boarding:{...deck.boarding,atHelm:true}};assert.equal(guide.update(bridge).id,'take-helm');assert.match(guide.update(bridge).body,/Tap USE HELM/);
  assert.notEqual(guide.update({...bridge,boarding:{...bridge.boarding,canTakeHelm:false}})?.successAction,'take-helm');
  assert.equal(guide.update({...deck,boarding:{...deck.boarding,canReturn:false,canTakeHelm:false}}),null);
});

test('an active assault permits an instructed retreat only through a reachable airlock, never taking the helm',()=>{
  const guide=new GuidanceController(),ctx=person({intent:'return',boarding:{id:'raider',kind:'assault',phase:'active',canReturn:true,atAirlock:false,canTakeHelm:true}});walked(guide,ctx,2);
  assert.equal(guide.update(ctx).id,'return-airlock:approach');
  assert.equal(guide.update({...ctx,boarding:{...ctx.boarding,atAirlock:true}}).id,'return-airlock');
  assert.notEqual(guide.update({...ctx,boarding:{...ctx.boarding,canReturn:false}})?.successAction,'return-airlock');
  assert.notEqual(guide.update({...ctx,intent:'helm',boarding:{...ctx.boarding,atHelm:true}})?.successAction,'take-helm');
});

test('quick helm guidance highlights the persistent shortcut and stops after two confirmed uses',()=>{
  for(const device of ['touch','keyboard']){
    const guide=new GuidanceController(),ctx=person({device,locationId:'own-ship',helm:{available:true,quick:true,near:false,label:'Take helm'}});walked(guide,ctx,2);
    const prompt=guide.update(ctx);assert.equal(prompt.successAction,'take-helm');assert.equal(prompt.controlTarget,'modePill');
    assert.deepEqual(prompt.action,{type:'highlight',target:'modePill'});
    assert.match(prompt.body,device==='touch'?/Tap Take helm at the top/:/Click Take helm at the top/);
    assert.match(prompt.body,/same ship.*current motion, crew, and damage/);assert.doesNotMatch(prompt.body,/walk to the bridge|Press E|USE HELM/i);
    for(let n=0;n<5;n++)guide.update(ctx);assert.equal(guide.count('take-helm'),0);
    assert.equal(guide.record({action:'take-helm',id:'unconfirmed'},ctx),false);
    success(guide,'take-helm',ctx);
    const next={...ctx,vesselId:'second-hull'};assert.equal(guide.update(next).attempt,2);
    success(guide,'take-helm',next);assert.equal(guide.count('take-helm'),2);
    assert.equal(guide.update({...next,vesselId:'third-hull'}),null);
  }
});

test('crew boarding requires actual permission and owner management never silently grants it',()=>{
  const guide=new GuidanceController(),ctx=ship({intent:'crew',shared:{id:'friend',name:'Lantern',ownerName:'Sol',permissionNeeded:true,canBoard:false,inRange:true}});flew(guide,ctx,2);
  const ask=guide.update(ctx);assert.equal(ask.successAction,'crew-permission');assert.match(ask.body,/Ask Sol/);assert.equal(ask.controlTarget,'onlineButton');
  assert.deepEqual(ask.action,{type:'highlight',target:'onlineButton'});
  const manage=guide.update({...ctx,shared:{...ctx.shared,canManageCrew:true}});assert.match(manage.body,/choose Allow aboard/);assert.match(manage.body,/Allow piloting is a separate choice/);
  const allowed={...ctx,shared:{...ctx.shared,permissionNeeded:false,canBoard:true,inRange:false}};
  assert.equal(guide.update(allowed).id,'board-friend:approach');
  assert.equal(guide.update({...allowed,shared:{...allowed.shared,inRange:true}}).id,'board-friend');
  assert.equal(guide.count('crew-permission'),0);assert.equal(guide.count('board-friend'),0);
});

test('touch crew guidance points visitors and owners to the persistent Crew button',()=>{
  const guide=new GuidanceController(),ctx=ship({device:'touch',intent:'crew',shared:{id:'friend',name:'Lantern',ownerName:'Sol',permissionNeeded:true,canBoard:false,inRange:true}});flew(guide,ctx,2);
  const ask=guide.update(ctx);assert.equal(ask.successAction,'crew-permission');assert.match(ask.body,/Open Crew to see the current access/);
  const manage=guide.update({...ctx,shared:{...ctx.shared,canManageCrew:true}});
  assert.match(manage.body,/Open Crew/);assert.match(manage.compactBody,/Crew → your friend/);
  assert.equal(guide.count('crew-permission'),0,'Reading the menu instructions never grants access.');
});

test('dismissal hides only the current tip; repeat restores it without credit or obsolete cross-mode instructions',()=>{
  const guide=new GuidanceController(),ctx=ship();
  const first=guide.update(ctx),before=guide.exportState();
  assert.equal(guide.dismiss(first.id),true);assert.equal(guide.update(ctx),null);assert.deepEqual(guide.exportState(),before);
  assert.equal(guide.repeat(ctx).id,first.id);assert.equal(guide.count('flight-thrust',ctx),0);
  success(guide,'flight-thrust',ctx);assert.equal(guide.update(ctx).id,'flight-turn');
  guide.dismiss();assert.equal(guide.update(ctx),null);
  const foot=person();assert.equal(guide.update(foot).id,'person-move');
  assert.equal(guide.repeat(foot).id,'person-move');assert.doesNotMatch(guide.repeat(foot).body,/thrust|nose/);
});

test('repeat can revisit a just-completed relevant control without causing an automatic third lesson',()=>{
  const guide=new GuidanceController(),ctx=ship();flew(guide,ctx,2);
  const help=guide.requestHelp(ctx);assert.equal(help.id,'flight-thrust');assert.equal(help.requested,true);
  guide.dismiss();assert.equal(guide.update(ctx),null);
  assert.equal(guide.repeat(ctx).id,'flight-thrust');assert.equal(guide.count('flight-thrust',ctx),2);
  guide.dismiss();assert.equal(guide.update(ctx),null);
});

test('dismissed keyboard guidance does not hide an unlearned touch layout after switching input',()=>{
  const guide=new GuidanceController(),ctx=ship();guide.update(ctx);guide.dismiss();
  assert.equal(guide.update(ctx),null);
  const touch=guide.update({...ctx,device:'touch'});assert.equal(touch.id,'flight-thrust');assert.match(touch.body,/left flight stick/);
  guide.dismiss();assert.equal(guide.update({...ctx,device:'mobile'}),null,'mobile aliases stay in the same touch episode');
  assert.equal(guide.count('flight-thrust',{device:'touch'}),0);
});

test('Moderate skips routine drills but gives full requested help without carrying it into another place or mode',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=ship();
  assert.equal(guide.update(ctx),null);
  const hint=guide.requestHelp(ctx);assert.equal(hint.requested,true);assert.match(hint.body,/Hold W.*momentum/);assert.equal(hint.body,hint.fullBody);assert.notEqual(hint.body,hint.compactBody);
  assert.equal(guide.update(person()),null);
  assert.equal(guide.requestHelp(person()).successAction,'person-move');
  guide.dismiss();assert.equal(guide.update(person()),null);
});

test('guidance settings change presentation immediately while preserving learned actions',()=>{
  const guide=new GuidanceController(),ctx=ship();success(guide,'flight-thrust',ctx);guide.update(ctx);
  assert.equal(guide.setMode('expert'),null);assert.equal(guide.requestHelp().successAction,'flight-turn');assert.equal(guide.repeat().requested,true);
  assert.equal(guide.setMode('moderate'),null);assert.equal(guide.requestHelp().successAction,'flight-turn');
  const simple=guide.setMode('simple');assert.equal(simple.successAction,'flight-turn');assert.equal(guide.count('flight-thrust',ctx),1);
  assert.equal(guide.update({...ctx,guidance:'expert'}),null);
});

test('paused, menu-blocked, incapacitated and nonplaying contexts never leave an actionable prompt visible',()=>{
  const guide=new GuidanceController();
  for(const ctx of [ship({blocked:true}),ship({paused:true}),ship({playing:false}),person({person:{health:0}}),person({person:{health:100,down:true}}),{mode:'menu'}]){
    guide.update(ship());assert.equal(guide.update(ctx),null);assert.equal(guide.prompt,null);
  }
  assert.equal(guide.count('flight-thrust'),0);
});

test('per-save and per-captain identities, restore and exported snapshots are isolated',()=>{
  const solo=guidanceProfileKey({seed:'voyage-a'}),other=guidanceProfileKey({seed:'voyage-b'}),a=guidanceProfileKey({realmId:'realm-a',captainId:'captain-a'}),b=guidanceProfileKey({realmId:'realm-a',captainId:'captain-b'}),anotherRealm=guidanceProfileKey({realmId:'realm-b',captainId:'captain-a'});
  assert.equal(new Set([solo,other,a,b,anotherRealm]).size,5);
  const guide=new GuidanceController({profileId:a}),ctx=ship({profileId:a});success(guide,'flight-thrust',ctx,2);success(guide,'dock',ctx);
  const saved=guide.exportState(),restored=new GuidanceController({profileId:a,state:saved});
  assert.equal(restored.count('flight-thrust',ctx),2);assert.equal(restored.count('dock',ctx),1);
  const stranger=new GuidanceController({profileId:b,state:saved});assert.equal(stranger.count('flight-thrust',ctx),0);assert.equal(stranger.count('dock',ctx),0);
  saved.controls.keyboard['flight-thrust']=0;saved.flows.flight.keyboard.complete=true;
  assert.equal(restored.count('flight-thrust',ctx),2);assert.equal(guide.count('flight-thrust',ctx),2);
  const exported=restored.exportState();exported.counts.dock=2;assert.equal(restored.count('dock'),1);
});

test('wrong-profile contexts cannot rearm interactions, change progress or overwrite the last usable context',()=>{
  const guide=new GuidanceController({profileId:'a'}),ctx=ship({profileId:'a',docking:{id:'haven',inRange:true,speed:5}});flew(guide,ctx,2);guide.update(ctx);success(guide,'dock',ctx);
  const before=guide.exportState(),revision=guide.revision;
  assert.equal(guide.update({...ctx,profileId:'b',docking:{id:'other',inRange:false}}),null);
  assert.equal(guide.record({action:'dock',id:'foreign',success:true},{...ctx,profileId:'b'}),false);
  assert.equal(guide.requestHelp({...ctx,profileId:'b'}),null);
  assert.deepEqual(guide.exportState(),before);assert.equal(guide.revision,revision);
  assert.equal(guide.update(ctx),null);
});

test('test mode can force practice guidance while normal Expert stays silent and its saved voyage stays intact',()=>{
  const normal=new GuidanceController({profileId:'same',mode:'expert',force:true}),ctx=ship();success(normal,'flight-thrust',ctx,2);
  const normalState=normal.exportState(),lab=new GuidanceController({profileId:'same',state:normalState,mode:'expert',testMode:true,force:true});
  assert.equal(normal.update(ctx),null);assert.equal(lab.count('flight-thrust',ctx),0,'scope mismatch discards normal learning');
  assert.equal(lab.update({...ctx,testMode:true}).id,'flight-thrust');
  success(lab,'flight-thrust',{...ctx,testMode:true});lab.resetProgress();
  assert.deepEqual(normal.exportState(),normalState);
  assert.equal(new GuidanceController({profileId:'same',state:lab.exportState()}).count('flight-thrust',ctx),0);
  assert.notEqual(guidanceProfileKey({testId:'exercise'}),guidanceProfileKey({seed:'exercise'}));
});

test('resetting one help flow leaves other learned tasks alone, and resetting all starts both layouts again',()=>{
  const guide=new GuidanceController(),ctx=ship();flew(guide,ctx,2);success(guide,'dock',ctx,2);walked(guide,person(),2);
  assert.equal(guide.resetProgress('missing'),false);assert.equal(guide.resetProgress('flight'),true);
  assert.equal(guide.update(ctx).id,'flight-thrust');assert.equal(guide.count('dock',ctx),2);assert.equal(guide.count('person-move',person()),2);
  assert.equal(guide.resetProgress(),true);assert.equal(guide.count('dock',ctx),0);assert.equal(guide.count('person-move',person()),0);
});

test('restoration clamps progress, ignores unknown actions and recomputes flow summaries from evidence',()=>{
  const raw={version:GUIDANCE_VERSION,profileId:'a',scope:'voyage',counts:{dock:99,work:-3,unknown:2},controls:{keyboard:{'flight-thrust':99,'flight-turn':-2},touch:{'flight-thrust':'1'}},flows:{flight:{keyboard:{complete:true}},lastUses:{unknown:{target:'x',needsExit:true}}},recent:['a','a',42]};
  const guide=new GuidanceController({profileId:'a',state:raw});assert.equal(guide.count('dock'),2);assert.equal(guide.count('work'),0);assert.equal(guide.count('flight-thrust',ship()),2);assert.equal(guide.count('flight-thrust',ship({device:'touch'})),1);
  assert.equal(guide.exportState().flows.flight.keyboard.complete,false);assert.equal(guide.exportState().counts.unknown,undefined);assert.equal(guide.exportState().flows.lastUses.unknown,undefined);
  assert.equal(new GuidanceController({profileId:'a',state:{...raw,version:999}}).count('dock'),0);
});

test('all returned actions are inert highlights and context data is never changed by guidance',()=>{
  const guide=new GuidanceController(),contexts=[ship(),person(),ship({intent:'crew',shared:{id:'friend',permissionNeeded:true,canManageCrew:true}}),person({boarding:{id:'x',kind:'assault',phase:'won',atHelm:true,canTakeHelm:true}})];
  for(const ctx of contexts){
    const before=JSON.stringify(ctx),prompt=guide.update(ctx);assert.equal(JSON.stringify(ctx),before);
    assert.ok(prompt);assert.deepEqual(Object.keys(prompt.action).sort(),['target','type']);assert.equal(prompt.action.type,'highlight');assert.equal(typeof prompt.action.target,'string');assert.ok(GUIDANCE_ACTIONS.includes(prompt.successAction));
    assert.equal(Object.values(prompt).some(value=>typeof value==='function'),false);
    prompt.action.target='mutated';assert.notEqual(guide.prompt.action.target,'mutated');
  }
});

test('the three guidance policies describe different assistance without any game-rule settings',()=>{
  assert.deepEqual(GUIDANCE_LEVELS.map(level=>level.id),['simple','moderate','expert']);
  assert.equal(guidancePolicy('simple').drills,true);assert.equal(guidancePolicy('moderate').drills,false);
  assert.equal(guidancePolicy('expert').automatic,'off');assert.equal(guidancePolicy('moderate').highlights,false);
  assert.equal(guidancePolicy('unknown').id,'simple');
  assert.ok(GUIDANCE_LEVELS.every(level=>level.description&&level.behavior&&Object.isFrozen(level)));
  for(const key of ['damage','health','permissions','difficulty','rank'])assert.ok(GUIDANCE_LEVELS.every(level=>!Object.hasOwn(level,key)));
});

test('Moderate offers one relevant brief hint, fades it, and preserves full requested help after reload',()=>{
  const guide=new GuidanceController({profileId:'moderate-captain',mode:'moderate'}),ctx=ship({timeSeconds:10,docking:{id:'haven',name:'Haven',inRange:true,speed:4}});
  const candidate=guide.update(ctx);assert.equal(candidate.successAction,'dock','contextual docking skips first flight drills');
  assert.equal(guide.exportState().exposures.length,0,'an unselected candidate is not an exposure');
  const shown=guide.present(candidate,ctx);assert.equal(shown.highlight,false);assert.equal(shown.body,shown.compactBody);assert.equal(shown.autoDismissAfter,9);
  assert.equal(guide.count('dock'),0);assert.equal(guide.exportState().exposures.length,1);
  assert.ok(guide.present(guide.update({...ctx,timeSeconds:18}),{...ctx,timeSeconds:18}));
  assert.equal(guide.present(guide.update({...ctx,timeSeconds:19}),{...ctx,timeSeconds:19}),null);
  const loaded=new GuidanceController({profileId:'moderate-captain',mode:'moderate',state:guide.exportState()});
  assert.equal(loaded.present(loaded.update(ctx),ctx),null,'reading a topic is remembered separately from practice');
  const manual=loaded.present(loaded.requestHelp(ctx),ctx,{requested:true});
  assert.equal(manual.body,manual.fullBody);assert.match(manual.body,/leave ship mode/);assert.equal(manual.highlight,true);
  assert.equal(manual.autoDismissAfter,undefined);assert.equal(loaded.count('dock'),0);
});

test('Moderate does not repeat a demonstrated interaction, while Simple still offers its second practice',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=ship({docking:{id:'first',name:'First port',inRange:true,speed:2}});
  guide.update(ctx);success(guide,'dock',ctx);
  const another={...ctx,docking:{id:'second',name:'Second port',inRange:true,speed:2}};
  assert.equal(guide.update(another),null);
  const simple=guide.setMode('simple');assert.equal(simple.successAction,'flight-thrust');
  flew(guide,ctx,2);assert.equal(guide.update(another).successAction,'dock');assert.equal(guide.update(another).attempt,2);
});

test('only the selected external route is exposed and Expert can request the same full explanation',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=person({timeSeconds:0});
  const mission={id:'mission:1',topicId:'military-muster',successAction:'military-muster',flow:'route',title:'Join your unit',body:'Find your friend’s muster, review your own branch and clearance, then choose Join muster.',compactBody:'Join the same muster as your friend.',controlTarget:'objectiveDetails'};
  const unused={...mission,id:'other',topicId:'military-deploy'};
  guide.update(ctx);assert.equal(guide.exportState().exposures.length,0);
  assert.equal(guide.present(mission,ctx).body,mission.compactBody);
  assert.deepEqual(guide.exportState().exposures.map(item=>item.topic),['military-muster']);
  assert.equal(guide.count('military-muster'),0);assert.equal(guide.count('military-deploy'),0);
  guide.setMode('expert');assert.equal(guide.present(unused,ctx),null);
  const explicit=guide.present(mission,ctx,{requested:true});assert.equal(explicit.body,mission.body);assert.equal(explicit.requested,true);
  assert.equal(guide.requestedPrompt({...ctx,timeSeconds:100}).id,mission.id,'a requested route is stable across normal HUD ticks');
  assert.equal(guide.requestedPrompt({...ctx,locationId:'another-port'}),null);
  guide.dismiss(mission.id);assert.equal(guide.requestedPrompt(ctx),null);
});

test('a requested military route expires when deployment or recovery state changes',()=>{
  const guide=new GuidanceController({mode:'expert'}),ctx=person({military:{status:'ready',active:{operationId:'op-a',phase:'muster'}}});
  const route={id:'muster',topicId:'military-muster',title:'Meet at the recruiter',body:'Join the same muster.',flow:'route',controlTarget:'objectiveDetails'};
  guide.present(route,ctx,{requested:true});assert.ok(guide.requestedPrompt(ctx));
  assert.equal(guide.requestedPrompt({...ctx,military:{status:'active',active:{operationId:'op-a',phase:'deployed'}}}),null);
  const recovering={...ctx,recovery:{status:'detained',detained:true}};
  guide.present(route,recovering,{requested:true});assert.equal(guide.requestedPrompt({...recovering,recovery:{status:'released',detained:false}}),null);
});

test('requested muster help expires when command, launch access, or public roster readiness changes in place',()=>{
  const route={id:'gather',topicId:'military-ready',title:'Gather your unit',body:'Lin authorizes departure once everyone is ready.',flow:'route',controlTarget:'objectiveDetails'};
  const operation={id:'op-a',phase:'muster',leaderId:'lin',leaderName:'Lin',actions:[{action:'launchOperation',available:false,reason:'The ranking leader authorizes departure.'}],roster:[{captainId:'lin',online:true,ready:true,status:'ready'},{captainId:'ada',online:true,ready:false,status:'waiting',statusReason:'Meet the recruiter.'}]};
  const ctx=person({military:{status:'active',objective:'Gather at Morrow.',active:{operationId:'op-a',phase:'muster'},operation}});
  for(const next of [
    {...operation,leaderId:'ada',leaderName:'Ada'},
    {...operation,phase:'active'},
    {...operation,actions:[{action:'launchOperation',available:true,reason:null}]},
    {...operation,actions:[{action:'launchOperation',available:false,reason:'Lin is offline.'}]},
    {...operation,roster:[operation.roster[0],{...operation.roster[1],ready:true,status:'ready',statusReason:null}]},
    {...operation,roster:[{...operation.roster[0],online:false,status:'offline'},operation.roster[1]]}
  ]){
    const guide=new GuidanceController({mode:'expert'});guide.present(route,ctx,{requested:true});assert.ok(guide.requestedPrompt(ctx));
    assert.equal(guide.requestedPrompt({...ctx,military:{...ctx.military,operation:next}}),null);
  }
  const guide=new GuidanceController({mode:'expert'});guide.present(route,ctx,{requested:true});
  assert.ok(guide.requestedPrompt({...ctx,timeSeconds:99,military:{...ctx.military,operation:{...operation,elapsed:99,countdown:12}}}),'clock changes alone do not churn requested help');
});

test('requested Navy order help expires on readiness and blocker changes without counting every watch second',()=>{
  const route={id:'watch',topicId:'navy-order',title:'Read the contact',body:'Wait for the contact to enter scan range.',flow:'route',controlTarget:'objectiveDetails'};
  const task={id:'contact-check',ready:false,running:false,reason:'Contact is outside scan range.',elapsed:0,duration:20};
  const ctx=person({duty:{phase:'working',navyOperation:{activeTask:task}}});
  for(const changed of [{...task,ready:true,reason:null},{...task,reason:'Return to the scanner console.'},{...task,running:true}]){
    const guide=new GuidanceController({mode:'expert'});guide.present(route,ctx,{requested:true});
    assert.equal(guide.requestedPrompt({...ctx,duty:{...ctx.duty,navyOperation:{activeTask:changed}}}),null);
  }
  const guide=new GuidanceController({mode:'expert'});guide.present(route,ctx,{requested:true});
  assert.ok(guide.requestedPrompt({...ctx,timeSeconds:15,duty:{...ctx.duty,navyOperation:{activeTask:{...task,elapsed:15,duration:20}}}}));
});

test('exposure is bounded and per input layout, and replaying one flow leaves other practice alone',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=ship({timeSeconds:0});
  const route={id:'scan-tip',topicId:'scan',successAction:'scan',title:'Investigate',body:'Approach the actual signal.',compactBody:'Investigate this signal.',controlTarget:'contextButton'};
  guide.present(route,ctx);guide.present(null,ctx);
  assert.equal(guide.present(route,ctx),null);
  assert.ok(guide.present(route,{...ctx,device:'touch'}));
  success(guide,'scan',ctx);success(guide,'dock',ctx);
  guide.resetProgress('navigation');assert.equal(guide.count('scan'),0);assert.equal(guide.count('dock'),1);
  assert.ok(guide.present(route,ctx));
  for(let i=0;i<160;i++)guide.present({...route,id:'topic'+i,topicId:'topic'+i},ctx);
  assert.equal(guide.exportState().exposures.length,128);
  assert.equal(guide.count('scan'),0,'viewing many hints does not count practice');
});

test('version-one saves migrate successful practice without sharing progress across captains',()=>{
  const guide=new GuidanceController({profileId:'old-captain'}),ctx=ship();flew(guide,ctx,2);success(guide,'dock',ctx);
  const old={...guide.exportState(),version:1};delete old.exposures;
  const migrated=new GuidanceController({profileId:'old-captain',state:old});
  assert.equal(migrated.exportState().version,GUIDANCE_VERSION);assert.equal(migrated.count('dock'),1);assert.equal(migrated.count('flight-turn'),2);
  assert.deepEqual(migrated.exportState().exposures,[]);
  assert.equal(new GuidanceController({profileId:'new-captain',state:old}).count('dock'),0);
});

test('practice summaries cover every supported action, count evidence, and separate input layouts',()=>{
  const guide=new GuidanceController(),ctx=ship();success(guide,'flight-thrust',ctx,2);success(guide,'dock',ctx);success(guide,'military-enlist',ctx);
  const summary=guidanceProgress(guide,'keyboard');
  assert.equal(summary.completed,2);assert.equal(summary.practiced,4);assert.equal(summary.total,GUIDANCE_ACTIONS.length);
  assert.deepEqual(new Set(summary.flows.flatMap(flow=>flow.actions.map(action=>action.id))),new Set(GUIDANCE_ACTIONS));
  assert.equal(summary.flows.find(flow=>flow.id==='service').actions.find(action=>action.id==='military-enlist').required,1);
  assert.equal(guidanceProgress(guide.exportState(),{device:'touch'}).practiced,2);
  const before=guide.exportState();summary.flows[0].actions[0].count=0;assert.deepEqual(guide.exportState(),before);
});

test('a real gun station teaches battery selection before walking and never describes unseen targets',()=>{
  const guide=new GuidanceController(),ctx=person({device:'touch',gunnery:{active:true,batteryName:'Fore',selectedBatteryId:'fore',canFire:true,batteries:[{id:'fore'},{id:'port'},{id:'starboard'},{id:'aft'}]}});
  const battery=guide.update(ctx);assert.equal(battery.successAction,'gunnery-battery');assert.equal(battery.controlTarget,'gunneryBatteries');
  assert.match(battery.body,/4 batteries/);assert.match(battery.body,/Tap a named battery/);assert.doesNotMatch(battery.body,/raider|enemy location|hostile detected/i);
  success(guide,'gunnery-battery',ctx,2);
  const fire=guide.update(ctx);assert.equal(fire.successAction,'gunnery-fire');assert.match(fire.body,/pilot still flies/);
  const standby=guide.update({...ctx,gunnery:{...ctx.gunnery,canFire:false}});assert.equal(standby.id,'gunnery-fire:standby');assert.match(standby.body,/CYCLING.*LOW POWER.*STANDBY/);
});

test('first on-foot combat outranks walking and fog never sends players toward an unseen enemy',()=>{
  const guide=new GuidanceController(),visible=person({combat:{active:true,targetVisible:true}});
  assert.equal(guide.update(visible).successAction,'person-aim');assert.equal(guide.count('person-move'),0);
  const fog=guide.update({...visible,combat:{active:true,targetVisible:false}});
  assert.match(fog.body,/No visible target.*Keep cover/);assert.doesNotMatch(fog.body,/Move toward|Walk into a position where a hostile/);
});

test('friend awareness on foot opens the actual Crew flow without inventing permission or a ship',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=person({device:'touch',shared:{id:'crew:lin',friendName:'Lin',friendCount:1,samePort:true}});
  const prompt=guide.update(ctx);assert.equal(prompt.successAction,'crew-hub');assert.match(prompt.fullBody,/Lin.*current ship or port/);assert.doesNotMatch(prompt.fullBody,/Allow aboard|Board Cinder/);
  success(guide,'crew-hub',ctx);
  assert.equal(guide.update({...ctx,shared:{...ctx.shared,sameShip:true,aboardTogether:true}}),null,'already demonstrated Crew access is not repeatedly nagged');
  const leave=guide.requestHelp({...ctx,intent:'disembark',shared:{...ctx.shared,sameShip:true,disembarkAvailable:true,portName:'Kettle'}});
  assert.equal(leave.successAction,'disembark');assert.match(leave.body,/Kettle.*helm permission is not needed/);
});

test('sharing a vessel during a hull walk never claims the two players are aboard together',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=person({shared:{id:'crew:lin',friendName:'Lin',friendCount:1,sameShip:true,aboardTogether:false,samePort:false}});
  const outside=guide.update(ctx);assert.equal(outside.successAction,'crew-hub');assert.equal(outside.title,'Check your crewmate’s location');
  assert.match(outside.fullBody,/one of you is on a hull walk.*Open Crew to see who is outside/);
  assert.doesNotMatch(outside.title,/aboard together/);
  const inside=guide.update({...ctx,shared:{...ctx.shared,aboardTogether:true}});assert.equal(inside.title,'You are aboard together');
  const legacy=guide.update({...ctx,shared:{...ctx.shared,aboardTogether:undefined}});assert.equal(legacy.title,'You are aboard together','older contexts may omit the more precise deck relationship');
});

test('scan and navigation advice uses real visible actions and respects a supplied blocker',()=>{
  const guide=new GuidanceController({mode:'moderate'}),ctx=ship({device:'touch',intent:'scan',navigation:{canScan:true}});
  const scan=guide.update(ctx);assert.equal(scan.successAction,'scan');assert.match(scan.fullBody,/Tap Investigate/);assert.equal(scan.controlTarget,'contextButton');assert.doesNotMatch(scan.fullBody,/Tap SCAN/);
  const route=guide.update({...ctx,intent:'navigation',navigation:{hasCourse:false}});assert.equal(route.successAction,'set-course');assert.match(route.fullBody,/known place/);
  const jump=guide.update({...ctx,intent:'jump',navigation:{canJump:false,reason:'Your fold drive is not fitted.'}});assert.equal(jump.successAction,'jump');assert.equal(jump.body,'Your fold drive is not fitted.');
});

test('blocked and foreign contexts cannot expose or retain a visible external prompt',()=>{
  const guide=new GuidanceController({profileId:'a',mode:'moderate'}),ctx=ship({profileId:'a'}),route={id:'external',title:'Next step',body:'Open the actual panel.',controlTarget:'pauseButton'};
  assert.equal(guide.present(route,{...ctx,blocked:true}),null);assert.equal(guide.exportState().exposures.length,0);
  assert.equal(guide.present(route,{...ctx,profileId:'b'}),null);assert.equal(guide.exportState().exposures.length,0);
  assert.ok(guide.present(route,ctx));assert.equal(guide.present(route,{...ctx,playing:false}),null);assert.equal(guide.prompt,null);
});
