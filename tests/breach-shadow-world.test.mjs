import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../daily_flyer/themes/breach_assets/core.mjs';
import {CoopGame} from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import {
  SHADOW, SHADOW_ID, SHADOW_WORLD_REVISION, SHADOW_PUZZLE_IDS, SHADOW_ADDED_SOLID_BOUNDS,
  platformSolid, platformStatus, shadowGroundAt, courseStatus, shadowPuzzleInfo,
  useShadowPuzzle, shadowPuzzleStateValid, jumpInfo, updateTraversal,
} from '../daily_flyer/themes/breach_assets/shadow.mjs';

const makeGame=()=>{const game=new Game({mission:SHADOW_ID});game.start();return game;};
const object=(game,id)=>game.state.interactables.find(o=>o.id===id);
const position=(game,o)=>Object.assign(game.state.player,{x:o.x,z:o.z,jump:null,elevation:0});
const power=game=>{
  const console=object(game,'aux-power');position(game,console);
  assert.ok(Game.prototype.interact.call(game));assert.equal(game.state.power,true);
};
const use=(game,id)=>{const o=object(game,id);position(game,o);return useShadowPuzzle(game,o);};
const aim=(game,id)=>{
  const jump=object(game,id);position(game,jump);
  game.state.player.angle=Math.atan2(jump.landing.x-jump.x,-(jump.landing.z-jump.z));
  return jump;
};
const inBounds=(b,x,z)=>x>=b.x1&&x<b.x2&&z>=b.z1&&z<b.z2;

test('ten authored district identities include two different growing houses and physical landmarks',()=>{
  assert.equal(SHADOW_WORLD_REVISION,2);
  assert.equal(SHADOW.zones.length,10);
  assert.equal(new Set(SHADOW.zones.map(zone=>zone.identity)).size,10);
  assert.equal(new Set(SHADOW.zones.map(zone=>zone.motif)).size,10);
  for(const zone of SHADOW.zones){
    assert.match(zone.accent,/^#[0-9a-f]{6}$/i);
    assert.ok(zone.description&&zone.landmarkLabel,zone.id);
    assert.ok(SHADOW.landmarks.some(landmark=>landmark.shadowDistrict===zone.id),zone.id);
  }
  for(const id of ['null','hydra']){
    const types=SHADOW.landmarks.filter(p=>p.shadowDistrict===id).map(p=>p.type);
    assert.ok(types.includes('glass-lab'),id);
    assert.ok(types.includes('cultivation-bed'),id);
    assert.ok(SHADOW.gardenZones.some(zone=>zone.zoneId===id&&zone.type==='water'),id);
    assert.ok(SHADOW.skylights.some(light=>light.zoneId===id),id);
  }
  assert.ok(SHADOW.skylights.find(light=>light.zoneId==='hydra').fractured);
});

test('all pickups, controls, enemies and arrivals are clear of every physical prop',()=>{
  const game=makeGame();
  for(const o of [...SHADOW.pickups,...SHADOW.interactables,...SHADOW.enemies,...SHADOW.coopSpawns]){
    assert.equal(SHADOW.grid[Math.floor(o.z)]?.[Math.floor(o.x)],'.',o.id||'arrival');
    assert.ok(game._clearCircle(o.x,o.z,.23),o.id||'arrival');
  }
  for(const jump of SHADOW.interactables.filter(o=>o.type==='jump')){
    assert.ok(game._clearCircle(jump.landing.x,jump.landing.z,.23),jump.id);
    const room=SHADOW.platformRooms.find(room=>room.id===jump.course);
    assert.ok(inBounds(room.platforms[jump.target],jump.landing.x,jump.landing.z),jump.id);
  }
  assert.ok(SHADOW.grid.join('').split('.').length-1>6500);
});

test('migration footprints describe only real new solid landmarks with exclusive upper edges',()=>{
  assert.ok(SHADOW_ADDED_SOLID_BOUNDS.length>0);
  for(const bounds of SHADOW_ADDED_SOLID_BOUNDS){
    const landmark=SHADOW.landmarks.find(p=>p.id===bounds.id);
    assert.ok(landmark,bounds.id);
    assert.equal(bounds.x2-bounds.x1,landmark.width);
    assert.equal(bounds.z2-bounds.z1,landmark.depth);
    for(let z=bounds.z1;z<bounds.z2;z++)for(let x=bounds.x1;x<bounds.x2;x++)assert.equal(SHADOW.grid[z][x],'#',`${bounds.id} ${x},${z}`);
    assert.ok(!SHADOW.platformRooms.some(room=>bounds.x1<room.x2&&bounds.x2>room.x1&&bounds.z1<room.z2&&bounds.z2>room.z1),bounds.id);
  }
});

test('new geometry retains an outside walking route to every required objective and weapon',()=>{
  const game=makeGame();game.state.doors.forEach(door=>{door.open=true;});
  const queue=[[Math.floor(SHADOW.spawn.x),Math.floor(SHADOW.spawn.z)]],seen=new Set();
  for(let i=0;i<queue.length;i++){
    const[x,z]=queue[i],key=`${x},${z}`;
    if(seen.has(key)||game._wall(x+.5,z+.5)||SHADOW.platformRooms.some(room=>inBounds(room,x+.5,z+.5)))continue;
    seen.add(key);
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])queue.push([x+dx,z+dz]);
  }
  const targets=[...SHADOW.interactables.filter(o=>['power','relay','exit','record','refuge','transit'].includes(o.type)),...SHADOW.pickups.filter(o=>['repeater','shotgun','nullgun','lance','key','healthExpansion'].includes(o.type))];
  for(const target of targets)assert.ok(seen.has(`${Math.floor(target.x)},${Math.floor(target.z)}`),target.id);
});

