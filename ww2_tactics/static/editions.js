/* Edition choice affects new battles only. A saved battle owns its own rules. */
'use strict';
let currentScenarios=[];
function operationCatalog(){return [...scenarios,...currentScenarios];}
function operationById(id){return operationCatalog().find(b=>b.id===id);}
function operationSource(board){return board?.source_id||board?.id;}
function battleEdition(value=state){return value?.edition==='current'?'Current':'Legacy';}
document.addEventListener('DOMContentLoaded',()=>{
 const note=document.createElement('p');note.id='battleEditionNote';note.className='edition-battle-note';$('rulesetBadge').after(note);
 const airManual=document.createElement('section');airManual.id='currentAirSupportManual';airManual.hidden=true;
 const airTitle=document.createElement('h3');airTitle.textContent='Current · finite aircraft service';
 const airRules=document.createElement('p');airManual.append(airTitle,airRules);$('rules').append(airManual);
 const manuals=['campaignManual','fubarManual'].map(id=>$(id)).filter(Boolean).map(n=>[n,n.innerHTML]);
 document.addEventListener('ww2:render',()=>{
  const dsl=state?.ruleset==='dsl';note.hidden=!dsl;
  note.textContent=dsl?`${battleEdition()} DSL${state.edition==='current'?' · shared rules v'+state.edition_version:' · original scenario rules'}`:'';
  const airSupport=state?.air_support_version===1;
  airManual.hidden=!airSupport;
  if(airSupport){
   note.textContent+=' · finite air support';
   const service='Each airfield has six finite service uses for the battle. Within one hex of your own platoon’s surviving field or a friendly HQ field, spend 2 aircraft AP to restore 1 strength and reload bombs, once per aircraft per turn. Empty, destroyed or another platoon’s fields cannot service you. Stores do not regenerate.';
   const aa=' Light ship AA costs 2 AP: fire at an aircraft or prepare one interception along a flight path, range 1, damage 1. Moving or firing cancels readiness. It never reacts to surface movement. Carrier search and abstract strike sorties are unchanged.';
   airRules.textContent=service+(state.scenario.air_support.ship_aa_range?aa:'');
   const unit=state.units.find(u=>u.id===selected);
   if(unit){
    if(unit.kind==='airfield'){
     const stock=unit.air_stores===undefined?'Enemy stores are private':`${unit.air_stores}/${unit.max_air_stores} finite service uses remaining`;
     $('roleBrief').textContent=`AIRFIELD · ${stock} · serves ${unit.platoon==='HQ'?'friendly army aircraft':'its own platoon’s aircraft'} within 1 hex.`;
     $('unitMechanics').append(uiNode('p','mechanics-caption',stock));
    }else if(['fighter','bomber'].includes(unit.kind)){
     $('unitMechanics').append(uiNode('p','mechanics-caption','Service: 2 aircraft AP + 1 finite field store · own platoon or friendly HQ field within 1 hex · +1 strength and reload bombs · once per turn.'));
    }else if(unit.ship_aa_range){
     $('roleBrief').textContent+=' Light AA: range 1, damage 1; direct fire or one flight-path interception for 2 AP.';
     $('unitMechanics').append(uiNode('p','mechanics-caption','Shipboard AA · aircraft only · range 1 · 1 damage · 2 AP · moving or firing cancels interception.'));
    }
   }
  }
  if(dsl&&!state?.scenario?.fleet_battle_version&&!state?.scenario?.night_ops_version)$('rulesetBadge').textContent=`DSL · ${battleEdition()}`;
  for(const [manual,original] of manuals){
   if((state?.scenario?.fleet_battle_version||state?.scenario?.night_ops_version)&&manual.id==='fubarManual')continue;
   const html=state?.edition==='current'?original
    .replace('cannot finish on another unit or pass through another aircraft','cannot finish on another aircraft or pass through another aircraft; ground units have separate occupancy')
    .replace('At most one aircraft and one surface unit may share a hex; same-layer stacking is forbidden.','Up to two friendly ground units and one aircraft may share a land hex, with at most one vehicle or fixed gun. Ships and boats retain separate spaces.')
    .replace('Unload onto empty adjacent land','Unload onto legal adjacent land with remaining ground capacity'):original;
   if(manual.innerHTML!==html)manual.innerHTML=html;
  }
  if(state?.carrier_decks_version===1){
   note.textContent+=' · finite carrier decks';
   const manual=$('fubarManual'),p=manual?.querySelectorAll('p');
   if(p?.length>=3){p[1].textContent=state.scenario.brief;p[2].textContent=state.scenario.reinforcement_brief;}
  }
 });
 window.ww2Editions={source:operationSource,label:battleEdition,
  operationId(id,select='scenarioSelect'){const edition=$(select+'Edition')?.value||'legacy';return edition==='current'?'current:'+id:id;}};
});
