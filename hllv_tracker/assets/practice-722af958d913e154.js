/* Moderator-only practice. Separate private RPC; never publishes or votes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HLLVPractice=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels=Object.freeze({pending:'Awaiting practice moderation',needs_information:'Clarification requested in practice',shortlisted:'Shortlisted in practice — not sent to anyone',declined:'Not selected in practice'});
 const example=Object.freeze({title:'Make sign-in status easier to see',problem:'After using the emailed sign-in link, I could not easily tell whether the website recognized my account.',desired_outcome:'Show a clear signed-in label and a visible way to reach the Review desk.'});
 function validate(row){
  if(row===null)return null;
  if(!row||Array.isArray(row)||row.practice_only!==true||row.can_publish!==false||typeof row.id!=='string'||!Number.isInteger(row.version)||row.version<1||!Object.hasOwn(labels,row.state)||!Array.isArray(row.history)||row.history.length>30)throw new Error('Unexpected practice response. No public action was attempted.');
  return row;
 }
 function mount({container,rpc,issues=[],isCurrent=()=>true}){
  if(!container||typeof rpc!=='function')return;
  let row=null,busy=false;
  const live=()=>container.isConnected&&isCurrent();
  const find=s=>container.querySelector(s);
  const shell=body=>{if(live())container.innerHTML='<section class="sg-row" aria-labelledby="practiceHeading"><span class="sg-meta">Private practice · moderator only</span><h2 id="practiceHeading">Try one suggestion privately</h2><p>Your disposable test is stored separately from real submissions. It cannot reach the Bulletin Board, any reviewer, or community votes.</p><p class="sg-muted">Use sample text only. Delete your test when finished. Deleting removes the active practice record; service backups and logs may have their own retention.</p><div id="practiceMessage" role="status" aria-live="polite"></div>'+body+'</section>';};
  function message(value){if(live()&&find('#practiceMessage'))find('#practiceMessage').textContent=value;}
  function locked(){return '<p class="sg-muted"><strong>Publication remains locked.</strong> Practice is not Team17 review or approval. The real approval process stays unchanged.</p>';}
  async function perform(action,payload={}){
   if(!live()||busy)return;
   busy=true;container.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=true);message(action==='get'?'Loading your practice…':'Saving private practice…');
   try{
    const result=await rpc('hllv_rehearsal',{action,payload,expected_id:action==='get'?null:(row?.id??null),expected_version:action==='get'?null:(row?.version??null)});
    if(!live())return;
    row=validate(result);draw();message(action==='remove'?'Practice deleted. No public entry was created.':action==='get'?'':action==='save'?'Saved privately. This is not a real submission.':'Practice decision saved. Nothing was sent to a reviewer.');
   }catch(error){
    if(live()){message('Practice could not be completed. '+(typeof error?.message==='string'?error.message:'Retry from the Review desk.'));container.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=false);}
   }finally{busy=false;}
  }
  function form(){
   const s=row||{};
   shell('<h3>1. Write a practice suggestion</h3><form class="sg-form" id="practiceForm"><label for="practiceKind">Type</label><select id="practiceKind" name="kind"><option value="suggestion">Improvement suggestion</option><option value="bug_priority" '+(s.kind==='bug_priority'?'selected':'')+'>Priority for an existing tracked bug</option></select><label for="practiceTitle">What should improve?</label><input id="practiceTitle" name="title" minlength="8" maxlength="120" required value="'+esc(s.title||'')+'"><label for="practiceProblem">What happens now, and why does it matter?</label><textarea id="practiceProblem" name="problem" minlength="20" maxlength="1500" required>'+esc(s.problem||'')+'</textarea><label for="practiceOutcome">What would a better experience look like?</label><textarea id="practiceOutcome" name="desired_outcome" minlength="10" maxlength="1000" required>'+esc(s.desired_outcome||'')+'</textarea><label for="practiceIssue">Related issue (required for bug priority)</label><select id="practiceIssue" name="related_issue"><option value="">No related issue</option>'+issues.map(i=>'<option value="'+esc(i.id)+'" '+(s.related_issue===i.id?'selected':'')+'>'+esc(i.id+' — '+i.title)+'</option>').join('')+'</select><label class="sg-check"><input type="checkbox" name="practice_ack" required><span>This is private practice, not a real community submission.</span></label><div class="sg-actions"><button class="sg-button" type="submit">Save private practice</button><button class="sg-button secondary" type="button" id="practiceExample">Use example text</button>'+(row?'<button class="sg-button secondary" type="button" id="practiceCancel">Cancel revision</button>':'')+'</div></form>'+locked());
   find('#practiceForm').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.practice_ack=data.practice_ack==='on';if(data.kind==='bug_priority'&&!data.related_issue){message('Choose the related bug, or select improvement suggestion.');return;}perform('save',data);};
   find('#practiceExample').onclick=()=>{find('#practiceKind').value='suggestion';find('#practiceIssue').value='';find('#practiceTitle').value=example.title;find('#practiceProblem').value=example.problem;find('#practiceOutcome').value=example.desired_outcome;message('Example filled in. Nothing is saved until you choose Save private practice.');};
   if(row)find('#practiceCancel').onclick=draw;
  }
  function draw(){
   if(!live())return;if(!row){form();return;}
   const issue=issues.find(i=>i.id===row.related_issue);
   shell('<h3>2. Try a moderation decision</h3><p class="sg-meta">'+esc(labels[row.state])+' · version '+Number(row.version)+'</p><h3>'+esc(row.title)+'</h3><p>'+esc(row.problem)+'</p><p><strong>Desired outcome:</strong> '+esc(row.desired_outcome)+'</p>'+(issue?'<p><a href="#'+esc(issue.id)+'" data-suggestion-issue="'+esc(issue.id)+'">Related issue: '+esc(issue.title)+' →</a></p>':'')+(row.note?'<p><strong>Practice note:</strong> '+esc(row.note)+'</p>':'')+'<form class="sg-form" id="practiceDecision"><label for="practiceState">Practice decision</label><select id="practiceState" name="action"><option value="needs_information">Ask for clarification</option><option value="shortlisted">Shortlist this practice entry</option><option value="declined">Not selected</option><option value="pending">Return to awaiting moderation</option></select><label for="practiceNote">Practice note (required for clarification or not selected)</label><textarea id="practiceNote" name="note" maxlength="1000"></textarea><div class="sg-actions"><button class="sg-button" type="submit">Save practice decision</button><button class="sg-button secondary" type="button" id="practiceEdit">Revise practice wording</button><button class="sg-button secondary" type="button" id="practiceDelete">Delete my practice</button></div></form><details class="sg-process"><summary>Practice history</summary><div>'+row.history.map(h=>'<p>Version '+Number(h.version)+' · '+esc(labels[h.state]||'Practice event')+' · '+esc(String(h.at||'').slice(0,19).replace('T',' '))+' UTC</p>').join('')+'</div></details>'+locked());
   find('#practiceDecision').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(['needs_information','declined'].includes(data.action)&&data.note.trim().length<5){message('Add a short practice note explaining that decision.');return;}perform(data.action,{note:data.note});};
   find('#practiceEdit').onclick=form;
   find('#practiceDelete').onclick=()=>{if(window.confirm('Delete your disposable practice entry and its history? Real suggestions are unaffected.'))perform('remove');};
  }
  shell('<button type="button" class="sg-button" id="practiceStart">Start private practice</button>'+locked());
  find('#practiceStart').onclick=()=>perform('get');
 }
 return Object.freeze({mount,esc,validate,labels,example});
});
