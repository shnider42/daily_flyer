/* Edition choice affects new battles only. A saved battle owns its own rules. */
'use strict';
let currentScenarios=[];
function operationCatalog(){return [...scenarios,...currentScenarios];}
function operationById(id){return operationCatalog().find(b=>b.id===id);}
function operationSource(board){return board?.source_id||board?.id;}
function battleEdition(value=state){return value?.edition==='current'?'Current':'Legacy';}
document.addEventListener('DOMContentLoaded',()=>{
 const note=document.createElement('p');note.id='battleEditionNote';note.className='edition-battle-note';$('rulesetBadge').after(note);
 const manuals=['campaignManual','fubarManual'].map(id=>$(id)).filter(Boolean).map(n=>[n,n.innerHTML]);
 document.addEventListener('ww2:render',()=>{
  const dsl=state?.ruleset==='dsl';note.hidden=!dsl;
  note.textContent=dsl?`${battleEdition()} DSL${state.edition==='current'?' · shared rules v'+state.edition_version:' · original scenario rules'}`:'';
  if(dsl)$('rulesetBadge').textContent=`DSL · ${battleEdition()}`;
  for(const [manual,original] of manuals){
   const html=state?.edition==='current'?original
    .replace('cannot finish on another unit or pass through another aircraft','cannot finish on another aircraft or pass through another aircraft; ground units have separate occupancy')
    .replace('At most one aircraft and one surface unit may share a hex; same-layer stacking is forbidden.','Up to two friendly ground units and one aircraft may share a land hex, with at most one vehicle or fixed gun. Ships and boats retain separate spaces.')
    .replace('Unload onto empty adjacent land','Unload onto legal adjacent land with remaining ground capacity'):original;
   if(manual.innerHTML!==html)manual.innerHTML=html;
  }
 });
 window.ww2Editions={source:operationSource,label:battleEdition,
  operationId(id,select='scenarioSelect'){const edition=$(select+'Edition')?.value||'legacy';return edition==='current'?'current:'+id:id;}};
});
