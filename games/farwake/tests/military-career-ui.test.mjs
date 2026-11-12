import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {updateNpcLife,npcLifeActors} from '../dist/npc-life.mjs';
import {militaryGroundSite} from '../dist/military-sites.mjs';
import {getPersonalWeapon} from '../dist/combat.mjs';
import {Soundscape} from '../dist/audio.mjs';
import {createMilitaryCareerUI,militaryCareerGuided,militaryCareerPrompt,militaryTogetherState,MILITARY_RECRUITER_ID} from '../dist/military-career-ui.mjs';

function node(tagName='div'){return{tagName,children:[],innerHTML:'',append(...children){this.children.push(...children);}};}
function fixture({view,pending=null,snapshot={}}={}){
 const calls=[],markers=[],refreshes=[],state={seed:'military-ui',multiplayer:{captainId:'captain-one'}},game={state,militaryCareerStatus:()=>view};
 const dialog={opened:false,revision:0,body:node(),items:[],open(title,kind){this.title=title;this.kind=kind;this.opened=true;this.revision++;this.items=[];this.body=node();},html(markup){this.markup=markup;},choices(items){this.items.push(...items);},close(){this.opened=false;this.revision++;}};
 const ui=createMilitaryCareerUI({getGame:()=>game,getSnapshot:()=>snapshot,dialog,invoke:async(name,args)=>{calls.push({name,args});return pending?await pending:{ok:true};},acceptResult:answer=>answer.ok,track:(...args)=>markers.push(args),refreshWorld:()=>refreshes.push(true),document:{createElement:node}});
 return{ui,dialog,state,game,calls,markers,refreshes,choose:label=>dialog.items.find(item=>item.label===label)};
}
const joins=()=>({status:'unjoined',guidanceActive:false,actions:[{action:'join',branchId:'navy',entityId:MILITARY_RECRUITER_ID,label:'Join Navy',available:true,detail:'Serve on a carrier.'},{action:'join',branchId:'army',entityId:MILITARY_RECRUITER_ID,label:'Join Army',available:true,detail:'Deploy on foot.'}]});
const active=()=>({status:'active',guidanceActive:true,branchId:'army',branchName:'Freewake Army',title:'Field qualification',objective:'Hit each target, then use the range terminal.',target:{systemId:'hearth',bodyId:'morrow',siteId:'service-range',entityId:'record:drill'},active:{operationId:'test-operation',phase:'active',objectives:[{id:'hits',label:'Hit three frames',value:1,required:3,done:false}]},actions:[{action:'pause',label:'Take leave',available:true}]});
const descendants=root=>(root.children||[]).flatMap(child=>[child,...descendants(child)]);

test('service panel shows personal rank beside a mixed-rank operation and dispatches the exact authority action',async()=>{
 const join={action:'joinOperation',operationId:'operation-7',missionId:'frontier-duty',entityId:MILITARY_RECRUITER_ID,label:'Join this watch',available:true};
 const launch={action:'launchOperation',operationId:'operation-7',label:'Launch deployment',available:false,reason:'The operation leader must authorize departure.'};
 const view={...active(),serviceRank:{enlisted:true,rank:'Recruit',rankIndex:0,completed:1,nextRank:3,nextRankName:'Private',permissionLabels:['Serve in an assigned squad or ship watch']},dialogue:'Recruit, your own duty record follows you.',operations:[{id:'operation-7',title:'Border <watch>',phase:'muster',systemName:'Meridian',leaderName:'Veteran Ada',roster:[{captainId:'captain-one',name:'New recruit',rank:'Recruit',role:'Infantry',online:true},{captainId:'captain-two',name:'Veteran Ada',rank:'Corporal',role:'Operation leader',online:true}],actions:[join,launch]}]};
 const f=fixture({view});f.ui.open(MILITARY_RECRUITER_ID);
 assert.match(f.dialog.markup,/Recruit/);assert.ok(descendants(f.dialog.body).some(node=>node.tagName==='details'&&node.innerHTML?.includes('1 / 3 assignments toward Private')));assert.doesNotMatch(f.dialog.markup,/Corporal/);
 f.ui.openTogether({operationId:'operation-7'});
 const nodes=descendants(f.dialog.body),card=nodes.find(node=>node.innerHTML?.includes('Border &lt;watch&gt;'));assert.ok(card);assert.match(card.innerHTML,/New recruit.*Recruit/);assert.match(card.innerHTML,/Veteran Ada.*Corporal/);
 assert.equal(nodes.find(node=>node.textContent==='Launch deployment').disabled,true);
 await nodes.find(node=>node.textContent==='Join this watch').onclick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].args,join);
});

