import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.mjs';
import {TutorialRuntime} from '../dist/tutorial-runtime.mjs';
import {solCordonStatus,solCordonTelegraph} from '../dist/sol-cordon.mjs';
import {solCordonArrivalFrame,drawSolCordonOverlay,drawSolTractors} from '../dist/sol-cordon-art.mjs';

// Execute the real UI boundary; fake only browser rendering and event sinks.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const functions=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{const index=functions.findIndex(match=>match[1]===name);assert.ok(index>=0,name);return source.slice(functions[index].index,functions[index+1]?.index??source.length);};
const load=(names,values)=>{const context=vm.createContext(values);vm.runInContext(names.map(declaration).join('\n'),context);return context;};
const ready=()=>{const game=new Game('cordon-presentation',{startMode:'casual'});game.state.upgrades.fold_3=1;game._updateStats();game.state.systemId='witness';game._loadSystem('witness');game.state.pendingEncounter=null;game.state.ship.fuel=game.state.ship.maxFuel;return game;};
const classes=()=>({add(){},remove(){},toggle(){}});
const noops=new Proxy({},{get:(target,key)=>target[key]??(()=>{})});
function element(){return{hidden:false,innerHTML:'',textContent:'',children:[],isConnected:true,classList:classes(),append(...children){this.children.push(...children);},insertAdjacentHTML(_,html){this.innerHTML+=html;},setAttribute(){},addEventListener(){},getBoundingClientRect:()=>({width:500,height:340,left:0,top:0}),getContext:()=>noops};}
function elements(){const values=new Map();return id=>{if(!values.has(id))values.set(id,element());return values.get(id);};}
function mapFixture(game){
 const $=elements(),dialog={body:element(),open(){},close(){}},context=load(['openMap'],{
  game,$,dialog,solCordonStatus,playing:true,testSession:null,recordGuide(){},displayMode:()=>game.state.mode,
  document:{createElement:element},appendQuietEarthEntry(){},appendFieldWorkEntry(){},appendExpeditionDestinations(){},systemActivitiesMarkup:()=>'',
  systemIdentity:()=>null,FACTIONS:[],esc:value=>String(value??''),seededRandom:()=>()=>.5,settings:{textScale:1},window:{devicePixelRatio:1},requestAnimationFrame:fn=>fn(),
 });return{context,$};
}

test('the actual galaxy card offers an early Sol attempt and warns about return fuel',()=>{
 const game=ready(),cost=game.travelInfo('sol').fuelCost;game.state.ship.fuel=cost;
 const f=mapFixture(game);f.context.openMap('sol');let html=f.$('systemInfo').innerHTML;
 assert.match(html,/<button id="jumpButton"[^>]*>Attempt Sol jump<\/button>/);
 assert.doesNotMatch(html,/<button id="jumpButton"[^>]*disabled/);
 assert.match(html,/Interceptors and orbital batteries/);assert.match(html,/not have enough fuel for the same jump back/);
 game.state.ship.fuel=cost-1;f.context.openMap('sol');html=f.$('systemInfo').innerHTML;
 assert.match(html,/<button id="jumpButton"[^>]*disabled/,'Ordinary insufficient fuel still prevents a jump.');
 game.state.ship.fuel=cost*2;f.context.openMap('sol');assert.match(f.$('systemInfo').innerHTML,new RegExp(`Keep ${cost} fuel for the jump back`));
});

test('opening the galaxy chart inside the cordon selects the real departure system',()=>{
 const game=ready();assert.equal(game.travel('sol').ok,true);const f=mapFixture(game);
 f.context.openMap();const html=f.$('systemInfo').innerHTML;
 assert.match(html,/<h3>Witness<\/h3>/);assert.match(html,/>Withdraw from Sol<\/button>/);
 assert.doesNotMatch(html,/<button id="jumpButton"[^>]*disabled/);
});

function interactionFixture(game,target){
 const effects=[],toasts=[],counts={surface:0,save:0,events:0};
 const context=load(['interact','contextLabel'],{game,playing:true,actionPending:false,dialog:{opened:false},nearby:()=>target,
  getGunneryView:()=>({active:false}),audio:{play:value=>effects.push(value)},invoke:async(name,args)=>game[name](args.id),result:answer=>answer.ok,
  ensureSurface(){counts.surface++;},saveNow(){counts.save++;},processEvents(){counts.events++;},updateHUD(){},touchLayout:false,tracked:null,
  toast:(...args)=>toasts.push(args),network:null,
 });return{context,effects,toasts,counts};
}

