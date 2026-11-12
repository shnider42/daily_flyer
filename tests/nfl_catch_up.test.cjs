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
  const rs=C.records(S);assert.equal(rs.reduce((n,t)=>n+t.gp,0),268);
  assert.equal(rs.reduce((n,t)=>n+t.w,0),rs.reduce((n,t)=>n+t.l,0));
  assert.equal(rs.reduce((n,t)=>n+t.pf,0),rs.reduce((n,t)=>n+t.pa,0));
  const historical=C.records(S,"2026-11-04");
  for(const [id,record] of Object.entries({NE:'5–3',CHI:'6–2',SEA:'4–4',NYG:'4–2–1',WSH:'2–4–1',PHI:'2–6',MIN:'6–1',DEN:'6–2'}))assert.equal(C.record(historical.find(t=>t.id===id)),record,id);
  assert.equal(historical.find(t=>t.id==='NYG').pct,4.5/7);
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
  assert.equal(C.games(S,s).length,2);
});
test('invalid links and stored preferences normalize safely',()=>{
  const s=C.normalize({depth:'<script>',team:'fake',since:'2026-02-31',topic:'no',week:99,spoilers:'true',query:'x'.repeat(200)},S);
  assert.equal(s.depth,'basics');assert.equal(s.team,'ALL');assert.equal(s.since,'2026-11-01');assert.equal(s.week,9);assert.equal(s.spoilers,false);assert.equal(s.query.length,80);
});
test('every editorial story has dated sources and genuinely safe result labels',()=>{
  const ids=new Set();for(const s of D.stories){assert.ok(!ids.has(s.id));ids.add(s.id);assert.ok(s.date<=D.reviewed_at);assert.ok(s.published<=D.reviewed_at);assert.equal(new URL(s.source).protocol,'https:');assert.ok(s.context&&s.before&&s.after&&s.meaning);if(s.spoiler)assert.ok(!/win|loss|beat|lead|\d[–-]\d/i.test(s.safe_title));}
});
test('full regular season has 272 games, 18 weeks and exactly one bye per team',()=>{
  assert.equal(S.games.length,272);assert.equal(S.schedule_weeks,18);
  assert.equal(S.games.filter(g=>!g.completed).length,138);
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
      assert.equal(Object.keys(g.stats[side.team]).length,16,g.id);
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
  assert.equal(C.schedule(S,{...all,gameStatus:'final'}).length,134);
  assert.equal(C.schedule(S,{...all,gameStatus:'scheduled'}).length,138);
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
test('partly completed week counts finals and excludes unplayed games from team narratives',()=>{
  assert.equal(S.through_week,8);assert.equal(S.latest_week,9);
  assert.equal(S.games.filter(g=>g.week===9&&g.completed).length,13);
  assert.equal(S.games.filter(g=>g.week===9&&!g.completed).length,2);
  for(const t of S.teams){
    const b=C.teamBrief(S,t.id,'2026-11-04');
    assert.equal(b.now.gp-b.before.gp,b.window.length);
    assert.equal(b.delta.w+b.delta.l+b.delta.t,b.window.length);
    assert.ok(b.window.every(g=>g.completed&&g.week===9));
    if(!b.window.length){assert.equal(b.points,null);assert.equal(b.yards,null);}
  }
});
test('expanded game evidence is consistent and reporting gaps remain explicit',()=>{
  for(const g of S.games.filter(g=>g.completed)){
    const last=g.scoring_plays.at(-1);assert.equal(last.home,g.home.score,g.id);assert.equal(last.away,g.away.score,g.id);
    assert.equal(g.player_stats.length,2);
    for(const t of g.player_stats){assert.ok([g.away.team,g.home.team].includes(t.team));for(const c of t.categories)for(const p of c.players)assert.equal(p.stats.length,c.labels.length);}
  }
  const r=require('../daily_flyer_v2/data/nfl_reporting.json');assert.equal(Object.keys(r.teams).length,32);
  for(const t of Object.values(r.teams)){
    for(const a of t.news){assert.ok(a.date<=r.as_of);assert.equal(new URL(a.source).protocol,'https:');}
    for(const x of t.transactions)assert.ok(x.date<=r.as_of);
  }
  assert.equal(r.teams.ATL.transactions_status,'unavailable');assert.equal(r.teams.DAL.transactions_status,'unavailable');
});

test('Austrian mode starts with the Vikings while explicit team choices remain valid',()=>{
  const austrian=C.normalize({locale:'de-AT'},S);
  assert.equal(austrian.locale,'de-AT');assert.equal(austrian.team,'MIN');assert.equal(austrian.teamFocus,'MIN');
  assert.equal(C.normalize({locale:'de-AT',team:'GB',teamFocus:'SEA'},S).team,'GB');
  assert.equal(C.normalize({locale:'de-AT',team:'ALL'},S).team,'ALL');
  assert.equal(C.normalize({locale:'unsupported'},S).locale,'en-US');
  assert.equal(C.normalize(null,S).team,'ALL');
});
test('language toggle preserves English preferences and does not reset manual choices on reload',()=>{
  const english=C.normalize({team:'NE',teamFocus:'BUF',depth:'well',spoilers:true,theme:'light'},S);
  const austrian=C.switchLocale(english,'de-AT',S);
  assert.equal(austrian.team,'MIN');assert.equal(austrian.teamFocus,'MIN');
  const changed=C.normalize({...austrian,team:'GB',teamFocus:'SEA'},S);
  const reloaded=C.normalize(JSON.parse(JSON.stringify(changed)),S);
  assert.equal(reloaded.locale,'de-AT');assert.equal(reloaded.team,'GB');assert.equal(reloaded.teamFocus,'SEA');
  const restored=C.switchLocale(reloaded,'en-US',S);
  assert.equal(restored.team,'NE');assert.equal(restored.teamFocus,'BUF');
  assert.equal(restored.spoilers,true);assert.equal(restored.depth,'well');assert.equal(restored.theme,'light');
});
test('Vienna kickoff dates and daylight-saving offsets use the actual game instant',()=>{
  assert.match(C.formatKickoff('2026-11-09T01:20:00Z','de-AT'),/9\..*Nov.*02:20 Uhr · Wien/);
  assert.match(C.formatKickoff('2026-09-11T00:20:00Z','de-AT'),/11\..*Sep.*02:20 Uhr · Wien/);
  assert.match(C.formatKickoff('2026-03-15T18:00:00Z','de-AT'),/19:00 Uhr · Wien/);
  assert.match(C.formatKickoff('2026-11-09T01:20:00Z','en-US'),/Nov 8.*8:20 PM ET/);
  assert.equal(C.localDate('2026-11-09T01:20:00Z'),'2026-11-08');
});
test('Austrian content preserves editorial identities and translates all learning and stat definitions',()=>{
  const AT=require('../static/nfl_catch_up/content-de-at.js');
  assert.deepEqual(Object.keys(AT.stories).sort(),D.stories.map(s=>s.id).sort());
  for(const story of D.stories)for(const field of ['title','safe_title','summary','context','before','after','detail','meaning'])assert.ok(AT.stories[story.id][field],story.id+' '+field);
  assert.equal(AT.lessons.length,6);assert.equal(AT.statDefs.length,16);
  for(const g of S.games){const read=C.gameRead(g,'de-AT');assert.ok(read.kind&&read.text);assert.notEqual(read.text,C.gameRead(g).text);}
});

test('all four language preferences normalize safely, including old and malformed settings',()=>{
  for(const locale of ['en-US','de-AT','hi-IN','gu-IN'])assert.equal(C.normalize({locale},S).locale,locale);
  for(const locale of [undefined,null,'hi','gu','fr-FR','hi-IN<script>',['hi-IN'],{locale:'gu-IN'}]){
    const state=C.normalize({locale},S);
    assert.equal(state.locale,'en-US');assert.equal(state.team,'ALL');
  }
  assert.equal(C.normalize({},S).locale,'en-US');
  for(const locale of ['hi-IN','gu-IN'])assert.equal(C.normalize({locale},S).team,'ALL');
});

test('Hindi, Gujarati and English preserve team choices and viewing preferences across switches and reloads',()=>{
  const original=C.normalize({team:'BUF',teamFocus:'DAL',depth:'well',since:'2026-10-25',spoilers:true,theme:'light',week:7,topic:'roster',query:'Allen',conference:'AFC',gameStatus:'scheduled',gameQuery:'Buffalo'},S);
  let state=original;
  const retained=['team','teamFocus','depth','since','spoilers','theme','week','topic','query','conference','gameStatus','gameQuery'];
  for(const locale of ['hi-IN','gu-IN','hi-IN','en-US','gu-IN']){
    state=C.switchLocale(state,locale,S);
    assert.equal(state.locale,locale);
    for(const key of retained)assert.equal(state[key],original[key],locale+' '+key);
    state=C.normalize(JSON.parse(JSON.stringify(state)),S);
    for(const key of retained)assert.equal(state[key],original[key],'reload '+locale+' '+key);
  }
  state=C.normalize({...state,team:'SEA',teamFocus:'GB'},S);
  const sameLanguage=C.switchLocale(C.normalize(JSON.parse(JSON.stringify(state)),S),'gu-IN',S);
  assert.equal(sameLanguage.team,'SEA');assert.equal(sameLanguage.teamFocus,'GB');
  const hindi=C.switchLocale(sameLanguage,'hi-IN',S);
  assert.equal(hindi.team,'SEA');assert.equal(hindi.teamFocus,'GB');
});

test('Austrian entry selects Minnesota and exit restores the previous non-Austrian teams, including legacy saves',()=>{
  for(const origin of ['en-US','hi-IN','gu-IN']){
    const original=C.normalize({locale:origin,team:'BUF',teamFocus:'DAL',depth:'little',spoilers:true,theme:'light'},S);
    const austrian=C.switchLocale(original,'de-AT',S);
    assert.equal(austrian.team,'MIN');assert.equal(austrian.teamFocus,'MIN');
    const saved=C.normalize(JSON.parse(JSON.stringify({...austrian,team:'SEA',teamFocus:'GB'})),S);
    assert.equal(saved.team,'SEA');assert.equal(saved.teamFocus,'GB');
    for(const destination of ['en-US','hi-IN','gu-IN']){
      const restored=C.switchLocale(saved,destination,S);
      assert.equal(restored.locale,destination);assert.equal(restored.team,'BUF');assert.equal(restored.teamFocus,'DAL');
      assert.equal(restored.depth,'little');assert.equal(restored.spoilers,true);assert.equal(restored.theme,'light');
    }
  }
  const legacy=C.normalize({locale:'de-AT',team:'MIN',teamFocus:'MIN',englishTeam:'NE',englishTeamFocus:'NYJ'},S);
  const restored=C.switchLocale(legacy,'gu-IN',S);
  assert.equal(restored.team,'NE');assert.equal(restored.teamFocus,'NYJ');
});

test('Indian kickoff display rolls over at the game instant without changing Eastern date filters',()=>{
  const instant='2026-11-08T22:20:00Z';
  const original=C.normalize({since:'2026-11-01'},S);
  const gameIds=C.games(S,original).map(g=>g.id);
  for(const locale of ['hi-IN','gu-IN']){
    assert.match(C.formatKickoff(instant,locale),/9.*03:50 IST$/);
    assert.match(C.formatKickoff('2026-03-15T18:00:00Z',locale),/23:30 IST$/);
    assert.match(C.formatKickoff('2026-09-11T00:20:00Z',locale),/05:50 IST$/);
    assert.equal(C.localDate(instant),'2026-11-08');
    assert.deepEqual(C.games(S,C.switchLocale(original,locale,S)).map(g=>g.id),gameIds);
  }
  assert.match(C.formatKickoff(instant,'en-US'),/Nov 8.*5:20 PM ET$/);
});

function loadDisplayLocale(locale){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const context=vm.createContext({});
  const file={'de-AT':'content-de-at.js','hi-IN':'locale-hi-in.js','gu-IN':'locale-gu-in.js'}[locale];
  for(const name of [file,'i18n.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/nfl_catch_up',name),'utf8'),context,{filename:name});
  context.HuddleLocale.setLocale(locale);
  return context.HuddleLocale;
}

test('native content packs cover every editorial display field, lesson and statistic without replacing evidence',()=>{
  const fields=['title','safe_title','kicker','metric_label','summary','context','before','after','detail','meaning'];
  const statKeys=['totalYards','netPassingYards','rushingYards','firstDowns','thirdDownEff','turnovers','possessionTime','yardsPerPlay','fourthDownEff','redZoneAttempts','totalPenaltiesYards','sacksYardsLost','totalOffensivePlays','totalDrives','fumblesLost','interceptions'];
  for(const [locale,script] of [['hi-IN',/\p{Script=Devanagari}/u],['gu-IN',/\p{Script=Gujarati}/u]]){
    const content=loadDisplayLocale(locale).content();
    assert.deepEqual(Object.keys(content.stories).sort(),D.stories.map(s=>s.id).sort(),locale+' story IDs');
    assert.equal(Object.keys(content.stories).length,10);
    for(const story of D.stories){
      const translated=content.stories[story.id];
      for(const field of fields){
        assert.equal(typeof translated[field],'string',locale+' '+story.id+' '+field);
        assert.ok(translated[field].trim(),locale+' '+story.id+' '+field);
        assert.match(translated[field],script,locale+' '+story.id+' '+field);
      }
      for(const field of Object.keys(translated))assert.ok(fields.includes(field),locale+' must not override source field '+field);
    }
    assert.match(content.coverage_note,script);
    assert.equal(content.lessons.length,6);
    assert.deepEqual(Array.from(content.lessons,lesson=>lesson[0]),['01','02','03','04','05','06']);
    for(const lesson of content.lessons){assert.equal(lesson.length,5);for(const text of lesson.slice(1))assert.match(text,script);}
    assert.equal(content.statDefs.length,16);
    assert.deepEqual(Array.from(content.statDefs,stat=>stat[0]),statKeys);
    for(const [,label,explanation] of content.statDefs){assert.match(label,script);assert.match(explanation,script);}
  }
});

test('every native generated game summary and team research draft is translated while preserving identifiers',()=>{
  for(const [locale,script] of [['hi-IN',/\p{Script=Devanagari}/u],['gu-IN',/\p{Script=Gujarati}/u]]){
    const L=loadDisplayLocale(locale);
    for(const game of S.games){
      const read=C.gameRead(game,locale),english=C.gameRead(game,'en-US');
      for(const field of ['kind','text']){
        const translated=L.text(read[field]);
        assert.notEqual(translated,english[field],locale+' '+game.id+' '+field);
        assert.match(translated,script,locale+' '+game.id+' '+field);
      }
    }
    const name='Minnesota Vikings',date='2026-11-01';
    const draft=L.text(`What has changed for the ${name} since ${date}? Explain the games, quarterback, coaching, injuries and roster moves.`);
    assert.match(draft,script);assert.ok(draft.includes(name));assert.ok(draft.includes(date));
  }
});