test('deployment board preserves locked orders and never calculates command permissions from a teammate',()=>{
 const view={...active(),deployments:[{id:'quiet-watch',title:'Distant watch',summary:'Stand watch in the assigned system.',systemName:'Sable',actions:[{action:'createOperation',missionId:'quiet-watch',label:'Form this deployment',available:false,reason:'Petty officer rank is required.'}]}]};
 const f=fixture({view});f.ui.open();const nodes=descendants(f.dialog.body),button=nodes.find(node=>node.textContent==='Form this deployment');assert.ok(button);assert.equal(button.disabled,true);
 button.onclick();assert.equal(f.calls.length,0);assert.ok(nodes.some(node=>node.textContent==='Petty officer rank is required.'));
});

const recruitRank={enlisted:true,factionId:'freewake',branchId:'navy',rank:'Recruit',rankIndex:0,completed:0,nextRank:3,nextRankName:'Able crew',permissionLabels:['Serve in an assigned squad or ship watch']};
const friendRecord=()=>({captainId:'friend',name:'Ada <friend>',online:true,military:{factionId:'freewake',branchId:'navy',rank:'Petty officer',operationId:'unit-a'}});
const friendUnit=()=>({id:'unit-a',missionId:'frontier-duty',title:'Frontier watch',phase:'muster',factionId:'freewake',branchId:'navy',leaderId:'friend',leaderName:'Ada <friend>',systemName:'Sable',roster:[{captainId:'friend',name:'Ada <friend>',rank:'Petty officer',role:'Operation leader',online:true,status:'ready'}],actions:[{action:'joinOperation',operationId:'unit-a',label:'Join this unit',available:true}]});
const readyView=()=>({status:'ready',factionId:'freewake',branchId:'navy',branchName:'Freewake Navy',serviceRank:{...recruitRank},actions:[{action:'createOperation',missionId:'intro',label:'Open or join a muster',available:true,joinExisting:true}]});

test('Serve together selects the friend’s exact unit rather than starting a parallel assignment',async()=>{
 const operation=friendUnit(),view={...readyView(),operations:[operation]},snapshot={presence:[friendRecord()]},f=fixture({view,snapshot});
 f.ui.openTogether({captainId:'friend',operationId:'old-unit'});
 assert.equal(f.dialog.kind,'military-together');assert.match(f.dialog.markup,/You · Recruit/);assert.match(f.dialog.markup,/Ada &lt;friend&gt;/);
 assert.doesNotMatch(f.dialog.markup,/You are in the same unit/);assert.equal(f.choose('Open or join a muster'),undefined);
 const button=descendants(f.dialog.body).find(node=>node.textContent==='Join this unit');assert.ok(button);await button.onclick();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args,operation.actions[0]);assert.equal(f.calls[0].args.operationId,'unit-a');
});

test('a stale friend operation hint cannot manufacture shared unit membership or show the old join action',()=>{
 const operation=friendUnit(),friend=friendRecord();friend.military.operationId=null;
 const view={...readyView(),operations:[operation]},snapshot={presence:[friend]},context={captainId:'friend',operationId:'unit-a'};
 const model=militaryTogetherState(view,snapshot,context);assert.equal(model.operation,null);assert.equal(model.sameOperation,false);
 const f=fixture({view,snapshot});f.ui.openTogether(context);
 assert.match(f.dialog.markup,/choosing the same branch alone does not join a unit/);
 assert.equal(descendants(f.dialog.body).some(node=>node.textContent==='Join this unit'),false);
});

test('a missing friend cannot be recovered from an old operation hint into an actionable roster',()=>{
 const view={...readyView(),operations:[friendUnit()]},context={captainId:'friend',operationId:'unit-a'},model=militaryTogetherState(view,{presence:[]},context);
 assert.equal(model.friendMissing,true);assert.equal(model.operation,null);
 const f=fixture({view,snapshot:{presence:[]}});f.ui.openTogether(context);assert.match(f.dialog.markup,/Captain unavailable/);
 assert.equal(descendants(f.dialog.body).some(node=>node.textContent==='Join this unit'),false);assert.equal(f.choose('Open or join a muster'),undefined);assert.deepEqual(f.calls,[]);
});

