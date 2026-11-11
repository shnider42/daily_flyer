import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { explorationSites, explorationLocation, createSiteState, stepSiteEncounter, resetSiteBoss, isBellwether, BELLWETHER_ID, BELLWETHER_PROFILE, claimSiteReward } from '../dist/exploration.mjs';
import { generateSurface, isWalkable, movePerson } from '../dist/surface.mjs';
import { isCabinWalkable } from '../dist/interior-layouts.mjs';
import { canSeeSitePoint, canSeeConcealedActor } from '../dist/site-visibility.mjs';
import { getPersonalWeapon, personalWeaponDamage } from '../dist/combat.mjs';

const body={id:'tinbell',name:'Tinbell',kind:'moon',biome:'barren',systemId:'hearth'};
const point=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const actor=(id='captain',position=point(27,11),weapon='pulse-sidearm')=>({id,name:id,person:{...position,health:100,maxHealth:100,facing:'up',speed:155,weapon,ownedWeapons:['pulse-sidearm',weapon]},input:{}});
function cave(seed='bellwether-test'){
 const location=explorationLocation(body,'hollow',seed),site=location.site,surface=generateSurface(location,seed),state=createSiteState(site);
 return{location,site,surface,state,boss:state.monsters[0]};
}
function arena(){
 const fixture=cave(),layout={cols:100,rows:80,tile:24,walkable:new Uint8Array(8000).fill(1)};
 fixture.surface={combatLayout:layout};Object.assign(fixture.boss,{x:600,y:600});return fixture;
}
function advance(fixture,actors,seconds,dt=.02){const events=[];for(let at=0;at<seconds-1e-8;at+=dt)events.push(...stepSiteEncounter(fixture.state,actors,Math.min(dt,seconds-at),fixture.surface));return events;}
function until(fixture,actors,predicate,limit=1000){const events=[];for(let frame=0;frame<limit&&!predicate();frame++)events.push(...stepSiteEncounter(fixture.state,actors,.01,fixture.surface));assert.ok(predicate(),'encounter reached the expected phase');return events;}

test('Tinbell has one unique concealed Bellwether across seeds, while other caves keep their wildlife',()=>{
 for(let seed=0;seed<20;seed++){
  const f=cave(`bell-${seed}`);assert.equal(f.state.monsters.length,1);assert.equal(f.boss.id,BELLWETHER_ID);assert.equal(f.boss.name,'The Bellwether');
  assert.equal(f.boss.species,'bellwether');assert.equal(f.boss.health,1500);assert.equal(f.boss.armor,20);assert.equal(f.boss.hidden,true);assert.equal(f.boss.revealed,false);
  assert.deepEqual({x:f.boss.x,y:f.boss.y},point(27,7));assert.ok(isCabinWalkable(f.surface.combatLayout,f.boss.x,f.boss.y,f.boss.radius));
  assert.equal(canSeeSitePoint(f.surface.combatLayout,f.surface.spawn,f.boss),false);
  const exit=f.surface.entities.find(entity=>entity.type==='siteExit');assert.ok(exit);assert.ok(Math.hypot(exit.x-f.surface.spawn.x,exit.y-f.surface.spawn.y)<=48);
  assert.equal(f.site.caches[0].id,'survey-case');assert.equal(f.site.records[0].id,'warning');
  const other=explorationSites({...body,id:'another-moon'},`bell-${seed}`).find(site=>site.id==='hollow');
  assert.ok(createSiteState(other).monsters.every(monster=>!isBellwether(monster)&&!monster.concealed));
 }
 const morrow=explorationSites({id:'morrow',kind:'planet'}).find(site=>site.id==='chalkfold');
 assert.deepEqual(createSiteState(morrow).monsters.map(monster=>monster.health),[96,48]);
});

