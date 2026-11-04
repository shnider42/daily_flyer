const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../static/nfl_catch_up/core.js');
const S=require('../daily_flyer_v2/data/nfl_scores.json');
const D=require('../daily_flyer_v2/data/nfl_catch_up.json');
test('dated 2026 edition includes complete weeks and all 32 teams',()=>{
  assert.equal(S.season,2026);assert.equal(S.teams.length,32);
  assert.equal(new Set(S.games.map(g=>g.id)).size,S.games.length);
  assert.equal(S.games.filter(g=>g.completed&&g.week<=8).length,121);
  assert.equal(S.games.filter(g=>g.week===9).length,15);
  for(const g of S.games){assert.ok(S.teams.some(t=>t.id===g.home.team));assert.ok(S.teams.some(t=>t.id===g.away.team));assert.equal(g.home.team===g.away.team,false);if(g.week<=8){assert.ok(g.completed);assert.ok(C.localDate(g.date)<S.as_of);}}
});
test('standings balance and account for ties without counting future games',()=>{
  const rs=C.records(S);assert.equal(rs.reduce((n,t)=>n+t.gp,0),242);
  assert.equal(rs.reduce((n,t)=>n+t.w,0),rs.reduce((n,t)=>n+t.l,0));
  assert.equal(rs.reduce((n,t)=>n+t.pf,0),rs.reduce((n,t)=>n+t.pa,0));
  for(const [id,record] of Object.entries({NE:'5–3',CHI:'6–2',SEA:'4–4',NYG:'4–2–1',WSH:'2–4–1',PHI:'2–6',MIN:'6–1',DEN:'6–2'}))assert.equal(C.record(rs.find(t=>t.id===id)),record,id);
  assert.equal(rs.find(t=>t.id==='NYG').pct,4.5/7);
});
test('the date boundary uses Eastern Time and excludes that day from before records',()=>{
  assert.equal(C.localDate('2026-11-03T01:15Z'),'2026-11-02');
  assert.equal(C.record(C.records(S,'2026-11-02').find(t=>t.id==='CHI')),'5–2');
  assert.equal(C.record(C.records(S,'2026-11-03').find(t=>t.id==='CHI')),'6–2');
});
test('familiarity never changes which stories match',()=>{
  const state=C.normalize({since:'2026-10-28'},S);
  assert.equal(C.stories(D,state).length,8);
  for(const depth of ['little','basics','well'])assert.deepEqual(C.stories(D,{...state,depth}).map(x=>x.id),C.stories(D,state).map(x=>x.id));
});
test('date, team, topic and search intersect, including explicit empty coverage',()=>{
  const s=C.normalize({since:'2026-10-28',team:'NE'},S);
  assert.deepEqual(C.stories(D,s).map(x=>x.id),['pats-comeback']);
  assert.equal(C.stories(D,{...s,topic:'injuries'}).length,0);
  assert.equal(C.stories(D,{...s,since:'2026-02-09',topic:'roster'}).length,1);
  assert.equal(C.stories(D,{...s,query:'no such player'}).length,0);
  assert.equal(C.stories(D,{...s,since:S.as_of}).length,0);
  assert.equal(C.games(S,s).length,1);
});
test('invalid links and stored preferences normalize safely',()=>{
  const s=C.normalize({depth:'<script>',team:'fake',since:'2026-02-31',topic:'no',week:99,spoilers:'true',query:'x'.repeat(200)},S);
  assert.equal(s.depth,'basics');assert.equal(s.team,'ALL');assert.equal(s.since,'2026-10-28');assert.equal(s.week,8);assert.equal(s.spoilers,false);assert.equal(s.query.length,80);
});
test('every editorial story has dated sources and genuinely safe result labels',()=>{
  const ids=new Set();for(const s of D.stories){assert.ok(!ids.has(s.id));ids.add(s.id);assert.ok(s.date<=D.reviewed_at);assert.ok(s.published<=D.reviewed_at);assert.equal(new URL(s.source).protocol,'https:');assert.ok(s.context&&s.before&&s.after&&s.meaning);if(s.spoiler)assert.ok(!/win|loss|beat|lead|\d[–-]\d/i.test(s.safe_title));}
});
test('full regular season has 272 games, 18 weeks and exactly one bye per team',()=>{
  assert.equal(S.games.length,272);assert.equal(S.schedule_weeks,18);
  assert.equal(S.games.filter(g=>!g.completed).length,151);
  for(const t of S.teams){
    const games=S.games.filter(g=>[g.home.team,g.away.team].includes(t.id));
    assert.equal(games.length,17,t.id);assert.equal(new Set(games.map(g=>g.week)).size,17,t.id);
  }
  assert.deepEqual([...new Set(S.games.map(g=>g.week))],Array.from({length:18},(_,i)=>i+1));
});
test('all completed game details agree with scores and team identities',()=>{
  for(const g of S.games.filter(g=>g.completed)){
    assert.equal(g.detail_status,'available',g.id);
    assert.deepEqual(Object.keys(g.stats).sort(),[g.home.team,g.away.team].sort(),g.id);
    for(const side of [g.home,g.away]){
      assert.ok(side.quarters.length>=4,g.id);
      assert.equal(side.quarters.reduce((a,b)=>a+b,0),side.score,g.id);
      assert.equal(Object.keys(g.stats[side.team]).length,8,g.id);
      assert.ok(side.quarters.every(n=>Number.isInteger(n)&&n>=0),g.id);
    }
    const last=C.quarterFlow(g).at(-1);assert.equal(last.home,g.home.score);assert.equal(last.away,g.away.score);
    assert.ok(g.leaders.length>=6,g.id);
    assert.equal(new Set(g.leaders.map(l=>l.team+':'+l.kind)).size,g.leaders.length,g.id);
    for(const l of g.leaders){assert.ok([g.home.team,g.away.team].includes(l.team));assert.ok(l.name&&l.stat&&l.kind);}
  }
});
test('game explorer intersects season, team, status, search and close finishes',()=>{
  const all=C.normalize({week:'all'},S);
  assert.equal(C.schedule(S,all).length,272);
  assert.equal(C.schedule(S,{...all,gameStatus:'final'}).length,121);
  assert.equal(C.schedule(S,{...all,gameStatus:'scheduled'}).length,151);
  assert.equal(C.schedule(S,{...all,team:'NE'}).length,17);
  assert.equal(C.schedule(S,{...all,gameQuery:'patriots'}).length,17);
  assert.equal(C.schedule(S,{...all,week:18}).length,16);
  assert.equal(C.schedule(S,{...all,week:18,gameStatus:'final'}).length,0);
  const close=C.schedule(S,{...all,closeGames:true});assert.ok(close.length>0);
  assert.ok(close.every(g=>g.completed&&Math.abs(g.away.score-g.home.score)<=7));
  assert.ok(C.schedule(S,{...all,gameQuery:'Gillette'}).every(g=>g.venue.includes('Gillette')));
});
test('game context describes the actual change and quarter reads avoid inventing a narrative',()=>{
  const bears=S.games.find(g=>g.week===8&&g.away.team==='CHI');
  assert.deepEqual(C.gameContext(S,bears),[{team:'CHI',before:'5–2',after:'6–2'},{team:'SEA',before:'4–3',after:'4–4'}]);
  const pats=S.games.find(g=>g.week===8&&g.away.team==='NE');assert.equal(C.gameRead(pats).kind,'Comeback');
  const tie=S.games.find(g=>g.completed&&g.home.score===g.away.score);assert.equal(C.gameRead(tie).kind,'Tie game');
  const next=S.games.find(g=>!g.completed);assert.equal(C.gameRead(next).kind,'Scheduled');assert.deepEqual(C.quarterFlow(next),[]);
});
test('night mode is the default, user theme persists, and protection disables result-dependent filtering',()=>{
  assert.equal(C.normalize({},S).theme,'dark');assert.equal(C.normalize({theme:'light'},S).theme,'light');
  const s=C.normalize({week:18,spoilers:true,closeGames:true,game:'invalid',teamFocus:'fake',theme:'bad'},S);
  assert.equal(s.week,18);assert.equal(s.closeGames,false);assert.equal(s.game,null);assert.equal(s.teamFocus,'NE');assert.equal(s.theme,'dark');
  const last=S.games.at(-1);assert.equal(C.normalize({game:last.id},S).game,last.id);
  assert.ok(S.games.filter(g=>g.week===18).every(g=>!g.time_confirmed));
});
