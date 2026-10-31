import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,WEAPONS,ownedWeapons} from '../daily_flyer/themes/breach_assets/core.mjs';
import {CoopGame} from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import {SHADOW,SHADOW_ID,bossDefeated,platformSolid,updateTraversal,jumpInfo} from '../daily_flyer/themes/breach_assets/shadow.mjs';
const game=()=>{const g=new Game({mission:SHADOW_ID});g.start();return g;};
const find=(g,id)=>[...g.state.enemies,...g.state.interactables,...g.state.pickups,...g.state.doors].find(o=>o.id===id);
const use=(g,id)=>{const o=find(g,id);Object.assign(g.state.player,{x:o.x,z:o.z});return g.interact();};
const collect=(g,id)=>{const o=find(g,id);Object.assign(g.state.player,{x:o.x,z:o.z});g._collectPickups();return o.collected;};
const kill=(g,e)=>g._damageEnemy(e,10000,'player');
function reach(g,start){const seen=new Set(),q=[[Math.floor(start.x),Math.floor(start.z)]];for(let i=0;i<q.length;i++){const[x,z]=q[i],key=`${x},${z}`;if(seen.has(key)||g._wall(x+.5,z+.5))continue;seen.add(key);for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])q.push([x+dx,z+dz]);}return seen;}