test('entry, nearby occlusion and deliberate blind shots do not reveal or move the dormant creature',()=>{
 const f=cave(),captain=actor('captain',f.surface.spawn),before=structuredClone(f.boss);
 assert.deepEqual(advance(f,[captain],2),[]);assert.deepEqual(f.boss,before);assert.equal(captain.person.weaponDrawn,false);
 Object.assign(captain.person,point(19,7));assert.ok(Math.hypot(captain.person.x-f.boss.x,captain.person.y-f.boss.y)<230);
 assert.equal(canSeeSitePoint(f.surface.combatLayout,captain.person,f.boss),false);
 captain.input={fire:true,aiming:true,aimX:1,aimY:0};const events=advance(f,[captain],1);
 assert.ok(events.some(event=>event.type==='person-shot'&&!event.hit));assert.ok(!events.some(event=>event.type==='monster-revealed'));
 assert.deepEqual(f.boss,before);assert.equal(f.state.revealSerial,0);assert.equal(captain.person.aimTargetId,null);
 assert.equal(canSeeConcealedActor(f.surface.combatLayout,captain.person,f.boss),false);
});

test('a visible party member wakes it even when the nearest captain is occluded, and first fire cannot bypass the scream',()=>{
 const f=cave(),hidden=actor('hidden',point(19,7)),visible=actor('visible',point(24,16));
 assert.ok(Math.hypot(hidden.person.x-f.boss.x,hidden.person.y-f.boss.y)<Math.hypot(visible.person.x-f.boss.x,visible.person.y-f.boss.y));
 assert.equal(canSeeSitePoint(f.surface.combatLayout,visible.person,f.boss),true);
 const events=stepSiteEncounter(f.state,[hidden,visible],.01,f.surface),reveal=events.find(event=>event.type==='monster-revealed');
 assert.ok(reveal);assert.equal(reveal.targetId,'visible');assert.equal(reveal.siteId,f.state.id);assert.equal(reveal.actorId,BELLWETHER_ID);assert.equal(reveal.serial,1);
 assert.equal(f.boss.revealed,true);assert.equal(f.boss.hidden,false);assert.equal(f.boss.concealed,true);
 assert.equal(hidden.person.weaponDrawn,false,'another captain cannot grant sight through stone');
 assert.equal(advance(f,[hidden,visible],.3).filter(event=>event.type==='monster-revealed').length,0);
 const first=cave(),shooter=actor();shooter.input={fire:true};const firstEvents=stepSiteEncounter(first.state,[shooter],.01,first.surface);
 assert.ok(firstEvents.findIndex(event=>event.type==='monster-revealed')<firstEvents.findIndex(event=>event.type==='person-shot'));
 assert.equal(firstEvents.filter(event=>event.type==='monster-revealed').length,1);assert.equal(first.boss.health,1496);
});

test('the locked lunge gives a real sidestep and nearby recovery shooting window',()=>{
 const f=arena(),captain=actor('captain',{x:660,y:600},'breach-rifle');
 stepSiteEncounter(f.state,[captain],.01,f.surface);assert.equal(f.boss.phase,'windup');close(f.boss.windup,.8);const aim=f.boss.aimAngle;
 while(f.boss.phase==='windup'){captain.person.y+=155*.01;stepSiteEncounter(f.state,[captain],.01,f.surface);close(f.boss.aimAngle,aim);}
 assert.equal(captain.person.health,100,'telegraph itself deals no damage');
 while(f.boss.phase==='lunge'){captain.person.x+=155*.01;stepSiteEncounter(f.state,[captain],.01,f.surface);close(f.boss.aimAngle,aim);}
 assert.equal(f.boss.phase,'recovery');assert.equal(captain.person.health,100,'perpendicular movement clears the committed corridor');
 assert.ok(Math.hypot(captain.person.x-f.boss.x,captain.person.y-f.boss.y)<230,'following during the charge leaves a real firing position');
 const health=f.boss.health;captain.input={fire:true};const events=advance(f,[captain],1);
 assert.ok(events.filter(event=>event.type==='person-hit'&&event.targetId===BELLWETHER_ID).length>=2);
 assert.ok(f.boss.health<=health-144);assert.equal(captain.person.health,100);assert.equal(f.boss.phase,'recovery');
});

