import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { DIFFICULTY, difficultyLabel } from '../daily_flyer/themes/breach_assets/difficulty.mjs';
import { SHADOW_PUZZLE_IDS, SHADOW_WORLD_REVISION } from '../daily_flyer/themes/breach_assets/shadow.mjs';
import { MISSION_SCORE, musicScene } from '../daily_flyer/themes/breach_assets/music-cues.mjs';
import { musicThreats } from '../daily_flyer/themes/breach_assets/audio.mjs';
import { automaticFireAllowed, noticeForGuidance } from '../daily_flyer/themes/breach_assets/guidance.mjs';
import { BreachRooms, PROTOCOL } from '../server/breach-rooms.mjs';

const mission='beneath-the-shadow';
const legacy=()=>JSON.parse(readFileSync(new URL('./fixtures/breach-shadow-0.9.4.json',import.meta.url),'utf8'));
const start=(difficulty='standard')=>{const game=new Game({mission,difficulty,seed:713});game.start();return game;};
const item=(game,id)=>[...game.state.interactables,...game.state.enemies,...game.state.pickups].find(e=>e.id===id);

test('Insane increases actual pursuit, melee damage and cadence beyond Hard',()=>{
  const result=difficulty=>{
    const g=new Game({difficulty});g.start();g.state.player.armor=0;
    const e={...g.state.enemies.find(e=>e.type==='runner'),x:g.state.player.x+.6,z:g.state.player.z,active:true,attackCooldown:0};
    g.state.enemies=[e];g._updateEnemy(e,.01);
    const damage=100-g.state.player.health,cooldown=e.attackCooldown;
    e.x=g.state.player.x+3;e.z=g.state.player.z;e.attackCooldown=5;
    const x=e.x;g._updateEnemy(e,.1);
    return {damage,cooldown,movement:x-e.x};
  };
  const hard=result('hard'),insane=result('insane');
  assert.ok(insane.damage>hard.damage);assert.ok(insane.cooldown<hard.cooldown);assert.ok(insane.movement>hard.movement);
  assert.equal(difficultyLabel('insane'),'Insane in the Membrane');
  assert.deepEqual(['relaxed','standard','hard'].map(id=>DIFFICULTY[id].attackRate),[1,1,1]);
});

test('Insane preserves guardian warning duration and shortens only recovery',()=>{
  const phase=difficulty=>{
    const g=new Game({mission:'underworks-13',difficulty});g.start();
    const e=g.state.enemies.find(e=>e.guardian);assert.ok(e);
    g._updateGuardian(e,.1,g.state.player,true);
    e.attackCooldown=0;g._updateGuardian(e,.1,g.state.player,true);
    // A local, visible target is needed before an attack can be chosen.
    Object.assign(g.state.player,{x:e.x,z:e.z+3});g._updateGuardian(e,.1,g.state.player,true);
    const duration=e.telegraph.duration;g._guardianRecovery(e);
    return {duration,recovery:e.phaseTimer};
  };
  const hard=phase('hard'),insane=phase('insane');
  assert.equal(insane.duration,hard.duration);assert.ok(insane.recovery<hard.recovery);
});

test('Insane saves the expanded guardian above the old 1000-health limit',()=>{
  const g=start('insane'),boss=item(g,'sun-guardian');assert.equal(boss.health,1036);
  const restored=new Game({difficulty:'relaxed'});assert.ok(restored.restore(g.serialize()));
  assert.equal(restored.options.difficulty,'insane');assert.equal(item(restored,'sun-guardian').health,1036);
  const bad=g.serialize();bad.state.enemies.find(e=>e.id==='sun-guardian').health=1037;
  assert.equal(new Game().restore(bad),false,'save cannot invent health above the selected tier');
});

test('real 0.9.4 save migrates equipment, split roots, records and checkpoint',()=>{
  const old=legacy(),g=new Game();assert.ok(g.restore(old));
  assert.equal(g.serialize().state.shadowRevision,SHADOW_WORLD_REVISION);
  assert.ok(g.state.player.hasNull&&g.state.player.hasRepeater);
  assert.equal(g.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.alive).length,2);
  assert.ok(item(g,'record-lab').used&&item(g,'cache-panel').used);
  assert.ok(SHADOW_PUZZLE_IDS.every(id=>item(g,id).used===false));
  assert.ok(g.restartCheckpoint());assert.ok(g.state.player.hasNull&&g.state.player.hasRepeater);
  assert.equal(g.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.alive).length,2);
  assert.equal(old.state.shadowRevision,undefined,'restore does not mutate the supplied data');
});

test('legacy actors and valid warnings inside new glasshouse props migrate safely',()=>{
  const old=legacy();Object.assign(old.state.player,{x:101.5,z:80.5});
  old.state.enemies.find(e=>e.id==='lab-emplacement').telegraph={kind:'shot',x:101.5,z:80.5,fromX:111.5,fromZ:86.5,radius:.8,duration:.9,remaining:.5,targetId:'player',targetKind:'player'};
  const g=new Game();assert.ok(g.restore(old));assert.ok(g._clearCircle(g.state.player.x,g.state.player.z,.22));
  assert.equal(item(g,'lab-emplacement').telegraph,null);
  assert.ok(Math.hypot(g.state.player.x-101.5,g.state.player.z-80.5)<4);
  const corrupt=legacy();Object.assign(corrupt.state.player,{x:101.5,z:80.5});
  corrupt.state.enemies.find(e=>e.id==='lab-emplacement').telegraph={kind:'shot',x:101.5,z:80.5,fromX:111.5,fromZ:86.5,radius:.8,duration:.9,remaining:500,targetId:'player',targetKind:'player'};
  assert.equal(new Game().restore(corrupt),false,'migration must validate the original attack before clearing it');
});