test('street puzzle restores a safe island, pays once and creates a real return walk',()=>{
  const game=makeGame();power(game);
  const room=SHADOW.platformRooms.find(room=>room.id==='street'),middle=room.platforms[2];
  const jump=aim(game,'jump-street-1');
  assert.equal(jumpInfo(game,jump).label,'LOCKED');
  assert.equal(shadowGroundAt(game,60,53),false);
  assert.equal(use(game,'street-bridge'),false);
  assert.ok(use(game,'street-feed'));
  assert.equal(courseStatus(game,room).completed,1);
  assert.equal(courseStatus(game,room).nextControlId,'street-bridge');
  for(const time of [0,6,13,200.25])assert.equal(platformStatus(middle,time,game).stable,true);
  assert.equal(platformSolid(middle,6),false,'two-argument authored timing remains compatible');
  game.state.time=6;aim(game,jump.id);assert.ok(jumpInfo(game,jump).canUse);
  const ammo=game.state.player.ammo.cells;
  assert.ok(use(game,'street-bridge'));
  assert.equal(game.state.player.ammo.cells,ammo+12);
  assert.equal(courseStatus(game,'street').solved,true);
  assert.equal(shadowGroundAt(game,60,53),true);
  Object.assign(game.state.player,{x:60,z:53});
  const health=game.state.player.health;
  assert.equal(updateTraversal(game,.1),false);
  assert.equal(game.state.player.health,health);
  assert.deepEqual(game.state.player.safeGround,{x:60,z:53});
  assert.equal(use(game,'street-bridge'),false);
  assert.equal(game.state.player.ammo.cells,ammo+12);
});

test('aqueduct progression needs power, flow, a safe window, a pressure latch and its return sluice',()=>{
  const game=makeGame(),room=SHADOW.platformRooms.find(room=>room.id==='aqueduct'),middle=room.platforms[2];
  assert.equal(use(game,'aqueduct-flow'),false);
  assert.equal(shadowPuzzleInfo(game,object(game,'aqueduct-flow')).label,'OFFLINE');
  power(game);
  assert.equal(use(game,'aqueduct-latch'),false);
  assert.equal(use(game,'aqueduct-sluice'),false);
  assert.equal(platformSolid(middle,0,game),false);
  assert.ok(use(game,'aqueduct-flow'));
  const jump=aim(game,'jump-aqueduct-1');
  game.state.time=3;
  assert.equal(jumpInfo(game,jump).label,'WAIT');
  assert.equal(jumpInfo(game,jump).canUse,false,'the last fraction of a lit cycle is not a safe launch');
  game.state.time=0;assert.ok(jumpInfo(game,jump).canUse);
  assert.ok(game.interact());
  game.state.time=5.5;
  assert.equal(platformSolid(middle,game.state.time),false);
  assert.ok(platformStatus(middle,game.state.time,game).held,'an accepted arriving jump reserves its counterweight');
  for(let i=0;i<11;i++)updateTraversal(game,.1);
  assert.equal(game.state.player.jump,null);
  assert.ok(platformStatus(middle,game.state.time,game).held);
  const health=game.state.player.health;
  assert.equal(updateTraversal(game,1),false);
  assert.equal(game.state.player.health,health);
  const forward=aim(game,'jump-aqueduct-2');
  assert.equal(jumpInfo(game,forward).label,'LOCKED');
  assert.ok(use(game,'aqueduct-latch'));
  assert.equal(platformStatus(middle,game.state.time,game).stable,true);
  assert.ok(use(game,'aqueduct-sluice'));
  assert.equal(courseStatus(game,room).solved,true);
  assert.equal(shadowGroundAt(game,60,21),true);
});

