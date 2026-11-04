(() => {
  'use strict';
  const D=JSON.parse(document.getElementById('nfl-data').textContent), S=D.scores, C=NFLCatchUp;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'});
  const team=id=>S.teams.find(t=>t.id===id), full=id=>team(id)?.name||id, short=id=>team(id)?.short||id;
  const label={all:'All updates',games:'Games',roster:'Roster moves',injuries:'Injuries'};
  const KEY='dfe-nfl-huddle-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}
  let linked={};try{if(location.hash.startsWith('#catchup=')){linked=JSON.parse(decodeURIComponent(location.hash.slice(9)));linked.spoilers=true;}}catch{}
  let state=C.normalize({...saved,...linked},S), revealed=new Set(), expanded=false, toastTimer;
  const current=C.records(S);
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
  function notice(s){$('#toast').textContent=s;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',3800);}
  function safeLink(url){try{const u=new URL(url);return u.protocol==='https:'?esc(u.href):'#';}catch{return '#';}}
  function locked(id){return state.spoilers&&!revealed.has(id);}
  function setState(changes,clear=true){state=C.normalize({...state,...changes},S);if(clear)expanded=false;persist();render();}
  function source(s){return `<a class="source" href="${safeLink(s.source)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} · Read the source ↗</a>${s.secondary_source?`<a class="source" href="${safeLink(s.secondary_source)}" target="_blank" rel="noopener noreferrer">Supporting team report ↗</a>`:''}<span class="source-date">Event ${fmt(s.date)} · Published ${fmt(s.published)} · Reviewed ${fmt(D.reviewed_at)}, 2026</span>`;}
  function storyCard(s,i){
    const hide=s.spoiler&&locked(s.id);
    return `<article class="story" id="story-${esc(s.id)}"><div class="story-top"><div class="story-kicker">${hide?'Game report':esc(s.kicker)}</div><span class="story-index">${String(i+1).padStart(2,'0')}</span><div class="story-metric ${s.metric.length>9?'long':''}">${hide?'— : —':esc(s.metric)}</div><div class="story-metric-label">${hide?'Outcome hidden':esc(s.metric_label)}</div></div><div class="story-body"><div class="meta">${s.teams.map(t=>`<span class="team-chip">${esc(t)}</span>`).join('')}<span>${fmt(s.date)} · ${label[s.category]}</span></div><h3>${esc(hide?s.safe_title:s.title)}</h3>${hide?`<p class="locked-note">A reviewed report from this matchup is ready. Reveal it when you’re ready to see the outcome.</p><button class="reveal-button" data-reveal="${esc(s.id)}">Reveal this story</button>`:`<p>${esc(s.summary)}</p>${state.depth==='little'?`<div class="context-box"><strong>A little football context</strong><p>${esc(s.context)}</p></div>`:''}<div class="before-after"><div><span>Before</span><p>${esc(s.before)}</p></div><div><span>Now</span><p>${esc(s.after)}</p></div></div><details ${state.depth==='well'?'open':''}><summary>${state.depth==='little'?'A closer look':'The details & why it matters'}</summary><p>${esc(s.detail)}</p><div class="context-box"><strong>Our context</strong><p>${esc(s.meaning)}</p></div></details>${source(s)}`}</div></article>`;
  }
  function overview(gs,stories){
    const topic=state.team==='ALL'?'Your league catch up':`${full(state.team)} catch up`;
    const since=C.records(S,state.since), row=current.find(t=>t.id===state.team), old=since.find(t=>t.id===state.team);
    return `<div class="overview"><div class="overview-label">${esc(topic)}<small>${fmt(state.since)} – ${fmt(S.as_of)}, 2026</small></div><div class="stat"><strong>${gs.length}</strong><span>completed ${gs.length===1?'game':'games'} in this window</span></div><div class="stat"><strong>${stories.length}</strong><span>reviewed ${stories.length===1?'story':'stories'} matching your filters</span></div><div class="stat"><strong>${row?(state.spoilers?'Hidden':C.record(row)):'8 / 18'}</strong><span>${row?(state.spoilers?'Records hidden':`record now · was ${C.record(old)}`):'regular-season weeks completed'}</span></div></div>`;
  }
  function brief(){
    const ss=C.stories(D,state), gs=C.games(S,state), limit=state.depth==='little'?3:6, shown=expanded?ss:ss.slice(0,limit);
    let html=`<div class="section-head"><div><span class="eyebrow">02 / WHILE YOU WERE AWAY</span><h2>${state.team==='ALL'?'Here’s what changed.':esc(short(state.team))+', in focus.'}</h2></div><p>${state.depth==='little'?'The important changes, with the football context filled in.':state.depth==='well'?'The same developments, with the reporting and numbers opened up.':'The important changes. Enough context to connect the dots.'}</p></div>${overview(gs,ss)}<div class="filters"><div class="filter-chips" role="group" aria-label="Update topic">${Object.entries(label).map(([id,name])=>`<button data-topic="${id}" class="${state.topic===id?'active':''}" aria-pressed="${state.topic===id}">${name}</button>`).join('')}</div><input type="search" id="search" placeholder="Search stories…" aria-label="Search reviewed stories" value="${esc(state.query)}"><select id="order" aria-label="Sort stories"><option value="impact" ${state.order==='impact'?'selected':''}>Big picture first</option><option value="latest" ${state.order==='latest'?'selected':''}>Newest first</option></select></div><p class="filter-help">Selected stories are reviewed, not exhaustive. Team, date, topic and search filters combine. Game history covers the full season to Week 8.</p>`;
    if(ss.length)html+=`<div class="story-grid">${shown.map(storyCard).join('')}</div>${shown.length<ss.length?`<p><button class="secondary-button" id="more">Show ${ss.length-shown.length} more ${ss.length-shown.length===1?'story':'stories'}</button></p>`:''}`;
    else html+=`<div class="empty"><h3>No reviewed stories match this view.</h3><p>${gs.length?`${gs.length} completed games still match your team and date in the Games view. Editorial coverage is selective; an empty view does not mean nothing happened.`:'This edition ends on November 4, 2026. Try an earlier starting point or a broader team filter.'}</p><button class="secondary-button" data-reset-filters>Broaden my filters</button> <button class="primary-button" data-tab="games">See game history</button></div>`;
    if(gs.length){html+=`<h3 class="feed-title">The record changed, too.</h3><p class="filter-help">All games in your date window, independent of the story topic and search filters.</p>${state.spoilers?`<div class="empty"><p>Team records and form are hidden while outcome protection is on.</p><button class="secondary-button" data-show-outcomes>Show scores & outcomes</button></div>`:trendCards(gs)}`;}
    html+=`<p class="filter-help">Looking for an earlier week? <button class="plain-button" data-tab="games">Open the season’s game history →</button></p>`;
    return html;
  }
  function trendCards(gs){
    const before=C.records(S,state.since), involved=new Set(gs.flatMap(g=>[g.home.team,g.away.team]));
    let rows=current.filter(t=>involved.has(t.id)&&(state.team==='ALL'||t.id===state.team));
    rows.sort((a,b)=>(b.w-before.find(t=>t.id===b.id).w)-(a.w-before.find(t=>t.id===a.id).w)||b.pct-a.pct||a.name.localeCompare(b.name));
    return `<div class="team-trends">${rows.slice(0,state.team==='ALL'?4:1).map(r=>{const old=before.find(t=>t.id===r.id);return `<article class="trend"><h3>${esc(r.name)}</h3><div class="record-change">${C.record(old)}<span>→</span>${C.record(r)}</div><p>${r.w-old.w} ${r.w-old.w===1?'win':'wins'}, ${r.l-old.l} ${r.l-old.l===1?'loss':'losses'}${r.t-old.t?', '+(r.t-old.t)+' ties':''} in this window</p><div class="form" aria-label="Results in chronological order">${r.form.filter(f=>f.date>=state.since).map(f=>`<span class="${f.outcome==='L'?'loss':f.outcome==='T'?'tie':''}" title="Week ${f.week}: ${f.outcome==='W'?'win':f.outcome==='L'?'loss':'tie'}">${f.outcome}</span>`).join('')}</div></article>`;}).join('')}</div><p class="filter-help">${state.team==='ALL'?'Shown: up to four teams with the most wins in this window; ties use season winning percentage, then name. ':''}W = win · L = loss · T = tie. Records include only regular-season games.</p>`;
  }
  function league(){
    let html=`<div class="section-head"><div><span class="eyebrow">THE SEASON AT A GLANCE</span><h2>The league picture.</h2></div><p>Full-season records through Week ${S.through_week}. Your date filter does not remove earlier results here.</p></div>`;
    if(state.spoilers)return html+`<div class="empty"><h3>Standings reveal results.</h3><p>Records, streaks and scoring totals are hidden while outcome protection is on.</p><button class="primary-button" data-show-outcomes>Show scores & standings</button></div>`;
    if(state.depth==='little')html+=`<div class="context-box"><strong>How to read this</strong><p>There are two conferences (AFC and NFC), each with four divisions of four teams. W–L–T means wins, losses and ties. A bye is a week off, so teams can have played different numbers of games.</p></div>`;
    html+=`<p class="table-legend">Sorted by winning percentage. Equal percentages are alphabetical; this is not official playoff seeding. <a href="https://www.nfl.com/standings/" target="_blank" rel="noopener noreferrer">Official standings ↗</a></p>`;
    const divisions=[...new Set(S.teams.map(t=>t.division))].sort();
    html+=`<div class="division-grid">${divisions.map(div=>`<article class="division"><h3>${esc(div)}</h3><table><caption class="sr-only">${esc(div)} through Week 8</caption><thead><tr><th scope="col">Team</th><th scope="col">W–L–T</th><th scope="col">PCT</th>${state.depth==='well'?'<th scope="col">+/−</th>':''}</tr></thead><tbody>${C.sortRecords(current.filter(t=>t.division===div)).map(t=>`<tr class="${state.team===t.id?'selected-team':''}"><td class="table-name"><span class="team-dot"></span>${esc(t.short)}${state.depth==='well'?`<small>${t.pf} scored · ${t.pa} allowed</small>`:''}</td><td>${C.record(t)}</td><td>${t.pct.toFixed(3)}</td>${state.depth==='well'?`<td>${t.pf-t.pa>0?'+':''}${t.pf-t.pa}</td>`:''}</tr>`).join('')}</tbody></table></article>`).join('')}</div><p class="table-legend">PCT = (wins + half of ties) ÷ games played. +/− = points scored minus points allowed. Data: <a href="https://www.espn.com/nfl/scoreboard/_/week/8/year/2026/seasontype/2" target="_blank" rel="noopener noreferrer">ESPN scoreboards</a>, collected ${fmt(S.as_of)}, 2026.</p>`;
    return html;
  }
  function gameCard(g){
    const hide=g.completed&&locked(g.id), when=new Date(g.date).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}), rows=[g.away,g.home];
    return `<article class="game"><div class="game-meta">${g.completed?`${fmt(C.localDate(g.date))} · ${hide?'Result hidden':esc(g.status)}`:esc(when)+' ET'}</div>${rows.map((r,i)=>`<div class="match-row ${!hide&&g.completed&&r.score>rows[1-i].score?'winner':''}"><span>${esc(full(r.team))}${i?' <small>(H)</small>':''}</span><b>${g.completed?(hide?'—':r.score):''}</b></div>`).join('')}<p class="venue">${esc(g.venue)}</p>${hide?`<button class="secondary-button" data-reveal="${g.id}">Reveal score</button>`:`<a href="${safeLink(g.source)}" target="_blank" rel="noopener noreferrer">ESPN game ${g.completed?'report':'page'} ↗</a>`}</article>`;
  }
  function gamesView(){
    const gs=S.games.filter(g=>g.week===state.week&&(state.team==='ALL'||[g.home.team,g.away.team].includes(state.team)));
    return `<div class="section-head games-head"><div><span class="eyebrow">THE GAME-BY-GAME VIEW</span><h2>${state.week>S.through_week?'Next on the schedule.':'The scores behind the stories.'}</h2></div><div class="week-controls"><button id="prev-week" aria-label="Previous week" ${state.week===1?'disabled':''}>←</button><select id="week" aria-label="Choose week">${Array.from({length:S.through_week+1},(_,i)=>`<option value="${i+1}" ${state.week===i+1?'selected':''}>Week ${i+1}${i+1>S.through_week?' · next':''}</option>`).join('')}</select><button id="next-week" aria-label="Next week" ${state.week===S.through_week+1?'disabled':''}>→</button></div></div><p class="filter-help">${state.team==='ALL'?'All teams':esc(full(state.team))} · The week selector replaces your starting-date filter in this view. (H) = home team. Times are Eastern. Schedule checked ${fmt(S.as_of)}, 2026; later changes may not be reflected.</p>${gs.length?`<div class="games-grid">${gs.map(gameCard).join('')}</div>`:`<div class="empty"><h3>No game listed for this team in Week ${state.week}.</h3><p>This can be a bye week. Select another week or choose the whole league.</p></div>`}`;
  }
  const lessons=[
    ['The season is a race.','Each team plays 17 regular-season games across 18 weeks. The week without a game is its bye. The standings show the record so far, not a final verdict.','A 5–2 team has played seven games. A 5–3 team has played eight.'],
    ['Four chances. Ten yards.','The offense normally gets four downs to gain ten yards. Reaching the target earns a new first down. On fourth down, teams often punt, try a field goal, or attempt to keep the drive going.','“Third-and-6” means third down, with six yards to the next first down.'],
    ['How the points add up.','A touchdown is six points. The team then tries a one-point kick or a two-point play. A field goal is three points; a safety is two.','A seven-point lead is usually one touchdown and an extra point.'],
    ['Who makes the playoffs?','Seven teams in each conference qualify: the four division winners and three wild cards. A wild card is a qualifying team that did not win its division. Only the conference’s top seed gets a first-round bye.','Winning your division and earning the best conference seed are different goals.'],
    ['A record needs context.','Winning percentage handles unequal games played. Ties count as half a win and half a loss. Official tiebreakers use additional criteria when percentages match.','Two teams can have the same percentage without sharing the same official playoff position.'],
    ['Know what a report confirms.','A trade changes a roster. A depth-chart move changes the order of players. An injury report describes availability at a particular time; “questionable” does not mean a player is definitely out.','A Sunday game recap cannot establish whether an injured player will play next Sunday.']
  ];
  function learn(){return `<div class="section-head"><div><span class="eyebrow">NO QUESTION TOO BASIC</span><h2>A few things that unlock the game.</h2></div><p>A quick reference, available at every awareness level.</p></div><div class="learn-grid">${lessons.map(([title,body,example],i)=>`<article class="lesson"><span class="lesson-number">0${i+1}</span><h3>${title}</h3><p>${body}</p><p class="example">${example}</p></article>`).join('')}</div><p class="table-legend">Reference: <a href="https://operations.nfl.com/rules-officiating/nfl-football-basics/football-terms" target="_blank" rel="noopener noreferrer">NFL Football Operations · NFL basics ↗</a></p>`;}
  function render(){
    $$('.depths button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.depth===state.depth)));
    $('#level-note').textContent={little:'Plain language. Football terms explained.',basics:'The story, with a little context.',well:'Extra reporting and numbers, already expanded.'}[state.depth];
    const preset=[...$('#period').options].some(o=>o.value===state.since);$('#period').value=preset?state.since:'custom';$('#custom-wrap').hidden=preset;$('#since').value=state.since;$('#team').value=state.team;$('#spoilers').checked=state.spoilers;
    $$('.tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false');});
    $('#coverage-line').textContent=`${fmt(state.since)} – ${fmt(S.as_of)}, 2026 · Results through Week ${S.through_week} · Stories reviewed ${fmt(D.reviewed_at)}`;
    $('#view').innerHTML=({brief,league,games:gamesView,learn}[state.tab])();
  }
  S.teams.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;$('#team').append(o);});
  $('#coverage-note').textContent=D.coverage_note;
  const age=Math.floor((Date.now()-Date.parse(S.as_of+'T23:59:59-05:00'))/86400000);
  if(age>=2){$('#freshness').hidden=false;$('#freshness').textContent=`You’re reading the November 4 edition. It is ${age} days past this edition’s date; newer games and roster developments may be missing. Check the official sources below for the latest.`;}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.depth){setState({depth:b.dataset.depth});notice({little:'A little: football context added.',basics:'The basics: key changes and context.',well:'Very well: all story details expanded.'}[state.depth]);}
    else if(b.dataset.tab){setState({tab:b.dataset.tab});$('#view').focus({preventScroll:true});}
    else if(b.dataset.topic){setState({topic:b.dataset.topic});}
    else if(b.dataset.reveal){const id=b.dataset.reveal;revealed.add(id);render();const target=document.getElementById('story-'+id);if(target){target.tabIndex=-1;target.focus({preventScroll:true});}notice('This outcome is now visible.');}
    else if(b.hasAttribute('data-show-outcomes')){revealed.clear();setState({spoilers:false});}
    else if(b.hasAttribute('data-reset-filters')){setState({team:'ALL',topic:'all',query:'',since:'2026-10-28'});}
    else if(b.id==='more'){expanded=true;render();}
    else if(b.id==='prev-week'||b.id==='next-week'){setState({week:state.week+(b.id==='prev-week'?-1:1)});}
    else if(b.id==='reset'){revealed.clear();history.replaceState(null,'',location.pathname+location.search);setState({depth:'basics',since:'2026-10-28',team:'ALL',topic:'all',query:'',order:'impact',spoilers:false,tab:'brief',week:S.through_week});notice('Preferences reset.');}
  });
  $('#period').addEventListener('change',e=>{if(e.target.value==='custom'){$('#custom-wrap').hidden=false;$('#since').focus();}else setState({since:e.target.value});});
  $('#since').addEventListener('change',e=>{if(e.target.validity.valid&&e.target.value)setState({since:e.target.value});});
  $('#team').addEventListener('change',e=>setState({team:e.target.value}));
  $('#spoilers').addEventListener('change',e=>{revealed.clear();setState({spoilers:e.target.checked});});
  $('#view').addEventListener('change',e=>{if(e.target.id==='order')setState({order:e.target.value});if(e.target.id==='week')setState({week:Number(e.target.value)});});
  $('#view').addEventListener('input',e=>{if(e.target.id!=='search')return;const p=e.target.selectionStart;setState({query:e.target.value});const input=$('#search');input.focus({preventScroll:true});try{input.setSelectionRange(p,p);}catch{}});
  $('#share').addEventListener('click',async()=>{
    const shareState={...state,spoilers:true},url=location.origin+location.pathname+'#catchup='+encodeURIComponent(JSON.stringify(shareState));
    try{await navigator.clipboard.writeText(url);notice('Briefing link copied. Outcomes start hidden.');}catch{$('#share-url').value=url;$('#share-dialog').showModal();$('#share-url').select();}
  });
  $('#close-share').addEventListener('click',()=>$('#share-dialog').close());
  window.addEventListener('hashchange',()=>{
    if(!location.hash.startsWith('#catchup='))return;
    try{const incoming=JSON.parse(decodeURIComponent(location.hash.slice(9)));revealed.clear();state=C.normalize({...incoming,spoilers:true},S);expanded=false;persist();render();}catch{}
  });
  render();
})();
