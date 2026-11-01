import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { tomorrowEnding, tomorrowInteractionInfo } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';
import { initialTomorrowSociety, tomorrowLivingMemory, tomorrowNpcHostile, tomorrowSocietyOutcome } from '../daily_flyer/themes/breach_assets/tomorrow-society.mjs';

const make = (options={}) => { const game=new Game({mission:'wrong-side-of-tomorrow',seed:73,aimAssist:false,...options});game.start();game.drainEvents();return game; };
const feature=(game,id)=>game.state.interactables.find(item=>item.id===id);
const actor=(game,id)=>game.state.enemies.find(enemy=>enemy.id===id);
const stand=(game,item)=>Object.assign(game.state.player,{x:item.x,z:item.z,angle:0});
const use=(game,id)=>{stand(game,feature(game,id));return game.interact();};
const take=(game,id)=>{const item=game.state.pickups.find(item=>item.id===id);stand(game,item);game._collectPickups();return item.collected;};
const advance=(game,seconds)=>{for(let t=0;t<seconds-1e-8&&game.state.status==='playing';t+=.05)game.update(.05,{});};
const readyEndings=game=>{assert.ok(use(game,'aux-power'));assert.ok(use(game,'relay-west'));assert.ok(use(game,'relay-east'));assert.ok(take(game,'access-key'));assert.ok(take(game,'null-projector'));game._damageEnemy(actor(game,'tomorrow-guardian'),100000,'player');};
const doubleSeed=[1,2,3,4].find(seed=>initialTomorrowSociety(seed).clerkDisposition==='double');
const faithfulSeed=[1,2,3,4].find(seed=>initialTomorrowSociety(seed).clerkDisposition==='faithful');

test('authored Wardens and Unfiled fight while an observing operator stays neutral, with no player kill credit',()=>{
  const game=make();Object.assign(game.state.player,{x:19.5,z:54.5});
  advance(game,8);
  const fighters=game.state.enemies.filter(enemy=>enemy.encounterId==='wardrobe-feud');
  assert.ok(fighters.some(enemy=>!enemy.alive));
  assert.ok(fighters.some(enemy=>enemy.alive&&enemy.health<enemy.maxHealth));
  assert.equal(game.state.player.health,100);assert.equal(game.state.kills,0);
  assert.ok(game.drainEvents().some(event=>event.type==='enemy-kill'));
  assert.ok(fighters.every(enemy=>enemy.provoked===false));
});

test('actual guardian volleys damage opposing NPCs, pass their own faction and stop at closed cover',()=>{
  for(const blocked of [false,true]){
    const game=make(),boss=actor(game,'tomorrow-guardian'),rook=actor(game,'npc-rook'),runner=actor(game,'wardrobe-runner');
    Object.assign(game.state.player,{x:52.5,z:84.5});
    Object.assign(boss,{x:44.5,z:82.5,active:true,bossCycle:1,attackCooldown:0});
    Object.assign(rook,{x:44.5,z:78.5});Object.assign(runner,{x:44.5,z:80.5});
    const rookHealth=rook.health,runnerHealth=runner.health;
    game._updateEnemy(boss,.05);assert.equal(boss.bossPhase,'volley-windup');
    assert.equal(boss.telegraph.targetId,rook.id);assert.equal(boss.telegraph.targetKind,'enemy');
    for(let n=0;n<23;n++)game._updateEnemy(boss,.05);
    assert.equal(game.state.projectiles.length,3);assert.ok(game.state.projectiles.every(shot=>shot.ownerId===boss.id));
    if(blocked){
      const grid=game.level.grid.map(row=>row.split(''));for(const x of [43,44,45])grid[80][x]='#';
      game.level={...game.level,grid:grid.map(row=>row.join(''))};
    }
    // The launcher's death must not harmlessly erase a volley already in flight.
    game._damageEnemy(boss,100000,'player');
    for(let n=0;n<30;n++)game._updateProjectiles(.05);
    assert.equal(runner.health,runnerHealth,'an infestation volley does not hit its own faction');
    assert.equal(game.state.player.health,100);
    if(blocked)assert.equal(rook.health,rookHealth,'the closed wall stops the incoming volley');
    else assert.ok(rook.health<rookHealth,'the opposing NPC is hit by the real projectile');
  }
});

