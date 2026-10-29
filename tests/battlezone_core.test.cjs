const {test} = require('node:test');
const assert = require('node:assert/strict');
const V = require('../daily_flyer/themes/battlezone_assets/core.js');
const arena = (mode='patrol') => {
  const s=V.create(1980,mode);s.phase='playing';s.obstacles=[];
  s.enemies=[enemy(80,80)];return s;
};
const enemy=(x,z,type='scout')=>({x,z,angle:Math.PI,radius:2.7,hp:type==='heavy'?2:1,type,flankSide:1,cooldown:99,windup:0,hit:0});
const bullet=(owner='player')=>({x:0,z:0,vx:0,vz:105,owner,life:2});
const advance=(s,n,input={})=>{for(let i=0;i<n;i++)V.step(s,input,1/60);};

test('same seed and inputs produce identical battles including bonus events',()=>{
  const a=arena(),b=arena();a.wave=b.wave=2;
  for(let i=0;i<3600;i++){const input={forward:i%300<100,right:i%300>150,fire:true};V.step(a,input,1/60);V.step(b,input,1/60);}
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.ok(Number.isFinite(a.player.x)&&Number.isFinite(a.player.angle));
});
test('paused simulation freezes every mechanic',()=>{
  const s=arena();s.phase='paused';s.pickups=[{x:0,z:0,life:10,radius:2.5}];const before=JSON.stringify(s);
  advance(s,60,{fire:true});assert.equal(JSON.stringify(s),before);
});
test('nearest cover stops a shell before the tank or bonus target',()=>{
  const s=arena();s.enemies=[enemy(0,4)];s.saucer={x:0,z:3,radius:1,hp:1,life:12,vx:0,vz:0};
  s.obstacles=[{x:0,z:1,radius:.3}];s.bullets=[bullet()];V.step(s,{},.05);
  assert.equal(s.score,0);assert.ok(s.saucer);assert.equal(s.enemies.length,1);
});
test('heavy armor takes two hits and each shell is counted once',()=>{
  const s=arena();s.enemies=[enemy(0,4,'heavy')];s.bullets=[bullet()];V.step(s,{},.05);
  assert.equal(s.enemies[0].hp,1);assert.equal(s.score,0);s.bullets=[bullet()];V.step(s,{},.05);
  assert.equal(s.score,2000);assert.equal(s.hits,2);assert.equal(s.kills,1);assert.ok(s.hitMarker>0);
});
test('bonus saucer awards points without counting as a tank kill',()=>{
  const s=arena();s.saucer={x:0,z:4,radius:3.3,hp:1,type:'saucer',life:12,vx:0,vz:0};s.bullets=[bullet()];V.step(s,{},.05);
  assert.equal(s.saucer,null);assert.equal(s.score,1500);assert.equal(s.bonusKills,1);assert.equal(s.kills,0);assert.equal(s.hits,1);
});
test('saucer appears from wave two, expires, and never delays a daily win',()=>{
  const s=arena('daily');s.wave=2;s.time=15;V.step(s,{},.01);assert.ok(s.saucer);
  s.saucer.life=.001;V.step(s,{},.01);assert.equal(s.saucer,null);
  s.wave=5;s.enemies=[];s.saucer={x:20,z:20,vx:1,vz:0,radius:3,life:9};V.step(s,{},.01);
  assert.equal(s.phase,'won');assert.equal(s.wavesCleared,5);assert.equal(s.saucer,null);
});
test('every second tank drops one repair; drops expire without collection',()=>{
  const s=arena();s.enemies=[enemy(0,15)];s.kills=1;s.bullets=[{...bullet(),z:10}];V.step(s,{},.05);
  assert.equal(s.pickups.length,1);s.pickups[0].life=.001;V.step(s,{},.01);assert.equal(s.pickups.length,0);
});
test('repair restores only one hull point; full hull pickup awards 500',()=>{
  const s=arena();s.player.hp=2;s.pickups=[{x:0,z:0,radius:2.5,life:30}];V.step(s,{},.01);
  assert.equal(s.player.hp,3);assert.equal(s.repairs,1);assert.equal(s.pickups.length,0);
  s.pickups=[{x:0,z:0,radius:2.5,life:30}];V.step(s,{},.01);assert.equal(s.player.hp,3);assert.equal(s.score,500);
});
test('a fatal shot cannot be undone by a repair in the same frame',()=>{
  const s=arena();s.player.hp=1;s.pickups=[{x:0,z:0,radius:2.5,life:30}];s.bullets=[bullet('enemy')];V.step(s,{},.01);
  assert.equal(s.phase,'lost');assert.equal(s.player.hp,0);
});
test('flankers spawn in wave two and move sideways between shots',()=>{
  const s=arena();s.enemies=[];advance(s,182);assert.equal(s.wave,2);assert.ok(s.enemies.some(e=>e.type==='flanker'));
  const e=enemy(0,50,'flanker');s.enemies=[e];advance(s,90);
  assert.ok(Math.abs(e.x)>1,'flanker should move to the side');assert.ok(e.z<50);
});
test('precision aim slows turning without slowing the drive',()=>{
  const a=arena(),b=arena();V.step(a,{right:true},.05);V.step(b,{right:true,precision:true},.05);
  assert.ok(b.player.angle<a.player.angle/2);
  const c=arena(),d=arena();V.step(c,{forward:true},.05);V.step(d,{forward:true,precision:true},.05);assert.equal(c.player.z,d.player.z);
});
test('sight brackets respect cover and threats identify the relative direction',()=>{
  const s=arena();s.enemies=[enemy(0,60)];assert.equal(V.sightTarget(s),s.enemies[0]);
  s.obstacles=[{x:0,z:30,radius:4}];assert.equal(V.sightTarget(s),null);
  s.enemies=[{...enemy(30,0),windup:1}];assert.equal(V.firingThreat(s),'RIGHT');
});
test('reload limits held fire and world boundary limits motion',()=>{
  const s=arena();advance(s,60,{fire:true});assert.equal(s.shots,2);
  s.player.z=193.9;advance(s,60,{forward:true});assert.ok(Math.hypot(s.player.x,s.player.z)<=194);
});
test('player invulnerability prevents multiple simultaneous shell hits',()=>{
  const s=arena();s.bullets=[bullet('enemy'),bullet('enemy')];V.step(s,{},.01);assert.equal(s.player.hp,2);
});
