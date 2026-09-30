const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../daily_flyer/bowling_explorer/math.js');
const data=require('../daily_flyer/data/bowling_seasons.json');
const state={metric:'average',threshold:'10',view:'career',normalize:'raw',hand:'all',search:'',qual2:false,skip2020:false,selection:'declined',count:4,predictor:'delta',outcome:'average'};
test('Calendar-label gaps never slide the second-year clock forward',()=>{
 const p={seasons:[{year:2011,events:12,average:210},{year:2013,events:12,average:230}]};
 assert.equal(M.pair(p,'average').first,2011);assert.equal(M.pair(p,'average').delta,null);
 assert.deepEqual(M.series(p,state).map(s=>s.value),[210,null,230]);
});
test('Missing average never reanchors; threshold changes the stated question',()=>{
 const p={seasons:[{year:2018,events:10,average:null},{year:2019,events:15,average:210},{year:2020,events:16,average:215}]};
 assert.equal(M.anchor(p,10),2018);assert.equal(M.pair(p,'average').delta,null);
 assert.equal(M.pair(p,'average',15).delta,5);assert.ok(M.series(p,{...state,normalize:'delta'}).every(s=>s.value===null));
});
test('Research requires all three later years and mature follow-up',()=>{
 const p={id:'p',name:'P',hand:'R',hometown:'',seasons:[0,1,2,3,4].map((n)=>({year:2020+n,events:12,average:210+n}))};
 const c=M.cohort([p],state,2025);assert.equal(c.rows.length,1);assert.equal(c.rows[0].y,213);assert.equal(c.rows[0].x,1);
 assert.equal(M.cohort([p],state,2023).excluded.followup,1);
 const missing={...p,seasons:p.seasons.filter(s=>s.year!==2023)};assert.equal(M.cohort([missing],state,2025).excluded.missing,1);
});
test('Actual PBA snapshot and rankings retain meaningful source values',()=>{
 const ej=data.players.find(p=>p.id==='ej-tackett');const q=M.pair(ej,'average',10);
 assert.equal(q.first,2013);assert.ok(Math.abs(q.delta-.92)<1e-8);
 const belmo=data.players.find(p=>p.id==='jason-belmonte');assert.equal(M.anchor(belmo,10),2009);
 const winners=M.ranked(data.players,{...state,selection:'improved',qual2:true,count:79});
 assert.ok(winners.length>4);assert.ok(winners.every(id=>M.pair(data.players.find(p=>p.id===id),'average').delta>0));
 const all=M.eligible(data.players,state);assert.ok(all.length>25);
});
test('Filters and normalization keep missing observations and genuine zeros distinct',()=>{
 const p={id:'p',name:'P',hand:'L',hometown:'Town',seasons:[{year:2019,events:12,average:220},{year:2020,events:4,average:220},{year:2021,events:0,average:null}]};
 assert.equal(M.eligible([p],state).length,1);assert.equal(M.eligible([p],{...state,skip2020:true}).length,0);
 assert.equal(M.eligible([p],{...state,qual2:true}).length,0);assert.equal(M.eligible([p],{...state,hand:'R'}).length,0);
 assert.deepEqual(M.series(p,{...state,normalize:'delta'}).map(s=>s.value),[0,0,null]);
});
