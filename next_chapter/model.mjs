export const STAGES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Closed'];
export const OUTCOMES = ['Active', 'Accepted', 'Rejected', 'Declined', 'On hold'];
export const COLORS = ['coral', 'green', 'blue', 'gold', 'purple'];
export const DAY = 86400000;
export const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function relativeDate(offset = 0) { const d = new Date(); d.setDate(d.getDate()+offset); return dateKey(d); }
export function parseDate(s) { return new Date(`${s}T12:00:00`); }
export function dayDiff(s, now = dateKey()) { if (!s) return null; return Math.round((Date.parse(`${s}T12:00:00Z`)-Date.parse(`${now}T12:00:00Z`))/DAY); }
export const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(s) { try { const u = new URL(s); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
export function emptyWorkspace() { return {version:1, jobs:[], people:[], documents:[], streams:[{id:'main',name:'My next move',color:'coral'}], notes:[], created:dateKey()}; }
export function demoWorkspace() {
  const w=emptyWorkspace();
  w.streams=[{id:'se',name:'Solutions & engineering',color:'coral'},{id:'platform',name:'Platform & infrastructure',color:'blue'},{id:'wildcard',name:'The interesting unknowns',color:'green'}];
  w.people=[
    {id:'p1',name:'Alex Morgan',company:'Halcyon Labs',role:'Technical recruiter',email:'alex@example.com',notes:'Ask about the team’s customer discovery process.'},
    {id:'p2',name:'Jamie Chen',company:'Northstar Systems',role:'Engineering lead',email:'jamie@example.com',notes:'Conversation about reliability and developer experience.'},
    {id:'p3',name:'Sam Rivera',company:'Common Ground',role:'Former colleague',email:'sam@example.com',notes:'A warm introduction. Follow up after the first conversation.'},
    {id:'p4',name:'Taylor Brooks',company:'Fieldwork',role:'Talent partner',email:'taylor@example.com',notes:'Interested in consulting and customer-facing experience.'}
  ];
  const rows=[
    ['j1','Halcyon Labs','Senior Solutions Engineer','Interviewing','se',155000,8.5,'Boston, MA · Hybrid','p1',-12,'Prepare two customer stories',0,'green'],
    ['j2','Northstar Systems','Platform Engineer','Applied','platform',165000,8,'Cambridge, MA · Hybrid','p2',-8,'Check in with Jamie',-1,'blue'],
    ['j3','Common Ground','Technical Consultant','Saved','wildcard',140000,9,'Remote · US','p3',-3,'Ask Sam for an introduction',1,'gold'],
    ['j4','Fieldwork','Solutions Architect','Interviewing','se',175000,7.5,'Boston, MA · Hybrid','p4',-18,'Review architecture exercise',2,'coral'],
    ['j5','Morrow Studio','Developer Advocate','Saved','wildcard',135000,7,'Remote · US','',-2,'Read the role description',3,'purple'],
    ['j6','Signal Works','Site Reliability Engineer','Applied','platform',160000,8.5,'Remote · US','',-6,'Follow up on application',4,'green'],
    ['j7','Openwater','Customer Engineer','Offer','se',150000,8,'Boston, MA · Hybrid','',-24,'Write down offer questions',1,'blue'],
    ['j8','Atlas Foundry','Cloud Engineer','Closed','platform',145000,6.5,'New York, NY','',-30,'',0,'gold'],
    ['j9','Good Measure','Implementation Lead','Closed','se',130000,7,'Remote · US','',-21,'',0,'purple']
  ];
  w.jobs=rows.map(([id,company,role,stage,stream,salary,fit,location,person,offset,next,nextOffset,color],i)=>({id,company,role,stage,stream,salary,fit,location,person,color,outcome:stage==='Closed'?(i===7?'Rejected':'Declined'):'Active',url:'',created:relativeDate(offset),notes:id==='j1'?'What I want to learn: how much time is spent building versus presenting? Bring the customer incident story and a simple architecture sketch.':'Fictional example — replace this with your own research and impressions.',tasks:next?[{id:`t${i}`,title:next,date:relativeDate(nextOffset),done:false}]:[],events:[{id:`e${i}`,type:'Note',title:'Opportunity added to the journal',date:relativeDate(offset),time:'',notes:'Fictional sample entry.'}],archived:false}));
  w.jobs[0].events.push({id:'interview1',type:'Interview',title:'Team conversation with Alex',date:relativeDate(1),time:'14:00',notes:'Bring two stories: one technical, one about working with customers.'});
  w.jobs[3].events.push({id:'interview2',type:'Interview',title:'Architecture walkthrough',date:relativeDate(3),time:'11:30',notes:'Review the problem statement and prepare questions.'});
  w.documents=[{id:'d1',name:'Solutions résumé — sample.txt',kind:'Résumé',job:'j1',date:dateKey(),text:'SAMPLE DOCUMENT\n\nYour name\nSolutions Engineer\n\nReplace this example with a real résumé.\nA short summary, relevant experience, and measurable outcomes.',size:0},{id:'d2',name:'Interview story bank — sample.txt',kind:'Interview prep',job:'j4',date:dateKey(),text:'SAMPLE STORY BANK\n\nSituation:\nTask:\nAction:\nResult:\nWhat I learned:\n\nQuestions for the team:\n1. What does success look like in six months?\n2. What is the team learning right now?',size:0}];
  w.notes=[{id:'n1',title:'A small reminder',body:'I’m looking for work where technical depth and human connection matter equally. A conversation is progress, too.',date:dateKey()}];
  return w;
}
export function visibleJobs(w, {stream='all',query='',stage='all',archived=false}={}) { const q=query.trim().toLowerCase(); return w.jobs.filter(j=>Boolean(j.archived)===archived&&(stream==='all'||j.stream===stream)&&(stage==='all'||j.stage===stage)&&(!q||`${j.company} ${j.role} ${j.location} ${j.notes}`.toLowerCase().includes(q))); }
export function pendingTasks(w, stream='all') { return visibleJobs(w,{stream}).filter(j=>j.outcome==='Active'&&j.stage!=='Closed').flatMap(j=>j.tasks.filter(t=>!t.done).map(t=>({...t,job:j}))).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')); }
export function summary(w,stream='all') {const jobs=visibleJobs(w,{stream}),active=jobs.filter(j=>j.outcome==='Active'&&j.stage!=='Closed'); const paid=active.filter(j=>Number(j.salary)>0); return {jobs,active,interviews:active.filter(j=>j.stage==='Interviewing').length,offers:active.filter(j=>j.stage==='Offer').length,due:pendingTasks(w,stream).filter(t=>t.date&&dayDiff(t.date)<=0).length,avgSalary:paid.length?Math.round(paid.reduce((s,j)=>s+j.salary,0)/paid.length):null};}
const str=(v,max=2000)=>typeof v==='string'&&v.length<=max;
const date=v=>str(v,10)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&dateKey(parseDate(v))===v;
export function validateWorkspace(w) {
  if (!w||w.version!==1||!['jobs','people','documents','streams','notes'].every(k=>Array.isArray(w[k])&&w[k].length<=2000)) throw Error('This is not a supported Next Chapter backup.');
  if(!w.streams.length||w.streams.some(s=>!str(s.id,100)||!str(s.name,120)||!COLORS.includes(s.color))) throw Error('Invalid stream in backup.');
  for (const key of ['jobs','people','documents','streams','notes']) if(new Set(w[key].map(x=>x.id)).size!==w[key].length) throw Error('Duplicate IDs in backup.');
  for(const j of w.jobs) {
    if(!str(j.id,100)||!str(j.company,160)||!j.company.trim()||!str(j.role,160)||!j.role.trim()||!STAGES.includes(j.stage)||!OUTCOMES.includes(j.outcome)||!w.streams.some(s=>s.id===j.stream)||!str(j.location,200)||!str(j.notes,20000)||!str(j.url,2000)||!str(j.person,100)||!date(j.created)||!COLORS.includes(j.color)||typeof j.archived!=='boolean'||!Number.isFinite(j.salary)||j.salary<0||j.salary>1e8||!Number.isFinite(j.fit)||j.fit<0||j.fit>10||!Array.isArray(j.tasks)||j.tasks.length>2000||!Array.isArray(j.events)||j.events.length>2000) throw Error('Invalid opportunity in backup.');
    if(j.tasks.some(t=>!str(t.id,100)||!str(t.title,500)||typeof t.done!=='boolean'||(t.date!==''&&!date(t.date)))) throw Error('Invalid follow-up in backup.');
    if(j.events.some(e=>!str(e.id,100)||!str(e.title,500)||!str(e.type,40)||!date(e.date)||!str(e.time,5)||!str(e.notes,10000))) throw Error('Invalid timeline in backup.');
  }
  for(const p of w.people) if(!['id','name','company','role','email','notes'].every(k=>str(p[k],k==='notes'?10000:300))) throw Error('Invalid contact in backup.');
  for(const n of w.notes) if(!str(n.id,100)||!str(n.title,200)||!str(n.body,20000)||!date(n.date)) throw Error('Invalid note in backup.');
  for(const d of w.documents) if(!str(d.id,100)||!str(d.name,240)||!str(d.kind,80)||!str(d.job,100)||!date(d.date)||(!str(d.text,100000)&&!str(d.fileKey,100))) throw Error('Invalid document in backup.');
  return w;
}
export function csvExport(w) {const rows=[['Company','Role','Stage','Outcome','Stream','Annual compensation USD','Fit 0–10','Location','Created'],...w.jobs.map(j=>[j.company,j.role,j.stage,j.outcome,w.streams.find(s=>s.id===j.stream)?.name,j.salary||'',j.fit||'',j.location,j.created])]; return rows.map(r=>r.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n'); }
