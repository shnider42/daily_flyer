/* Instrument Journey v1. Framework-free; intentionally isolated from gj-* state. */
(() => {
  'use strict';
  const root = document.getElementById('ij-app');
  if (!root) return;
  const catalog = JSON.parse(root.querySelector('#ij-catalog').textContent);
  const instruments = catalog.instruments;
  const sources = catalog.sources;
  const byId = new Map(instruments.map(m => [m.id, m]));
  const main = root.querySelector('#ij-main');
  const notice = root.querySelector('#ij-notice');
  const STORE = 'dailyflyer.instrument_journey.v1';
  const PASSPORT_FIELDS = ['nickname', 'serial', 'year', 'strings', 'tuning', 'modifications'];
  const VIEWS = ['overview', 'journey', 'gigbag', 'workbench'];
  const LOG_FIELDS = ['date', 'type', 'title', 'notes', 'strings', 'tuning', 'relief', 'action', 'humidity'];
  let filter = 'all';
  let pendingImport = null;
  let signalPosition = 1;
  let neckAdded = false;
  let blend = 50;
  let currentModel = null;
  let nextSvgId = 0;
  let loadWarning = '';
  let storageConflict = false;
  const emptyState = () => ({app: 'instrument-journey', version: 1, rack: [], passports: {}, logs: {}});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const href = (m, view = 'overview', node = '') => `#/${m.id}/${view}${node ? '/' + node : ''}`;
  const validDate = text => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const d = new Date(text + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
  };
  function cleanText(value, limit) {
    if (typeof value !== 'string' || value.length > limit) throw new Error('A text field is invalid or too long.');
    return value;
  }
  function validateState(input) {
    if (!input || input.app !== 'instrument-journey' || input.version !== 1 || !Array.isArray(input.rack)) throw new Error('This is not a supported Instrument Journey backup.');
    if (!input.passports || typeof input.passports !== 'object' || Array.isArray(input.passports) || !input.logs || typeof input.logs !== 'object' || Array.isArray(input.logs)) throw new Error('Missing passport or journey data.');
    const out = emptyState();
    if (input.rack.length > 5 || input.rack.some(id => typeof id !== 'string' || !byId.has(id))) throw new Error('Unknown instrument in rack.');
    out.rack = [...new Set(input.rack)];
    for (const [id, passport] of Object.entries(input.passports)) {
      if (!byId.has(id) || !passport || typeof passport !== 'object' || Array.isArray(passport)) throw new Error('Unknown or invalid instrument passport.');
      out.passports[id] = {};
      for (const field of PASSPORT_FIELDS) {
        if (Object.hasOwn(passport, field)) out.passports[id][field] = cleanText(passport[field], field === 'modifications' ? 2000 : 150);
      }
    }
    let count = 0;
    for (const [id, entries] of Object.entries(input.logs)) {
      if (!byId.has(id) || !Array.isArray(entries) || entries.length > 500) throw new Error('Invalid journey entries.');
      out.logs[id] = entries.map(entry => {
        if (!entry || typeof entry !== 'object' || !validDate(entry.date)) throw new Error('Invalid journey date.');
        const clean = {id: cleanText(entry.id, 100)};
        if (!/^[a-zA-Z0-9_-]+$/.test(clean.id)) throw new Error('Invalid entry identity.');
        for (const field of LOG_FIELDS) clean[field] = cleanText(entry[field] ?? '', field === 'notes' ? 4000 : 180);
        if (!clean.title.trim()) throw new Error('An entry needs a title.');
        count++;
        return clean;
      });
      if (new Set(out.logs[id].map(e => e.id)).size !== out.logs[id].length) throw new Error('Duplicate journey entries.');
    }
    if (count > 1500) throw new Error('Backup has too many entries.');
    return out;
  }
  let state;
  let raw = null;
  try {
    raw = localStorage.getItem(STORE);
  } catch (error) {
    loadWarning = 'Browser storage is unavailable here. The workbench still works; edits last only for this visit unless you export a backup. Car data is untouched.';
  }
  try {
    state = raw ? validateState(JSON.parse(raw)) : emptyState();
  } catch (error) {
    state = emptyState();
    loadWarning = 'Stored instrument data could not be read. No data was changed. A new save may replace unreadable instrument data; keep any existing backup. Car data is untouched.';
  }
  function showNotice(message, tone = 'info') {
    notice.textContent = message;
    notice.dataset.tone = tone;
    notice.hidden = false;
  }
  function persist(success = 'Saved on this browser. Export a backup before moving devices.') {
    if (storageConflict) {
      showNotice('Not written: another tab changed the saved data. Export your in-memory edits, then reload before making more changes.', 'error');
      return false;
    }
    try {
      // Validate at the write boundary too, keeping imports and UI saves equivalent.
      state = validateState(state);
      localStorage.setItem(STORE, JSON.stringify(state));
      showNotice(success);
      return true;
    } catch (error) {
      showNotice('Kept for this visit only: browser storage is blocked, full or unavailable. Export a backup now to keep your changes.', 'error');
      return false;
    }
  }
  const passport = m => state.passports[m.id] || {};
  const displayName = m => passport(m).nickname || m.name;
  const entries = m => [...(state.logs[m.id] || [])].sort((a, b) => b.date.localeCompare(a.date));
  function external(url, label, cls = '') {
    let safe;
    try { safe = new URL(url); } catch { return esc(label); }
    if (safe.protocol !== 'https:') return esc(label);
    return `<a class="${esc(cls)}" href="${esc(safe.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`;
  }
  const sourceLinks = ids => `<div class="ij-sources-inline">${[...new Set(ids)].map(id => external(sources[id].url, sources[id].title)).join('')}</div>`;
  function guitarSVG(m, label = 'Original learning illustration; not a photograph or dimensioned drawing') {
    const u = `ij-g${++nextSvgId}`;
    const lp = m.kind === 'hh';
    const nylon = m.kind === 'nylon';
    const solo = m.kind === 'h';
    const sun = lp || m.kind === 'sss-plus';
    const body = lp ? 'M269 157C247 137 271 100 242 80C216 57 187 78 179 104C162 104 142 77 116 96C90 114 110 146 88 174C46 221 74 280 132 289C186 304 245 287 258 250C269 223 249 202 259 179Z' : nylon ? 'M263 155C251 135 265 111 243 95C220 77 188 92 181 112C163 114 137 92 117 111C99 128 119 155 100 180C61 228 85 279 147 286C201 293 256 270 258 233C260 202 245 183 263 155Z' : 'M274 149C262 132 279 104 265 73C258 58 244 77 232 101L214 127C197 134 184 116 162 119C139 123 140 150 118 167C89 185 75 217 92 247C107 277 142 282 178 279C226 280 257 268 265 236C270 213 250 194 257 175Z';
    const frets = Array.from({length:20}, (_, i) => {const x = 307 + 327 * (1 - Math.pow(0.9439, i + 1)) / (1 - Math.pow(0.9439,20));return `<path d="M${x.toFixed(1)} 150v34" stroke="#b4b2a0" stroke-width="1"/>`;}).join('');
    const strings = Array.from({length:6}, (_,i) => `<path d="M145 ${157 + i*4}L721 ${157+i*4}" stroke="#dad6bd" stroke-opacity=".72" stroke-width="${0.45+i*.12}"/>`).join('');
    const pickup = (x, hum=false) => `<g><rect x="${x}" y="143" width="${hum?25:11}" height="47" rx="3" fill="${solo?'#161a18':lp?'#e7d0a3':'#eee7d3'}" stroke="#87887b"/><path d="M${x+5} 148v36${hum?'m12-36v36':''}" stroke="${lp?'#685c45':'#929084'}" stroke-width="2" stroke-dasharray="2 5"/></g>`;
    const pickups = nylon ? '<path d="M145 141v51" stroke="#d0bd9b" stroke-width="4"/><g fill="#423c2b"><circle cx="202" cy="218" r="3"/><circle cx="217" cy="218" r="3"/><circle cx="232" cy="218" r="3"/></g><path d="M205 230h27m-27 8h27m-27 8h27" stroke="#483d29" stroke-width="3"/>' : solo ? pickup(174,true) : lp ? pickup(177,true)+pickup(250,true) : pickup(180)+pickup(221)+pickup(260);
    const knobs = nylon ? '' : lp ? '<g fill="#bf8c39" stroke="#e3be7a"><circle cx="145" cy="231" r="8"/><circle cx="177" cy="246" r="8"/><circle cx="129" cy="254" r="8"/><circle cx="161" cy="266" r="8"/></g>' : `<g fill="${solo?'#161b18':'#eee7d3'}" stroke="#9f9e8f"><circle cx="218" cy="219" r="7"/><circle cx="197" cy="238" r="7"/>${solo?'':'<circle cx="174" cy="251" r="7"/>'}</g>`;
    const tuners = (lp || nylon) ? Array.from({length:3}, (_,i)=>`<g fill="#bbc0b5" stroke="#a9af9f"><circle cx="${662+i*21}" cy="138" r="5"/><circle cx="${662+i*21}" cy="195" r="5"/><path d="M${662+i*21} 138v18m0 23v16" stroke-width="2"/></g>`).join('') : Array.from({length:6}, (_,i)=>`<circle cx="${661+i*11}" cy="${143-i*2}" r="5" fill="#bbc0b5"/><path d="M${661+i*11} ${143-i*2}v15" stroke="#bbb" stroke-width="2"/>`).join('');
    return `<svg class="ij-guitar-svg" viewBox="45 50 700 265" role="img" aria-label="${esc(m.short + ': ' + label)}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="${u}-body"><stop stop-color="${sun?'#d6a14e':nylon?'#c9ab79':solo?'#3c403b':m.accent}"/><stop offset=".68" stop-color="${sun?'#a66531':nylon?'#b59761':solo?'#222522':m.accent}"/><stop offset="1" stop-color="${sun?'#4a2d1e':nylon?'#8c704c':solo?'#0e1310':'#296569'}"/></radialGradient><linearGradient id="${u}-neck" x2="0" y2="1"><stop stop-color="#d6bb81"/><stop offset="1" stop-color="#af8c57"/></linearGradient></defs><ellipse cx="182" cy="292" rx="119" ry="13" fill="#080a0866"/><path d="${body}" fill="url(#${u}-body)" stroke="${lp?'#d2b783':'#ffffff38'}" stroke-width="${lp?3:2}"/>${!lp&&!nylon?`<path d="M249 128L278 140L279 192L229 247L174 250L193 209L164 193L171 144L212 135Z" fill="${solo?'#131813':'#dedaca'}" stroke="#aaa997" stroke-width="1"/>`:''}<rect x="271" y="146" width="380" height="41" rx="3" fill="url(#${u}-neck)"/><rect x="273" y="151" width="370" height="31" fill="${m.id==='player-mexico'?'#ceac73':'#493b2e'}"/>${frets}<g fill="${m.id==='player-mexico'?'#544634':'#d7c5a2'}"><circle cx="362" cy="167" r="2.3"/><circle cx="423" cy="167" r="2.3"/><circle cx="477" cy="167" r="2.3"/><circle cx="527" cy="162" r="2"/><circle cx="527" cy="173" r="2"/><circle cx="569" cy="167" r="2"/></g><path d="M643 146L701 127Q728 122 734 143L720 186L695 190L645 180Z" fill="${lp?'#28231d':'#c7aa75'}" stroke="#e4cd984f"/>${tuners}<path d="M645 148v36" stroke="#eee2c6" stroke-width="4"/><rect x="137" y="143" width="18" height="48" rx="2" fill="${nylon?'#49372a':'#b3b4aa'}" stroke="#d7d1b0"/>${lp?'<rect x="113" y="145" width="10" height="46" rx="4" fill="#b3b4aa"/>':''}${pickups}${knobs}${strings}${!nylon&&!solo&&!lp?'<path d="M152 186L125 238L89 247" fill="none" stroke="#c1c3b9" stroke-width="3"/>':''}<ellipse cx="119" cy="216" rx="8" ry="13" fill="#a8ada0" transform="rotate(30 119 216)"/></svg>`;
  }
  function media(m, controls = true) {
    return `<div class="ij-media"><div class="ij-photo">${guitarSVG(m)}<img src="${esc(m.photo)}" alt="${esc(m.photo_credit)}" decoding="async" loading="eager" referrerpolicy="no-referrer"></div><span class="ij-photo-label" data-photo-label>${esc(m.photo_credit)}</span>${controls?`<div class="ij-media-tools">${external(m.photo_source,'Photo source / model reference')}<button type="button" data-action="art-mode" aria-pressed="false">Show illustration</button></div>`:''}</div>`;
  }
  function bindImageStates() {
    main.querySelectorAll('.ij-photo img').forEach(img => {
      const fail = () => {
        img.dataset.failed = 'true';
        const box = img.closest('.ij-media');
        box.querySelector('[data-photo-label]').textContent = 'Photo unavailable • original learning illustration shown; not a photograph.';
        const btn = box.querySelector('[data-action="art-mode"]');
        if (btn) {btn.disabled=true;btn.textContent='Illustration fallback';}
      };
      img.addEventListener('error', fail, {once:true});
      if (img.complete && img.naturalWidth === 0) fail();
    });
  }
  function saveButton(m) {
    const saved = state.rack.includes(m.id);
    return `<button type="button" class="ij-save" data-action="rack" data-id="${m.id}" aria-pressed="${saved}" aria-label="${saved?'Remove':'Add'} ${esc(m.short)} ${saved?'from':'to'} my rack">${saved?'✓ In my rack':'+ My rack'}</button>`;
  }
  function renderRack() {
    currentModel = null;
    root.dataset.instrument = ''; root.dataset.view = 'rack'; root.dataset.node = '';
    root.style.setProperty('--ij-accent','#cfb483');
    const lead = instruments[0];
    const shown = filter === 'mine' ? instruments.filter(m => state.rack.includes(m.id)) : instruments;
    main.innerHTML = `<section class="ij-home-hero"><div class="ij-home-copy"><span class="ij-kicker">Your instruments, understood.</span><h1>Every instrument.<br>Its own story.</h1><p>The guitar you play. The parts you depend on. The work that keeps it yours.</p><div class="ij-actions"><a class="ij-button" href="${href(lead,'workbench')}">Explore the workbench <span aria-hidden="true">↗</span></a><a class="ij-text-button" href="#ij-collection">Choose your guitar ↓</a></div><span class="ij-small">Five distinct guitars. Real references. Your own records.</span></div><div class="ij-hero-art"><span class="ij-kicker">ON THE BENCH / MEXICAN PLAYER SSS</span>${media(lead,false)}<div class="ij-hero-art-bottom"><span>Strings → setup → signal → story</span><span class="ij-stamp" aria-hidden="true">01</span></div></div></section>
      <section id="ij-collection"><div class="ij-section-heading"><div><span class="ij-kicker">The guitar room</span><h2>Pick a starting point.</h2></div><div class="ij-filterbar" aria-label="Instrument collection filter"><button type="button" data-action="filter" data-filter="all" aria-pressed="${filter==='all'}">All five</button><button type="button" data-action="filter" data-filter="mine" aria-pressed="${filter==='mine'}">My rack (${state.rack.length})</button></div></div><div class="ij-rack">${shown.length?shown.map((m)=>`<article class="ij-rack-item" style="--ij-accent:${m.accent}"><div class="ij-rack-item-top"><span class="ij-kicker">${esc(m.brand)} / ${esc(m.short)}</span><span class="ij-number">0${instruments.indexOf(m)+1}</span></div><a class="ij-open-art" href="${href(m)}" aria-label="Open ${esc(m.name)}">${media(m,false)}</a><h3><a href="${href(m)}">${esc(m.name)}</a></h3><p class="ij-small">${esc(m.identity)}</p><div class="ij-actions"><a class="ij-text-button" href="${href(m)}">Open instrument ↗</a>${saveButton(m)}</div></article>`).join(''):'<p class="ij-empty">Your rack is empty. Choose “All five”, then add the instruments you own or want to follow. Nothing is added automatically.</p>'}</div></section>
      <div class="ij-daily"><span aria-hidden="true">↳</span><div><span class="ij-kicker">A useful starting habit</span><h3>${esc(catalog.steps[catalog.focus].title)}</h3><p class="ij-small">${esc(catalog.steps[catalog.focus].text)}</p></div><a href="${href(lead,'journey')}">Record a baseline ↗</a></div>
      <section class="ij-method" aria-label="The workbench method">${catalog.steps.map((s,i)=>`<div><b>0${i+1} / ${esc(s.title)}</b><p>${esc(s.text)}</p></div>`).join('')}</section>
      <details><summary>What gets saved? What is a reference?</summary><p>${esc(catalog.disclaimer)} Manufacturer/dealer photographs are linked and credited, not photos of your instrument. Technical illustrations are original learning maps, not dimensioned repair drawings.</p><p>“My rack” and journey data use a separate storage key from Garage Journey. Browser deletion clears local records. Other users on the same browser profile can read them.</p><div class="ij-actions" style="margin-top:15px"><button type="button" class="ij-secondary" data-action="export">Export instrument backup</button><button type="button" class="ij-secondary" data-action="import">Import backup</button></div></details>`;
    document.title = 'Instrument Journey — The guitar room';
    bindImageStates();
  }
  function renderDetail(m, view, selectedNode) {
    if (currentModel !== m.id) {signalPosition=1;neckAdded=false;blend=50;}
    currentModel = m.id;
    root.dataset.instrument = m.id; root.dataset.view = view; root.dataset.node = view === 'workbench' ? (m.nodes.find(n=>n.id===selectedNode)||m.nodes[0]).id : '';
    root.style.setProperty('--ij-accent',m.accent);
    const labels = {overview:'Overview',journey:'Journey',gigbag:'Gig bag',workbench:'Workbench'};
    main.innerHTML = `<div class="ij-crumb"><a href="#/rack">← Guitar room</a><span>/</span><span>${esc(m.short)}</span><span>/ ${labels[view]}</span></div><section class="ij-detail-hero"><div>${media(m)}</div><div class="ij-detail-copy"><span class="ij-kicker">${esc(m.brand)} / ${esc(m.identity)}</span><h1>${esc(displayName(m))}</h1><p>${esc(m.tagline)}</p><span class="ij-small">${esc(m.finish)} · Representative profile; your serial and condition are not yet verified.</span><div class="ij-actions">${saveButton(m)}<button type="button" class="ij-text-button" data-action="print">Print this view</button></div></div></section><nav class="ij-tabs" aria-label="Instrument sections">${VIEWS.map(v=>`<a href="${href(m,v)}" ${v===view?'aria-current="page"':''}>${labels[v]}</a>`).join('')}</nav><section id="ij-view" tabindex="-1">${view==='overview'?overview(m):view==='journey'?journey(m):view==='gigbag'?gigbag(m):workbench(m,selectedNode)}</section>`;
    document.title = `${displayName(m)} / ${labels[view]} — Instrument Journey`;
    bindImageStates();
    if (view==='workbench') renderSignal(m);
    if (view==='gigbag') renderResources(m);
  }
  function field(name, label, value='', opts={}) {
    const wide = opts.wide?' class="ij-wide"':'';
    if (opts.textarea) return `<label${wide}>${esc(label)}<textarea name="${name}" maxlength="${opts.max||2000}" ${opts.required?'required':''}>${esc(value)}</textarea></label>`;
    return `<label${wide}>${esc(label)}<input name="${name}" type="${opts.type||'text'}" value="${esc(value)}" maxlength="${opts.max||150}" ${opts.required?'required':''} ${opts.placeholder?'placeholder="'+esc(opts.placeholder)+'"':''}></label>`;
  }
  function overview(m) {
    const p = passport(m);
    return `<div class="ij-content-grid"><div class="ij-section"><span class="ij-kicker">Know this instrument</span><h2>${esc(m.tagline)}</h2><p class="ij-story">${esc(m.story)}</p><div class="ij-evidence"><strong>Identify before adjusting</strong><ol>${m.identity_checks.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></div>${sourceLinks(m.sources.slice(0,2))}</div><aside class="ij-section"><span class="ij-kicker">Reference configuration / not an inspection</span><dl class="ij-specs">${m.specs.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><a class="ij-button" href="${href(m,'workbench')}">See the parts. Follow a symptom. ↗</a><p class="ij-small">Specs describe the reference family. A used instrument can have a different bridge, harness or pickups. Your saved notes do not authenticate it.</p></aside></div>
    <section class="ij-passport"><span class="ij-kicker">Your instrument passport</span><h2>Make the reference yours.</h2><p class="ij-small">Optional, locally stored details. Leave unknown fields blank rather than guessing. No information is sent to a forum or manufacturer.</p><form id="ij-passport-form" data-id="${m.id}"><div class="ij-form-grid">${field('nickname','Your nickname',p.nickname)}${field('serial','Serial / identification (stored on this browser)',p.serial)}${field('year','Actual year / provenance notes',p.year)}${field('strings','Installed strings / gauge / tension',p.strings)}${field('tuning','Your tuning',p.tuning,{placeholder:'For example: E A D G B E'})}${field('modifications','Known modifications / condition',p.modifications,{textarea:true,max:2000})}</div><div class="ij-actions"><button type="submit">Save passport</button><button type="button" class="ij-secondary" data-action="export">Export backup</button></div></form></section>`;
  }
  function logItem(entry,m) {
    const measurements = [['Strings',entry.strings],['Tuning',entry.tuning],['Relief',entry.relief],['Action',entry.action],['Humidity',entry.humidity]].filter(([,v])=>v);
    return `<article class="ij-log-entry"><time datetime="${esc(entry.date)}">${esc(entry.date)} · ${esc(entry.type)}</time><h3>${esc(entry.title)}</h3>${measurements.length?`<p class="ij-small">${measurements.map(([k,v])=>`${k}: ${esc(v)}`).join(' · ')}</p>`:''}<p>${esc(entry.notes)}</p><button type="button" data-action="delete-entry" data-id="${m.id}" data-entry="${esc(entry.id)}">Delete entry</button></article>`;
  }
  function journey(m) {
    const list = entries(m), p = passport(m);
    return `<div class="ij-content-grid"><section class="ij-section"><span class="ij-kicker">The story so far</span><h2>Every change, remembered.</h2><p class="ij-small">A log of what actually happened — not an automatically completed maintenance checklist. Measurements should include units and where/how you measured.</p>${list.length?`<div class="ij-log">${list.map(e=>logItem(e,m)).join('')}</div>`:'<div class="ij-empty">No entries yet. Start with the current condition, strings and tuning. Nothing has been marked serviced or repaired.</div>'}<div class="ij-actions"><button type="button" class="ij-secondary" data-action="export">Export all instrument data</button><button type="button" class="ij-secondary" data-action="import">Import backup</button></div><p class="ij-small">This browser only. Redeploying does not intentionally reset local records, but clearing site data, changing origin or using another device will not carry them over. Export/import is the transfer path.</p></section><section class="ij-panel"><h3>Add a journey entry</h3><form id="ij-log-form" data-id="${m.id}"><div class="ij-form-grid">${field('date','Date',catalog.today,{type:'date',required:true})}<label>Entry type<select name="type"><option>Baseline</option><option>String change</option><option>Setup / measurement</option><option>Repair / technician</option><option>Playing / recording</option><option>Observation</option></select></label>${field('title','What happened?','',{required:true,wide:true,max:180})}${field('strings','Strings / tension',p.strings)}${field('tuning','Tuning',p.tuning)}${field('relief','Measured relief + units / method','',{placeholder:'For example: measurement at fret 8'})}${field('action','Measured action + units / fret','',{placeholder:'Bass / treble, measurement location'})}${field('humidity','Humidity / environment (optional)')}${field('notes','What changed? What was the result?','',{textarea:true,wide:true,max:4000})}</div><button type="submit">Save entry</button></form></section></div>`;
  }
  function gigbag(m) {
    return `<span class="ij-kicker">Gig bag / documents & trusted starting points</span><h2>The right reference beats a guess.</h2><p class="ij-story" style="margin-top:15px">Factory documents first. Specialist drawings second. Community experience is useful context, not a substitute for the correct model’s instructions.</p><div class="ij-resource-controls"><label>Find a manual, diagram or community<input id="ij-source-search" type="search" placeholder="Try wiring, factory or forum" autocomplete="off"></label><label>Source type<select id="ij-source-kind"><option value="all">All sources</option><option>Factory</option><option>Specialist</option><option>Inspected reference</option><option>Community</option></select></label></div><div id="ij-resources" class="ij-resource-list"></div><div class="ij-evidence" style="margin-top:20px"><strong>When the exact drawing is missing</strong><p>Use the factory source hub and the precise document title in the applicability note. Do not guess a PDF URL or solder from a similar-looking drawing. Availability labels describe this research pass, not a live link monitor.</p></div><details><summary>What to include when asking a forum or technician</summary><p>Model and approximate year; relevant modifications; string set and tuning; the exact symptom; what you already isolated; clear photos of the relevant parts. Redact serial numbers and personal documents in public posts. A forum reply does not authenticate a vintage guitar.</p></details>`;
  }
  function renderResources(m) {
    const target=root.querySelector('#ij-resources');if(!target)return;
    const query=(root.querySelector('#ij-source-search')?.value||'').trim().toLocaleLowerCase();
    const kind=root.querySelector('#ij-source-kind')?.value||'all';
    const found=m.sources.map(id=>sources[id]).filter(s=>(kind==='all'||s.kind===kind)&&[s.title,s.kind,s.scope].join(' ').toLocaleLowerCase().includes(query));
    target.innerHTML=found.length?found.map(s=>`<article class="ij-resource"><span class="ij-resource-tag">${esc(s.kind)}</span><div><h3>${external(s.url,s.title)}</h3><p>${esc(s.scope)}</p><span class="ij-resource-status">${esc(s.status)} · reviewed ${esc(s.checked)}</span></div></article>`).join(''):'<p class="ij-empty">No matching sources for this guitar. Clear the search or change the source type.</p>';
  }
  const positions = {head:[92,44],neck:[57,44],bridge:[14,44],pickups:[27,44],jack:[8,68],body:[23,82]};
  function anatomy(m, nodeId) {
    return `<div class="ij-anatomy"><div class="ij-drawing">${guitarSVG(m,'Numbered component map; original learning illustration')}${m.nodes.map((n,i)=>`<button type="button" class="ij-hotspot" style="left:${positions[n.part][0]}%;top:${positions[n.part][1]}%" data-action="node" data-node="${n.id}" aria-pressed="${n.id===nodeId}" aria-label="${i+1}. ${esc(n.title)}">${i+1}</button>`).join('')}</div></div><p class="ij-small">Tap a numbered part or use the named component links. The drawing explains locations; it is not to scale and is not a repair schematic.</p>`;
  }
  function workbench(m, nodeId) {
    const node=m.nodes.find(n=>n.id===nodeId)||m.nodes[0];
    return `<div class="ij-work-head"><div><span class="ij-kicker">Workbench / ${esc(m.short)}</span><h2>See it. Understand it. Check it.</h2></div><label>Search this workbench<input id="ij-bench-search" type="search" placeholder="Buzz, tuning, no sound…" autocomplete="off"></label></div><div id="ij-bench-results" class="ij-result-list" hidden></div><div class="ij-bench-layout"><nav class="ij-systems" aria-label="Instrument components">${m.nodes.map((n,i)=>`<a href="${href(m,'workbench',n.id)}" ${node.id===n.id?'aria-current="page"':''}><span>0${i+1}</span>${esc(n.title)}</a>`).join('')}</nav><div class="ij-bench-main">${anatomy(m,node.id)}<article id="ij-guide" tabindex="-1"><div class="ij-guide-header"><span class="ij-kicker">${esc(node.id==='electronics'?'Signal & controls':'Component guide')} / ${m.kind==='hh'?'Conservation-first checks':'Observe before adjusting'}</span><h2>${esc(node.title)}</h2><p>${esc(node.what)}</p><div class="ij-symptoms">${node.symptoms.map(s=>`<span>${esc(s)}</span>`).join('')}</div><p class="ij-small">Useful to have: ${esc(node.tools)}</p></div><ol class="ij-checks">${node.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ol><div class="ij-stop"><b>Stop & get help when…</b>${esc(node.stop)}</div>${sourceLinks(node.sources)}<div class="ij-actions" style="margin-top:18px"><a class="ij-button" href="${href(m,'journey')}">Record what you found ↗</a><a href="${href(m,'gigbag')}">Manuals & sources</a></div></article>${node.id==='electronics'?`<section class="ij-signal"><span class="ij-kicker">Interactive learning map</span><h3>Follow the signal.</h3><div id="ij-signal-controls"></div><div id="ij-signal-output" aria-live="polite"></div><p class="ij-small">Conceptual signal flow only. Ground returns, lug orientation, component values and detailed switching contacts are omitted. Do not solder from this map; use the correctly matched source drawing.</p></section>`:''}</div></div><p class="ij-bench-method">${esc(catalog.bench_note)}</p>`;
  }
  function selectedPickups(m) {
    if(m.kind==='h') return ['Bridge humbucker'];
    if(m.kind==='hh') return signalPosition===1?['Bridge PAF']:signalPosition===2?['Neck PAF','Bridge PAF']:['Neck PAF'];
    const values={1:['Bridge'],2:['Bridge','Middle'],3:['Middle'],4:['Middle','Neck'],5:['Neck']};
    const picks=[...values[signalPosition]];
    if(m.kind==='sss-plus'&&neckAdded&&signalPosition<=2) picks.push('Neck');
    return picks;
  }
  function renderSignal(m) {
    const controls=root.querySelector('#ij-signal-controls'),out=root.querySelector('#ij-signal-output');if(!controls||!out)return;
    if(m.kind==='nylon') {
      controls.innerHTML=`<label>Illustrative blend: <span id="ij-blend-label">${blend}% toward body sensing</span><input type="range" id="ij-blend" min="0" max="100" value="${blend}" aria-label="Illustrative blend toward body sensing"></label>`;
    } else if(m.kind==='h') {
      controls.innerHTML='<p class="ij-small">Stock HT H: one pickup, no selector and no factory coil-split control in this reference.</p>';
    } else {
      const opts=m.kind==='hh'?[[1,'Bridge'],[2,'Both'],[3,'Neck']]:[[1,'1 · Bridge'],[2,'2 · Bridge + middle'],[3,'3 · Middle'],[4,'4 · Middle + neck'],[5,'5 · Neck']];
      controls.innerHTML=`<div class="ij-signal-switches" aria-label="Pickup selection">${opts.map(([p,t])=>`<button type="button" data-action="signal" data-position="${p}" aria-pressed="${signalPosition===p}">${esc(t)}</button>`).join('')}</div>${m.kind==='sss-plus'?`<label class="ij-check-label" style="margin-top:15px"><input id="ij-neck-add" type="checkbox" ${neckAdded?'checked':''}>Push-push neck addition (positions 1 & 2)</label>`:''}`;
    }
    updateSignalOutput(m);
  }
  function updateSignalOutput(m) {
    const out=root.querySelector('#ij-signal-output');if(!out)return;
    const stage=(t,small='')=>`<span class="ij-signal-stage">${esc(t)}${small?`<small>${esc(small)}</small>`:''}</span>`;
    const arrow='<span class="ij-signal-arrow" aria-hidden="true">→</span>';
    if(m.kind==='nylon') {
      out.innerHTML=`<div class="ij-signal-map"><div class="ij-pickup-stack"><span class="ij-pickup" data-active="${blend<100}">Undersaddle source</span><span class="ij-pickup" data-active="${blend>0}">Body sensing</span></div>${arrow}${stage('Blend + preamp','Powered electronics')}${arrow}${stage('EQ / volume')}${arrow}${stage('Output')}</div><p class="ij-small">Blend slider is a teaching illustration, not a calibrated gain ratio or a promise of exact end-stop isolation. Verify the installed preamp revision.</p>${sourceLinks(['godin','godin_resources'])}`;
      return;
    }
    const active=selectedPickups(m);
    const all=m.kind==='h'?['Bridge humbucker']:m.kind==='hh'?['Neck PAF','Bridge PAF']:['Neck','Middle','Bridge'];
    const branches=all.map(p=>`<span class="ij-pickup" data-active="${active.includes(p)}">${esc(p)}</span>`).join('');
    let path;
    if(m.kind==='hh') path=stage('Each pickup’s volume','Each has a tone branch')+arrow+stage('3-way selector')+arrow+stage('Output');
    else if(m.kind==='h') path=stage('Volume','Tone branch to ground')+arrow+stage('Output');
    else path=stage('5-way selection',m.kind==='sss-plus'?'Optional neck-add routing':'SSS parallel combinations')+arrow+stage('Volume','Tone network branches')+arrow+stage('Output');
    out.innerHTML=`<p><strong>Active: ${esc(active.join(' + '))}</strong></p><div class="ij-signal-map"><div class="ij-pickup-stack">${branches}</div>${arrow}${path}</div>${m.kind==='hh'?'<p class="ij-small">50s-style relationship: tone capacitor branches from the volume output. This map assumes both volume controls are up; interaction at lower settings depends on the actual harness. An original vintage guitar must be inspected, not rewired from a generalized diagram.</p>':''}${sourceLinks(m.kind==='hh'?['throbak']:m.kind==='sss-plus'?['american']:m.kind==='h'?['squier','fralin']:['fender_service'])}`;
  }
  function route() {
    const raw=location.hash || '#/rack';
    // In-page collection anchors are not application routes.
    if(raw==='#ij-collection'&&currentModel===null)return;
    const parts=raw.replace(/^#\/?/,'').split('/');
    if(parts[0]==='rack'||!parts[0]) renderRack();
    else {
      const m=byId.get(parts[0]);
      if(!m) {renderRack();showNotice('That instrument link is not recognized. The guitar room is shown instead.','error');return;}
      const view=VIEWS.includes(parts[1])?parts[1]:'overview';
      renderDetail(m,view,parts[2]);
    }
  }
  function navigate(hash) {
    if(location.hash===hash)route();else location.hash=hash;
  }
  function downloadBackup() {
    const output={...state,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`instrument-journey-${catalog.today}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button||!root.contains(button))return;
    const action=button.dataset.action;
    const m=byId.get(button.dataset.id||currentModel);
    if(action==='filter') {filter=button.dataset.filter==='mine'?'mine':'all';renderRack();}
    if(action==='rack'&&m) {
      const saved=state.rack.includes(m.id);
      state.rack=saved?state.rack.filter(id=>id!==m.id):[...state.rack,m.id];
      persist(saved?'Removed from your rack. The instrument and its journey entries are still available.':'Added to your rack on this browser.');route();
    }
    if(action==='node'&&m)navigate(href(m,'workbench',button.dataset.node));
    if(action==='signal'&&m) {signalPosition=Number(button.dataset.position);renderSignal(m);}
    if(action==='print')window.print();
    if(action==='export')downloadBackup();
    if(action==='import') {root.querySelector('#ij-import-file').value='';root.querySelector('#ij-import-file').click();}
    if(action==='cancel-import') {pendingImport=null;root.querySelector('#ij-import-dialog').close();}
    if(action==='confirm-import'&&pendingImport) {state=pendingImport;pendingImport=null;root.querySelector('#ij-import-dialog').close();persist('Instrument backup imported on this browser. Car data was not changed.');route();}
    if(action==='delete-entry'&&m&&window.confirm('Delete this journey entry? This does not change any other instrument or car records.')) {
      state.logs[m.id]=(state.logs[m.id]||[]).filter(e=>e.id!==button.dataset.entry);persist('Journey entry deleted.');route();
    }
    if(action==='art-mode') {
      const box=button.closest('.ij-media'),img=box.querySelector('img');
      const on=button.getAttribute('aria-pressed')!=='true';
      img.hidden=on;button.setAttribute('aria-pressed',String(on));button.textContent=on?'Show reference photo':'Show illustration';
      box.querySelector('[data-photo-label]').textContent=on?'Original learning illustration • not a photograph or dimensioned drawing.':img.alt;
    }
  });
  root.addEventListener('input',event=>{
    const m=byId.get(currentModel);if(!m)return;
    if(event.target.id==='ij-source-search')renderResources(m);
    if(event.target.id==='ij-bench-search') {
      const q=event.target.value.trim().toLocaleLowerCase(),box=root.querySelector('#ij-bench-results');
      box.hidden=!q;if(!q)return;
      const found=m.nodes.filter(n=>[n.title,n.what,...n.symptoms,...n.checks].join(' ').toLocaleLowerCase().includes(q));
      box.innerHTML=found.length?found.map(n=>`<a href="${href(m,'workbench',n.id)}">${esc(n.title)} ↗<span class="ij-small" style="display:block">${esc(n.symptoms.join(' · '))}</span></a>`).join(''):'<p class="ij-empty">No matching component. Try “buzz”, “tuning”, “output” or browse the named parts.</p>';
    }
    if(event.target.id==='ij-blend') {blend=Number(event.target.value);root.querySelector('#ij-blend-label').textContent=`${blend}% toward body sensing`;updateSignalOutput(m);}
  });
  root.addEventListener('change',async event=>{
    const m=byId.get(currentModel);
    if(event.target.id==='ij-source-kind'&&m)renderResources(m);
    if(event.target.id==='ij-neck-add'&&m) {neckAdded=event.target.checked;updateSignalOutput(m);}
    if(event.target.id==='ij-import-file') {
      const file=event.target.files[0];if(!file)return;
      try {
        if(file.size>1024*1024)throw new Error('Backup exceeds the 1 MB import limit.');
        const candidate=validateState(JSON.parse(await file.text()));
        pendingImport=candidate;
        const n=Object.values(candidate.logs).reduce((sum,rows)=>sum+rows.length,0);
        root.querySelector('#ij-import-summary').textContent=`This backup contains ${candidate.rack.length} rack selections, ${Object.keys(candidate.passports).length} passports and ${n} journey entries. Existing instrument records will be replaced, not merged.`;
        root.querySelector('#ij-import-dialog').showModal();
      } catch(error) {pendingImport=null;showNotice(`Import rejected. Nothing changed. ${error.message}`,'error');}
    }
  });
  root.addEventListener('submit',event=>{
    const form=event.target;if(!['ij-passport-form','ij-log-form'].includes(form.id))return;
    event.preventDefault();const m=byId.get(form.dataset.id);if(!m)return;
    if(!form.reportValidity())return;
    const data=new FormData(form);
    if(form.id==='ij-passport-form') {
      const p={};PASSPORT_FIELDS.forEach(f=>p[f]=String(data.get(f)||'').trim());
      state.passports[m.id]=p;persist('Passport saved on this browser. Reference specifications are unchanged.');
      // Update the title without replacing the form or stealing keyboard focus.
      root.querySelector('.ij-detail-copy h1').textContent=displayName(m);
      document.title=`${displayName(m)} / Overview — Instrument Journey`;
    } else {
      if(!validDate(String(data.get('date')))) {showNotice('Enter a valid calendar date.','error');return;}
      if((state.logs[m.id]||[]).length>=500 || Object.values(state.logs).reduce((n, rows)=>n+rows.length,0)>=1500) {showNotice('Journey storage has reached its entry limit (500 per instrument / 1500 total). Export a backup before removing old entries.','error');return;}
      const entry={id:typeof crypto.randomUUID==='function'?crypto.randomUUID():`entry-${Date.now()}-${Math.random().toString(36).slice(2,9)}`};
      LOG_FIELDS.forEach(f=>entry[f]=String(data.get(f)||'').trim());
      if(!entry.title) {showNotice('Give the entry a title.','error');return;}
      state.logs[m.id]=[...(state.logs[m.id]||[]),entry];persist('Journey entry saved on this browser.');route();
    }
  });
  root.querySelector('#ij-import-dialog').addEventListener('cancel',()=>pendingImport=null);
  window.addEventListener('hashchange',()=>{
    const previousModel = currentModel;
    route();
    if(location.hash==='#ij-collection') return;
    if(previousModel && previousModel === currentModel) {
      const target = location.hash.split('/').length > 3 ? root.querySelector('#ij-guide') : root.querySelector('#ij-view');
      if(target) {target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'auto'});}
    } else {
      main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'auto'});
    }
  });
  // Cross-tab notification rather than silently clobbering unsaved form input.
  window.addEventListener('storage',event=>{
    if(event.key===STORE) {storageConflict=true;showNotice('Instrument data changed in another tab. New saves here are blocked to prevent overwriting it. Export your in-memory edits, then reload.','error');}
  });
  route();
  if(loadWarning)showNotice(loadWarning,'error');
})();