test('different service branches explain the limit and never offer an automatic transfer or unit join',()=>{
 const operation=friendUnit(),view={...readyView(),branchId:'army',serviceRank:{...recruitRank,branchId:'army'},operations:[operation]},f=fixture({view,snapshot:{presence:[friendRecord()]}});
 f.ui.openTogether({captainId:'friend'});assert.match(f.dialog.markup,/different branches/);assert.match(f.dialog.markup,/Existing branch choices cannot be changed/);
 assert.equal(descendants(f.dialog.body).some(node=>node.textContent==='Join this unit'),false);
 assert.equal(f.dialog.items.some(item=>/^Join /.test(item.label)),false);assert.deepEqual(f.calls,[]);
});

test('two existing musters offer an explicit leave step without silently switching or joining units',async()=>{
 const leave={action:'leaveOperation',operationId:'own-unit',label:'Leave this muster',available:true},operation={...friendUnit(),actions:[{...friendUnit().actions[0],available:false,reason:'Debrief or leave your current deployment first.'}]};
 const view={...readyView(),operation:{...friendUnit(),id:'own-unit',title:'Your earlier muster',actions:[leave]},operations:[operation]},f=fixture({view,snapshot:{presence:[friendRecord()]}});
 f.ui.openTogether({captainId:'friend'});assert.match(f.dialog.markup,/You are in different units/);assert.match(f.dialog.markup,/Leave that muster first/);assert.deepEqual(f.calls,[]);
 await f.choose('Leave my current muster').action();assert.equal(f.calls.length,1);assert.equal(f.calls[0].args,leave);assert.equal(f.calls[0].args.operationId,'own-unit');
});

test('an unenlisted friend must explicitly choose a branch even when the target unit is known',async()=>{
 const view={...joins(),serviceRank:{enlisted:false},operations:[{...friendUnit(),actions:[{action:'joinOperation',operationId:'unit-a',label:'Join this unit',available:false,reason:'Enlist first.'}]}]},f=fixture({view,snapshot:{presence:[friendRecord()]}});
 f.ui.openTogether({captainId:'friend'});assert.deepEqual(f.calls,[]);assert.ok(f.choose('Join Navy'));assert.ok(f.choose('Join Army'));
 assert.equal(descendants(f.dialog.body).find(node=>node.textContent==='Join this unit').disabled,true);
 await f.choose('Join Navy').action();assert.equal(f.calls.length,1);assert.equal(f.calls[0].args,view.actions[0]);assert.equal(f.dialog.kind,'military-together');
});

test('Morrow never offers Freewake enlistment as a way for a civilian to join a rival faction friend',()=>{
 const friend=friendRecord();friend.military.factionId='meridian';
 const view={...joins(),serviceRank:{enlisted:false},operations:[{...friendUnit(),factionId:'meridian'}]},f=fixture({view,snapshot:{presence:[friend]}});
 f.ui.openTogether({captainId:'friend'});assert.match(f.dialog.markup,/cannot enlist you into your friend’s faction/);assert.match(f.dialog.markup,/Freewake branch choice will not join that unit/);
 assert.equal(f.dialog.items.some(item=>/^Join /.test(item.label)),false);assert.equal(descendants(f.dialog.body).some(node=>node.textContent==='Join this unit'),false);assert.deepEqual(f.calls,[]);
});

