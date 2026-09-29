(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('qb-data').textContent);
  const $=id=>document.getElementById('qa-'+id),root=document.getElementById('qb-preset-admin');
  const copy=value=>JSON.parse(JSON.stringify(value));
  const emit=(type,detail={})=>{document.dispatchEvent(new CustomEvent('qb:'+type,{detail}));return detail;};
  let bundle=copy(data.preset_config),draft=copy(bundle.presets),slot=0,dirty=false,busy=false;
  const filmFields=[
    ['metric','Measure','primary'],['view','Chart view','primary'],['window','Years shown','primary'],
    ['normalize','Compare as','primary'],['layout','Chart layout','primary'],['colors','Line colors','primary'],['scale','Y-axis scale','primary'],
    ['search','Name / team search filter'],['era','First 12-start season'],['hof','Hall filter'],['team','Team filter'],
    ['y2qual','Require 12 starts for one team in year two'],['sort','Display / table order'],['range','Y-axis range'],
    ['ymin','Minimum Y'],['ymax','Maximum Y'],['points','Season markers'],['opacity','Line strength (%)'],['height','Graph height']
  ];
  const researchFields=[['metric','Measure'],['outcome','Later outcome'],['x','Compare outcome against'],['era','First qualifying era'],['hof','Show Hall of Famers'],['field','Show non-Hall quarterbacks']];
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('qa-error',error);}
  function makeField(group,key,title,container){
    let control;
    const source=document.getElementById((group==='f'?'qb-':'qr-')+key);
    if(key==='view'){
      control=document.createElement('select');
      for(const [value,text] of [['year2','Year 1 → 2'],['performance','Career performance'],['career','Career length']])control.add(new Option(text,value));
    }else control=source.cloneNode(true);
    control.id='qa-'+group+'-'+key;control.removeAttribute('name');control.removeAttribute('title');control.disabled=false;
    if(control.type==='range'){control.type='number';control.min='15';control.max='100';control.step='5';}
    if(control.type==='search'){control.type='text';control.maxLength=100;}
    if(key==='ymin'||key==='ymax'){control.min='-1000000000';control.max='1000000000';control.step='any';}
    const label=document.createElement('label');
    if(control.type==='checkbox'){label.className='qa-check';label.append(control,document.createTextNode(title));}
    else label.append(document.createTextNode(title),control);
    $(container).append(label);
  }
  filmFields.forEach(([key,title,section])=>makeField('f',key,title,section==='primary'?'film-primary':'film-advanced'));
  researchFields.forEach(([key,title])=>makeField('r',key,title,'research-fields'));
  function renderSlots(){
    $('slot').replaceChildren(...draft.map((p,i)=>new Option((i+1)+' · '+p.label,String(i))));$('slot').value=String(slot);
  }
  function readForm(){
    const p=draft[slot];p.label=$('label').value;p.title=$('heading').value;p.note=$('note').value;p.mode=$('mode').value;
    p.film.selection=$('selection').value;p.film.count=Number($('count').value);
    for(const [key] of filmFields){const el=$('f-'+key);p.film[key]=el.type==='checkbox'?el.checked:key==='opacity'?Number(el.value):el.value;}
    for(const [key] of researchFields){const el=$('r-'+key);p.research[key]=el.type==='checkbox'?el.checked:el.value;}
  }
  function displayMode(){
    const p=draft[slot],film=p.mode==='film';
    $('film').hidden=!film;$('research').hidden=film;$('film').disabled=!film;$('research').disabled=film;
    $('pick-players').hidden=p.film.selection!=='fixed';$('count-wrap').hidden=p.film.selection==='fixed';$('count').required=p.film.selection!=='fixed';
    $('f-window').parentElement.hidden=p.film.view!=='performance';
    for(const key of ['normalize','layout'])$('f-'+key).disabled=p.film.view==='career';
    for(const key of ['ymin','ymax']){$('f-'+key).parentElement.hidden=p.film.range!=='custom';$('f-'+key).required=p.film.range==='custom';}
  }
  function playerPicker(){
    const chosen=new Set(draft[slot].film.ids),query=$('player-search').value.trim().toLowerCase();
    $('picked').replaceChildren();$('players').replaceChildren();
    for(const p of data.players){
      if(chosen.has(p.id)){
        const button=document.createElement('button');button.type='button';button.textContent=p.name+' ×';button.setAttribute('aria-label','Remove '+p.name);
        button.addEventListener('click',()=>{readForm();draft[slot].film.ids=draft[slot].film.ids.filter(id=>id!==p.id);markDirty();playerPicker();});$('picked').append(button);
      }
      if(query&&!p.name.toLowerCase().includes(query))continue;
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=chosen.has(p.id);input.dataset.qb=p.id;
      input.addEventListener('change',()=>{readForm();const ids=new Set(draft[slot].film.ids);input.checked?ids.add(p.id):ids.delete(p.id);draft[slot].film.ids=[...ids];markDirty();playerPicker();});
      label.append(input,document.createTextNode(p.name));$('players').append(label);
    }
    if(!$('players').children.length)$('players').textContent='No matching quarterbacks.';
    if(!chosen.size)$('picked').textContent='No specific quarterbacks selected.';
  }
  function renderForm(){
    const p=draft[slot];renderSlots();$('label').value=p.label;$('heading').value=p.title;$('note').value=p.note;$('mode').value=p.mode;
    $('selection').value=p.film.selection;$('count').value=p.film.count;
    for(const [key] of filmFields){const el=$('f-'+key);if(el.type==='checkbox')el.checked=p.film[key];else el.value=p.film[key];}
    for(const [key] of researchFields){const el=$('r-'+key);if(el.type==='checkbox')el.checked=p.research[key];else el.value=p.research[key];}
    displayMode();playerPicker();
  }
  function markDirty(){dirty=true;status('Draft changed — not saved for visitors yet.');}
  function updateBundle(next){
    bundle=copy(next);draft=copy(next.presets);dirty=false;renderForm();$('storage').textContent=next.storage.message;
    emit('presets-updated',{presets:next.presets});
  }
  async function api(path,method='GET',body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(path,{method,cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Server request failed.');return result;
    }catch(error){if(error.name==='AbortError')throw new Error('Server response was not confirmed. Your draft is kept. Reload saved presets to check before retrying a save.');throw error;}
    finally{clearTimeout(timer);}
  }
  async function run(action){
    if(busy)return;busy=true;root.setAttribute('aria-busy','true');
    const controls=[...root.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);controls.forEach(([el])=>{el.disabled=true;});
    try{await action();}catch(error){status(error.message||'The request failed. Your draft is kept.',true);}
    finally{busy=false;root.removeAttribute('aria-busy');controls.forEach(([el,disabled])=>{el.disabled=disabled;});displayMode();}
  }
  async function validatedDraft(){
    const result=await api('/api/qb-presets/validate','POST',{presets:draft});draft=result.presets;renderForm();return draft;
  }
  $('form').addEventListener('input',event=>{
    if(event.target===$('slot')||event.target===$('player-search')||event.target.dataset.qb)return;
    readForm();markDirty();displayMode();
  });
  $('slot').addEventListener('change',()=>{readForm();slot=Number($('slot').value);$('player-search').value='';renderForm();});
  $('player-search').addEventListener('input',playerPicker);
  $('capture').addEventListener('click',()=>{
    readForm();const r=emit('research-snapshot').value,p=draft[slot];p.mode=r.mode;
    if(r.mode==='research')p.research={...r.state,hof:r.hof,field:r.field};
    else{const f=emit('film-snapshot').value;for(const key of Object.keys(p.film))if(Object.hasOwn(f,key))p.film[key]=copy(f[key]);p.film.selection='fixed';}
    markDirty();renderForm();status('Current view copied into this draft. Preview it or save it for everyone.');
  });
  $('default').addEventListener('click',()=>{draft[slot]=copy(data.preset_factory[slot]);markDirty();renderForm();status('Factory values restored in the draft only. Save to publish them.');});
  $('preview').addEventListener('click',()=>{
    if(!$('form').reportValidity())return;readForm();
    run(async()=>{await validatedDraft();emit('preview-preset',{preset:draft[slot]});status('Preview only — nothing saved for visitors. Return here to keep editing or save.');});
  });
  $('form').addEventListener('submit',event=>{
    event.preventDefault();readForm();
    run(async()=>{
      if(!bundle.revision)throw new Error('Storage could not be read. Export your draft, repair storage, then reload saved presets.');
      const result=await api('/api/qb-presets','PUT',{presets:draft,revision:bundle.revision});updateBundle(result);
      status('Saved for everyone. New or reloaded pages will use these presets. '+result.storage.message);
    });
  });
  $('reload').addEventListener('click',()=>{
    if(dirty&&!confirm('Discard your unsaved draft and load the shared presets?'))return;
    run(async()=>{updateBundle(await api('/api/qb-presets'));status('Loaded the latest shared presets.');});
  });
  $('export').addEventListener('click',()=>{
    readForm();const url=URL.createObjectURL(new Blob([JSON.stringify({schema_version:1,presets:draft},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='qb-preset-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('import').addEventListener('change',()=>{
    const file=$('import').files[0];if(!file)return;
    run(async()=>{
      if(file.size>65536)throw new Error('Backup is larger than 64 KiB.');
      const parsed=JSON.parse(await file.text());if(parsed.schema_version!==1)throw new Error('Unsupported backup format. Use a preset-editor JSON export.');
      const result=await api('/api/qb-presets/validate','POST',{presets:parsed.presets});draft=result.presets;markDirty();renderForm();status('Backup imported into the draft only. Save to publish it.');
    }).finally(()=>{$('import').value='';});
  });
  function open(){
    root.hidden=false;const url=new URL(location.href);url.searchParams.set('preset_admin','1');url.hash='qb-preset-admin';history.replaceState(null,'',url);
    $('title').focus({preventScroll:true});root.scrollIntoView({block:'start'});
  }
  document.getElementById('qb-open-preset-admin').addEventListener('click',open);
  $('close').addEventListener('click',()=>{
    root.hidden=true;const url=new URL(location.href);url.searchParams.delete('preset_admin');if(url.hash==='#qb-preset-admin')url.hash='';history.replaceState(null,'',url);
    const target=document.getElementById('qb-stories-title');target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});
  });
  window.addEventListener('hashchange',()=>{if(location.hash==='#qb-preset-admin')open();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  renderForm();$('storage').textContent=bundle.storage.message;
  status(bundle.error||'Changes stay in this draft until you save. Factory reset and import also require Save.',!!bundle.error);
  if(new URLSearchParams(location.search).get('preset_admin')==='1'||location.hash==='#qb-preset-admin')open();
})();
