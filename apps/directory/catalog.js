export const TYPE_LABELS = Object.freeze({games:'Games','catch-up':'Catch up',tools:'Tools',stories:'Stories & culture'});
export const SORTS = ['newest','updated','oldest','name','type'];
export function normalize(value) { return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
export function selectProjects(projects, {query='',type='all',sort='newest',favoritesOnly=false,kind=''}={}, favorites=new Set()) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  const selected = projects.filter(p => {
    if(type!=='all' && p.type!==type) return false;
    if(kind && p.subtype!==kind) return false;
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
