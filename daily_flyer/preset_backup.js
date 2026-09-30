/* Recovery is local to this browser. Never silently publish an old backup. */
(() => {
  'use strict';
  window.YearTwoPresetBackup={create(sport,bundle,mount,restore){
    const key='year-two-preset-backup-v1-'+sport,box=document.createElement('div');
    box.className='yt-preset-backup';box.style.cssText='padding:14px;border:1px solid #9eae99;margin:16px 0;font-size:12px';
    const text=document.createElement('p'),savedButton=document.createElement('button'),draftButton=document.createElement('button');
    for(const button of [savedButton,draftButton]){button.type='button';button.style.margin='4px 8px 4px 0';}
    savedButton.textContent='Restore last saved backup';draftButton.textContent='Restore browser draft';
    savedButton.dataset.backup='saved';draftButton.dataset.backup='draft';box.append(text,savedButton,draftButton);mount.before(box);
    let available=true;
    function read(){try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch(_){return {};}}
    function write(value){try{localStorage.setItem(key,JSON.stringify(value));available=true;}catch(_){available=false;}render();}
    function render(){const value=read();savedButton.hidden=!value.saved?.presets;draftButton.hidden=!value.draft?.presets;
      text.textContent=!available?'Browser backup unavailable. Export a JSON backup to keep a recovery copy.':value.saved?.presets?'Browser recovery copy: '+new Date(value.saved.at).toLocaleString()+'. Restore loads a draft; Save publishes it. This copy stays in this browser, even if the server resets.':value.draft?.presets?'An unsaved draft is backed up in this browser. Restore it to continue editing.':'Your saved edits and drafts will be backed up in this browser. Export JSON for a portable copy.';
    }
    savedButton.onclick=()=>{const value=read().saved;if(value?.presets)restore(value.presets);};
    draftButton.onclick=()=>{const value=read().draft;if(value?.presets)restore(value.presets);};
    const api={
      observe(next){if(next.source!=='saved'){render();return;}const value=read();if(value.saved?.revision!==next.revision){value.saved={presets:next.presets,revision:next.revision,at:next.updated_at||new Date().toISOString()};write(value);}else render();},
      draft(presets){const value=read();value.draft={presets,at:new Date().toISOString()};write(value);},
      saved(next){const value=read();if(JSON.stringify(value.draft?.presets)===JSON.stringify(next.presets))delete value.draft;value.saved={presets:next.presets,revision:next.revision,at:next.updated_at||new Date().toISOString()};write(value);}
    };
    api.observe(bundle);return api;
  }};
})();
