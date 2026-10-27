(function (root) {
  'use strict';
  const FORMATS = ['all','casual','commander','standard','modern','pioneer','limited','historic','timeless','brawl','alchemy'];
  const DIGITAL = ['historic','timeless','brawl','alchemy'];
  const TOPICS = ['all','rules','formats','mechanics','sets','digital'];
  const YEARS = ['2008','2012','2017','2019','2021','2024','2025','2026'];
  const labels = {all:'All ways to play',casual:'Casual tabletop',commander:'Commander',standard:'Standard',modern:'Modern',pioneer:'Pioneer',limited:'Draft & Sealed',historic:'Historic',timeless:'Timeless',brawl:'Brawl',alchemy:'Alchemy'};
  const topics = {rules:'Rules changed',formats:'Format changes',mechanics:'Card mechanics',sets:'Packs & sets',digital:'MTG Arena'};
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
  }
  function localDay() {
    const d = new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function normalize(raw, today = localDay()) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const pick = (name, allowed, fallback) => allowed.includes(r[name]) ? r[name] : fallback;
    const when = pick('when',['all','custom',...YEARS],'all');
    let since = when === 'custom' && validDay(r.since) && r.since >= '1993-01-01' && r.since <= today ? r.since : '';
    if (YEARS.includes(when)) since = when + '-01-01';
    return {when,since,format:pick('format',FORMATS,'all'),platform:pick('platform',['all','paper','arena'],'all'),depth:pick('depth',['overview','context','detailed'],'overview'),topic:pick('topic',TOPICS,'all'),order:pick('order',['essentials','newest','oldest'],'essentials'),q:typeof r.q === 'string' ? r.q.trim().slice(0,80) : ''};
  }
  function compatible(state) {
    return !(state.platform === 'paper' && DIGITAL.includes(state.format)) && !(state.platform === 'arena' && ['commander','modern','casual'].includes(state.format));
  }
  function selectStories(stories, state) {
    if (!compatible(state)) return [];
    const q = state.q.toLocaleLowerCase();
    return stories.filter(s => (!state.since || s.date >= state.since) &&
      (state.format === 'all' || s.formats.includes('all') || s.formats.includes(state.format)) &&
      (state.platform === 'all' || s.platform === 'both' || s.platform === state.platform) &&
      (state.topic === 'all' || s.category === state.topic) &&
      (!q || [s.title,s.summary,s.before,s.after,s.context,...s.terms].join(' ').toLocaleLowerCase().includes(q))
    ).sort((a,b) => {
      if (state.order === 'newest') return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
      if (state.order === 'oldest') return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
      const score = s => s.priority - (state.format !== 'all' && s.formats.includes(state.format) ? 2 : 0) + (state.format === 'all' && s.platform === 'arena' ? 2 : 0);
      return score(a) - score(b) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
    });
  }
  function safeURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'magic.wizards.com' && !u.username && !u.password ? u.href : ''; } catch (_) {return '';}
  }
  function sharedState(hash, today) {
    try {
      if (!hash.startsWith('#view=')) return null;
      return normalize(JSON.parse(decodeURIComponent(hash.slice(6))),today);
    } catch (_) { return null; }
  }
  function shareHash(state) {return '#view=' + encodeURIComponent(JSON.stringify(normalize(state)));}
  function coverageMessage(data, state, count) {
    if (!compatible(state)) return 'That format and platform do not go together. Commander and Modern are not Arena formats; Historic, Timeless, Brawl, and Alchemy are Arena choices. Change either selection.';
    if (state.when === 'custom' && !state.since) return 'Choose a valid past date. Showing the full edition until a date is selected.';
    if (state.since > data.coverage_through) return 'Your selected period is beyond the latest included milestone (22 September 2026). This edition has no reviewed entries for that period; it does not mean nothing changed.';
    if (count === 0) return 'No entries in this selected edition match all your choices. Broaden a filter to explore the available coverage; no matches does not mean no changes.';
    if (state.since && state.since < data.coverage_from) return 'This edition begins in June 2009. Earlier changes are not covered. The entries below are selected milestones, not a complete account of your time away.';
    return 'Selected milestones, not every change. Latest included milestone: 22 September 2026. Sources checked: 27 October 2026. Open any entry’s evidence for its dates.';
  }
  const api = {validDay,normalize,selectStories,safeURL,sharedState,shareHash,compatible,coverageMessage};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  const doc = root.document;
  const $ = id => doc.getElementById(id);
  const themeToggle = $('theme-toggle');
  if (themeToggle) {
    // Theme stays separate from reading filters, progress, and shared links.
    const setTheme = theme => {
      doc.documentElement.dataset.theme = theme;
      themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
      doc.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111e1c' : '#f4f0e6';
    };
    setTheme(doc.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    themeToggle.hidden = false;
    themeToggle.addEventListener('click', () => {
      const theme = doc.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(theme);
      try { root.localStorage.setItem('dfe-magic-theme-v1', theme); } catch (_) {}
    });
  }
  const esc = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey = 'dfe-magic-catch-up-v1';
  const readKey = 'dfe-magic-caught-up-v1';
  let data, state, read = new Set(), expanded = false, allMatches = [];
  let canStore = true;
  function restore(key) {try {return JSON.parse(root.localStorage.getItem(key));} catch (_) {canStore=false; return null;}}
  function save() {
    try { root.localStorage.setItem(storageKey,JSON.stringify(state)); root.localStorage.setItem(readKey,JSON.stringify([...read])); } catch (_) {canStore=false;}
  }
  const dateLabel = date => new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  function evidence(id) {
    const s = data.sources.find(x => x.id === id);
    const href = s && safeURL(s.url);
    if (!href) return '';
    return '<li><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+' ↗</a><small>'+esc(s.publisher)+' · '+(s.published_at ? 'Published '+dateLabel(s.published_at) : 'Maintained reference; publication date not supplied')+' · Checked '+dateLabel(s.checked_at)+'</small></li>';
  }
  function article(s) {
    const open = state.depth !== 'overview' ? ' open' : '';
    const checked = read.has(s.id);
    const status = ['Upcoming','Announced schedule','Decision recorded'].includes(s.status) ? '<span class="status-tag">'+esc(s.status)+(s.status==='Upcoming'?' · at edition date':'')+'</span>' : '';
    const scope = s.formats.includes('all') ? 'Across formats' : s.formats.map(f=>labels[f]).join(' / ');
    const termLinks = s.terms.map(id => {const t=data.glossary.find(x=>x.id===id);return t?'<a class="term-link" href="#term-'+esc(id)+'">'+esc(t.term)+'</a>':'';}).join('');
    const deeper = '<div class="context-copy"><b>A little more context</b>'+esc(s.context)+'</div><div class="editorial"><b>Why it matters · our explanation</b>'+esc(s.meaning)+'</div>';
    return '<article class="story'+(checked?' read':'')+'" id="story-'+esc(s.id)+'"><div class="story-date">'+s.date.slice(0,4)+'<small>'+esc(dateLabel(s.date).replace(/, \d{4}/,''))+'<br>'+esc(s.date_kind)+'</small></div><div class="story-body"><div class="story-kicker"><span>'+esc(topics[s.category])+'</span>'+status+'</div><h3>'+esc(s.title)+'</h3><p class="story-summary">'+esc(s.summary)+'</p><div class="story-visual" aria-label="Change at a glance"><span>'+esc(s.visual[0])+'</span><i aria-hidden="true">→</i><span>'+esc(s.visual[1])+'</span></div>'+(s.id==='london'?'<p class="visual-note">* Example after one non-free mulligan.</p>':'')+'<details class="story-details"'+open+'><summary>Then → now'+(state.depth==='overview'?' · understand the change':'')+'</summary><div class="before-after"><div><b>Before</b><p>'+esc(s.before)+'</p></div><div><b>After this change</b><p>'+esc(s.after)+'</p></div></div>'+(state.depth==='detailed'?deeper:'<details class="story-details"><summary>Go a little deeper</summary>'+deeper+'</details>')+(s.effective_on?'<p class="visual-note">'+(s.status==='Upcoming'?'Planned effective date: ':'Effective date noted in this entry: ')+esc(dateLabel(s.effective_on))+'. Platform differences, where applicable, are explained above.</p>':'')+'<div class="terms">'+termLinks+'</div></details><details class="story-sources"'+(state.depth==='detailed'?' open':'')+'><summary>Official evidence · '+s.source_ids.length+' source'+(s.source_ids.length===1?'':'s')+'</summary><ul class="evidence-list">'+s.source_ids.map(evidence).join('')+'</ul></details><div class="story-bottom"><button class="read-toggle" type="button" data-read="'+esc(s.id)+'" aria-pressed="'+checked+'">'+(checked?'✓ Caught up':'I’ve got this ✓')+'</button><small class="reader-note">'+esc(scope)+'</small></div></div></article>';
  }
  function controls() {
    for (const key of ['when','format','platform','order']) $(key).value=state[key];
    $('since').value=state.since;
    $('since').max=localDay();
    $('date-label').hidden=state.when!=='custom';
    $('search').value=state.q;
    doc.querySelectorAll('[data-depth]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.depth===state.depth)));
    doc.querySelectorAll('[data-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topic===state.topic)));
    const dateNote = YEARS.includes(state.when) ? 'Set names are approximate memory anchors: this view starts on 1 January '+state.when+'.' : 'Dates select the changes. Depth adjusts the explanation; it never hides eligible changes.';
    $('choice-note').textContent=dateNote+(canStore?'':' Browser storage is unavailable; your choices work for this visit.');
  }
  function progress() {
    const n=allMatches.filter(s=>read.has(s.id)).length;
    $('reading-progress').textContent=allMatches.length ? n+' of '+allMatches.length+' matching changes marked as caught up' : '';
  }
  function render() {
    controls();
    allMatches=selectStories(data.stories,state);
    const shown=expanded ? allMatches : allMatches.slice(0,3);
    $('view-label').textContent=labels[state.format]+(state.since?' · from '+dateLabel(state.since):' · the big picture');
    $('results-title').textContent=allMatches.length ? (expanded ? 'Your selected catch-up.' : 'Start with these changes.') : 'There’s a gap in this edition.';
    $('result-count').textContent=shown.length+' of '+allMatches.length+' matching changes';
    $('coverage-message').textContent=coverageMessage(data,state,allMatches.length);
    $('stories').innerHTML=shown.length?shown.map(article).join(''):'<div class="empty"><h3>'+(!compatible(state)?'Check the format and platform.':'No matching entries here yet.')+'</h3><p>'+esc(coverageMessage(data,state,0))+'</p><button type="button" class="secondary" id="clear-filters">Explore the full edition ↗</button></div>';
    $('more').hidden=allMatches.length<=3;
    $('more').textContent=expanded?'Show the first three ↑':'See '+(allMatches.length-3)+' more changes ↓';
    $('more').setAttribute('aria-expanded',String(expanded));
    progress();
  }
  function update(change) {
    $('share-fallback').hidden=true;$('share-status').textContent='';
    state=normalize({...state,...change});expanded=false;save();render();
    // Keep a shared URL accurate without adding a history entry for every choice.
    if (root.location.hash.startsWith('#view=')) {
      try {root.history.replaceState(null,'',shareHash(state));} catch (_) {}
    }
  }
  function glossary() {
    $('glossary').innerHTML=data.glossary.map(t=>'<details id="term-'+esc(t.id)+'"><summary>'+esc(t.term)+'</summary><p>'+esc(t.definition)+' <a href="'+esc(safeURL(data.sources.find(s=>s.id===t.source_id).url))+'" target="_blank" rel="noopener noreferrer">Official reference ↗</a></p></details>').join('');
    $('source-count').textContent=data.sources.length+' official references';
    $('source-list').innerHTML=data.sources.map(s=>'<div class="source-entry"><a href="'+esc(safeURL(s.url))+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+' ↗</a><small>'+esc(s.publisher)+'<br>'+(s.published_at?'Published '+dateLabel(s.published_at):'Maintained reference')+'<br>Checked '+dateLabel(s.checked_at)+'</small></div>').join('');
  }
  function reset() {$('share-fallback').hidden=true;$('share-status').textContent='';state=normalize({});expanded=false;save();render();if(root.location.hash.startsWith('#view='))try{root.history.replaceState(null,'',root.location.pathname+root.location.search+'#catch-up');}catch(_){} }
  function bind() {
    $('when').addEventListener('change',e=>update({when:e.target.value,since:''}));
    $('since').addEventListener('change',e=>{update({since:e.target.value});});
    $('format').addEventListener('change',e=>{const format=e.target.value; update({format,platform:DIGITAL.includes(format)?'arena':state.platform});});
    $('platform').addEventListener('change',e=>update({platform:e.target.value}));
    $('order').addEventListener('change',e=>update({order:e.target.value}));
    $('search').addEventListener('input',e=>{const start=e.target.selectionStart;update({q:e.target.value});if(start!==null) $('search').setSelectionRange(start,start);});
    doc.querySelectorAll('[data-depth]').forEach(b=>b.addEventListener('click',()=>update({depth:b.dataset.depth})));
    doc.querySelectorAll('[data-topic]').forEach(b=>b.addEventListener('click',()=>update({topic:b.dataset.topic})));
    $('more').addEventListener('click',()=>{const was=expanded;expanded=!expanded;render();if(was)$('results-title').scrollIntoView({block:'start'});});
    $('reset').addEventListener('click',reset);
    $('format-help-button').addEventListener('click',()=>{const shown=$('format-help').hidden;$('format-help').hidden=!shown;$('format-help-button').setAttribute('aria-expanded',String(shown));});
    doc.querySelectorAll('[data-choose-format]').forEach(b=>b.addEventListener('click',()=>{update({format:b.dataset.chooseFormat,platform:'all'});$('format-help').hidden=true;$('format-help-button').setAttribute('aria-expanded','false');$('format').focus();}));
    $('stories').addEventListener('click',e=>{
      const b=e.target.closest('[data-read]');
      if(b){const id=b.dataset.read;if(read.has(id))read.delete(id);else read.add(id);save();b.setAttribute('aria-pressed',String(read.has(id)));b.textContent=read.has(id)?'✓ Caught up':'I’ve got this ✓';b.closest('.story').classList.toggle('read',read.has(id));progress();controls();}
      if(e.target.closest('#clear-filters')){reset();$('format').focus();}
      const link=e.target.closest('.term-link');if(link){const target=doc.querySelector(link.getAttribute('href'));if(target)target.open=true;}
    });
    $('share').addEventListener('click',async()=>{
      if(root.location.protocol==='file:'){$('share-status').textContent='Open a hosted copy to share a working link. A local file path works only on this device.';return;}
      const url=new URL(root.location.href);url.hash=shareHash(state);
      try {await root.navigator.clipboard.writeText(url.href);$('share-status').textContent='Link copied. Your reading marks are private and are not included.';}
      catch(_){$('share-fallback').hidden=false;$('share-url').value=url.href;$('share-url').focus();$('share-url').select();$('share-status').textContent='Copy the link above. Your reading marks are not included.';}
    });
    root.addEventListener('hashchange',()=>{const from=sharedState(root.location.hash);if(from){state=from;expanded=false;save();render();$('catch-up').scrollIntoView();}const id=root.location.hash.slice(1);if(id.startsWith('term-')){const target=$(id);if(target)target.open=true;}});
  }
  try {
    data=JSON.parse($('mtg-data').textContent);
    if(!Array.isArray(data.stories)||!Array.isArray(data.sources)) throw new Error('Invalid edition');
    state=sharedState(root.location.hash)||normalize(restore(storageKey));
    const savedRead=restore(readKey);
    if(Array.isArray(savedRead))read=new Set(savedRead.filter(id=>data.stories.some(s=>s.id===id)));
    glossary();bind();render();
    $('controls').hidden=false;$('interactive').hidden=false;$('fallback').hidden=true;
    if(root.location.hash.startsWith('#term-')) {const t=$(root.location.hash.slice(1));if(t)t.open=true;}
  } catch(error) {
    // Keep the server-rendered, sourced introduction readable on any failure.
    $('controls').hidden=true;$('interactive').hidden=true;$('fallback').hidden=false;
    $('fallback').querySelector('.fallback-intro').textContent='The interactive view could not load. These reviewed changes and official sources are still available.';
    if(root.console)root.console.error('Magic Catch Up initialization failed',error);
  }
})(typeof window !== 'undefined' ? window : globalThis);
