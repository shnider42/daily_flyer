/* Reviewed feature records. Collected announcements can flag review needs, never set status. */
(function () {
  'use strict';
  const host = document.getElementById('featuresPage');
  const dataURL = document.getElementById('hllv-features').dataset.source;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {under_consideration:'Under consideration', planned:'Planned', in_development:'In development', testing:'Testing', released:'Released', postponed:'Postponed', cancelled:'Cancelled'};
  const date = value => value ? new Date(value.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}) : 'Not recorded';
  const safe = value => {try {const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && ['www.hellletloose.com','hellletloose.com','steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net'].includes(u.hostname) ? u.href : '';} catch (_) {return '';}};
  let ledger = null, feed = null, feedFailed = false, loading = false, loadFailed = false;
  let query = '', filter = 'all', category = 'all', order = 'newest', selected = '';
  const source = id => ledger.sources.find(s => s.id === id);
  const updated = f => source(f.latest_source_id)?.published_at || '';
  const status = f => '<span class="ft-status ft-status-' + esc(f.status) + '">' + esc(labels[f.status]) + '</span>';
  const sourceLink = s => safe(s?.url) ? '<a href="' + esc(safe(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + ' ↗</a>' : '<span>Source unavailable</span>';
  const featureLink = (f, label) => '<a href="#feature/' + esc(f.id) + '">' + esc(label || f.title) + '</a>';
  function needsReview(post) {
    const reviewed = ledger.sources.find(s => s.announcement_id === post.id);
    return reviewed ? reviewed.content_sha256 !== post.content_sha256 : post.published_at >= ledger.coverage_from;
  }
  function candidates(f) {
    return (feed?.items || []).filter(p => needsReview(p) && ((p.candidate_feature_ids || []).includes(f.id) || ledger.sources.some(s => s.announcement_id === p.id && (f.history.some(e => e.source_id === s.id) || f.current.source_ids.includes(s.id)))));
  }
  function matching() {
    return ledger.features.filter(f => (category === 'all' || f.category === category) && (filter === 'all' || (filter === 'progress' ? ['in_development','testing'].includes(f.status) : f.status === filter)) && (!query || [f.id,f.title,f.category,f.current.summary,f.change,f.target,labels[f.status],...f.history.map(e => e.summary)].join(' ').toLowerCase().includes(query)))
      .sort((a,b) => (order === 'oldest' ? 1 : -1) * updated(a).localeCompare(updated(b)) || a.id.localeCompare(b.id));
  }
  function row(f) {
    return '<a class="ft-row" href="#feature/' + esc(f.id) + '"><span class="ft-row-copy"><span class="ft-meta">' + esc(f.category) + ' · ' + esc(date(updated(f))) + '</span><strong>' + esc(f.title) + '</strong><span>' + esc(f.change) + '</span></span><span class="ft-row-state">' + status(f) + '<small>' + esc(f.target) + '</small>' + (candidates(f).length ? '<small class="ft-review-flag">New evidence to review</small>' : '') + '</span></a>';
  }
  function reviewNotice(f) {
    const posts = f ? candidates(f) : (feed?.items || []).filter(needsReview);
    const stale = !feed?.last_success_at || !Number.isFinite(Date.parse(feed.last_success_at)) || Date.now() - Date.parse(feed.last_success_at) > 36 * 3600000;
    if (feedFailed) return '<p class="ft-review-note">Announcement checks are unavailable. Saved feature statuses remain dated below.</p>';
    if (!feed) return '<p class="ft-meta">Checking for newer announcements…</p>';
    let html = stale || feed.state !== 'ok' ? '<p class="ft-review-note">Announcement collection is overdue or incomplete. Saved records remain available; this is not an all-clear.</p>' : '';
    if (posts.length) html += '<details class="ft-review"><summary>' + posts.length + (f ? ' relevant announcement' : ' announcement') + (posts.length === 1 ? '' : 's') + ' awaiting feature review</summary><p>These are review leads. They do not change a feature’s status. Matching words alone do not establish a connection.</p><ul>' + posts.slice(0,12).map(p => '<li>' + (safe(p.url) ? '<a href="' + esc(safe(p.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(p.title) + ' ↗</a>' : esc(p.title)) + ' · ' + esc(date(p.published_at)) + (ledger.sources.some(s => s.announcement_id === p.id) ? ' · Source text changed since review' : '') + '</li>').join('') + '</ul></details>';
    return html;
  }
  function renderResults() {
    const rows = matching();
    document.getElementById('featureCount').textContent = rows.length + ' shown · ' + ledger.features.length + ' tracked';
    document.getElementById('featureResults').innerHTML = rows.length ? rows.map(row).join('') : '<p class="ft-empty">No matching features. Try another search or filter.</p>';
  }
  function renderIndex() {
    selected = '';
    document.title = 'Content tracker · Infierno Liberado';
    host.innerHTML = '<main class="ft-main"><header class="ft-heading"><span class="section-kicker">The game as it evolves</span><h1 tabindex="-1">Content tracker<span>.</span></h1><p>What’s live, what’s planned, and what’s still being discussed.</p><p class="ft-meta">Reviewed ' + esc(date(ledger.reviewed_at)) + ' · Independent community record</p></header><div class="ft-tools"><label>Search features<input id="featureSearch" type="search" placeholder="Try boats, controls or buildables" value="' + esc(query) + '"></label><label>Latest status<select id="featureStatus"><option value="all">All statuses</option><option value="planned">Planned</option><option value="progress">In development / testing</option><option value="released">Released</option><option value="under_consideration">Under consideration</option><option value="postponed">Postponed</option><option value="cancelled">Cancelled</option></select></label><label>Area<select id="featureCategory"><option value="all">All areas</option>' + [...new Set(ledger.features.map(f=>f.category))].sort().map(c=>'<option>'+esc(c)+'</option>').join('') + '</select></label></div><div class="ft-list-head"><span id="featureCount" role="status" aria-live="polite"></span><label>Evidence date <select id="featureOrder"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div><div id="featureResults"></div><div id="featureReview">' + reviewNotice() + '</div><details class="ft-guide"><summary>How to read these records</summary><p>“In the game” describes the saved live baseline. “Latest status” describes the most recent reviewed change or proposal. A live feature can still have further changes planned.</p><p>Under consideration is not a development commitment. Planned targets can move. Released means the publisher reports it shipped; it does not establish independent gameplay verification.</p><p>' + esc(ledger.coverage_note) + ' Each topic keeps its own evidence date. A collection run or passage of time never advances a status.</p><p>Community suggestions stay private until a site moderator approves publication. That approval is separate from any developer commitment. These official-source summaries follow the tracker’s editorial review process.</p></details></main>';
    document.getElementById('featureStatus').value = filter;
    document.getElementById('featureCategory').value = category;
    document.getElementById('featureOrder').value = order;
    document.getElementById('featureSearch').addEventListener('input', e => {query=e.target.value.toLowerCase();renderResults();});
    document.getElementById('featureStatus').addEventListener('change', e => {filter=e.target.value;renderResults();});
    document.getElementById('featureCategory').addEventListener('change', e => {category=e.target.value;renderResults();});
    document.getElementById('featureOrder').addEventListener('change', e => {order=e.target.value;renderResults();});
    renderResults();
  }
  function renderDetail(f) {
    document.title = f.title + ' · Infierno Liberado';
    const latest = source(f.latest_source_id);
    const history = [...f.history].reverse().map(e => {const s=source(e.source_id);return '<li><time datetime="'+esc(s.published_at)+'">'+esc(date(s.published_at))+'</time><div><strong>'+esc(labels[e.status])+'</strong><p>'+esc(e.summary)+'</p>'+sourceLink(s)+'</div></li>';}).join('');
    const issueLinks = f.related_issue_ids.map(id => '<a href="#'+esc(id)+'">'+esc(id)+' · '+esc(window.HLLVFeatures.issueTitle?.(id)||'Related bug record')+' →</a>').join('');
    const related = f.related_suggestions.map(s => '<p>'+esc(s.title)+' · <a href="#suggestions">View published suggestions →</a></p>').join('');
    host.innerHTML = '<main class="ft-main ft-detail"><a class="ft-back" href="#features">← All features & changes</a><header class="ft-heading"><span class="section-kicker">'+esc(f.id)+' · '+esc(f.category)+'</span><h1 tabindex="-1">'+esc(f.title)+'</h1>'+status(f)+'<p class="ft-meta">Latest evidence '+esc(date(latest.published_at))+' · Reviewed '+esc(date(ledger.reviewed_at))+'</p></header><div class="ft-comparison"><section><h2>In the game</h2><span class="ft-baseline">'+(f.current.availability==='live'?'Publisher-reported live behavior':'Release not confirmed')+'</span><p>'+esc(f.current.summary)+'</p>'+f.current.source_ids.map(id=>sourceLink(source(id))).join(' · ')+'</section><section><h2>Latest direction</h2><p>'+esc(f.change)+'</p><p class="ft-target"><strong>Release / target:</strong> '+esc(f.target)+'</p>'+sourceLink(latest)+'</section></div><div id="featureReview">'+reviewNotice(f)+'</div><section class="ft-history"><h2>How this changed</h2><ol>'+history+'</ol></section><section class="ft-related"><h2>Connected records</h2>'+(issueLinks||'<p>No related bug record is linked.</p>')+'<div class="ft-suggestions">'+(related||'<p>No reviewed connection to a published community suggestion is recorded.</p>')+'<a href="#suggestions">Browse or submit community ideas →</a></div><p class="ft-meta">Related does not mean identical, caused by, fixed by, or approved for development.</p></section><footer class="ft-footer"><p>Independent community summary. Statuses reflect the cited statements; targets are not guarantees. Moderator publication approval is separate from developer approval.</p><details><summary>Source and review details</summary><p>'+esc(ledger.coverage_note)+'</p><ul>'+[...new Set([...f.current.source_ids,...f.history.map(e=>e.source_id)])].map(id=>{const s=source(id);return '<li>'+sourceLink(s)+' · '+esc(s.publisher)+' · Published '+esc(date(s.published_at))+' · Reviewed '+esc(date(s.reviewed_at))+(safe(s.reviewed_via)?' · <a href="'+esc(safe(s.reviewed_via))+'" target="_blank" rel="noopener noreferrer">Publisher text reviewed on Steam ↗</a>':'')+'</li>';}).join('')+'</ul></details></footer></main>';
  }
  function show(id) {
    selected = id || '';
    if (!ledger) {
      host.innerHTML = '<main class="ft-main"><h1>Content tracker</h1><p role="status">'+(loadFailed?'Feature records could not load. Bugs and suggestions remain available.':'Loading reviewed feature records…')+'</p>'+(loadFailed?'<button id="featureRetry" type="button">Try again</button>':'')+'</main>';
      document.getElementById('featureRetry')?.addEventListener('click',load);
      return;
    }
    if (!selected) renderIndex();
    else {
      const f = ledger.features.find(x=>x.id===selected);
      if (f) renderDetail(f);
      else host.innerHTML='<main class="ft-main"><h1>Feature not found</h1><p>This link does not match a published feature record.</p><a href="#features">Browse features & changes →</a></main>';
    }
  }
  function renderLanding() {
    const box = document.getElementById('featureHighlights');if (!box || !ledger) return;
    const chosen = [...ledger.features].sort((a,b)=>updated(b).localeCompare(updated(a))||a.id.localeCompare(b.id)).slice(0,3);
    box.innerHTML = '<div class="ft-preview-head"><div><span class="section-kicker">From the content tracker</span><h2>What’s changing in Vietnam</h2></div><a href="#features">Explore all '+ledger.features.length+' →</a></div><p class="ft-meta">Reviewed '+esc(date(ledger.reviewed_at))+'. Features, content, and gameplay changes — with the status and source behind each.</p>'+chosen.map(row).join('');
  }
  function feedLinks(post) {
    if (!ledger) return '';
    const review = ledger.sources.find(s=>s.announcement_id===post.id);
    const reviewed = review && review.content_sha256===post.content_sha256;
    const matches = ledger.features.filter(f=>reviewed ? (f.history.some(e=>e.source_id===review.id)||f.current.source_ids.includes(review.id)) : (post.candidate_feature_ids||[]).includes(f.id));
    return matches.length ? '<div class="ft-feed-links"><strong>'+(reviewed?'Reviewed feature connections':'Possible feature connections · awaiting review')+'</strong>'+matches.map(f=>featureLink(f)).join('')+'</div>' : '';
  }
  function decorateIssue() {
    if (!ledger) return;
    const summary=document.querySelector('#dossier #summary');if (!summary || summary.querySelector('.ft-issue-links')) return;
    const matches=ledger.features.filter(f=>f.related_issue_ids.includes(location.hash.slice(1)));
    if (!matches.length) return;
    const section=document.createElement('section');section.className='ft-issue-links';section.innerHTML='<h2>Related features & changes</h2>'+matches.map(f=>featureLink(f)).join('')+'<p>Feature plans do not change this bug’s evidence status.</p>';summary.appendChild(section);
  }
  async function load() {
    if (loading) return;loading=true;loadFailed=false;
    if (!host.classList.contains('hidden')) show(selected);
    try {
      const r=await fetch(dataURL,{cache:'no-cache'});if (!r.ok) throw Error('Feature data unavailable');
      const d=await r.json();if(d.schema_version!==1 || !Array.isArray(d.features)||!Array.isArray(d.sources)||d.features.some(f=>!labels[f.status])) throw Error('Invalid feature data');
      ledger=d;renderLanding();decorateIssue();if(!host.classList.contains('hidden')) show(selected);
      document.dispatchEvent(new CustomEvent('hllv-features-ready'));
    } catch (_) {loadFailed=true;if(!host.classList.contains('hidden'))show(selected);const box=document.getElementById('featureHighlights');if(box)box.innerHTML='<h2>Content tracker</h2><p>Feature records could not load. <a href="#features">Open and retry →</a></p>';}
    finally {loading=false;}
  }
  function receiveFeed(d) {
    feed=d;feedFailed=!d;
    if(ledger){const f=ledger.features.find(x=>x.id===selected);const box=document.getElementById('featureReview');if(box)box.innerHTML=reviewNotice(f);if(document.getElementById('featureResults'))renderResults();renderLanding();}
  }
  window.HLLVFeatures={show,feedLinks,receiveFeed};
  document.addEventListener('DOMContentLoaded',()=>{load();new MutationObserver(decorateIssue).observe(document.getElementById('dossier'),{childList:true,subtree:true});});
})();