test('walking or maximum-trait sprinting straight away cannot avoid the committed charge indefinitely',()=>{
 assert.ok(BELLWETHER_PROFILE.speed>155*1.15,'chase closes even against the fastest ordinary sprint trait');
 for(const speed of [112,155*1.15]){
  const f=arena(),captain=actor('runner',{x:660,y:600});captain.person.speed=speed;
  stepSiteEncounter(f.state,[captain],.01,f.surface);const events=[];
  for(let frame=0;frame<220&&captain.person.health===100;frame++){
   captain.person.x+=speed*.01;events.push(...stepSiteEncounter(f.state,[captain],.01,f.surface));
  }
  assert.equal(captain.person.health,42,`${speed}-unit straight retreat is caught`);
  assert.equal(events.filter(event=>event.type==='person-hit'&&event.targetId==='runner').length,1);
 }
});

test('charges stop the complete physical hull at a wall and never hit through it',()=>{
 const f=arena(),captain=actor('bait',{x:660,y:600}),layout=f.surface.combatLayout;
 for(let y=0;y<layout.rows;y++)layout.walkable[y*layout.cols+30]=0;
 stepSiteEncounter(f.state,[captain],.01,f.surface);assert.equal(f.boss.phase,'windup');
 Object.assign(captain.person,{x:800,y:600});const events=until(f,[captain],()=>f.boss.phase==='recovery');
 assert.ok(f.boss.x+f.boss.radius<720);assert.ok(isCabinWalkable(layout,f.boss.x,f.boss.y,f.boss.radius));
 assert.equal(captain.person.health,100);assert.ok(!events.some(event=>event.type==='person-hit'));
 close(f.boss.aimAngle,0);assert.equal(f.boss.recovery,1.1);
});

test('standing against a cave wall or visible corner cannot make a captain immune to later charges',()=>{
 for(const tile of [[27,5],[18,8]]){
  const f=cave(),captain=actor('wall-camper',point(...tile));captain.input={fire:true};const events=[];
  assert.ok(isWalkable(f.surface,captain.person.x,captain.person.y,6));
  for(let frame=0;frame<1800&&captain.person.health>0;frame++)events.push(...stepSiteEncounter(f.state,[captain],1/60,f.surface));
  assert.equal(captain.person.health,0,`stationary captain at ${tile} must move to survive`);
  assert.equal(events.filter(event=>event.type==='person-hit'&&event.targetId===captain.id).length,2);
  assert.equal(f.boss.health,1500,'the unfinished boss resets after this solo wipe');assert.equal(f.boss.revealed,false);
 }
});

test('two distinct charges down a standard captain, each charge hits once, and a party wipe resets only the living boss',()=>{
 const f=arena(),captain=actor('stationary',{x:660,y:600});
 const events=until(f,[captain],()=>captain.person.down,1500),hits=events.filter(event=>event.type==='person-hit'&&event.targetId===captain.id);
 assert.equal(hits.length,2);assert.deepEqual(hits.map(hit=>hit.damage),[58,58]);assert.equal(captain.person.health,0);
 assert.equal(f.boss.health,1500);assert.equal(f.boss.phase,'dormant');assert.equal(f.boss.hidden,true);assert.equal(f.state.attemptSerial,1);
 assert.equal(resetSiteBoss(f.state),false,'idle ticks cannot keep incrementing the attempt');
});

test('a new Bellwether preserves old cache claims, current wounds reload, and its own death stays permanent',()=>{
 const f=cave(),old={cleared:true,visited:3,collected:['survey-case'],monsters:[{id:'tinbell:site:hollow:wildlife:0',health:0},{id:'tinbell:site:hollow:wildlife:1',health:0}]};
 const added=createSiteState(f.site,old);assert.equal(added.monsters.length,1);assert.equal(added.monsters[0].health,1500);assert.equal(added.cleared,false);assert.deepEqual(added.collected,['survey-case']);
 assert.equal(claimSiteReward(added,f.site,'survey-case').ok,false,'new content does not repay an old cache');
 const captain=actor();captain.input={fire:true};stepSiteEncounter(f.state,[captain],.01,f.surface);
 const current=createSiteState(f.site,structuredClone(f.state));assert.equal(current.monsters[0].health,1496);assert.equal(current.monsters[0].revealed,true);assert.equal(current.revealSerial,1);
 Object.assign(captain.person,{weapon:'breach-rifle',ownedWeapons:['pulse-sidearm','breach-rifle']});f.state.actorCooldowns={};f.boss.health=72;
 stepSiteEncounter(f.state,[captain],.01,f.surface);assert.equal(f.boss.health,0);assert.equal(f.state.cleared,true);assert.equal(resetSiteBoss(f.state),false);
 assert.equal(claimSiteReward(f.state,f.site,'survey-case').ok,true);
 const dead=createSiteState(f.site,structuredClone(f.state));assert.equal(dead.monsters[0].health,0);assert.equal(dead.monsters[0].phase,'dead');assert.equal(dead.cleared,true);
 assert.equal(resetSiteBoss(dead),false);assert.equal(claimSiteReward(dead,f.site,'survey-case').ok,false);
});

