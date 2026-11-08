import { BoardStore, makeTask, parseCapture, normalizeWorkspace, transitionTask, toCSV, safeUrl } from './model.mjs';
import { createSeedWorkspace } from './seed.mjs';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const now = () => new Date().toISOString();
const localDate = value => value ? new Date(`${value.slice(0,10)}T12:00:00`) : null;
const dateLabel = value => { if(!value) return ''; if(value===today()) return 'Today'; return localDate(value).toLocaleDateString(undefined,{month:'short',day:'numeric'}); };
const fullDate = value => value ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Never';
const areaName = {career:'Career',life:'Life',dfe:'DFE'};
const statusName = {inbox:'Inbox',next:'Next',doing:'In progress',waiting:'Waiting',done:'Done',someday:'Someday'};
const statusList = Object.keys(statusName);
const columnHints = {inbox:'Capture it. Sort it later.',next:'Ready when you are.',doing:'Keep this small.',waiting:'Give it a follow-up date.',done:'Finished means finished.'};
const iconPaths = {
  board:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1M5.5 12h1M11.5 12h1"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
  moon:'<path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/>',
  inbox:'<path d="m4 4-2 9v6a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-6l-2-9H4Z"/><path d="M2 13h6l2 3h4l2-3h6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  review:'<path d="M3 11a9 9 0 0 1 15.5-6L21 8M21 3v5h-5M21 13A9 9 0 0 1 5.5 19L3 16M3 21v-5h5"/>',
  archive:'<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7M9 11h6"/>',
  later:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  pin:'<path d="m16 3 5 5-4 1-3 5v3l-2 2-3-4-4-3 2-2h3l5-3 1-4Z"/><path d="m9 15-6 6"/>',
  external:'<path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  'list-plus':'<path d="M3 5h12M3 11h12M3 17h7M18 14v8M14 18h8"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  note:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.01"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3Z M13 6l5 5"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3"/>',
  flag:'<path d="M4 22V3c5-4 11 4 16 0v11c-5 4-11-4-16 0"/>',
  focus:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
};
const icon = (name,cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.note}</svg>`;
const iconButton = (name,action,label,extra='') => `<button class="icon-button" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(name)}</button>`;
const selectOptions = (entries,selected) => entries.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');
const taskOptions = selected => selectOptions(Object.entries(statusName),selected);
let storage;
try { storage=window.localStorage; } catch { storage={getItem:()=>{throw new Error('Browser storage is unavailable.');},setItem:()=>{throw new Error('Browser storage is unavailable.');}}; }
const store=new BoardStore({storage,initialState:createSeedWorkspace()});
let ui={view:'board',area:'all',query:'',project:'',priority:'all',layout:'board',mobileStatus:'next'};
let editingId=null, dirty=false, toastTimer, pendingImport=null, dragId=null, focusReturn=null;
const views=['board','today','inbox','upcoming','projects','review','someday','archive'];
const pageInfo={
  board:['My board','A place for what needs doing. One next step at a time.'],
  today:['Today','Choose a small day. Three things is a useful starting point.'],
  inbox:['Inbox','Get it out of your head. You can organize it afterwards.'],
  upcoming:['Dates & follow-ups','Real deadlines and things to check back on.'],
  projects:['Projects','Keep the context here. Bring only the next action onto your board.'],
  review:['Weekly reset','A few minutes to make the next week manageable.'],
  someday:['Someday','Worth keeping. No commitment to do it now.'],
  archive:['Archive','Out of the way, still here when you need it.'],
};
const taskById = id => store.state.tasks.find(t=>t.id===id);
const projectById = id => store.state.projects.find(p=>p.id===id);
const activeTasks = () => store.state.tasks.filter(t=>!t.archived && t.status!=='done' && t.status!=='someday');
const matches = t => (ui.area==='all'||t.area===ui.area) && (!ui.project||t.projectId===ui.project) && (ui.priority==='all'||t.priority===ui.priority) && (!ui.query||`${t.title} ${t.notes} ${t.url} ${projectById(t.projectId)?.name||''} DB-${t.number}`.toLowerCase().includes(ui.query.toLowerCase()));
const sortTasks = list => [...list].sort((a,b)=>a.order-b.order||a.number-b.number);
const filteredTasks = () => sortTasks(store.state.tasks.filter(matches));
const areaBadge = area => `<span class="area-label"><span class="area-dot ${area}"></span>${areaName[area]}</span>`;
const issueKey = task => `DB-${String(task.number).padStart(3,'0')}`;
const dueValue = task => task.status==='waiting' ? [task.followUp,task.due].filter(Boolean).sort()[0]||'' : task.due;
const dueTag = task => { const val=dueValue(task); if(!val) return ''; const done=task.status==='done'; const cls=!done&&val<today()?'overdue':!done&&val===today()?'today':''; return `<span class="tag ${cls}" title="${esc(task.status==='waiting'&&task.followUp===val?'Follow up':'Due')}: ${esc(val)}">${icon(task.status==='waiting'?'review':'calendar')}${esc(dateLabel(val))}</span>`; };
function notify(message,{undo=false,error=false}={}){
  clearTimeout(toastTimer);const el=$('#toast');el.className=`toast${error?' error':''}`;el.hidden=false;
  el.innerHTML=`<span>${esc(message)}</span>${undo?`<button data-action="undo" data-revision="${store.state.revision}">Undo</button>`:''}${error?'<button data-action="dismiss-toast">Dismiss</button>':''}`;
  if(!error)toastTimer=setTimeout(()=>{el.hidden=true;},6000);
}
function commit(mutator,message,{undo=true,rerender=true}={}){
  try {store.commit(mutator);$('#toast').hidden=true;if(rerender)render();if(message)notify(message,{undo});return true;}
  catch(error){$('#save-status').classList.add('error');$('#save-status').innerHTML='<span class="save-dot"></span><span>Change was not saved</span>';notify(error.message||'Could not save. Export your board before closing.',{error:true});return false;}
}
function updateTask(id,changes,message){return commit(state=>{const task=state.tasks.find(t=>t.id===id);if(!task)throw new Error('This task no longer exists. Reload the board.');Object.assign(task,changes,{updatedAt:now(),starter:false});},message);}
function setView(view){if(!views.includes(view))view='board';ui.view=view;ui.project='';ui.priority='all';ui.query='';$('#search').value='';document.body.classList.remove('sidebar-open');$('.mobile-menu').setAttribute('aria-expanded','false');if(location.hash!==`#${view}`)history.pushState(null,'',`#${view}`);render();window.scrollTo({top:0,behavior:'instant'});}
function renderNav(){
  const all=activeTasks();const nav=[['board','board','My board',all.length],['today','focus','Today',all.filter(t=>t.today).length],['inbox','inbox','Inbox',all.filter(t=>t.status==='inbox').length],['upcoming','calendar','Dates & follow-ups',all.filter(t=>dueValue(t)).length],['projects','folder','Projects',''],['review','review','Weekly reset',''],['someday','later','Someday',store.state.tasks.filter(t=>!t.archived&&t.status==='someday').length]];
  $('#main-nav').innerHTML=nav.map(([view,ico,label,count])=>`<button class="nav-item ${ui.view===view?'active':''}" data-view="${view}" ${ui.view===view?'aria-current="page"':''}>${icon(ico)}<span>${label}</span>${count!==''?`<span class="nav-count">${count}</span>`:''}</button>`).join('');
  $('#area-nav').innerHTML=Object.entries(areaName).map(([area,name])=>`<button class="nav-item ${ui.area===area?'active':''}" data-area="${area}" aria-pressed="${ui.area===area}"><span class="area-dot ${area}"></span><span>${name}</span><span class="nav-count">${all.filter(t=>t.area===area).length}</span></button>`).join('');
}
function renderNotice(){
  let out='';
  if(store.loadIssue)out+=`<div class="notice error">${icon('info')}<div class="notice-copy"><strong>Check your saved workspace</strong><p>${esc(store.loadIssue)}</p></div><button class="text-button" data-action="settings">Backup & restore</button></div>`;
  if(!store.state.settings.welcomeDismissed&&!store.state.tasks.length){out+=`<div class="notice">${icon('info')}<div class="notice-copy"><strong>Your workspace is ready.</strong><p>Add a task, paste a list, or import your prepared board. Nothing else to configure.</p></div><button class="text-button" data-action="import">Import board</button>${iconButton('close','dismiss-welcome','Dismiss introduction')}</div>`;}else if(!store.state.settings.welcomeDismissed){out+=`<div class="notice">${icon('info')}<div class="notice-copy"><strong>Your board is ready.</strong><p>Starter suggestions are editable. Pin a few to Today, or clear them and start with your own.</p></div><button class="text-button" data-action="clear-starters">Clear suggestions</button>${iconButton('close','dismiss-welcome','Dismiss introduction')}</div>`;}
  $('#notice-region').innerHTML=out;
}
function renderFocus(){
  const el=$('#focus-strip');if(['today','review','projects','archive'].includes(ui.view)){el.hidden=true;return;}el.hidden=false;
  const focus=sortTasks(store.state.tasks.filter(t=>t.today&&!t.archived&&t.status!=='done'&&t.status!=='someday'));
  el.innerHTML=`<button class="focus-label" data-view="today">${icon('focus')}<span>Today<small>A small, useful shortlist</small></span></button><div class="focus-items">${focus.length?focus.slice(0,3).map(t=>`<div class="focus-mini">${iconButton('check','complete',`Complete ${t.title}`,`data-id="${esc(t.id)}"`)}<button class="task-link" data-action="edit" data-id="${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</button></div>`).join(''):`<div class="focus-empty">Pin ${icon('pin')} up to three tasks you want to move forward today.</div>`}</div><button class="focus-count" data-view="today">${focus.length} selected${focus.length>3?' · view all':''}</button>`;
}
function renderToolbar(){
  const el=$('#toolbar');if(ui.view==='review'){el.hidden=true;return;}el.hidden=false;
  const relevant=store.state.projects.filter(p=>!p.archived&&(ui.area==='all'||p.area===ui.area));
  let out=`<div class="filter-tabs" role="group" aria-label="Area"><button class="filter-tab ${ui.area==='all'?'active':''}" data-filter-area="all" aria-pressed="${ui.area==='all'}">All areas</button>${Object.entries(areaName).map(([area,label])=>`<button class="filter-tab ${ui.area===area?'active':''}" data-filter-area="${area}" aria-pressed="${ui.area===area}"><span class="area-dot ${area}"></span>${label}</button>`).join('')}</div>`;
  if(ui.view!=='projects')out+=`<div class="toolbar-divider"></div><select class="filter-select" id="project-filter" aria-label="Filter by project"><option value="">All projects</option>${selectOptions(relevant.map(p=>[p.id,p.name]),ui.project)}</select><select class="filter-select" id="priority-filter" aria-label="Filter by priority">${selectOptions([['all','Any priority'],['high','High priority'],['normal','Normal priority'],['low','Low priority']],ui.priority)}</select>`;
  if(ui.query||ui.project||ui.priority!=='all')out+='<button class="filter-clear" data-action="clear-filters">Clear filters</button>';
  out+='<div class="toolbar-spacer"></div>';
  if(ui.view==='board'){const count=filteredTasks().filter(t=>!t.archived&&t.status!=='someday').length;out+=`<span class="task-total">${count} tasks</span><div class="view-toggle" role="group" aria-label="Layout"><button class="icon-button ${ui.layout==='board'?'active':''}" data-layout="board" aria-label="Board layout" title="Board layout" aria-pressed="${ui.layout==='board'}">${icon('board')}</button><button class="icon-button ${ui.layout==='list'?'active':''}" data-layout="list" aria-label="List layout" title="List layout" aria-pressed="${ui.layout==='list'}">${icon('list')}</button></div>`;}
  el.innerHTML=out;
}
function taskCard(t){
  const project=projectById(t.projectId);const checklist=t.checklist||[];
  return `<article class="task-card ${t.status==='done'?'done':''}" draggable="true" data-task-id="${esc(t.id)}" aria-label="${esc(t.title)}">
    <div class="card-top">${areaBadge(t.area)}<div class="card-tools"><button class="icon-button pin ${t.today?'active':''}" data-action="pin" data-id="${esc(t.id)}" aria-pressed="${t.today}" aria-label="${t.today?'Remove from':'Pin to'} Today: ${esc(t.title)}" title="${t.today?'Remove from':'Pin to'} Today">${icon('pin')}</button>${iconButton(t.status==='done'?'review':'check',t.status==='done'?'reopen':'complete',t.status==='done'?'Reopen task':'Complete task',`data-id="${esc(t.id)}"`)}</div></div>
    <button class="task-title" data-action="edit" data-id="${esc(t.id)}">${esc(t.title)}</button>
    ${t.notes?`<p class="task-note">${esc(t.notes.replace(/^Starter suggestion\.?\s*:?\s*/i,''))}</p>`:''}
    ${project?`<div class="task-project">${esc(project.name)}</div>`:''}
    <div class="card-meta">${t.priority==='high'?`<span class="tag high">${icon('flag')}High</span>`:t.priority==='low'?'<span class="tag low">Low</span>':''}${dueTag(t)}${t.effort?`<span class="tag">${icon('later')}${t.effort}m</span>`:''}${checklist.length?`<span class="tag" title="Checklist progress">${icon('check')}${checklist.filter(c=>c.done).length}/${checklist.length}</span>`:''}${t.repeat!=='none'?`<span class="tag" title="Repeats ${esc(t.repeat)}">${icon('repeat')}</span>`:''}${t.starter?'<span class="tag suggestion">Suggestion</span>':''}</div>
    <div class="card-bottom"><span class="issue-key">${issueKey(t)}</span>${t.url&&safeUrl(t.url)?`<a class="icon-button" href="${esc(safeUrl(t.url))}" target="_blank" rel="noopener noreferrer" title="Open task link" aria-label="Open task link">${icon('external')}</a>`:''}<select class="card-status" data-status-id="${esc(t.id)}" aria-label="Status for ${esc(t.title)}">${taskOptions(t.status)}</select></div>
  </article>`;
}
function emptyState(ico,title,copy,action='',button='') {return `<div class="empty-state">${icon(ico)}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${action?`<button class="button" data-action="${action}">${esc(button)}</button>`:''}</div>`;}
function renderBoard(){
  const tasks=filteredTasks().filter(t=>!t.archived&&t.status!=='someday');
  if(ui.layout==='list')return `<div class="content-pad">${renderList(tasks)}</div>`;
  const columns=statusList.filter(s=>s!=='someday');
  return `<div class="board-scroll"><div class="mobile-status-tabs" role="group" aria-label="Board column">${columns.map(s=>`<button data-mobile-status="${s}" class="${ui.mobileStatus===s?'active':''}" aria-pressed="${ui.mobileStatus===s}">${statusName[s]}<small>${tasks.filter(t=>t.status===s).length}</small></button>`).join('')}</div><div class="board">${columns.map(status=>{
    const cards=tasks.filter(t=>t.status===status);const empty={inbox:['inbox','Nothing to sort','Add a thought, a task, or a loose end.'],next:['list','Room for a next step','Move something here when it is ready to act on.'],doing:['focus','One thing at a time','Move a task here when you actually start.'],waiting:['later','Nothing on hold','Waiting on a reply? Keep it here with a follow-up date.'],done:['check','Room for a finish','Completed tasks will show up here.']}[status];
    return `<section class="column ${ui.mobileStatus===status?'mobile-active':''}" data-drop-status="${status}" aria-label="${statusName[status]}"><h2 class="column-header"><span class="status-dot ${status}"></span>${statusName[status]}<span class="column-count">${cards.length}</span>${iconButton('plus','new-task',`Add task to ${statusName[status]}`,`data-new-status="${status}"`)}</h2><p class="column-hint">${status==='doing'&&cards.length>3?'More than three active. Finish one before adding another.':columnHints[status]}</p><div class="card-stack">${cards.length?cards.map(taskCard).join(''):`<div class="column-empty">${icon(empty[0])}<strong>${empty[1]}</strong><p>${empty[2]}</p></div>`}</div><button class="column-add" data-action="new-task" data-new-status="${status}">${icon('plus')} Add task</button></section>`;
  }).join('')}</div></div>`;
}
function taskRow(t){return `<div class="task-row"><button class="complete-button ${t.status==='done'?'checked':''}" data-action="${t.status==='done'?'reopen':'complete'}" data-id="${esc(t.id)}" aria-label="${t.status==='done'?'Reopen':'Complete'} ${esc(t.title)}">${t.status==='done'?icon('check'):''}</button><div class="row-title"><button class="task-title" data-action="edit" data-id="${esc(t.id)}">${esc(t.title)}</button><div class="row-subtitle">${issueKey(t)}${t.projectId?` · ${esc(projectById(t.projectId)?.name||'')}`:''}${t.starter?' · Starter suggestion':''}${t.archived?' · Archived':''}</div></div><div class="row-area">${areaBadge(t.area)}</div><div class="row-status">${t.archived?`<button class="button small" data-action="unarchive" data-id="${esc(t.id)}">Restore</button>`:`<select class="card-status" data-status-id="${esc(t.id)}" aria-label="Status for ${esc(t.title)}">${taskOptions(t.status)}</select>`}</div><div class="row-due">${dueTag(t)}</div><button class="icon-button pin ${t.today?'active':''}" data-action="pin" data-id="${esc(t.id)}" aria-label="${t.today?'Unpin':'Pin'} ${esc(t.title)}" ${t.archived?'disabled':''}>${icon('pin')}</button></div>`;}
function renderList(tasks,empty='No tasks here yet.',copy='Add a task, or adjust your filters.'){
  return tasks.length?`<div class="list-frame"><div class="list-head"><span></span><span>Task</span><span class="row-area">Area</span><span>Status</span><span>Date</span><span></span></div>${tasks.map(taskRow).join('')}</div>`:emptyState('list',empty,copy,'new-task','New task');
}
function renderToday(){
  const focus=filteredTasks().filter(t=>!t.archived&&t.today&&t.status!=='done'&&t.status!=='someday');
  const candidates=filteredTasks().filter(t=>!t.archived&&!t.today&&!['done','someday','waiting'].includes(t.status)).sort((a,b)=>{const rank=t=>(t.status==='doing'?0:t.status==='next'?1:2)+(t.area==='career'?0:.3);return rank(a)-rank(b)||a.order-b.order;}).slice(0,5);
  const globalCount=activeTasks().filter(t=>t.today).length;
  return `<div class="content-pad"><div class="today-layout"><div>${globalCount>3?'<div class="focus-note warning">You have more than three tasks pinned across your areas. You can keep them, or take one off the list.</div>':''}${focus.length?focus.map((t,i)=>`<article class="today-task"><span class="today-number">${String(i+1).padStart(2,'0')}</span><div class="today-main">${areaBadge(t.area)}<button class="task-title" data-action="edit" data-id="${esc(t.id)}">${esc(t.title)}</button>${t.notes?`<p class="task-note">${esc(t.notes.replace(/^Starter suggestion\.?\s*:?\s*/i,''))}</p>`:''}<div class="card-meta">${dueTag(t)}${t.effort?`<span class="tag">${t.effort} minutes</span>`:''}${t.starter?'<span class="tag suggestion">Suggestion</span>':''}</div><div class="today-actions"><button class="button primary small" data-action="${t.status==='doing'?'complete':'start'}" data-id="${esc(t.id)}">${icon(t.status==='doing'?'check':'arrow')}${t.status==='doing'?'Mark done':'Start this'}</button><button class="button plain small" data-action="edit" data-id="${esc(t.id)}">Open details</button></div></div>${iconButton('close','pin','Take off Today',`data-id="${esc(t.id)}"`)}</article>`).join(''):emptyState('focus','What would make today useful?','Choose one task from the shortlist, or pin a task from your board. You do not need to fill all three places.','go-board','Choose from board')}</div><aside class="today-aside"><h2>Ready to pick up</h2><p>Next actions first. These are options, not extra commitments.</p>${candidates.length?candidates.map(t=>`<div class="queue-item"><div><button class="task-title" data-action="edit" data-id="${esc(t.id)}">${esc(t.title)}</button>${areaBadge(t.area)}</div>${iconButton('plus','pin',`Add ${t.title} to Today`,`data-id="${esc(t.id)}"`)}</div>`).join(''):'<p>No more tasks in this view.</p>'}<button class="text-button" data-view="board">Open the full board →</button></aside></div></div>`;
}
function renderInbox(){return `<div class="content-pad"><form class="inbox-capture" id="quick-capture"><input name="title" id="quick-title" required maxlength="240" placeholder="What needs doing?" aria-label="Quick task title" autocomplete="off"><select name="area" aria-label="Area for new task">${selectOptions(Object.entries(areaName),ui.area==='all'?'career':ui.area)}</select><button class="button primary" type="submit">Add</button></form>${renderList(filteredTasks().filter(t=>!t.archived&&t.status==='inbox'),'Inbox is clear.','Capture a task above when something comes to mind.')}</div>`;}
function renderUpcoming(){
  const list=filteredTasks().filter(t=>!t.archived&&!['done','someday'].includes(t.status)&&dueValue(t)).sort((a,b)=>dueValue(a).localeCompare(dueValue(b))||a.order-b.order);
  if(!list.length)return `<div class="content-pad">${emptyState('calendar','No dates to keep track of.','Add a due date to a task, or a follow-up date to something you are waiting on. Dates appear here; this app does not send notifications.','go-board','Open your board')}</div>`;
  const groups=[['Past due',list.filter(t=>dueValue(t)<today())],['Today',list.filter(t=>dueValue(t)===today())],['Coming up',list.filter(t=>dueValue(t)>today())]];
  return `<div class="content-pad"><p class="section-intro">For Waiting tasks, the earlier due date or follow-up date is shown. Dates do not send notifications.</p>${groups.filter(([,tasks])=>tasks.length).map(([label,tasks])=>`<h2 class="list-section-title">${label}<small>${tasks.length} tasks</small></h2>${renderList(tasks)}`).join('')}</div>`;
}
function renderProjects(){
  const projects=store.state.projects.filter(p=>!p.archived&&(ui.area==='all'||p.area===ui.area)&&(!ui.query||`${p.name} ${p.description}`.toLowerCase().includes(ui.query.toLowerCase())));
  return `<div class="content-pad"><div class="projects-head"><p>Your projects and useful links. The directory itself does not create work on your board.</p><button class="button" data-action="new-project">${icon('plus')} Add project</button></div>${projects.length?`<div class="list-frame"><table class="project-table"><thead><tr><th>Project</th><th>Context</th><th>Open tasks</th><th><span class="muted">Actions</span></th></tr></thead><tbody>${projects.map(p=>{const count=activeTasks().filter(t=>t.projectId===p.id).length;return `<tr><td><button class="project-title" data-action="project-board" data-project-id="${esc(p.id)}">${esc(p.name)}</button>${areaBadge(p.area)}</td><td><p class="project-desc">${esc(p.description)}</p></td><td><button class="text-button" data-action="project-board" data-project-id="${esc(p.id)}">${count} ${count===1?'task':'tasks'}</button></td><td><div class="project-actions">${iconButton('plus','new-task',`Add task to ${p.name}`,`data-project-id="${esc(p.id)}"`)}${p.url&&safeUrl(p.url)?`<a class="icon-button" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)}" title="Open site">${icon('external')}</a>`:''}${iconButton('edit','edit-project',`Edit ${p.name}`,`data-project-id="${esc(p.id)}"`)}</div></td></tr>`;}).join('')}</tbody></table></div>`:emptyState('folder','No matching projects.','Clear the filters, or add a project when you need one.','new-project','Add project')}</div>`;
}
function renderReview(){
  const all=activeTasks(), inbox=all.filter(t=>t.status==='inbox'),waiting=all.filter(t=>t.status==='waiting'),doing=all.filter(t=>t.status==='doing'),done=store.state.tasks.filter(t=>t.status==='done'&&!t.archived),focus=all.filter(t=>t.today),weekAgo=Date.now()-7*86400000,weekDone=done.filter(t=>t.completedAt&&Date.parse(t.completedAt)>=weekAgo);
  return `<div class="content-pad"><div class="review-layout"><section class="review-main"><h2>Make a little room for the week.</h2><p>Clear the loose ends, check what is waiting, and choose the next few things. This is a checklist for reviewing your board, not a score.</p><div class="review-step"><span class="review-step-num">1</span><div><h3>Empty your head into Inbox</h3><p>${inbox.length} ${inbox.length===1?'task needs':'tasks need'} sorting. Move something to Next, Someday, or the archive.</p><button class="button small" data-view="inbox">Open Inbox</button></div></div><div class="review-step"><span class="review-step-num">2</span><div><h3>Check dates and people you are waiting on</h3><p>${waiting.length} ${waiting.length===1?'task is':'tasks are'} waiting. Add a follow-up date where a nudge would help.</p><button class="button small" data-view="upcoming">Review dates</button></div></div><div class="review-step"><span class="review-step-num">3</span><div><h3>Choose a manageable next step</h3><p>${doing.length} in progress. ${focus.length} pinned to Today. A career task and a life task are a useful place to start.</p><button class="button small" data-view="today">Choose your focus</button></div></div><div class="review-step"><span class="review-step-num">4</span><div><h3>Keep a copy of your work</h3><p>Changes are saved on this browser. A downloaded backup can move them to another device or restore them later.</p><button class="button small" data-action="export">${icon('download')} Download backup</button></div></div><button class="button primary" data-action="finish-review">${icon('check')} Finish this review</button></section><aside class="review-aside"><h3>Your board, at a glance</h3><p>Counts describe what is on the board. They are not a measure of your day.</p><div class="review-stat"><span>Career next actions</span><strong>${all.filter(t=>t.area==='career'&&t.status==='next').length}</strong></div><div class="review-stat"><span>Life next actions</span><strong>${all.filter(t=>t.area==='life'&&t.status==='next').length}</strong></div><div class="review-stat"><span>DFE active tasks</span><strong>${all.filter(t=>t.area==='dfe').length}</strong></div><div class="review-stat"><span>Completed in 7 days</span><strong>${weekDone.length}</strong></div><div class="review-stat"><span>In Someday</span><strong>${store.state.tasks.filter(t=>!t.archived&&t.status==='someday').length}</strong></div><p>Last review: ${fullDate(store.state.settings.lastReviewAt)}<br>Last backup: ${fullDate(store.state.settings.lastBackupAt)}</p><button class="button small" data-action="archive-done" ${done.length?'':'disabled'}>Archive completed tasks</button></aside></div></div>`;
}
function render(){
  document.documentElement.dataset.theme=store.state.settings.theme;document.documentElement.dataset.density=store.state.settings.density;
  const [title,description]=pageInfo[ui.view];$('#page-title').textContent=title;$('#page-description').textContent=description;$('#breadcrumb-view').textContent=title;
  $('#page-eyebrow').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  $('#theme-button').innerHTML=icon(store.state.settings.theme==='dark'?'sun':'moon');$('#theme-button').setAttribute('aria-label',`Switch to ${store.state.settings.theme==='dark'?'light':'dark'} mode`);
  renderNav();renderNotice();renderFocus();renderToolbar();
  const content={board:renderBoard,today:renderToday,inbox:renderInbox,upcoming:renderUpcoming,projects:renderProjects,review:renderReview,someday:()=>`<div class="content-pad">${renderList(filteredTasks().filter(t=>!t.archived&&t.status==='someday'),'Nothing parked here.','Move tasks to Someday when you want to keep the idea without committing to it.')}</div>`,archive:()=>`<div class="content-pad">${renderList(filteredTasks().filter(t=>t.archived),'The archive is empty.','Archived tasks stay here until you restore them.')}</div>`};
  $('#workspace-content').innerHTML=content[ui.view]();
  $('#workspace-footer').innerHTML=`<span>Changes stay on this browser. <button class="text-button" data-action="export">Download a backup</button></span><span class="footer-shortcuts"><span><kbd>N</kbd> new task</span><span><kbd>/</kbd> search</span><span><kbd>?</kbd> shortcuts</span></span>`;
  if(!store.loadIssue){$('#save-status').classList.remove('error');$('#save-status').innerHTML='<span class="save-dot"></span><span>Saved in this browser</span>';}else{$('#save-status').classList.add('error');$('#save-status').innerHTML='<span class="save-dot"></span><span>Storage needs attention</span>';}
}

let confirmAction=null, openedTaskStamp=null;
function openUtility(title,body,footer=''){
  const dialog=$('#utility-dialog');dialog.innerHTML=`<div class="dialog-top"><h2 id="utility-title">${esc(title)}</h2>${iconButton('close','close-utility','Close dialog')}</div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-bottom">${footer}</div>`:''}`;
  if(!dialog.open)dialog.showModal();
}
function confirmDialog(title,copy,action,label='Confirm'){
  confirmAction=action;openUtility(title,`<p class="confirm-copy">${esc(copy)}</p>`,`<span class="spacer"></span><button class="button" data-action="close-utility">Cancel</button><button class="button primary" data-action="confirm">${esc(label)}</button>`);
}
function openTask(id=null,defaults={}){
  const original=id?taskById(id):null;if(id&&!original)return;
  editingId=id;dirty=false;openedTaskStamp=original?.updatedAt||null;focusReturn=document.activeElement;
  const t=original||{title:'',area:ui.area==='all'?'career':ui.area,status:'inbox',priority:'normal',notes:'',projectId:ui.project||'',due:'',followUp:'',effort:0,repeat:'none',today:false,url:'',checklist:[],...defaults};
  const projects=store.state.projects.filter(p=>!p.archived||p.id===t.projectId);
  $('#task-dialog').innerHTML=`<form id="task-form"><div class="dialog-top"><span class="issue-key">${original?issueKey(original):'NEW'}</span><h2 id="task-dialog-title">${original?'Task details':'Add a task'}</h2>${iconButton('close','close-task','Close task')}</div><div class="dialog-body"><div id="task-error"></div><div class="field"><label class="field-label" for="task-title">What needs doing?</label><textarea name="title" id="task-title" class="task-title-input" maxlength="240" required rows="2" placeholder="Start with one next action…">${esc(t.title)}</textarea></div><div class="form-grid"><div class="field"><label class="field-label" for="task-area">Area</label><select name="area" id="task-area">${selectOptions(Object.entries(areaName),t.area)}</select></div><div class="field"><label class="field-label" for="task-status">Status</label><select name="status" id="task-status">${taskOptions(t.status)}</select></div></div><div class="field check-field"><label class="checkbox-label"><input type="checkbox" name="today" ${t.today?'checked':''}> Pin to Today</label></div><div class="field"><label class="field-label" for="task-notes">Notes / next step</label><textarea name="notes" id="task-notes" class="notes" rows="4" maxlength="20000" placeholder="A useful detail, the person you are waiting on, or what done looks like.">${esc(t.notes)}</textarea></div><details class="optional-fields" ${original?'open':''}><summary>Dates, project & other details</summary><div class="form-grid"><div class="field"><label class="field-label" for="task-priority">Priority</label><select name="priority" id="task-priority">${selectOptions([['high','High'],['normal','Normal'],['low','Low']],t.priority)}</select></div><div class="field"><label class="field-label" for="task-project">Project (optional)</label><select name="projectId" id="task-project"><option value="">No project</option>${selectOptions(projects.map(p=>[p.id,p.name]),t.projectId)}</select></div><div class="field"><label class="field-label" for="task-due">Due date</label><input type="date" name="due" id="task-due" value="${esc(t.due)}"></div><div class="field"><label class="field-label" for="task-followup">Follow-up date</label><input type="date" name="followUp" id="task-followup" value="${esc(t.followUp)}"><p class="field-hint">Used in Dates & follow-ups while Waiting.</p></div><div class="field"><label class="field-label" for="task-effort">Time needed</label><select name="effort" id="task-effort">${selectOptions([['0','Not estimated'],['15','15 minutes'],['30','30 minutes'],['60','1 hour'],['90','90 minutes']],String(t.effort))}</select></div><div class="field"><label class="field-label" for="task-repeat">Repeat when completed</label><select name="repeat" id="task-repeat">${selectOptions([['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']],t.repeat)}</select></div><div class="field full"><label class="field-label" for="task-url">Link</label><input type="url" name="url" id="task-url" value="${esc(t.url)}" maxlength="2048" placeholder="https://…">${t.url&&safeUrl(t.url)?`<a class="project-link-preview" href="${esc(safeUrl(t.url))}" target="_blank" rel="noopener noreferrer">Open link ↗</a>`:''}</div></div></details><div class="dialog-section"><div class="dialog-section-header"><h3>Small steps</h3><span class="small-text muted">Optional checklist</span></div><div id="task-checklist">${(t.checklist||[]).map(checklistRow).join('')}</div><button type="button" class="checklist-add" data-action="add-checklist">${icon('plus')} Add a step</button></div>${t.starter?'<p class="field-hint suggestion-note">Starter suggestion. Saving an edit makes it your task.</p>':''}</div><div class="dialog-bottom">${original?`<button type="button" class="button plain" data-action="${original.archived?'unarchive-editor':'archive-editor'}">${icon('archive')}${original.archived?'Restore':'Archive'}</button>`:'<span class="small-text muted">Only a title is required.</span>'}<span class="spacer"></span><button type="button" class="button" data-action="close-task">Cancel</button><button type="submit" class="button primary">${original?'Save changes':'Create task'}</button></div>${original?`<div class="dialog-meta"><span>Created ${fullDate(original.createdAt)}</span><span>Updated ${fullDate(original.updatedAt)}</span></div>`:''}</form>`;
  const dialog=$('#task-dialog');if(!dialog.open)dialog.showModal();setTimeout(()=>$('#task-title').focus(),0);
}
function checklistRow(item){return `<div class="checklist-item" data-check-id="${esc(item.id)}"><input type="checkbox" aria-label="Step complete" ${item.done?'checked':''}><input type="text" maxlength="500" value="${esc(item.text)}" aria-label="Checklist step" placeholder="One small step…"><button type="button" class="icon-button" data-action="remove-checklist" aria-label="Remove step">${icon('close')}</button></div>`;}
function closeTask(force=false){
  if(dirty&&!force){confirmDialog('Discard unsaved changes?','Your saved task will stay as it was. The edits in this panel have not been saved.',()=>closeTask(true),'Discard edits');return;}
  $('#task-dialog').close();editingId=null;dirty=false;focusReturn?.focus?.();
}
function nextNumber(state){return Math.max(0,...state.tasks.map(t=>t.number))+1;}
function nextOrder(state){return Math.max(0,...state.tasks.map(t=>t.order))+1;}
function addFields(state,fields){const task=makeTask({...fields,number:nextNumber(state),order:nextOrder(state),starter:false});state.tasks.push(task);return task;}
function applyStatus(state,task,status){
  transitionTask(state,task.id,status,{today:today(),now:now()});
}
function changeStatus(id,status){
  const task=taskById(id);if(!task)return;
  const recurrence=task.repeat!=='none'&&status==='done'&&task.status!=='done';
  commit(state=>{const found=state.tasks.find(t=>t.id===id);applyStatus(state,found,status);},recurrence?'Completed. The next occurrence is in Next.':status==='done'?'Task completed.':`Moved to ${statusName[status]}.`);
}
function saveTask(form,{archived=null}={}){
  if(!form.reportValidity())return;
  const data=new FormData(form);const title=String(data.get('title')||'').trim();if(!title){$('#task-title').setCustomValidity('Give this task a title.');$('#task-title').reportValidity();return;}
  const project=projectById(String(data.get('projectId')||''));
  const fields={title,area:String(data.get('area')),status:String(data.get('status')),priority:String(data.get('priority')),projectId:String(data.get('projectId')||''),notes:String(data.get('notes')||'').trim(),due:String(data.get('due')||''),followUp:String(data.get('followUp')||''),effort:Number(data.get('effort')||0),repeat:String(data.get('repeat')||'none'),today:data.get('today')==='on',url:String(data.get('url')||'').trim(),checklist:$$('.checklist-item',form).map(row=>({id:row.dataset.checkId,text:$('input[type=text]',row).value.trim(),done:$('input[type=checkbox]',row).checked})).filter(c=>c.text)};
  if(project&&project.area!==fields.area){$('#task-error').innerHTML='<div class="dialog-error">The selected project belongs to a different area. Change the area or choose another project.</div>';$('#task-project').focus();return;}
  const existing=editingId?taskById(editingId):null;
  if(editingId&&(!existing||existing.updatedAt!==openedTaskStamp)){$('#task-error').innerHTML='<div class="dialog-error">This task changed while it was open. Copy your edits, close this panel, and reopen the task to see the current version.</div>';return;}
  const saved=commit(state=>{
    if(editingId){const task=state.tasks.find(t=>t.id===editingId);const oldStatus=task.status;Object.assign(task,fields,{status:oldStatus,starter:false,updatedAt:now()});applyStatus(state,task,fields.status);if(archived!==null)task.archived=archived;if(task.archived||['done','someday'].includes(task.status))task.today=false;}
    else {const task=addFields(state,{...fields,status:'inbox'});applyStatus(state,task,fields.status);}
  },archived===true?'Task saved and archived.':archived===false?'Task saved and restored.':editingId?'Task saved.':'Task added.');
  if(saved){dirty=false;closeTask(true);if(activeTasks().filter(t=>t.today).length>3)notify('More than three tasks are pinned. You can unpin one whenever you need room.');}
  else $('#task-error').innerHTML='<div class="dialog-error">These edits have not been saved. Your form is still here. Check the error message before trying again.</div>';
}
function pinTask(id){
  const task=taskById(id);if(!task||task.archived)return;if(task.status==='done'){notify('Reopen this task before pinning it to Today.');return;}
  const pinned=task.today;const changes={today:!pinned,...(task.status==='someday'&&!pinned?{status:'next'}:{})};
  if(updateTask(id,changes,pinned?'Removed from Today.':'Pinned to Today.')&&!pinned&&activeTasks().filter(t=>t.today).length>3)notify('Pinned. You now have more than three tasks in Today.');
}
function download(filename,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportBackup(){
  try{download(`dayboard-backup-${today()}.json`,store.exportJSON(),'application/json');const saved=commit(s=>{s.settings.lastBackupAt=now();},'Backup download started.',{undo:false});if(saved&&$('#settings-last-backup'))$('#settings-last-backup').textContent=fullDate(store.state.settings.lastBackupAt);}
  catch(error){notify(`Could not export: ${error.message}`,{error:true});}
}
function openSettings(){
  const state=store.state;openUtility('Settings & backup',`<section class="settings-section"><h3>Your workspace</h3><p>Tasks are saved on this device, in this browser. Opening the Render address on another device starts a separate board. No task content is sent to a server.</p><div class="settings-note"><p>Use a JSON backup to move your board between devices. Clearing browser data can remove your board. Keep a backup somewhere you can find it.</p></div><div class="settings-actions"><button class="button primary" data-action="export">${icon('download')} Download backup</button><button class="button" data-action="import">${icon('upload')} Import backup</button><button class="button" data-action="export-csv">Export CSV</button></div><p>Last backup download: <span id="settings-last-backup">${fullDate(state.settings.lastBackupAt)}</span><br>${state.tasks.length} tasks · ${state.projects.length} projects</p></section><section class="settings-section"><h3>Appearance</h3><div class="settings-row"><label for="setting-theme">Color theme</label><select id="setting-theme">${selectOptions([['dark','Dark'],['light','Light']],state.settings.theme)}</select></div><div class="settings-row"><label for="setting-density">Card density</label><select id="setting-density">${selectOptions([['comfortable','Comfortable'],['compact','Compact']],state.settings.density)}</select></div></section><section class="settings-section"><h3>Keep the board tidy</h3><p>Suggestions you have already changed are treated as your tasks.</p><div class="settings-actions"><button class="button" data-action="clear-starters">Clear untouched suggestions</button><button class="button" data-action="go-archive">Open archive</button></div><button class="text-button" data-action="reload-state">Reload saved workspace</button></section><section class="settings-section"><h3>A few useful controls</h3><p><kbd>N</kbd> new task · <kbd>/</kbd> search · <kbd>?</kbd> help<br>On desktop, drag a card between columns. On a phone, use the status menu at the bottom of each card.</p><p class="settings-note">Repeat creates the next task when you complete the current one. Due dates and follow-up dates appear in the board; they do not send notifications.</p></section>`);
}
function openCapture(){
  openUtility('Get it out of your head',`<p>One task per line. No formatting needed. Everything goes to Inbox.</p><textarea id="capture-text" class="list-paste" maxlength="30000" aria-label="Tasks to add, one per line" placeholder="Update the résumé summary\nBook an appointment\nReview one project idea #dfe"></textarea><div class="capture-controls"><select id="capture-area" aria-label="Default area for captured tasks">${selectOptions(Object.entries(areaName),ui.area==='all'?'career':ui.area)}</select><span class="capture-count" id="capture-count">0 tasks</span></div><p class="field-hint">Optional: add #career, #life, or #dfe to a line to choose its area.</p>`,`<span class="spacer"></span><button class="button" data-action="close-utility">Cancel</button><button class="button primary" data-action="save-capture">Add to Inbox</button>`);setTimeout(()=>$('#capture-text').focus(),0);
}
function openProject(id=null){
  const p=id?projectById(id):{name:'',area:ui.area==='all'?'dfe':ui.area,url:'',description:''};if(!p)return;
  openUtility(id?'Edit project':'Add a project',`<form id="project-form" data-project-id="${esc(id||'')}"><div id="project-error"></div><div class="field"><label class="field-label" for="project-name">Project name</label><input id="project-name" name="name" value="${esc(p.name)}" maxlength="100" required placeholder="A project, a client, or a body of work"></div><div class="field"><label class="field-label" for="project-area">Area</label><select id="project-area" name="area">${selectOptions(Object.entries(areaName),p.area)}</select></div><div class="field"><label class="field-label" for="project-url">Website or reference link</label><input id="project-url" name="url" type="url" maxlength="2048" value="${esc(p.url)}" placeholder="https://…"></div><div class="field"><label class="field-label" for="project-description">Context / where you left off</label><textarea id="project-description" name="description" maxlength="4000" rows="4">${esc(p.description)}</textarea></div></form>`,`<span class="spacer"></span><button class="button" data-action="close-utility">Cancel</button><button type="submit" form="project-form" class="button primary">Save project</button>`);setTimeout(()=>$('#project-name').focus(),0);
}
function openHelp(){openUtility('A small board, a simple routine',`<section class="settings-section"><h3>Capture → choose → finish</h3><p>Use Inbox for loose ends. Move something to Next when it is actionable. Put it In progress when you start, or Waiting when the next move belongs to someone else. Done keeps a record of what you finished.</p><p class="settings-note">Pin a few tasks to Today. It is a shortlist across your areas, independent of a task's status. Someday keeps ideas off the active board.</p></section><section class="settings-section"><h3>Keyboard shortcuts</h3><table class="shortcut-table"><tbody><tr><td>New task</td><td><kbd>N</kbd></td></tr><tr><td>Find a task</td><td><kbd>/</kbd></td></tr><tr><td>Save an open task</td><td><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd></td></tr><tr><td>Close a panel</td><td><kbd>Esc</kbd></td></tr><tr><td>Show this help</td><td><kbd>?</kbd></td></tr></tbody></table></section><section class="settings-section"><h3>Across devices</h3><p>Download a JSON backup from Settings & backup, then import it on your other device. Merge keeps tasks from both boards; Replace restores the backup as a whole. This is a manual transfer, not automatic sync.</p></section><section class="settings-section"><h3>On your phone</h3><p>Choose a column using the status tabs. Each card has a status menu, so dragging is never required. You can also use List view. In Safari, Share → Add to Home Screen gives the board its own icon.</p></section>`);}

