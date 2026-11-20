import test from 'node:test';
import assert from 'node:assert/strict';
import * as Sim from '../public/sim.mjs';
import { WORLD, LOCATIONS, isLand, isSolid, islandAt } from '../public/world.mjs';
import { MISSIONS } from '../public/content.mjs';

function tick(g,seconds,input={}){for(let t=0;t<seconds;t+=.05)Sim.step(g,input,.05);}
function emptyGame(){const g=Sim.createGame();g.dialogue=null;g.mission=null;return g;}
function islandPoint(id){for(let x=100;x<WORLD.width;x+=40)for(let y=100;y<WORLD.height;y+=40)if(islandAt(x,y)===id&&!isSolid(x,y,20))return {x,y};throw Error('Missing island');}
function completeCurrent(g,choiceIndex=0,stopAtChoice=false){
 for(let guard=0;g.mission&&guard<200;guard++){
  if(g.dialogue){if(stopAtChoice&&g.dialogue._kind==='choice')return;Sim.choose(g,g.dialogue._kind==='choice'?Math.min(choiceIndex,g.dialogue.choices.length-1):0);continue;}
  const m=MISSIONS.find(m=>m.id===g.mission.id),s=m.steps[g.mission.step],p=g.player;
  if(['go','return'].includes(s.type)){p.interior=null;p.vehicleId=null;Object.assign(p,LOCATIONS[s.location].door);}
  if(s.type==='enter'){p.interior=s.location;p.x=320;p.y=150;}
  if(s.type==='interact'){p.interior=s.location;p.vehicleId=null;p.x=320;p.y=150;Sim.interact(g);continue;}
  if(s.type==='drive'){const v=g.vehicles.find(v=>s.vehicle?v.type===s.vehicle:v.type!=='boat');assert.ok(v,`A ${s.vehicle||'land'} vehicle exists`);p.vehicleId=v.id;p.interior=null;if(s.location)Object.assign(v,{x:LOCATIONS[s.location].door.x,y:LOCATIONS[s.location].door.y+30});Object.assign(p,{x:v.x,y:v.y});}
  if(s.type==='escape'){p.vehicleId=null;p.interior='home';p.x=320;p.y=250;tick(g,160);continue;}
  if(s.type==='survive'){tick(g,(s.duration||20)+1);continue;}
  Sim.step(g,{},.05);
 }
 assert.equal(g.mission,null,'Mission should finish without a softlock');
}

test('Opening begins beside an accessible cafe and authored vehicles have valid terrain',()=>{
 const g=Sim.createGame();assert.equal(g.mission.id,MISSIONS[0].id);assert.equal(g.progress.unlocked,0);assert.equal(isSolid(g.player.x,g.player.y,10),false);
 assert.ok(g.vehicles.find(v=>v.owned&&v.type==='compact'));
 for(const v of g.vehicles.filter(v=>!v.traffic)){assert.equal(isSolid(v.x,v.y,8),false,`${v.id} must not spawn in a building`);assert.equal(isLand(v.x,v.y),v.type!=='boat',`${v.id} must spawn on matching terrain`);}
});

test('Trespassing both later islands triggers six stars on foot or after leaving a boat',()=>{
 for(const unlock of [0,1]){const g=emptyGame();g.progress.unlocked=unlock;Object.assign(g.player,islandPoint(unlock+1));Sim.step(g,{},.05);assert.equal(g.wanted.stars,6);assert.equal(g.wanted.restricted,true);tick(g,3);assert.equal(g.wanted.stars,6);assert.ok(g.police.some(c=>c.kind==='helicopter'&&Number.isFinite(c.x)&&Number.isFinite(c.y)),'Six-star helicopter persists with finite coordinates');}
 const g=emptyGame();g.progress.unlocked=2;Object.assign(g.player,islandPoint(2));Sim.step(g,{},.05);assert.equal(g.wanted.stars,0);
});

