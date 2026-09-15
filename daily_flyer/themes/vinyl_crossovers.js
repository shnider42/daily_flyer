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
