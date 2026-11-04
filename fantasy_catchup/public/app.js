import {defaults,inferSettings,filterNews,playerLens,newsLens,statusChanges,byeTeams} from './logic.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}}
let settings={...defaults,...read('rr.settings',{})}, watch=new Set(read('rr.watch',[])), lastSeen=read('rr.seen',null), previous=read('rr.snapshot',{}), league=read('rr.league',null), rosterId=read('rr.roster',null), tab='briefing', data=null, showCount=10;
let syncing=false, lastLeagueCheck=0;
const byId=()=>new Map((data?.players||[]).map(p=>[p.id,p]));
function persist(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{toast('Browser storage is unavailable. Changes will last for this visit.');}}
function saveSettings(){persist('rr.settings',settings);}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3500);}
function relative(date){if(!date)return 'not checked';const mins=Math.max(0,Math.round((Date.now()-Date.parse(date))/60000));return mins<1?'just now':mins<60?`${mins}m ago`:mins<1440?`${Math.floor(mins/60)}h ago`:`${Math.floor(mins/1440)}d ago`;}
function datetime(d){return d?new Date(d).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available';}
function selectedRoster(){return league?.rosters?.find(r=>String(r.id)===String(rosterId));}
function tracked(){return new Set([...watch,...(selectedRoster()?.players||[])]);}
function available(){if(!league)return new Set();const owned=new Set(league.rosters.flatMap(r=>r.players));return new Set((data?.players||[]).filter(p=>!owned.has(p.id)).map(p=>p.id));}
function rosterFresh(){return league && Date.now()-Date.parse(league.checkedAt)<15*60000;}
function formatLabel(){return `${settings.size} teams · ${{standard:'Standard',half:'Half PPR',ppr:'PPR',custom:'Custom scoring'}[settings.scoring]||'Custom'}`;}
function setTab(next){tab=next;showCount=10;render();$('#main').scrollIntoView({behavior:'smooth',block:'start'});}
function addPlayer(id){watch.add(id);persist('rr.watch',[...watch]);render();search();toast(`${byId().get(id)?.name || 'Player'} added to your watchlist`);}
function showModal(title,body){$('#modal-eyebrow').textContent=title;$('#modal-body').innerHTML=body;$('#modal').showModal();}
function sources(){
 const labels={news:'ESPN · NFL reporting',players:'Sleeper · Player directory',trends:'Sleeper · Adds over 24 hours',schedule:'ESPN · This week’s schedule',state:'Sleeper · NFL season/week'};
 showModal('SOURCES & FRESHNESS',`<h2>A timestamp you can trust.</h2><p>Source checks run automatically. News and schedules refresh about every 15 minutes while the server is awake; activity every 30 minutes; the player directory daily. Opening the site also checks for overdue updates.</p>${Object.entries(labels).map(([k,label])=>{const s=data?.sources[k];return `<div class="source-row"><strong>${label}</strong><small>Last successful check: ${esc(datetime(s?.checkedAt))}</small><small>${s?.error?'Latest check failed. Retaining the previous result.':s?.stale?'Overdue for a source check.':'The retrieval time is not necessarily the time the source changed.'}</small><a href="${k==='news'||k==='schedule'?'https://www.espn.com/nfl/':'https://docs.sleeper.com/'}" target="_blank" rel="noopener">Source ↗</a></div>`;}).join('')}<p>On this free prototype, the server can sleep when nobody visits. It checks sources again when it wakes. This is not a live injury alert service.</p><p>The news feed is a bounded set of recent reports, not a complete historical archive. Directory status may lag official reports. Refreshing data does not count as editorial review.</p><p>News headlines link to ESPN. Interpretation is generated from fixed rules and your settings; there is no AI model or paid query running here. Sleeper data is used for this noncommercial prototype.</p>`);
}
function about(){showModal('THE IDEA',`<h2>Get your bearings.<br>Then make your call.</h2><p>Roster Radar brings sourced football developments into the context of your fantasy league. Start with the whole league, follow a few players, or import a Sleeper roster.</p><ol><li>Set your scoring and league format in the League room.</li><li>Choose Simple, Moderate, or Expert for the amount of explanation.</li><li>Read the reports and compare the players available to you.</li><li>Mark yourself caught up. Next time, see newer reports and changes in your tracked players’ directory status.</li></ol><p>Watchlists, imported league information, and your catch-up checkpoint stay in this browser. League IDs are sent to this site and Sleeper to retrieve public league data. Importing a team does not prove ownership or grant permission to change it.</p><p>We do not submit transactions, set lineups, generate projections, or invent player usage data. FAAB amounts and keeper costs are not evaluated in this first version.</p>`);}
function openPlayer(id){
 const p=byId().get(id);if(!p)return;
 const articles=data.news.filter(n=>n.players.includes(id)).slice(0,5), fixture=data.schedule?.games.find(g=>g.home.team===p.team||g.away.team===p.team);
 showModal(`${p.position} / ${p.team||'FREE AGENT'}`,`<h2>${esc(p.name)}</h2><p>${esc(playerLens(p,settings))}</p>${p.status?`<div class="notice warning">Directory status: ${esc(p.status)}${p.body?` · ${esc(p.body)}`:''}. Checked ${esc(datetime(data.sources.players?.checkedAt))}. Verify the latest official report before a lineup decision.</div>`:''}<p>${fixture?`${esc(fixture.away.team)} at ${esc(fixture.home.team)} · ${esc(datetime(fixture.date))}`:p.team?'No game found in the current schedule.':'No NFL team listed in the directory.'}</p><button class="primary-button" data-add="${esc(id)}" ${watch.has(id)?'disabled':''}>${watch.has(id)?'On your watchlist':'Follow this player'}</button><h3>Recent reports</h3>${articles.length?articles.map(n=>`<div class="source-row"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)} ↗</a><small>${esc(datetime(n.updated))} · ESPN</small></div>`).join(''):'<p>No matched reports in the current feed. That does not confirm that nothing has changed.</p>'}`);
}
function newsCard(n){const people=n.players.map(id=>byId().get(id)).filter(Boolean);return `<article class="news-card"><div class="card-meta"><span class="category">${esc(n.kind)}</span><span>ESPN</span><time datetime="${esc(n.updated)}" title="${esc(datetime(n.updated))}">${esc(relative(n.updated))}</time></div><h3><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3><div class="context"><strong>YOUR LEAGUE LENS</strong>${esc(newsLens(n,people,settings))}</div><div class="card-foot">${people.slice(0,3).map(p=>`<button class="player-tag" data-player="${esc(p.id)}">${esc(p.name)} ↗</button>`).join('')}<a class="source-link" href="${esc(n.url)}" target="_blank" rel="noopener">Read the report ↗</a></div></article>`;}
function empty(title,text,action=''){return `<div class="empty"><h3>${title}</h3><p>${text}</p>${action}</div>`;}
function overview(){
 const mine=(data.players||[]).filter(p=>tracked().has(p.id)), byes=byeTeams(data.schedule,data.players), flagged=mine.filter(p=>p.status), resting=mine.filter(p=>byes.has(p.team));
 const changed=statusChanges(mine,previous);
 const news=filterNews(data.news,settings,tracked(),available(),lastSeen);
 const oldest=data.news.reduce((a,n)=>Math.min(a,Date.parse(n.published)),Infinity);
 const allAvailable=rosterFresh()?available():new Set();
 const trendCount=data.trends.filter(p=>!league||allAvailable.has(p.id)).length;
 return `<div class="attention"><button data-go="players"><strong>${mine.length?flagged.length:'—'}</strong><span>Tracked status flags</span></button><button data-go="players"><strong>${mine.length?resting.length:'—'}</strong><span>Players on bye</span></button><button data-go="waivers"><strong>${league&&!rosterFresh()?'—':trendCount}</strong><span>${league?'Trending & unrostered':'Trending additions'}</span></button></div>${!mine.length?`<div class="notice">Start broad, or <button class="text-button" data-find-player>follow a few players</button> to make this personal.</div>`:''}${changed.length?`<div class="notice"><strong>${changed.length} tracked directory change${changed.length===1?'':'s'} since your checkpoint.</strong> ${changed.slice(0,3).map(c=>`${esc(c.player.name)}: ${esc(c.before.status || 'no status flag')} → ${esc(c.after.status || 'no status flag')}${c.before.team!==c.after.team?`, ${esc(c.before.team)} → ${esc(c.after.team)}`:''}`).join('; ')}. Check the linked reports before acting.</div>`:''}<div class="briefing-heading"><h2>The catch-up.</h2><span class="count">${news.length} reports</span></div><p class="coverage">${settings.guidance==='simple'?'The developments, with a little help connecting the dots.':settings.guidance==='moderate'?'The developments, plus the roster and format tradeoffs.':'Source evidence, matching assumptions, and limits of interpretation.'}</p><div class="filter-row">${[['all','Around the NFL'],['mine','My players'],['available','Available players']].map(([v,t])=>`<button data-scope="${v}" class="${settings.scope===v?'active':''}" ${v==='available'&&!rosterFresh()?'disabled':''}>${t}</button>`).join('')}</div>${settings.window==='since'&&!lastSeen?'<p class="coverage">No catch-up checkpoint yet. Showing the last 3 days.</p>':''}${Number.isFinite(oldest)?`<p class="coverage">Current feed reaches back to ${esc(datetime(new Date(oldest).toISOString()))}. Earlier reports may be missing.</p>`:''}${news.length?news.slice(0,showCount).map(newsCard).join(''):empty(settings.scope==='mine'&&!mine.length?'Your players go here.':'Nothing matched this view.',settings.scope==='mine'&&!mine.length?'Follow players using the search, or connect your league.':'Try a wider catch-up window or the full NFL view. A quiet feed is not a confirmation of player availability.','<button data-reset-filter>Show the broader picture ↗</button>')}${news.length>showCount?'<button class="load-more" id="load-more">More reports ↓</button>':''}`;
}
function playersView(){
 const list=data.players.filter(p=>tracked().has(p.id)), byes=byeTeams(data.schedule,data.players);
 return `<div class="section-label">YOUR WATCHLIST & ROSTER <span>${list.length} PLAYERS</span></div><div class="briefing-heading"><h2>Keep your people in view.</h2></div><p class="coverage">${selectedRoster()?`${esc(selectedRoster().name)} plus your personal watchlist.`:'A watchlist works with any fantasy platform. Add names using the player search.'} Directory checked ${esc(relative(data.sources.players?.checkedAt))}.</p>${league&&!rosterFresh()?'<div class="notice warning">Your imported roster is overdue for a refresh. Availability filters are disabled until Sleeper responds.</div>':''}${list.length?`<div class="player-grid">${list.map(p=>`<article class="player-card"><span class="position">${esc(p.position)} / ${esc(p.team||'FA')}</span><h3>${esc(p.name)}</h3><span class="status-tag">${esc(p.status || 'No directory flag')}${byes.has(p.team)?' · BYE':''}</span><p>${esc(playerLens(p,settings))}</p><button data-player="${esc(p.id)}">Open player brief ↗</button></article>`).join('')}</div>`:empty('Build your own radar.','Add a player and their reports, status flags, and schedule will appear here.','<button data-find-player>Find your first player ↗</button>')}`;
}
function waiverView(){
 const availableIds=available(), players=byId();
 let trends=data.trends.map(t=>({...t,player:players.get(t.id)})).filter(t=>t.player);
 if(league && rosterFresh())trends=trends.filter(t=>availableIds.has(t.id));
 if(settings.position!=='ALL')trends=trends.filter(t=>t.player.position===settings.position);
 return `<div class="section-label">THE ACTIVITY BOARD <span>LAST 24 HOURS</span></div><div class="briefing-heading"><h2>Worth a closer look.</h2></div><p class="coverage">${league&&rosterFresh()?'Filtered to players not rostered in your imported league.':'League-wide Sleeper additions. Availability in your league is unknown.'} Counts reflect adds across Sleeper, not projected points.</p><div class="filter-row">${['ALL','QB','RB','WR','TE','K','DEF'].map(p=>`<button data-position="${p}" class="${settings.position===p?'active':''}">${p==='ALL'?'All positions':p}</button>`).join('')}</div>${league&&!rosterFresh()?'<div class="notice warning">Sleeper roster sync is overdue. Showing all activity without availability claims.</div>':''}${!league?'<div class="notice">Connect a Sleeper league in the <button class="text-button" data-go="league">League room</button> to filter out rostered players.</div>':''}${settings.lineup==='best'?'<div class="notice">Best ball roster moves depend on your league rules. Activity is informational if your roster is locked.</div>':''}${trends.length?trends.map((t,i)=>`<article class="trend-row"><span class="trend-rank">${String(i+1).padStart(2,'0')}</span><div><h3>${esc(t.player.name)}</h3><p>${esc(t.player.position)} · ${esc(t.player.team||'FA')}${t.player.status?' · '+esc(t.player.status):''}</p></div><span class="trend-count">+${new Intl.NumberFormat().format(t.count)}<small>ADDS / 24H</small></span><div class="context">${esc(playerLens(t.player,settings))} <button class="text-button" data-player="${esc(t.id)}">Player brief ↗</button></div></article>`).join(''):empty('No matches in this group.','Try another position. This board only contains the most-added players supplied by Sleeper; it is not the complete free-agent pool.')}<p class="small-print">Source: <a href="https://sleeper.com" target="_blank" rel="noopener">Sleeper</a> · Checked ${esc(datetime(data.sources.trends?.checkedAt))}. No bid amounts or pickup rankings are generated.</p>`;
}
const options={scoring:[['standard','Standard / no PPR'],['half','Half PPR'],['ppr','Full PPR'],['custom','Custom / imported']],format:[['redraft','Redraft'],['keeper','Keeper'],['dynasty','Dynasty']],qb:[['one','One quarterback'],['super','Superflex'],['two','Two quarterbacks']],size:['8','10','12','14','16'].map(x=>[x,x+' teams']),waivers:[['faab','FAAB bidding'],['priority','Waiver priority']],lineup:[['managed','Set your lineup'],['best','Best ball']]};
function leagueView(){
 const fields=[['scoring','Reception scoring'],['format','Roster format'],['qb','Quarterback slots'],['size','League size'],['waivers','Waiver system'],['lineup','Lineup format']];
 return `<div class="section-label">THE RULES CHANGE THE CONTEXT</div><div class="briefing-heading"><h2>Your league. Your lens.</h2></div><p class="coverage">Settings change the explanations throughout your briefing. They do not generate rankings or projections.</p><div class="form-grid">${fields.map(([key,label])=>`<label>${label}<select data-setting="${key}">${options[key].map(([v,t])=>`<option value="${v}" ${settings[key]===v?'selected':''}>${t}</option>`).join('')}${!options[key].some(([v])=>v===settings[key])?`<option selected value="${esc(settings[key])}">${esc(settings[key])}</option>`:''}</select></label>`).join('')}</div><p class="small-print">Keeper costs, custom scoring bonuses, IDP, and exact waiver deadlines need your league’s own rules. This prototype does not calculate them.</p><section class="league-form"><h3>${league?esc(league.name):'Bring your Sleeper league.'}</h3><p>${league?'Read-only league snapshot. Select a team to include its roster in your briefing.':'Paste a league link or ID. We’ll read its settings and rosters—no password and no changes to your team.'}</p>${league?`<div class="notice">Season ${esc(league.season)} · ${league.rosters.length} teams · Synced ${esc(relative(league.checkedAt))}${data.state?.season!==league.season?' · This is not the current NFL season.':''}</div><label for="roster-select">Team to follow</label><select id="roster-select"><option value="">Choose a team…</option>${league.rosters.map(r=>`<option value="${r.id}" ${String(rosterId)===String(r.id)?'selected':''}>${esc(r.name)} (${r.record.wins}–${r.record.losses})</option>`).join('')}</select><button class="disconnect" id="disconnect">Disconnect this league</button>`:''}<form id="league-import"><label for="league-input">${league?'Import a different league':'Sleeper league URL or ID'}</label><input id="league-input" placeholder="https://sleeper.com/leagues/…" autocomplete="off" required><button class="primary-button" type="submit" ${syncing?'disabled':''}>${syncing?'Connecting…':'Read my league'} ↗</button><p id="league-error" role="status"></p></form><p class="small-print">Use the numeric league ID from the league URL, not an invitation code. No account ownership is assumed. Your selection is stored in this browser.</p></section>`;
}
function search(){
 const q=$('#player-search').value.trim().toLowerCase();
 if(q.length<2){$('#search-results').innerHTML='';return;}
 const matches=(data?.players||[]).filter(p=>(p.name+' '+(p.team||'')).toLowerCase().includes(q)).slice(0,7);
 $('#search-results').innerHTML=matches.length?matches.map(p=>`<button class="search-result" data-add="${esc(p.id)}" ${watch.has(p.id)?'disabled':''}><div>${esc(p.name)}<span>${esc(p.position)} · ${esc(p.team||'FA')}</span></div><b>${watch.has(p.id)?'✓':'+'}</b></button>`).join(''):'<p class="small-print">No match in the player directory.</p>';
}
function render(){
 const draft=$('#league-input')?.value; const focused=document.activeElement?.id==='league-input';
 $$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
 $$('[data-guidance]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guidance===settings.guidance)));
 $('#time-window').value=settings.window;
 $('#league-chip').innerHTML=esc(formatLabel())+' <span>↗</span>';
 $('#nav-watch-count').textContent=tracked().size;
 $('#last-reviewed').textContent=lastSeen?`Last marked caught up ${datetime(lastSeen)}. Saved on this browser.`:'Your preferences stay in this browser.';
 const titles={briefing:['Your week.<br><em>Back in focus.</em>','What changed. Why it matters.<br>A little context before your next move.'],players:['Your players.<br><em>In the picture.</em>','Follow the names that matter to you.<br>Understand the changes around them.'],waivers:['A little signal.<br><em>Less noise.</em>','See who’s drawing attention.<br>Then check whether the opportunity is real.'],league:['Different rules.<br><em>Your context.</em>','One development can mean different things.<br>Make sure you’re looking through the right lens.']};
 $('#page-title').innerHTML=titles[tab][0];$('#page-subtitle').innerHTML=titles[tab][1];
 $('#today-label').textContent=new Date().toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
 if(!data)return;
 $('#week-number').textContent=data.state?.week??'—';$('#week-caption').textContent=(data.state?.season_type==='regular'?'NFL WEEK':data.state?.season_type==='post'?'POSTSEASON':'PRESEASON');$('#season-label').textContent=data.state?`${data.state.season} SEASON`:'YOUR WEEKLY PICTURE';
 const sources=Object.values(data.sources), failed=sources.some(s=>s.error||s.stale);
 $('#connection').textContent=data.refreshing?'Checking sources…':failed?'Some sources overdue':'Sources checked '+relative(data.sources.news?.checkedAt);
 const banner=$('#error-banner');
 banner.hidden=!failed;banner.textContent=failed?'Some source checks are overdue or unavailable. Showing the last successful data with its original timestamp. Open Sources & freshness for details.':'';
 $('#content').innerHTML=tab==='briefing'?overview():tab==='players'?playersView():tab==='waivers'?waiverView():leagueView();
 if(draft!==undefined && $('#league-input')){$('#league-input').value=draft;if(focused)$('#league-input').focus({preventScroll:true});}
 const map=byId();$('#watch-chips').innerHTML=[...watch].map(id=>`<span class="watch-chip">${esc(map.get(id)?.name||id)}<button data-remove="${esc(id)}" aria-label="Remove ${esc(map.get(id)?.name||id)}">×</button></span>`).join('');
 const teams=new Set(data.players.filter(p=>tracked().has(p.id)).map(p=>p.team));
 const fixtures=(data.schedule?.games||[]).filter(g=>!teams.size||teams.has(g.home.team)||teams.has(g.away.team)).slice(0,3);
 $('#week-panel').innerHTML=`<div class="section-label">${teams.size?'YOUR TEAMS THIS WEEK':'NEXT ON THE SCHEDULE'}</div>${fixtures.map(g=>`<div class="fixture"><div><strong>${esc(g.away.team)} <span class="muted">at</span> ${esc(g.home.team)}</strong><small>${g.completed?`${g.away.score} – ${g.home.score} · Final`:esc(datetime(g.date))}</small></div><a href="${esc(g.url)}" target="_blank" rel="noopener" aria-label="${esc(g.away.team)} at ${esc(g.home.team)} game details">↗</a></div>`).join('')||'<p class="small-print">No matching games in the current schedule.</p>'}`;
 search();
}
async function importLeague(value,background=false){
 let id=value.trim();if(!/^\d+$/.test(id)){try{const u=new URL(id);if(!['sleeper.com','sleeper.app'].includes(u.hostname))throw Error();id=u.pathname.split('/').find(x=>/^\d{10,24}$/.test(x))||'';}catch{id='';}}
 if(!/^\d{10,24}$/.test(id)){if(!background)$('#league-error').textContent='Use a Sleeper league URL or its numeric league ID.';return;}
 syncing=true;if(!background)render();
 try {
   const r=await fetch('/api/league/'+id,{signal:AbortSignal.timeout(25000)}),result=await r.json();if(!r.ok)throw Error(result.error);
   const same=league?.id===result.id;league=result;
   if(!background){settings={...settings,...inferSettings(league)};saveSettings();if(!same)rosterId=null;}
   persist('rr.league',league);persist('rr.roster',rosterId);lastLeagueCheck=Date.now();
   if(!background)toast('League connected. Choose the team you want to follow.');
 }catch(err){if(!background){render();$('#league-error').textContent=err.message||'Unable to connect. Please try again.';}else lastLeagueCheck=Date.now();}
 finally{syncing=false;if(background||league?.id===id)render();else{const btn=$('#league-import button');if(btn){btn.disabled=false;btn.textContent='Read my league ↗';}}}
}
async function load(){
 try {
   const r=await fetch('/api/briefing',{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Unable to retrieve the briefing');data=await r.json();
   if(!data.players.length&&!data.news.length){$('#connection').textContent='First source check in progress';setTimeout(load,4000);return;}
   render();if(data.refreshing)setTimeout(load,5000);
   if(league && !syncing && Date.now()-lastLeagueCheck>300000)importLeague(league.id,true);
 }catch{const b=$('#error-banner');b.hidden=false;b.textContent='The site could not complete its latest check. Your settings are safe; it will retry automatically.';$('#connection').textContent='Waiting for connection';}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.tab)setTab(b.dataset.tab);
 if(b.dataset.go)setTab(b.dataset.go);
 if(b.dataset.guidance){settings.guidance=b.dataset.guidance;saveSettings();render();}
 if(b.dataset.scope){settings.scope=b.dataset.scope;saveSettings();render();}
 if(b.dataset.position){settings.position=b.dataset.position;saveSettings();render();}
 if(b.dataset.add)addPlayer(b.dataset.add);
 if(b.dataset.remove){watch.delete(b.dataset.remove);persist('rr.watch',[...watch]);render();search();}
 if(b.dataset.player)openPlayer(b.dataset.player);
 if(b.hasAttribute('data-find-player')){$('#player-search').scrollIntoView({behavior:'smooth',block:'center'});$('#player-search').focus({preventScroll:true});}
 if(b.hasAttribute('data-reset-filter')){settings.scope='all';settings.window='7';saveSettings();render();}
 if(b.id==='load-more'){showCount+=10;render();}
 if(b.id==='disconnect'){league=null;rosterId=null;persist('rr.league',null);persist('rr.roster',null);settings.scope='all';saveSettings();render();}
});
document.addEventListener('change',e=>{
 if(e.target.dataset.setting){settings[e.target.dataset.setting]=e.target.value;saveSettings();render();}
 if(e.target.id==='roster-select'){rosterId=e.target.value;persist('rr.roster',rosterId);render();toast('Team selected. Your briefing now includes this roster.');}
});
document.addEventListener('submit',e=>{if(e.target.id==='league-import'){e.preventDefault();importLeague($('#league-input').value);}});
$('#time-window').addEventListener('change',e=>{settings.window=e.target.value;saveSettings();render();});
$('#player-search').addEventListener('input',search);
$('#league-chip').onclick=$('#connect-button').onclick=()=>setTab('league');
$('#source-button').onclick=$('#source-button-2').onclick=sources;
$('#about-button').onclick=about;
$('#close-modal').onclick=()=>$('#modal').close();
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
$('#caught-up').onclick=()=>{if(!data){toast('Wait for the briefing to load first.');return;}lastSeen=new Date().toISOString();previous=Object.fromEntries(data.players.filter(p=>tracked().has(p.id)).map(p=>[p.id,{status:p.status,team:p.team}]));persist('rr.seen',lastSeen);persist('rr.snapshot',previous);toast('Caught up. Your next visit starts from here.');render();};
document.documentElement.dataset.theme=read('rr.theme','dark');
$('#theme-button').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;persist('rr.theme',t);};
render();load();setInterval(()=>{if(!document.hidden)load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