test('Shadow is standalone, substantial, and begins with one weapon in solo and co-op',()=>{
 const g=game(),c=new CoopGame({mission:SHADOW_ID});assert.equal(g.level.name,'Beneath The Shadow');assert.equal(g.level.zones.length,10);assert.ok(SHADOW.grid.join('').split('.').length>6500);
 assert.deepEqual(ownedWeapons(g.state.player),['pistol']);for(const p of Object.values(c.state.players))assert.deepEqual(ownedWeapons(p),['pistol']);
 for(const item of g.level.pickups.filter(i=>WEAPONS[i.type]?.ownershipKey))assert.ok(Math.hypot(item.x-SHADOW.spawn.x,item.z-SHADOW.spawn.z)>20,item.id);
});
test('the hydra is reachable before the projector, whose workshop genuinely needs the Warden',()=>{
 const g=game();find(g,'arrival').open=true;g.state.power=true;find(g,'aux-power').used=true;
 const seen=reach(g,g.state.player),key=o=>`${Math.floor(o.x)},${Math.floor(o.z)}`;
 assert.ok(seen.has(key(find(g,'echo-root-0'))));assert.ok(!seen.has(key(find(g,'null-projector'))));
 assert.equal(g._requirementMet('boss:warden'),false);kill(g,find(g,'iron-warden'));assert.equal(g._requirementMet('boss:warden'),true);
 find(g,'lab-seal').open=true;assert.ok(reach(g,g.state.player).has(key(find(g,'null-projector'))));
});
test('unmarked hydra has exactly seven finite roots; no projector is required to win',()=>{
 const g=game();g.state.power=true;let kills=0;
 while(!bossDefeated(g,'hydra')){const root=g.state.enemies.find(e=>e.bossGroup==='hydra'&&e.alive);assert.ok(root);kill(g,root);assert.ok(++kills<=7);}
 assert.equal(kills,7);assert.equal(g.state.enemies.filter(e=>e.bossGroup==='hydra').length,7);assert.equal(g.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.dormant).length,0);
});
test('a real Null shot marks the root before damage; killing during its window prevents splitting',()=>{
 const g=game(),root=find(g,'echo-root-0'),p=g.state.player;Object.assign(p,{x:root.x,z:root.z+4,angle:0,weapon:'nullgun',hasNull:true});p.ammo.cells=5;
 g._fire();assert.equal(root.suppressedTimer,8);assert.ok(root.health<root.maxHealth);kill(g,root);assert.ok(bossDefeated(g,'hydra'));assert.ok(g.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.rootIndex>0).every(e=>e.dormant&&!e.alive));
});
test('a faded suppression mark permits splitting again',()=>{
 const g=game(),r=find(g,'echo-root-0');r.suppressedTimer=.05;g._updateEnemy(r,.1);assert.equal(r.suppressedTimer,0);kill(g,r);assert.equal(g.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.alive).length,2);
});
test('stationary emplacements warn and fire but never chase the player',()=>{
 const g=game(),e=find(g,'iron-warden'),x=e.x,z=e.z;Object.assign(g.state.player,{x:e.x,z:e.z+5});e.attackCooldown=0;e.active=true;
 for(let i=0;i<14;i++)g._updateEnemy(e,.1);assert.equal(e.x,x);assert.equal(e.z,z);assert.ok(g.state.projectiles.length>=3);assert.ok(g.drainEvents().some(e=>e.type==='enemy-warning'));assert.equal(e.bossPhase,'recover');
});
test('earned weapons, boss branches, secrets and records survive solo save and checkpoint retry',()=>{
 const g=game();find(g,'arrival').open=true;assert.ok(use(g,'aux-power'));collect(g,'rivet-repeater');kill(g,find(g,'iron-warden'));
 collect(g,'null-projector');use(g,'record-lab');use(g,'cache-panel');kill(g,find(g,'echo-root-0'));
 const restored=game();assert.ok(restored.restore(g.serialize()));assert.ok(restored.state.player.hasNull&&restored.state.player.hasRepeater);assert.equal(restored.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.alive).length,2);
 assert.ok(restored.restartCheckpoint());assert.ok(restored.state.player.hasNull);assert.ok(bossDefeated(restored,'warden'));assert.ok(find(restored,'cache-panel').used);assert.equal(restored.state.enemies.filter(e=>e.bossGroup==='hydra'&&e.alive).length,2);
});
test('new racks equip both operators once without switching the partner’s selected gun',()=>{
 const c=new CoopGame({mission:SHADOW_ID});c.start();const rack=find(c,'rivet-repeater');Object.assign(c.state.players.p1,{x:rack.x,z:rack.z});c._withPlayer('p1',()=>c._collectPickups());assert.ok(c.state.players.p1.hasRepeater&&c.state.players.p2.hasRepeater);assert.equal(c.state.players.p2.weapon,'pistol');const rounds=c.state.players.p2.ammo.pistol;c._withPlayer('p1',()=>c._collectPickups());assert.equal(c.state.players.p2.ammo.pistol,rounds);
});
test('three independent secrets pay once and restore with an accurate count',()=>{
 const g=game();for(const s of g.state.interactables.filter(i=>i.type==='secret')){assert.ok(use(g,s.id));const ammo=g.state.player.ammo.pistol;use(g,s.id);assert.equal(g.state.player.ammo.pistol,ammo);}
 assert.equal(g.state.interactables.filter(i=>i.type==='secret'&&i.used).length,3);const fresh=game();assert.ok(fresh.restore(g.serialize()));assert.equal(fresh.state.interactables.filter(i=>i.type==='secret'&&i.used).length,3);
});
test('platform jumps require facing and timed landings; falls return to stable ground',()=>{
 const g=game(),o=find(g,'jump-street-0');Object.assign(g.state.player,{x:o.x,z:o.z,angle:0});assert.equal(jumpInfo(g,o).canUse,false);
 g.state.player.angle=Math.atan2(o.landing.x-o.x,-(o.landing.z-o.z));updateTraversal(g,0);assert.ok(jumpInfo(g,o).canUse);assert.ok(g.interact());
 for(let i=0;i<11;i++)updateTraversal(g,.1);assert.equal(g.state.player.jump,null);assert.equal(g.state.player.x,o.landing.x);assert.equal(g.state.player.elevation,0);
 const timed=SHADOW.platformRooms[0].platforms[2];assert.ok(platformSolid(timed,1));assert.equal(platformSolid(timed,6),false);
 const stable={x:50.5,z:57.5};g.state.player.safeGround=stable;Object.assign(g.state.player,{x:56.5,z:45.5});updateTraversal(g,.1);assert.equal(g.state.player.x,stable.x);assert.ok(g.state.player.health<100);
});
test('mid-jump saves recover on the launch ledge without inventing a route',()=>{
 const g=game(),o=find(g,'jump-street-0');Object.assign(g.state.player,{x:o.x,z:o.z,angle:Math.atan2(o.landing.x-o.x,-(o.landing.z-o.z))});assert.ok(g.interact());updateTraversal(g,.4);
 const fresh=game();assert.ok(fresh.restore(g.serialize()));assert.equal(fresh.state.player.x,o.x);assert.equal(fresh.state.player.z,o.z);assert.ok(!fresh.state.player.jump);
});
test('both bells and final guardian gate extraction; completed standalone story restores',()=>{
 const g=game();find(g,'arrival').open=true;use(g,'aux-power');kill(g,find(g,'iron-warden'));const r=find(g,'echo-root-0');r.suppressedTimer=8;kill(g,r);
 assert.ok(use(g,'relay-west'));assert.ok(use(g,'relay-east'));assert.ok(!collect(g,'access-key'));kill(g,find(g,'sun-guardian'));assert.ok(collect(g,'access-key'));find(g,'security').open=true;assert.ok(use(g,'extraction'));assert.equal(g.state.status,'won');
 const fresh=game();assert.ok(fresh.restore(g.serialize()));assert.equal(fresh.state.status,'won');
});