test('distant faction combat waits for an observer and all named NPCs keep their authored stations',()=>{
  const game=make(),before=game.state.enemies.filter(e=>e.npcRole).map(e=>({id:e.id,x:e.x,z:e.z,health:e.health}));
  advance(game,8);
  for(const prior of before)assert.equal(actor(game,prior.id).health,prior.health);
  Object.assign(game.state.player,{x:19.5,z:54.5});advance(game,3);
  for(const prior of before.filter(e=>e.id.startsWith('npc-'))){assert.equal(actor(game,prior.id).x,prior.x);assert.equal(actor(game,prior.id).z,prior.z);}
});

test('neutral character aim assistance and refuges remain safe; deliberate fire provokes and persists',()=>{
  const game=make({aimAssist:true});assert.ok(use(game,'aux-power'));
  const rook=actor(game,'npc-rook');Object.assign(game.state.player,{x:rook.x-4,z:rook.z+.35,angle:Math.PI/2});
  assert.equal(game.isHostileToPlayer(rook),false);assert.equal(game._refugeSafe(game.state.player),true);
  game.update(.05,{fire:true});assert.equal(rook.health,rook.maxHealth,'the near miss is not corrected onto a neutral character');
  advance(game,.5);game.state.player.angle=Math.atan2(rook.x-game.state.player.x,game.state.player.z-rook.z);
  game.update(.05,{fire:true});assert.ok(rook.health<rook.maxHealth);assert.equal(rook.provoked,true);
  assert.equal(game.isHostileToPlayer(rook),true);
  const restored=new Game();assert.equal(restored.restore(game.serialize()),true);
  assert.equal(restored.isHostileToPlayer(actor(restored,'npc-rook')),true);
  assert.equal(restored.restartCheckpoint(),true);assert.equal(actor(restored,'npc-rook').provoked,true);
});

test('Rook aid has an actual cost, ends the feud and deploys armed escorts exactly once',()=>{
  const game=make();assert.ok(use(game,'aux-power'));
  const before=game.state.player.ammo.pistol;assert.ok(use(game,'help-rook'));
  assert.equal(game.state.player.ammo.pistol,before-12);
  const escorts=game.state.enemies.filter(enemy=>enemy.societySupport==='rook');
  assert.equal(escorts.length,2);assert.ok(escorts.every(enemy=>enemy.alive&&!enemy.dormant&&enemy.health===enemy.maxHealth));
  assert.equal(game._factionsOpposed(actor(game,'warden-north'),actor(game,'unfiled-north')),false);
  assert.equal(use(game,'help-rook'),false);assert.equal(game.state.player.ammo.pistol,before-12);
  Object.assign(game.state.player,{x:65.5,z:46.5});const target=actor(game,'sunday-maw'),health=target.health;
  advance(game,5);assert.ok(target.health<health||!target.alive,'escorts fire against the actual nearby infestation');
  assert.ok(game.drainEvents().some(event=>event.type==='enemy-hit'&&event.sourceId?.startsWith('rook-escort')));
  assert.ok(game.restartCheckpoint());assert.ok(feature(game,'help-rook').used);assert.ok(escorts.every(old=>!actor(game,old.id).dormant));
});

