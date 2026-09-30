const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../daily_flyer/baseball_explorer/chart_guide.js'),C=require('../daily_flyer/qb_explorer/chart_math.js');
test('sparse linear axes gain useful labels without moving their bounds',()=>{
 const axis=C.axis([.2,.731,.82,.91,1.12]),before={low:axis.low,high:axis.high};
 const ticks=G.ticks(axis);assert.ok(ticks.length>=4);assert.ok(ticks.every(t=>t>=axis.low&&t<=axis.high));assert.deepEqual({low:axis.low,high:axis.high},before);
 for(const scale of ['density','symlog','log']){const a=C.axis([.2,.8,1.1],{scale});assert.deepEqual(G.ticks(a),a.ticks);}
});
test('year-two date stays visible and narrow-screen calendar ticks never overlap',()=>{
 for(const end of [5,10,19,30])for(const width of [160,250,500]){
  const ticks=G.years(end,width);assert.ok(ticks.includes(2));assert.ok(ticks.every(n=>n>=1&&n<=end));
  for(let i=1;i<ticks.length;i++)assert.ok((ticks[i]-ticks[i-1])/(end-1)*width>=52);
 }
 assert.deepEqual(G.years(2,170),[1,2]);assert.ok(G.years(10,240,8).every(n=>n<=8));
});
test('direction language handles rates, neutral metrics and missing seasons',()=>{
 assert.equal(G.change(-2,-1),'Improved in year two');assert.equal(G.change(-2,1),'Declined in year two');
 assert.equal(G.change(1,0),'Numerical change');assert.equal(G.change(null,1),'No comparable pair');assert.equal(G.change(0,1),'No change');
 assert.match(G.meaning('ops','batting',{direction:1}),/getting on base/);assert.match(G.meaning('era','pitching',{direction:-1}),/Lower is better/);
 assert.match(G.meaning('custom','batting',{direction:0,note:'Playing time matters.'}),/not inherently better/);
});