test('every accepted aqueduct launch includes its travel time and a readable landing window',()=>{
  const game=makeGame();power(game);assert.ok(use(game,'aqueduct-flow'));
  const jump=aim(game,'jump-aqueduct-1'),middle=SHADOW.platformRooms[1].platforms[2];
  let accepted=0,rejected=0;
  for(let i=0;i<85;i++){
    game.state.time=i/10;
    const info=jumpInfo(game,jump);
    if(info.canUse){
      accepted++;
      assert.ok(info.landingWindow>=jump.duration+1.25);
      assert.ok(platformSolid(middle,game.state.time+jump.duration,game));
    }else{rejected++;assert.equal(info.label,'WAIT');}
  }
  assert.ok(accepted>20&&rejected>20);
});

test('a missed crossing returns to a stable ledge without resetting shared puzzle progress or equipment',()=>{
  const game=makeGame();power(game);assert.ok(use(game,'aqueduct-flow'));
  const stable={x:59.5,z:19.5};game.state.player.safeGround={...stable};
  Object.assign(game.state.player,{x:59.5,z:12.5});game.state.time=5.5;
  assert.equal(updateTraversal(game,.1),false);
  assert.deepEqual(game.state.player.safeGround,stable,'unlatched pressure hold is not a permanent checkpoint');
  Object.assign(game.state.player,{x:56.5,z:13.5,hasRepeater:true});
  const health=game.state.player.health,ammo={...game.state.player.ammo};
  assert.equal(updateTraversal(game,.1),true);
  assert.equal(game.state.player.x,stable.x);assert.equal(game.state.player.z,stable.z);
  assert.ok(game.state.player.health<health);
  assert.deepEqual(game.state.player.ammo,ammo);assert.equal(game.state.player.hasRepeater,true);
  assert.equal(object(game,'aqueduct-flow').used,true);
  const recovered=game.state.player.health;assert.equal(updateTraversal(game,.1),false);assert.equal(game.state.player.health,recovered);
});

test('puzzle controls have visible stage progression and reject impossible saved dependency chains',()=>{
  const game=makeGame();power(game);
  assert.deepEqual(game.state.interactables.filter(o=>o.type==='shadow-puzzle').map(o=>o.id),SHADOW_PUZZLE_IDS);
  assert.ok(shadowPuzzleStateValid(game.state.interactables,game.state.power));
  object(game,'street-bridge').used=true;
  assert.equal(shadowPuzzleStateValid(game.state.interactables,true),false);
  object(game,'street-feed').used=true;
  assert.equal(shadowPuzzleStateValid(game.state.interactables,true),true);
  assert.equal(shadowPuzzleStateValid(game.state.interactables,false),false);
  object(game,'aqueduct-sluice').used=true;
  assert.equal(shadowPuzzleStateValid(game.state.interactables,true),false);
  object(game,'aqueduct-flow').used=true;object(game,'aqueduct-latch').used=true;
  assert.ok(shadowPuzzleStateValid(game.state.interactables,true));
  assert.equal(courseStatus(game,'aqueduct').progress,1);
});

test('solo checkpoint retry retains completed route repairs and valid used state',()=>{
  const game=makeGame();power(game);
  const cells=game.state.player.ammo.cells,slugs=game.state.player.ammo.slugs;
  for(const id of SHADOW_PUZZLE_IDS)assert.ok(use(game,id),id);
  const restored=makeGame();assert.ok(restored.restore(game.serialize()));
  assert.equal(restored.state.player.ammo.cells,cells+12);
  assert.equal(restored.state.player.ammo.slugs,slugs+12);
  assert.ok(restored.restartCheckpoint());
  for(const id of SHADOW_PUZZLE_IDS)assert.equal(object(restored,id).used,true,id);
  assert.equal(shadowGroundAt(restored,60,53),true);
  assert.equal(shadowGroundAt(restored,60,21),true);
  assert.equal(restored.state.player.ammo.cells,cells+12);
  assert.equal(restored.state.player.ammo.slugs,slugs+12);
  assert.equal(restored.state.player.armor,100);
});

