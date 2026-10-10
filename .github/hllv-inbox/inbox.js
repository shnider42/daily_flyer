/* Real moderator inbox. No practice rows, credentials, email addresses or publication actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HLLVInbox=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels=Object.freeze({pending:'New',needs_information:'Needs clarification',shortlisted:'Shortlisted',declined:'Not selected',duplicate:'Duplicate',published:'Published'});
 const filters=Object.freeze({all:'All',pending:'New',needs_information:'Needs clarification',shortlisted:'Shortlisted',closed:'Closed',published:'Published'});
 const date=v=>{const d=new Date(v);return !v||!Number.isFinite(d.getTime())?'Not recorded':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});};
 function validate(v){
  if(!v||!Array.isArray(v.rows)||typeof v.can_moderate!=='boolean'||!['setup','intake','review','voting','closed'].includes(v.phase)||!v.checked_at)throw new Error('Invalid inbox response');
  const ids=new Set();
  for(const s of v.rows){if(!s||typeof s.id!=='string'||ids.has(s.id)||!Object.hasOwn(labels,s.state)||!Number.isInteger(s.version)||s.version<1||!s.updated_at||typeof s.public_visible!=='boolean'||!Array.isArray(s.history))throw new Error('Invalid inbox entry');ids.add(s.id);}
  return v;
 }
 function matching(rows,filter='all',query='',sort='oldest'){
  const q=String(query).trim().toLowerCase();
  return rows.filter(s=>(filter==='all'||(filter==='closed'?['declined','duplicate'].includes(s.state):s.state===filter))&&(!q||[s.title,s.problem,s.desired_outcome,s.related_issue,s.id].join(' ').toLowerCase().includes(q)))
   .sort((a,b)=>(sort==='newest'?-1:1)*String(a.created_at).localeCompare(String(b.created_at))||a.id.localeCompare(b.id));
 }
 function canEdit(s,data){return !!(data?.can_moderate&&['intake','review'].includes(data.phase)&&s&&s.state!=='published');}
 const reviewLabel=s=>({cleared:'Reviewer clearance recorded',hold:'Reviewer hold',clarify:'Reviewer requested clarification'})[s.last_decision]||'No reviewer decision recorded';
 function mount({container,rpc,issues=[],isCurrent=()=>true}){
  if(!container||typeof rpc!=='function')return;
  let data=null,selected=null,filter='all',query='',sort='oldest',serial=0,busy=false,uncertain=false,dirty=false,poll=null;
  const live=()=>container.isConnected&&isCurrent();
  const find=s=>container.querySelector(s);
  const row=()=>data?.rows.find(s=>s.id===selected);
  const stop=()=>{if(poll)clearInterval(poll);};
  const lock=value=>{container.querySelectorAll('button,input,textarea,select').forEach(e=>{if(value){e.dataset.wasDisabled=String(e.disabled);e.disabled=true;}else{e.disabled=e.dataset.wasDisabled==='true';delete e.dataset.wasDisabled;}});if(!value&&uncertain&&find('#miSave'))find('#miSave').disabled=true;};
  const focus=()=>{if(!live())return;const e=find('#miFocus');e?.focus({preventScroll:true});e?.scrollIntoView({block:'start',behavior:'instant'});};
  const request=async(name,args={})=>{let timer;try{return await Promise.race([rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Confirmation timed out')),15000);})]);}finally{clearTimeout(timer);}};
  const status=(message,error=false)=>{const e=find('#miStatus');if(live()&&e){e.textContent=message;e.dataset.error=String(error);}};
  const shell=body=>{if(live())container.innerHTML='<section class="mi-inbox" aria-labelledby="miFocus">'+body+'</section>';};
  const leaveDraft=()=>!dirty||window.confirm('Leave this unsaved moderator note? It has not been sent.');
  async function load({check=false}={}){
   if(!live()||busy)return;
   if(!check&&!leaveDraft())return;
   const draft=check?{note:find('#miNote')?.value||'',decision:find('#miDecision')?.value||'',duplicate:find('#miDuplicate')?.value||''}:null;
   const ticket=++serial;busy=true;
   if(!data)shell('<h3 id="miFocus" tabindex="-1">Submitted suggestions</h3><p role="status">Loading the private inbox…</p>');
   else status('Checking the latest server record…');
   lock(true);
   try{
    const result=validate(await request('hllv_moderator_inbox'));if(!live()||ticket!==serial)return;
    data=result;uncertain=false;dirty=false;if(selected&&!row())selected=null;draw();
    if(check){status('Current server status loaded. Compare it with your intended decision before saving anything again.');if(draft&&find('#miNote')){find('#miNote').value=draft.note;find('#miDecision').value=draft.decision;find('#miDuplicate').value=draft.duplicate;dirty=!!draft.note;}}
   }catch(_){if(!live()||ticket!==serial)return;
    if(!data){shell('<h3 id="miFocus" tabindex="-1">Inbox unavailable</h3><p role="alert">We could not load submissions. This is not a confirmed empty inbox.</p><button type="button" class="sg-button" id="miRetry">Retry inbox</button>');find('#miRetry').onclick=()=>load();}
    else status('The latest inbox could not be checked. Displayed information may be older; your unsaved note is still here.',true);
   }finally{busy=false;if(live()&&ticket===serial)lock(false);}
  }
  function draw(){
   if(!live()||!data)return;const s=row();
   shell('<div class="mi-heading"><h3 id="miFocus" tabindex="-1">'+(s?'Review submission':'Submitted suggestions')+'</h3><button type="button" class="sg-button secondary" id="miRefresh">Refresh inbox</button></div><p class="mi-scope">Real community submissions only. Private practice is a separate view.</p><p class="mi-mode">'+(data.can_moderate?'Moderation is available. Screening is not developer approval.':'Read-only · Pilot phase: '+esc(data.phase)+'. Submission intake and live moderation are not open in this phase.')+'</p><p id="miStatus" role="status" aria-live="polite"></p><p class="sg-muted" id="miChecked">Inbox checked '+esc(date(data.checked_at))+'</p><p id="miNew" class="sg-muted" role="status"></p><div id="miBody"></div>');
   find('#miRefresh').onclick=()=>load();if(s)detail(s);else list();
  }
  function list(){
   const counts=Object.fromEntries(Object.keys(filters).map(f=>[f,matching(data.rows,f).length]));
   find('#miBody').innerHTML='<div class="mi-filters" aria-label="Submission statuses">'+Object.entries(filters).map(([k,v])=>'<button class="sg-button secondary" type="button" data-mi-filter="'+k+'" aria-pressed="'+(filter===k)+'">'+v+' <span>'+counts[k]+'</span></button>').join('')+'</div><div class="mi-tools"><label for="miSearch">Search submissions<input id="miSearch" type="search" placeholder="Title, problem or issue ID" value="'+esc(query)+'"></label><label for="miSort">Order<select id="miSort"><option value="oldest" '+(sort==='oldest'?'selected':'')+'>Oldest first</option><option value="newest" '+(sort==='newest'?'selected':'')+'>Newest first</option></select></label></div><div id="miRows"></div>';
   container.querySelectorAll('[data-mi-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.miFilter;draw();find('[data-mi-filter="'+filter+'"]').focus({preventScroll:true});});
   find('#miSearch').oninput=e=>{query=e.target.value;rows();};find('#miSort').onchange=e=>{sort=e.target.value;rows();};rows();
  }
  function rows(){
   const shown=matching(data.rows,filter,query,sort);
   find('#miRows').innerHTML=shown.length?'<p class="sg-muted">'+shown.length+' of '+data.rows.length+' submissions shown</p>'+shown.map(s=>'<button type="button" class="mi-row" data-mi-id="'+esc(s.id)+'"><span><strong>'+esc(s.title)+'</strong><small>'+esc(s.kind==='bug_priority'?'Bug priority':'Suggestion')+' · Received '+esc(date(s.created_at))+(s.related_issue?' · '+esc(s.related_issue):'')+'</small></span><span class="mi-state">'+esc(labels[s.state])+' <span aria-hidden="true">→</span></span></button>').join(''):'<div class="sg-empty"><h4>'+(data.rows.length?'No matching submissions.':'No community submissions received yet.')+'</h4><p>'+(data.rows.length?'Choose another status or clear the search.':'Your private practice entry is not missing—it belongs under Private practice. The community pilot has not opened, so no player submissions are expected here yet.')+'</p></div>';
   container.querySelectorAll('[data-mi-id]').forEach(b=>b.onclick=()=>{selected=b.dataset.miId;dirty=false;uncertain=false;draw();focus();});
  }
  function detail(s){
   const issue=issues.find(i=>i.id===s.related_issue),dup=data.rows.find(x=>x.id===s.duplicate_of),editable=canEdit(s,data);
   const targets=data.rows.filter(x=>x.id!==s.id&&!['declined','duplicate'].includes(x.state));
   find('#miBody').innerHTML='<button type="button" id="miBack" class="sg-button secondary">← Back to inbox</button><article class="mi-detail"><h4>'+esc(s.title)+'</h4><dl class="mi-facts"><div><dt>Saved record</dt><dd>Version '+s.version+' · '+esc(date(s.updated_at))+'</dd></div><div><dt>Moderation status</dt><dd id="miStateLabel">'+esc(labels[s.state])+'</dd></div><div><dt>Public visibility</dt><dd>'+(s.public_visible?'Visible on Bulletin Board':'Not visible on Bulletin Board')+'</dd></div><div><dt>Reviewer response</dt><dd>'+esc(reviewLabel(s))+'</dd></div></dl><h5>Problem</h5><p class="mi-text">'+esc(s.problem)+'</p><h5>Desired outcome</h5><p class="mi-text">'+esc(s.desired_outcome)+'</p>'+(issue?'<p><a href="#'+esc(issue.id)+'" data-suggestion-issue="'+esc(issue.id)+'">'+esc(issue.id)+' · '+esc(issue.title)+' →</a></p>':'')+'<p class="sg-muted">'+(s.owner_accepted_version===s.version?'Current wording accepted by its submitter.':'Revised wording still needs the submitter’s acceptance before shortlisting.')+'</p>'+(s.duplicate_of?'<p>Duplicate of: '+esc(dup?.title||'Target no longer available')+'</p>':'')+'<h5>Latest note to submitter</h5><p class="mi-text" id="miSavedNote">'+esc(s.submitter_note||'No note recorded.')+'</p></article>'+(editable?'<form class="sg-form mi-decision" id="miForm"><h4>Next moderation decision</h4><label for="miDecision">Choose a decision</label><select id="miDecision" required><option value="">Choose a decision…</option><option value="needs_information">Ask for clarification</option><option value="shortlisted" '+(s.owner_accepted_version===s.version?'':'disabled')+'>Shortlist for reviewer</option><option value="declined">Not selected</option><option value="duplicate">Mark duplicate</option><option value="pending">Return to New</option></select><label for="miDuplicate">Duplicate target (only for Mark duplicate)</label><select id="miDuplicate"><option value="">Choose an existing submission…</option>'+targets.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join('')+'</select><label for="miNote">Note visible to the submitter</label><textarea id="miNote" minlength="5" maxlength="1000" required></textarea><p class="sg-muted">Saved in My submissions; no email is sent by this action. This does not approve development or publish the suggestion.</p><button class="sg-button" type="submit" id="miSave">Save moderation decision</button><button class="sg-button secondary" id="miCheck" type="button" hidden>Check current status</button></form>':'<p class="mi-mode">'+(s.state==='published'?'Published entries are read-only in this inbox.':'Live decisions are disabled in this phase. You can inspect saved submissions without changing them.')+'</p>')+'<details class="sg-process"><summary>History</summary><div>'+s.history.map(h=>'<p>'+esc(date(h.at))+' · '+esc(({submitted_private:'Received privately',moderated:'Moderation saved',review_recorded:'Reviewer response recorded',published:'Published',withdrawn:'Withdrawn',edited_review_invalidated:'Wording revised',owner_accepted_wording:'Submitter accepted wording'})[h.action]||'Recorded change')+(h.decision?' · '+esc(labels[h.decision]||({cleared:'Clearance recorded',clarify:'Clarification requested',hold:'Held'})[h.decision]||'Decision recorded'):'')+'</p>').join('')+'</div></details>';
   find('#miBack').onclick=()=>{if(!leaveDraft())return;selected=null;dirty=false;uncertain=false;draw();focus();};
   if(editable){find('#miForm').oninput=()=>{dirty=true;};find('#miForm').onsubmit=e=>{e.preventDefault();save(s);};find('#miCheck').onclick=()=>load({check:true});}
  }
  async function save(s){
   if(!live()||busy||uncertain)return;
   const decision=find('#miDecision').value,note=find('#miNote').value.trim(),duplicate=find('#miDuplicate').value||null;
   if(!decision||note.length<5){status('Choose a decision and add a short note. Nothing has been sent.',true);return;}
   if(decision==='duplicate'&&!duplicate){status('Choose the existing submission this duplicates. Nothing has been sent.',true);return;}
   if(['declined','duplicate'].includes(decision)&&!window.confirm('Save this decision and note for the submitter? Nothing will be published or emailed.'))return;
   const ticket=++serial;busy=true;lock(true);status('Saving moderation decision…');
   try{
    const r=await request('hllv_moderator_decision',{suggestion:s.id,expected_version:s.version,expected_updated_at:s.updated_at,decision,note,duplicate_of:duplicate});
    if(!live()||ticket!==serial)return;
    if(!r||r.id!==s.id||r.version!==s.version||r.state!==decision||!r.updated_at||r.public_visible!==false)throw new Error('Unconfirmed decision');
    Object.assign(s,r,{duplicate_of:decision==='duplicate'?duplicate:null,history:[{action:'moderated',decision,version:s.version,at:r.updated_at},...s.history].slice(0,100)});
    dirty=false;uncertain=false;draw();status('✓ Moderation saved — '+labels[r.state]+'. Saved '+date(r.updated_at)+'. Nothing was published or emailed.');focus();
   }catch(_){if(live()&&ticket===serial){uncertain=true;status('We could not confirm this decision. Your note is still here. Check the current server status before trying again.',true);find('#miCheck').hidden=false;find('#miSave').disabled=true;}}
   finally{busy=false;if(live()&&ticket===serial)lock(false);}
  }
  load();
  // Check only while mounted. Never rearrange a list or overwrite a draft.
  poll=setInterval(async()=>{if(!live()){stop();return;}if(busy||document.hidden)return;const ticket=serial;try{const latest=validate(await request('hllv_moderator_inbox'));if(live()&&ticket===serial&&data&&JSON.stringify(latest.rows)!==JSON.stringify(data.rows)&&find('#miNew'))find('#miNew').textContent='The inbox has changed. Refresh when ready; your current note has not been replaced.';}catch(_){if(live()&&find('#miNew'))find('#miNew').textContent='Automatic inbox checking is unavailable. Use Refresh inbox to check again.';}},60000);
  return Object.freeze({canLeave:leaveDraft});
 }
 return Object.freeze({mount,esc,labels,filters,date,validate,matching,canEdit});
});
