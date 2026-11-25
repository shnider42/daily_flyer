import {parseDelimited, parseImportTable, parseImportText, detectColumns, inferStatus} from './importers.mjs';
import {readXlsx} from './xlsx-reader.mjs';
import {reviewImport, applyImport} from './import-model.mjs';
import {safeUrl} from './model.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states = {inbox:'Inbox',next:'Next',doing:'In progress',waiting:'Waiting',done:'Done',someday:'Someday'};
const providers = {auto:'Detect from file',clickup:'ClickUp',monday:'Monday',slack:'Slack',teams:'Microsoft Teams',onenote:'OneNote',text:'Other text',csv:'Spreadsheet'};
const columnFields = {title:'Task title',notes:'Description / notes',status:'Status',priority:'Priority',due:'Due date',url:'Task link',itemId:'Task / item ID',assignee:'Owner / assignee',parentId:'Parent item ID'};
const matchLabels = {new:'New',unchanged:'Already imported',changed:'Source changed',possible:'Possible match',conflict:'Review changes'};
const options = (entries, selected) => entries.map(([value,label])=>`<option value="${esc(value)}"${String(value)===String(selected)?' selected':''}>${esc(label)}</option>`).join('');
const clone = value => structuredClone(value);

/** One review flow for all readers. The only durable write is applyImport inside commit. */
export function createImportController({store,render,onImported=()=>{}}) {
  const dialog = document.querySelector('#external-import-dialog');
  const $ = selector => dialog.querySelector(selector);
  let session = null, opener = null, generation = 0;
  const fresh = defaults => ({step:'input',mode:'file',provider:'auto',text:'',scope:'',sourceUrl:'',referenceDate:'',dateOrder:'mdy',file:null,fileName:'',workbook:null,sheetIndex:0,table:null,columnMap:{},parsed:null,rows:[],statusMap:{},area:defaults.area,projectId:defaults.projectId||'',error:'',busy:false,revision:store.state.revision});

  function shell(body, footer) {
    dialog.innerHTML=`<div class="dialog-top"><div><h2 id="external-import-title">Import work</h2><p class="import-location">Personal board · saved in this browser</p></div><button type="button" class="icon-button" data-import-action="close" aria-label="Close import">×</button></div><div class="import-body">${body}</div><div class="import-footer">${footer}</div>`;
  }
  function error(message) {
    session.error=message;
    const target=$('#external-import-error');
    if(target){target.textContent=message;target.hidden=false;target.scrollIntoView({block:'nearest'});}
  }
  function errors(){return `<div id="external-import-error" class="dialog-error" role="alert"${session.error?'':' hidden'}>${esc(session.error)}</div>`;}
  function sourceFields() {
    const file=session.mode==='file';
    return `<div class="form-grid"><div class="field"><label class="field-label" for="import-provider">Source</label><select id="import-provider">${options((file?['auto','clickup','monday','csv']:['slack','teams','onenote','text']).map(p=>[p,providers[p]]),session.provider)}</select></div><div class="field"><label class="field-label" for="import-scope">Workspace / board name</label><input id="import-scope" maxlength="200" value="${esc(session.scope)}" placeholder="For example, Acme / Website"><p class="field-hint">Use the same name for later imports from this source. It helps match existing items.</p></div></div>`;
  }
  function showInput() {
    session.step='input';
    const file=session.mode==='file';
    shell(`${errors()}<p class="import-intro">Bring in a task export or selected conversation. Review the result before it reaches your board.</p><div class="import-modes" role="group" aria-label="Import method"><button type="button" data-import-action="file-mode" aria-pressed="${file}">File</button><button type="button" data-import-action="text-mode" aria-pressed="${!file}">Paste text</button></div>${file?`<div class="import-file-box"><label class="field-label" for="external-import-file">Choose a task export</label><input id="external-import-file" type="file" accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><p class="field-hint">ClickUp CSV, Monday Excel (.xlsx), or a CSV/TSV task table. Up to 8 MB for Excel, 5 MB for CSV/TSV, and 500 proposed items.</p>${session.fileName?`<p class="import-file-name">Selected: <strong>${esc(session.fileName)}</strong></p>`:''}</div>`:`<div class="field"><label class="field-label" for="import-text">Conversation, checklist, or notes</label><textarea id="import-text" rows="8" maxlength="100000" placeholder="Paste the relevant messages, including replies that change the request. Keep names and dates when available.">${esc(session.text)}</textarea><p class="field-hint">Basic local extraction looks for action lines and checkboxes. It can miss context; check every suggestion. No AI service or account connection is used.</p></div>`}${sourceFields()}<details class="import-options"><summary>${file?'Date format':'Source link and date'} (optional)</summary>${file?`<div class="field"><label class="field-label" for="import-date-order">Numeric date order</label><select id="import-date-order">${options([['mdy','Month / day / year'],['dmy','Day / month / year']],session.dateOrder)}</select><p class="field-hint">Check dates in the preview, particularly exports from another locale.</p></div>`:`<div class="field"><label class="field-label" for="import-source-url">Original conversation or page link</label><input id="import-source-url" type="url" maxlength="4096" value="${esc(session.sourceUrl)}" placeholder="https://…"><p class="field-hint">Saved as a reference. Dayboard does not open or fetch this link.</p></div><div class="field"><label class="field-label" for="import-reference-date">Date of the original text</label><input id="import-reference-date" type="date" value="${esc(session.referenceDate)}"><p class="field-hint">Leave blank when messages have different dates or the date is unknown. Relative deadlines need review.</p></div>`}</details><p class="import-privacy">Files and text are read on this device. Only the items you approve are saved. <a href="./privacy.html#personal" target="_blank" rel="noopener noreferrer">Privacy & data</a></p>`,`<button class="button" data-import-action="close">Close</button><span class="spacer"></span><button class="button primary" data-import-action="preview"${session.busy?' disabled':''}>${session.busy?'Reading…':'Review import'}</button>`);
  }
  function syncInput() {
    if(session.step!=='input')return;
    for(const [id,key] of [['import-provider','provider'],['import-scope','scope'],['import-text','text'],['import-source-url','sourceUrl'],['import-reference-date','referenceDate'],['import-date-order','dateOrder']])if($('#'+id))session[key]=$('#'+id).value;
  }
  function parsedOptions(){return {provider:session.provider,scope:session.scope.trim(),sourceName:session.mode==='file'?session.fileName:providers[session.provider],sourceUrl:session.mode==='text'?session.sourceUrl.trim():'',referenceDate:session.referenceDate,dateOrder:session.dateOrder,columnMap:session.columnMap};}
  function buildReview() {
    session.rows=[];session.statusMap={};session.error='';
    session.parsed={provider:session.provider,candidates:[],statuses:[],warnings:[]};
    session.revision=store.state.revision;
    session.step='review';
    try{
      const parsed=session.mode==='file'?parseImportTable(session.table,parsedOptions()):parseImportText(session.text,parsedOptions());
      const rows=reviewImport(store.state,parsed.candidates,{area:session.area,projectId:session.projectId});
      if(session.mode==='file'&&parsed.normalizedTable)session.table={...session.table,...parsed.normalizedTable};
      session.parsed=parsed;session.rows=rows;
      if(session.mode==='file')session.statusMap=Object.fromEntries((parsed.statuses||[]).map(status=>[status,rows.find(row=>row.originalStatus===status)?.status||inferStatus(status)]));
    }catch(e){session.error=e.message||'This source could not be mapped. Choose a title column or another worksheet.';}
    showReview();dialog.scrollTop=0;
  }
  async function preview() {
    syncInput();session.error='';
    if(session.mode==='file'&&!session.file){error('Choose a CSV, TSV, or Excel (.xlsx) file.');return;}
    if(session.mode==='text'&&!session.text.trim()){error('Paste some text to review.');return;}
    if(session.sourceUrl&&!safeUrl(session.sourceUrl)){error('Use a complete http:// or https:// source link, or leave it blank.');return;}
    const current=session, token=++generation, mode=current.mode, file=current.file;
    current.busy=true;showInput();
    for(const control of dialog.querySelectorAll('input,textarea,select,[data-import-action="file-mode"],[data-import-action="text-mode"]'))control.disabled=true;
    try {
      let workbook=null,table=null;
      if(mode==='file') {
        if(file.size>8*1024*1024)throw new Error('The file is larger than 8 MB. Export a smaller selection.');
        if(/\.xlsx$/i.test(file.name)){
          workbook=await readXlsx(await file.arrayBuffer());
          if(!workbook.sheets.length)throw new Error('No readable worksheets were found.');
          table=workbook.sheets[0];
        }else if(/\.(csv|tsv)$/i.test(file.name)){
          table=parseDelimited(await file.text());
        }else throw new Error('Choose a CSV, TSV, or .xlsx export. Other file types are not supported.');
      }
      if(token!==generation||current!==session)return;
      session.workbook=workbook;session.table=table;session.sheetIndex=0;session.columnMap={};session.busy=false;
      buildReview();
    } catch(e){if(token===generation&&current===session){session.busy=false;session.error=e.message||'The source could not be read. Your board has not changed.';showInput();}}
    finally{if(token===generation&&current===session)session.busy=false;}
  }
  function actionOptions(row) {
    const list=[['skip','Skip']];
    if(row.duplicateOf)return list;
    if(['new','possible'].includes(row.matchType))list.push(['create',row.matchType==='possible'?'Create separate task':'Create task']);
    else if(row.existingId)list.push(['update','Update existing task']);
    return list;
  }
  function checkedAction(row){return row.selected===false?'skip':row.action||'skip';}
  function candidateHTML(row,index) {
    const action=checkedAction(row),existing=store.state.tasks.find(t=>t.id===row.existingId);
    return `<article class="import-candidate${action==='skip'?' is-skipped':''}" data-import-row="${index}"><div class="import-candidate-head"><div><span class="import-match" data-match="${esc(row.matchType)}">${esc(matchLabels[row.matchType]||'Review')}</span><h3 id="import-row-title-${index}">${esc(row.title)}</h3></div><label class="import-action-field"><span class="field-label">Action</span><select data-row-field="action" data-row-index="${index}" aria-label="Action for ${esc(row.title)}">${options(actionOptions(row),action)}</select></label></div><p class="import-candidate-meta"><span data-row-status="${index}">${esc(states[row.statusOverride||row.status]||'Inbox')}</span>${row.due?` · Due ${esc(row.due)}`:''}${row.originalStatus?` · Source: ${esc(row.originalStatus)}`:''}${row.kind==='reference'?' · Context only':''}</p>${existing?`<p class="field-hint">Matches DB-${existing.number}: ${esc(existing.title)}. Updating keeps its Area, Project, Today selection, and personal notes you changed.</p>`:''}${row.conflictFields?.length?`<p class="import-warning">You changed: ${esc(row.conflictFields.join(', '))}. Review the proposed replacement fields below.</p>`:''}${row.warnings?.length?`<ul class="import-row-warnings">${row.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<details class="import-edit"><summary>Edit task and inspect source</summary><div class="field"><label class="field-label" for="import-title-${index}">Task title</label><input id="import-title-${index}" data-row-field="title" data-row-index="${index}" value="${esc(row.title)}" maxlength="500" required></div><div class="form-grid"><div class="field"><label class="field-label" for="import-status-${index}">Status</label><select id="import-status-${index}" data-row-field="status" data-row-index="${index}">${options(Object.entries(states),row.statusOverride||row.status)}</select></div><div class="field"><label class="field-label" for="import-due-${index}">Due date</label><input id="import-due-${index}" type="date" data-row-field="due" data-row-index="${index}" value="${esc(row.due)}"></div><div class="field"><label class="field-label" for="import-priority-${index}">Priority</label><select id="import-priority-${index}" data-row-field="priority" data-row-index="${index}">${options([['high','High'],['normal','Normal'],['low','Low']],row.priority)}</select></div><div class="field"><label class="field-label" for="import-follow-${index}">Follow-up date</label><input id="import-follow-${index}" type="date" data-row-field="followUp" data-row-index="${index}" value="${esc(row.followUp)}"></div></div><div class="field"><label class="field-label" for="import-notes-${index}">Notes / context</label><textarea id="import-notes-${index}" rows="4" maxlength="200000" data-row-field="notes" data-row-index="${index}">${esc(row.notes)}</textarea></div>${row.checklist?.length?`<div class="import-checklist"><strong>Imported checklist</strong><ul>${row.checklist.map(item=>`<li>${item.done?'Completed: ':'To do: '}${esc(item.text)}</li>`).join('')}</ul><p class="field-hint">An update replaces the existing checklist. You can edit individual steps in task details after importing.</p></div>`:''}${existing?`<details class="import-current"><summary>Current Dayboard values</summary><p>Status: ${esc(states[existing.status])} · Due: ${esc(existing.due||'No date')} · Priority: ${esc(existing.priority)}</p><pre>${esc(existing.notes||'No notes')}</pre>${existing.checklist.length?`<p>Checklist: ${esc(existing.checklist.map(c=>(c.done?'[x] ':'[ ] ')+c.text).join('; '))}</p>`:''}</details>`:''}<details class="import-source"><summary>Original source</summary>${row.source?.url&&safeUrl(row.source.url)?`<a href="${esc(safeUrl(row.source.url))}" target="_blank" rel="noopener noreferrer">Open original</a>`:''}<pre>${esc(row.context||'')}</pre><dl>${Object.entries(row.source?.original||{}).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl></details></details></article>`;
  }
  function mappingHTML() {
    if(session.mode!=='file'||!session.table)return '';
    const detected=detectColumns(session.table.headers,session.parsed?.provider||session.provider);
    return `<details class="import-options"${session.error?' open':''}><summary>Map columns</summary><p class="field-hint">Change a field when your export uses a different column name. Applying mappings rebuilds the preview and discards preview edits.</p><div class="form-grid">${Object.entries(columnFields).map(([field,label])=>`<div class="field"><label class="field-label" for="import-column-${field}">${label}</label><select id="import-column-${field}" data-column-field="${field}">${options([['','Automatic'+(detected[field]>=0?` (${session.table.headers[detected[field]]})`:'')],['-1','Do not import this field'],...session.table.headers.map((h,i)=>[String(i),h||`Column ${i+1}`])],session.columnMap[field]??'')}</select></div>`).join('')}</div><button class="button small" data-import-action="apply-mapping">Apply column mapping</button></details>`;
  }
  function showReview() {
    session.step='review';
    const projects=store.state.projects.filter(p=>!p.archived&&p.area===session.area);
    if(session.projectId&&!projects.some(p=>p.id===session.projectId))session.projectId='';
    const warnings=[...(session.mode==='file'?session.workbook?.warnings||[]:[]),...(session.mode==='file'?session.table?.warnings||[]:[]),...(session.parsed?.warnings||[])];
    shell(`${errors()}<div class="import-review-heading"><div><h3>Review before adding</h3><p>${esc(session.scope||(session.mode==='file'?session.fileName:providers[session.provider]))} · ${esc(providers[session.parsed?.provider]||session.parsed?.provider||'Source')} · ${session.rows.length} proposed ${session.rows.length===1?'item':'items'}</p></div><span class="import-local-badge">On this device</span></div>${session.mode==='file'&&session.workbook?.sheets.length>1?`<div class="field"><label class="field-label" for="import-sheet">Worksheet</label><select id="import-sheet">${options(session.workbook.sheets.map((s,i)=>[i,s.name]),session.sheetIndex)}</select><p class="field-hint">Only this worksheet will be imported. Updates and other sheets can be reviewed separately.</p></div>`:''}${warnings.length?`<details class="import-coverage"><summary>Source notes (${warnings.length})</summary><ul>${[...new Set(warnings)].map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}<div class="import-destination form-grid"><div class="field"><label class="field-label" for="import-area">Area for new tasks</label><select id="import-area">${options(store.state.areas.map(a=>[a.id,a.name]),session.area)}</select></div><div class="field"><label class="field-label" for="import-project">Project for new tasks</label><select id="import-project">${options([['','No project'],...projects.map(p=>[p.id,p.name])],session.projectId)}</select></div></div>${mappingHTML()}${Object.keys(session.statusMap).length?`<details class="import-options"><summary>Map source statuses</summary><div class="form-grid">${Object.entries(session.statusMap).map(([source,target],i)=>`<div class="field"><label class="field-label" for="import-map-status-${i}">${esc(source||'(empty)')}</label><select id="import-map-status-${i}" data-source-status="${esc(source)}">${options(Object.entries(states),target)}</select></div>`).join('')}</div></details>`:''}<div class="import-bulk"><button class="button small" data-import-action="select-new">Select new tasks</button><button class="button plain small" data-import-action="skip-all">Skip all</button><span class="field-hint">New tasks stay off Today. Recurrence stays off.</span></div><div class="import-candidates">${session.rows.length?session.rows.map(candidateHTML).join(''):'<p class="import-empty">No task suggestions were found. Try a smaller selection with explicit action items, or check the title column mapping.</p>'}</div>`,`<button class="button" data-import-action="back">Back</button><span id="import-count" class="import-count" aria-live="polite"></span><button class="button primary" data-import-action="save">Import selected</button>`);
    updateCounts();
  }
  function updateCounts() {
    const chosen=session.rows.filter(r=>checkedAction(r)!=='skip'),created=chosen.filter(r=>r.action==='create').length,updated=chosen.filter(r=>r.action==='update').length;
    if($('#import-count'))$('#import-count').textContent=`${created} new · ${updated} updates · ${session.rows.length-chosen.length} skipped`;
    const button=$('[data-import-action="save"]');if(button){button.disabled=!chosen.length;button.textContent=`Import ${chosen.length} ${chosen.length===1?'item':'items'}`;}
  }
  function save() {
    session.error='';
    if(!session.rows.some(r=>checkedAction(r)!=='skip'))return;
    if(session.revision!==store.state.revision){
      session.rows=reviewImport(store.state,session.rows,{area:session.area,projectId:session.projectId});session.revision=store.state.revision;showReview();error('Your board changed while this preview was open. Matches have been refreshed; review your selections again.');return;
    }
    for(const row of session.rows.filter(r=>checkedAction(r)!=='skip'))if(!row.title?.trim()){error('Every selected task needs a title.');return;}
    let counts;
    try{
      store.commit(state=>{counts=applyImport(state,clone(session.rows),{area:session.area,projectId:session.projectId,statusMap:session.statusMap,now:new Date().toISOString()});});
      render();
    }catch(e){error(`Import was not saved. ${e.message||'Your existing board is unchanged. Try again.'}`);return;}
    session.result=counts;session.savedRevision=store.state.revision;session.step='done';onImported({area:session.area,counts});showDone();
  }
  function showDone(undone=false) {
    dialog.scrollTop=0;
    const r=session.result;
    shell(`<div class="import-result"><span class="import-result-mark" aria-hidden="true">${undone?'↶':'✓'}</span><h3>${undone?'Import undone':'Import saved'}</h3><p>${undone?'The board has been restored to its state before this import.':`${r.created} new ${r.created===1?'task':'tasks'} · ${r.updated} updated · ${r.skipped} skipped`}</p><p class="field-hint">${undone?'You can start another import when ready.':'Original source details are kept with each imported task and in JSON backups. Nothing was changed in the source service.'}</p>${errors()}${!undone?'<button class="button" data-import-action="undo">Undo this import</button><p class="field-hint">Available until another board change is saved.</p>':''}</div>`,`<button class="button" data-import-action="start-over">Import more</button><span class="spacer"></span><button class="button primary" data-import-action="close">Back to board</button>`);
  }
  function close(){if(session.busy){generation++;session.busy=false;}dialog.close();opener?.focus?.();}
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-import-action]');if(!button)return;
    event.preventDefault();const action=button.dataset.importAction;
    if(action==='close'){close();return;}
    if(action==='preview'){void preview();return;}
    if(action==='file-mode'||action==='text-mode'){
      syncInput();generation++;session.mode=action==='file-mode'?'file':'text';session.provider=session.mode==='file'?'auto':'slack';session.workbook=null;session.table=null;session.parsed=null;session.rows=[];session.error='';session.busy=false;showInput();return;
    }
    if(action==='back'){session.error='';showInput();return;}
    if(action==='apply-mapping'){
      session.columnMap=Object.fromEntries([...dialog.querySelectorAll('[data-column-field]')].filter(el=>el.value!=='').map(el=>[el.dataset.columnField,Number(el.value)]));
      try{buildReview();}catch(e){error(e.message);}return;
    }
    if(action==='select-new'||action==='skip-all'){
      for(const row of session.rows){const select=action==='select-new'&&row.matchType==='new'&&row.kind!=='reference'&&!row.duplicateOf;row.action=select?'create':'skip';row.selected=select;}showReview();return;
    }
    if(action==='save'){save();return;}
    if(action==='start-over'){generation++;session=fresh({area:session.area,projectId:session.projectId});showInput();return;}
    if(action==='undo'){
      if(session.savedRevision!==store.state.revision){error('A newer board change was saved. This import can no longer be undone as a batch.');return;}
      try{store.undo();render();session.savedRevision=null;showDone(true);}catch(e){error(e.message);}return;
    }
  });
  dialog.addEventListener('cancel',()=>{if(session?.busy){generation++;session.busy=false;}});
  dialog.addEventListener('input',event=>{
    const el=event.target;
    if(el.dataset.rowField&&el.dataset.rowField!=='action'){
      const row=session.rows[Number(el.dataset.rowIndex)],field=el.dataset.rowField;row[field]=el.value;
      if(field==='status')row.statusOverride=el.value;
      if(field==='title')$('#import-row-title-'+el.dataset.rowIndex).textContent=el.value;
    }else syncInput();
  });
  dialog.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='external-import-file'){
      syncInput();const file=el.files[0];if(!file)return;session.file=file;session.fileName=file.name;
      if(!session.scope)session.scope=file.name.replace(/\.[^.]+$/,'');showInput();return;
    }
    if(el.dataset.rowField){
      const row=session.rows[Number(el.dataset.rowIndex)],field=el.dataset.rowField;
      if(field==='action'){row.action=el.value;row.selected=el.value!=='skip';el.closest('.import-candidate').classList.toggle('is-skipped',!row.selected);updateCounts();}
      else{row[field]=el.value;if(field==='status'){row.statusOverride=el.value;const label=$(`[data-row-status="${el.dataset.rowIndex}"]`);if(label)label.textContent=states[el.value];}}return;
    }
    if(el.id==='import-area'){session.area=el.value;session.projectId='';showReview();return;}
    if(el.id==='import-project'){session.projectId=el.value;return;}
    if(el.hasAttribute('data-source-status')){
      const key=el.dataset.sourceStatus;session.statusMap[key]=el.value;for(const row of session.rows)if(row.originalStatus===key&&!row.statusOverride)row.status=el.value;showReview();return;
    }
    if(el.id==='import-sheet'){
      session.sheetIndex=Number(el.value);session.table=session.workbook.sheets[session.sheetIndex];session.columnMap={};
      try{buildReview();}catch(e){error(e.message);}return;
    }
    syncInput();
  });
  return {
    open(defaults){opener=document.activeElement;if(!session||session.step==='done')session=fresh(defaults);if(session.step==='review')showReview();else showInput();if(!dialog.open)dialog.showModal();},
    hasDraft(){return Boolean(dialog.open&&session&&session.step!=='done'&&(session.text.trim()||session.file));},
  };
}
