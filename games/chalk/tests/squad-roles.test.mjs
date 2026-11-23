import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,selectSquadMember,setHumanPlayers,issueOrder,findPath,getSolidWalls,segmentRectEntry} from '../public/sim.mjs';
import {roleProfile,movementSpeed,visionRange} from '../public/squad-roles.mjs';
import {predictMovement} from '../public/coop-client.mjs';

function quietGame(options={}){
  const game=createGame({seed:17,...options});
  game.enemies=[];game.civilians=[];game.maxEnemies=0;
  return game;
}
function run(game,seconds,input={}){
  for(let frame=0;frame<Math.ceil(seconds*30)&&game.status==='playing';frame++)step(game,input,1/30);
}
function openArena(role='leader'){
  const game=quietGame(),actor=game.squad.find(a=>a.role===role);
  selectSquadMember(game,actor.id);
  game.world.walls=[];game.world.buildings=[];game.grid.fill(0);
  Object.assign(actor,{x:300,y:500,angle:0,cooldown:0});
  for(const other of game.squad)if(other!==actor)Object.assign(other,{x:2100,y:1700});
  game.waitUntil=10000;
  return {game,actor};
}
function enemy(game,x,y,extra={}){
  const actor={id:++game.nextId,team:'enemy',name:'Armed fighter',kind:'rifleman',x,y,angle:Math.PI,hp:72,maxHp:72,alive:true,downed:false,radius:13,cooldown:10000,suppression:0,reloadTimer:0,ammo:30,magSize:30,reserve:90,accuracy:0,path:[],pathTimer:0,visible:false,alert:true,...extra};
  game.enemies.push(actor);return actor;
}

test('four stable soldiers have distinct loadouts and the heavy role moves slower in simulation and prediction',()=>{
  const game=quietGame();
  assert.deepEqual(game.squad.map(a=>[a.name,a.role]),[['Hale','leader'],['Mercer','grenadier'],['Ames','medic'],['Webb','support']]);
  const [hale,mercer,ames,webb]=game.squad;
  assert.equal(mercer.grenades,4);assert.equal(ames.medkits,6);assert.equal(webb.magSize,100);
  assert.equal(roleProfile(webb).weaponLabel,'M249 SAW');assert.equal(roleProfile(webb).weapon,'support');
  assert.equal(movementSpeed(mercer)/movementSpeed(hale),.8);
  const arena=openArena('grenadier'),before={x:arena.actor.x,y:arena.actor.y};
  const predicted=predictMovement(arena.actor,{moveX:1,sprint:true},1/30,arena.game.world);
  step(arena.game,{moveX:1,sprint:true},1/30);
  assert.ok(Math.abs(arena.actor.x-predicted.x)<1e-9);assert.ok(arena.actor.x>before.x);
  const observed=predictMovement(arena.actor,{moveX:1,sprint:true,observe:true},1/30,arena.game.world);
  const observationStart=arena.actor.x;step(arena.game,{moveX:1,sprint:true,observe:true},1/30);
  assert.ok(Math.abs(arena.actor.x-observed.x)<1e-9);
  assert.ok(arena.actor.x-observationStart<1,'binoculars require a slow observation pace');
});

test('solo switching preserves soldiers and mission state, gives the old soldier to AI, and uses the selected name',()=>{
  const game=quietGame(),ids=game.squad.map(a=>a.id),[hale,mercer,ames]=game.squad;
  game.time=27;game.phaseTime=1.2;game.stats.shots=19;mercer.hp=63;mercer.ammo=12;
  const preserved={time:game.time,phaseTime:game.phaseTime,stats:{...game.stats}};
  assert.equal(selectSquadMember(game,mercer.id),true);assert.equal(game.role,'member');
  assert.equal(mercer.hp,63);assert.equal(mercer.ammo,12);
  assert.equal(game.time,preserved.time);assert.equal(game.phaseTime,preserved.phaseTime);assert.deepEqual(game.stats,preserved.stats);
  assert.deepEqual(game.squad.map(a=>a.id),ids);
  const oldPosition={x:hale.x,y:hale.y};run(game,.5);
  assert.ok(Math.hypot(hale.x-oldPosition.x,hale.y-oldPosition.y)>20,'Hale resumes AI leadership');
  assert.equal(selectSquadMember(game,ames.id),true);issueOrder(game,'ready');
  assert.equal(game.radio.at(-1).speaker,'AMES');
  assert.equal(selectSquadMember(game,hale.id),true);assert.equal(game.role,'leader');
  mercer.downed=true;assert.equal(selectSquadMember(game,mercer.id),false);
  assert.equal(selectSquadMember(game,9999),false);
  setHumanPlayers(game,ids.slice(0,2));assert.equal(selectSquadMember(game,ames.id),false,'co-op ownership cannot be bypassed');
});

