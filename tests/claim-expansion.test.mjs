import test from 'node:test';
import assert from 'node:assert/strict';
import {ClaimGame,WEAPONS,ENEMIES,move,mapFor,clearSight,floorAt} from '../daily_flyer/themes/claim_denied_assets/core.mjs';
import {DEFAULT_SETTINGS,loadSettings,saveSettings,sanitizeSettings,assistAim} from '../daily_flyer/themes/claim_denied_assets/settings.mjs';
const start=()=>{const g=new ClaimGame({mission:'executive-retreat',seed:20});g.start();return g;};
function enemy(g,type,values={}){const def=ENEMIES[type],e={id:'e'+g.state.enemies.length,type,x:-7,z:0,y:0,health:def.health,maxHealth:def.health,phase:'hunt',windowId:g.state.windows[0].id,attack:1,ability:0,hit:0,path:[],pathTimer:0,...values};g.state.enemies.push(e);return e;}
function advance(g,seconds){for(let i=0;i<seconds*30;i++)g.update(1/30);}
test('both staircases climb and descend continuously; upper gallery cannot walk into atrium',()=>{
 const map=mapFor('executive-retreat');for(const x of [-9,9]){const p={x,z:-5,y:0};for(let i=0;i<200;i++)move(p,0,.05,map);assert.ok(p.y>3.59);assert.ok(p.z>4.8);for(let i=0;i<200;i++)move(p,0,-.05,map);assert.equal(p.y,0);assert.ok(p.z< -4.8);}
 const p={x:5.5,z:0,y:3.6};for(let i=0;i<50;i++)move(p,-.05,0,map);assert.ok(p.x>=5);assert.equal(p.y,3.6);
 assert.equal(floorAt(map,0,0,0),0);assert.ok(Number.isNaN(floorAt(map,0,0,3.6)));
});
test('hunters navigate stairs to an upstairs player without teleporting floors',()=>{
 const g=start(),p=g.player('p1');Object.assign(p,{x:-7,z:6,y:3.6,invulnerable:999});g.beginWave();g.state.remaining=999;g.state.spawnTimer=999;
 const e=enemy(g,'runner',{x:-9,z:-6});const path=g.pathTo(e,p);assert.ok(path.some(v=>v.y>0&&v.y<3.6));assert.ok(path.some(v=>v.y===3.6));
 let lastY=e.y;for(let i=0;i<1800;i++){g.update(1/30);assert.ok(Math.abs(e.y-lastY)<.2);lastY=e.y;if(e.y>3.59&&Math.hypot(e.x-p.x,e.z-p.z)<1.1)break;}
 assert.ok(e.y>3.59,JSON.stringify({x:e.x,z:e.z,y:e.y,path:e.path}));assert.ok(Math.hypot(e.x-p.x,e.z-p.z)<1.1);
});
test('bullets cross open atrium but cannot cross solid upper floor',()=>{
 const map=mapFor('executive-retreat');
 const a={x:-5.3,z:0,y:3.6},b={x:0,z:0,y:0},pitch=Math.atan2(1.4-5.2,5.3);
 assert.equal(clearSight(a,b,{bullets:true,y:5.2,pitch,map}),true);
 const c={x:-5.3,z:1,y:0};assert.equal(clearSight(a,c,{bullets:true,y:5.2,pitch:Math.atan2(1.4-5.2,1),map}),false);
});
test('upper supplies and revives cannot be used through the floor',()=>{
 const g=start(),p=g.player('p1');Object.assign(p,{x:-7,z:7,y:0,credits:5000});assert.notEqual(g.context(p.id)?.id,'smg');p.y=3.6;assert.equal(g.context(p.id).id,'smg');g.interact(p.id);assert.ok(p.owned.includes('smg'));assert.equal(p.credits,4250);
});
test('all three new weapons purchase, fire, and reload using their own magazines',()=>{
 for(const id of ['smg','marksman','lmg']){const g=start(),p=g.player('p1'),station=g.map.stations.find(s=>s.id===id);Object.assign(p,{x:station.x,z:station.z,y:station.y,credits:9999});g.interact(p.id);assert.equal(p.weapon,id);const count=p.ammo[id];g.shoot(p);assert.equal(p.ammo[id],count-1);g.reload(p);advance(g,WEAPONS[id].reload+.1);assert.equal(p.ammo[id],WEAPONS[id].mag);}
});
test('new corporate roles charge, heal, shield and launch dodgeable projectiles',()=>{
 const g=start(),p=g.player('p1');Object.assign(p,{x:-7,z:4,y:0,invulnerable:999});g.beginWave();g.state.spawnTimer=999;g.state.remaining=999;
 const collector=enemy(g,'collector',{x:-7,z:0}),broker=enemy(g,'broker',{x:-6,z:0}),hurt=enemy(g,'adjuster',{x:-6,z:1,health:10}),counsel=enemy(g,'counsel',{x:-7,z:-2});g.update(.03);
 assert.ok(collector.charge>0);assert.ok(hurt.health>10);assert.ok(g.state.projectiles.length>0);assert.equal(g.state.projectiles[0].damage,16);
 const shieldDamage=angle=>{const h=start(),a=h.player('p1');Object.assign(a,{x:-7,z:4,angle:0,pitch:-.07});const shield=enemy(h,'compliance',{x:-7,z:0,angle});h.shoot(a);return shield.maxHealth-shield.health;};assert.ok(shieldDamage(Math.PI)<shieldDamage(0));
});
test('settings persist, reject invalid values and remain safe when storage is unavailable',()=>{
 let raw='';const storage={setItem:(k,v)=>raw=v,getItem:()=>raw};saveSettings(storage,{...DEFAULT_SETTINGS,padArea:60,fireMode:'hold',invertY:true});assert.equal(loadSettings(storage).padArea,60);assert.equal(loadSettings(storage).fireMode,'hold');assert.equal(loadSettings(storage).invertY,true);
 assert.equal(sanitizeSettings({fov:999,aimAssist:-8,fireMode:'bad'}).fov,105);assert.equal(sanitizeSettings({aimAssist:-8}).aimAssist,0);assert.deepEqual(loadSettings({getItem:()=>{throw Error();}}),DEFAULT_SETTINGS);
});
test('aim assist gently corrects nearby visible targets and never pulls through walls/floors',()=>{
 const g=start(),p=g.player('p1');Object.assign(p,{x:-7,z:4,angle:0,pitch:-.07});const e=enemy(g,'adjuster',{x:-6.8,z:0});const aim=assistAim(g.state,p,0,-.07,1,.03);assert.ok(aim.angle>0&&aim.angle<.05);assert.deepEqual(assistAim(g.state,p,0,-.07,0,.03),{angle:0,pitch:-.07});
 Object.assign(p,{x:-7,z:0,y:3.6});Object.assign(e,{x:-7,z:1,y:0});const pitch=Math.atan2(1.3-5.2,1);assert.deepEqual(assistAim(g.state,p,Math.PI,pitch,1,.03),{angle:Math.PI,pitch});
});
test('actual weapon hits account for height and do not pass through gallery slabs',()=>{
 for(const blocked of [false,true]){const g=start(),p=g.player('p1');Object.assign(p,{x:blocked?-7:-5.3,z:0,y:3.6,weapon:'marksman'});p.ammo.marksman=8;p.reserve.marksman=64;
 const e=enemy(g,'adjuster',{x:blocked?-7:0,z:blocked?5:0,y:0});const d=Math.hypot(e.x-p.x,e.z-p.z);p.angle=Math.atan2(e.x-p.x,-(e.z-p.z));p.pitch=Math.atan2(1.3-5.2,d);g.shoot(p);assert.equal(e.health<e.maxHealth,!blocked);}
});
test('Legal Counsel projectiles travel before damage and are stopped by solid walls',()=>{
 const g=start(),p=g.player('p1');Object.assign(p,{x:-7,z:0,invulnerable:0});g.beginWave();g.state.spawnTimer=999;g.state.remaining=999;
 g.state.projectiles.push({id:'test',x:-7,y:1.2,z:-3,vx:0,vy:0,vz:6,life:3,damage:16});g.update(.03);assert.equal(p.health,100);advance(g,.6);assert.equal(p.health,84);
 g.state.projectiles.push({id:'wall',x:11.8,y:1.2,z:0,vx:6,vy:0,vz:0,life:3,damage:16});advance(g,.2);assert.equal(g.state.projectiles.length,0);
});