document.addEventListener('click',event=>{
  const button=event.target.closest('button,a[data-view]');if(!button)return;
  if(button.dataset.view){setView(button.dataset.view);return;}
  if(button.dataset.area){ui.area=button.dataset.area;ui.project='';setView('board');return;}
  if(button.dataset.filterArea){ui.area=button.dataset.filterArea;ui.project='';render();return;}
  if(button.dataset.layout){ui.layout=button.dataset.layout;render();return;}
  if(button.dataset.mobileStatus){ui.mobileStatus=button.dataset.mobileStatus;render();return;}
  const action=button.dataset.action,id=button.dataset.id,projectId=button.dataset.projectId;if(!action)return;
  const actions={
    'new-task':()=>{const project=projectById(projectId||ui.project);openTask(null,{...(project?{projectId:project.id,area:project.area}:{}),status:button.dataset.newStatus||(ui.view==='someday'?'someday':'inbox')});},
    edit:()=>openTask(id),
    'close-task':()=>closeTask(),
    'close-utility':()=>{$('#utility-dialog').close();confirmAction=null;},
    confirm:()=>{const fn=confirmAction;confirmAction=null;$('#utility-dialog').close();fn?.();},
    complete:()=>changeStatus(id,'done'),reopen:()=>changeStatus(id,'next'),start:()=>changeStatus(id,'doing'),
    pin:()=>pinTask(id),
    settings:openSettings,help:openHelp,
    'capture-list':openCapture,
    'save-capture':()=>{try{const fields=parseCapture($('#capture-text').value,$('#capture-area').value);if(!fields.length){notify('Add at least one task.');return;}if(fields.length>150){notify('Add up to 150 tasks at a time.',{error:true});return;}if(commit(state=>{fields.forEach(f=>addFields(state,f));},`${fields.length} ${fields.length===1?'task':'tasks'} added to Inbox.`)){$('#utility-dialog').close();setView('inbox');}}catch(error){notify(error.message,{error:true});}},
    'clear-filters':()=>{ui.query='';ui.project='';ui.priority='all';$('#search').value='';render();},
    'dismiss-welcome':()=>commit(state=>{state.settings.welcomeDismissed=true;},null,{undo:false}),
    'clear-starters':()=>{const count=store.state.tasks.filter(t=>t.starter).length;if(!count){notify('No untouched suggestions to clear.');return;}confirmDialog('Clear starter suggestions?',`Remove ${count} untouched starter suggestions. Tasks you have edited or moved will stay, and the project directory will stay. You can undo this.`,()=>commit(state=>{state.tasks=state.tasks.filter(t=>!t.starter);state.settings.welcomeDismissed=true;},'Starter suggestions cleared.'),'Clear suggestions');},
    theme:()=>commit(state=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';},null,{undo:false}),
    undo:()=>{if(Number(button.dataset.revision)!==store.state.revision){notify('A newer change was saved. That undo is no longer available.');return;}try{store.undo();render();notify('Last change undone.');}catch(error){notify(error.message,{error:true});}},
    'dismiss-toast':()=>{$('#toast').hidden=true;},
    export:exportBackup,
    'export-csv':()=>{download(`dayboard-tasks-${today()}.csv`,toCSV(store.state.tasks),'text/csv;charset=utf-8');notify('CSV download started. Use a JSON backup to restore the full workspace.');},
    import:()=>{$('#import-file').value='';$('#import-file').click();},
    'confirm-import':()=>{if(!pendingImport)return;const mode=$('input[name=import-mode]:checked')?.value||'merge';const apply=()=>{try{store.importJSON(pendingImport,{mode});pendingImport=null;$('#utility-dialog').close();render();notify('Backup imported.',{undo:true});}catch(error){notify(error.message,{error:true});}};if(mode==='replace')confirmDialog('Replace this workspace?','All current tasks and projects will be replaced by this backup. Download your current board first if you want to keep a separate copy.',apply,'Replace workspace');else apply();},
    'reload-state':()=>{try{store.reload();render();openSettings();notify(store.loadIssue||'Saved workspace reloaded.',{error:Boolean(store.loadIssue)});}catch(error){notify(error.message,{error:true});}},
    menu:()=>{const open=document.body.classList.toggle('sidebar-open');$('.mobile-menu').setAttribute('aria-expanded',String(open));},
    'close-menu':()=>{document.body.classList.remove('sidebar-open');$('.mobile-menu').setAttribute('aria-expanded','false');},
    'go-board':()=>setView('board'),
    'go-archive':()=>{$('#utility-dialog').close();setView('archive');},
    'new-project':()=>openProject(),
    'edit-project':()=>openProject(projectId),
    'project-board':()=>{ui.area=projectById(projectId)?.area||'all';setView('board');ui.project=projectId;render();},
    'add-checklist':()=>{const id=crypto.randomUUID();$('#task-checklist').insertAdjacentHTML('beforeend',checklistRow({id,text:'',done:false}));$('#task-checklist .checklist-item:last-child input[type=text]').focus();dirty=true;},
    'remove-checklist':()=>{button.closest('.checklist-item')?.remove();dirty=true;},
    'archive-editor':()=>saveTask($('#task-form'),{archived:true}),
    'unarchive-editor':()=>saveTask($('#task-form'),{archived:false}),
    unarchive:()=>updateTask(id,{archived:false},'Task restored.'),
    'archive-done':()=>{const count=store.state.tasks.filter(t=>t.status==='done'&&!t.archived).length;confirmDialog('Archive completed tasks?',`Move ${count} completed tasks out of the board. They will remain in Archive and can be restored.`,()=>commit(state=>{state.tasks.filter(t=>t.status==='done'&&!t.archived).forEach(t=>{t.archived=true;t.today=false;t.updatedAt=now();});},'Completed tasks archived.'),'Archive tasks');},
    'finish-review':()=>commit(state=>{state.settings.lastReviewAt=now();},'Review finished. Your next steps are ready.',{undo:false}),
  };
  if(actions[action]){event.preventDefault();actions[action]();}
});
document.addEventListener('click',event=>{if(event.target.matches('.sidebar-scrim')){document.body.classList.remove('sidebar-open');$('.mobile-menu').setAttribute('aria-expanded','false');}});
document.addEventListener('submit',event=>{
  if(event.target.id==='task-form'){event.preventDefault();saveTask(event.target);}
  if(event.target.id==='quick-capture'){
    event.preventDefault();const form=event.target;const data=new FormData(form);const title=String(data.get('title')||'').trim();if(!title)return;
    if(commit(s=>addFields(s,{title,area:String(data.get('area')),status:'inbox'}),'Task added to Inbox.'))$('#quick-title')?.focus();
  }
  if(event.target.id==='project-form'){
    event.preventDefault();const data=new FormData(event.target);const id=event.target.dataset.projectId;const fields={name:String(data.get('name')||'').trim(),area:String(data.get('area')),url:String(data.get('url')||'').trim(),description:String(data.get('description')||'').trim()};if(!fields.name)return;
    if(commit(state=>{if(id){const p=state.projects.find(p=>p.id===id);if(!p)throw new Error('Project not found.');Object.assign(p,fields,{starter:false});state.tasks.filter(t=>t.projectId===id).forEach(t=>{t.area=p.area;t.updatedAt=now();});}else state.projects.push({id:crypto.randomUUID(),...fields,starter:false,archived:false});},'Project saved.'))$('#utility-dialog').close();
  }
});
document.addEventListener('input',event=>{
  if(event.target.id==='search'){ui.query=event.target.value;renderToolbar();const out={board:renderBoard,today:renderToday,inbox:renderInbox,upcoming:renderUpcoming,projects:renderProjects,someday:()=>`<div class="content-pad">${renderList(filteredTasks().filter(t=>!t.archived&&t.status==='someday'))}</div>`,archive:()=>`<div class="content-pad">${renderList(filteredTasks().filter(t=>t.archived))}</div>`};if(out[ui.view])$('#workspace-content').innerHTML=out[ui.view]();}
  if(event.target.closest('#task-form')){dirty=true;if(event.target.id==='task-title')event.target.setCustomValidity('');}
  if(event.target.id==='capture-text'){const count=event.target.value.split('\n').filter(l=>l.trim()).length;$('#capture-count').textContent=`${count} ${count===1?'task':'tasks'}`;}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.statusId){changeStatus(el.dataset.statusId,el.value);return;}
  if(el.id==='project-filter'){ui.project=el.value;render();}
  if(el.id==='priority-filter'){ui.priority=el.value;render();}
  if(el.id==='setting-theme'){commit(s=>{s.settings.theme=el.value;},null,{undo:false});}
  if(el.id==='setting-density'){commit(s=>{s.settings.density=el.value;},null,{undo:false});}
  if(el.id==='task-project'){const p=projectById(el.value);if(p)$('#task-area').value=p.area;dirty=true;}
  if(el.id==='task-area'){const p=projectById($('#task-project').value);if(p&&p.area!==el.value)$('#task-project').value='';dirty=true;}
  if(el.id==='task-status'&&['done','someday'].includes(el.value))$('#task-form input[name=today]').checked=false;
  if(el.closest('#task-form'))dirty=true;
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;if(file.size>8*1024*1024){notify('This backup is too large. The maximum is 8 MB.',{error:true});return;}
  try{const text=await file.text();const imported=normalizeWorkspace(JSON.parse(text));pendingImport=text;openUtility('Import a workspace backup',`<p>Review this file before changing your board.</p><div class="import-summary"><strong>${esc(file.name)}</strong><br>${imported.tasks.length} tasks · ${imported.projects.length} projects</div><label class="import-mode"><input type="radio" name="import-mode" value="merge" checked><span><strong>Merge with this board</strong><p>Keep your tasks and add the backup. For matching IDs, keep the newer task.</p></span></label><label class="import-mode"><input type="radio" name="import-mode" value="replace"><span><strong>Replace this board</strong><p>Restore all tasks, projects, and settings from the backup.</p></span></label>`,`<button class="button" data-action="export">Back up current board</button><span class="spacer"></span><button class="button primary" data-action="confirm-import">Import backup</button>`);}catch(error){notify(`Backup was not imported: ${error.message}`,{error:true});}
});
document.addEventListener('dragstart',event=>{const card=event.target.closest('.task-card');if(!card)return;if(event.target.closest('button,select,a,input')){event.preventDefault();return;}dragId=card.dataset.taskId;event.dataTransfer.setData('text/plain',dragId);event.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
document.addEventListener('dragover',event=>{const col=event.target.closest('[data-drop-status]');if(col&&dragId){event.preventDefault();event.dataTransfer.dropEffect='move';$$('.column.drag-over').forEach(c=>c.classList.remove('drag-over'));col.classList.add('drag-over');}});
document.addEventListener('drop',event=>{const col=event.target.closest('[data-drop-status]');if(col&&dragId){event.preventDefault();const status=col.dataset.dropStatus;const id=dragId;dragId=null;changeStatus(id,status);}});
document.addEventListener('dragend',()=>{dragId=null;$$('.dragging,.drag-over').forEach(el=>el.classList.remove('dragging','drag-over'));});
document.addEventListener('keydown',event=>{
  const editing=event.target.matches('input,textarea,select,[contenteditable=true]');
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&$('#task-dialog').open&&!$('#utility-dialog').open){event.preventDefault();$('#task-form').requestSubmit();return;}
  if(editing||event.ctrlKey||event.metaKey||event.altKey||$('#task-dialog').open||$('#utility-dialog').open)return;
  if(event.key.toLowerCase()==='n'){event.preventDefault();openTask();}
  if(event.key==='/'){event.preventDefault();$('#search').focus();}
  if(event.key==='?'){event.preventDefault();openHelp();}
});
$('#task-dialog').addEventListener('cancel',event=>{event.preventDefault();closeTask();});
$('#utility-dialog').addEventListener('cancel',()=>{confirmAction=null;});
window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(views.includes(view)){ui.view=view;render();}});
window.addEventListener('popstate',()=>{ui.view=views.includes(location.hash.slice(1))?location.hash.slice(1):'board';render();});
window.addEventListener('storage',event=>{
  if(event.key!=='dfe.dayboard.v1')return;
  if($('#task-dialog').open&&dirty){notify('This board changed in another tab. Save is protected from overwriting that change.',{error:true});return;}
  try{store.reload();render();if($('#task-dialog').open&&editingId)openTask(editingId);notify(store.loadIssue||'Board updated from another tab.',{error:Boolean(store.loadIssue)});}catch(error){notify(error.message,{error:true});}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
for(const el of $$('[data-icon]'))el.innerHTML=icon(el.dataset.icon);
ui.view=views.includes(location.hash.slice(1))?location.hash.slice(1):'board';
render();
