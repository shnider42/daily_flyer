import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, MISSIONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { HOLLOW, containmentAt } from '../daily_flyer/themes/breach_assets/hollow.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { BreachRooms } from '../server/breach-rooms.mjs';
import { briefingForGuidance, objectiveForGuidance, interactionForGuidance } from '../daily_flyer/themes/breach_assets/guidance.mjs';
const mission='hollow-19';
const object=(g,id)=>[...g.state.interactables,...g.state.doors,...g.state.pickups,...g.state.enemies].find(o=>o.id===id);
const quiet=(g,keepBoss=false)=>{for(const e of g.state.enemies)if(!keepBoss||!e.guardian){e.alive=false;e.health=0;}return g;};
const make=(live=false)=>{const g=new Game({mission,seed:19,aimAssist:false});g.start();return live?g:quiet(g);};
function pathTo(g,point){
  const w=g.level.width,start=Math.floor(g.state.player.z)*w+Math.floor(g.state.player.x),goal=Math.floor(point.z)*w+Math.floor(point.x);
  const queue=[start],prev=new Map([[start,null]]),doors=new Map(g.state.doors.map(d=>[Math.floor(d.z)*w+Math.floor(d.x),d]));
  for(let i=0;i<queue.length&&!prev.has(goal);i++){
    const k=queue[i],x=k%w,z=Math.floor(k/w);
    for(const[nx,nz]of[[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){const nk=nz*w+nx,d=doors.get(nk);if(prev.has(nk)||g.level.grid[nz]?.[nx]!=='.'||d&&!d.open&&!g.canTraverseDoor(d))continue;prev.set(nk,k);queue.push(nk);}
  }
  if(!prev.has(goal))return null;
  const path=[];for(let k=goal;k!==null;k=prev.get(k))path.push([k%w,Math.floor(k/w)]);return path.reverse();
}
function walk(g,point){
  const path=pathTo(g,point);assert.ok(path,`Reachable ${point.id||JSON.stringify(point)}`);
  for(const[x,z]of path.slice(1)){
    const door=g.state.doors.find(d=>!d.open&&Math.floor(d.x)===x&&Math.floor(d.z)===z);
    if(door){g.state.player.angle=Math.atan2(door.x-g.state.player.x,-(door.z-g.state.player.z));assert.equal(g.interact(),true,`open ${door.id}`);assert.equal(door.open,true,door.id);}
    let n=0;while(Math.hypot(x+.5-g.state.player.x,z+.5-g.state.player.z)>.025&&n++<40){
      const p=g.state.player,gap=Math.hypot(x+.5-p.x,z+.5-p.z);p.angle=Math.atan2(x+.5-p.x,-(z+.5-p.z));g.update(Math.min(.1,gap/3.35),{forward:1});
    }
    assert.ok(n<40,`walk ${x},${z} (${g.state.status})`);
  }
}
function use(g,id){walk(g,object(g,id));assert.equal(g.interact(),true,`use ${id}`);}
function enter(g){walk(g,object(g,'pump-shotgun'));walk(g,object(g,'rebound-carbine'));use(g,'transit-dock');walk(g,object(g,'arrival'));use(g,'aux-power');}
const power=g=>{g.state.power=true;object(g,'aux-power').used=true;};

test('Hollow is a seventh authored expedition with twelve sectors and more than six Glasshouse floor areas',()=>{
  assert.equal(MISSIONS[6].id,mission);const count=l=>l.grid.join('').split('.').length-1;
  assert.equal(HOLLOW.width,129);assert.equal(HOLLOW.height,113);assert.equal(HOLLOW.zones.length,12);
  assert.ok(count(HOLLOW)>6*count(LEVELS['glasshouse-17']));assert.ok(count(HOLLOW)>2*count(LEVELS['underworks-13']));
  assert.equal(HOLLOW.coopSpawns.length,2);assert.equal(HOLLOW.interactables.filter(o=>o.type==='record').length,6);
  for(const p of HOLLOW.landmarks)for(let z=p.z-p.depth/2;z<p.z+p.depth/2;z++)for(let x=p.x-p.width/2;x<p.x+p.width/2;x++)assert.equal(HOLLOW.grid[z][x],'#');
  for(const t of HOLLOW.interactables.filter(o=>o.type==='transit'))assert.notEqual(HOLLOW.grid[Math.floor(t.landing.z)][Math.floor(t.landing.x)],'#');
});

test('the arrival-to-power teaching route works with every enemy alive and leaves time to read',()=>{
  const g=make(true);use(g,'record-intake');enter(g);use(g,'record-exchange');walk(g,object(g,'arc-caster'));
  assert.equal(g.state.player.health,100);assert.equal(g.state.player.hasArc,true);assert.equal(g.state.enemies.filter(e=>e.alive).length,HOLLOW.enemies.length);
  assert.equal(g.state.power,true);assert.equal(new Game().restore(g.serialize()),true);assert.equal(g.getObjective().stage,'relays');
});

for(const order of [['relay-west','relay-east'],['relay-east','relay-west']])test(`both wings and extraction remain traversable with all shortcut circuits closed: ${order.join(' then ')}`,()=>{
  // This is geometry/progression isolation, not an all-enemy balance playtest.
  const g=make();enter(g);assert.equal(pathTo(g,object(g,'access-key')),null);
  use(g,order[0]);assert.equal(pathTo(g,object(g,'access-key')),null);use(g,order[1]);
  walk(g,object(g,'choir-seal'));walk(g,object(g,'access-key'));assert.equal(g.state.player.key,true);
  use(g,'transit-choir');use(g,'transit-choir');assert.ok(g.state.player.z>100);
  walk(g,object(g,'security'));use(g,'extraction');assert.equal(g.state.status,'won');assert.equal(new Game().restore(g.serialize()),true);
});

test('the Choir Keeper can be defeated through normal fire and movement without injected ammunition',()=>{
  const g=quiet(make(true),true);enter(g);use(g,'relay-west');use(g,'relay-east');use(g,'gallery-refuge');
  walk(g,object(g,'choir-seal'));walk(g,{x:49.5,z:23.5});g.selectWeapon('shotgun');
  const boss=object(g,'hollow-guardian');let side=1;
  for(let n=0;n<800&&boss.alive&&g.state.status==='playing';n++){
    const p=g.state.player,d=Math.hypot(boss.x-p.x,boss.z-p.z),before={x:p.x,z:p.z};
    p.angle=Math.atan2(boss.x-p.x,-(boss.z-p.z));g.update(.05,{fire:true,strafe:side,forward:d>8?.4:d<4?-.6:0});
    if(Math.hypot(p.x-before.x,p.z-before.z)<.01)side=-side;
    if(p.ammo.shells===0)g.selectWeapon('ricochet');if(p.ammo.slugs===0)g.selectWeapon('pistol');
  }
  assert.equal(boss.alive,false);assert.equal(g.state.status,'playing');
});

test('every reversible route has a detour and both side controls work without crossing its closed gate',()=>{
  const g=make();enter(g);
  for(const o of g.state.interactables.filter(o=>o.routing))assert.ok(pathTo(g,o),o.id);
  for(const mark of [1,2,3]){
    const a=object(g,`routing-${mark}-a`),b=object(g,`routing-${mark}-b`);
    assert.ok(containmentAt(g,a.containment));use(g,a.id);assert.equal(a.used,true);assert.equal(b.used,true);assert.equal(containmentAt(g,a.containment),null);
    use(g,b.id);assert.equal(a.used,false);assert.ok(containmentAt(g,a.containment));
  }
});

test('a routed shortcut cannot close through either operative, a living enemy, or a live grenade',()=>{
  const g=new CoopGame({mission});g.start();quiet(g);power(g);
  const a=object(g,'routing-1-a'),door=object(g,'route-1');Object.assign(g.state.players.p1,{x:a.x,z:a.z});
  assert.equal(g.interact('p1'),true);
  for(const id of ['p1','p2']){const other=id==='p1'?'p2':'p1';Object.assign(g.state.players[other],{x:a.x,z:a.z});Object.assign(g.state.players[id],{x:door.x,z:door.z});assert.equal(g.interact(other),false);assert.equal(door.open,true);}
  for(const p of Object.values(g.state.players))Object.assign(p,{x:a.x,z:a.z});
  const e=g.state.enemies[0];Object.assign(e,{alive:true,health:10,x:door.x,z:door.z});assert.equal(g.interact('p1'),false);e.alive=false;e.health=0;
  g.state.projectiles.push({type:'grenade',life:1,x:door.x,z:door.z});assert.equal(g.interact('p1'),false);g.state.projectiles=[];
  assert.equal(g.interact('p1'),true);assert.equal(door.open,false);
});

test('containment slows a real runner, switches off with its route, and never extends through cover',()=>{
  function run(on){const g=make();power(g);const a=object(g,'routing-1-a');if(!on)g._toggleShutter(a);const e=object(g,'ward-runner');Object.assign(e,{alive:true,health:52,x:22.5,z:56.5,active:true});Object.assign(g.state.player,{x:27.5,z:56.5});g.update(.1);return{g,e,moved:e.x-22.5};}
  const slow=run(true),fast=run(false);assert.ok(slow.e.contained);assert.equal(fast.e.contained,false);assert.ok(Math.abs(slow.moved/fast.moved-.35)<.001);
  assert.equal(containmentAt(slow.g,{x:22.5,z:44.5}),null);assert.equal(containmentAt(slow.g,{x:22.5,z:46.5}),null,'solid console blocks the field');
  slow.g.state.power=false;assert.equal(containmentAt(slow.g,{x:22.5,z:56.5}),null);
});

test('a live containment field interrupts a phase arrival and excludes destinations for either co-op player',()=>{
  const g=make();power(g);const e=object(g,'ward-echo');Object.assign(e,{alive:true,health:86,x:23.5,z:56.5,active:true,blinkCooldown:0});Object.assign(g.state.player,{x:27.5,z:56.5});
  e.telegraph={kind:'blink',remaining:.1,duration:.8,x:25.5,z:55.5};g.update(.1);assert.equal(e.telegraph,null);assert.ok(e.blinkCooldown>0);assert.equal(e.contained,true);
  Object.assign(e,{x:29.5,z:59.5});assert.equal(g._validBlinkDestination(e,{x:24.5,z:56.5}),false);
  const team=new CoopGame({mission});team.start();power(team);const echo=object(team,'ward-echo');
  for(const p of Object.values(team.state.players))Object.assign(p,{x:27.5,z:56.5});Object.assign(echo,{x:23.5,z:56.5});team.update(.1,{});assert.equal(echo.contained,true);
});

test('containment is not invulnerability: plasma and security still act, and guardians are exempt',()=>{
  const g=make();power(g);Object.assign(g.state.player,{x:24.5,z:56.5});const health=g.state.player.health;
  g.state.projectiles.push({id:'p-test',type:'plasma',x:24.5,z:55.9,dx:0,dz:4.1,life:4,damage:15});g.update(.1);assert.ok(g.state.player.health<health);
  const boss=object(g,'hollow-guardian');Object.assign(boss,{alive:true,health:620,x:22.5,z:56.5});g.update(.1);assert.equal(boss.contained,false);
  const security=object(g,'gallery-security');Object.assign(security,{alive:true,health:120,x:22.5,z:57.5});g.update(.1);assert.equal(security.contained,false);
});

test('large-map saves accept reversible route changes after a checkpoint but reject inconsistent circuits atomically',()=>{
  const g=make();enter(g);use(g,'routing-1-a');use(g,'exchange-refuge');use(g,'routing-1-b');use(g,'record-wards');
  const save=g.serialize(),restored=new Game();assert.equal(restored.restore(save),true);assert.equal(object(restored,'route-1').open,false);
  assert.equal(object(restored,'record-wards').used,true);assert.equal(restored.restartCheckpoint(),true);assert.equal(object(restored,'record-wards').used,true);
  const broken=structuredClone(save);broken.state.interactables.find(o=>o.id==='routing-1-a').used=true;
  const before=restored.serialize();assert.equal(restored.restore(broken),false);assert.deepEqual(restored.serialize(),before);
});

test('records are shared discoveries but replay feedback belongs only to the reader; pause freezes both operatives',()=>{
  const g=new CoopGame({mission});g.start();quiet(g);const record=object(g,'record-intake');Object.assign(g.state.players.p2,{x:record.x,z:record.z});
  assert.equal(g.interact('p2'),true);const event=g.drainEvents().find(e=>e.type==='record');assert.equal(event.playerId,'p2');assert.equal(g.networkSnapshot().interactables.find(o=>o.id===record.id).used,true);
  const before=g.networkSnapshot();g.pause();g.update(.1,{p1:{fire:true},p2:{forward:1}});assert.equal(g.state.time,before.time);assert.equal(g.state.players.p1.ammo.pistol,before.players.p1.ammo.pistol);
});

test('Hollow room handshakes require matching mission data and snapshots retain the same circuit state',()=>{
  const rooms=new BreachRooms(),peer=()=>({messages:[],send(m){this.messages.push(m);},close(){}}),host=peer(),guest=peer(),stale=peer();
  rooms.handle(host,{type:'create',protocol:2,mission,difficulty:'standard',name:'Hollow QA',supportedMissions:[mission]});const id=host.messages.find(m=>m.type==='welcome').roomId;
  rooms.handle(stale,{type:'join',protocol:2,roomId:id,name:'Old client'});assert.equal(stale.messages.at(-1).code,'VERSION_MISMATCH');
  rooms.handle(guest,{type:'join',protocol:2,roomId:id,name:'Teammate',supportedMissions:[mission]});
  for(const p of [host,guest])rooms.handle(p,{type:'ready',ready:true});rooms.handle(host,{type:'start'});
  const room=rooms.rooms.get(id);assert.equal(room.game.level.id,HOLLOW.id);power(room.game);
  const control=object(room.game,'routing-1-a');Object.assign(room.game.state.players.p1,{x:control.x,z:control.z});rooms.handle(host,{type:'interact'});
  const a=host.messages.findLast(m=>m.type==='state'),b=guest.messages.findLast(m=>m.type==='state');assert.deepEqual(a,b);assert.equal(a.state.interactables.find(o=>o.id===control.id).used,true);rooms.shutdown();
});

test('Expert guidance does not expose the new route solution before use; story is not a mandatory instruction',()=>{
  const g=make();const m=MISSIONS.find(m=>m.id===mission);assert.equal(objectiveForGuidance(g.getObjective(),'expert'),null);
  assert.equal(briefingForGuidance(m,'expert').steps.length,0);assert.ok(!briefingForGuidance(m,'expert').text.includes('slow'));
  Object.assign(g.state.player,{x:28.5,z:59.5});assert.equal(interactionForGuidance(g.getInteractionInfo(),'expert'),null);
  power(g);assert.equal(interactionForGuidance(g.getInteractionInfo(),'expert').canUse,true);
});