test('a downed solo soldier stays selected until a deliberate switch, and a death leaves surviving soldiers playable',()=>{
  const {game,actor}=openArena('leader');actor.downed=true;actor.hp=0;
  step(game,{},1/30);assert.equal(game.playerId,actor.id);assert.equal(game.status,'playing');
  const replacement=game.squad[3];assert.equal(selectSquadMember(game,replacement.id),true);
  assert.equal(actor.downed,true);assert.equal(actor.hp,0);assert.equal(game.playerId,replacement.id);
  replacement.downed=true;replacement.hp=0;replacement.bleed=85;
  step(game,{},1/30);assert.equal(replacement.alive,false);assert.equal(game.status,'playing');
  assert.ok(game.squad.some(a=>a.id===game.playerId&&a.alive&&!a.downed));
});

test('medic aid is faster while the existing four-unit revive progress stays valid',()=>{
  function casualty(role){
    const {game,actor}=openArena(role),wounded=game.squad[1];
    Object.assign(wounded,{x:actor.x+35,y:actor.y,hp:0,downed:true});
    return {game,actor,wounded};
  }
  const medical=casualty('medic'),ordinary=casualty('leader');
  run(medical.game,2.7,{interact:true});run(ordinary.game,2.7,{interact:true});
  assert.equal(medical.wounded.downed,false);assert.ok(medical.wounded.hp>0);
  assert.equal(ordinary.wounded.downed,true);assert.ok(ordinary.wounded.reviveProgress>2.6&&ordinary.wounded.reviveProgress<3);
  assert.equal(medical.actor.medkits,6,'field revival retains the existing aid-supply rules');
});

test('street formations spread out and an off-grid indoor start routes through its doorway',()=>{
  const game=quietGame();run(game,5);
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
    assert.ok(Math.hypot(game.squad[i].x-game.squad[j].x,game.squad[i].y-game.squad[j].y)>45,'teammates leave readable space between silhouettes');
  }
  const house=game.world.buildings.find(b=>b.id==='b30a'),from={x:house.interior.x+14.8,y:house.y+114},to={x:house.doors[1].x+60,y:house.y+house.h+64};
  const route=findPath(game,from,to);assert.ok(route.length);
  let previous=from;
  for(const point of route){assert.ok(getSolidWalls(game.world).every(w=>!Number.isFinite(segmentRectEntry(previous,point,w,13))),'grid snapping cannot select a cell across a wall');previous=point;}
});

test('binoculars extend only the facing sector and never reveal through smoke or walls',()=>{
  const {game,actor}=openArena('grenadier');
  for(const other of game.squad)if(other!==actor)other.alive=false;
  const forward=enemy(game,1000,500,{alert:false}),side=enemy(game,300,1200,{alert:false});
  run(game,.2);assert.equal(forward.visible,false);assert.equal(side.visible,false);
  const ammo=actor.ammo,grenades=actor.grenades;
  run(game,.2,{observe:true,aimX:1300,aimY:500,fire:true,grenade:true});
  assert.equal(actor.observing,true);assert.equal(actor.ammo,ammo);assert.equal(actor.grenades,grenades);
  assert.equal(forward.visible,true);assert.equal(side.visible,false);
  assert.equal(visionRange(actor,2,forward),650);assert.equal(visionRange(actor,2,side),390);
  game.world.walls=[{x:650,y:0,w:20,h:1900}];run(game,.2,{observe:true,aimX:1300,aimY:500});
  assert.equal(forward.visible,false);
  game.world.walls=[];game.smokes=[{x:650,y:500,radius:105,ttl:14}];run(game,.2,{observe:true,aimX:1300,aimY:500});
  assert.equal(forward.visible,false);
  game.smokes=[];run(game,.2);assert.equal(actor.observing,false);assert.equal(forward.visible,false);
});

test('the launcher has finite rounds, a cooldown, a visible projectile and spatial blast events',()=>{
  const {game,actor}=openArena('grenadier');
  step(game,{grenade:true,aimX:540,aimY:500},1/30);
  assert.equal(actor.grenades,3);assert.ok(actor.grenadeCooldown>2.9);assert.equal(game.grenades.length,1);
  assert.ok(game.grenades[0].progress>0&&game.grenades[0].progress<1);
  assert.equal(game.soundEvents.at(-1).type,'grenade_launch');assert.equal(game.soundEvents.at(-1).weapon,'grenade');
  step(game,{grenade:true,aimX:540,aimY:500},1/30);assert.equal(actor.grenades,3,'cooldown prevents duplicate actions');
  run(game,1);assert.equal(game.grenades.length,0);
  const blast=game.effects.find(e=>e.type==='explosion');assert.ok(blast);assert.equal(blast.radius,76);assert.equal(blast.actorId,actor.id);
  assert.ok(game.soundEvents.some(e=>e.type==='explosion'&&Math.abs(e.x-540)<.01));
  for(let round=0;round<3;round++){run(game,3.1);step(game,{grenade:true,aimX:540,aimY:500},1/30);}
  run(game,3.1);step(game,{grenade:true,aimX:540,aimY:500},1/30);
  assert.equal(actor.grenades,0);assert.equal(game.stats.shots,4);
  const hale=game.squad[0];selectSquadMember(game,hale.id);step(game,{grenade:true},1/30);assert.equal(game.stats.shots,4);
});