test('an open muster updates when a friend joins and keeps departure with the actual leader',()=>{
 const friend=friendRecord();friend.military.operationId=null;
 const operation={...friendUnit(),member:true,leaderId:'captain-one',leaderName:'You',roster:[{captainId:'captain-one',name:'You',rank:'Recruit',role:'Operation leader',status:'ready'}],actions:[{action:'launchOperation',operationId:'unit-a',label:'Depart with this roster',available:true}]};
 const view={...readyView(),operation,actions:[]},f=fixture({view,snapshot:{presence:[friend]}});
 f.ui.openTogether({captainId:'friend'});assert.match(f.dialog.markup,/Wait until both names appear/);assert.equal(f.ui.refresh(),false);
 operation.roster.push({captainId:'friend',name:friend.name,rank:'Petty officer',role:'Operation leader',status:'ready'});operation.leaderId='friend';operation.leaderName=friend.name;operation.actions[0].available=false;operation.actions[0].reason='The ranking operation leader authorizes departure.';friend.military.operationId=operation.id;
 assert.equal(f.ui.refresh(),true);assert.match(f.dialog.markup,/You are in the same unit/);
 const nodes=descendants(f.dialog.body);assert.equal(nodes.find(node=>node.textContent==='Depart with this roster').disabled,true);assert.ok(nodes.some(node=>node.innerHTML?.includes('Ada &lt;friend&gt; authorizes departure')));
 f.dialog.open('Cargo','cargo');operation.roster[1].status='offline';assert.equal(f.ui.refresh(),false);assert.equal(f.dialog.kind,'cargo');
});

test('a service muster changes to deployed orders when another player launches it, and a historical roster is not a current unit',()=>{
 const operation={...friendUnit(),member:true,actions:[]},view={...readyView(),operation,actions:[],objective:'Follow your assigned duty.'},f=fixture({view});
 f.ui.open();assert.ok(descendants(f.dialog.body).some(node=>node.innerHTML?.includes('Gathering at Morrow')));
 operation.phase='active';operation.roster[0].status='aboard';assert.equal(f.ui.refresh(),true);assert.match(f.dialog.markup,/YOUR NEXT TASK/);assert.ok(descendants(f.dialog.body).some(node=>node.textContent==='Your unit · 1 on this roster'));
 view.operation=null;view.operations=[operation];operation.roster.push({captainId:'captain-one',name:'You',settled:true});
 assert.equal(militaryTogetherState(view,{presence:[friendRecord()]},{captainId:'friend'}).sameOperation,false);
});

test('solo Navy and Army service still start through the same personal assignment actions without a crew requirement',async()=>{
 for(const branchId of ['navy','army']){
  const start={action:'start',label:branchId==='navy'?'Begin the carrier deployment':'Take the field assignment',entityId:MILITARY_RECRUITER_ID,available:true};
  const view={...readyView(),branchId,serviceRank:{...recruitRank,branchId},actions:[start]},f=fixture({view});f.state.multiplayer=null;f.ui.open(MILITARY_RECRUITER_ID);
  assert.equal(f.choose('Open or join a muster'),undefined);await f.choose(start.label).action();assert.equal(f.calls[0].args,start);assert.equal(f.dialog.opened,false);
 }
});

test('a departed friend’s unit remains visible but offers no new or remotely joined operation',()=>{
 const operation={...friendUnit(),phase:'active',actions:[{action:'joinOperation',operationId:'unit-a',label:'Join this unit',available:false,reason:'This deployment has already left. Join the next muster at Morrow.'}]};
 const f=fixture({view:{...readyView(),operations:[operation]},snapshot:{presence:[friendRecord()]}});f.ui.openTogether({captainId:'friend'});
 assert.match(f.dialog.markup,/Joining after departure is unavailable/);assert.equal(f.choose('Open or join a muster'),undefined);assert.equal(descendants(f.dialog.body).find(node=>node.textContent==='Join this unit').disabled,true);
 f.choose('Find the recruiter on Morrow').action();assert.equal(f.markers[0][0].entityId,MILITARY_RECRUITER_ID);assert.deepEqual(f.calls,[]);
});

test('the recruiter offers exactly two branches and declining submits nothing',()=>{
 const f=fixture({view:joins()});f.ui.open(MILITARY_RECRUITER_ID);
 assert.deepEqual(f.dialog.items.map(item=>item.label),['Join Navy','Join Army','Not now']);
 assert.match(f.dialog.markup,/Joining is optional/);f.choose('Not now').action();
 assert.equal(f.dialog.opened,false);assert.deepEqual(f.calls,[]);assert.deepEqual(f.markers,[]);
});

