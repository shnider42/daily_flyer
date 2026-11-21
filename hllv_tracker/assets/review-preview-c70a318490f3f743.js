/* A browser-local rehearsal. Only the checked-in example JSON is fetched.
   No account SDK, publishing endpoint, or production write is used here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {
    bug: {reported:'Reported',investigating:'Investigating',testing:'In testing',partial:'Partial improvement',shipped:'Fix / change released',monitoring:'Monitoring'},
    feature: {under_consideration:'Under consideration',planned:'Planned',in_development:'In development',released:'Released',cancelled:'Cancelled'}
  };
  const decisions = {pending:'Awaiting review',approved:'Approved in preview',rejected:'Rejected in preview'};
  let data, key, selected, records = {}, filter = 'all', dirty = false;
  const currentItem = () => data.items.find(item => item.id === selected);
  const currentRecord = () => records[selected];
  const visibleItems = () => data.items.filter(item => filter === 'all' || records[item.id].decision === filter);
  const formatDate = date => new Date(date).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  function message(text, error = false) {
    $('previewMessage').textContent = text;
    $('previewMessage').dataset.error = String(error);
  }
  function persist(text) {
    try {
      localStorage.setItem(key,JSON.stringify({version:data.version,records}));
      message(text + ' Saved in this browser.');
    } catch (_) {
      message(text + ' Browser storage is unavailable; this session only. Export to keep a copy.',true);
    }
  }
  function loadRecords() {
    let saved;
    try {saved = JSON.parse(localStorage.getItem(key));} catch (_) {message('Previous practice decisions could not be read. The examples are ready to try again.',true);}
    for (const item of data.items) {
      const record = saved?.version === data.version ? saved.records?.[item.id] : null;
      const valid = record && Object.hasOwn(decisions,record.decision) &&
        Object.hasOwn(labels[item.type],record.proposal?.status) && typeof record.proposal.summary === 'string' &&
        typeof record.note === 'string' && Array.isArray(record.history) &&
        record.history.every(entry => entry && typeof entry.action === 'string' && Number.isFinite(Date.parse(entry.at)) &&
          typeof entry.note === 'string' && typeof entry.proposal?.summary === 'string' && Object.hasOwn(labels[item.type],entry.proposal?.status));
      records[item.id] = valid ? record : {decision:'pending',proposal:{...item.proposed},note:'',history:[]};
    }
  }
  function progress() {
    const count = state => data.items.filter(item => records[item.id].decision === state).length;
    $('reviewProgress').innerHTML = `<strong>${count('pending')} awaiting review</strong> · ${count('approved')} approved · ${count('rejected')} rejected`;
  }
  function queue() {
    const items = visibleItems();
    $('reviewQueue').innerHTML = items.map(item => {
      const record = records[item.id];
      return `<button type="button" class="rp-item" data-item="${escape(item.id)}" data-decision="${record.decision}" aria-current="${item.id === selected}"><span class="rp-item-id">${escape(item.id)} · ${item.type === 'bug' ? 'Bug' : 'Content'}</span><strong>${escape(item.title)}</strong><span class="rp-item-state">${decisions[record.decision]}</span></button>`;
    }).join('') || '<p class="rp-empty">No examples in this view.</p>';
    // Concise native options avoid WebKit's long-option scroll overflow on phones.
    // The full title and current decision remain in the selected-change heading.
    $('reviewPicker').innerHTML = items.map((item,index) => `<option value="${escape(item.id)}" aria-label="${escape(item.title)} — ${decisions[records[item.id].decision]}" ${item.id === selected ? 'selected' : ''}>${index+1}. ${escape(item.short_title || item.title)}</option>`).join('') || '<option>No matching examples</option>';
    $('reviewPicker').disabled = items.length === 0;
  }
  function historyMarkup(item, record) {
    return `<details class="rp-audit"><summary>Practice history (${record.history.length})</summary>${record.history.length ? '<ol>' + [...record.history].reverse().map(entry => `<li><strong>${escape(entry.action)}</strong><time datetime="${escape(entry.at)}">${escape(formatDate(entry.at))}</time><p>${escape(labels[item.type][entry.proposal.status])} · ${escape(entry.proposal.summary)}</p>${entry.note ? `<p>Reviewer note: ${escape(entry.note)}</p>` : ''}</li>`).join('') + '</ol>' : '<p class="rp-source-meta">Your saved drafts and decisions will appear here.</p>'}</details>`;
  }
  function renderDetail(focus = false) {
    const item = currentItem();
    if (!item) {
      $('reviewDetail').innerHTML = '<div class="rp-empty"><h2 tabindex="-1">No examples in this view.</h2><p>Choose another filter to continue.</p></div>';
      if (focus) $('reviewDetail').querySelector('h2').focus({preventScroll:true});
      return;
    }
    const record = currentRecord(), locked = record.decision !== 'pending';
    const route = item.type === 'bug' ? item.id : 'feature/' + item.id;
    $('reviewDetail').innerHTML = `
      <div class="rp-case-meta"><span>${escape(item.id)} · ${item.type === 'bug' ? 'Bug tracker' : 'Content tracker'}</span><span>${escape(item.tag)}</span></div>
      <header class="rp-case-head"><div><h2 tabindex="-1">${escape(item.title)}</h2><a href="./#${escape(route)}" target="_blank" rel="noopener">Open current public record ↗</a></div><span class="rp-decision" data-decision="${record.decision}">${decisions[record.decision]}</span></header>
      <form id="reviewForm">
        <div class="rp-compare">
          <section class="rp-before"><h3>Before this patch review</h3><p class="rp-status">${item.before ? escape(labels[item.type][item.before.status]) : 'Not yet tracked'}</p><p class="${item.before ? '' : 'rp-absent'}">${item.before ? escape(item.before.summary) : 'This proposal would create a new record in the tracker.'}</p></section>
          <section class="rp-proposed"><h3>Proposed update ${locked ? '' : '· editable'}</h3><label for="proposalStatus">Tracker status</label><select id="proposalStatus" ${locked ? 'disabled' : ''}>${Object.entries(labels[item.type]).map(([value,label]) => `<option value="${value}" ${record.proposal.status === value ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select><label for="proposalSummary">Public summary</label><textarea id="proposalSummary" rows="4" maxlength="1600" required ${locked ? 'disabled' : ''}>${escape(record.proposal.summary)}</textarea>${item.target ? `<p class="rp-target">Announced target: ${escape(item.target)}</p>` : ''}</section>
        </div>
        <div class="rp-evidence">
          <section><h3>Official evidence</h3><p>${escape(item.evidence)}</p><p class="rp-source-meta">Source summary · ${escape(data.source.publisher)}<br>Published 21 Oct 2026 · Reviewed 21 Oct 2026<br>${escape(item.locator)}</p><a href="${escape(data.source.url)}" target="_blank" rel="noopener noreferrer">Read the official Patch 1.7 notes ↗</a></section>
          <section><h3>Why this change is proposed</h3><p>${escape(item.reason)}</p><p class="rp-caution">${escape(item.caution)}</p></section>
        </div>
        <label class="rp-note" for="reviewerNote">Reviewer note <span>· required to reject or change the suggested status</span><textarea id="reviewerNote" rows="2" maxlength="1200" ${locked ? 'disabled' : ''}>${escape(record.note)}</textarea></label>
        <p id="formError" class="rp-error" role="alert" hidden></p>
        <div class="rp-actions">${locked ? '<button type="button" class="rp-button" data-action="reopen">Reopen example</button>' : '<button type="submit" class="rp-button rp-button-primary" data-action="approve">Approve example</button><button type="button" class="rp-button" data-action="save">Save draft</button><button type="button" class="rp-button" data-action="reject">Reject example</button>'}<button type="button" class="rp-button" data-action="next" ${data.items.some(other => other.id !== selected && records[other.id].decision === 'pending') ? '' : 'disabled'}>Next awaiting review →</button></div>
      </form>
      ${historyMarkup(item,record)}`;
    dirty = false;
    if (focus) $('reviewDetail').querySelector('h2').focus({preventScroll:true});
  }
  function proposalFromForm() {
    return {status:$('proposalStatus').value,summary:$('proposalSummary').value.trim()};
  }
  function readDraft() {
    const item = currentItem(), record = currentRecord(), proposal = proposalFromForm();
    return {item,record,proposal,note:$('reviewerNote').value.trim()};
  }
  function error(text, field) {
    $('formError').hidden = false;
    $('formError').textContent = text;
    $(field).focus();
    return false;
  }
  function recordAction(action, decision, proposal, note) {
    const record = currentRecord();
    record.history.push({at:new Date().toISOString(),action,proposal:{...proposal},note});
    record.decision = decision; record.proposal = {...proposal}; record.note = note;
    dirty = false;
  }
  function saveDraft(quiet = false) {
    if (!currentItem() || currentRecord().decision !== 'pending') return true;
    const {record,proposal,note} = readDraft();
    if (!proposal.summary) return error('Enter a public summary before continuing.','proposalSummary');
    if (proposal.summary === record.proposal.summary && proposal.status === record.proposal.status && note === record.note) {
      dirty = false;
      if (!quiet) message('No unsaved changes to this example.');
      return true;
    }
    recordAction('Draft saved','pending',proposal,note);
    persist('Draft saved.');
    if (!quiet) renderDetail();
    return true;
  }
  function select(id, focus = true) {
    if (dirty && !saveDraft(true)) return false;
    selected = id; queue(); renderDetail(focus); return true;
  }
  function decide(decision) {
    const {item,record,proposal,note} = readDraft();
    if (record.decision !== 'pending') return;
    if (!proposal.summary) return error('Enter a public summary before making a decision.','proposalSummary');
    if ((decision === 'rejected' || proposal.status !== item.proposed.status) && !note) {
      return error(decision === 'rejected' ? 'Add a reviewer note explaining why you are rejecting this example.' : 'Explain why you changed the suggested status.','reviewerNote');
    }
    recordAction(decision === 'approved' ? 'Approved in preview' : 'Rejected in preview',decision,proposal,note);
    persist(`${item.id} ${decision} in the preview. Nothing was published.`);
    if (!visibleItems().some(other => other.id === selected)) selected = visibleItems()[0]?.id;
    progress(); queue(); renderDetail(true);
  }
  function exportReview() {
    if (dirty && !saveDraft(true)) return;
    const exportData = {preview_only:true,publishes_records:false,version:data.version,exported_at:new Date().toISOString(),source:data.source,baseline_commit:data.baseline_commit,reviewed_commit:data.reviewed_commit,items:data.items.map(item => ({...item,practice_review:records[item.id]}))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)+'\n'],{type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'infierno-patch-1-7-practice-review.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
    message('Practice review exported. It includes your drafts and decision history; nothing was published.');
  }
  async function init() {
    const source = new URL($('reviewPreviewScript').dataset.source,location.href);
    if (source.origin !== location.origin) throw Error('The example data must be served from this site.');
    const response = await fetch(source);
    if (!response.ok) throw Error('Example data could not be loaded.');
    data = await response.json();
    if (data.version !== 'patch17-v1' || !Array.isArray(data.items) || data.items.length !== 6) throw Error('Unexpected example data.');
    key = 'hllv-review-preview:' + data.version;
    loadRecords(); selected = data.items[0].id;
    $('previewLoading').hidden = true; $('reviewWorkspace').hidden = false;
    progress(); queue(); renderDetail();
    $('reviewQueue').addEventListener('click',event => {const button = event.target.closest('[data-item]');if (button) select(button.dataset.item);});
    $('reviewPicker').addEventListener('change',event => {if (!select(event.target.value)) event.target.value = selected;});
    $('reviewFilter').addEventListener('change',event => {
      if (dirty && !saveDraft(true)) {event.target.value = filter;return;}
      filter = event.target.value;
      const matches = visibleItems();
      if (!matches.some(item => item.id === selected)) selected = matches[0]?.id;
      queue(); renderDetail();
    });
    $('reviewDetail').addEventListener('input',event => {if (event.target.matches('textarea,select')) dirty = true;});
    $('reviewDetail').addEventListener('change',event => {if (event.target.matches('textarea,select')) dirty = true;});
    $('reviewDetail').addEventListener('submit',event => {event.preventDefault();decide('approved');});
    $('reviewDetail').addEventListener('click',event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'save') saveDraft();
      if (action === 'reject') decide('rejected');
      if (action === 'reopen') {
        const record = currentRecord();recordAction('Reopened for review','pending',record.proposal,record.note);
        persist('Example reopened; its history is retained.');
        if (!visibleItems().some(other => other.id === selected)) selected = visibleItems()[0]?.id;
        progress();queue();renderDetail(true);
      }
      if (action === 'next') {
        if (dirty && !saveDraft(true)) return;
        const start = data.items.findIndex(item => item.id === selected);
        const next = [...data.items.slice(start+1),...data.items.slice(0,start)].find(item => records[item.id].decision === 'pending');
        if (next) {filter = 'all';$('reviewFilter').value = 'all';select(next.id);}
      }
    });
    $('exportReview').addEventListener('click',exportReview);
    window.addEventListener('beforeunload',event => {if (dirty) {event.preventDefault();event.returnValue = '';}});
  }
  init().catch(error => {
    $('previewLoading').textContent = 'The review preview could not load. Reload to try again, or return to the tracker.';
    message(error.message,true);
  });
})();