test('Witness reports take time, unwitnessed theft stays unseen, and hiding clears a search',()=>{
 const g=emptyGame();g.npcs=[];g.police=[];assert.equal(Sim.addCrime(g,1,'Theft'),false);assert.equal(g.wanted.stars,0);
 g.npcs.push({id:'witness',x:g.player.x+40,y:g.player.y,homeX:g.player.x+40,homeY:g.player.y,hp:50,angle:0,walkTime:99,panic:0});
 assert.equal(Sim.addCrime(g,1,'Theft'),true);assert.ok(g.wanted.report>0);assert.equal(g.wanted.stars,0);tick(g,3.2);assert.ok(g.wanted.stars>=1);
 g.player.interior='home';g.player.x=320;g.player.y=250;tick(g,50);assert.equal(g.wanted.stars,0);assert.equal(g.wanted.mode,'clear');
});

test('Arrest confiscates ammunition and impounds the car; death keeps ammunition and both preserve story',()=>{
 const g=emptyGame();g.progress.completed=[MISSIONS[0].id];g.player.ammo=37;g.player.cash=200;const car=g.vehicles.find(v=>v.owned&&v.type==='compact');g.player.vehicleId=car.id;Sim.addCrime(g,6,'Test');Sim.surrender(g);
 assert.equal(g.phase,'busted');assert.equal(g.player.ammo,0);assert.equal(car.impounded,true);assert.equal(g.progress.arrests,1);const afterFine=g.player.cash;
 Sim.recover(g,'continue');assert.equal(g.phase,'playing');assert.equal(g.wanted.stars,0);assert.equal(g.player.hp,100);assert.equal(g.player.cash,afterFine);assert.deepEqual(g.progress.completed,[MISSIONS[0].id]);assert.ok(Math.hypot(g.player.x-LOCATIONS.precinct.door.x,g.player.y-LOCATIONS.precinct.door.y)<90);
 const d=emptyGame();d.progress.completed=[MISSIONS[0].id];d.player.ammo=37;d.player.hp=1;d.player.invulnerable=0;d.bullets=[{x:d.player.x,y:d.player.y,vx:0,vy:0,owner:'police',damage:30,life:1,interior:null}];Sim.step(d,{},.05);assert.equal(d.phase,'down');assert.equal(d.player.ammo,37);Sim.recover(d);assert.equal(d.player.ammo,37);assert.equal(d.progress.deaths,1);assert.deepEqual(d.progress.completed,[MISSIONS[0].id]);
});

test('Every authored mission and choice is reachable; unlocks occur sequentially; rewards cannot repeat',()=>{
 const g=Sim.createGame();completeCurrent(g);assert.ok(g.progress.completed.includes(MISSIONS[0].id));assert.equal(Sim.startMission(g,MISSIONS[0].id),false);
 for(const m of MISSIONS.slice(1)){g.player.interior='home';g.player.x=320;g.player.y=250;tick(g,170);assert.ok(Sim.getAvailableMissions(g).some(x=>x.id===m.id),`${m.id} available after prerequisites`);const before=g.progress.unlocked;assert.equal(Sim.startMission(g,m.id),true);completeCurrent(g);if(m.unlockIsland){assert.equal(g.progress.unlocked,before+1);assert.equal(g.progress.unlocked,m.unlockIsland);}}
 assert.equal(g.progress.completed.length,MISSIONS.length);assert.equal(g.progress.unlocked,2);assert.equal(g.progress.flags.storyComplete,true);assert.ok(Object.keys(g.progress.choices).length>5);
 const cash=g.player.cash;assert.equal(Sim.startMission(g,MISSIONS.at(-1).id),false);assert.equal(g.player.cash,cash);
});