test('Mara requires her catalogue, rewards the team once and substitutes for one memory at Rewrite',()=>{
  const game=make();readyEndings(game);
  assert.equal(use(game,'help-mara'),false);assert.ok(use(game,'mara-catalogue'));
  const before=game.state.player.ammo.cells;assert.ok(use(game,'help-mara'));assert.equal(game.state.player.ammo.cells,before+12);
  assert.equal(use(game,'help-mara'),false);assert.equal(game.state.player.ammo.cells,before+12);
  assert.ok(use(game,'memory-orchard'));assert.ok(use(game,'memory-aquarium'));
  assert.equal(feature(game,'memory-museum').used,false);assert.equal(tomorrowLivingMemory(game),true);
  assert.equal(tomorrowInteractionInfo(game,feature(game,'ending-rewrite')).canUse,true);
  assert.ok(use(game,'ending-rewrite'));assert.equal(tomorrowEnding(game).id,'rewrite');
  const restored=new Game();assert.equal(restored.restore(game.serialize()),true);assert.equal(restored.state.status,'won');assert.equal(tomorrowLivingMemory(restored),true);
});

test('losing or alienating Mara removes only the shortcut; all three original anchors still yield Rewrite',()=>{
  const game=make();readyEndings(game);assert.ok(use(game,'mara-catalogue'));assert.ok(use(game,'help-mara'));
  assert.ok(use(game,'memory-orchard'));assert.ok(use(game,'memory-aquarium'));
  game._damageEnemy(actor(game,'npc-mara'),1,'player');assert.equal(tomorrowLivingMemory(game),false);
  assert.equal(tomorrowInteractionInfo(game,feature(game,'ending-rewrite')).canUse,false);
  for(const enemy of game.state.enemies.filter(enemy=>enemy.npcRole))game._damageEnemy(enemy,100000,'player');
  assert.ok(use(game,'memory-museum'));assert.ok(use(game,'ending-rewrite'));
  assert.equal(tomorrowEnding(game).id,'rewrite');assert.equal(new Game().restore(game.serialize()),true);
});

test('a seeded double clerk delivers real supplies, gives a warning, then betrays without stealing progression',()=>{
  const game=make({seed:doubleSeed});assert.ok(use(game,'aux-power'));
  const ammo=game.state.player.ammo.pistol,shells=game.state.player.ammo.shells,armor=game.state.player.armor;
  assert.ok(use(game,'help-twice'));assert.equal(game.state.player.ammo.pistol,ammo-20);
  assert.equal(game.state.player.ammo.shells,shells+20);assert.equal(game.state.player.armor,Math.min(100,armor+20));
  assert.ok(use(game,'relay-west'));assert.ok(use(game,'relay-east'));assert.ok(take(game,'access-key'));
  game.update(.05,{});assert.equal(game.state.tomorrowSociety.clerkOutcome,'warning');assert.equal(tomorrowNpcHostile(game,actor(game,'npc-twice')),false);
  const saved=game.serialize(),restored=new Game();assert.ok(restored.restore(saved));restored.resume();
  assert.equal(restored.state.tomorrowSociety.clerkDisposition,'double');assert.equal(restored.state.tomorrowSociety.clerkOutcome,'warning');
  advance(restored,1.6);assert.equal(restored.state.tomorrowSociety.clerkOutcome,'betrayed');assert.equal(actor(restored,'npc-twice').provoked,true);
  assert.equal(restored.state.player.key,true);assert.equal(tomorrowInteractionInfo(restored,feature(restored,'extraction')).canUse,true);
  assert.ok(restored.restartCheckpoint());assert.equal(restored.state.tomorrowSociety.clerkOutcome,'betrayed');
});

test('museum evidence can stop the warning in time, and an honest clerk keeps the bargain',()=>{
  for(const seed of [doubleSeed,faithfulSeed]){
    const game=make({seed});assert.ok(use(game,'aux-power'));assert.ok(use(game,'help-twice'));assert.ok(use(game,'twice-registry'));
    assert.ok(use(game,'relay-west'));assert.ok(use(game,'relay-east'));game.update(.05,{});
    assert.ok(use(game,'expose-twice'));advance(game,2);
    assert.equal(game.state.tomorrowSociety.clerkOutcome,seed===doubleSeed?'exposed':'loyal');
    assert.equal(tomorrowNpcHostile(game,actor(game,'npc-twice')),false);
    assert.equal(new Game().restore(game.serialize()),true);
  }
});

