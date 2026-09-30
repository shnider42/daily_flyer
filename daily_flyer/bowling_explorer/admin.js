(() => {
  'use strict';
  const A=window.BowlingApp,$=id=>document.getElementById('bw-admin-'+id),panel=document.getElementById('bw-admin'),
    clone=A.clone,initial=A.config.presets;
  let draft=clone(initial.presets),revision=initial.revision,slot=0,busy=false,dirty=false;
  const status=s=>{$('status').textContent=s;};
  const backup=YearTwoPresetBackup.create('bowling',initial,$('status'),presets=>operation(async()=>{
    draft=clone((await api('POST','/validate',{presets})).presets);mark();render();status('Browser backup restored into this draft. Review it, then Save to publish.');
  }));
  async function api(method,path='',payload){
    const response=await fetch('/api/bowling-presets'+path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Preset request failed.');return result;
  }
  async function operation(fn){
    if(busy)return;busy=true;panel.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);
    try{await fn();}catch(e){status(e.name==='TimeoutError'?'Request timed out. A save may have reached the server; export your draft, then reload shared presets to check.':e.message);}
    finally{busy=false;panel.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false);$('count').disabled=draft[slot].settings.selection==='fixed';}
  }
  function mark(){dirty=true;backup.draft(draft);status('Unsaved draft. Preview it, or Save all five presets to publish.');}
  function render(){
    $('slot').innerHTML=draft.map((p,i)=>`<option value="${i}">${i+1} · ${A.esc(p.label)}</option>`).join('');$('slot').value=String(slot);
    const p=draft[slot];for(const key of ['label','title','note'])$(key).value=p[key];
    $('selection').value=p.settings.selection;$('count').value=p.settings.count;$('count').max=A.config.players.length;$('count').disabled=p.settings.selection==='fixed';
    $('settings').textContent='Captured settings: '+A.summary(p.settings);
  }
  function open(){panel.hidden=false;render();status(initial.error||initial.storage);panel.scrollIntoView({block:'start'});}
  document.getElementById('bw-open-editor').onclick=open;
  document.getElementById('bw-close-editor').onclick=()=>{panel.hidden=true;document.getElementById('bw-open-editor').focus();};
  $('slot').onchange=()=>{slot=Number($('slot').value);render();};
  for(const key of ['label','title','note'])$(key).oninput=()=>{draft[slot][key]=$(key).value;mark();};
  $('selection').onchange=()=>{draft[slot].settings.selection=$('selection').value;mark();render();};
  $('count').oninput=()=>{draft[slot].settings.count=Number($('count').value);mark();};
  $('capture').onclick=()=>{draft[slot].settings=A.getState();draft[slot].settings.selection='fixed';mark();render();};
  $('reset').onclick=()=>{draft[slot]=clone(A.config.factory[slot]);mark();render();};
  $('preview').onclick=()=>operation(async()=>{
    const valid=await api('POST','/validate',{presets:draft});draft=clone(valid.presets);const p=draft[slot];A.apply(p.settings,'DRAFT PREVIEW · '+p.title,p.note);document.getElementById('bw-story').scrollIntoView({block:'start'});status('Preview only. Shared presets have not changed.');
  });
  $('save').onclick=()=>operation(async()=>{
    const result=await api('PUT','',{presets:draft,revision});draft=clone(result.presets);revision=result.revision;dirty=false;backup.saved(result);A.updatePresets(result.presets);render();status('Saved all five bowling presets. '+result.storage);
  });
  $('reload').onclick=()=>operation(async()=>{
    if(dirty){backup.draft(draft);}const result=await api('GET');draft=clone(result.presets);revision=result.revision;dirty=false;backup.observe(result);A.updatePresets(result.presets);render();status('Loaded shared presets. Your previous unsaved draft remains in the browser recovery copy. '+result.storage);
  });
  $('export').onclick=()=>A.download('bowling-presets.json',JSON.stringify({sport:'bowling',presets:draft},null,2),'application/json');
  $('import').onchange=()=>operation(async()=>{
    const file=$('import').files[0];if(!file)return;if(file.size>65536)throw Error('Backup exceeds 64 KiB.');
    const parsed=JSON.parse(await file.text());if(parsed.sport&&parsed.sport!=='bowling')throw Error('Choose a bowling backup.');
    draft=clone((await api('POST','/validate',{presets:Array.isArray(parsed)?parsed:parsed.presets})).presets);mark();render();status('Imported into this draft. Preview or Save to publish.');$('import').value='';
  });
  render();if(new URLSearchParams(location.search).get('preset_admin')==='1')open();
})();
