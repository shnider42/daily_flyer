const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../daily_flyer/baseball_explorer/research.js');
const meta={through:2025,hof_through:2025};
const state={metric:'ops',outcome:'durable',era:'all',team:'all',hof:'all',search:'',qual2:false,skip2020:false};
const player=(first,extra={})=>({id:'p'+first,name:'Player '+first,first,hof:null,awards:[],stars:[],seasons:[{year:first,ops:.7,qualifies:true,team:'BOS'},{year:first+1,ops:.8,qualifies:true,team:'BOS'}],...extra});

test('year two is next calendar season, not second observed season',()=>{
 const p=player(2018);p.seasons[1].year=2020;
 assert.equal(R.pair(p,'ops').b,null);
 assert.equal(R.cohort([p],state,meta).excluded.pair,1);
});
test('fixed future windows exclude recent successes and failures equally',()=>{
 const yes=player(2010,{hof:2020}),no=player(2011),old=player(1990,{hof:2010});
 const c=R.cohort([yes,no,old],{...state,outcome:'hof'},meta);
 assert.equal(c.rows.length,1);assert.equal(c.rows[0].event,1);assert.equal(c.excluded.followup,2);
});
test('missing season is no job, while missing rate is not a zero measurement',()=>{
 const p=player(1990);
 assert.equal(R.cohort([p],{...state,outcome:'job'},meta).rows[0].y,0);
 assert.equal(R.cohort([p],{...state,outcome:'future'},meta).excluded.outcome,1);
});
test('future production excludes first two years and requires three observations',()=>{
 const p=player(2000);p.seasons.push({year:2002,ops:.6},{year:2004,ops:.9},{year:2006,ops:1.2},{year:2007,ops:99});
 const r=R.cohort([p],{...state,outcome:'future'},meta).rows[0];
 assert.ok(Math.abs(r.y-.9)<1e-10);assert.equal(r.end,2006);
 p.seasons[3].ops=null;assert.equal(R.cohort([p],{...state,outcome:'future'},meta).rows.length,0);
});
test('All-Star/award windows exclude years one/two and anything after the horizon',()=>{
 const p=player(2000,{stars:[2000,2001,2002,2005,2012],awards:[2001,2012]});
 assert.equal(R.cohort([p],{...state,outcome:'stars'},meta).rows[0].y,2);
 assert.equal(R.cohort([p],{...state,outcome:'awards'},meta).rows[0].event,0);
});
test('filters use same cohort, role threshold and calendar-pair exclusions',()=>{
 const a=player(2019),b=player(2018),c=player(2000);c.seasons[1].qualifies=false;
 assert.deepEqual(R.filtered([a,b,c],{...state,skip2020:true,qual2:true}).map(p=>p.id),[b.id]);
 assert.deepEqual(R.filtered([a,b,c],{...state,search:'Boston'},{BOS:'Boston Red Sox'}).length,3);
});
test('held-out linear comparison does not fit on future observations',()=>{
 const rows=Array.from({length:120},(_,i)=>({id:String(i),first:1954+Math.floor(i/3),a:Math.sin(i),b:Math.cos(i),y:3*Math.cos(i)+.05*Math.sin(i)}));
 const result=R.validate(rows,true);assert.ok(!result.error);assert.ok(result.fullMSE<result.baseMSE);
 assert.ok(result.train.every(r=>r.first<result.boundary));assert.ok(result.test.every(r=>r.first>=result.boundary));
 const train=rows.slice(0,90),fit=R.linearFit(train,['a','b','first']),before=fit.predict(rows[100]);
 rows[100].y=1e9;assert.equal(fit.predict(rows[100]),before);
});
test('undefined correlations and too-small training sets stay unavailable',()=>{
 assert.equal(R.correlation([{a:1,b:1,delta:0,y:0},{a:1,b:1,delta:0,y:0},{a:1,b:1,delta:0,y:0}]).spearman,null);
 assert.ok(R.validate([],true).error);assert.ok(R.validate([],false).error.includes('players'));
});