test('the early hydra route is killable with real pistol shots at normal damage',()=>{
 const g=game(),p=g.state.player;p.ammo.pistol=300;let roots=0,shots=0;
 while(!bossDefeated(g,'hydra')){
  const r=g.state.enemies.find(e=>e.bossGroup==='hydra'&&e.alive);Object.assign(p,{x:r.x,z:r.z+2,angle:0,weapon:'pistol'});
  while(r.alive&&shots<250){g._shotCooldown=0;g._fire();shots++;}
  assert.ok(!r.alive);assert.ok(++roots<=7);
 }
 assert.equal(roots,7);assert.ok(shots>50&&shots<150,`${shots} shots`);
});
test('lance penetrates targets but cannot penetrate a solid wall',()=>{
 const g=game(),p=g.state.player;Object.assign(p,{x:57.5,z:106.5,angle:0,weapon:'lance',hasLance:true});p.ammo.slugs=3;
 g.state.enemies=[1,2,3,4].map((n)=>({id:`line-${n}`,type:'runner',x:p.x,z:p.z-n*2,health:100,maxHealth:100,alive:true,active:true}));
 g._fire();assert.deepEqual(g.state.enemies.map(e=>e.health),[20,20,20,100]);assert.equal(p.ammo.slugs,2);
 const hidden=g.state.enemies[3];hidden.x=54.5;hidden.z=97.5;p.angle=Math.atan2(hidden.x-p.x,-(hidden.z-p.z));g._shotCooldown=0;g._fire();assert.equal(hidden.health,100);
});

