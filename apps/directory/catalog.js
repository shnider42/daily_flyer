export const TYPE_LABELS = Object.freeze({games:'Games','catch-up':'Catch up',tools:'Tools',stories:'Stories & culture'});
export const DEVICE_LABELS = Object.freeze({mobile:'Best on mobile',desktop:'Best on desktop',both:'Mobile & desktop'});
export const SORTS = ['newest','updated','oldest','name','type'];
const DAY=86400000,WEEK=7*DAY,FEATURE_EPOCH=Date.UTC(2026,10,23);
const featureCalendar=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const modulo=(value,divisor)=>((value%divisor)+divisor)%divisor;

// Calendar weeks are shared by every visitor, independent of their local timezone.
export function featureWeek(now=new Date()) {
  const date=new Date(now);
  if(Number.isNaN(date.getTime())) throw new RangeError('A valid date is required for weekly features.');
  const parts=Object.fromEntries(featureCalendar.formatToParts(date).map(part=>[part.type,part.value]));
  const monday=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));
  monday.setUTCDate(monday.getUTCDate()-modulo(monday.getUTCDay()-1,7));
  return monday.toISOString().slice(0,10);
}
function hash(value) {
  let result=2166136261;
  for(let i=0;i<value.length;i++) result=Math.imul(result^value.charCodeAt(i),16777619);
  result=Math.imul(result^(result>>>16),2246822507);
  result=Math.imul(result^(result>>>13),3266489909);
  return (result^(result>>>16))>>>0;
}
function matchesDevice(project,device) {
  return device==='all'||(Object.hasOwn(DEVICE_LABELS,device)&&(project.device?.best===device||(device!=='both'&&project.device?.best==='both')));
}
function featurePool(projects,weekIndex) {
  const eligible=projects.filter(p=>p.featureEligible===true&&Number.isInteger(p.featureWeight)&&p.featureWeight>0&&p.linkKind!=='source'&&projectLink(p));
  const requestedFocus=['all','mobile','all','desktop'][modulo(weekIndex,4)];
  const focused=eligible.filter(p=>matchesDevice(p,requestedFocus));
  const supportsFocus=focused.length>=3&&new Set(focused.map(p=>p.type)).size>=3;
  return {focus:requestedFocus==='all'||!supportsFocus?'all':requestedFocus,pool:supportsFocus?focused:eligible};
}
function featureWeight(project,weekTime) {
  const latest=project.updatedAt||(project.datePrecision==='day'?project.createdAt:null);
  const age=latest?(weekTime-Date.parse(latest+'T00:00:00Z'))/DAY:Infinity;
  // Readiness is the main weight; verified work in the last eight weeks gets a small lift.
  return project.featureWeight*(age>=0&&age<56?1.2:1);
}
function rankedFeatures(pool,weekIndex,focus) {
  const weekTime=FEATURE_EPOCH+weekIndex*WEEK;
  return pool.map(project=>({project,score:-Math.log((hash(`dfe-features-v1|${weekIndex}|${focus}|${project.id}`)+1)/4294967297)/featureWeight(project,weekTime)}))
    .sort((a,b)=>a.score-b.score||a.project.id.localeCompare(b.project.id)).map(entry=>entry.project);
}
function rawEdition(projects,weekIndex) {
  const {focus,pool}=featurePool(projects,weekIndex);
  const ranked=rankedFeatures(pool,weekIndex,focus);
  // Cycle the omitted category so a large games catalog cannot crowd out other types.
  const types=[...new Set(pool.map(p=>p.type))].sort((a,b)=>hash('dfe-feature-type|'+a)-hash('dfe-feature-type|'+b)||a.localeCompare(b));
  // Shift the category cycle every four weeks so device focus never fixes which type is omitted.
  const offset=types.length?modulo(weekIndex+Math.floor(weekIndex/4),types.length):0;
  const chosenTypes=types.slice(offset).concat(types.slice(0,offset)).slice(0,3);
  let selected=chosenTypes.map(type=>ranked.find(p=>p.type===type));
  for(const project of ranked) {
    if(selected.length>=3) break;
    if(!selected.includes(project)) selected.push(project);
  }
  const typeCount=Math.min(types.length,3);
  if(focus==='all') for(const device of ['mobile','desktop']) {
    if(selected.some(p=>matchesDevice(p,device))) continue;
    balance: for(const candidate of ranked) {
      if(selected.includes(candidate)||!matchesDevice(candidate,device)) continue;
      for(let index=0;index<selected.length;index++) {
        const alternative=selected.map((project,position)=>position===index?candidate:project);
        if(new Set(alternative.map(p=>p.type)).size===typeCount&&(device==='mobile'||alternative.some(p=>matchesDevice(p,'mobile')))) {
          selected=alternative;
          break balance;
        }
      }
    }
  }
  return {focus,projects:selected,ranked,typeCount};
}
const featureSetKey=projects=>projects.map(p=>p.id).sort().join('|');
export function featureEdition(projects,now=new Date()) {
  const week=featureWeek(now),weekIndex=Math.round((Date.parse(week+'T00:00:00Z')-FEATURE_EPOCH)/WEEK);
  const edition=rawEdition(projects,weekIndex);
  // Odd weeks are independent draws. Even weeks avoid both neighboring odd sets,
  // so the trio changes without storing history or recomputing years of editions.
  if(modulo(weekIndex,2)===0&&edition.projects.length===3) {
    const neighboringSets=new Set([weekIndex-1,weekIndex+1].map(index=>featureSetKey(rawEdition(projects,index).projects)));
    if(neighboringSets.has(featureSetKey(edition.projects))) {
      replacement: for(const candidate of edition.ranked) {
        if(edition.projects.includes(candidate)) continue;
        for(let index=0;index<edition.projects.length;index++) {
          const alternative=edition.projects.map((project,position)=>position===index?candidate:project);
          if(new Set(alternative.map(p=>p.type)).size===edition.typeCount&&!neighboringSets.has(featureSetKey(alternative))&&(edition.focus!=='all'||['mobile','desktop'].every(device=>!edition.projects.some(p=>matchesDevice(p,device))||alternative.some(p=>matchesDevice(p,device))))) {
            edition.projects=alternative;
            break replacement;
          }
        }
      }
    }
  }
  return {week,focus:edition.focus,projects:edition.projects};
}
export function featuredProjects(projects,now=new Date()) {return featureEdition(projects,now).projects;}
export function normalize(value) { return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
export function selectProjects(projects, {query='',type='all',sort='newest',favoritesOnly=false,kind='',device='all'}={}, favorites=new Set()) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  const selected = projects.filter(p => {
    if(type!=='all' && p.type!==type) return false;
    if(kind && p.subtype!==kind) return false;
    if(!matchesDevice(p,device)) return false;
    if(favoritesOnly && !favorites.has(p.id)) return false;
    const searchable=normalize([p.title,p.subtitle,p.description,p.updateSummary,p.id,p.type,TYPE_LABELS[p.type],p.subtype,p.url,...(p.aliases??[]),...(p.tags??[])].join(' '));
    return tokens.every(token=>searchable.includes(token));
  });
  const byName=(a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base',numeric:true});
  return selected.sort((a,b)=> {
    if(sort==='name') return byName(a,b);
    if(sort==='type') return TYPE_LABELS[a.type].localeCompare(TYPE_LABELS[b.type]) || byName(a,b);
    const createdA=a.datePrecision==='unknown'?null:a.createdAt,createdB=b.datePrecision==='unknown'?null:b.createdAt;
    const da=sort==='updated'?(a.updatedAt||createdA):createdA,db=sort==='updated'?(b.updatedAt||createdB):createdB;
    if(!da && !db) return byName(a,b);
    if(!da) return 1;
    if(!db) return -1;
    return (sort==='oldest'?da.localeCompare(db):db.localeCompare(da)) || byName(a,b);
  });
}
export function formatAddedDate(project) {
  if(!project.createdAt || project.datePrecision==='unknown') return 'Date not recorded';
  const date=new Date(project.createdAt+'T12:00:00Z');
  if(Number.isNaN(date.getTime())) return 'Date not recorded';
  if(project.datePrecision==='month') return '~ '+new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(date);
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);
}
export function formatUpdatedDate(project) {
  return project.updatedAt?formatAddedDate({createdAt:project.updatedAt,datePrecision:'day'}):'';
}
export function projectLink(project) {
  const candidate=project.url || project.sourceUrl;
  if(!candidate) return null;
  try {const url=new URL(candidate);return url.protocol==='https:'?url.href:null;} catch{return null;}
}
export function validateCatalog(projects) {
  if(!Array.isArray(projects) || !projects.length) throw new Error('The project catalog is empty.');
  const ids=new Set();
  for(const p of projects) {
    if(!/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id)) throw new Error('A project ID is missing or repeated.');
    ids.add(p.id);
    if(!p.title || !TYPE_LABELS[p.type] || !p.art) throw new Error('A project is missing its name, type, or artwork.');
    if(!p.device || !Object.hasOwn(DEVICE_LABELS,p.device.best) || typeof p.device.note!=='string' || !p.device.note.trim()) throw new Error('A project needs a device recommendation and explanation.');
    if(p.featureEligible!==undefined && typeof p.featureEligible!=='boolean') throw new Error('Feature eligibility must be a boolean when provided.');
    if(!Number.isInteger(p.featureWeight) || p.featureWeight<0 || p.featureWeight>5) throw new Error('A project feature weight must be an integer from 0 to 5.');
    if(!projectLink(p)) throw new Error('A project has no valid HTTPS destination.');
    if(!['day','month','unknown'].includes(p.datePrecision)) throw new Error('A project has an invalid date precision.');
    if(p.datePrecision!=='unknown' && (!/^\d{4}-\d{2}-\d{2}$/.test(p.createdAt??'') || Number.isNaN(Date.parse(p.createdAt)))) throw new Error('A project has an invalid date.');
    if(p.updatedAt || p.updateSummary || p.updateSource) {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(p.updatedAt??'') || Number.isNaN(Date.parse(p.updatedAt))) throw new Error('A project has an invalid update date.');
      if(p.createdAt && p.updatedAt<p.createdAt) throw new Error('A project update predates its creation.');
      if(typeof p.updateSummary!=='string' || !p.updateSummary.trim()) throw new Error('A project update needs a summary.');
      if(!projectLink({url:p.updateSource})) throw new Error('A project update needs a verified source.');
    }
  }
  return projects;
}