test('launcher blasts register civilian harm and friendly exposure, while a wall shields its far side',()=>{
  const exposed=openArena('grenadier'),g=exposed.game;
  Object.assign(g.squad[0],{x:500,y:500});
  const target=enemy(g,500,520),civilian={id:++g.nextId,team:'civilian',name:'Civilian',x:500,y:480,hp:45,maxHp:45,alive:true,downed:false,radius:11,shelter:{x:500,y:480}};g.civilians=[civilian];
  step(g,{grenade:true,aimX:500,aimY:500},1/30);run(g,1);
  assert.ok(target.hp<target.maxHp);assert.ok(g.squad[0].hp<g.squad[0].maxHp);assert.equal(g.stats.civilianHarm,1);
  const protectedArena=openArena('grenadier'),protectedGame=protectedArena.game;
  protectedGame.world.walls=[{x:450,y:0,w:15,h:1900}];
  const front=enemy(protectedGame,430,500),behind=enemy(protectedGame,490,500);
  step(protectedGame,{grenade:true,aimX:510,aimY:500},1/30);run(protectedGame,1);
  assert.ok(front.hp<front.maxHp);assert.equal(behind.hp,behind.maxHp);
  const explosion=protectedGame.soundEvents.find(e=>e.type==='explosion');assert.ok(explosion.x<450,'launcher stops at the near wall face');
});

test('the SAW sustains fire, suppresses near misses and needs its longer belt reload',()=>{
  const {game,actor}=openArena('support');
  for(const other of game.squad)if(other!==actor)other.alive=false;
  const target=enemy(game,500,550);
  run(game,.6,{fire:true,aimX:700,aimY:500});
  assert.ok(actor.ammo<=94);assert.ok(target.suppression>0);assert.equal(target.hp,target.maxHp,'suppression does not require a direct hit');
  assert.ok(game.soundEvents.filter(e=>e.type==='shot').every(e=>e.weapon==='support'));
  actor.ammo=0;step(game,{reload:true},1/30);assert.equal(actor.reloadTimer,4.1);
  run(game,2.3);assert.equal(actor.ammo,0);assert.ok(actor.reloadTimer>1);
  run(game,2);assert.equal(actor.ammo,100);assert.equal(actor.reserve,200);
});

test('a sniper gives an aimed-shot warning, breaks charge on lost sight, and cannot one-shot a healthy soldier',()=>{
  const {game,actor}=openArena();for(const other of game.squad)if(other!==actor)other.alive=false;
  const sniper=enemy(game,1000,500,{kind:'sniper',name:'Sniper',ammo:5,magSize:5,cooldown:0,accuracy:0,aimCharge:0,aimTargetId:null});
  run(game,.8);assert.ok(sniper.aimCharge>.4&&sniper.aimCharge<1);assert.equal(sniper.visible,true,'a distant aiming glint has clear direct sight');
  assert.equal(game.soundEvents.filter(e=>e.type==='shot').length,0);
  game.smokes=[{x:650,y:500,radius:105,ttl:14}];run(game,.2);
  assert.equal(sniper.aimCharge,0);assert.equal(sniper.visible,false);
  game.smokes=[];run(game,1.3);assert.equal(game.soundEvents.filter(e=>e.type==='shot').length,0);
  run(game,.35);const shot=game.soundEvents.find(e=>e.type==='shot');assert.ok(shot);assert.equal(shot.weapon,'sniper');assert.ok(sniper.cooldown>3);
  run(game,.7);assert.ok(actor.hp<actor.maxHp);assert.ok(actor.hp>0);assert.equal(actor.downed,false);
  run(game,1.7);assert.equal(game.soundEvents.filter(e=>e.type==='shot').length,1,'sniper fires measured shots rather than automatic bursts');
  game.world.walls=[{x:650,y:0,w:20,h:1900}];run(game,2);assert.equal(sniper.aimCharge,0);
});

test('seeded snipers are occasional and the live population stays capped at one',()=>{
  let withSniper=0;
  for(let seed=1;seed<=48;seed++){
    const game=createGame({seed}),snipers=game.enemies.filter(a=>a.kind==='sniper');
    assert.ok(snipers.length<=1);if(snipers.length)withSniper++;
    game.spawnTimer=0;game.time=110;step(game,{},1/30);
    assert.ok(game.enemies.filter(a=>a.alive&&a.kind==='sniper').length<=1);
  }
  assert.ok(withSniper>0&&withSniper<24,'snipers add occasional variation, not a mandatory encounter on every map');
});
