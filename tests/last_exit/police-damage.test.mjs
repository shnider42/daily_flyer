import test from 'node:test';import assert from 'node:assert/strict';
import {Game,makeCar,applyDamage,dist}from'../../daily_flyer/themes/last_exit_assets/engine.js';
import {deformCarPoint,drawCar}from'../../daily_flyer/themes/last_exit_assets/models.js';import{Mesh}from'../../daily_flyer/themes/last_exit_assets/render.js';
const empty=()=>{const g=new Game({buildings:[],palms:[],signals:[]});g.traffic=[];g.parked=[];g.pedestrians=[];return g;};
const ticks=(g,n)=>{for(let i=0;i<n;i++)g.tick(1/60,{});};
test('corner impacts create distinct localized dents and preserve the far corner',()=>{
 const a=makeCar(0,0,0),b=makeCar(0,0,0);applyDamage(a,24,0,-1,{x:-.9,z:2.6});applyDamage(b,24,0,-1,{x:.9,z:2.6});
 const left=[-.9,1.03,2.5],right=[.9,1.03,2.5];assert.ok(deformCarPoint(left,a)[2]<deformCarPoint(left,b)[2]-.08);assert.ok(deformCarPoint(right,b)[2]<deformCarPoint(right,a)[2]-.08);
 assert.equal(a.dents.length,1);assert.equal(a.dents[0].x,-.9);
});
test('repeated impacts keep dent data and extreme geometry bounded',()=>{
 const c=makeCar();for(let i=0;i<80;i++){c.hit=0;applyDamage(c,35,0,-1,{x:c.x+Math.sin(i)*1.1,z:c.z+Math.cos(i)*2.65});}
 assert.ok(c.dents.length<=10);assert.ok(c.dents.every(d=>d.depth<=.5));const m=new Mesh();drawCar(m,c,{time:25});assert.ok(m.v.every(Number.isFinite));
 const g=empty();g.car=c;g.recover();assert.deepEqual(g.car.dents,[]);
});
test('raising heat adds units without repairing or replacing the original cruiser',()=>{
 const g=empty();g.raiseHeat(1);const p=g.cops[0];p.damage=65;p.engineDamage=40;g.raiseHeat(2);
 assert.equal(g.cops.filter(p=>p.engineDamage<100).length,2);assert.equal(g.cops[0],p);assert.equal(p.damage,65);assert.equal(p.engineDamage,40);assert.ok(g.cops.every(p=>dist(p,g.actor)>75));g.raiseHeat(1);assert.equal(g.heat,2);
});
test('searching police pursue the last sighting instead of hidden player coordinates',()=>{
 const g=empty();g.car=makeCar(0,0,0);g.raiseHeat(1);const p=g.cops[0];p.x=0;p.z=-30;p.a=0;p.goal=null;ticks(g,1);assert.equal(p.pursuitState,'pursuit');const sighting={...p.last};
 g.car.x=120;g.car.z=120;ticks(g,1);assert.equal(p.pursuitState,'search');assert.deepEqual(p.last,sighting);assert.ok(g.hidden>0);
});
test('a disabled police engine cannot chase, spot, or arrest the player',()=>{
 const g=empty();g.car=makeCar(0,0,0);g.raiseHeat(1);const p=g.cops[0];p.x=0;p.z=-6.5;p.speed=0;p.engineDamage=100;
 ticks(g,60);assert.equal(p.pursuitState,'disabled');assert.equal(p.seen,false);assert.equal(p.sirens,false);assert.equal(g.busted,0);assert.ok(Math.abs(p.speed)<.01);
});
test('escaped police switch off their sirens and remain in the city',()=>{
 const g=empty();g.car=makeCar(-200,-200,0);g.raiseHeat(1);const p=g.cops[0];p.x=216;p.z=216;p.goal=null;ticks(g,490);
 assert.equal(g.heat,0);assert.ok(g.cops.includes(p));assert.equal(p.sirens,false);assert.equal(p.pursuitState,'patrol');
});