test('the real Earth interaction remains a flight attempt and never presents a false landing',async()=>{
 const game=ready();game.travel('sol');const earth=game.system.bodies.find(body=>body.id==='earth');
 Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+80});
 const f=interactionFixture(game,{type:'dock',id:earth.id,name:earth.name,body:earth});
 assert.equal(f.context.contextLabel(f.context.nearby()),'Attempt Earth approach');
 await f.context.interact();assert.equal(game.state.mode,'ship');assert.equal(game.state.locationId,null);
 assert.equal(f.counts.surface,0);assert.equal(f.counts.events,1);assert.equal(f.counts.save,1);assert.equal(f.context.tracked,'earth');
 assert.ok(!f.effects.includes('dock'));assert.ok(!f.toasts.some(([text])=>/Person mode/.test(text)));
});

test('recognized Earth landing still presents the ordinary person transition',async()=>{
 const game=ready();for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])game._flag(flag);game.travel('sol');game.state.pendingEncounter=null;
 const earth=game.system.bodies.find(body=>body.id==='earth');Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+40});
 const f=interactionFixture(game,{type:'dock',id:earth.id,name:earth.name,body:earth});
 assert.equal(f.context.contextLabel(f.context.nearby()),'Land');await f.context.interact();
 assert.equal(game.state.mode,'person');assert.equal(f.counts.surface,1);assert.ok(f.effects.includes('dock'));assert.equal(f.counts.save,1);
});

test('arrival warnings remain urgent after routine jump receipts and are scoped to the local hull',()=>{
 const game=ready();game.travel('sol');const id=game.state.ship.id;game.drainEvents();
 game.events.push({type:'jump',text:'Welcome to Sol.'},{type:'sol-cordon-warning',targetVesselId:id,text:'Turn away now. Fire in 8 seconds.'},
  {type:'sol-cordon-warning',targetVesselId:'another-captain',text:'A private warning for another hull.'},{type:'receipt',text:'Routine receipt.'});
 const toasts=[],sounds=[],scored=[],recorded=[];
 const context=load(['processEvents'],{game,updateRecovery(){},performance:{now:()=>0},sampleScoreContext:()=>({}),localSiteVisibility:()=>null,
  surface:null,network:null,visibleSiteCombatEvent:event=>event,classifyMusicEvent:event=>event,recordGuideEvent:event=>recorded.push(event),touchLayout:true,testSession:null,
  audio:{musicEvent:event=>scored.push(event),play:value=>sounds.push(value)},processCombatEvent:()=>false,toast:(...args)=>toasts.push(args),
 });context.processEvents();
 const warning=toasts.find(([text])=>text.startsWith('Turn away'));
 assert.equal(warning[1],'bad');assert.equal(warning[3].priority,'urgent');assert.ok(sounds.includes('alert'));
 assert.ok(!toasts.some(([text])=>text.includes('another hull')));assert.equal(scored.length,3);assert.equal(recorded.length,3);
});

test('Expert retains the live cordon countdown and withdrawal action without earning tutorial progress',()=>{
 const game=ready();game.travel('sol');const tutorial=new TutorialRuntime({nonce:'cordon-hazard'}),$=elements(),settings={guidance:'expert',compactTips:true};
 const context=load(['chooseGuidancePrompt','updateGuidance','showCoach','hideCoach'],{game,tutorial,$,settings,solCordonStatus,playing:true,dialog:{opened:false},viewPanelOpen:false,
  touchLayout:true,coachExpanded:false,coachPrompt:null,highlightedControl:null,toolTrayOpen:false,labelLayoutDirty:false,dismissedRoute:'',nearby:()=>null,
  selectGuide:()=>tutorial.select({seed:game.state.seed,mode:settings.guidance}),guidanceContext:()=>({playing:true,mode:'ship',systemId:'sol',device:'touch',guidance:settings.guidance,timeSeconds:tutorial.time}),
  document:{body:{classList:classes()}},hudText:(element,text)=>{const changed=element.textContent!==text;element.textContent=text;return changed;},
 });context.updateGuidance();assert.equal($('coachCard').hidden,false);assert.equal($('coachStep').textContent,'SOL QUARANTINE');assert.match($('coachTitle').textContent,/8s.*MAP.*Witness/);
 assert.equal($('coachDismiss').hidden,true);assert.equal(context.coachPrompt.critical,true);
 game.system.solCordon.visits[game.state.ship.id].elapsed=4.1;tutorial.time=40;context.updateGuidance();assert.match($('coachTitle').textContent,/4s/);
 assert.equal(tutorial.controller.count('flight-thrust'),0);assert.equal(tutorial.controller.count('dock'),0);
 game.system.solCordon.visits[game.state.ship.id].elapsed=9;context.updateGuidance();assert.equal($('coachCard').hidden,false);assert.match($('coachTitle').textContent,/Boost away.*MAP/);
 assert.equal(game.travel('witness').ok,true);context.updateGuidance();assert.equal($('coachCard').hidden,true);
});

