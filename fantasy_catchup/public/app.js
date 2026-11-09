import {defaults,normalizeSettings,inferSettings,filterNews,playerLens,newsLens,statusChanges,byeTeams,leagueIsCurrent,orderFixtures,normalizeSearch} from './logic.js?v=20261109-desk2';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validObject=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const SOURCE_LABELS={news:'ESPN reporting',players:'Sleeper player directory',trends:'Sleeper add activity',schedule:'ESPN scores & schedule',state:'Sleeper NFL season'};
const TOPICS=[['all','All reports'],['Availability','Availability'],['Roster moves','Roster moves'],['Fantasy report','Fantasy']];
const TABS=['briefing','players','waivers','league'];
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function cleanIds(value){return Array.isArray(value)?value.filter(id=>typeof id==='string'&&/^[\w-]{1,30}$/.test(id)).slice(0,500):[];}
function validLeague(value){return validObject(value)&&/^\d{10,24}$/.test(String(value.id))&&Array.isArray(value.rosters)&&value.rosters.length>0&&value.rosters.every(r=>validObject(r)&&r.id!=null&&Array.isArray(r.players)&&['reserve','taxi'].every(key=>r[key]==null||Array.isArray(r[key])));}
const savedSeen=read('rr.seen',null), savedLeague=read('rr.league',null), savedPrevious=read('rr.snapshot',{});
let settings=normalizeSettings(read('rr.settings',{})), watch=new Set(cleanIds(read('rr.watch',[])));
let lastSeen=typeof savedSeen==='string'&&Number.isFinite(Date.parse(savedSeen))&&Date.parse(savedSeen)<=Date.now()?savedSeen:null;
let previous=validObject(savedPrevious)?Object.fromEntries(Object.entries(savedPrevious).filter(([,v])=>validObject(v))):{};
let league=validLeague(savedLeague)?savedLeague:null, rosterId=read('rr.roster',null);
let tab='briefing', data=null, playerMap=new Map(), searchIndex=[], showCount=10, topic='all';
let syncing=false, lastLeagueCheck=0, leagueError='', leagueDraft='', modalPlayerId=null, loading=false, refreshTimer;
let activeRequest=0, offline=false;