test('the shell resists the starting sidearm while earned weapons make the same fight substantially shorter',()=>{
 const expected={'pulse-sidearm':4,'field-carbine':23,'breach-rifle':72},shots={};
 for(const [weapon,damage] of Object.entries(expected)){
  const f=cave(),captain=actor('armed',point(27,11),weapon);captain.input={fire:true};
  assert.equal(personalWeaponDamage(captain.person,f.boss),damage);
  const event=stepSiteEncounter(f.state,[captain],.01,f.surface).find(event=>event.type==='person-hit');
  assert.equal(event.damage,damage);assert.equal(event.weaponId,weapon);assert.equal(f.boss.health,1500-damage);
  shots[weapon]=Math.ceil(1500/damage);assert.equal(getPersonalWeapon(captain.person).id,weapon);
 }
 assert.equal(shots['pulse-sidearm'],375);assert.equal(shots['breach-rifle'],21);
 const f=cave(),forged=actor();forged.person.weapon='breach-rifle';forged.person.damage=9999;forged.person.armorPiercing=9999;forged.input={fire:true,weaponId:'breach-rifle',damage:9999};
 assert.equal(stepSiteEncounter(f.state,[forged],.01,f.surface).find(event=>event.type==='person-hit').damage,4,'input and unowned weapon fields cannot bypass the shell');
});

test('the actual cave supports dodging and recovery punishment, with a much shorter earned-rifle fight',()=>{
 const outcomes={};
 for(const weapon of ['pulse-sidearm','breach-rifle']){
  const f=cave('bell-calibration'),captain=actor('pilot',point(27,11),weapon);captain.input={fire:true};
  let lastWindup=-1,dodge={x:0,y:0},hits=0,charges=0,recoveryHits=0;
  for(let frame=0;frame<3600&&f.boss.health>0&&captain.person.health>0;frame++){
   const p=captain.person,boss=f.boss,dx=boss.x-p.x,dy=boss.y-p.y,distance=Math.hypot(dx,dy),dt=1/60;let mx=0,my=0;
   if(boss.phase==='windup'){
    if(lastWindup!==boss.attackUntil){
     lastWindup=boss.attackUntil;charges++;let best=-Infinity;
     // A deliberate player checks which side of the marked corridor has room.
     // Both planning and actual movement use the real cave's wall collision.
     for(const sign of [-1,1]){
      const direction={x:-Math.sin(boss.aimAngle)*sign,y:Math.cos(boss.aimAngle)*sign},copy={...p};
      for(let step=0;step<4;step++)movePerson(f.surface,copy,direction.x,direction.y,.2);
      const cross=Math.abs(-(copy.x-boss.x)*Math.sin(boss.aimAngle)+(copy.y-boss.y)*Math.cos(boss.aimAngle));
      if(cross>best){best=cross;dodge=direction;}
     }
    }
    mx=dodge.x;my=dodge.y;
   }else if(boss.phase==='lunge'){mx=Math.cos(boss.aimAngle);my=Math.sin(boss.aimAngle);}
   else if(boss.phase==='recovery'&&distance>145){mx=dx/distance;my=dy/distance;}
   else if(boss.phase==='chase'&&distance<85){mx=-dx/distance;my=-dy/distance;}
   movePerson(f.surface,p,mx,my,dt);const beforePhase=boss.phase;
   const events=stepSiteEncounter(f.state,[captain],dt,f.surface),landed=events.filter(event=>event.type==='person-hit'&&event.targetId===boss.id).length;
   hits+=landed;if(beforePhase==='recovery')recoveryHits+=landed;
   assert.ok(isWalkable(f.surface,p.x,p.y,6));assert.ok(isCabinWalkable(f.surface.combatLayout,boss.x,boss.y,boss.radius));
  }
  outcomes[weapon]={health:f.boss.health,time:f.state.time,playerHealth:captain.person.health,hits,charges,recoveryHits};
 }
 assert.equal(outcomes['breach-rifle'].health,0);assert.ok(outcomes['breach-rifle'].time<20);assert.equal(outcomes['breach-rifle'].hits,21);
 assert.ok(outcomes['breach-rifle'].charges>=4);assert.ok(outcomes['breach-rifle'].recoveryHits>=4,'several real recovery windows produce successful shots');
 assert.equal(outcomes['breach-rifle'].playerHealth,100,'each committed attack remains avoidable');
 assert.ok(outcomes['pulse-sidearm'].health>750,'even a perfect early captain still faces a sustained fight');
 assert.ok(outcomes['pulse-sidearm'].charges>=15);assert.ok(outcomes['pulse-sidearm'].time>=59);
});