test('arrival framing fits Earth and the ship in portrait and landscape without altering controls or saved zoom',()=>{
 const game=ready();game.travel('sol');const world=game.system,ship=game.state.ship,status=solCordonStatus(game),before=JSON.stringify({world,ship});
 const earth=world.bodies.find(body=>body.id==='earth');
 for(const [width,height]of [[390,640],[850,300]]){
  const frame=solCordonArrivalFrame(world,ship,status,{width,height,zoom:1});assert.ok(frame.zoom>0&&frame.zoom<=1);
  for(const point of [{x:earth.x-earth.radius,y:earth.y-earth.radius},{x:earth.x+earth.radius,y:earth.y+earth.radius},ship]){
   assert.ok(Math.abs(point.x-frame.x)*frame.zoom<width/2);assert.ok(Math.abs(point.y-frame.y)*frame.zoom<height/2);
  }
 }
 for(const phase of ['interdiction','outside','cleared'])assert.equal(solCordonArrivalFrame(world,ship,{...status,phase},{width:390,height:640,zoom:1}),null);
 assert.equal(JSON.stringify({world,ship}),before);
});

function captureContext(){const paths=[],fills=[],arcs=[];let path=[];return{paths,fills,arcs,save(){},restore(){},beginPath(){path=[];},arc(...args){arcs.push(args);},clip(){},
 setLineDash(){},moveTo(x,y){path.push(['move',x,y]);},lineTo(x,y){path.push(['line',x,y]);},stroke(){paths.push(path);},fillRect(...args){fills.push([this.fillStyle,...args]);}};}

test('cordon warning rays use the simulation volley and the visible scars stay deterministic and read-only',()=>{
 const game=ready();game.travel('sol');const world=game.system,enemy=world.enemies.find(actor=>actor.solCordon),ship=game.state.ship;
 enemy.active=true;Object.assign(enemy.cordonState,{phase:'windup',aimAngle:.35,remaining:.8,targetVesselId:ship.id});
 const before=JSON.stringify(world),options={ship,status:solCordonStatus(game)},a=captureContext(),b=captureContext();
 drawSolCordonOverlay(a,world,options);drawSolCordonOverlay(b,world,options);assert.deepEqual(a.fills,b.fills);assert.ok(a.fills.length>0);assert.equal(JSON.stringify(world),before);
 const telegraph=solCordonTelegraph(enemy),rays=a.paths.find(path=>path.length===telegraph.angles.length*2);assert.ok(rays);
 telegraph.angles.forEach((angle,index)=>{const start=rays[index*2],end=rays[index*2+1];assert.ok(Math.abs(start[1]-(enemy.x+Math.cos(angle)*telegraph.muzzleOffset))<1e-9);assert.ok(Math.abs(start[2]-(enemy.y+Math.sin(angle)*telegraph.muzzleOffset))<1e-9);assert.ok(Math.abs(Math.hypot(end[1]-start[1],end[2]-start[2])-telegraph.length)<1e-9);});
 const empty=captureContext();drawSolCordonOverlay(empty,{bodies:world.bodies},options);assert.equal(empty.fills.length,0);assert.equal(empty.paths.length,0);
});

test('tractor art follows authoritative source and target coordinates once per physical beam',()=>{
 const beam={phase:'locking',sourceId:'actual-flagship',source:{x:1660,y:1074},target:{x:1160,y:1260},targetVesselId:'local-ship'},world={solCordon:{visits:{'local-ship':{tractor:beam},'invalid':{tractor:{...beam,source:{x:NaN,y:0},targetVesselId:'bad'}}}}};
 const original=JSON.stringify(world),labels=[],ctx=captureContext(),to=(x,y)=>({x:x*.5+10,y:y*.5+20});
 drawSolTractors(ctx,world,{to,ship:{id:'local-ship'},status:{tractor:beam},emit:(...values)=>labels.push(values)});
 assert.equal(ctx.paths.length,1,'The local status and world visit describe one acquisition beam.');
 assert.deepEqual(ctx.paths[0],[['move',840,557],['line',590,650]]);assert.equal(labels.length,1);assert.equal(labels[0][0],'TRACTOR LOCK');
 assert.equal(JSON.stringify(world),original);
 const towing=captureContext();drawSolTractors(towing,{solCordon:{visits:{one:{tractor:{...beam,phase:'towing'}}}}},{to});
 assert.equal(towing.paths.length,2);assert.deepEqual(towing.paths[0],towing.paths[1]);
});