test('a remote captain can find the recruiter without receiving a remote enlistment button',()=>{
 const view=joins();view.actions.forEach(action=>{action.available=false;action.reason='Meet the recruiter.';});
 const f=fixture({view});f.ui.open();
 assert.deepEqual(f.dialog.items.map(item=>item.label),['Find the recruiter on Morrow','Not now']);
 f.choose('Find the recruiter on Morrow').action();assert.equal(f.markers[0][0].entityId,MILITARY_RECRUITER_ID);assert.deepEqual(f.calls,[]);
});

test('branch selection submits the authority’s exact action once and ignores a reply after changing captain',async()=>{
 let resolve;const view=joins(),pending=new Promise(done=>{resolve=done;}),f=fixture({view,pending});
 f.ui.open(MILITARY_RECRUITER_ID);const choose=f.choose('Join Army').action,first=choose();await choose();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'militaryCareerAction');assert.equal(f.calls[0].args,view.actions[1]);
 f.state.multiplayer.captainId='captain-two';resolve({ok:true});await first;assert.deepEqual(f.refreshes,[]);assert.deepEqual(f.markers,[]);
});

test('detached choices reject a new captain before dispatch and stale unit controls cannot replace a same-kind dialog',async()=>{
 const enlistment=fixture({view:joins()});enlistment.ui.open(MILITARY_RECRUITER_ID);const enlist=enlistment.choose('Join Navy').action;
 enlistment.state.multiplayer.captainId='captain-two';await enlist();assert.deepEqual(enlistment.calls,[]);
 const operation=friendUnit(),f=fixture({view:{...readyView(),operations:[operation]},snapshot:{presence:[friendRecord()]}});f.ui.openTogether({captainId:'friend'});
 const join=descendants(f.dialog.body).find(node=>node.textContent==='Join this unit').onclick;
 f.dialog.open('Another activity','military-together');await join();assert.deepEqual(f.calls,[]);
 operation.phase='active';assert.equal(f.ui.refresh(),false);assert.equal(f.dialog.title,'Another activity');
});

test('a late response cannot replace a different open panel, and retry follows its new task without a second menu',async()=>{
 let resolve;const view=active();view.actions=[{action:'retry',label:'Try again',available:true}];
 const f=fixture({view,pending:new Promise(done=>{resolve=done;})});f.ui.open();const first=f.choose('Try again').action();
 f.dialog.open('Cargo','cargo');resolve({ok:true});await first;assert.equal(f.dialog.kind,'cargo');assert.deepEqual(f.markers,[]);
 const retry=fixture({view});retry.ui.open();await retry.choose('Try again').action();assert.equal(retry.dialog.opened,false);assert.equal(retry.markers.length,1);assert.deepEqual(retry.markers[0],[view.target,{quiet:true}]);
});

test('one current task and its real evidence remain primary; paused and completed careers stop coaching',()=>{
 const view=active(),f=fixture({view});f.ui.open();assert.match(f.dialog.markup,/YOUR NEXT TASK/);assert.match(f.dialog.markup,/1 \/ 3/);
 assert.equal(f.dialog.items.filter(item=>item.label==='Show my next task').length,1);
 const prompt=militaryCareerPrompt(view,{nearby:{id:'morrow:site:service-range:captain-one:record:drill'}});
 assert.equal(prompt.controlTarget,'contextButton');assert.match(prompt.body,/Press E/);
 for(const status of ['paused','completed','unjoined']){const inactive={...view,status,guidanceActive:false};assert.equal(militaryCareerGuided(inactive),false);assert.equal(militaryCareerPrompt(inactive),null);}
 assert.equal(militaryCareerPrompt(view,{gunnery:true}).controlTarget,'fireButton');
});

test('the real solo app dispatch preserves career action arguments, existing jobs, and personal inventory',async()=>{
 const game=new Game('military-ui-real'),surface=generateSurface('morrow',game.state.seed),recruiter=surface.entities.find(entity=>entity.id===MILITARY_RECRUITER_ID);
 game.state.mode='person';game.state.locationId='morrow';Object.assign(game.state.person,{x:recruiter.x,y:recruiter.y});
 const before={ship:structuredClone(game.state.ship),cargo:structuredClone(game.state.cargo),credits:game.state.credits,missions:structuredClone(game.state.missions)};
 const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),start=source.indexOf('async function performInvoke('),end=source.indexOf('\nfunction advanceOnlinePerson(',start),context=vm.createContext({game,network:null,testSession:null});
 vm.runInContext(source.slice(start,end),context);
 const action=game.militaryCareerStatus(recruiter.id).actions.find(action=>action.branchId==='army'),answer=await context.performInvoke('militaryCareerAction',action);
 assert.equal(answer.ok,true);assert.equal(game.state.militaryCareer.branchId,'army');assert.equal(game.militaryCareerStatus().status,'ready');
 assert.deepEqual({ship:game.state.ship,cargo:game.state.cargo,credits:game.state.credits,missions:game.state.missions},before);
});