test('walking onto a launch ledge is safe and optional caches require a gap crossing',()=>{
 const g=game(),p=g.state.player;g.state.enemies=[];Object.assign(p,{x:53.5,z:54.3,angle:0});
 for(let i=0;i<4;i++)g.update(.1,{forward:1});assert.ok(p.z<53.5&&p.z>51);assert.equal(p.health,100);
 for(const room of SHADOW.platformRooms){const cache=g.level.pickups.find(p=>p.id===`${room.id}-cache`);assert.ok(cache.x>room.x1+3&&cache.x<room.x2-3&&cache.z>room.z1+3&&cache.z<room.z2-3);}
});
test('co-op traversal belongs to each operator and earned equipment survives team retry',()=>{
 const c=new CoopGame({mission:SHADOW_ID});c.start();c.state.enemies.forEach(e=>e.active=false);const o=find(c,'jump-street-0'),p=c.state.players.p1,other={...c.state.players.p2};
 Object.assign(p,{x:o.x,z:o.z,angle:Math.atan2(o.landing.x-o.x,-(o.landing.z-o.z))});assert.ok(c.interact('p1'));
 for(let i=0;i<11;i++)c.update(.1,{});assert.equal(p.jump,null);assert.equal(p.x,o.landing.x);assert.equal(c.state.players.p2.x,other.x);
 Object.assign(p,{x:51.5,z:79.5});assert.ok(c.interact('p1'));const rack=find(c,'rivet-repeater');Object.assign(p,{x:rack.x,z:rack.z});c._withPlayer('p1',()=>c._collectPickups());
 assert.ok(c.restartCheckpoint());for(const player of Object.values(c.state.players))assert.ok(player.hasRepeater);
});

// This route test isolates geometry/progression from enemy tactics. Combat,
// suppression and projectile timing have independent tests above.
function walk(g,target){
 const p=g.state.player,start=[Math.floor(p.x),Math.floor(p.z)],goal=`${Math.floor(target.x)},${Math.floor(target.z)}`;
 const q=[start],prev=new Map([[start.join(','),null]]),doors=new Map(g.state.doors.map(d=>[`${Math.floor(d.x)},${Math.floor(d.z)}`,d]));
 for(let i=0;i<q.length;i++){const[x,z]=q[i],key=`${x},${z}`;if(key===goal)break;
  for(const[nx,nz]of[[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){const k=`${nx},${nz}`,d=doors.get(k);
   if(prev.has(k)||g.level.grid[nz]?.[nx]!=='.'||d&&!g.canTraverseDoor(d)||g.level.platformRooms.some(r=>nx+.5>=r.x1&&nx+.5<r.x2&&nz+.5>=r.z1&&nz+.5<r.z2))continue;
   prev.set(k,key);q.push([nx,nz]);
  }
 }
 assert.ok(prev.has(goal),`path to ${target.id}`);const route=[];for(let k=goal;k;k=prev.get(k))route.unshift(k.split(',').map(Number));
 for(const[x,z]of route.slice(1)){
  const d=doors.get(`${x},${z}`);if(d&&!d.open){assert.ok(g.interact(),`interact at ${d.id}`);assert.ok(d.open);}
  let steps=0;while(Math.hypot(x+.5-p.x,z+.5-p.z)>.025&&steps++<40){const gap=Math.hypot(x+.5-p.x,z+.5-p.z);p.angle=Math.atan2(x+.5-p.x,-(z+.5-p.z));g.update(Math.min(.1,gap/3.35),{forward:1});}
  assert.ok(steps<40,`walk to ${x},${z}`);assert.equal(g.state.status,'playing');
 }
}
test('complete walking expedition earns all three weapons, opens both gates and returns through the lift',()=>{
 const g=game();g._updateEnemies=()=>{};
 const visit=id=>walk(g,find(g,id)),operate=id=>{visit(id);assert.ok(g.interact(),id);};
 visit('arrival');operate('aux-power');visit('rivet-repeater');assert.ok(g.state.player.hasRepeater);
 walk(g,{x:25.5,z:82.5});kill(g,find(g,'iron-warden'));visit('null-projector');assert.ok(g.state.player.hasNull);
 walk(g,{x:99.5,z:49.5});const root=find(g,'echo-root-0');root.suppressedTimer=8;kill(g,root);visit('breach-lance');assert.ok(g.state.player.hasLance);
 operate('relay-east');operate('relay-west');walk(g,{x:100.5,z:25.5});kill(g,find(g,'sun-guardian'));visit('access-key');assert.ok(g.state.player.key);
 visit('security');operate('extraction');assert.equal(g.state.status,'won');
});