function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('Browser storage is unavailable. Your changes will last for this visit.');}}
function saveSettings(){settings=normalizeSettings(settings);persist('rr.settings',settings);}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function relative(value){const date=Date.parse(value);if(!Number.isFinite(date))return 'not checked';const mins=Math.max(0,Math.floor((Date.now()-date)/60000));return mins<1?'just now':mins<60?`${mins}m ago`:mins<1440?`${Math.floor(mins/60)}h ago`:`${Math.floor(mins/1440)}d ago`;}
function datetime(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available';}
function shortdate(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString([],{month:'short',day:'numeric'}):'—';}
function kickoff(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):'Time TBA';}
function selectedRoster(){return league?.rosters?.find(r=>String(r.id)===String(rosterId));}
function rosterPlayers(roster){return [...(roster?.players||[]),...(roster?.reserve||[]),...(roster?.taxi||[])].map(String);}
function tracked(){return new Set([...watch,...rosterPlayers(selectedRoster())]);}
function trackedPlayers(){const ids=tracked();return (data?.players||[]).filter(p=>ids.has(p.id));}
function rosterFresh(){return validLeague(league)&&leagueIsCurrent(league,data?.state?.season);}
function available(){if(!rosterFresh())return new Set();const owned=new Set(league.rosters.flatMap(rosterPlayers));return new Set((data?.players||[]).filter(p=>!owned.has(p.id)).map(p=>p.id));}
function currentByes(){return data?byeTeams(data.schedule,data.players,data.state,data.sources.schedule):new Set();}
function byesConfirmed(){return Boolean(data?.schedule?.complete&&Array.isArray(data.schedule.byeTeams)&&sourceState('schedule')==='current');}
function fixtureFor(team){return orderFixtures(data?.schedule?.games||[]).find(g=>g.home.team===team||g.away.team===team);}
function formatLabel(){return `${settings.size} teams · ${{standard:'Standard',half:'Half PPR',ppr:'PPR',custom:'Custom'}[settings.scoring]}`;}
function leagueIssue(){if(!league)return 'Import a Sleeper league to check which players are unrostered.';if(String(league.season)!==String(data?.state?.season))return `This league is from ${league.season}. Import a league for the current season to check availability.`;return 'Your roster snapshot is overdue. Refresh the league before checking player availability.';}
function sourceState(key){const s=data?.sources?.[key];return !s?.checkedAt?'missing':s.error||s.stale?'overdue':'current';}
function safeUrl(url){try{const u=new URL(url);return u.protocol==='https:'?u.href:'#';}catch{return '#';}}
function scoreLabel(game){if(game.state==='in')return game.status||'In progress';if(game.completed||game.state==='post')return 'Final';return kickoff(game.date);}
function fixtureText(player){const g=fixtureFor(player.team);if(g){const opponent=g.home.team===player.team?g.away.team:g.home.team;return `${g.home.team===player.team?'vs':'@'} ${opponent}`;}return currentByes().has(player.team)?'Bye':player.team?'Not listed':'Free agent';}
function setTab(next){if(!TABS.includes(next))return;tab=next;showCount=10;render();$('#main').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function addPlayer(id){if(!playerMap.has(id))return;watch.add(id);persist('rr.watch',[...watch]);render();refreshDialog();toast(`Following ${playerMap.get(id).name}.`);}
function removePlayer(id){watch.delete(id);persist('rr.watch',[...watch]);render();refreshDialog();toast('Removed from your watchlist.');}
function showModal(eyebrow,body){$('#modal-eyebrow').textContent=eyebrow;$('#modal-body').innerHTML=body;if(!$('#modal').open)$('#modal').showModal();}
function refreshDialog(){if(modalPlayerId&&$('#modal').open)openPlayer(modalPlayerId);else if($('#modal-player-search'))search($('#modal-player-search'));}
function openSearch(){modalPlayerId=null;showModal('PLAYER SEARCH',`<div class="player-search-modal"><h2 id="modal-title">Find a player</h2><p>Follow players from any fantasy platform, or <button class="text-button" data-modal-league>import your Sleeper roster</button>.</p><div class="search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"></circle><path d="m13 13 4 4"></path></svg><input id="modal-player-search" class="player-search" aria-label="Player name or team" type="search" placeholder="Player name or team" autocomplete="off" data-results="modal-search-results"></div><div id="modal-search-results" class="search-results" aria-live="polite"></div><p class="small-print">Search by name or NFL team abbreviation. Your watchlist stays in this browser.</p></div>`);$('#modal-player-search').focus();}
function sources(){
 modalPlayerId=null;
 showModal('SOURCES & UPDATE TIMES',`<h2 id="modal-title">Where the data comes from</h2><p>News and schedules are checked about every 15 minutes, add activity every 30 minutes, and player records daily while the server is awake.</p>${Object.entries(SOURCE_LABELS).map(([key,label])=>{const s=data?.sources?.[key],state=sourceState(key);return `<div class="source-row"><div class="source-row-header"><strong>${label}</strong><span class="source-state ${state}">${{missing:'NO CHECK YET',overdue:'CHECK OVERDUE',current:'CHECKED'}[state]}</span></div><small>Last successful check: ${esc(datetime(s?.checkedAt))}</small>${s?.error?'<small>The latest check failed. The last successful data is still shown.</small>':''}<a href="${key==='news'||key==='schedule'?'https://www.espn.com/nfl/':'https://docs.sleeper.com/'}" target="_blank" rel="noopener">Source details ↗</a></div>`;}).join('')}<h3>Reading the timestamps</h3><p>A check time tells you when we retrieved a source. It does not mean every player record changed then. Sleeper’s daily directory can lag official injury reports.</p><p>We retain observed reports for up to seven days. Coverage can have gaps: the server can sleep between visits, and a restart can fall back to the dated saved snapshot. Opening the site checks for overdue updates.</p><p>Headlines link to the original reporting. The optional reading notes are fixed guidance for your league settings, not player projections. Add totals measure activity across Sleeper, not availability in your league.</p>`);
}
function about(){
 modalPlayerId=null;
 showModal('ABOUT ROSTER RADAR',`<h2 id="modal-title">A desk for your fantasy week.</h2><p>Catch up on NFL reporting, keep track of your players, and see who is being added across Sleeper.</p><ol><li>Follow players with the search button, or import a Sleeper league and choose a roster.</li><li>Set your scoring and format under League. Simple, Moderate and Expert adjust the optional guidance.</li><li>Read the reports and use Waivers to check add activity.</li><li>Mark caught up to save your place. Your next visit opens with reports published or updated since that checkpoint.</li></ol><h3>Your saved information</h3><p>Your watchlist, settings, imported roster and checkpoint stay in this browser. A Sleeper league ID is sent to this service and Sleeper to retrieve public league information. The import is read-only and never asks for a password.</p><p>Roster Radar does not change lineups or submit transactions. It does not calculate projections, FAAB bids, keeper costs or league-specific deadlines.</p>`);
}
function openPlayer(id){
 const p=playerMap.get(id);if(!p)return;modalPlayerId=id;
 const articles=(data?.news||[]).filter(n=>n.players?.includes(id)).slice(0,8),fixture=fixtureFor(p.team),bye=currentByes().has(p.team),inRoster=rosterPlayers(selectedRoster()).includes(id);
 showModal(`${p.position} / ${p.team||'FREE AGENT'}`,`<h2 id="modal-title">${esc(p.name)}</h2><div class="modal-meta"><div><span>DIRECTORY STATUS</span><strong class="${p.status?'flag':''}">${esc(p.status||'No status flag')}</strong></div><div><span>THIS WEEK</span><strong>${esc(fixtureText(p))}</strong></div></div>${p.status?`<div class="notice warning">${esc(p.status)}${p.body?' · '+esc(p.body):''}. Directory checked ${esc(datetime(data.sources.players?.checkedAt))}. Confirm the latest report before setting a lineup.</div>`:`<p class="small-print">No flag in the daily directory does not confirm game-day availability. Checked ${esc(datetime(data.sources.players?.checkedAt))}.</p>`}${fixture?`<p><a href="${esc(safeUrl(fixture.url))}" target="_blank" rel="noopener">${esc(fixture.away.team)} at ${esc(fixture.home.team)} ↗</a> · ${esc(scoreLabel(fixture))}${fixture.state==='in'||fixture.completed?` · ${fixture.away.score}–${fixture.home.score}`:''}</p>`:bye?'<p>Confirmed bye in the current NFL week.</p>':''}<div class="modal-actions"><button class="primary-button" data-${watch.has(id)?'remove':'add'}="${esc(id)}">${watch.has(id)?'Unfollow player':'Follow player'}</button>${inRoster?'<span class="small-print">Also on your imported roster</span>':''}</div><details class="guide" ${settings.guidance==='simple'?'':'open'}><summary>${settings.guidance==='expert'?'League assumptions':'League notes'}</summary><p>${esc(playerLens(p,settings))}</p></details><h3>Recent reports</h3>${articles.length?articles.map(n=>`<div class="source-row"><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${esc(n.title)} ↗</a><small>${esc(datetime(n.updated||n.published))} · ESPN</small></div>`).join(''):'<p>No matched reports in the retained feed. Other reporting may still exist.</p>'}`);
}
function search(input){
 const target=document.getElementById(input?.dataset.results);if(!target)return;
 const q=normalizeSearch(input.value.trim());if(q.length<2){target.innerHTML='';return;}
 const matches=searchIndex.filter(p=>p.search.includes(q)).slice(0,8);
 target.innerHTML=matches.length?matches.map(p=>`<button class="search-result" data-${watch.has(p.id)?'player':'add'}="${esc(p.id)}" aria-label="${watch.has(p.id)?'View':'Follow'} ${esc(p.name)}"><div>${esc(p.name)}<small>${esc(p.position)} · ${esc(p.team||'FA')}${p.status?' · '+esc(p.status):''}</small></div><span aria-hidden="true">${watch.has(p.id)?'✓':'+'}</span></button>`).join(''):'<p class="small-print">No matching player. Try a surname or team abbreviation.</p>';
}
function empty(title,message,action='',code='NO REPORTS'){return `<div class="empty"><span class="empty-code">${code}</span><h2>${title}</h2><p>${message}</p>${action}</div>`;}
function guideLevel(){return `<div class="guide-setting"><span>Reading notes</span><div class="segmented" aria-label="Guidance level">${['simple','moderate','expert'].map(g=>`<button data-guidance="${g}" aria-pressed="${settings.guidance===g}">${g[0].toUpperCase()+g.slice(1)}</button>`).join('')}</div></div>`;}
function newsCard(n,lead=false){
 const people=(n.players||[]).map(id=>playerMap.get(id)).filter(Boolean),mine=tracked(),personal=people.some(p=>mine.has(p.id)),updated=n.updated||n.published;
 const revised=Date.parse(updated)-Date.parse(n.published)>60000;
 const guide=people.length||n.kind!=='Around the league';
 return `<article class="news-card${lead?' lead':''}${personal?' tracked':''}"><div class="card-meta"><span class="category">${esc(n.kind)}</span>${personal?'<span class="for-you">ON YOUR RADAR</span>':lead?'<span>LATEST</span>':'<span>ESPN</span>'}<time class="report-time" datetime="${esc(updated)}" title="Published ${esc(datetime(n.published))}${revised?' · Updated '+esc(datetime(updated)):''}">${revised?'Updated ':''}${esc(relative(updated))}</time></div><h2><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${esc(n.title)}</a></h2><div class="card-foot">${people.slice(0,3).map(p=>`<button class="player-tag" data-player="${esc(p.id)}">${esc(p.name)}</button>`).join('')}<a class="source-link" href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${lead?'Read on ESPN':'Read report'} ↗</a></div>${guide?`<details class="guide" data-report-guide="${esc(n.id)}" ${settings.guidance==='moderate'&&personal?'open':''}><summary>${settings.guidance==='expert'?'Evidence & league context':'What to check for your league'}</summary><p>${esc(newsLens(n,people,settings))}</p></details>`:''}</article>`;
}
function overview(){
 const mine=trackedPlayers(),byes=currentByes(),flags=mine.filter(p=>p.status),resting=mine.filter(p=>byes.has(p.team)),changes=statusChanges(mine,previous);
 const invalidScope=settings.scope==='available'&&!rosterFresh(),scope=invalidScope?'all':settings.scope;
 const scoped=filterNews(data.news,{...settings,scope},tracked(),available(),lastSeen),news=topic==='all'?scoped:scoped.filter(n=>n.kind===topic);
 const oldest=data.newsCoverage?.oldestPublished||data.news.at(-1)?.published;
 const summary=mine.length?`<div class="desk-summary"><button data-go="players"><strong>${mine.length}</strong> following</button><span class="summary-divider"></span><button data-go="players" class="${flags.length?'flagged':''}"><strong>${flags.length}</strong> status flags</button><span class="summary-divider"></span><button data-go="players"><strong>${byesConfirmed()?resting.length:'—'}</strong> ${byesConfirmed()?'on bye':'byes unconfirmed'}</button></div>`:'';
 const staleNotice=invalidScope?`<div class="notice warning">${esc(leagueIssue())} Showing all reports for now. <button data-go="league">Review league</button></div>`:'';
 const intro=!mine.length?'<div class="notice"><button data-find-player>Follow a player</button> to bring their reports and status changes into this view.</div>':'';
 const changeNotice=changes.length?`<div class="notice"><strong>${changes.length} directory change${changes.length===1?'':'s'} since your checkpoint.</strong> ${changes.slice(0,3).map(c=>`${esc(c.player.name)}: ${esc(c.before.status||'no flag')} → ${esc(c.after.status||'no flag')}${c.before.team!==c.after.team?`; ${esc(c.before.team||'FA')} → ${esc(c.after.team||'FA')}`:''}`).join('. ')}. <button data-go="players">View players</button></div>`:'';
 let noReports;
 if(scope==='mine'&&!mine.length)noReports=empty('Add your players.','Follow players or import a Sleeper roster to see matching reports here.','<button data-find-player>Find a player +</button>','YOUR RADAR');
 else if(settings.window==='since'&&lastSeen&&topic==='all')noReports=empty('You’re caught up.','No retained reports match this view since your last checkpoint. You can still read earlier reports.','<button data-reset-filter>Show the last seven days</button>','CHECKPOINT SAVED');
 else noReports=empty('No reports in this view.','Try a different category, a wider time window, or all NFL reports.','<button data-reset-filter>Reset filters</button>');
 return `${summary}${staleNotice}${changeNotice}<div class="scope-bar"><div class="scope-tabs" aria-label="Report scope">${[['all','All NFL'],['mine','My players'],['available','Unrostered']].map(([value,label])=>`<button data-scope="${value}" aria-pressed="${scope===value}" class="${scope===value?'active':''}" ${value==='available'&&!rosterFresh()?'disabled title="Import a current Sleeper league to use this filter"':''}>${label}</button>`).join('')}</div><span class="report-count">${news.length} REPORT${news.length===1?'':'S'}</span></div><div class="filter-row" aria-label="Report category">${TOPICS.map(([value,label])=>`<button data-topic="${value}" aria-pressed="${topic===value}" class="${topic===value?'active':''}">${label}</button>`).join('')}</div>${intro}${settings.window==='since'&&!lastSeen?'<p class="coverage">No saved checkpoint yet. Showing the last three days.</p>':''}${news.length?news.slice(0,showCount).map((n,i)=>(i===1?'<div class="section-divider"><span>MORE REPORTS</span><span>ESPN / NEWEST FIRST</span></div>':'')+newsCard(n,i===0)).join(''):noReports}${news.length>showCount?`<button class="load-more" id="load-more">Load more reports <span>${news.length-showCount} remaining ↓</span></button>`:''}${oldest?`<p class="coverage">Retained reports begin ${esc(datetime(oldest))}. Earlier coverage can have gaps. <button data-open-sources>Source details</button></p>`:''}`;
}
function playerRow(p){
 const bye=currentByes().has(p.team),fixture=fixtureFor(p.team);
 return `<tr><td><button class="player-name" data-player="${esc(p.id)}">${esc(p.name)}</button><span class="player-meta">${esc(p.position)} · ${esc(p.team||'FA')}${rosterPlayers(selectedRoster()).includes(p.id)?' · ROSTER':''}</span></td><td><span class="status-tag ${p.status?'flag':''}">${esc(p.status||'No flag')}</span>${bye?'<br><span class="status-tag bye">BYE</span>':''}</td><td><span class="table-fixture">${esc(fixtureText(p))}${fixture?`<small>${esc(scoreLabel(fixture))}</small>`:''}</span></td><td class="table-right"><button class="row-action" data-player="${esc(p.id)}" aria-label="View ${esc(p.name)}">View ↗</button></td></tr>`;
}
function playersView(){
 const list=trackedPlayers(),positions=['ALL','QB','RB','WR','TE','K','DEF'],visible=settings.position==='ALL'?list:list.filter(p=>p.position===settings.position);
 const byes=currentByes(),sorted=[...visible].sort((a,b)=>Number(Boolean(b.status))-Number(Boolean(a.status))||Number(byes.has(b.team))-Number(byes.has(a.team))||a.rank-b.rank);
 return `<div class="section-heading"><h2>${selectedRoster()?esc(selectedRoster().name):'Your players'}</h2><span>${list.length} FOLLOWING</span></div><p class="section-intro">${selectedRoster()?'Your selected roster and personal watchlist.':'Players you follow, across any fantasy platform.'} Directory checked ${esc(relative(data.sources.players?.checkedAt))}.</p>${league&&!rosterFresh()?`<div class="notice warning">${esc(leagueIssue())} <button data-go="league">Review league</button></div>`:''}<div class="filter-row" aria-label="Player position">${positions.map(p=>`<button data-position="${p}" aria-pressed="${settings.position===p}" class="${settings.position===p?'active':''}">${p==='ALL'?'All positions':p}</button>`).join('')}<button data-find-player>+ Add player</button></div>${sorted.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>PLAYER</th><th>STATUS</th><th>THIS WEEK</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${sorted.map(playerRow).join('')}</tbody></table></div><p class="small-print">Directory flags can lag official reports. “No flag” does not confirm availability.</p>`:list.length?empty('No players at this position.','Choose another position or add a player.','<button data-position="ALL">Show all players</button>','YOUR RADAR'):empty('Who’s on your roster?','Find your players and follow them. Their reports, directory flags and games will appear here.','<button data-find-player>Find your first player +</button>','YOUR RADAR')}${guideLevel()}`;
}
function waiverView(){
 const avail=available();let trends=(data.trends||[]).map(t=>({...t,player:playerMap.get(t.id)})).filter(t=>t.player);
 if(league&&rosterFresh())trends=trends.filter(t=>avail.has(t.id));
 if(settings.position!=='ALL')trends=trends.filter(t=>t.player.position===settings.position);
 return `<div class="section-heading"><h2>Most added</h2><span>24-HOUR ACTIVITY</span></div><p class="section-intro">Add activity across Sleeper, ordered by total adds. ${rosterFresh()?'Showing only players unrostered in your imported league.':'Your league’s availability is not known.'}</p><div class="waiver-note"><p><strong>${rosterFresh()?esc(league.name):'Check your league’s free agents'}</strong>${rosterFresh()?`Rosters checked ${esc(relative(league.checkedAt))}. Refresh if your league has made moves.`:league?esc(leagueIssue()):'Import a Sleeper league to filter out rostered players.'}</p><button data-${rosterFresh()?'refresh-league':'go="league"'} ${rosterFresh()&&syncing?'disabled':''}>${rosterFresh()?'Refresh ↻':'Set up ↗'}</button></div>${settings.lineup==='best'?'<div class="notice">This is a best-ball league. Confirm whether its rules allow roster moves.</div>':''}<div class="filter-row" aria-label="Waiver position">${['ALL','QB','RB','WR','TE','K','DEF'].map(p=>`<button data-position="${p}" aria-pressed="${settings.position===p}" class="${settings.position===p?'active':''}">${p==='ALL'?'All positions':p}</button>`).join('')}</div>${trends.length?`<div class="table-wrap"><table class="data-table waiver-table"><thead><tr><th>#</th><th>PLAYER</th><th class="desktop-col">STATUS</th><th class="table-right">ADDS / 24H</th><th><span class="sr-only">Follow</span></th></tr></thead><tbody>${trends.map((t,i)=>`<tr><td class="rank-cell">${String(i+1).padStart(2,'0')}</td><td><button class="player-name" data-player="${esc(t.id)}">${esc(t.player.name)}</button><span class="player-meta">${esc(t.player.position)} · ${esc(t.player.team||'FA')} · ${esc(fixtureText(t.player))}</span></td><td class="desktop-col"><span class="status-tag ${t.player.status?'flag':''}">${esc(t.player.status||'No flag')}</span></td><td class="adds-cell">+${new Intl.NumberFormat().format(t.count)}</td><td class="table-right"><button class="row-action" data-${watch.has(t.id)?'player':'add'}="${esc(t.id)}" aria-label="${watch.has(t.id)?'View':'Follow'} ${esc(t.player.name)}">${watch.has(t.id)?'✓':'+ Follow'}</button></td></tr>`).join('')}</tbody></table></div>`:empty('No matching additions.','Try a different position. The feed contains the most-added players, not the entire free-agent pool.','<button data-position="ALL">Show all positions</button>','WAIVERS')}<p class="small-print">Source: Sleeper · Checked ${esc(datetime(data.sources.trends?.checkedAt))}. These are activity totals, not pickup rankings or projected points.</p>${guideLevel()}`;
}
const options={scoring:[['standard','Standard / no PPR'],['half','Half PPR'],['ppr','Full PPR'],['custom','Custom / imported']],format:[['redraft','Redraft'],['keeper','Keeper'],['dynasty','Dynasty']],qb:[['one','One quarterback'],['super','Superflex'],['two','Two quarterbacks']],size:['8','10','12','14','16'].map(n=>[n,n+' teams']),waivers:[['faab','FAAB bidding'],['priority','Waiver priority']],lineup:[['managed','Set your lineup'],['best','Best ball']]};
function leagueView(){
 const fields=[['scoring','Reception scoring','Points per catch.'],['format','Roster format','How players carry between seasons.'],['qb','Quarterback slots','The number of quarterbacks you can start.'],['size','League size','The number of fantasy teams.'],['waivers','Waiver system','How free-agent claims are awarded.'],['lineup','Lineup format','Managed lineups or automatic best ball.']];
 return `<div class="section-heading"><h2>League settings</h2><span>SAVED AUTOMATICALLY</span></div><p class="section-intro">Use your league’s rules for the optional reading notes. You can set these manually for any fantasy platform.</p><div class="form-grid">${fields.map(([key,label,hint])=>`<label>${label}<select data-setting="${key}">${options[key].map(([value,text])=>`<option value="${value}" ${settings[key]===value?'selected':''}>${text}</option>`).join('')}${!options[key].some(([v])=>v===settings[key])?`<option selected value="${esc(settings[key])}">${esc(settings[key])}${key==='size'?' teams':''}</option>`:''}</select><small>${hint}</small></label>`).join('')}</div>${guideLevel()}<section class="league-form"><span class="section-kicker">SLEEPER IMPORT</span><h2>${league?esc(league.name):'Bring in your roster'}</h2><p>${league?'Choose a team to include its players in your briefing.':'Paste your league link or numeric ID to read its settings and rosters. No password needed.'}</p>${league?`<div class="notice ${rosterFresh()?'':'warning'}">Season ${esc(league.season)} · ${league.rosters.length} teams · Checked ${esc(relative(league.checkedAt))}.${rosterFresh()?'':` ${esc(leagueIssue())}`}</div><label for="roster-select">Team to follow</label><select id="roster-select"><option value="">Choose a team…</option>${league.rosters.map(r=>`<option value="${esc(r.id)}" ${String(rosterId)===String(r.id)?'selected':''}>${esc(r.name)} (${r.record?.wins||0}–${r.record?.losses||0})</option>`).join('')}</select><div class="league-actions"><button data-refresh-league ${syncing?'disabled':''}>${syncing?'Refreshing…':'Refresh rosters ↻'}</button><button class="disconnect" id="disconnect">Disconnect league</button></div>`:''}<form id="league-import"><label for="league-input">${league?'Import another league':'Sleeper league URL or ID'}</label><input id="league-input" value="${esc(leagueDraft)}" placeholder="https://sleeper.com/leagues/…" autocomplete="off" required aria-describedby="league-error"><button class="primary-button" type="submit" ${syncing?'disabled':''}>${syncing?'Connecting…':'Import league'} ↗</button></form><p id="league-error" class="form-error" role="status">${esc(leagueError)}</p><p class="small-print">Use the league URL, not an invitation code. Imports are read-only. Your selection stays in this browser.</p></section><div class="settings-note"><p class="small-print">Custom scoring bonuses, keeper costs, IDP and exact waiver deadlines still need your league’s own rules. These settings do not create rankings or projections.</p></div>`;
}

function openSchedule(){
 modalPlayerId=null;
 const games=orderFixtures(data?.schedule?.games||[]),byes=[...currentByes()];
 showModal('NFL SCHEDULE',`<h2 id="modal-title">${data?.state?`Week ${esc(data.state.week)} · ${esc(data.state.season)}`:'This week’s games'}</h2><p class="small-print">Scores last checked ${esc(datetime(data?.sources?.schedule?.checkedAt))}. These scores refresh periodically.</p>${games.length?games.map(game=>`<a class="fixture" href="${esc(safeUrl(game.url))}" target="_blank" rel="noopener"><span class="fixture-line"><strong>${esc(game.away.team)} <span class="muted">at</span> ${esc(game.home.team)}</strong>${game.state==='in'||game.completed?`<span class="score">${esc(game.away.score)} – ${esc(game.home.score)}</span>`:'<span>↗</span>'}</span><small class="${game.state==='in'?'live':''}">${esc(scoreLabel(game))}</small></a>`).join(''):'<p>No matching current-week schedule is available yet.</p>'}${byes.length?`<p class="bye-line">Confirmed byes: ${byes.map(esc).join(', ')}</p>`:''}`);
}
function renderScoreboard(){
 const games=orderFixtures(data?.schedule?.games||[]),container=$('#scoreboard-games'),left=container.scrollLeft;
 const state=data?.state;
 $('#season-label').textContent=state?`${state.season} NFL`:'NFL';
 $('#week-label').textContent=state?`${state.season_type==='post'?'POST':state.season_type==='pre'?'PRE':'WEEK'} ${state.week}`:'THIS WEEK';
 $('#scoreboard-caption').textContent='Scores & schedule';
 container.innerHTML=games.length?games.map(game=>{
   const played=game.state==='in'||game.completed||game.state==='post';
   const side=team=>`<span class="score-team"><span>${esc(team.team)}</span><b>${played?esc(team.score):'—'}</b></span>`;
   return `<a class="score-game ${game.state==='in'?'is-live':''}" href="${esc(safeUrl(game.url))}" target="_blank" rel="noopener" aria-label="${esc(game.away.team)} at ${esc(game.home.team)}, ${esc(scoreLabel(game))}"><span class="game-meta">${game.state==='in'?'● ':''}${esc(scoreLabel(game))}</span>${side(game.away)}${side(game.home)}</a>`;
 }).join(''):'<p class="schedule-loading">Current schedule unavailable. Sources are being checked.</p>';
 container.scrollLeft=left;
}
function renderRail(){
 const list=trackedPlayers(),watchIds=[...watch],map=playerMap;
 $('#rail-watch-count').textContent=`${list.length} FOLLOWING`;
 $('#watch-description').textContent=list.length?selectedRoster()?`${selectedRoster().name} + your watchlist.`:'Your followed players. Open a name for reports.':'Add the players you want to keep an eye on.';
 const shown=[...new Set([...watchIds,...list.map(p=>p.id)])].slice(0,7);
 $('#watch-chips').innerHTML=shown.map(id=>{const p=map.get(id);return `<div class="watch-row"><button class="watch-player" data-player="${esc(id)}" ${p?'':'disabled'}><span class="pos">${esc(p?.position||'—')}</span><span>${esc(p?.name||id)}<small>${esc(p?.team||'FA')}</small></span></button>${watch.has(id)?`<button class="watch-remove" data-remove="${esc(id)}" aria-label="Unfollow ${esc(p?.name||id)}">×</button>`:'<span class="player-meta">ROSTER</span>'}</div>`;}).join('')+(list.length>7?`<button class="watch-overflow" data-go="players">View all ${list.length} players ↗</button>`:'');
 $('#connect-button').innerHTML=`${league?'League & roster settings':'Import a Sleeper league'} <span aria-hidden="true">↗</span>`;
 const teams=new Set(list.map(p=>p.team).filter(Boolean));
 const games=orderFixtures(data?.schedule?.games||[]).filter(g=>!teams.size||teams.has(g.home.team)||teams.has(g.away.team)).slice(0,3);
 const byes=[...currentByes()].filter(t=>!teams.size||teams.has(t));
 $('#week-panel').innerHTML=`<div class="rail-heading"><h2>${teams.size?'Your teams this week':'This week’s games'}</h2><span>WK ${esc(data?.state?.week||'—')}</span></div>${games.length?games.map(game=>`<a class="fixture" href="${esc(safeUrl(game.url))}" target="_blank" rel="noopener"><span class="fixture-line"><strong>${esc(game.away.team)} <span class="muted">at</span> ${esc(game.home.team)}</strong><span class="score">${game.state==='in'||game.completed?`${esc(game.away.score)}–${esc(game.home.score)}`:'↗'}</span></span><small class="${game.state==='in'?'live':''}">${esc(scoreLabel(game))}</small></a>`).join(''):'<p class="small-print">No matching games in the current schedule.</p>'}${byes.length?`<p class="bye-line">BYE · ${byes.map(esc).join(' / ')}</p>`:''}<button class="rail-more" data-open-schedule>Full schedule ↗</button>`;
 const trends=(data?.trends||[]).map(t=>({...t,player:map.get(t.id)})).filter(t=>t.player).slice(0,3);
 $('#activity-panel').innerHTML=`<div class="rail-heading"><h2>Being added</h2><span>SLEEPER / 24H</span></div>${trends.map((t,i)=>`<button class="rail-trend" data-player="${esc(t.id)}"><span class="rank">${String(i+1).padStart(2,'0')}</span><span class="trend-person">${esc(t.player.name)}<small>${esc(t.player.position)} · ${esc(t.player.team||'FA')}</small></span><span class="adds">+${new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(t.count)}</span></button>`).join('')}<button class="rail-more" data-go="waivers">Open waiver board ↗</button>`;
}
function render(){
 const active=document.activeElement;
 const focusInContent=Boolean(active?.closest('#content'));
 const focusId=active?.id,focusSetting=active?.dataset?.setting,selectStart=active?.selectionStart,selectEnd=active?.selectionEnd;
 const openGuides=new Set($$('#content details[open][data-report-guide]').map(el=>el.dataset.reportGuide));
 $$('[data-tab]').forEach(button=>{const on=button.dataset.tab===tab;button.classList.toggle('active',on);if(on)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
 $('#time-window').value=settings.window;
 $('#league-chip').innerHTML=`${esc(formatLabel())} <span aria-hidden="true">↗</span>`;
 $('#nav-watch-count').textContent=data?trackedPlayers().length:tracked().size;
 $('#last-reviewed').textContent=lastSeen?`Saved ${datetime(lastSeen)}. Next visit starts here.`:'Save your place for next time.';
 const headings={
   briefing:['YOUR DAILY CATCH-UP','Briefing','The latest reports, with your players in view.'],
   players:['YOUR WATCHLIST & ROSTER','My players','Status flags, reports and the games ahead.'],
   waivers:['PLAYER ACTIVITY','Waivers','Who’s being added, and who’s available to you.'],
   league:['MAKE IT YOUR LEAGUE','League','Scoring, format and your Sleeper roster.']
 };
 $('#page-kicker').textContent=headings[tab][0];$('#page-title').textContent=headings[tab][1];$('#page-subtitle').textContent=headings[tab][2];
 $('#briefing-controls').hidden=tab!=='briefing';$('#checkpoint-bar').hidden=tab==='league';
 $('#today-label').textContent=new Date().toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'});
 $('#today-label').dateTime=new Date().toISOString().slice(0,10);
 if(!data)return;
 const failed=Object.keys(SOURCE_LABELS).some(key=>sourceState(key)!=='current');
 $('#source-button').dataset.status=offline||failed?'warning':data.refreshing?'loading':'ok';
 $('#connection').textContent=offline?'Connection interrupted':data.refreshing?'Checking sources…':failed?'Source checks overdue':`Checked ${relative(data.sources.news?.checkedAt)}`;
 $('#source-button').setAttribute('aria-label',`Sources and update times: ${$('#connection').textContent}`);
 $('#error-banner').hidden=!failed&&!offline;
 $('#error-banner').textContent=offline?'The latest check could not connect. Showing the last received data. Your saved settings are safe; we’ll retry automatically.':failed?'One or more source checks are overdue. The last successful data keeps its original timestamp. Open Sources & update times for details.':'';
 $('#content').innerHTML=tab==='briefing'?overview():tab==='players'?playersView():tab==='waivers'?waiverView():leagueView();
 $$('[data-guidance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guidance===settings.guidance)));
 for(const el of $$('#content details[data-report-guide]'))if(openGuides.has(el.dataset.reportGuide))el.open=true;
 renderScoreboard();renderRail();$$('.player-search').forEach(search);
 if(focusInContent){
   const replacement=focusId?document.getElementById(focusId):focusSetting?document.querySelector(`[data-setting="${CSS.escape(focusSetting)}"]`):null;
   if(replacement){replacement.focus({preventScroll:true});if(typeof selectStart==='number'&&replacement.setSelectionRange){try{replacement.setSelectionRange(selectStart,selectEnd);}catch{}}}
 }
}
async function importLeague(value,background=false){
 let id=String(value||'').trim();
 if(!/^\d+$/.test(id)){try{const u=new URL(id);if(!['sleeper.com','sleeper.app','www.sleeper.com','www.sleeper.app'].includes(u.hostname)||!['https:','http:'].includes(u.protocol))throw Error();id=u.pathname.split('/').find(part=>/^\d{10,24}$/.test(part))||'';}catch{id='';}}
 if(!/^\d{10,24}$/.test(id)){leagueError='Use a Sleeper league URL or its numeric league ID.';if(!background){render();$('#league-input')?.focus();}return;}
 if(syncing)return;
 const request=++activeRequest;syncing=true;leagueError='';if(!background)render();
 try{
   const response=await fetch('/api/league/'+id,{signal:AbortSignal.timeout(25000)}),result=await response.json();
   if(!response.ok)throw Error(result.error||'Sleeper could not load this league.');
   if(!validLeague(result))throw Error('Sleeper returned an incomplete league. Please try again.');
   if(request!==activeRequest)return;
   const same=league?.id===result.id;league=result;
   if(!background){settings=normalizeSettings({...settings,...inferSettings(league)});saveSettings();if(!same)rosterId=null;leagueDraft='';}
   if(rosterId!==null&&!league.rosters.some(r=>String(r.id)===String(rosterId)))rosterId=null;
   persist('rr.league',league);persist('rr.roster',rosterId);lastLeagueCheck=Date.now();
   if(!background)toast(same?'League roster refreshed.':'League imported. Choose the team you want to follow.');
 }catch(error){
   if(request!==activeRequest)return;
   leagueError=error.name==='TimeoutError'?'Sleeper took too long to respond. Please try again.':error.message||'Unable to connect. Please try again.';
   lastLeagueCheck=Date.now();if(!background&&tab!=='league')toast(leagueError);
 }finally{
   if(request===activeRequest){syncing=false;render();}
 }
}
function applyData(value){
 if(!validObject(value)||!Array.isArray(value.players)||!Array.isArray(value.news)||!Array.isArray(value.trends)||!validObject(value.sources))throw Error('Invalid briefing');
 data=value;playerMap=new Map(value.players.map(p=>[p.id,p]));
 searchIndex=value.players.map(p=>({...p,search:normalizeSearch(`${p.name} ${p.team||''}`)}));
}
async function load(){
 if(loading)return;loading=true;clearTimeout(refreshTimer);
 try{
   const response=await fetch('/api/briefing',{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Unable to retrieve the briefing.');
   applyData(await response.json());offline=false;render();
   if(data.refreshing||(!data.players.length&&!data.news.length))refreshTimer=setTimeout(load,5000);
   if(league&&!syncing&&Date.now()-lastLeagueCheck>300000)importLeague(league.id,true);
 }catch{
   offline=true;
   if(data)render();else{$('#error-banner').hidden=false;$('#error-banner').textContent='Roster Radar could not connect. Your saved settings are safe. We’ll retry automatically.';$('#connection').textContent='Waiting for connection';$('#source-button').dataset.status='warning';$('#content').innerHTML=empty('The desk is reconnecting.','The server may be waking up. Try again in a moment.','<button data-retry>Try again</button>','CONNECTION');}
   refreshTimer=setTimeout(load,15000);
 }finally{loading=false;}
}
function setTheme(theme){
 const value=theme==='light'?'light':'dark';document.documentElement.dataset.theme=value;
 $('#theme-button').setAttribute('aria-label',`Switch to ${value==='dark'?'light':'dark'} mode`);
 $('#theme-button').setAttribute('title',`Switch to ${value==='dark'?'light':'dark'} mode`);
 document.querySelector('meta[name="theme-color"]').content=value==='dark'?'#171a19':'#f4f2eb';
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(button.dataset.tab)setTab(button.dataset.tab);
 if(button.dataset.go)setTab(button.dataset.go);
 if(button.dataset.guidance){settings.guidance=button.dataset.guidance;saveSettings();render();}
 if(button.dataset.scope){settings.scope=button.dataset.scope;showCount=10;saveSettings();render();}
 if(button.dataset.topic){topic=button.dataset.topic;showCount=10;render();}
 if(button.dataset.position){settings.position=button.dataset.position;saveSettings();render();}
 if(button.dataset.add)addPlayer(button.dataset.add);
 if(button.dataset.remove)removePlayer(button.dataset.remove);
 if(button.dataset.player)openPlayer(button.dataset.player);
 if(button.hasAttribute('data-find-player'))openSearch();
 if(button.hasAttribute('data-modal-league')){$('#modal').close();setTab('league');}
 if(button.hasAttribute('data-reset-filter')){settings.scope='all';settings.window='7';topic='all';showCount=10;saveSettings();render();}
 if(button.hasAttribute('data-open-sources'))sources();
 if(button.hasAttribute('data-open-schedule'))openSchedule();
 if(button.hasAttribute('data-refresh-league')&&league)importLeague(league.id);
 if(button.hasAttribute('data-retry'))load();
 if(button.id==='load-more'){showCount+=10;render();}
 if(button.id==='disconnect'){activeRequest++;syncing=false;league=null;rosterId=null;leagueError='';persist('rr.league',null);persist('rr.roster',null);settings.scope='all';saveSettings();render();toast('League disconnected. Your watchlist is saved.');}
});
document.addEventListener('input',event=>{
 if(event.target.matches('.player-search'))search(event.target);
 if(event.target.id==='league-input')leagueDraft=event.target.value;
});
document.addEventListener('change',event=>{
 if(event.target.dataset.setting){settings[event.target.dataset.setting]=event.target.value;saveSettings();render();}
 if(event.target.id==='roster-select'){rosterId=event.target.value||null;persist('rr.roster',rosterId);render();toast(rosterId?'Roster selected. Its players are now on your radar.':'Roster selection cleared.');}
});
document.addEventListener('submit',event=>{if(event.target.id==='league-import'){event.preventDefault();importLeague(leagueDraft);}});
$('#time-window').addEventListener('change',event=>{settings.window=event.target.value;showCount=10;saveSettings();render();});
$('#league-chip').onclick=$('#connect-button').onclick=()=>setTab('league');
$('#source-button').onclick=$('#source-button-2').onclick=sources;
$('#about-button').onclick=about;
$('#close-modal').onclick=()=>$('#modal').close();
$('#modal').addEventListener('close',()=>{modalPlayerId=null;});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('#modal').close();}});
$('#caught-up').onclick=()=>{
 if(!data){toast('Wait for the briefing to load.');return;}
 lastSeen=new Date().toISOString();previous=Object.fromEntries(trackedPlayers().map(p=>[p.id,{status:p.status,team:p.team}]));
 settings.window='since';saveSettings();persist('rr.seen',lastSeen);persist('rr.snapshot',previous);showCount=10;
 render();toast('Checkpoint saved. Next time, you’ll see reports since now.');
};
setTheme(read('rr.theme','dark'));
$('#theme-button').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(theme);persist('rr.theme',theme);};
render();load();
setInterval(()=>{if(!document.hidden)load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
