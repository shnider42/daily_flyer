(() => {
  'use strict';
  const root = document.getElementById('vinyl-app');
  if (!root) return;
  const $ = (selector) => root.querySelector(selector);
  const storageKey = 'daily-flyer-vinyl-collection-v1';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  let records = [];
  let shuffleOffset = 0;
  let quickMatches = [];
  let quickChosen = [];
  let quickAlbums = [];
  try { records = validateCollection(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
  catch { records = []; }

  function validateCollection(value) {
    if (!Array.isArray(value) || value.length > 200) throw new Error('Import a collection of at most 200 records.');
    return value.map(item => {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string' || typeof item.artist !== 'string' || !item.title.trim() || !item.artist.trim()) throw new Error('A record needs an artist and title.');
      const string = (key, limit=120) => String(item[key] || '').slice(0, limit);
      const credits = Array.isArray(item.credits) ? item.credits.slice(0, 300).filter(c => c && typeof c.name === 'string' && c.name.trim()).map(c => ({
        id: typeof c.id === 'string' ? c.id.slice(0, 80) : null,
        name: String(c.name).slice(0, 120), role: String(c.role || 'Credit').slice(0, 80),
        track: String(c.track || '').slice(0, 120), source: safeUrl(c.source || '')
      })) : [];
      return {id:string('id',80) || `manual-${crypto.randomUUID()}`, title:string('title'), artist:string('artist'), date:string('date',20),
        country:string('country',40), label:string('label',100), catalog:string('catalog',80), barcode:string('barcode',80),
        formats:Array.isArray(item.formats) ? item.formats.slice(0,8).map(f => String(f).slice(0,40)) : [],
        source:safeUrl(item.source), manual:Boolean(item.manual), credits};
    });
  }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(records)); } catch { status('Browser storage is full. Export your collection to keep a copy.', true); } }
  function status(message, error=false) { const el = $('#vinyl-status'); el.textContent = message; el.classList.toggle('error', error); }
  function editionMeta(record) {
    return [record.date, record.country, (record.formats || []).join(' / '), record.label,
      record.catalog && `Cat. ${record.catalog}`, record.barcode && `Barcode ${record.barcode}`].filter(Boolean).map(esc).join(' · ') || 'Edition details not listed';
  }
  function link(url, label) { const href = safeUrl(url); return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : ''; }
  async function getJson(url) {
    const response = await fetch(url, {headers:{'Accept':'application/json'}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || (response.status === 400 ? 'Check the artist, title or release ID.' : 'The catalog is unavailable right now.'));
    return data;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not read those records right now.');
    return data;
  }
  function quickStatus(message, error=false) { const el=$('#vinyl-quick-status');el.textContent=message;el.classList.toggle('error',error); }
  function albumYear(album) { return album.first_year || album.date?.slice(0,4) || ''; }
  function creditLine(appearance) { return `${appearance.role}${appearance.track ? ` on “${appearance.track}”` : ''}`; }
  function renderPicks() {
    const titles=['First record','Second record'];
    $('#vinyl-quick-picks').hidden=false;
    $('#vinyl-quick-picks').innerHTML=`<div class="vinyl-pick-grid">${quickMatches.map((matches,slot)=>`<section class="vinyl-pick-slot"><h3>${titles[slot]}</h3>
      ${matches.length ? `<p>Which ${slot ? 'second ' : ''}record did you mean?</p><div class="vinyl-pick-options">${matches.map(item=>`<button type="button" data-quick-slot="${slot}" data-quick-id="${esc(item.id)}" aria-pressed="${quickChosen[slot] === item.id}">
        <strong>${esc(item.title)}</strong><span>${esc(item.artist)}${item.year ? ` · ${esc(item.year)}` : ''} · ${esc(item.type)}</span></button>`).join('')}</div>` : '<p>No album match. Try a shorter title or check the spelling.</p>'}
      </section>`).join('')}</div>${quickChosen.every(Boolean) && quickChosen.length === quickMatches.length ? '<button type="button" id="vinyl-tell-story">Tell me the story →</button>' : ''}`;
  }
  $('#vinyl-quick-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');
    const titles=[form.elements.first.value.trim(),form.elements.second.value.trim()].filter(Boolean);
    if (!titles.length) return;
    button.disabled=true;quickStatus('Finding the records and their artists…');
    $('#vinyl-quick-picks').hidden=true;$('#vinyl-quick-story').hidden=true;
    try {
      quickMatches=[];quickChosen=[];
      for (const title of titles) {
        const data=await getJson(`/api/vinyl/albums?${new URLSearchParams({title})}`);
        quickMatches.push(data.albums);quickChosen.push(data.albums[0]?.id || null);
      }
      renderPicks();quickStatus(quickChosen.every(Boolean) ? 'Check the album and artist, then open the story.' : 'One title needs a better match. Try a shorter album name.');
    } catch(error) {quickStatus(error.message,true);}
    finally {button.disabled=false;}
  });
  $('.vinyl-examples').addEventListener('click',event=>{
    const button=event.target.closest('[data-example]');if (!button) return;
    $('#vinyl-quick-form').elements.first.value=button.dataset.example;
    $('#vinyl-quick-form').elements.second.value='';$('#vinyl-quick-form').requestSubmit();
  });
  $('#vinyl-quick-picks').addEventListener('click',async event=>{
    const option=event.target.closest('[data-quick-id]');
    if (option) {quickChosen[Number(option.dataset.quickSlot)]=option.dataset.quickId;renderPicks();return;}
    if (!event.target.closest('#vinyl-tell-story')) return;
    const button=$('#vinyl-tell-story');button.disabled=true;quickStatus('Reading the record credits. This can take a few seconds…');
    try {
      const result=await postJson('/api/vinyl/explore',{album_ids:quickChosen});
      quickAlbums=result.albums;renderPublicStory(result);
      $('#vinyl-quick-story').hidden=false;
      quickStatus(result.albums.length === 2 ? `${result.connections.length} documented musician link${result.connections.length===1?'':'s'} found. Explore the story below.` : `Found ${result.albums[0].credits.length} credited roles and ${result.other_albums.length} documented links to other records.`);
      $('#vinyl-quick-story').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    } catch(error) {quickStatus(error.message,true);button.disabled=false;}
  });

  function albumPanel(album,index) {
    const people=new Map();
    for (const c of album.credits) {
      if (c.role==='Artist') continue;
      const key=c.id || c.name;
      if (!people.has(key)) people.set(key,{name:c.name,credits:[]});
      people.get(key).credits.push(c);
    }
    const entries=[...people.values()].sort((a,b)=>b.credits.length-a.credits.length);
    const trackPeople=new Map();
    for (const c of album.credits) if (c.track && c.role!=='Artist') {
      if (!trackPeople.has(c.track)) trackPeople.set(c.track,[]);
      trackPeople.get(c.track).push(c);
    }
    const personnel=(person)=>`<li><strong>${esc(person.name)}</strong><span>${person.credits.slice(0,4).map(c=>esc(creditLine(c))).join(' · ')}${person.credits.length>4 ? ` · ${person.credits.length-4} more credits` : ''}</span></li>`;
    const track=(name)=>`<li><strong>${esc(name)}</strong><span>${(trackPeople.get(name)||[]).slice(0,5).map(c=>`${esc(c.name)}: ${esc(c.role)}`).join(' · ') || 'No track-specific personnel listed'}</span></li>`;
    return `<article class="vinyl-album-panel"><span class="vinyl-story-label">RECORD ${index+1} · ${esc(albumYear(album) || 'YEAR NOT LISTED')}</span>
      <h3>${esc(album.title)}</h3><p class="vinyl-album-by">${esc(album.artist)} · ${album.tracks.length} cataloged tracks · ${entries.length} named collaborators</p>
      <p>The catalog lists a first release ${album.first_year ? `in ${esc(album.first_year)}` : 'without a date'}. We read ${esc(album.date || 'an undated')} ${esc((album.formats||[]).join(' / ') || 'edition')}${album.label ? ` on ${esc(album.label)}` : ''}${album.credit_sources?.length>1 ? ', plus another cataloged edition for fuller credits' : ''}. ${link(album.source,'View this edition')} ${album.credit_sources?.length>1 ? link(album.credit_sources[1],'Additional credit source') : ''} ${link(album.album_source,'Album overview')}</p>
      <button type="button" class="quiet" data-save-album="${esc(album.id)}">Save this edition to my shelf +</button>
      <div class="vinyl-inside-head"><h4>People inside the sleeve</h4><span>${entries.length} names</span></div>
      <ul class="vinyl-credit-map">${entries.slice(0,7).map(personnel).join('')}</ul>
      ${entries.length>7 ? `<details><summary>See all ${entries.length} credited people</summary><ul class="vinyl-credit-map">${entries.slice(7).map(personnel).join('')}</ul></details>` : ''}
      <div class="vinyl-inside-head"><h4>Track-by-track</h4><span>${album.tracks.length} songs</span></div>
      <ul class="vinyl-credit-map">${album.tracks.slice(0,5).map(track).join('')}</ul>
      ${album.tracks.length>5 ? `<details><summary>See the remaining tracks</summary><ul class="vinyl-credit-map">${album.tracks.slice(5).map(track).join('')}</ul></details>` : ''}
    </article>`;
  }
  function renderPublicStory(result) {
    const {albums,connections,other_albums:other}=result, two=albums.length===2;
    const lead=two ? `<strong>${connections.length} documented people in common.</strong> ${connections.length ? `They appear in the credits for both “${esc(albums[0].title)}” and “${esc(albums[1].title)}”.` : 'The catalog does not yet document a shared musical credit on these selected editions. The sleeve maps below show what is listed.'}` :
      `<strong>One record, plenty of doors to open.</strong> Follow the guest musicians, producers and song credits on “${esc(albums[0].title)}”, then see where else some of them appear.`;
    const overlap=connections.length ? `<div class="vinyl-public-overlap"><div class="vinyl-inside-head"><h3>The people who connect them</h3><span>${connections.length} links</span></div>
      ${connections.slice(0,5).map((c,i)=>`<article class="vinyl-public-link"><span class="vinyl-story-label">CONNECTION ${i+1}</span><h4>${esc(c.person)}</h4>
        <p>On <strong>${esc(c.first.album)}</strong>: ${esc(creditLine(c.first))}. On <strong>${esc(c.second.album)}</strong>: ${esc(creditLine(c.second))}.</p>
        <div class="vinyl-release-meta">${link(c.first.source,'First credit')} · ${link(c.second.source,'Second credit')}</div>
        <button type="button" class="quiet" data-quiz-person="${esc(c.person)}">Make it a trivia question ↗</button></article>`).join('')}
      ${connections.length>5 ? `<details><summary>See the other ${connections.length-5} connections</summary>${connections.slice(5).map(c=>`<article class="vinyl-public-link"><h4>${esc(c.person)}</h4><p>${esc(c.first.album)}: ${esc(creditLine(c.first))}. ${esc(c.second.album)}: ${esc(creditLine(c.second))}.</p><div>${link(c.first.source,'First credit')} · ${link(c.second.source,'Second credit')}</div></article>`).join('')}</details>` : ''}</div>` : '';
    const outside=other.length ? `<div class="vinyl-public-overlap"><div class="vinyl-inside-head"><h3>Follow a name to another record</h3><span>${other.length} trails</span></div>
      ${other.map(item=>`<article class="vinyl-public-link"><span class="vinyl-story-label">ANOTHER RECORD ${item.other_year ? `· ${esc(item.other_year)}` : ''}</span><h4>${esc(item.person)} → ${esc(item.other_title)}</h4>
        <p>${esc(item.person)} is credited for ${esc(creditLine(item.on_this))} on <strong>${esc(item.on_this.album)}</strong>, and for ${esc(item.other_role)} on <strong>${esc(item.other_title)}</strong>${item.other_artist ? ` by ${esc(item.other_artist)}` : ''}.</p>
        <div class="vinyl-release-meta">${link(item.on_this.source,'This record')} · ${link(item.other_source,'The other record')}</div>
        <button type="button" class="quiet" data-quiz-person="${esc(item.person)}">Make it a trivia question ↗</button></article>`).join('')}</div>` : '';
    $('#vinyl-quick-story').innerHTML=`<header class="vinyl-story-open"><span class="vinyl-story-label">${two?'TWO RECORDS · ONE CREDIT MAP':'ONE RECORD · MANY THREADS'}</span>
      <h2>${two ? `${esc(albums[0].title)} <span>&</span> ${esc(albums[1].title)}` : esc(albums[0].title)}</h2><p>${lead}</p>
      <p class="vinyl-release-meta">These stories use named credits on a representative cataloged edition, sometimes supplemented by a second edition of the same album. Some musicians and pressings are missing from the catalog; an absent link is not proof that none exists.</p></header>
      ${overlap}${outside}<div class="vinyl-public-albums">${albums.map(albumPanel).join('')}</div>`;
  }
  $('#vinyl-quick-story').addEventListener('click',event=>{
    const save=event.target.closest('[data-save-album]');
    if (save) {
      const album=quickAlbums.find(r=>r.id===save.dataset.saveAlbum);
      if (!album) return;
      if (records.some(r=>r.id===album.id)) return quickStatus('That edition is already on your shelf.');
      if (records.length>=200) return quickStatus('Your shelf is full. Export a copy first.',true);
      const exact={...album,credits:album.credits.filter(c=>c.source===album.source)};
      records.push(validateCollection([exact])[0]);persist();render();$('#vinyl-collector').open=true;
      quickStatus(`Saved ${album.title} to your shelf below.`);return;
    }
    const quiz=event.target.closest('[data-quiz-person]');if (!quiz) return;
    const article=quiz.closest('.vinyl-public-link'),name=quiz.dataset.quizPerson;
    article.querySelector('h4').innerHTML='Who played on both? <span class="vinyl-quiz-answer" hidden>'+esc(name)+'</span>';
    const p=article.querySelector('p');p.hidden=true;
    quiz.outerHTML='<button type="button" class="quiet vinyl-public-reveal">Reveal answer ↗</button>';
  });
  $('#vinyl-quick-story').addEventListener('click',event=>{
    const reveal=event.target.closest('.vinyl-public-reveal');if (!reveal) return;
    const article=reveal.closest('.vinyl-public-link');article.querySelector('.vinyl-quiz-answer').hidden=false;article.querySelector('p').hidden=false;reveal.remove();
  });

  $('#vinyl-search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button');
    const artist = form.elements.artist.value.trim(), title = form.elements.title.value.trim(), catalog = form.elements.catalog.value.trim();
    if (!artist || !title) return;
    button.disabled = true; status('Looking up editions…');
    $('#vinyl-results').hidden = true;
    try {
      const data = await getJson(`/api/vinyl/search?${new URLSearchParams({artist,title,catalog})}`);
      const results = $('#vinyl-results'); results.hidden = false;
      results.innerHTML = `<h3>Pick the edition on your shelf</h3><p class="vinyl-release-meta">Label, catalog number, year and format help distinguish pressings. Open a MusicBrainz release to inspect it before adding.</p>
        <div class="vinyl-results-list">${data.releases.map(r => `<button type="button" class="vinyl-result" data-release-id="${esc(r.id)}"><span class="vinyl-release-meta">${esc(r.artist)}</span><strong>${esc(r.title)}</strong><span class="vinyl-release-meta">${editionMeta(r)}</span></button>`).join('')}</div>`;
      status(data.releases.length ? `${data.releases.length} editions found. Select your exact one.` : 'No editions found. Try a shorter title or add the record from its sleeve.');
    } catch (error) { status(error.message, true); }
    finally { button.disabled = false; }
  });

  $('#vinyl-results').addEventListener('click', async event => {
    const button = event.target.closest('[data-release-id]'); if (!button) return;
    const id = button.dataset.releaseId;
    if (records.some(r => r.id === id)) return status('That exact edition is already on your shelf.');
    button.disabled = true; status('Reading credited musicians and guests…');
    try {
      const record = await getJson(`/api/vinyl/release/${encodeURIComponent(id)}`);
      records.push(validateCollection([record])[0]); persist(); render();
      $('#vinyl-results').hidden = true;
      status(`Added ${record.title}. ${record.credits.length} credited roles found; add sleeve credits if some are missing.`);
    } catch (error) { status(error.message, true); button.disabled = false; }
  });

  $('#vinyl-manual-open').addEventListener('click', () => { const section = $('#vinyl-manual'); section.hidden = !section.hidden; if (!section.hidden) section.querySelector('input').focus(); });
  $('#vinyl-manual-form').addEventListener('submit', event => {
    event.preventDefault(); const form=event.currentTarget;
    const artist=form.elements.artist.value.trim(), title=form.elements.title.value.trim();
    if (!artist || !title) return;
    records.push({id:`manual-${crypto.randomUUID()}`,manual:true,artist,title,date:form.elements.year.value.trim(),catalog:form.elements.catalog.value.trim(),
      label:'',country:'',barcode:'',formats:['Vinyl (from sleeve)'],source:'',credits:[]});
    persist();render();form.reset();$('#vinyl-manual').hidden=true;status(`Added ${title}. Open “Sleeve credits” to enter guests and musicians.`);
  });

  function renderCollection() {
    $('#vinyl-count').textContent = `${records.length} record${records.length === 1 ? '' : 's'}`;
    $('#vinyl-collection').innerHTML = records.length ? records.map(r => `<article class="vinyl-entry" data-id="${esc(r.id)}">
      <div class="vinyl-release-meta">${esc(r.artist)} · ${r.manual ? 'From sleeve' : 'MusicBrainz edition'}</div>
      <h4>${esc(r.title)}${r.date ? ` <span>/${esc(r.date.slice(0,4))}</span>` : ''}</h4>
      <div class="vinyl-release-meta">${editionMeta(r)} · ${r.credits.length} credited role${r.credits.length === 1 ? '' : 's'}</div>
      <div class="vinyl-release-meta">${link(r.source,'View edition')}</div>
      <div class="vinyl-record-actions"><button type="button" class="quiet" data-action="credits">Sleeve credits +</button><button type="button" class="quiet" data-action="remove">Remove</button></div>
      <div class="vinyl-credit-editor" hidden><strong>Add a musician, guest vocalist or producer</strong>
        <div class="vinyl-credit-list">${r.credits.filter(c => !c.id).map((c,i) => `<div class="vinyl-credit-row">${esc(c.name)} · ${esc(c.role)}${c.track ? ` on ${esc(c.track)}` : ''} ${link(c.source,'Source')} <button type="button" data-action="delete-credit" data-credit-index="${i}">×</button></div>`).join('')}</div>
        <form class="vinyl-form vinyl-credit-form"><label>Name<input name="name" maxlength="120" required></label><label>Role<input name="role" maxlength="80" required placeholder="e.g. guest vocals"></label>
          <label>Song (optional)<input name="track" maxlength="120"></label><label>Credit source (optional)<input name="source" type="url" placeholder="https://..."></label><button type="submit">Add credit</button></form>
      </div></article>`).join('') : '<p class="vinyl-empty">Your shelf is empty. Search for a record or add one from its sleeve.</p>';
  }
  $('#vinyl-collection').addEventListener('click', event => {
    const entry=event.target.closest('.vinyl-entry'); if (!entry) return;
    const record=records.find(r => r.id === entry.dataset.id); if (!record) return;
    const button=event.target.closest('[data-action]'); if (!button) return;
    if (button.dataset.action === 'credits') { const editor=entry.querySelector('.vinyl-credit-editor'); editor.hidden=!editor.hidden; if (!editor.hidden) editor.querySelector('input').focus(); }
    if (button.dataset.action === 'remove') { records=records.filter(r => r.id !== record.id);persist();render();status(`Removed ${record.title}.`); }
    if (button.dataset.action === 'delete-credit') {
      const manual=record.credits.filter(c => !c.id)[Number(button.dataset.creditIndex)];
      if (manual) { record.credits.splice(record.credits.indexOf(manual),1);persist();render();status('Sleeve credit removed.'); }
    }
  });
  $('#vinyl-collection').addEventListener('submit', event => {
    if (!event.target.matches('.vinyl-credit-form')) return;
    event.preventDefault(); const form=event.target, entry=form.closest('.vinyl-entry'), record=records.find(r => r.id === entry.dataset.id);
    const source=form.elements.source.value.trim(); if (source && !safeUrl(source)) return status('Use an http or https source link.',true);
    record.credits.push({id:null,name:form.elements.name.value.trim(),role:form.elements.role.value.trim(),track:form.elements.track.value.trim(),source:safeUrl(source)});
    persist();render();status(`Added a sleeve credit to ${record.title}.`);
    const refreshed=[...$('#vinyl-collection').querySelectorAll('.vinyl-entry')].find(el => el.dataset.id === record.id);
    if (refreshed) refreshed.querySelector('.vinyl-credit-editor').hidden=false;
  });

  function stories() {
    const people=new Map();
    const officialByName=new Map();
    for (const record of records) for (const credit of record.credits) if (credit.id) {
      const name=credit.name.trim().toLocaleLowerCase(), ids=officialByName.get(name) || new Set();
      ids.add(credit.id); officialByName.set(name,ids);
    }
    for (const record of records) for (const credit of record.credits) {
      const name=credit.name.trim().toLocaleLowerCase(), known=officialByName.get(name);
      const key=credit.id ? `mb:${credit.id}` : known?.size === 1 ? `mb:${[...known][0]}` : `manual:${name}`;
      if (!key || key === 'manual:') continue;
      if (!people.has(key)) people.set(key, {name:credit.name, verified:true, appearances:[]});
      const person=people.get(key); person.verified=person.verified && Boolean(credit.id);
      person.appearances.push({record,credit});
    }
    const connections=[];
    for (const person of people.values()) {
      const byRecord=[...new Set(person.appearances.map(a => a.record.id))];
      if (byRecord.length < 2) continue;
      if (person.appearances.every(a => a.credit.role === 'Artist')) continue;
      const first=person.appearances.find(a => a.record.id === byRecord[0]);
      const second=person.appearances.find(a => a.record.id === byRecord[1]);
      connections.push({person,first,second,count:byRecord.length});
    }
    connections.sort((a,b) => (b.person.verified - a.person.verified) || (b.count-a.count) || a.person.name.localeCompare(b.person.name));
    const cards=connections.slice(0,20).map(item => {
      const {person,first,second,count}=item;
      const evidence=(a) => `${a.credit.role}${a.credit.track ? ` on “${a.credit.track}”` : ''}`;
      return {kind:person.verified ? 'Crossover · Catalog credit' : 'Possible crossover · Sleeve entry',
        title:`${person.name} turns up twice`, text:`${first.record.artist} — ${first.record.title}: ${evidence(first)}. ${second.record.artist} — ${second.record.title}: ${evidence(second)}.${count>2 ? ` Also appears on ${count-2} other record(s).` : ''}`,
        sources:link(first.credit.source || first.record.source,first.record.title)+' · '+link(second.credit.source || second.record.source,second.record.title),
        quiz:person.name, verified:person.verified};
    });
    for (const record of records) {
      const guest=record.credits.find(c => /vocal|instrument|performer|producer/i.test(c.role) && c.role !== 'Artist' && c.track);
      if (guest) cards.push({kind:guest.id ? 'Song credit · Catalog' : 'Song credit · Sleeve entry',title:`Listen for ${guest.name}`,text:`On “${guest.track}” from ${record.title}, credited for ${guest.role.toLowerCase()}.`,sources:link(guest.source || record.source,'See credit')});
      if (record.catalog) cards.push({kind:'Pressing detail',title:`Look for ${record.catalog}`,text:`${record.title} has catalog number ${record.catalog}${record.label ? ` on ${record.label}` : ''}. Compare the physical label and runout before identifying an exact pressing.`,sources:link(record.source,'See edition')});
    }
    return cards;
  }
  function renderStories() {
    const all=stories();
    const shown=all.length ? Array.from({length:Math.min(8,all.length)},(_,i)=>all[(i+shuffleOffset)%all.length]) : [];
    $('#vinyl-discoveries').innerHTML=shown.length ? shown.map(card => `<article class="vinyl-story"><span class="vinyl-story-label">${esc(card.kind)}</span>
      <h4>${card.quiz ? '<span class="vinyl-quiz-hidden">Who turns up twice?</span><span class="vinyl-quiz-answer" hidden>'+esc(card.title)+'</span>' : esc(card.title)}</h4>
      <p ${card.quiz ? 'class="vinyl-quiz-detail" hidden' : ''}>${esc(card.text)}</p><div class="vinyl-release-meta">${card.sources}</div>
      ${card.quiz ? '<button class="quiet vinyl-reveal" type="button">Reveal name ↗</button>' : ''}</article>`).join('') : '<p class="vinyl-empty">Add two records with credited people to see shared musicians. A record with song credits or catalog details also makes its own story.</p>';
  }
  $('#vinyl-discoveries').addEventListener('click', event => {
    const button=event.target.closest('.vinyl-reveal'); if (!button) return;
    const article=button.closest('.vinyl-story');article.querySelector('.vinyl-quiz-hidden').hidden=true;article.querySelector('.vinyl-quiz-answer').hidden=false;article.querySelector('.vinyl-quiz-detail').hidden=false;button.remove();
  });
  $('#vinyl-shuffle').addEventListener('click', () => {shuffleOffset++;renderStories();});
  $('#vinyl-export').addEventListener('click', () => {
    const blob=new Blob([JSON.stringify(records,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download='sleeve-notes-collection.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status(`Exported ${records.length} records.`);
  });
  $('#vinyl-import-file').addEventListener('change', async event => {
    const file=event.target.files[0]; if (!file) return;
    try { if (file.size>2_000_000) throw new Error('Collection file is too large.');
      const incoming=validateCollection(JSON.parse(await file.text()));
      const existing=new Set(records.map(r=>r.id)), additions=incoming.filter(r=>!existing.has(r.id));
      if (records.length + additions.length > 200) throw new Error('The shelf can hold up to 200 records.');
      records.push(...additions);
      persist();render();status(`Imported collection. Your shelf now has ${records.length} records.`);
    } catch(error) { status(error.message || 'That collection file could not be read.',true); }
    finally { event.target.value=''; }
  });
  function render() {renderCollection();renderStories();}
  render();
})();