test('Checkpoint restoration retains money, interior, decisions and a recoverable arrest state',()=>{
 const g=Sim.createGame();g.player.interior='home';g.player.x=320;g.player.y=240;g.player.cash=619;g.progress.choices.example='community';g.progress.rep.community=3;
 const restored=Sim.restoreGame(Sim.serializeGame(g));assert.equal(restored.player.cash,619);assert.equal(restored.player.interior,'home');assert.equal(restored.progress.choices.example,'community');assert.equal(restored.progress.rep.community,3);
 Sim.addCrime(restored,6,'Test');Sim.surrender(restored);const again=Sim.restoreGame(Sim.serializeGame(restored));assert.equal(again.phase,'busted');assert.equal(Sim.recover(again),true);
 const sea=emptyGame(),vessel=sea.vehicles.find(v=>v.type==='boat'&&v.owned);Object.assign(vessel,{x:1990,y:1830});Object.assign(sea.player,{x:vessel.x,y:vessel.y,vehicleId:vessel.id});Sim.startMission(sea,MISSIONS[0].id);Sim.addCrime(sea,6,'Test');Sim.surrender(sea);Sim.recover(sea,'retry');assert.ok(isLand(sea.player.x,sea.player.y),'Impounded offshore checkpoint returns to safe land');assert.ok(islandAt(sea.player.x,sea.player.y)<=sea.progress.unlocked,'Recovery never deposits player on a restricted island');
 assert.throws(()=>Sim.restoreGame({}),/incomplete/);const invalid=Sim.serializeGame(g);invalid.player.x='oops';assert.throws(()=>Sim.restoreGame(invalid),/invalid/);
});

test('Pedestrian movement cannot cross building walls; exit prompts and vehicle switching work',()=>{
 const g=emptyGame(),l=LOCATIONS.cafe;g.player.x=l.x+l.w/2;g.player.y=l.y+l.h+22;tick(g,1,{my:-1});assert.ok(g.player.y>=l.y+l.h+9);assert.equal(Sim.getPrompt(g)?.kind,'enter');Sim.interact(g);assert.equal(g.player.interior,'cafe');g.player.x=320;g.player.y=420;Sim.interact(g);assert.equal(g.player.interior,null);
 const car=g.vehicles.find(v=>v.owned&&v.type==='compact');Object.assign(g.player,{x:car.x+35,y:car.y});assert.equal(Sim.interact(g),true);assert.equal(g.player.vehicleId,car.id);Sim.interact(g);assert.equal(g.player.vehicleId,null);
});


test('Criminal decisions, heat and checkpoint retries preserve applied rewards without replay farming',()=>{
 const g=Sim.createGame();completeCurrent(g,0,true);assert.equal(g.dialogue._kind,'choice');const startCash=g.player.cash;Sim.choose(g,0);assert.equal(g.player.cash,startCash+120);assert.equal(g.dialogue._kind,'story');assert.match(g.dialogue.text,/accept the fee/);assert.equal(g.mission.step,7,'Choice result remains visible until Continue');
 Sim.addCrime(g,6,'Test arrest');Sim.surrender(g);const afterFine=g.player.cash;Sim.recover(g,'retry');completeCurrent(g);assert.equal(g.player.cash,afterFine+MISSIONS[0].reward,'Replayed choice must not pay twice');assert.equal(g.progress.choices['first_favor:7'],'take_fee');assert.equal(Sim.toggleWeapon(g),true);
 Sim.addCrime(g,6,'Another arrest');Sim.surrender(g);Sim.recover(g);assert.equal(Sim.toggleWeapon(g),false,'A confiscated weapon cannot be redrawn');
 const c=emptyGame();c.progress.completed=['first_favor'];c.player.interior='home';assert.ok(Sim.startMission(c,'paper_trail'));completeCurrent(c,1);assert.equal(c.progress.flags.private_ledger,true);assert.ok(c.progress.rep.underworld>=2);assert.equal(c.wanted.stars,0);
});

