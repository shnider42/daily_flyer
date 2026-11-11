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
import {createMilitaryCareerUI,militaryCareerGuided,militaryCareerPrompt,MILITARY_RECRUITER_ID} from '../dist/military-career-ui.mjs';

function node(){return{children:[],innerHTML:'',append(...children){this.children.push(...children);}};}
function fixture({view,pending=null}={}){
 const calls=[],markers=[],refreshes=[],state={seed:'military-ui',multiplayer:{captainId:'captain-one'}},game={state,militaryCareerStatus:()=>view};
 const dialog={opened:false,revision:0,body:node(),items:[],open(title,kind){this.title=title;this.kind=kind;this.opened=true;this.revision++;this.items=[];this.body=node();},html(markup){this.markup=markup;},choices(items){this.items.push(...items);},close(){this.opened=false;this.revision++;}};
 const ui=createMilitaryCareerUI({getGame:()=>game,dialog,invoke:async(name,args)=>{calls.push({name,args});return pending?await pending:{ok:true};},acceptResult:answer=>answer.ok,track:(...args)=>markers.push(args),refreshWorld:()=>refreshes.push(true),document:{createElement:node}});
 return{ui,dialog,state,game,calls,markers,refreshes,choose:label=>dialog.items.find(item=>item.label===label)};
}
const joins=()=>({status:'unjoined',guidanceActive:false,actions:[{action:'join',branchId:'navy',entityId:MILITARY_RECRUITER_ID,label:'Join Navy',available:true,detail:'Serve on a carrier.'},{action:'join',branchId:'army',entityId:MILITARY_RECRUITER_ID,label:'Join Army',available:true,detail:'Deploy on foot.'}]});
const active=()=>({status:'active',guidanceActive:true,branchId:'army',branchName:'Freewake Army',title:'Field qualification',objective:'Hit each target, then use the range terminal.',target:{systemId:'hearth',bodyId:'morrow',siteId:'service-range',entityId:'record:drill'},active:{operationId:'test-operation',phase:'active',objectives:[{id:'hits',label:'Hit three frames',value:1,required:3,done:false}]},actions:[{action:'pause',label:'Take leave',available:true}]});

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