test('invalid saved boss poses return to the alcove without restoring wounds or resetting claimed supplies',()=>{
 const f=cave(),saved=structuredClone(f.state);Object.assign(saved.monsters[0],{x:24,y:24,health:800,revealed:true,alert:true,phase:'lunge',lungeRemaining:9999});saved.collected=['survey-case'];
 const restored=createSiteState(f.site,saved),captain=actor('captain',f.surface.spawn);
 stepSiteEncounter(restored,[captain],.01,f.surface);const boss=restored.monsters[0];
 assert.ok(isCabinWalkable(f.surface.combatLayout,boss.x,boss.y,boss.radius));assert.equal(boss.health,800);assert.deepEqual(restored.collected,['survey-case']);
 assert.notEqual(boss.phase,'lunge');assert.equal(boss.lungeRemaining,0);
});

test('solo retreat resets the unfinished attempt, active reload keeps wounds, and reveal IDs change on the next attempt',()=>{
 const game=new Game('bellwether-solo'),moon=game.system.bodies.find(body=>body.id==='tinbell');
 Object.assign(game.state.ship,{x:moon.x,y:moon.y+moon.radius+60,vx:0,vy:0});assert.equal(game.dock('tinbell').ok,true);
 const enter=()=>{const surface=generateSurface(game.currentBody,game.state.seed),door=surface.entities.find(entity=>entity.type==='siteEntrance'&&entity.data.siteId==='hollow');Object.assign(game.state.person,{x:door.x,y:door.y});assert.equal(game.enterSite('hollow').ok,true);};
 enter();assert.equal(game.state.person.weaponDrawn,false);Object.assign(game.state.person,point(27,11));game.drainEvents();game.stepExploration(.01,{fire:true});
 const encounter=game.state.exploration.encounter,boss=encounter.monsters[0],first=game.drainEvents().find(event=>event.type==='monster-revealed');assert.equal(boss.health,1496);
 const restored=Game.fromSave(game.save());assert.equal(restored.state.exploration.encounter.monsters[0].health,1496);assert.equal(restored.state.exploration.encounter.monsters[0].revealed,true);
 restored.stepExploration(.01,{});assert.ok(!restored.drainEvents().some(event=>event.type==='monster-revealed'));
 const exit=game._expeditionSurface().entities.find(entity=>entity.type==='siteExit');Object.assign(game.state.person,{x:exit.x,y:exit.y});assert.equal(game.exitSite().ok,true);
 assert.equal(boss.health,1500);assert.equal(boss.revealed,false);assert.equal(boss.phase,'dormant');
 enter();Object.assign(game.state.person,point(27,11));game.drainEvents();game.stepExploration(.01,{});const next=game.drainEvents().find(event=>event.type==='monster-revealed');
 assert.ok(next);assert.notEqual(next.id,first.id);assert.equal(next.serial,first.serial+1);assert.equal(next.attemptSerial,1);
});