test('Boat delivery requires reaching an offshore destination; races and medical transport have distinct objectives',()=>{
 const g=emptyGame();g.player.interior='docks';assert.equal(Sim.service(g,'job-boat'),true);assert.deepEqual({x:Sim.getObjective(g).x,y:Sim.getObjective(g).y,inside:Sim.getObjective(g).interior},{x:320,y:420,inside:true});const boat=g.vehicles.find(v=>v.type==='boat'&&v.owned);g.player.interior=null;Object.assign(g.player,LOCATIONS.docks.door);assert.equal(Sim.getObjective(g).x,boat.x,'Before boarding, marker points to boat rather than buoy');assert.equal(Sim.getObjective(g).y,boat.y);g.player.vehicleId=boat.id;Object.assign(g.player,{x:boat.x,y:boat.y});const cash=g.player.cash;Sim.step(g,{},.05);assert.ok(g.job);assert.equal(g.player.cash,cash);Object.assign(boat,g.job.destination);Sim.step(g,{},.05);assert.equal(g.job,null);assert.equal(g.player.cash,cash+160);
 g.player.vehicleId=null;g.player.interior='garage';Sim.service(g,'job-race');const car=g.vehicles.find(v=>v.type==='compact');g.player.vehicleId=car.id;g.player.interior=null;Sim.step(g,{},.05);assert.ok(g.job.timeLeft<110);for(let i=0;i<3;i++){Object.assign(car,g.job.checkpoints[g.job.checkpoint]);Sim.step(g,{},.05);}assert.equal(g.job,null);assert.equal(g.player.cash,cash+160+220);
 g.player.vehicleId=null;g.player.interior='clinic';Sim.service(g,'job-rescue');g.player.interior=null;g.player.vehicleId=car.id;Sim.step(g,{},.05);assert.equal(g.job.stage,'pickup');Object.assign(car,g.job.destination);car.speed=0;Sim.step(g,{},.05);assert.equal(g.job.stage,'deliver');Object.assign(car,{x:LOCATIONS.clinic.door.x,y:LOCATIONS.clinic.door.y+15});Sim.step(g,{},.05);assert.equal(g.job,null);assert.equal(g.player.cash,cash+160+220+140);assert.equal(g.progress.rep.community,1);
});

test('Business services require proximity and an impounded vehicle stays inaccessible until recovered',()=>{
 const g=emptyGame();g._lastDoor='market';g.player.x=450;g.player.y=900;const cash=g.player.cash;assert.equal(Sim.service(g,'ammo'),false);assert.equal(g.player.cash,cash);
 const car=g.vehicles.find(v=>v.owned&&v.type==='compact');g.vehicles=[car];car.impounded=true;Object.assign(g.player,{x:car.x+30,y:car.y});assert.notEqual(Sim.getPrompt(g)?.kind,'vehicle');
 g.player.interior='precinct';g.player.x=320;g.player.y=150;assert.equal(Sim.service(g,'tow'),true);assert.equal(car.impounded,false);assert.ok(Math.hypot(car.x-LOCATIONS.precinct.door.x,car.y-LOCATIONS.precinct.door.y)<400);
 const h=emptyGame(),compact=h.vehicles.find(v=>v.type==='compact'&&v.owned),truck=h.vehicles.find(v=>v.id==='tomi-truck');Object.assign(compact,{x:810,y:1780,hp:20});truck.hp=80;h.player.cash=1000;Object.assign(h.player,{x:845,y:1780});assert.equal(Sim.interact(h),true);assert.equal(h.player.vehicleId,compact.id);Sim.interact(h);assert.equal(h.player.lastVehicleId,compact.id);h.player.interior='garage';assert.equal(Sim.service(h,'repair'),true);assert.equal(compact.hp,105);assert.equal(truck.hp,80,'Repair must not silently select the nearer truck');const truckColor=truck.color;assert.equal(Sim.service(h,'paint'),true);assert.equal(truck.color,truckColor,'Respray targets the last driven car');
 h.player.interior=null;h.player.vehicleId=truck.id;Sim.addCrime(h,6,'Test truck impound');Sim.surrender(h);Sim.recover(h);h.player.interior='precinct';const compactPosition={x:compact.x,y:compact.y};assert.equal(Sim.service(h,'tow'),true);assert.equal(truck.impounded,false,'The arrested truck must be recovered instead of the first compact');assert.deepEqual({x:compact.x,y:compact.y},compactPosition);assert.equal(h.player.lastVehicleId,truck.id);

});