test('co-op controls and rewards are shared once, and either operator can hold the aqueduct island',()=>{
  const game=new CoopGame({mission:SHADOW_ID});game.start();
  game._withPlayer('p1',()=>power(game));
  const before=Object.fromEntries(Object.entries(game.state.players).map(([id,p])=>[id,p.ammo.cells]));
  game.state.players.p2.alive=false;game.state.players.p2.health=0;
  game._withPlayer('p1',()=>{assert.ok(use(game,'street-feed'));assert.ok(use(game,'street-bridge'));assert.ok(use(game,'aqueduct-flow'));});
  for(const[id,p]of Object.entries(game.state.players))assert.equal(p.ammo.cells,before[id]+12,id);
  assert.equal(game.state.players.p2.alive,false,'shared supplies do not revive a downed partner');
  assert.equal(game.state.players.p2.health,0);
  assert.ok(game.restartCheckpoint());
  assert.equal(game.state.players.p2.alive,true);
  game._withPlayer('p2',()=>assert.equal(use(game,'street-bridge'),false));
  for(const[id,p]of Object.entries(game.state.players))assert.equal(p.ammo.cells,before[id]+12,id);
  Object.assign(game.state.players.p1,{x:50.5,z:23.5});
  Object.assign(game.state.players.p2,{x:59.5,z:12.5,jump:null});
  game.state.time=5.5;
  const middle=SHADOW.platformRooms[1].platforms[2];
  assert.equal(platformSolid(middle,game.state.time),false);
  assert.equal(platformStatus(middle,game.state.time,{state:game.state}).held,true);
  game._withPlayer('p1',()=>assert.ok(platformSolid(middle,game.state.time,game)));
  Object.assign(game.state.players.p2,{x:50.5,z:23.5});
  assert.equal(platformSolid(middle,game.state.time,game),false);
  game._withPlayer('p2',()=>{assert.ok(use(game,'aqueduct-latch'));assert.ok(use(game,'aqueduct-sluice'));});
  const slugs=Object.fromEntries(Object.entries(game.state.players).map(([id,p])=>[id,p.ammo.slugs]));
  assert.ok(game.restartCheckpoint());
  for(const id of SHADOW_PUZZLE_IDS)assert.equal(object(game,id).used,true,id);
  for(const[id,p]of Object.entries(game.state.players)){
    assert.equal(p.ammo.cells,before[id]+12,id);
    assert.equal(p.ammo.slugs,slugs[id],id);
    assert.equal(p.armor,100,id);
  }
  const repeated=Object.fromEntries(Object.entries(game.state.players).map(([id,p])=>[id,p.ammo.slugs]));
  game._withPlayer('p1',()=>assert.equal(use(game,'aqueduct-sluice'),false));
  for(const[id,p]of Object.entries(game.state.players))assert.equal(p.ammo.slugs,repeated[id],id);
});

test('normal contextual USE selects nearby route controls before a return jump in solo and co-op',()=>{
  const solo=makeGame();power(solo);
  const first=aim(solo,'jump-street-0');assert.ok(solo.interact());
  for(let i=0;i<11;i++)updateTraversal(solo,.1);
  assert.equal(solo.state.player.x,first.landing.x);
  assert.equal(solo.getInteractionInfo().text,'Restore the first relay');
  assert.ok(solo.interact());assert.equal(object(solo,'street-feed').used,true);
  const cooperative=new CoopGame({mission:SHADOW_ID});cooperative.start();
  cooperative._withPlayer('p1',()=>power(cooperative));
  const control=object(cooperative,'aqueduct-flow');
  Object.assign(cooperative.state.players.p2,{x:control.x+.95,z:control.z+.5});
  assert.ok(cooperative.interact('p2'));
  assert.equal(object(cooperative,'aqueduct-flow').used,true);
  assert.ok(cooperative.drainEvents().some(event=>event.type==='shadow-puzzle'&&event.playerId==='p2'&&event.x===control.x&&event.text===control.usedText));
});

test('four enemy introductions preserve clear movement, nearby tether cover and a quiet teaching street',()=>{
  const types=['cinder-sower','tether-widow','glass-skimmer','lantern-maw'];
  for(const type of types){
    assert.ok(SHADOW.enemies.some(enemy=>enemy.type===type&&enemy.introduction),type);
    assert.ok(SHADOW.enemies.filter(enemy=>enemy.type===type).length>=2,type);
  }
  const street=SHADOW.zones.find(zone=>zone.id==='gantry');
  assert.ok(SHADOW.enemies.every(enemy=>!inBounds(street,enemy.x,enemy.z)));
  const widow=SHADOW.enemies.find(enemy=>enemy.id==='lantern-widow');
  let nearbyCover=false;
  for(let z=Math.floor(widow.z)-3;z<=Math.floor(widow.z)+3;z++)for(let x=Math.floor(widow.x)-3;x<=Math.floor(widow.x)+3;x++)if(SHADOW.grid[z]?.[x]==='#'&&Math.hypot(x+.5-widow.x,z+.5-widow.z)<=3.5)nearbyCover=true;
  assert.ok(nearbyCover);
  const maw=SHADOW.enemies.find(enemy=>enemy.id==='echo-maw');
  for(const useful of SHADOW.interactables.filter(o=>['refuge','transit','relay'].includes(o.type)))assert.ok(Math.hypot(maw.x-useful.x,maw.z-useful.z)>5,useful.id);
});