test('missing entities, future revisions and impossible puzzle progress are rejected atomically',()=>{
  const g=start(),before=g.serialize();
  const cases=[];
  const missingOld=legacy();missingOld.state.enemies.pop();cases.push(missingOld);
  const missingNew=g.serialize();missingNew.state.enemies.pop();cases.push(missingNew);
  const future=g.serialize();future.state.shadowRevision=99;cases.push(future);
  const impossible=g.serialize();impossible.state.interactables.find(i=>i.id==='aqueduct-sluice').used=true;cases.push(impossible);
  const oldWall=legacy();Object.assign(oldWall.state.player,{x:1.5,z:1.5});cases.push(oldWall);
  for(const data of cases){assert.equal(g.restore(data),false);assert.deepEqual(g.serialize(),before);}
});

test('private rooms accept Insane and apply it to both operators',()=>{
  const rooms=new BreachRooms(),peer=()=>({messages:[],send(m){this.messages.push(structuredClone(m));},close(){}}),host=peer(),guest=peer();
  rooms.handle(host,{type:'create',protocol:PROTOCOL,name:'Host',mission,difficulty:'insane',supportedMissions:[mission],shadowRevision:SHADOW_WORLD_REVISION});
  const id=host.messages.find(m=>m.type==='welcome').roomId;
  rooms.handle(guest,{type:'join',protocol:PROTOCOL,name:'Guest',roomId:id,supportedMissions:[mission],shadowRevision:SHADOW_WORLD_REVISION});
  rooms.handle(host,{type:'ready',ready:true});rooms.handle(guest,{type:'ready',ready:true});rooms.handle(host,{type:'start'});
  const room=rooms.rooms.get(id);assert.equal(room.status,'playing');assert.equal(room.game.options.difficulty,'insane');
  assert.equal(room.game.state.enemies.find(e=>e.id==='sun-guardian').health,1036);
  assert.deepEqual(Object.keys(room.game.state.players),['p1','p2']);
});

test('refuges cannot refill a partner targeted by a new long-range threat or active fire',()=>{
  for(const[type,range]of[['cinder-sower',11.5],['tether-widow',8.5],['glass-skimmer',10]]){
    const g=new CoopGame({mission});g.start();
    const e=g.state.enemies.find(e=>e.type===type);assert.ok(e);
    // Arrange one clear lane while the other operator stands at a far refuge.
    Object.assign(g.state.players.p1,{x:59.5,z:105.5});Object.assign(g.state.players.p2,{x:66.5,z:74.5});
    Object.assign(e,{x:66.5,z:74.5+range,active:true});g.state.enemies=[e];
    assert.ok(g.hasLineOfSight(e.x,e.z,g.state.players.p2.x,g.state.players.p2.z));
    assert.equal(g._refugeSafe(g.state.players.p1),false,type);
  }
  const g=start();g.state.enemies=[];g.state.shadowHazards=[{x:g.state.player.x,z:g.state.player.z,radius:1.1,remaining:2}];
  assert.equal(g._refugeSafe(g.state.player),false);
});

test('disguised Maw is not exposed by automatic firing or the music threat detector',()=>{
  const g=start(),e=g.state.enemies.find(e=>e.type==='lantern-maw'),p=g.state.player;
  Object.assign(e,{x:p.x,z:p.z-2,active:true,revealed:false});g.state.enemies=[e];p.angle=0;
  assert.equal(automaticFireAllowed([e],p,{hasLineOfSight:()=>true}),false);
  assert.deepEqual(musicThreats(g),{pressure:0,guardian:false});
  e.revealed=true;assert.equal(automaticFireAllowed([e],p,{hasLineOfSight:()=>true}),true);assert.equal(musicThreats(g).pressure,1);
});

test('new enemy hints require observation and preserve Expert silence',()=>{
  for(const kind of ['cinder','tether','skimmer','maw-reveal']){
    const event={type:'enemy-warning',kind};
    assert.equal(noticeForGuidance(event,'simple',null,{observed:false}),null);
    assert.ok(noticeForGuidance(event,'simple',null,{observed:true}));
    assert.ok(noticeForGuidance(event,'moderate',null,{observed:true}));
    assert.equal(noticeForGuidance(event,'expert',null,{observed:true}),null);
  }
});

test('an Arc interrupt leaves a new enemy in a valid recovery phase immediately',()=>{
  const g=start(),e=item(g,'lantern-widow'),p=g.state.player;
  Object.assign(p,{x:e.x,z:e.z+2,angle:0,hasArc:true,weapon:'arc'});p.ammo.cells=3;
  g._warning(e,'tether',p,1,.35);e.shadowPhase='windup';e.active=true;
  g._fire();assert.ok(e.stunTimer>0);assert.equal(e.telegraph,null);assert.equal(e.shadowPhase,'recover');
  assert.ok(g._validEncounterSnapshot(e,g.level.enemies.find(base=>base.id===e.id),g.level));
});

test('Shadow opens with Iron Teeth and places all three new songs without removing its quiet chapel beat',()=>{
  const g=start(),score=MISSION_SCORE[mission];assert.equal(musicScene(g).opening,'iron-teeth');
  for(const cue of ['iron-teeth','blacksite-stomp','ash-cathedral'])assert.ok(score.rotation.cues.includes(cue));
  assert.equal(score.bosses.forge.cues[0],'iron-teeth');assert.equal(score.bosses.hydra.cues[0],'ash-cathedral');
  assert.ok(score.sections.forge.cues.includes('blacksite-stomp'));assert.equal(score.quietBeats.chapel,10);
});
