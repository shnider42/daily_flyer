const assert=require('node:assert/strict'),{test}=require('node:test');
const M=require('../daily_flyer/qb_preview/math.js');
const player=(seasons,extra={})=>({first:2001,seasons,...extra});
const row=(year,rating,extra={})=>({year,rating,gs:16,att:500,qualifies:true,...extra});
test('year two is the next calendar season, never the next recorded row',()=>{
 const p=player([row(2001,80),row(2003,90)]);
 assert.equal(M.pair(p,'rating').b,null);assert.equal(M.pair(p,'rating').delta,null);
 assert.match(M.warning(p,'rating',2024),/next recorded season does not replace/);
 assert.deepEqual(M.series(p,'rating',4).map(s=>s.value),[80,null,90,null]);
});
test('uncertain study starts suppress calculated changes',()=>{
 const p=player([row(2001,80),row(2002,90)],{anchor_uncertain:true});
 assert.equal(M.pair(p,'rating').delta,null);assert.match(M.warning(p,'rating',2024),/uncertain/);
});
test('missing values and an out-of-snapshot year are never zero',()=>{
 const p=player([row(2024,90)],{first:2024});
 assert.equal(M.pair(p,'rating').delta,null);assert.match(M.warning(p,'rating',2024),/outside this snapshot/);
 assert.equal(M.format(null,'rating'),'Unavailable');
 assert.equal(M.pair(player([row(2001,null),row(2002,0)]),'rating').delta,null);
});
test('printed change uses unrounded values',()=>{
 const q=M.pair(player([row(2001,86.455811138),row(2002,85.721713810)]),'rating');
 assert.equal(M.format(q.a,'rating'),'86.5');assert.equal(M.format(q.b,'rating'),'85.7');
 assert.equal(M.format(q.delta,'rating',true),'−0.7');
 assert.equal(M.format(0.0039,'relative_anya',true),'+<0.01');
});
test('metric directions and percentage-point changes are explicit',()=>{
 assert.equal(M.direction(-0.4,'int_pct'),'Improved on this measure');
 assert.equal(M.direction(-0.4,'rating'),'Declined on this measure');
 assert.equal(M.direction(0,'rating'),'Unchanged');
 assert.equal(M.metrics.int_pct.changeUnit,'percentage points');
 assert.equal(M.metrics.cmp_pct.changeUnit,'percentage points');
});
test('small year-two workload stays visible, not filtered out',()=>{
 const p=player([row(2001,65),row(2002,120,{gs:3,att:69,qualifies:false})]);
 assert.equal(M.pair(p,'rating').delta,55);assert.match(M.warning(p,'rating',2024),/3 starts and 69 attempts/);
});
test('round shared scales include every finite value and meaningful zero',()=>{
 assert.deepEqual(M.niceAxis([71.2,90.7],'rating'),{lo:0,hi:160,ticks:[0,40,80,120,160]});
 for(const key of ['int_pct','relative_anya'])for(const values of [[],[0],[0.001,0.002],[-4.9,2.7],[4.92,13.7]]){
   const a=M.niceAxis(values,key);assert.ok(a.hi>a.lo);assert.ok(a.ticks.includes(0));
   assert.ok(values.every(n=>n>=a.lo&&n<=a.hi));assert.ok(a.ticks.length<=7);
 }
});
