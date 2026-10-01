const assert=require('node:assert/strict'),{test}=require('node:test');
const M=require('../daily_flyer/year_two_chart_math.js');
const points=ys=>ys.map((y,i)=>({x:i+2000,year:i+2000,y}));
test('linear trend uses actual time spacing and full precision, never extrapolates',()=>{
 const t=M.trend([{x:1990,y:4},{x:1991,y:6},{x:1995,y:14}]);
 assert.equal(t.slope,2);assert.equal(t.r2,1);assert.equal(t.n,3);
 assert.deepEqual(t.points,[{x:1990,y:4},{x:1995,y:14}]);
});
test('two years do not pretend to establish a trend; constant R² is undefined',()=>{
 assert.match(M.trend(points([1,2])).reason,/3 measured/);
 assert.equal(M.trend(points([3,3,3])).slope,0);assert.equal(M.trend(points([3,3,3])).r2,null);
 assert.match(M.trend([{x:1,y:2},{x:1,y:3},{x:1,y:4}]).reason,/different years/);
});
test('trailing average requires exactly three consecutive measured years',()=>{
 assert.deepEqual(M.movingAverage(points([3,6,9,null,12,15,18])).map(p=>p.y),[null,null,6,null,null,null,15]);
 assert.deepEqual(M.movingAverage([{x:1,y:3},{x:2,y:6},{x:4,y:9}]).map(p=>p.y),[null,null,null]);
});
test('mean and median describe each shown player series with equal-year weights',()=>{
 const o=M.overlays(points([1,2,90,null]),{mean:true,median:true});
 assert.equal(o.lines.find(l=>l.kind==='mean').points[0].y,31);
 assert.equal(o.lines.find(l=>l.kind==='median').points[0].y,2);
 assert.equal(M.median([1,2,3,4]),2.5);
});
test('actual years, calendar gaps and uncertain baselines stay honest',()=>{
 const p={first:2000,seasons:[{year:2000,value:10},{year:2002,value:20}]},settings={window:'all',timeline:'career',normalize:'raw'};
 assert.deepEqual(M.series(p,'value',settings).map(p=>p.y),[10,null,20]);
 assert.deepEqual(M.series(p,'value',{...settings,timeline:'calendar'}).map(p=>p.x),[2000,2001,2002]);
 assert.deepEqual(M.series(p,'value',{...settings,normalize:'delta'}).map(p=>p.y),[0,null,10]);
 assert.deepEqual(M.series({...p,anchor_uncertain:true},'value',{...settings,normalize:'delta'}).map(p=>p.y),[null,null,null]);
 assert.deepEqual(M.series({...p,first:null},'value',settings),[]);
});
test('recorded lines break at gaps while fitted reference lines may span the fit interval',()=>{
 const p=[{x:1,y:2},{x:3,y:4}];
 assert.equal(M.path(p,x=>x,y=>y),'M1,2 M3,4 ');
 assert.equal(M.path(p,x=>x,y=>y,true),'M1,2 L3,4 ');
});
test('common axes include observations, fitted endpoints and reference values',()=>{
 const a=M.axis([-9,1,4,55],true);assert.ok(a.lo<=-9&&a.hi>=55);assert.ok(a.ticks.includes(0));
 assert.ok(a.ticks.length<=7);assert.ok(M.axis([]).hi>M.axis([]).lo);
});
test('large shared graphs do not depend on a browser function-argument limit',()=>{
 const axis=M.axis(Array.from({length:200000},(_,i)=>i%500));assert.ok(axis.lo<=0&&axis.hi>=499);
});
