import {renderArtwork} from './artwork.js';
import {TYPE_LABELS,SORTS,selectProjects,featuredProjects,formatAddedDate,formatUpdatedDate,projectLink,validateCatalog} from './catalog.js';
const STORE='dfe.directory.v1';
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const star='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z"/></svg>';
const copyIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/></svg>';
const ACCENTS={dsl:'#c4cf9d',gridiron:'#cfeaa4',infierno:'#dfaf9e','further-in':'#d6cd96',breach:'#f2b19c','irish-today':'#b1d4b7',garage:'#9dc9df','night-transfer':'#9dcbd0',mypassages:'#b1dacf',saltbound:'#96d7cc',empires:'#d0bd90',huddle:'#b8cc8d',vineyard:'#c3b99d','roster-radar':'#adce96',lockstep:'#d8c09a','next-chapter':'#e1c4a6','soph-slump':'#dcc39b','magic-catch-up':'#d3b4de',rlcs:'#9ebfe5',skyward:'#abd1e5',hockey:'#a7d7e7',soccer:'#d4d885','sleeve-notes':'#e4bb91',battlezone:'#a4de9e','when-ants-stare':'#ceab8c','last-exit':'#c4b1d8',afterglow:'#d6b2dd','claim-denied':'#d5a29a','magic-duel':'#c9aed3','relay-fieldguide':'#e1b892',farwake:'#acb8da',dayboard:'#c1ccaf',gravebloom:'#d3b38b',baseball:'#d8dfb4','sunday-broadcast':'#e7c589','shenanigans-golf':'#bcd49e','corner-pocket':'#e1c092','low-water':'#aac6bc',skybreak:'#b4d6df',trailmark:'#cfcea7',loudsource:'#edbd8a',lmw:'#f6bd91',suncoast:'#bce9e0','first-riff':'#e1be73','galaxy-granite':'#c6bda6','hll-daily':'#c4c9a9','magic-quadratic':'#b9cbe3',birthday:'#e3c094','passages-daily':'#c3d8ba'};
function readStored(){try{const value=JSON.parse(localStorage.getItem(STORE)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
const stored=readStored(),params=new URLSearchParams(location.search);
const fromURL=['q','type','sort','saved','kind'].some(k=>params.has(k));
// Older shared links omitted "all"; preserve those while making the root Games.
const initialType=params.get('type')||(fromURL?'all':'games');
const initialSort=params.get('sort')||'newest';
const state={query:fromURL?(params.get('q')||''):'',type:initialType==='all'||TYPE_LABELS[initialType]?initialType:'games',sort:SORTS.includes(initialSort)?initialSort:'newest',favoritesOnly:fromURL?params.get('saved')==='1':false,view:stored.view==='list'?'list':'grid',kind:fromURL?(params.get('kind')||''):''};
// Games is the landing view, not an implicit restriction on a new search.
let defaultBrowse=!fromURL;
const favorites=new Set(Array.isArray(stored.favorites)?stored.favorites.filter(x=>typeof x==='string'):[]);
let projects=[],visible=[],featured=[],toastTimer,catalogReady=false;
function setBrowseEnabled(enabled){document.querySelectorAll('.browse-controls input,.browse-controls select,.browse-controls button,#clear-filters,#empty-reset,#explore-all').forEach(control=>control.disabled=!enabled);$('copy-visible').disabled=!enabled||!visible.length;}
function save(){try{localStorage.setItem(STORE,JSON.stringify({view:state.view,favorites:[...favorites]}));}catch{}}
function updateURL(){const url=new URL(location.href);url.search='';if(state.query)url.searchParams.set('q',state.query);if(!defaultBrowse||state.type!=='games'||state.query||state.sort!=='newest'||state.favoritesOnly||state.kind)url.searchParams.set('type',state.type);if(state.sort!=='newest')url.searchParams.set('sort',state.sort);if(state.favoritesOnly)url.searchParams.set('saved','1');if(state.kind)url.searchParams.set('kind',state.kind);history.replaceState(null,'',url);}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2500);}
async function copy(text,message){try{await navigator.clipboard.writeText(text);toast(message);}catch{$('copy-text').value=text;$('copy-dialog').showModal();$('copy-text').focus();$('copy-text').select();}}
function displayURL(link){const url=new URL(link);return {host:url.hostname,path:(url.pathname==='/'?'':url.pathname)+url.search+url.hash};}
function featuredCard(p){
  const title=escapeHTML(p.title),link=escapeHTML(projectLink(p));
  return `<a class="featured-card" data-featured="${escapeHTML(p.id)}" href="${link}" target="_blank" rel="noopener noreferrer" aria-label="Open ${title} in a new tab" style="--card-accent:${ACCENTS[p.art]||'#d9ecae'}">
    <div class="featured-art" aria-hidden="true">${renderArtwork({...p,id:'featured-'+p.id})}</div>
    <div class="featured-copy"><span class="featured-label">${escapeHTML(p.featuredLabel)}</span><h3>${title}</h3><p>${escapeHTML(p.featuredSummary)}</p><span class="featured-action">${p.type==='games'?'Play':'Open'} ${title}<svg class="launch-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15 15 5M5 5h10v10"/></svg></span></div>
  </a>`;
}
function card(p){
  const link=projectLink(p),title=escapeHTML(p.title),isFavorite=favorites.has(p.id),address=displayURL(link);
  const access=p.linkKind==='source'?'Source project':p.linkKind==='preview'?'Preview':p.access==='signin'?'Sign-in required':'';
  const note=p.id==='empires'?'Opens DSL. Choose Empires inside the site.':'';
  return `<article class="project-card" data-project="${escapeHTML(p.id)}" data-art="${escapeHTML(p.art)}" style="--card-accent:${ACCENTS[p.art]||'#d9ecae'}">
    <a class="card-visual" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">${renderArtwork(p)}</a>
    <div class="card-body">
      <div class="card-heading"><h2><a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${title} in a new tab">${title}<svg class="launch-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15 15 5M5 5h10v10"/></svg></a></h2><button type="button" class="favorite-button" data-favorite="${escapeHTML(p.id)}" aria-label="${isFavorite?'Remove':'Add'} ${title} ${isFavorite?'from':'to'} favorites" aria-pressed="${isFavorite}" title="${isFavorite?'Remove favorite':'Save favorite'}">${star}</button></div>
      <div class="card-meta"><span class="card-kind">${escapeHTML(p.subtype)}${p.featuredRank?'<span class="featured-tag">Featured</span>':''}</span><span title="${p.datePrecision==='month'?'Added in this approximate month; the exact day is not recorded.':'Added: first recorded theme build or deployment.'}"><time${p.createdAt?` datetime="${escapeHTML(p.datePrecision==='month'?p.createdAt.slice(0,7):p.createdAt)}"`:''}>${escapeHTML(formatAddedDate(p))}</time></span></div>
      <p class="card-description">${escapeHTML(p.description)}</p>
      ${p.updateSummary?`<p class="card-update"><span class="update-date">Updated <time datetime="${escapeHTML(p.updatedAt)}">${escapeHTML(formatUpdatedDate(p))}</time></span>${escapeHTML(p.updateSummary)}</p>`:''}
      ${note?`<p class="card-note">${escapeHTML(note)}</p>`:''}
      ${access?`<p class="access-label">${escapeHTML(access)}</p>`:''}
      <div class="card-footer"><span class="url-label" title="${escapeHTML(link)}"><span class="url-host">${escapeHTML(address.host)}</span>${address.path?`<span class="url-path">${escapeHTML(address.path)}</span>`:''}</span><button type="button" class="copy-link" data-copy="${escapeHTML(p.id)}" aria-label="Copy ${title} link" title="Copy link">${copyIcon}</button></div>
    </div>
  </article>`;
}
function render({persist=true}={}){
  visible=selectProjects(projects,state,favorites);
  $('featured').hidden=!featured.length||Boolean(state.query.trim()||state.kind||state.favoritesOnly)||!['games','all'].includes(state.type);
  $('collection').innerHTML=visible.map(card).join('');
  $('collection').classList.toggle('is-list',state.view==='list');
  $('view-grid').setAttribute('aria-pressed',String(state.view==='grid'));
  $('view-list').setAttribute('aria-pressed',String(state.view==='list'));
  $('favorites-filter').setAttribute('aria-pressed',String(state.favoritesOnly));
  $('favorites-count').textContent=favorites.size;
  document.querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===state.type)));
  $('sort').value=state.sort;
  const scopedCount=state.type==='all'?projects.length:projects.filter(p=>p.type===state.type).length;
  const narrowed=state.query||state.favoritesOnly||state.kind;
  const noun=state.type==='games'?'game':'project';
  $('page-title').textContent=state.type==='all'?'All projects':TYPE_LABELS[state.type];
  $('search').placeholder=defaultBrowse||state.type==='all'?'Search all projects':`Search ${TYPE_LABELS[state.type].toLowerCase()}`;
  $('results-description').textContent=`${visible.length}${narrowed?` of ${scopedCount}`:''} ${noun}${visible.length===1&&!narrowed?'':'s'}${state.favoritesOnly?' · favorites':''}`;
  $('clear-filters').hidden=!narrowed;$('copy-visible').disabled=!catalogReady||!visible.length;$('empty-state').hidden=visible.length>0;
  $('empty-state').querySelector('h2').textContent=state.favoritesOnly&&!favorites.size?'No favorites yet.':`No matches${state.type==='all'?'':` in ${TYPE_LABELS[state.type]}`}.`;
  const otherMatches=!visible.length&&state.query.trim()?selectProjects(projects,{query:state.query}).length:0;
  $('empty-message').textContent=otherMatches?`${otherMatches} matching ${otherMatches===1?'project is':'projects are'} outside the current filters.`:state.favoritesOnly&&!favorites.size?'Star a project to save it here.':'Try another title or show all projects.';
  $('empty-reset').textContent=otherMatches?'Search all projects':'Show all projects';
  $('game-kind').hidden=state.type!=='games';$('game-kind-slot').hidden=state.type!=='games';$('game-kind').value=state.kind;
  $('collection-hint').hidden=state.type!=='games';
  if(persist){save();updateURL();}
}
function reset(){defaultBrowse=false;state.query='';state.type='all';state.kind='';state.favoritesOnly=false;$('search').value='';render();}
function expandSearch(){
  if(state.query.trim()&&selectProjects(projects,{query:state.query}).length){defaultBrowse=false;state.type='all';state.kind='';state.favoritesOnly=false;render();}
  else reset();
}
async function init(){
  try{
    const response=await fetch('./projects.json');if(!response.ok)throw new Error('Could not load the catalog.');
    projects=validateCatalog(await response.json());
    featured=featuredProjects(projects);
    $('featured-projects').innerHTML=featured.map(featuredCard).join('');
    for(const id of favorites)if(!projects.some(p=>p.id===id))favorites.delete(id);
    $('total-count').textContent=projects.length;
    $('other-projects-count').textContent=projects.filter(p=>p.type!=='games').length;
    document.querySelectorAll('[data-count]').forEach(el=>el.textContent=el.dataset.count==='all'?projects.length:projects.filter(p=>p.type===el.dataset.count).length);
    const kinds=[...new Set(projects.filter(p=>p.type==='games').map(p=>p.subtype))].sort();
    const kindSelect=document.createElement('select');kindSelect.id='game-kind';kindSelect.className='game-kind';kindSelect.disabled=true;kindSelect.setAttribute('aria-label','Filter games by kind');kindSelect.innerHTML='<option value="">All game types</option>'+kinds.map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
    $('game-kind-slot').append(kindSelect);
    if(state.type!=='games'||!kinds.includes(state.kind))state.kind='';
    kindSelect.addEventListener('change',()=>{defaultBrowse=false;state.kind=kindSelect.value;render();});
    $('search').value=state.query;
    $('search').addEventListener('input',()=>{state.query=$('search').value;if(defaultBrowse&&state.query.trim()){state.type='all';state.kind='';defaultBrowse=false;}render();});
    $('sort').addEventListener('change',()=>{state.sort=$('sort').value;render();});
    $('type-filters').addEventListener('click',e=>{const b=e.target.closest('[data-type]');if(!b)return;defaultBrowse=false;state.type=b.dataset.type;state.kind='';render();window.scrollTo({top:0,behavior:'auto'});});
    $('favorites-filter').addEventListener('click',()=>{defaultBrowse=false;state.favoritesOnly=!state.favoritesOnly;render();});
    for(const view of ['grid','list'])$(`view-${view}`).addEventListener('click',()=>{state.view=view;render();});
    $('clear-filters').addEventListener('click',reset);$('empty-reset').addEventListener('click',expandSearch);$('explore-all').addEventListener('click',reset);
    $('collection').addEventListener('click',e=>{
      const fav=e.target.closest('[data-favorite]');
      if(fav){const id=fav.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);render();const button=document.querySelector(`[data-favorite="${id}"]`);if(button)button.focus({preventScroll:true});else $('favorites-filter').focus({preventScroll:true});return;}
      const copyButton=e.target.closest('[data-copy]');if(copyButton){const p=projects.find(p=>p.id===copyButton.dataset.copy);copy(projectLink(p),`${p.title} link copied`);}
    });
    $('copy-visible').addEventListener('click',()=>copy(visible.map(p=>`${p.title}\n${projectLink(p)}`).join('\n\n'),`${visible.length} project ${visible.length===1?'link':'links'} copied`));
    document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!$('copy-dialog').open){e.preventDefault();$('search').focus();}if(e.key==='Escape'&&document.activeElement===$('search')){state.query='';$('search').value='';render();$('search').blur();}});
    render({persist:false});catalogReady=true;setBrowseEnabled(true);
  }catch(error){
    catalogReady=false;setBrowseEnabled(false);
    console.error(error);$('results-description').textContent='The library could not load.';$('empty-state').hidden=false;$('empty-state').querySelector('h2').textContent='Please try again.';$('empty-message').textContent='Reload the page to fetch the project directory.';$('empty-reset').textContent='Reload directory';$('empty-reset').disabled=false;$('empty-reset').addEventListener('click',()=>location.reload());
  }
}
init();
