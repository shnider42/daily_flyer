/* Discovery only: filters never change the selected operation or a live game.
   The same controls serve Home, Solo and Rematch. Catalog is authoritative. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const categories=[['all','All maps'],['prebattle','Pre-battle'],['infantry','Infantry'],['combined','Combined arms'],['armor','Armor'],['evacuation','Evacuation'],['naval','Naval'],['air','Aircraft'],['airborne','Airborne'],['amphibious','Landings'],['attack-defend','Attack / defend'],['control','Area control'],['playtest','Playtest']];
 const sorting=[['learning','Learning order'],['newest','Newest added'],['smallest','Smallest first'],['name','Name A–Z']];
 const browsers=new Map(),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 function choices(id,label,options){const wrap=el('label',null,label),select=el('select');select.id=id;for(const [value,text] of options)select.add(new Option(text,value));wrap.htmlFor=id;wrap.append(select);return [wrap,select];}
 for(const id of ['scenarioSelect','soloScenario','rematchScenario']){
  const select=$(id),editionBox=el('div','operation-edition'),filters=el('div','operation-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Browse operations');
  const [editionLabel,edition]=choices(id+'Edition','DSL edition',[['legacy','Legacy · original maps'],['current','Current · shared rules']]);
  const editionNote=el('p');editionNote.id=id+'EditionNote';edition.setAttribute('aria-describedby',editionNote.id);editionBox.append(editionLabel,editionNote);select.before(editionBox);
  const [categoryLabel,category]=choices(id+'Category','Category',categories),[sortLabel,sort]=choices(id+'Sort','Sort by',sorting);
  filters.append(categoryLabel,sortLabel);select.before(filters);
  const status=el('p','operation-filter-status');status.id=id+'Results';status.setAttribute('role','status');select.setAttribute('aria-describedby',status.id);select.after(status);
  const info=el('p','operation-selection-info');status.after(info);
  const browser={select,edition,editionNote,category,sort,status,info};browsers.set(id,browser);
  edition.onchange=()=>{
   const source=operationSource(operationById(select.value))||'village',chosen=edition.value==='current'?'current:'+source:source;
   render(browser,chosen);select.dispatchEvent(new Event('change'));
  };
  category.onchange=sort.onchange=()=>render(browser);
  select.addEventListener('change',()=>{render(browser);if(id==='scenarioSelect')presentHome();});
  const rules=$(id==='scenarioSelect'?'rulesetSelect':id==='soloScenario'?'soloRuleset':'rematchRuleset');
  rules.addEventListener('change',()=>{if(rules.value!=='dsl'&&edition.value==='current'){edition.value='legacy';edition.onchange();}});
 }
 function render(browser,requested){
  if(!scenarios.length)return; // Existing options remain usable if the catalog fails.
  const {select,edition,editionNote,category,sort,status,info}=browser,chosen=requested||select.value||scenarios[0].id;
  const current=operationById(chosen);if(current)edition.value=current.edition==='current'?'current':'legacy';
  editionNote.textContent=edition.value==='current'?'Current DSL: shared ground rules, two friendly ground units per hex and separate air occupancy. Original armies, terrain and missions; fleet and air exceptions apply. Start a new battle to use these rules.':'Legacy: all original maps and scenario rules remain available. Existing battles and co-op assignments keep their saved rules.';
  const catalog=edition.value==='current'?currentScenarios:scenarios;
  const level=ww2Experience.level,rank=b=>b.browse?.learning_order??1000;
  const matches=catalog.filter(b=>category.value==='all'||b.browse?.tags.includes(category.value));
  matches.sort((a,b)=>({learning:()=>rank(a)-rank(b),newest:()=>(b.browse?.release_order??0)-(a.browse?.release_order??0),smallest:()=>a.width*a.height-b.width*b.height,name:()=>a.name.localeCompare(b.name)})[sort.value]()||a.name.localeCompare(b.name));
  const option=b=>new Option(b.name+(level==='simple'?'':` · ${b.width}×${b.height}`)+(level==='expert'?` · ${b.rounds} rounds${b.dsl_only?' · DSL only':''}`:''),b.id);
  const outside=current&&!matches.some(b=>b.id===chosen);
  const nodes=matches.map(option);
  if(outside){const group=el('optgroup');group.label='Current choice · outside filter';group.append(option(current));nodes.unshift(group);}
  select.replaceChildren(...nodes);select.value=chosen;
  status.textContent=`${edition.value==='current'?'Current':'Legacy'} · ${matches.length} operation${matches.length===1?'':'s'}${outside?' match · current choice kept':''}${sort.value==='learning'?' · suggested learning order':''}`;
  info.textContent=current?`${current.browse?.focus||''}${level==='simple'?'':` ${current.browse?.labels?.join(' · ')||''}`}`:'';
  // Existing ruleset handlers remain in charge; this also covers future catalog maps.
  if(current?.dsl_only)$(select.id==='scenarioSelect'?'rulesetSelect':select.id==='soloScenario'?'soloRuleset':'rematchRuleset').value='dsl';
 }
 function presentHome(){
  const board=operationById($('scenarioSelect').value);if(!board)return;
  // The short learning focus is already next to the selector; do not repeat it.
  $('operationSummary').hidden=ww2Experience.level==='simple';
 }
 function refresh(){for(const browser of browsers.values())render(browser);presentHome();}
 window.ww2OperationBrowser={prepare(id,chosen){const b=browsers.get(id);if(b)render(b,chosen);}};
 document.addEventListener('ww2:preview',refresh);
 document.addEventListener('ww2:experience',refresh);
 refresh();
});
