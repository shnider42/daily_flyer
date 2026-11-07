/* Returning-player briefings, grounded in reviewed live records. No account writes. */
(function () {
  'use strict';
  const host = document.getElementById('catchUpPage');
  const dataURL = document.getElementById('hllv-catch-up').dataset.source;
  const roles = {all:'All roles', infantry:'Infantry', engineer:'Engineer', armour:'Tank crew', boats:'Boat crew', commander:'Commander'};
  const depths = {
    overview:{label:'Quick overview',experience:'A little',intro:'A short look at what changed, with plain-language context.'},
    refresher:{label:'Refresher',experience:'The basics',intro:'What changed since you last played, with before-and-after comparisons.'},
    detailed:{label:'Detailed catch-up',experience:'Very well',intro:'The reviewed changes, exact rules, release history, and related fixes.'}
  };
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayString = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const today = () => dayString(new Date());
  const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10) === s;
  const date = s => new Date(s.slice(0,10)+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const safeURL = value => {try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && (!u.port||u.port==='443') && ['www.hellletloose.com','hellletloose.com','steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net'].includes(u.hostname) ? u.href : '';} catch (_) {return '';}};
  let data=null, feed=null, feedReceived=false, loading=false, failed=false;
  let state={since:'',role:'all',topic:'',depth:'refresher'}, mode='all', showAll=false, routeNote='';
  const source = id => data.sources.find(s=>s.id===id);
  const sourceLink = id => {const s=source(id),url=safeURL(s?.url);return url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+' ↗</a>':'<span>Source unavailable</span>';};
  function preset(kind) {
    const d=new Date();
    if(kind==='week')d.setDate(d.getDate()-7);
    else {const n=d.getDate();d.setDate(1);d.setMonth(d.getMonth()-1);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(n,last));}
    return dayString(d);
  }
  function hash() {
    const p=new URLSearchParams();
    if(state.since)p.set('since',state.since);
    if(state.role!=='all')p.set('role',state.role);
    if(state.topic)p.set('topic',state.topic);
    if(state.depth!=='refresher')p.set('depth',state.depth);
    return '#catch-up'+(p.size?'?'+p.toString():'');
  }
  function readRoute() {
    const p=new URLSearchParams(location.hash.split('?')[1]||'');routeNote='';
    let since=p.get('since')||'', role=p.get('role')||'all', topic=p.get('topic')||'', depth=p.get('depth')||'refresher';
    if(!Object.hasOwn(depths,depth)){depth='refresher';routeNote='That reading level is not available. Showing the refresher.';}
    if(since&&(!validDay(since)||since>today())){since='';routeNote='That date is not valid. Showing the current refresher.';}
    if(!Object.hasOwn(roles,role)){role='all';routeNote='That role is not available. Showing all roles.';}
    if(topic&&data&&!data.topics.some(t=>t.id===topic)){topic='';routeNote='That topic is not in this edition. Browse the available briefings below.';}
    state={since,role,topic,depth};mode=since?'custom':'all';showAll=!!topic||depth==='detailed';
  }
  function syncURL() {history.replaceState(null,'',hash());}
  function matching() {
    return data.topics.filter(t=>(state.role==='all'||t.roles.includes('all')||t.roles.includes(state.role)) && (!state.since||t.changes.some(c=>c.date>=state.since)))
      .sort((a,b)=>(state.role==='all'?0:Number(b.roles.includes(state.role))-Number(a.roles.includes(state.role))) || (state.depth==='overview'?a.overview_order-b.overview_order:0));
  }
  function newerPosts() {
    const through=Math.max(...data.sources.map(s=>Date.parse(s.published_at)));
    return (feed?.items||[]).filter(p=>{
      const known=data.sources.find(s=>s.announcement_id===p.id);
      return known ? known.content_sha256!==p.content_sha256 : Date.parse(p.published_at)>through;
    });
  }
  function reviewState() {
    if(!data)return;
    const box=document.getElementById('catchUpFreshness');if(!box)return;
    if(!feedReceived){box.textContent='Checking for newer official announcements…';return;}
    if(!feed){box.textContent='Newer announcements could not be checked. The dated briefings remain available.';return;}
    const posts=newerPosts();
    const stale=!Number.isFinite(Date.parse(feed.last_success_at))||Date.now()-Date.parse(feed.last_success_at)>36*3600000||feed.state!=='ok';
    box.textContent=posts.length?'Newer or changed official material awaits guide review. These briefings still reflect '+data.release+'.':stale?'Announcement checks are overdue or incomplete. Coverage remains dated to '+data.release+'.':'';
    for(const note of host.querySelectorAll('[data-cu-review]')){
      const t=data.topics.find(t=>t.id===note.dataset.cuReview);
      const affected=posts.some(p=>(p.candidate_feature_ids||[]).some(id=>t.feature_ids.includes(id)) || data.sources.some(s=>s.announcement_id===p.id&&t.source_ids.includes(s.id)));
      note.hidden=!affected;
    }
  }
  function card(t) {
    const changes=t.changes.filter(c=>!state.since||c.date>=state.since);
    const latest=t.changes.reduce((a,c)=>a>c.date?a:c.date,'');
    const bugs=t.issues.length?'<section class="cu-related"><h3>Related bug records</h3>'+t.issues.map(i=>'<p><a href="#'+esc(i.id)+'">'+esc(i.title)+' →</a><small>'+esc(i.status_label)+' · Evidence '+esc(date(i.last_updated))+'</small><span>'+esc(i.bottom_line)+'</span></p>').join('')+'</section>':'';
    const comparison='<section class="cu-comparisons"><h3>'+(state.since?'Changes in your selected period':'What changed')+'</h3><ul class="cu-changes">'+changes.map(c=>'<li><time datetime="'+esc(c.date)+'">'+esc(date(c.date))+'</time><p>'+esc(c.summary)+'</p><dl class="cu-before-after"><div><dt>Before this release</dt><dd>'+esc(c.before)+'</dd></div><div><dt>After this release</dt><dd>'+esc(c.after)+'</dd></div></dl></li>').join('')+'</ul></section>';
    const context='<p class="cu-context">'+esc(t.context)+'</p>';
    const explanation=state.depth==='overview'?context+'<details class="cu-disclosure cu-comparison-disclosure"><summary>Before & after · release details</summary>'+comparison+'</details>':comparison+context;
    const current='<details class="cu-disclosure cu-record-detail"'+(state.depth==='detailed'?' open':'')+'><summary>Current rules'+(t.issues.length?' & related fixes':'')+'</summary><section class="cu-current"><h3>Current reviewed rules · '+esc(data.release)+'</h3>'+t.baselines.map(b=>'<p>'+esc(b.summary)+'</p>').join('')+'</section>'+bugs+'</details>';
    return '<details class="cu-topic" data-topic="'+esc(t.id)+'"'+(state.topic===t.id?' open':'')+'><summary><span class="cu-topic-area">'+esc(t.area)+'</span><h2>'+esc(t.title)+'</h2><p class="cu-takeaway">'+esc(state.depth==='overview'?t.overview:t.takeaway)+'</p><span class="cu-topic-bottom"><span>Changed '+esc(date(latest))+'</span><span class="cu-read">Read changes <span class="cu-plus" aria-hidden="true">+</span></span></span></summary><div class="cu-topic-body"><p class="cu-review-flag" data-cu-review="'+esc(t.id)+'" hidden>New official material may affect this topic. These facts need another review.</p>'+explanation+'<p class="cu-caution"><strong>Scope of this change</strong> '+esc(t.caution)+'</p>'+current+'<section class="cu-evidence"><h3>Official sources & records</h3>'+t.source_ids.map(s=>'<p>'+sourceLink(s)+'</p>').join('')+t.baselines.map(b=>'<p><a href="#feature/'+esc(b.id)+'">'+esc(b.title)+' · Content tracker →</a></p>').join('')+'<small>Facts reviewed '+esc(date(data.reviewed_at))+'. Released rules are publisher-reported; independent playtesting is not recorded.</small></section></div></details>';
  }
  function renderResults() {
    const all=matching();
    if(state.topic&&all.findIndex(t=>t.id===state.topic)>=3)showAll=true;
    const visible=showAll?all:all.slice(0,3);
    document.getElementById('catchUpDepthLabel').textContent='Catch Up · '+depths[state.depth].label;
    document.getElementById('catchUpIntro').textContent=depths[state.depth].intro;
    document.getElementById('catchUpCount').textContent=all.length+' '+(all.length===1?'topic':'topics')+(state.since?' with reviewed changes from '+date(state.since):' in your current refresher');
    document.getElementById('catchUpListHeading').textContent=all.length?(showAll||all.length<=3?'Your changes':'First '+visible.length+' topics'):'No reviewed changes in this selection';
    const coverage=document.getElementById('catchUpCoverage');
    coverage.textContent=state.since&&state.since<data.coverage_from?'This edition starts '+date(data.coverage_from)+'. Earlier changes are not covered yet.':state.since&&state.since>data.coverage_through?'Our reviewed coverage ends '+date(data.coverage_through)+'. This does not establish that nothing changed after that date.':state.since?'Includes releases on your selected date. Current rules reflect '+data.release+'.':'Selected changes from '+date(data.coverage_from)+' to '+date(data.coverage_through)+'.';
    document.getElementById('catchUpResults').innerHTML=visible.length?visible.map(card).join(''):'<div class="cu-empty"><p>Try another role or date, or read how these mechanics work in the current reviewed version.</p><button type="button" id="catchUpReset">Show current refresher</button></div>';
    const more=document.getElementById('catchUpMore');more.hidden=all.length<=3;more.textContent=showAll?'Show the first 3':'Show all '+all.length+' topics';more.setAttribute('aria-expanded',String(showAll));
    document.getElementById('catchUpReset')?.addEventListener('click',()=>{state={since:'',role:'all',topic:'',depth:state.depth};mode='all';showAll=state.depth==='detailed';syncURL();render();document.getElementById('catchUpWhen').focus();});
    for(const detail of host.querySelectorAll('.cu-topic'))detail.addEventListener('toggle',()=>{
      if(!detail.isConnected)return;
      if(detail.open)state.topic=detail.dataset.topic;
      else if(state.topic===detail.dataset.topic)state.topic='';
      syncURL();
    });
    reviewState();
  }
  function applyFilters() {
    const input=document.getElementById('catchUpDate');
    const message=document.getElementById('catchUpMessage');
    if(mode==='custom'&&(!validDay(input.value)||input.value>today())){message.textContent='Choose a valid date on or before today.';input.setAttribute('aria-invalid','true');return;}
    input.removeAttribute('aria-invalid');message.textContent='';state.since=mode==='all'?'':mode==='custom'?input.value:preset(mode);
    document.getElementById('catchUpShareFallback').hidden=true;
    state.role=document.getElementById('catchUpRole').value;state.topic='';showAll=state.depth==='detailed';
    syncURL();renderResults();
  }
  async function copyLink() {
    const url=new URL(location.href);url.hash=hash();const message=document.getElementById('catchUpMessage');
    try {await navigator.clipboard.writeText(url.href);message.textContent='Link copied, including your date, familiarity, and role.';document.getElementById('catchUpShareFallback').hidden=true;}
    catch (_) {const box=document.getElementById('catchUpShareFallback');box.hidden=false;const input=box.querySelector('input');input.value=url.href;input.focus();input.select();message.textContent='Copy the selected link to share this briefing.';}
  }
  function render() {
    document.title='Catch Up · Infierno Liberado';
    host.innerHTML = '<main class="cu-main">'+
      '<header class="cu-heading"><span class="section-kicker" id="catchUpDepthLabel">Catch Up</span><h1 tabindex="-1">Back after a break?</h1><p id="catchUpIntro"></p><span class="cu-edition">Through '+esc(data.release)+' · '+esc(date(data.coverage_through))+'</span></header>'+
      '<div class="cu-controls">'+
        '<label>Last played<select id="catchUpWhen"><option value="all">Not sure</option><option value="week">A week ago</option><option value="month">A month ago</option><option value="custom">Pick a date</option></select></label>'+
        '<label>Game familiarity<select id="catchUpDepth" aria-label="Game familiarity before your break">'+Object.entries(depths).map(([v,d])=>'<option value="'+v+'">'+d.experience+'</option>').join('')+'</select></label>'+
        '<label id="catchUpDateLabel"'+(mode==='custom'?'':' hidden')+'>Date<input id="catchUpDate" type="date" max="'+today()+'" value="'+esc(state.since||preset('month'))+'" aria-describedby="catchUpMessage"></label>'+
        '<label>Role (optional)<select id="catchUpRole">'+Object.entries(roles).map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('')+'</select></label>'+
        '<button type="button" id="catchUpShare">Copy briefing link</button>'+
      '</div>'+
      '<p id="catchUpMessage" class="cu-message" role="status" aria-live="polite">'+esc(routeNote)+'</p>'+
      '<label id="catchUpShareFallback" class="cu-share-fallback" hidden>Briefing link<input type="text" readonly aria-label="Briefing link to copy"></label>'+
      '<div class="cu-results-heading"><h2 id="catchUpListHeading">Your changes</h2><p id="catchUpCount" role="status" aria-live="polite"></p></div>'+
      '<p id="catchUpCoverage" class="cu-coverage"></p><div id="catchUpResults" class="cu-grid"></div>'+
      '<button type="button" id="catchUpMore" class="cu-more" aria-controls="catchUpResults">Show all topics</button>'+
      '<p id="catchUpFreshness" class="cu-freshness" role="status" aria-live="polite"></p>'+
      '<footer class="cu-footer"><details><summary>About these reading levels & coverage</summary>'+
        '<p>Game familiarity means how well you knew the game before your break. A little gives a quick overview; The basics gives a refresher; Very well gives detailed catch-up. Switch at any time. All three levels contain the same reviewed changes and sources; additional details can be expanded in every level.</p>'+
        '<p>Coverage: selected changes from '+esc(date(data.coverage_from))+' to '+esc(date(data.coverage_through))+'. Facts reviewed '+esc(date(data.reviewed_at))+'. Earlier updates have not been backfilled yet. Dates filter released changes; current rules always show the latest reviewed version. Before-and-after comparisons describe each individual release.</p>'+
        '<p>Official sources establish mechanics and balance changes. This section describes those changes and their limits. Planned features are excluded. New announcements flag a review; they do not automatically rewrite these facts. Related bug records keep their own evidence status.</p>'+
        '<p>No account is needed. Your selected date, familiarity, and role appear in the shareable URL; they are not a record of your actual game activity.</p>'+
      '</details><a href="#features">Explore the full content tracker →</a><a href="#suggestions">Suggest a topic for Catch Up →</a></footer></main>';
    document.getElementById('catchUpWhen').options[0].textContent='Not sure';
    document.getElementById('catchUpWhen').options[1].textContent='A week ago';
    document.getElementById('catchUpWhen').options[2].textContent='A month ago';
    document.getElementById('catchUpWhen').options[3].textContent='Pick a date';
    document.getElementById('catchUpWhen').value=mode;document.getElementById('catchUpRole').value=state.role;
    document.getElementById('catchUpDepth').value=state.depth;
    document.getElementById('catchUpDepth').addEventListener('change',e=>{
      state.depth=e.target.value;showAll=state.depth==='detailed';
      document.getElementById('catchUpMessage').textContent='';
      document.getElementById('catchUpShareFallback').hidden=true;
      syncURL();renderResults();
    });
    document.getElementById('catchUpWhen').addEventListener('change',e=>{mode=e.target.value;document.getElementById('catchUpDateLabel').hidden=mode!=='custom';applyFilters();});
    document.getElementById('catchUpRole').addEventListener('change',applyFilters);
    document.getElementById('catchUpDate').addEventListener('change',applyFilters);
    document.getElementById('catchUpShare').addEventListener('click',copyLink);
    document.getElementById('catchUpMore').addEventListener('click',()=>{showAll=!showAll;renderResults();});
    renderResults();
  }
  function show() {
    readRoute();
    if(data){render();return;}
    host.innerHTML='<main class="cu-main"><header class="cu-heading"><span class="section-kicker">Catch Up</span><h1 tabindex="-1">Back after a break?</h1></header><p role="status">'+(failed?'The catch-up guide could not load. Please try again.':'Loading the reviewed gameplay guide…')+'</p>'+(failed?'<button type="button" id="catchUpRetry">Try again</button>':'')+'</main>';
    document.getElementById('catchUpRetry')?.addEventListener('click',load);
    if(!loading&&!failed)load();
  }
  async function load() {
    if(loading)return;loading=true;failed=false;
    if(!host.classList.contains('hidden'))show();
    try {
      const response=await fetch(dataURL,{cache:'no-cache'});if(!response.ok)throw Error('Guide unavailable');const value=await response.json();
      if(value.schema_version!==2||!Array.isArray(value.topics)||!value.topics.length||!Array.isArray(value.sources)||!validDay(value.coverage_through)||value.topics.some(t=>!t.overview||!t.context||!Array.isArray(t.baselines)||!Array.isArray(t.changes)||t.changes.some(c=>!c.before||!c.after)||!Array.isArray(t.issues)))throw Error('Guide invalid');
      data=value;if(!host.classList.contains('hidden'))show();
    } catch (_) {failed=true;if(!host.classList.contains('hidden'))show();}
    finally {loading=false;}
  }
  window.HLLVCatchUp={show,hash,receiveFeed(value){feed=value;feedReceived=true;reviewState();}};
  document.addEventListener('DOMContentLoaded',()=>{if(location.hash.split('?')[0]==='#catch-up')show();});
})();
