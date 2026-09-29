/* Run with: node --test tests/test_qb_chart_math.cjs */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {series, axis} = require('../daily_flyer/qb_explorer/chart_math.js');
const player = {first:2000,seasons:[{year:2000,rating:40},{year:2001,rating:60},{year:2003,rating:80},{year:2004,rating:null}]};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('change uses the actual first qualifying year, retains missing values',()=>{
  const s=series(player,'rating','delta');
  assert.deepEqual(player.seasons.map(s.value),[0,20,40,null]);
  const missing={...player,first:1999};
  assert.equal(series(missing,'rating','delta').value(player.seasons[1]),null);
  assert.equal(series({...player,anchor_uncertain:true},'rating','delta').value(player.seasons[1]),null);
});
test('career z-scores use the full career and population variance',()=>{
  const s=series(player,'rating','zscore');
  close(s.value(player.seasons[0]),-Math.sqrt(1.5));
  close(s.value(player.seasons[1]),0);
  close(s.value(player.seasons[2]),Math.sqrt(1.5));
  assert.equal(s.value(player.seasons[3]),null);
  for(const values of [[50],[50,50]]){
    const p={first:2000,seasons:values.map((rating,i)=>({year:2000+i,rating}))};
    assert.equal(series(p,'rating','zscore').value(p.seasons[0]),null);
  }
});
test('logarithmic intervals preserve ratios; signed log preserves zero and signs',()=>{
  const log=axis([1,10,100],{scale:'log',range:'custom',min:1,max:100});
  close(log.unit(1),0);close(log.unit(10),.5);close(log.unit(100),1);
  const signed=axis([-10,0,10],{scale:'log',range:'custom',min:-10,max:10});
  assert.equal(signed.scale,'symlog');assert.ok(signed.notes.length);
  close(signed.unit(-10),0);close(signed.unit(0),.5);close(signed.unit(10),1);
  assert.equal(axis([0,10],{scale:'log'}).scale,'symlog');
  assert.equal(axis([5,10],{scale:'log',range:'zero'}).scale,'symlog');
});
test('fitted, custom and invalid bounds never fabricate or silently discard data',()=>{
  const fit=axis([80,85,90],{range:'fit'});assert.ok(fit.low>0);assert.equal(fit.clipped,0);
  const custom=axis([40,60,80],{range:'custom',min:'50',max:'70'});assert.equal(custom.clipped,2);assert.equal(custom.low,50);assert.equal(custom.high,70);
  const invalid=axis([40,60,80],{range:'custom',min:'90',max:'10'});assert.equal(invalid.clipped,0);assert.ok(invalid.notes.length);
  for(const values of [[],[0],[8,8],[-5,-5]])for(const scale of ['linear','log','symlog']){
    const a=axis(values,{scale});assert.ok(Number.isFinite(a.low)&&Number.isFinite(a.high)&&a.low<a.high);
    values.forEach(v=>assert.ok(Number.isFinite(a.unit(v))));
  }
});
test('density spacing expands a dense cluster, preserves ordering and ties',()=>{
  const values=[-100,1,1.1,1.2,1.2,1.3,100];
  const dense=axis(values,{scale:'density'}),linear=axis(values,{scale:'linear'});
  assert.ok(dense.unit(1.3)-dense.unit(1)>10*(linear.unit(1.3)-linear.unit(1)));
  for(let i=1;i<values.length;i++)assert.ok(dense.unit(values[i])>=dense.unit(values[i-1]));
  assert.equal(dense.unit(values[3]),dense.unit(values[4]));assert.equal(dense.clipped,0);
  const shared=axis([...values],{scale:'density'});close(shared.unit(1.1),dense.unit(1.1));
  const custom=axis(values,{scale:'density',range:'custom',min:1,max:1.3});
  close(custom.unit(1),0);close(custom.unit(1.3),1);assert.equal(custom.clipped,2);
  for(const v of [[],[0],[7,7]]){const a=axis(v,{scale:'density'});assert.ok(a.high>a.low);v.forEach(x=>assert.ok(Number.isFinite(a.unit(x))));}
});
test('middle 80% is an explicit linear zoom, with clipping disclosed',()=>{
  const values=Array.from({length:101},(_,i)=>i);
  const a=axis(values,{scale:'linear',range:'middle'});
  assert.equal(a.low,10);assert.equal(a.high,90);assert.equal(a.clipped,20);
  close(a.unit(30),.25);close(a.unit(50),.5);
  const tied=axis([0,0,0,0,0,0,0,0,0,0,100],{range:'middle'});
  assert.equal(tied.clipped,0);assert.ok(tied.notes.length);
});
