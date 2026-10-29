(() => {
  'use strict';
  const FORMATS = {
    standard: {name:'Standard relay', miles:200, min:7, max:12, legs:36, duration:'Overnight'},
    ultra: {name:'Ultra relay', miles:200, min:4, max:6, legs:36, duration:'Overnight'},
    sprint: {name:'Sprint relay', miles:60, min:4, max:6, legs:12, duration:'One day'},
    sprintUltra: {name:'Sprint ultra', miles:60, min:2, max:3, legs:12, duration:'One day'}
  };
  const TASKS = [
    ['format','Choose our race format','Agree on the distance and team size.'],
    ['crew','Get the crew together','Confirm who wants to take part.'],
    ['budget','Agree on a shared budget','Include entry, transport, food, and any lodging.'],
    ['transport','Plan our transport','Decide who drives and how the crew gets around.'],
    ['rest','Talk through rest and lodging','Make room for recovery and the trip home.'],
    ['guide','Get everyone oriented','Share the basic relay idea with the whole team.'],
    ['registration','Confirm our entry with the organizer','Checking this box does not register a team.'],
    ['route','Review the final handbook and route','Wait for official 2027 instructions before finalizing exchanges.'],
    ['gear','Make a packing list','Confirm required gear against the final handbook.'],
    ['contact','Agree on our communication plan','Know how the team will stay in contact.']
  ];
  const TASK_IDS = TASKS.map(t => t[0]);
  const emptyRoster = () => Array.from({length:12}, () => ({name:'',group:'unassigned'}));
  const defaultPlan = () => ({name:'',format:'standard',roster:emptyRoster(),tasks:[],notes:'',pace:10,sample:false});
  function normalizePlan(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(FORMATS, raw.format)) throw new Error('This file does not contain a supported relay plan.');
    const clean = defaultPlan();
    clean.format = raw.format;
    clean.name = typeof raw.name === 'string' ? raw.name.slice(0,60) : '';
    clean.notes = typeof raw.notes === 'string' ? raw.notes.slice(0,2000) : '';
    clean.tasks = [...new Set(Array.isArray(raw.tasks) ? raw.tasks.filter(id => TASK_IDS.includes(id)) : [])];
    clean.roster = emptyRoster().map((_,i) => {
      const row = Array.isArray(raw.roster) ? raw.roster[i] : null;
      return {name:typeof row?.name === 'string' ? row.name.slice(0,40) : '', group:['unassigned','a','b','support'].includes(row?.group) ? row.group : 'unassigned'};
    });
    clean.pace = Number.isFinite(raw.pace) ? Math.min(16,Math.max(6,raw.pace)) : 10;
    clean.sample = raw.sample === true;
    return clean;
  }
  function parseImport(text) {
    const raw = JSON.parse(text);
    if (raw?.schema !== 'relay-fieldguide/v1') throw new Error('Choose a plan exported by Relay Fieldguide (version 1).');
    return normalizePlan(raw.plan);
  }
  function estimateMinutes(format, pace) {
    if (!Object.hasOwn(FORMATS, format) || !Number.isFinite(pace) || pace < 6 || pace > 16) throw new Error('Invalid estimate inputs.');
    return Math.round(FORMATS[format].miles * pace);
  }
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = {normalizePlan,parseImport,estimateMinutes,FORMATS,TASK_IDS};
    return;
  }

  const $ = (s,root=document) => root.querySelector(s);
  const $$ = (s,root=document) => [...root.querySelectorAll(s)];
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORAGE_KEY = 'dfe.relay.fieldguide.v1';
  const views = ['overview','guide','updates','plan'];
  const defaults = () => ({version:1,detail:'simple',appearance:'dark',lesson:0,learned:[],reviewed:[],returning:'returning',plan:defaultPlan()});
  let state = defaults(), storageOK = true, currentView='overview', baton=0, toastTimer;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if(saved?.version === 1) {
      state.plan = normalizePlan(saved.plan);
      if(['simple','moderate','expert'].includes(saved.detail)) state.detail = saved.detail;
      if(['dark','light'].includes(saved.appearance)) state.appearance = saved.appearance;
      if(Number.isInteger(saved.lesson) && saved.lesson>=0 && saved.lesson<4) state.lesson = saved.lesson;
      state.learned = [...new Set((Array.isArray(saved.learned)?saved.learned:[]).filter(n => Number.isInteger(n)&&n>=0&&n<4))];
      state.reviewed = [...new Set((Array.isArray(saved.reviewed)?saved.reviewed:[]).filter(n => ['owner','return','transfer','registration'].includes(n)))];
      if(['returning','registered','new'].includes(saved.returning)) state.returning = saved.returning;
    }
  } catch { storageOK=false; }

  function toast(text) { const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500); }
  function save() {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); storageOK=true; } catch {storageOK=false;}
    $('#save-status').textContent=storageOK?'Saved on this device':'Saving unavailable in this browser';
    $('.local-notice span:last-child').textContent=storageOK?'This plan saves in this browser. Export a snapshot to share; teammates’ changes do not sync.':'Browser saving is unavailable. Export your plan to keep a copy before leaving.';
  }
  function showView(view, move=true) {
    if(!views.includes(view)) view='overview';
    currentView=view;
    $$('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);
    $$('.primary-nav [data-view]').forEach(el=>{if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    if(location.hash!==`#${view}`) history.replaceState(null,'',`#${view}`);
    if(move){window.scrollTo({top:0,behavior:'instant'});const title=$(`#view-${view} h1`);title.setAttribute('tabindex','-1');title.focus({preventScroll:true});}
  }
  function applyDetail() {
    $('#relay-app').dataset.detail=state.detail;
    $$('button[data-detail]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.detail===state.detail)));
    $('#detail-hint').textContent={simple:'Just the next useful step.',moderate:'The essentials, with more context.',expert:'Planning detail and estimates, too.'}[state.detail];
  }
  function applyAppearance() {
    document.documentElement.dataset.appearance=state.appearance;
    $('#theme-toggle').textContent=state.appearance==='dark'?'☼':'☾';
    $('#theme-toggle').setAttribute('aria-label',`Switch to ${state.appearance==='dark'?'light':'dark'} mode`);
  }
  function updateCounts() {
    const f=FORMATS[state.plan.format], count=state.plan.tasks.length;
    const named=state.plan.roster.slice(0,f.max).filter(r=>r.name.trim()).length;
    $('#roster-count').textContent=`${named} / ${f.max}`;
    $('#roster-minimum').textContent=named>=f.min?'Minimum team size reached in this draft':`At least ${f.min} runners for this format`;
    $('#task-count').textContent=`${count} / ${TASKS.length}`;
    $('#side-progress-label').textContent=`${count} of ${TASKS.length} preparation tasks`;
    $('#side-progress').style.width=$('#task-progress').style.width=`${count/TASKS.length*100}%`;
    $('#journey-start').textContent=f.miles===60?'BEAR BROOK':'WHITE MOUNTAINS';
    $('#journey-svg').setAttribute('aria-label',f.miles===60?'Conceptual sprint journey from Bear Brook State Park to Hampton Beach; not a navigation map':'Conceptual journey from the White Mountains through the Lakes Region to Hampton Beach; not a navigation map');
    $('#fact-distance').innerHTML=`~${f.miles} <small>miles</small>`;
    $('#fact-team').innerHTML=`${f.min}–${f.max} <small>runners</small>`;
    $('#fact-legs').innerHTML=`${f.legs} <small>legs</small>`;
    $('#sample-label').textContent=state.plan.sample?'Sample team · editable':'Local draft';
    if(state.learned.length<4){$('#next-title').textContent=state.learned.length?'Keep getting your bearings.':'Get a feel for the relay.';$('#next-copy').textContent=`${state.learned.length} of 4 guide stops complete. A few minutes now can make the adventure feel much more familiar.`;$('#next-action').dataset.view='guide';$('#next-action').textContent='Continue the fieldguide →';}
    else {const next=TASKS.find(t=>!state.plan.tasks.includes(t[0]));$('#next-title').textContent=next?next[1]:'You’ve worked through the plan.';$('#next-copy').textContent=next?next[2]:'Keep checking official updates as race day gets closer. Your checklist is a preparation aid, not a race entry.';$('#next-action').dataset.view=next?'plan':'updates';$('#next-action').textContent=next?'Open our team plan →':'Check the latest snapshot →';}
  }
  function renderRoster() {
    const f=FORMATS[state.plan.format];
    $('#roster').innerHTML=state.plan.roster.slice(0,f.max).map((r,i)=>`<div class="roster-row"><span class="roster-index">${String(i+1).padStart(2,'0')}</span><input data-runner="${i}" aria-label="Runner ${i+1} name" maxlength="40" placeholder="Runner ${i+1}" value="${escape(r.name)}" autocomplete="off"><select data-group="${i}" aria-label="Runner ${i+1} planning group">${[['unassigned','No group'],['a','Group A'],['b','Group B'],['support','Support']].map(([v,l])=>`<option value="${v}"${v===r.group?' selected':''}>${l}</option>`).join('')}</select></div>`).join('');
  }
  function renderChecklist() {
    $('#checklist').innerHTML=TASKS.map(([id,title,description])=>`<div class="task${state.plan.tasks.includes(id)?' done':''}"><input type="checkbox" id="task-${id}" data-task="${id}"${state.plan.tasks.includes(id)?' checked':''}><label for="task-${id}"><span>${title}</span><small class="detail-more">${description}</small>${id==='registration'?'<small>Planning only — this does not register your team.</small>':''}</label></div>`).join('');
  }
  function updateEstimate() {
    const pace=state.plan.pace, total=estimateMinutes(state.plan.format,pace);
    $('#pace-label').textContent=`${Math.floor(pace)}:${String(Math.round((pace%1)*60)).padStart(2,'0')} / mile`;
    $('#pace-result').textContent=`About ${Math.floor(total/60)}h ${total%60}m of running`;
  }
  function renderPlan() {
    $('#team-name').value=state.plan.name;$('#team-notes').value=state.plan.notes;
    $('#plan-format').value=$('#overview-format').value=state.plan.format;
    $('#pace').value=state.plan.pace;renderRoster();renderChecklist();updateEstimate();updateCounts();
  }
  const lessons=[
    {short:'The idea',title:'One team. One shared journey.',body:'A relay divides a long route into shorter sections called legs. One teammate runs a section, then hands the next one over to another runner. The team makes progress together.',more:'Running is only one part of it. Between your turns, you’ll coordinate with teammates, eat, recover, and move between permitted locations.',expert:'Leg distances and difficulty can vary. Do not divide the total mileage evenly and treat that as an assignment: the final leg schedule and event rules are what count.',list:[],demo:true},
    {short:'The rhythm',title:'Run. Recover. Cheer. Repeat.',body:'Picture your day as a rhythm, not one continuous run. Your running turn is followed by time supporting the crew and getting ready for what comes next.',more:'For an overnight format, talk about transport and rest early. Planning groups can help organize people, but the official handbook determines vehicle and exchange requirements.',expert:'A spreadsheet pace is not an arrival guarantee. Hills, stops, weather, and exchanges can change the timing. Keep estimates separate from organizer instructions.',list:['Know who you’re handing over to.','Know how you’ll reconnect with your crew.','Plan how everyone gets home after the finish.']},
    {short:'Your crew',title:'Start with people, then decisions.',body:'You don’t need every answer on day one. Start with who is interested, choose a format, and agree on the next decision you need to make together.',more:'The team plan is a shared conversation starter. Add names, put people into optional planning groups, and keep notes on the decisions you’ve made.',expert:'This demo keeps a local draft. Exported files are snapshots: assigning someone to a group does not invite them, register them, or update a race system.',list:['Choose a format your crew wants to take on.','Agree who is organizing the entry and transport.','Pick a date to revisit the plan.']},
    {short:'Before you go',title:'Know what is official.',body:'Use this companion to prepare. Use the organizer’s current handbook, announcements, and registration system for the final details.',more:'The current snapshot has a published event date and team formats. Final leg maps, detailed exchange instructions, prices, and start waves are not supplied here.',expert:'Before this could become an organizer’s tool, each update would need a named owner, review date, and a clear route for corrections. This demo links directly to its sources.',list:['Check the date and registration details.','Read the final handbook when published.','Confirm required gear and course instructions.']}
  ];
  function renderGuide() {
    $('#lesson-tabs').innerHTML=lessons.map((l,i)=>`<button data-lesson="${i}" aria-pressed="${i===state.lesson}" class="${state.learned.includes(i)?'done':''}"><span class="step-number">${state.learned.includes(i)?'✓':i+1}</span>${l.short}</button>`).join('');
    const l=lessons[state.lesson];
    $('#lesson-content').innerHTML=`<span class="tiny-label">STOP ${state.lesson+1} OF 4 · ${state.learned.includes(state.lesson)?'COMPLETED':'A QUICK READ'}</span><h2 tabindex="-1">${l.title}</h2><p>${l.body}</p>${l.demo?`<div class="baton-demo"><span class="tiny-label">TRY A HANDOFF · FOUR RUNNERS FOR ILLUSTRATION</span><div class="baton-runners" id="baton-runners"></div><p id="baton-caption" class="baton-caption"></p><button class="text-button" data-action="handoff">Pass to the next runner →</button></div>`:''}${l.list.length?`<ul>${l.list.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}<p class="detail-more">${l.more}</p><p class="detail-expert">${l.expert}</p><div class="lesson-footer"><button class="button primary" data-action="complete-lesson">${state.lesson===3?'Got it. Open our team plan':'Got it. Next stop'} →</button>${state.lesson>0?'<button class="text-button" data-action="previous-lesson">← Previous stop</button>':''}</div>`;
    if(l.demo)renderBaton();
  }
  function renderBaton() {
    if(!$('#baton-runners'))return;
    $('#baton-runners').innerHTML=['A','B','C','D'].map((n,i)=>`<div class="demo-runner${i===baton%4?' active':''}"><span class="runner-circle">${n}</span>${i===baton%4?'Running':'Crew'}</div>`).join('');
    $('#baton-caption').textContent=`Illustration: runner ${['A','B','C','D'][baton%4]} takes this leg. Actual assignments follow the official race rules.`;
  }
  const official='https://millenniumrunning.com/reachthebeach/';
  const announcement='https://millenniumrunning.com/press-release-millennium-running-to-acquire-reach-the-beach-relay/54727/';
  const updates=[
    {id:'owner',day:'29',month:'AUG 2026',label:'ORGANIZER',title:'Millennium takes the next chapter.',body:'Millennium announced an agreement to acquire Reach the Beach. Co-founder Mike Dionne is joining the team.',more:'Use Millennium’s event page as your starting point for new announcements.',source:announcement,link:'Read the acquisition announcement'},
    {id:'return',day:'17–18',month:'SEP 2027',label:'EVENT DATE',title:'The next start line is in 2027.',body:'The 2026 race was postponed. The official event page now lists September 17–18, 2027.',more:'Recheck any travel arrangements against the current organizer information.',source:official,link:'Check the official event date'},
    {id:'transfer',day:'29',month:'AUG 2026',label:'REGISTERED TEAMS',title:'Already entered for 2026?',body:'Previously registered teams are promised entry into 2027. Detailed transfer terms need confirmation directly with the organizer.',more:'A guaranteed entry does not establish refund options or any additional charges. This prototype does not process transfers.',source:announcement,link:'Read the registered-team announcement'},
    {id:'registration',day:'01',month:'DEC 2026',label:'REGISTRATION',title:'A date to put on the calendar.',body:'The official page lists December 1, 2026 as registration opening day.',more:'Visit the official registration destination when it opens. This companion does not accept entries or payments.',source:official,link:'Check registration information'}
  ];
  function renderUpdates() {
    $('#returning').value=state.returning;
    $('#returning-note').textContent={returning:'Start with the ownership and date changes. Mark an announcement reviewed to keep track of what you’ve read.',registered:'Your previous entry matters. Start with the transfer announcement, then confirm your individual situation with Millennium.',new:'Here is the current starting point. You can also use “My first relay” for a short introduction.'}[state.returning];
    const list=state.returning==='registered'?[updates[2],updates[1],updates[0],updates[3]]:state.returning==='new'?updates.filter(u=>u.id!=='transfer'):updates;
    $('#updates-list').innerHTML=list.map(u=>`<article class="update-row"><div class="update-date"><strong>${u.day}</strong>${u.month}</div><div><span class="tag">${u.label}</span><h2>${u.title}</h2><p>${u.body}</p><p class="detail-more">${u.more}</p><a class="source-link" href="${u.source}" target="_blank" rel="noopener noreferrer">${u.link} ↗</a></div><button class="review-button" data-review="${u.id}" aria-label="${state.reviewed.includes(u.id)?'Mark unread':'Mark reviewed'}: ${u.title}" aria-pressed="${state.reviewed.includes(u.id)}">${state.reviewed.includes(u.id)?'✓ Reviewed':'Mark reviewed'}</button></article>`).join('');
  }
  function dialog(title,content) {$('#dialog-title').textContent=title;$('#dialog-content').innerHTML=content;$('#info-dialog').showModal();}
  function sources() {
    dialog('A prototype with a purpose.',`<p>Relay Fieldguide explores how Daily Flyer could help people prepare for Reach the Beach. It is an independent concept by Holtsnider Tech, not an official Millennium Running or Ragnar product.</p><h3>What works here</h3><p>The guide, detail levels, reviewed updates, editable crew, checklist, and plan exports work. Changes are saved in your current browser when storage is available.</p><h3>What is still a demonstration</h3><p>There is no shared team account, live tracking, registration integration, payment processing, or organizer approval. Sample names are fictional. The overview drawing is not a course map. No data is sent to a race organizer.</p><h3>Sources · checked October 29, 2026</h3><ul><li><a href="${official}" target="_blank" rel="noopener noreferrer">Millennium: Reach the Beach event page ↗</a> — date, formats, registration opening.</li><li><a href="${announcement}" target="_blank" rel="noopener noreferrer">Millennium: August 29 acquisition announcement ↗</a> — transition and previously registered teams.</li></ul><p>Information is a dated snapshot and may change. Follow the official event page for current instructions. Planning checklists are suggestions, not official race requirements.</p>`);
  }
  function samplePlan() {
    const p=defaultPlan();p.name='Coastbound Crew';p.sample=true;
    ['Alex','Sam','Jordan','Casey','Taylor','Morgan','Riley','Jamie'].forEach((name,i)=>{p.roster[i]={name,group:i<6?'a':'b'};});
    p.tasks=['format','crew','guide'];p.notes='Sample plan: agree on the transport budget at our next team check-in. All names and decisions here are fictional.';
    state.plan=p;renderPlan();save();toast('Sample team loaded. Make it your own.');
  }
  function reset() {state=defaults();baton=0;applyDetail();applyAppearance();renderPlan();renderGuide();renderUpdates();save();showView('overview');toast('Demo reset. Start fresh.');}
  function exportPlan() {
    const doc={schema:'relay-fieldguide/v1',exportedAt:new Date().toISOString(),notice:'Local planning snapshot; not an official race entry. Changes do not sync.',plan:state.plan};
    const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='relay-team-plan.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Plan exported as a shareable snapshot.');
  }
  $('#relay-app').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.view){showView(button.dataset.view);return;}
    if(button.dataset.detail){state.detail=button.dataset.detail;applyDetail();save();return;}
    if(button.dataset.lesson!==undefined){state.lesson=Number(button.dataset.lesson);renderGuide();save();return;}
    if(button.dataset.review){const id=button.dataset.review;state.reviewed=state.reviewed.includes(id)?state.reviewed.filter(x=>x!==id):[...state.reviewed,id];renderUpdates();save();$(`[data-review="${id}"]`).focus({preventScroll:true});return;}
    if(button.id==='theme-toggle'){state.appearance=state.appearance==='dark'?'light':'dark';applyAppearance();save();return;}
    switch(button.dataset.action){
      case 'handoff':baton++;renderBaton();break;
      case 'complete-lesson':if(!state.learned.includes(state.lesson))state.learned.push(state.lesson);if(state.lesson<3){state.lesson++;renderGuide();$('#lesson-content h2').focus({preventScroll:true});}else{if(state.learned.length===4&&!state.plan.tasks.includes('guide'))state.plan.tasks.push('guide');renderChecklist();showView('plan');toast(state.learned.length===4?'Guide complete. One preparation task checked.':'Your team plan is ready. You can return to the remaining guide stops.');}updateCounts();save();break;
      case 'previous-lesson':state.lesson=Math.max(0,state.lesson-1);renderGuide();save();break;
      case 'sources':sources();break;
      case 'close-dialog':$('#info-dialog').close();break;
      case 'sample':if(state.plan.name||state.plan.tasks.length||state.plan.notes||state.plan.roster.some(r=>r.name)){dialog('Replace your current plan?', '<p>Loading the sample will replace this browser’s team name, roster, checklist, and notes. Export your current plan first if you want to keep it.</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Keep my plan</button><button class="button primary" data-action="confirm-sample">Load sample team</button></div>');}else samplePlan();break;
      case 'confirm-sample':$('#info-dialog').close();samplePlan();break;
      case 'export':exportPlan();break;
      case 'import':$('#import-file').click();break;
      case 'print':window.print();break;
      case 'reset':dialog('Start fresh on this device?', '<p>This clears your local team plan, guide progress, reviewed announcements, and appearance choices. Export the plan first if you want to keep it.</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Keep my progress</button><button class="button primary" data-action="confirm-reset">Reset this demo</button></div>');break;
      case 'confirm-reset':$('#info-dialog').close();reset();break;
      case 'confirm-import':if(pendingImport){state.plan=pendingImport;pendingImport=null;renderPlan();save();$('#info-dialog').close();toast('Imported your plan snapshot.');}break;
    }
  });
  $('#relay-app').addEventListener('input',event=>{
    const e=event.target;
    if(e.id==='team-name')state.plan.name=e.value.slice(0,60);
    else if(e.id==='team-notes')state.plan.notes=e.value.slice(0,2000);
    else if(e.dataset.runner!==undefined){state.plan.roster[Number(e.dataset.runner)].name=e.value.slice(0,40);updateCounts();}
    else if(e.id==='pace'){state.plan.pace=Number(e.value);updateEstimate();}
    else return;
    save();
  });
  $('#relay-app').addEventListener('change',event=>{
    const e=event.target;
    if(e.id==='plan-format'||e.id==='overview-format'){state.plan.format=e.value;renderPlan();save();toast('Format updated. Names outside this format stay saved.');}
    else if(e.dataset.group!==undefined){state.plan.roster[Number(e.dataset.group)].group=e.value;save();}
    else if(e.dataset.task){const id=e.dataset.task;state.plan.tasks=e.checked?[...new Set([...state.plan.tasks,id])]:state.plan.tasks.filter(x=>x!==id);e.closest('.task').classList.toggle('done',e.checked);updateCounts();save();}
    else if(e.id==='returning'){state.returning=e.value;renderUpdates();save();}
  });
  let pendingImport=null;
  $('#import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>128000)throw new Error('This file is too large. Choose a Relay Fieldguide plan export.');pendingImport=parseImport(await file.text());dialog('Import this team plan?',`<p>Replace this browser’s current plan with <strong>${escape(pendingImport.name||'Untitled crew')}</strong>? This imports a snapshot, not a live shared team.</p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Cancel</button><button class="button primary" data-action="confirm-import">Import snapshot</button></div>`);}catch(error){pendingImport=null;toast(error instanceof SyntaxError?'That file is not valid JSON. Choose a Relay Fieldguide export.':error.message);}finally{event.target.value='';}
  });
  $('#info-dialog').addEventListener('click',event=>{if(event.target===$('#info-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(views.includes(view))showView(view);});
  applyDetail();applyAppearance();renderGuide();renderUpdates();renderPlan();save();showView(location.hash.slice(1)||'overview',false);
})();
