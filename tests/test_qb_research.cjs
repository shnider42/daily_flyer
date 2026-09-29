const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../daily_flyer/qb_explorer/research_math.js');
const bowls=require('../daily_flyer/data/qb_super_bowls.json');
const player=(id,first,hof=null)=>({id,name:id,first,hof,seasons:[{year:first,relative_anya:1},{year:first+1,relative_anya:2}]});
const data=players=>({players,meta:{through:2024,hof_as_of:'2026-09-28'},super_bowls:bowls});
test('fixed Hall windows exclude recent known successes equally',()=>{
 const c=M.cohort(data([player('old',1975,2001),player('late',1975,2002),player('recent',2010,2026)]));
 assert.deepEqual(c.rows.map(r=>r.y),[1,0]);assert.equal(c.excluded.followup,1);
});
test('Super Bowl season windows exclude year two and backups',()=>{
 const c=M.cohort(data([player('BradTo00',2001)]),{outcome:'sb'});
 assert.equal(c.rows[0].y,2); // 2003 and 2004; 2014 is outside the window
 assert.equal(bowls.wins.length,59);assert.equal(new Set(bowls.wins.map(w=>w.season)).size,59);
 assert.deepEqual(bowls.wins.filter(w=>w.pfr_id==='YounSt00').map(w=>w.season),[1994]);
 assert.equal(bowls.wins.filter(w=>w.pfr_id==='BradTo00').length,7);
 assert.equal(bowls.wins.at(-1).pfr_id,'HurtJa00');
});
test('missing later observations are excluded, not negative labels',()=>{
 const p=player('a',1990);assert.equal(M.cohort(data([p]),{outcome:'job'}).excluded.outcome,1);
 p.seasons.push({year:1992,gs:11,qualifies:false});assert.equal(M.cohort(data([p]),{outcome:'job'}).rows[0].y,0);
 p.seasons.push({year:1993,relative_anya:2},{year:1994,relative_anya:4});assert.equal(M.cohort(data([p]),{outcome:'efficiency'}).rows.length,0);
 p.seasons.push({year:1995,relative_anya:6});assert.equal(M.cohort(data([p]),{outcome:'efficiency'}).rows[0].y,4);
});
test('correlation, tied ranks, uncertainty and scoring handle boundaries',()=>{
 assert.equal(M.pearson([1,2,3],[6,4,2]),-1);assert.equal(M.pearson([1,1,1],[1,2,3]),null);
 assert.equal(M.spearman([1,1,3,4],[2,2,6,8]),1);assert.equal(M.auc([1,0],[.5,.5]),.5);
 assert.equal(M.auc([1,1],[.3,.7]),null);assert.equal(M.brier([1,0],[1,0]),0);
 assert.equal(M.wilson(0,0),null);assert.ok(M.wilson(0,10)[1]>.2);
 assert.equal(M.interval([1,2],[2,3]),null);
});
test('chronological cohort split and scaling never use held-out observations',()=>{
 const rows=Array.from({length:120},(_,i)=>({id:String(i),first:1970+Math.floor(i/3),a:i%7,b:i%9,event:i%4===0?1:0}));
 const v=M.validate(rows);assert.ok(!v.error);
 assert.ok(Math.max(...v.train.map(r=>r.first))<Math.min(...v.test.map(r=>r.first)));
 const changed=rows.map(r=>r.first>=v.boundary?{...r,a:999,b:-999,event:1-r.event}:r);
 const v2=M.validate(changed);assert.deepEqual(v.full.weights,v2.full.weights);assert.deepEqual(v.full.means,v2.full.means);
 assert.ok(v.full.predict({a:2,b:3,first:1980})>0);assert.ok(v.full.predict({a:2,b:3,first:1980})<1);
 assert.ok(M.validate(rows.slice(0,20)).error);
});
test('strong and weak groups reverse direction for interceptions',()=>{
 const rows=Array.from({length:9},(_,i)=>({a:i,b:8-i}));
 const p=M.patterns(rows,-1);assert.equal(p.groups.find(g=>g.key==='HL').rows.length,3);
 assert.equal(p.groups.find(g=>g.key==='LH').rows.length,3);assert.equal(p.mixed,3);
});