test('four operators share aid and rewards and a checkpoint retains the NPC decision once',()=>{
  const game=new CoopGame({mission:'wrong-side-of-tomorrow',players:['p1','p2','p3','p4'],seed:73});game.start();
  const interact=(id,featureId)=>{Object.assign(game.state.players[id],{x:feature(game,featureId).x,z:feature(game,featureId).z});return game.interact(id);};
  assert.ok(interact('p4','aux-power'));assert.ok(interact('p3','mara-catalogue'));
  const before=Object.values(game.state.players).map(p=>p.ammo.cells);assert.ok(interact('p2','help-mara'));
  for(const [index,p]of Object.values(game.state.players).entries())assert.equal(p.ammo.cells,before[index]+12);
  assert.equal(interact('p1','help-mara'),false);assert.equal(tomorrowLivingMemory(game),true);
  assert.ok(game.restartCheckpoint());assert.equal(tomorrowLivingMemory(game),true);
  assert.deepEqual(Object.keys(game.networkSnapshot().players),['p1','p2','p3','p4']);
  assert.equal(game.networkSnapshot().tomorrowSociety.clerkDisposition,initialTomorrowSociety(73).clerkDisposition);
});

test('save validation rejects inconsistent society rewards, betrayal and living-memory claims atomically',()=>{
  const good=make().serialize();
  for(const mutate of [
    state=>{state.tomorrowSociety.clerkOutcome='betrayed';},
    state=>{state.tomorrowSociety.warningRemaining=9;},
    state=>{state.interactables.find(i=>i.id==='help-mara').used=true;},
    state=>{state.enemies.find(e=>e.id==='rook-escort-a').alive=true;state.enemies.find(e=>e.id==='rook-escort-a').health=100;},
  ]){const bad=structuredClone(good);mutate(bad.state);const receiver=new Game();const old=receiver.state;assert.equal(receiver.restore(bad),false);assert.equal(receiver.state,old);}
});

const legacy=JSON.parse(readFileSync(new URL('./fixtures/breach-tomorrow-0.11.0.json',import.meta.url),'utf8'));
test('authentic v0.11.0 partial and completed saves migrate while retaining equipment, shortcuts, checkpoint and ending',()=>{
  for(const key of ['partial','rewrite']){
    const game=new Game();assert.equal(game.restore(legacy[key]),true,key);assert.equal(game.state.tomorrowSociety.version,1);
    assert.equal(game.state.enemies.length,game.level.enemies.length);assert.equal(game.state.interactables.length,game.level.interactables.length);
    assert.equal(game.state.player.hasNull,true);assert.equal(game.state.player.hasShotgun,true);assert.equal(feature(game,'relay-west').used,true);
    assert.equal(game.state.doors.find(d=>d.id==='remembered-west').open,true);assert.equal(feature(game,'help-mara').used,false);
    assert.equal(tomorrowSocietyOutcome(game).helped,0);assert.equal(new Game().restore(game.serialize()),true);
    if(key==='rewrite'){assert.equal(game.state.status,'won');assert.equal(tomorrowEnding(game).id,'rewrite');}
    else {assert.equal(game.state.status,'paused');assert.equal(game.restartCheckpoint(),true);assert.equal(feature(game,'relay-west').used,true);assert.equal(game.state.player.hasNull,true);}
  }
});

test('migration refuses unknown revisions and corrupt old rosters instead of repairing invented progress',()=>{
  for(const mutate of [saved=>{saved.state.tomorrowRevision=99;},saved=>{saved.state.enemies.pop();},saved=>{saved.state.interactables.push({id:'invented',used:true});}]){
    const bad=structuredClone(legacy.partial);mutate(bad);assert.equal(new Game().restore(bad),false);
  }
});
