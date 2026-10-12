/* Community board. Authentication uses the unchanged managed password/session modules.
   Publication is site moderation, never a developer approval. Private data stays out of storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HLLVSuggestions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const states={pending:'Awaiting moderator review',needs_information:'Needs clarification',published:'Published',declined:'Not selected',duplicate:'Duplicate',withdrawn:'Withdrawn',shortlisted:'Shortlisted'};
 const date=v=>{const d=new Date(v);return !v||!Number.isFinite(d.getTime())?'Not recorded':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});};
 const isAuthCallback=h=>['access_token','refresh_token','error','error_code','error_description'].some(k=>new URLSearchParams(String(h||'').replace(/^#/,'')).has(k));
 const validConfig=c=>!!(c&&c.connection_mode==='community'&&c.community_enabled===true&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabase_url)&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.publishable_key));
 let client,persistence,profile=null,email='',issues=[],initialized=false,initializing=false,epoch=0,serial=0,view='board',requested='',authVisible=false,logoutBusy=false,timer;
 let statusData=null,rows=[],page=0,query='',order='votes',queueState='pending',dirty=false,busy=false,selected=null,receipt=null,formRequest=null,uncertain=false;
 const el=id=>document.getElementById(id);
 const connected=t=>t===epoch&&!el('suggestionBox')?.classList.contains('hidden');
 function notice(text,error=false){const n=el('sgStatus');if(n){n.textContent=text;n.dataset.error=String(error);}}
 function focus(){const n=el('cbFocus');n?.focus({preventScroll:true});n?.scrollIntoView({block:'start',behavior:'instant'});}
 function html(value){el('sgContent').innerHTML=value;}
 function auth(){
  const host=el('sgAccount');if(!host||!client||!persistence)return;
  host.hidden=!authVisible;
  const e=epoch;
  HLLVPassword.mount({container:host,client,profile,email,persistence,onIdentity:loadIdentity,signOut,isCurrent:()=>e===epoch});
  if(authVisible&&requested){HLLVPassword.open(requested);requested='';}
  const review=document.querySelector('[data-cb-view="queue"]');if(review)review.hidden=profile?.role!=='moderator';
 }
 function errorMessage(e){
  if(e?.code==='40001')return 'This entry changed. Check the saved copy before trying again.';
  if(e?.code==='42501')return 'This action needs a current, verified account with the required permissions.';
  if(String(e?.message||'').startsWith('You can send three suggestions'))return e.message;
  if(String(e?.message||'').includes('temporarily paused'))return 'Submissions and voting are temporarily paused.';
  return 'The request could not be confirmed. Your text is still here.';
 }
 async function call(action,payload={}){
  if(!client)throw new Error('Connection unavailable');
  let timeout;
  try{return await Promise.race([(async()=>{const result=await client.rpc('hllv_community',{action,payload});if(result.error)throw result.error;return result.data;})(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Confirmation timed out')),15000);})]);}
  finally{clearTimeout(timeout);}
 }
 function requestAccount(target='sign-in'){
  if(target==='review'){view='queue';page=0;authVisible=false;requested='';}
  else {authVisible=true;requested=target;}
 }
 function safeLeave(){return !dirty||window.confirm('Leave this unsaved text? It has not been saved.');}
 function go(mode){if(busy||!safeLeave())return;dirty=false;uncertain=false;selected=null;receipt=null;page=0;query='';view=mode;authVisible=false;auth();paint();}
 function signInForAction(){authVisible=true;requested='sign-in';auth();notice('Sign in with your existing site account to continue.');}
 async function signOut(){
  if(!client||logoutBusy)return;logoutBusy=true;clearTimeout(timer);epoch++;serial++;profile=null;email='';rows=[];selected=null;receipt=null;dirty=false;busy=false;view='board';authVisible=false;
  el('sgAccount').replaceChildren();html('<p>Signing out…</p>');HLLVPassword.status();
  let failed=false;try{const r=await client.auth.signOut({scope:'local'});failed=!!r.error;}catch(_){failed=true;}
  await persistence.storage.removeItem(persistence.key);logoutBusy=false;auth();await paint();notice(failed?'Signed out locally. Server revocation could not be confirmed.':'Signed out. Private views have been cleared.',failed);
 }
 function refreshSoon(){clearTimeout(timer);timer=setTimeout(()=>{if(!initializing&&!logoutBusy&&!busy&&!dirty)loadIdentity();},0);}
 async function loadIdentity(){
  const t=++epoch;serial++;rows=[];selected=null;profile=null;email='';HLLVPassword.status({checking:true});let failed=false;
  try{const s=await client.auth.getSession();if(s.error)throw s.error;
   if(s.data?.session){const u=await client.auth.getUser();if(u.error||!u.data?.user)throw new Error('Unverified session');const p=await call('profile');if(t!==epoch)return;if(!['participant','moderator','reviewer'].includes(p?.role))throw new Error('Invalid profile');profile=p;email=u.data.user.email||'';}
  }catch(_){failed=true;}
  if(t!==epoch)return;
  if(profile&&requested!=='password')authVisible=false;
  if(!profile&&['queue','practice'].includes(view))view='board';
  auth();await paint();if(failed)notice('Account access could not be verified. Public suggestions remain readable; saved work is unchanged.',true);
 }
 function related(s){const i=issues.find(i=>i.id===s.related_issue);return i?'<a class="cb-related" href="#'+esc(i.id)+'" data-suggestion-issue="'+esc(i.id)+'">'+esc(i.id)+' · '+esc(i.title)+' ↗</a>':'';}
 function tag(s){return '<span class="cb-tag '+(s.state==='published'?'approved':'')+'">'+esc(states[s.state]||s.state)+'</span>';}
 function card(s,privateView=false){
  if(privateView)return '<button class="cb-entry" type="button" data-open="'+esc(s.id)+'"><span>'+tag(s)+'<strong>'+esc(s.title)+'</strong><span class="cb-small">'+esc(date(s.updated_at))+' · Version '+Number(s.version)+'</span></span><span aria-hidden="true">→</span></button>';
  return '<article class="cb-row" data-board-id="'+esc(s.id)+'"><button class="cb-vote" type="button" data-vote="'+esc(s.id)+'" aria-pressed="'+!!s.my_vote+'" aria-label="'+esc((s.my_vote?'Remove support for ':'Support ')+s.title)+'"><span aria-hidden="true">↑</span><strong>'+Number(s.votes||0)+'</strong><span>'+(s.my_vote?'Supported':'Support')+'</span></button><div class="cb-row-copy"><span class="cb-type">'+(s.kind==='bug_priority'?'Bug priority':'Suggestion')+' · Moderator approved</span><h3>'+esc(s.title)+'</h3><p>'+esc(s.problem)+'</p><details><summary>Read the suggestion</summary><p><strong>Proposed improvement</strong><br>'+esc(s.desired_outcome)+'</p><p class="cb-small">Approved for this community board '+esc(date(s.approved_at))+'. No Team17 review or development commitment is recorded.</p></details>'+related(s)+'</div></article>';
 }
 function bindEntries(){el('sgContent').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{selected=rows.find(s=>s.id===b.dataset.open);detail();});}
 function pager(total){return total>20?'<div class="cb-pager"><button class="sg-button secondary" id="cbPrev" '+(page===0?'disabled':'')+'>Previous</button><span>Page '+(page+1)+' of '+Math.ceil(total/20)+'</span><button class="sg-button secondary" id="cbNext" '+((page+1)*20>=total?'disabled':'')+'>Next</button></div>':'';}
 function bindPager(){if(el('cbPrev'))el('cbPrev').onclick=()=>{page--;paint();};if(el('cbNext'))el('cbNext').onclick=()=>{page++;paint();};}
 async function paint(){
  const t=epoch,ticket=++serial;
  document.querySelectorAll('[data-cb-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cbView===view)));
  if(!client)return;
  if(view==='receipt'&&receipt){showReceipt();return;}
  if(view==='submit'){
   if(!profile){html('<div class="cb-signin-prompt"><h2 id="cbFocus" tabindex="-1">One sign-in, then your suggestion.</h2><p>Submissions stay private until a moderator approves them. Use an existing site account; pilot accounts are currently invited.</p><button id="cbLogin" class="sg-button">Sign in to submit</button></div>');el('cbLogin').onclick=signInForAction;return;}
   form(null);return;
  }
  if(view==='practice'){
   if(profile?.role!=='moderator'){view='board';return paint();}
   html('<button class="cb-text-button" id="cbBackQueue">← Back to review queue</button><div id="privatePractice"></div>');el('cbBackQueue').onclick=()=>go('queue');
   window.HLLVPractice?.mount({container:el('privatePractice'),issues,isCurrent:()=>t===epoch&&ticket===serial&&view==='practice',rpc:async(name,args)=>{if(name!=='hllv_rehearsal')throw new Error('Unavailable');const x=await client.rpc(name,args);if(x.error)throw x.error;return x.data;}});return;
  }
  if(view==='mine'&&!profile){html('<h2 id="cbFocus" tabindex="-1">Your suggestions, in one place.</h2><p>Sign in to see private submissions and moderator replies.</p><button class="sg-button" id="cbLogin">Sign in</button>');el('cbLogin').onclick=signInForAction;return;}
  if(view==='queue'&&profile?.role!=='moderator'){view='board';return paint();}
  html('<p role="status" class="cb-loading">Loading '+(view==='board'?'the Bulletin Board':'your private view')+'…</p>');
  try{
   statusData=await call('status');const mode=view;
   const result=await call(mode==='board'?'board':mode==='mine'?'mine':'queue',{page,query,order,state:mode==='queue'?queueState:'all'});
   if(t!==epoch||ticket!==serial)return;if(!result||!Array.isArray(result.rows)||!Number.isInteger(result.total))throw new Error('Invalid response');rows=result.rows;
   const heading=mode==='board'?'Bulletin Board':mode==='mine'?'My suggestions':'Review queue';
   const help=mode==='board'?'Community priorities, not a developer roadmap.':mode==='mine'?'Your pending suggestions and moderator replies are private.':'Approve good suggestions for everyone to read and signed-in users to support.';
   const search=mode!=='mine'?'<form class="cb-tools" id="cbSearchForm"><label class="cb-search-label">Search suggestions<input id="cbSearch" type="search" value="'+esc(query)+'" placeholder="Search ideas or a tracked bug…" maxlength="120"></label>'+(mode==='board'?'<label>Order<select id="cbOrder"><option value="votes" '+(order==='votes'?'selected':'')+'>Most supported</option><option value="newest" '+(order==='newest'?'selected':'')+'>Newest</option></select></label>':'<label>Status<select id="cbFilter">'+[['pending','New'],['all','All submissions'],['needs_information','Needs clarification'],['published','Published'],['declined','Not selected'],['duplicate','Duplicates']].map(([k,v])=>'<option value="'+k+'" '+(queueState===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>')+'<button class="sg-button secondary" type="submit">Search</button></form>':'';
   html('<div class="cb-section-head"><div><span class="cb-eyebrow">'+(mode==='board'?'Public · '+result.total+' published':'Private')+'</span><h2 id="cbFocus" tabindex="-1">'+heading+'</h2></div><button class="cb-text-button" id="cbRefresh">Refresh</button></div><p class="cb-small">'+help+'</p>'+(statusData.enabled?'':'<p role="status" class="cb-paused">Submissions and voting are temporarily paused.</p>')+search+'<div class="cb-list">'+(rows.length?rows.map(s=>card(s,mode!=='board')).join(''):'<div class="cb-empty"><span aria-hidden="true">'+(mode==='board'?'＋':'✓')+'</span><h3>'+(query?'No matching suggestions.':mode==='board'?'The next idea could be yours.':mode==='mine'?'You have not submitted a suggestion yet.':'You’re caught up.')+'</h3><p>'+(query?'Try a different search.':mode==='board'?'Submit an improvement. A moderator will review it before it appears here.':mode==='mine'?'Send your first idea using the button at the top.':'No suggestions match this review filter. Private practice is separate from this queue.')+'</p>'+(mode!=='queue'?'<button class="sg-button" id="cbEmptySubmit">Submit a suggestion</button>':'')+'</div>')+'</div>'+pager(result.total)+(mode==='queue'?'<details class="cb-staff-tools"><summary>Practice and moderator access</summary><p>Only accounts assigned the moderator role by the site owner can approve entries. This does not grant Team17 authority.</p><button class="sg-button secondary" id="cbPractice">Open private practice</button></details>':''));
   el('cbRefresh').onclick=()=>paint();if(el('cbEmptySubmit'))el('cbEmptySubmit').onclick=()=>go('submit');if(el('cbPractice'))el('cbPractice').onclick=()=>go('practice');bindEntries();bindPager();
   if(el('cbSearchForm'))el('cbSearchForm').onsubmit=e=>{e.preventDefault();query=el('cbSearch').value;page=0;paint();};
   if(el('cbOrder'))el('cbOrder').onchange=e=>{order=e.target.value;page=0;paint();};if(el('cbFilter'))el('cbFilter').onchange=e=>{queueState=e.target.value;page=0;paint();};
   el('sgContent').querySelectorAll('[data-vote]').forEach(b=>b.onclick=async()=>{if(!profile){signInForAction();return;}if(busy)return;busy=true;b.disabled=true;const s=rows.find(s=>s.id===b.dataset.vote);try{const updated=await call('vote',{id:s.id,version:s.version,support:!s.my_vote});if(t!==epoch||ticket!==serial)return;Object.assign(s,updated);await paint();notice(s.my_vote?'Your support is counted.':'Your support was removed.');}catch(e){if(t===epoch)notice(errorMessage(e)+' Refresh the board to check your support before retrying.',true);}finally{busy=false;if(b.isConnected)b.disabled=false;}});
  }catch(_){if(t===epoch&&ticket===serial){html('<div class="cb-empty"><h2 id="cbFocus" tabindex="-1">This view could not be loaded.</h2><p>This is not a confirmed empty board. Please try again.</p><button class="sg-button" id="cbRetry">Retry</button></div>');el('cbRetry').onclick=()=>paint();}}
 }
 function form(s){
  formRequest=s?.request_id||crypto.randomUUID();selected=s;uncertain=false;dirty=false;
  html('<button class="cb-text-button" id="cbCancel">← Back</button><div class="cb-form-head"><span class="cb-eyebrow">'+(s?'Revision · private until approved':'Your idea → moderator review → public board')+'</span><h2 id="cbFocus" tabindex="-1">'+(s?'Improve your suggestion':'What should be better?')+'</h2><p>Explain the problem and the change you would like. You don’t need to write a technical report.</p></div><form id="cbSubmitForm" class="sg-form cb-form"><label for="cbTitle">Give it a clear title<input id="cbTitle" name="title" minlength="8" maxlength="120" required placeholder="For example: Make helicopter controls easier to understand" value="'+esc(s?.title||'')+'"></label><label for="cbProblem">What is the problem?<textarea id="cbProblem" name="problem" minlength="20" maxlength="1500" required rows="4" placeholder="What happens, and why does it matter?">'+esc(s?.problem||'')+'</textarea></label><label for="cbOutcome">What would you change?<textarea id="cbOutcome" name="desired_outcome" minlength="10" maxlength="1000" required rows="3" placeholder="Describe a better experience.">'+esc(s?.desired_outcome||'')+'</textarea></label><div class="cb-form-pair"><label>Type<select name="kind" id="cbKind"><option value="suggestion">Improvement idea</option><option value="bug_priority" '+(s?.kind==='bug_priority'?'selected':'')+'>Prioritize a tracked bug</option></select></label><label>Related issue · optional<select id="cbIssue" name="related_issue"><option value="">No related issue</option>'+issues.map(i=>'<option value="'+esc(i.id)+'" '+(s?.related_issue===i.id?'selected':'')+'>'+esc(i.id+' · '+i.title)+'</option>').join('')+'</select></label></div><label class="sg-check"><input type="checkbox" id="cbConsent" required><span>I understand this is private until moderator approval and approved text will be public. I have read the <a href="#communityPrivacy">privacy notice</a>.</span></label><p class="cb-small">No personal details, credentials or private correspondence. '+(s?'Editing a published suggestion hides it until reapproved; support does not transfer to new wording.':'Up to three new suggestions per account in 24 hours.')+'</p><div id="cbFormFeedback" role="status" aria-live="polite"></div><div class="cb-form-actions"><button id="cbSend" class="sg-button" type="submit">'+(s?'Save revision for review':'Send to moderators')+' →</button><button class="sg-button secondary" id="cbCheckSave" type="button" hidden>Check saved copy</button></div></form>');focus();
  el('cbCancel').onclick=()=>{if(safeLeave()){dirty=false;go(s?'mine':'board');}};
  el('cbSubmitForm').oninput=()=>{dirty=true;};
  el('cbSubmitForm').onsubmit=async e=>{
   e.preventDefault();if(busy||uncertain)return;const payload=Object.fromEntries(new FormData(e.target));if(payload.kind==='bug_priority'&&!payload.related_issue){el('cbFormFeedback').textContent='Choose the tracked bug for a bug-priority suggestion.';el('cbIssue').focus();return;}
   const t=epoch;busy=true;el('cbSend').disabled=true;el('cbFormFeedback').textContent='Saving your suggestion…';
   try{const result=await call(s?'edit':'submit',{...payload,consent:true,policy_version:'community-v1',request_id:formRequest,...(s?{id:s.id,version:s.version,updated_at:s.updated_at}:{})});if(!connected(t))return;if(!result?.id)throw new Error('Missing receipt');dirty=false;receipt=result;view='receipt';showReceipt();}
   catch(error){if(connected(t)){uncertain=true;el('cbFormFeedback').textContent=errorMessage(error)+' Check the saved copy before sending again.';el('cbCheckSave').hidden=false;el('cbFormFeedback').scrollIntoView({block:'center'});}}
   finally{busy=false;}
  };
  el('cbCheckSave').onclick=async()=>{if(busy)return;busy=true;const t=epoch;try{const found=await call('find_submission',{request_id:formRequest});if(!connected(t))return;if(found){dirty=false;receipt=found;view='receipt';showReceipt();}else{uncertain=false;el('cbSend').disabled=false;el('cbFormFeedback').textContent='No saved submission was found for this attempt. Your text is still here; you may try Send to moderators again.';}}catch(_){if(connected(t))el('cbFormFeedback').textContent='The saved copy could not be checked. Keep this tab open; your text is still here.';}finally{busy=false;}};
 }
 function showReceipt(){
  const s=receipt;
  html('<section class="cb-receipt"><span class="cb-eyebrow">'+(s.state==='published'?'Visible to everyone':'Saved to your account')+'</span><h2 id="cbFocus" tabindex="-1">'+(s.state==='published'?'✓ Approved and published.':s.state==='withdrawn'?'✓ Suggestion withdrawn.':'✓ Your suggestion is saved.')+'</h2><h3>'+esc(s.title)+'</h3><dl><div><dt>Status</dt><dd>'+esc(states[s.state])+'</dd></div><div><dt>Saved</dt><dd>'+esc(date(s.updated_at))+'</dd></div><div><dt>Visibility</dt><dd>'+(s.state==='published'?'Public Bulletin Board':'Private')+'</dd></div></dl><p>'+(s.state==='published'?'Anyone can read it. Signed-in users can support it. This is site-moderator approval, not Team17 approval.':s.state==='withdrawn'?'It is no longer displayed publicly.':'A moderator can approve it for the public Bulletin Board or ask you for clarification. Nothing was sent to Team17.')+'</p><div class="cb-form-actions"><button class="sg-button" id="cbReceiptMine">View my suggestions</button><button class="sg-button secondary" id="cbReceiptBoard">View Bulletin Board</button>'+(profile?.role==='moderator'?'<button class="sg-button secondary" id="cbReceiptQueue">Open review queue</button>':'')+'</div></section>');focus();el('cbReceiptMine').onclick=()=>go('mine');el('cbReceiptBoard').onclick=()=>go('board');if(el('cbReceiptQueue'))el('cbReceiptQueue').onclick=()=>go('queue');
 }
 function detail(){
  const s=selected;if(!s)return;dirty=false;uncertain=false;const moderator=view==='queue'&&profile?.role==='moderator';
  html('<button id="cbBack" class="cb-text-button">← Back to '+(moderator?'review queue':'my suggestions')+'</button><article class="cb-detail">'+tag(s)+'<h2 id="cbFocus" tabindex="-1">'+esc(s.title)+'</h2><p class="cb-small">Received '+esc(date(s.created_at))+' · Updated '+esc(date(s.updated_at))+' · Version '+Number(s.version)+'</p><h3>The problem</h3><p>'+esc(s.problem)+'</p><h3>The proposed change</h3><p>'+esc(s.desired_outcome)+'</p>'+related(s)+(s.submitter_note?'<aside class="cb-note"><strong>Moderator reply · private</strong><p>'+esc(s.submitter_note)+'</p></aside>':'')+'<div id="cbDecisionFeedback" role="status" aria-live="polite"></div>'+(moderator?'<section class="cb-moderation"><h3>What should happen next?</h3><p>Approving publishes this exact wording. It does not represent developer approval.</p><label>Reply to the author · private<textarea id="cbModNote" maxlength="1000" rows="3" placeholder="Optional for approval; explain clarification requests or declines."></textarea></label><div class="cb-form-actions"><button class="sg-button" id="cbApprove">Approve &amp; publish</button><button class="sg-button secondary" id="cbClarify">Request clarification</button><button class="sg-button secondary" id="cbDecline">Do not publish</button></div><button class="sg-button secondary" id="cbCheckDecision" hidden>Check current status</button></section>':s.state!=='withdrawn'?'<div class="cb-form-actions"><button class="sg-button" id="cbEdit">Revise suggestion</button><button class="sg-button secondary" id="cbWithdraw">Withdraw</button></div>':'')+'<details class="cb-history"><summary>Activity history</summary>'+((s.history||[]).map(h=>'<p>'+esc(h.action.replace(/^community_/, '').replaceAll('_',' '))+' · '+esc(date(h.at))+'</p>').join('')||'<p>No activity recorded.</p>')+'</details></article>');focus();
  el('cbBack').onclick=()=>{if(safeLeave()){dirty=false;selected=null;paint();}};
  async function change(action,payload){if(busy||uncertain)return;const t=epoch;busy=true;el('sgContent').querySelectorAll('button').forEach(b=>b.disabled=true);el('cbDecisionFeedback').textContent='Saving…';
   try{const result=await call(action,{id:s.id,version:s.version,updated_at:s.updated_at,...payload});if(!connected(t))return;dirty=false;receipt=result;view='receipt';showReceipt();}
   catch(e){if(connected(t)){uncertain=true;el('cbDecisionFeedback').textContent=errorMessage(e)+' The current status needs checking before another decision.';if(el('cbCheckDecision')){el('cbCheckDecision').hidden=false;el('cbCheckDecision').disabled=false;}el('cbBack').disabled=false;}}
   finally{busy=false;}
  }
  if(moderator){el('cbModNote').oninput=()=>dirty=true;
   el('cbApprove').onclick=()=>{if(window.confirm('Publish this exact suggestion for everyone to read? This records site moderation only.'))change('moderate',{decision:'published',note:el('cbModNote').value});};
   for(const [id,decision] of [['cbClarify','needs_information'],['cbDecline','declined']])el(id).onclick=()=>{const note=el('cbModNote').value.trim();if(note.length<5){el('cbDecisionFeedback').textContent='Add a short reply so the author understands this decision.';el('cbModNote').focus();return;}change('moderate',{decision,note});};
   el('cbCheckDecision').onclick=async()=>{if(busy)return;busy=true;const note=el('cbModNote').value,t=epoch;try{const result=await call('queue',{query:s.title,state:'all'});if(!connected(t))return;const found=result.rows.find(x=>x.id===s.id);if(found){selected=found;detail();el('cbModNote').value=note;dirty=!!note;el('cbDecisionFeedback').textContent='Latest server status loaded. Compare it with your intended decision before saving.';}else{el('cbDecisionFeedback').textContent='The current record was not found in this check. Return to the queue and refresh; do not repeat the decision yet.';}}catch(_){if(connected(t))el('cbDecisionFeedback').textContent='Current status could not be checked. Your reply remains here.';}finally{busy=false;}};
  }else{if(el('cbEdit'))el('cbEdit').onclick=()=>form(s);if(el('cbWithdraw'))el('cbWithdraw').onclick=()=>{if(window.confirm('Withdraw this suggestion? It will no longer be visible publicly.'))change('withdraw',{});};}
 }
 async function show(currentIssues=[]){issues=currentIssues;if(initializing)return;
  if(initialized){auth();await paint();return;}initialized=true;initializing=true;
  document.querySelectorAll('[data-cb-view]').forEach(b=>b.onclick=()=>go(b.dataset.cbView));
  document.addEventListener('click',e=>{if(e.target.closest('[data-page],#brandHome,[data-suggestion-issue]')&&(dirty||busy)){if(busy||!safeLeave()){e.preventDefault();e.stopImmediatePropagation();}else dirty=false;}},true);
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  try{const response=await fetch('./suggestions-config.json',{cache:'no-store'});const cfg=await response.json();if(!response.ok||!validConfig(cfg))throw new Error('Community configuration unavailable');
   if(!window.HLLVSession||!window.HLLVPassword)throw new Error('Account module unavailable');
   const callback=isAuthCallback(location.hash),recover=new URLSearchParams(location.hash.replace(/^#/, '')).get('type')==='recovery';
   persistence=HLLVSession.create();HLLVPassword.markRecovery(recover);if(recover){authVisible=true;requested='password';}
   const sdk=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.0/+esm');
   client=sdk.createClient(cfg.supabase_url,cfg.publishable_key,{auth:{persistSession:true,storage:persistence.storage,storageKey:persistence.key,detectSessionInUrl:true,flowType:'implicit',autoRefreshToken:true}});
   persistence.onChange(refreshSoon);
   client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){HLLVPassword.markRecovery(true);authVisible=true;requested='password';if(!initializing)refreshSoon();}if(event==='SIGNED_OUT'){epoch++;serial++;profile=null;email='';rows=[];selected=null;receipt=null;dirty=false;view='board';html('<p>Signed out. Private content cleared.</p>');HLLVPassword.status();if(!logoutBusy)refreshSoon();}});
   await loadIdentity();if(callback)history.replaceState(null,'',location.pathname+location.search+'#suggestions');
  }catch(_){HLLVPassword?.status({available:false});html('<div class="cb-empty"><h2>Suggestion Box could not connect.</h2><p>Refresh to try again. The bug tracker and patch archive are unchanged.</p></div>');}
  finally{initializing=false;if(isAuthCallback(location.hash))history.replaceState(null,'',location.pathname+location.search+'#suggestions');}
 }
 return Object.freeze({show,requestAccount,signOut,isAuthCallback,validConfig,esc,states,card});
});