test('Sergeant Venn has one reachable fixed post near Morrow’s landing while ordinary people keep their daily life',()=>{
 const surface=generateSurface('morrow','recruiter-placement'),recruiters=surface.entities.filter(entity=>entity.data?.militaryRecruiter);
 assert.equal(recruiters.length,1);const recruiter=recruiters[0],position={x:recruiter.x,y:recruiter.y};
 assert.equal(recruiter.id,MILITARY_RECRUITER_ID);assert.equal(recruiter.name,'Sergeant Sera Venn');assert.equal(recruiter.data.fixedPost,true);
 assert.ok(Math.hypot(recruiter.x-surface.spawn.x,recruiter.y-surface.spawn.y)<90);assert.ok(isWalkable(surface,recruiter.x,recruiter.y));
 for(const seconds of [0,360,720,1080,1440,7000]){updateNpcLife(surface,seconds);assert.deepEqual({x:recruiter.x,y:recruiter.y},position);assert.equal(recruiter.hidden,undefined);}
 assert.ok(npcLifeActors(surface).length>3);assert.equal(npcLifeActors(surface).some(entity=>entity.id===recruiter.id),false);
 assert.equal(generateSurface('kettle','recruiter-placement').entities.some(entity=>entity.data?.militaryRecruiter),false);
});

test('the actual range briefing describes harmless targets and the equipped kit while ordinary sites keep their own prose',async()=>{
 const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),start=source.indexOf('async function openSiteEntity('),end=source.indexOf('\nfunction ',start);
 const f=fixture({view:active()}),game=new Game('range-briefing');game.state.person.ownedWeapons=['pulse-sidearm','breach-rifle'];game.state.person.weapon='breach-rifle';
 const context=vm.createContext({game,dialog:f.dialog,touchLayout:false,esc:String,militaryGroundSite,getPersonalWeapon,runDeckAction(){}});
 vm.runInContext(source.slice(start,end),context);
 await context.openSiteEntity({name:'Morrow Service Range',type:'siteEntrance',data:{siteId:'service-range',siteKind:'military',summary:'A supervised range.'}});
 assert.match(f.dialog.markup,/three target frames are harmless/);assert.match(f.dialog.markup,/range terminal/);assert.match(f.dialog.markup,/Breach rifle/);assert.match(f.dialog.markup,/Return to the entrance/);assert.doesNotMatch(f.dialog.markup,/Read what was left behind/);
 await context.openSiteEntity({name:'Rainline Relay Annex',type:'siteEntrance',data:{siteId:'service-relay',siteKind:'military',summary:'Restore the emergency channel.'}});
 assert.match(f.dialog.markup,/Use walls and equipment as cover/);assert.match(f.dialog.markup,/restore the relay/);
 await context.openSiteEntity({name:'Old cavern',type:'siteEntrance',data:{siteKind:'cave',summary:'A dark place.'}});assert.match(f.dialog.markup,/Read what was left behind/);
});

test('service ambience uses range and radio captions instead of the haunted-room fallback and respects mute',()=>{
 let enabled=true;const sound=new Soundscape(()=>enabled,{musicEnabled:()=>false}),tones=[];sound.tone=(...args)=>tones.push(args);
 assert.equal(sound.siteAtmosphere(0,'training'),null);assert.match(sound.siteAtmosphere(2,'training'),/target relay/);assert.equal(sound.siteAtmosphere(3,'training'),null);
 assert.equal(sound.siteAtmosphere(4,'military'),null);assert.match(sound.siteAtmosphere(6,'military'),/Service equipment/);
 const count=tones.length;enabled=false;assert.equal(sound.siteAtmosphere(100,'military'),null);assert.equal(tones.length,count);
});
