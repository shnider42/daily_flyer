/* Whole DSL document and real Flask test-client calls; no browser-layout claims. */
const {make,fixture,click,delay,request,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict');

async function main(){
 for(const width of [1440,390]){
  const v=await make(width),{w,$}=v;
  try{
   const original=w.location.href;
   await click(v,$('modeEmpires'));
   assert.equal(w.location.href,original);assert.equal($('empires').hidden,false);
   assert.equal($('modeEmpires').getAttribute('aria-pressed'),'true');
   $('empFaction').value=width===390?'highland':'river';
   await click(v,$('empCreate'));
   let s=w.empiresUI.state;assert.ok(s);assert.equal(s.side,width===390?'highland':'river');
   assert.equal($('empHome').hidden,true);assert.equal($('empPlay').hidden,false);assert.equal($('gameModeSwitch').hidden,true);
   assert.equal(w.location.href,original);assert.ok($('empMap').querySelectorAll('polygon').length>=192);
   assert.ok($('empPanel').textContent.includes('Production project'));
   const scout=s.units.find(u=>u.side===s.side&&u.kind==='scout');
   $('empMap').querySelector(`[data-unit-id="${scout.id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   assert.equal(w.empiresUI.selection,scout.id);assert.match($('empPanel').textContent,/Scouts?|Fast reconnaissance/);
   const m=s.legal[scout.id].moves[0];
   $('empMap').querySelector(`polygon[aria-label^="${String.fromCharCode(65+m.pos[0])}${m.pos[1]+1}:"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   await delay();await delay();
   s=w.empiresUI.state;assert.equal(s.revision,1);assert.equal(s.units.find(u=>u.id===scout.id).pos.join(','),m.pos.join(','));
   w.document.querySelector('[data-emp-tab="research"]').click();
   const research=[...$('empPanel').querySelectorAll('button')].find(b=>b.textContent.startsWith('Writing'));await click(v,research);
   assert.equal(w.empiresUI.state.player.research,'writing');
   await click(v,$('empEnd'));assert.equal($('empConfirm').open,true);await click(v,$('empConfirmYes'));
   assert.equal(w.empiresUI.state.round,2);assert.equal(w.empiresUI.state.turn,s.side);
   const code=s.code,revision=w.empiresUI.state.revision;
   await click(v,$('empBack'));assert.equal($('gameModeSwitch').hidden,false);
   const saved=[...$('empCampaigns').querySelectorAll('button')].find(b=>b.textContent.includes(code));assert.ok(saved);await click(v,saved);
   assert.equal(w.empiresUI.state.revision,revision);
   for(const theme of ['light','dark']){if(w.document.documentElement.dataset.theme!==theme)$('appearanceToggle').click();assert.equal(w.document.documentElement.dataset.theme,theme);}
   await click(v,$('empBack'));await click(v,$('modeDSL'));
   assert.equal($('empires').hidden,true);assert.equal(w.location.href,original);
   await fixture(v,'us','current:village_2');assert.equal($('game').hidden,false);assert.equal($('gameModeSwitch').hidden,true);
   const prior=v.e('state.revision');
   v.e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='squad'))");
   assert.ok($('map').querySelector('.unit.selected'));assert.equal(v.e('state.revision'),prior);
   await click(v,$('homeBattles'));assert.equal($('gameModeSwitch').hidden,false);
   await click(v,$('modeEmpires'));
   $('empMode').value='human';$('empMode').dispatchEvent(new w.Event('change'));await click(v,$('empCreate'));
   assert.equal($('empInvitation').hidden,false);assert.equal($('empEnd').disabled,true);
   const human=w.empiresUI.state;const joined=await request(`/api/empires/games/${human.code}/join`,{method:'POST',body:'{}'});assert.equal(joined.status,200);
   await w.empiresUI.refresh();assert.equal($('empInvitation').hidden,true);assert.equal($('empEnd').disabled,false);
   assert.equal(w.location.href,original);
   assert.ok(JSON.parse(w.localStorage.getItem('ww2-sessions')).length);
   assert.equal(JSON.parse(w.localStorage.getItem('empires-sessions')).length,2);
  }finally{await delay();w.close();}
 }
 console.log('PASS: same-URL toggle, both factions, real moves/AP/research/AI turn, saved resume, human invitation, themes and return to existing DSL at desktop/phone viewport settings. DOM/API checks only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
