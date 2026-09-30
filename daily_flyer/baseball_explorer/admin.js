(() => {
  'use strict';
  const A=window.BaseballApp,{config,clone,esc}=A,$=id=>document.getElementById('bb-admin-'+id);
  let draft=clone(config.presets.presets),revision=config.presets.revision,slot=0,dirty=false,loaded=false,busy=false,renderId=0,playerList=[];
  const panel=document.getElementById('bb-admin'),status=text=>{$('status').textContent=text;};
  function mark(){dirty=true;status('Unsaved draft. Preview it or save all five presets when ready.');}
  async function api(method,path,payload){
    const response=await fetch('/api/baseball-presets'+path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'The request failed.');return result;
  }
  async function operation(fn){
    if(busy)return;busy=true;panel.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);
    try{await fn();}catch(error){status(error.name==='TimeoutError'?'The request timed out. A save may have reached the server; export your draft, then reload saved presets to check.':error.message);}
    finally{busy=false;panel.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false);}
  }
  function options(values,selected){return values.map(([v,label])=>`<option value="${v}" ${v===selected?'selected':''}>${esc(label)}</option>`).join('');}
  const fields=[
    ['role','Player role',[['batting','Hitters'],['pitching','Pitchers']]],
    ['mode','Open this view',[['compare','Compare seasons'],['research','Research later careers'],['scan','Explore every stat']]],
    ['metric','Statistic'],['outcome','Later-career outcome'],['x','Research comparison'],
    ['view','Chart view',[['pair','Year 1 → 2'],['career','What happened next?'],['span','Career span']]],
    ['window','Career window'],['normalize','Compare as'],['scale','Scale'],['layout','Layout'],['colors','Colors'],
    ['era','Year-one decade'],['team','Team at any point'],['hof','Hall status'],['sort','Player sort'],
    ['search','Player / team search filter','text'],['qual2','Require substantial year two','checkbox'],['skip2020','Exclude pairs involving 2020','checkbox']
  ];
  function playerChoices(){
    const s=draft[slot].settings,query=$('search').value.trim().toLowerCase(),matches=playerList.filter(p=>p.name.toLowerCase().includes(query));
    $('players').innerHTML=matches.slice(0,150).map(p=>`<label class="bb-player"><input type="checkbox" value="${esc(p.id)}" ${s.ids.includes(p.id)?'checked':''}><span>${esc(p.name)}<small>Year 1: ${p.first}</small></span></label>`).join('')+(matches.length>150?'<p class="bb-small">Search to narrow the list. The first 150 matches are shown.</p>':'');
    $('picked').textContent='Selected: '+(s.ids.map(id=>playerList.find(p=>p.id===id)?.name||id).join(', ')||'none')+'. Specific-player choices apply when selection is fixed; research always uses the filtered cohort.';
    $('players').querySelectorAll('input').forEach(e=>e.onchange=()=>{if(e.checked&&s.ids.length>=100){e.checked=false;status('Choose at most 100 specific players.');return;}s.ids=e.checked?[...s.ids,e.value]:s.ids.filter(id=>id!==e.value);mark();playerChoices();});
  }
  async function render(){
    const token=++renderId,p=draft[slot],s=p.settings;$('slot').innerHTML=draft.map((p,i)=>`<option value="${i}">${i+1} · ${esc(p.label)}</option>`).join('');$('slot').value=String(slot);$('label').value=p.label;$('story-title').value=p.title;$('note').value=p.note;
    $('selection').value=s.selection;$('count').value=s.count;
    $('fields').innerHTML=fields.map(([key,label,kind])=>{
      const id='bb-admin-field-'+key;
      if(kind==='text')return `<label>${label}<input id="${id}" maxlength="100" value="${esc(s[key])}"></label>`;
      if(kind==='checkbox')return `<label class="bb-check"><input id="${id}" type="checkbox" ${s[key]?'checked':''}>${label}</label>`;
      return `<label>${label}<select id="${id}">${key==='metric'?A.metricOptions(s.role,s.metric):Array.isArray(kind)?options(kind,s[key]):document.getElementById('bb-'+key).innerHTML}</select></label>`;
    }).join('');
    for(const [key,,kind] of fields){const e=$('field-'+key);if(kind!=='checkbox')e.value=s[key];e.addEventListener(kind==='text'?'input':'change',async()=>{
      s[key]=kind==='checkbox'?e.checked:e.value;
      if(key==='role'){const defaults=A.defaults(s.role);s.metric=defaults.metric;s.ids=clone(defaults.ids);mark();await render();}else mark();
    });}
    $('players').textContent='Loading player choices…';
    try{const list=await A.loadRole(s.role);if(token!==renderId)return;playerList=list;playerChoices();}catch(_){if(token===renderId)$('players').textContent='Player choices could not load. Close and reopen the editor to retry.';}
  }
  async function reload(){const result=await api('GET','');draft=clone(result.presets);revision=result.revision;dirty=false;loaded=true;A.updatePresets(result.presets);await render();status('Loaded shared presets. '+result.storage);}
  async function open(){
    panel.hidden=false;const url=new URL(location.href);url.searchParams.set('preset_admin','1');history.replaceState(null,'',url);panel.scrollIntoView({block:'start'});
    if(!loaded&&!dirty)await operation(reload);else await render();
  }
  $('open').onclick=open;
  $('close').onclick=()=>{panel.hidden=true;const url=new URL(location.href);url.searchParams.delete('preset_admin');if(url.hash==='#bb-admin')url.hash='';history.replaceState(null,'',url);};
  $('slot').innerHTML=draft.map((p,i)=>`<option value="${i}">${i+1} · ${esc(p.label)}</option>`).join('');
  $('slot').onchange=()=>{slot=Number($('slot').value);$('search').value='';render();};
  for(const [id,key] of [['label','label'],['story-title','title'],['note','note']])$(id).oninput=()=>{draft[slot][key]=$(id).value;mark();};
  $('selection').onchange=()=>{draft[slot].settings.selection=$('selection').value;mark();};$('count').oninput=()=>{draft[slot].settings.count=Number($('count').value);mark();};
  $('search').oninput=playerChoices;
  $('capture').onclick=async()=>{draft[slot].settings={...A.getState(),selection:'fixed'};mark();await render();status('Captured the current view, filters and selected players. Save to make this preset public.');};
  $('reset').onclick=async()=>{draft[slot]=clone(config.factory[slot]);mark();await render();status('Factory values are in this draft only. Save to publish them.');};
  $('preview').onclick=()=>operation(async()=>{const valid=await api('POST','/validate',{presets:draft});await A.applyPreset(valid.presets[slot],true);status('Preview opened above. This draft has not been saved.');});
  $('save').onclick=()=>operation(async()=>{const result=await api('PUT','',{presets:draft,revision});draft=clone(result.presets);revision=result.revision;dirty=false;A.updatePresets(result.presets);await render();status('Saved all five baseball presets. New page loads will use them. '+result.storage);});
  $('reload').onclick=()=>{if(dirty&&!confirm('Discard this unsaved draft and load the shared presets? Export first if you want to keep a backup.'))return;operation(reload);};
  $('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({schema_version:1,sport:'baseball',presets:draft},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='baseball-preset-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Draft backup exported. Shared presets have not changed.');};
  $('import').onchange=()=>operation(async()=>{const file=$('import').files[0];if(!file)return;if(file.size>65536)throw new Error('Backup exceeds 64 KiB.');const document=JSON.parse(await file.text());if(document.schema_version!==1||document.sport!=='baseball')throw new Error('Use a version-one baseball preset backup.');const valid=await api('POST','/validate',{presets:document.presets});draft=clone(valid.presets);mark();await render();status('Imported into this draft. Preview or save to make it public.');$('import').value='';});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  if(new URLSearchParams(location.search).get('preset_admin')==='1'||location.hash==='#bb-admin')open();
})();
