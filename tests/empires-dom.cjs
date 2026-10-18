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
   assert.equal(w.document.body.classList.contains('empires-mobile'),width===390);
   assert.equal($('empMobileScreen').hidden,width!==390);
   if(width===390){
    assert.equal($('empMapWrap').parentElement.id,'empMobileScreen');
    assert.equal($('empSidebar').parentElement.id,'empOrdersSheet');
    assert.equal($('empEnd').parentElement.id,'empOrderHead');
    assert.equal($('empRoster').parentElement.id,'empRosterSheet');
   }
   assert.equal(w.location.href,original);assert.ok($('empMap').querySelectorAll('polygon').length>=192);
   assert.ok($('empPanel').textContent.includes('Production project'));
   const scout=s.units.find(u=>u.side===s.side&&u.kind==='scout');
   $('empMap').querySelector(`[data-unit-id="${scout.id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   assert.equal(w.empiresUI.selection,scout.id);assert.match($('empPanel').textContent,/Scouts?|Fast reconnaissance/);
   if(width===390){
    assert.match($('empSelectedMeta').textContent,/HP · \d AP/);
    assert.equal($('empOrdersSheet').open,false,'Selecting a unit keeps the map available');
    $('empMapWrap').scrollLeft=108;$('empMapWrap').scrollTop=46;
    await click(v,$('empOrdersOpen'));assert.equal($('empOrdersSheet').open,true);
    assert.equal($('empOrdersOpen').getAttribute('aria-expanded'),'true');
    await click(v,w.document.querySelector('[data-emp-close="empOrdersSheet"]'));
    assert.equal($('empOrdersSheet').open,false);assert.equal($('empMapWrap').scrollLeft,108);assert.equal($('empMapWrap').scrollTop,46);
    assert.equal(w.empiresUI.selection,scout.id);assert.equal(w.empiresUI.state.revision,0);
   }
   const m=s.legal[scout.id].moves[0];
   if(width===390){
    const wrap=$('empMapWrap'),tile=$('empMap').querySelector(`polygon[aria-label^="${String.fromCharCode(65+m.pos[0])}${m.pos[1]+1}:"]`);
    wrap.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:100,clientY:100}));
    wrap.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:140,clientY:110}));
    wrap.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:140,clientY:110}));
    tile.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:1}));await delay();
    assert.equal(w.empiresUI.state.revision,0,'Dragging never issues a move');
    wrap.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:140,clientY:110}));
    wrap.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:140,clientY:110}));
   }
   $('empMap').querySelector(`polygon[aria-label^="${String.fromCharCode(65+m.pos[0])}${m.pos[1]+1}:"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   await delay();await delay();
   s=w.empiresUI.state;assert.equal(s.revision,1);assert.equal(s.units.find(u=>u.id===scout.id).pos.join(','),m.pos.join(','));
   w.document.querySelector('[data-emp-tab="research"]').click();
   const research=[...$('empPanel').querySelectorAll('button')].find(b=>b.textContent.startsWith('Writing'));await click(v,research);
   assert.equal(w.empiresUI.state.player.research,'writing');
   await click(v,$('empEnd'));assert.equal($('empConfirm').open,true);await click(v,$('empConfirmYes'));
   assert.equal(w.empiresUI.state.round,2);assert.equal(w.empiresUI.state.turn,s.side);
   if(width===390){
    await click(v,$('empNext'));assert.notEqual(w.empiresUI.selection,scout.id);
    await click(v,$('empPrevious'));assert.equal(w.empiresUI.selection,scout.id);
    const prior=w.empiresUI.state.revision;
    const fortify=[...$('empQuickOrders').querySelectorAll('button')].find(b=>b.textContent.startsWith('Fortify'));
    await click(v,fortify);assert.equal(w.empiresUI.state.revision,prior+1);
    assert.equal(w.empiresUI.state.units.find(u=>u.id===scout.id).fortified,true);
    assert.equal([...$('empQuickOrders').querySelectorAll('button')].find(b=>b.textContent==='Fortified').disabled,true);
    await click(v,$('empRosterOpen'));assert.equal($('empRosterSheet').open,true);
    const city=w.empiresUI.state.cities.find(c=>c.side===s.side);
    await click(v,[...$('empRoster').querySelectorAll('button')].find(b=>b.textContent.includes(city.name)));
    assert.equal($('empRosterSheet').open,false);assert.equal($('empOrdersSheet').open,true);assert.equal(w.empiresUI.selection,city.id);
    assert.ok($('empProject'));await click(v,w.document.querySelector('[data-emp-close="empOrdersSheet"]'));
    await click(v,$('empMenuOpen'));await click(v,$('empResearchOpen'));
    assert.equal($('empMenu').open,false);assert.equal($('empOrdersSheet').open,true);assert.equal($('empPanel').querySelectorAll('[data-emp-tech]').length,8);
    await click(v,w.document.querySelector('[data-emp-close="empOrdersSheet"]'));
    await click(v,$('empMenuOpen'));await click(v,$('empAppearance'));
    assert.equal(w.document.documentElement.dataset.theme,'light');
    assert.equal(w.document.querySelector('meta[name="theme-color"]').content,'#edf0f4');
    await click(v,$('empAppearance'));assert.equal(w.document.querySelector('meta[name="theme-color"]').content,'#131c2b');
    await click(v,w.document.querySelector('[data-emp-close="empMenu"]'));
    const revision=w.empiresUI.state.revision,map=$('empMapWrap');
    // Reparenting through orientation and desktop breakpoints keeps one map and one End turn.
    for(const [nextWidth,nextHeight] of [[320,568],[568,320],[844,390],[1440,900],[390,844]]){
     w.innerWidth=nextWidth;w.innerHeight=nextHeight;w.dispatchEvent(new w.Event('resize'));await delay();
     assert.equal($('empMapWrap'),map);assert.equal(w.empiresUI.selection,city.id);assert.equal(w.empiresUI.state.revision,revision);
     assert.equal($('empEnd').parentElement.id,nextWidth<1100?'empOrderHead':'empSidebar');
     assert.equal(w.document.querySelectorAll('#empEnd').length,1);assert.equal(w.document.querySelectorAll('#empMap').length,1);
     assert.equal($('empOrdersSheet').open,false);
    }
   }
   const code=s.code,revision=w.empiresUI.state.revision;
   await click(v,$('empBack'));assert.equal($('gameModeSwitch').hidden,false);
   const saved=[...$('empCampaigns').querySelectorAll('button')].find(b=>b.textContent.includes(code));assert.ok(saved);await click(v,saved);
   assert.equal(w.empiresUI.state.revision,revision);
   for(const theme of ['light','dark']){if(w.document.documentElement.dataset.theme!==theme)$('appearanceToggle').click();assert.equal(w.document.documentElement.dataset.theme,theme);}
   await click(v,$('empBack'));await click(v,$('modeDSL'));
   assert.equal($('empires').hidden,true);assert.equal(w.location.href,original);
   assert.equal(w.document.body.classList.contains('empires-mobile'),false);assert.equal($('empMobileScreen').hidden,true);
   assert.equal(w.document.querySelector('meta[name="theme-color"]').content,'#171e1b');
   await fixture(v,'us','current:village_2');assert.equal($('game').hidden,false);assert.equal($('gameModeSwitch').hidden,true);
   const prior=v.e('state.revision');
   v.e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='squad'))");
   assert.ok($('map').querySelector('.unit.selected'));assert.equal(v.e('state.revision'),prior);
   await click(v,$('homeBattles'));assert.equal($('gameModeSwitch').hidden,false);
   await click(v,$('modeEmpires'));
   $('empMode').value='human';$('empMode').dispatchEvent(new w.Event('change'));await click(v,$('empCreate'));
   assert.equal($('empInvitation').hidden,false);assert.equal($('empEnd').disabled,true);
   if(width===390){
    assert.equal($('empMenuOpen').textContent,'Invite');await click(v,$('empMenuOpen'));
    assert.equal($('empInvitation').parentElement.id,'empMenu');assert.equal($('empMenu').open,true);
    await click(v,w.document.querySelector('[data-emp-close="empMenu"]'));
    assert.ok([...$('empQuickOrders').querySelectorAll('button')].find(b=>b.textContent==='Production'));
   }
   const human=w.empiresUI.state;const joined=await request(`/api/empires/games/${human.code}/join`,{method:'POST',body:'{}'});assert.equal(joined.status,200);
   await w.empiresUI.refresh();assert.equal($('empInvitation').hidden,true);assert.equal($('empEnd').disabled,false);
   assert.equal(w.location.href,original);
   assert.ok(JSON.parse(w.localStorage.getItem('ww2-sessions')).length);
   assert.equal(JSON.parse(w.localStorage.getItem('empires-sessions')).length,2);
  }finally{await delay();w.close();}
 }
 console.log('PASS: same-URL games, moves/AP/research/AI turn, saves/invites, mobile map/order dock, sheets, quick orders, roster/cities, pan guard, resize restoration, night/day colors and DSL isolation. DOM/API checks only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
