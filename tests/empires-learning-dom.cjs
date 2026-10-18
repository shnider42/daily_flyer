/* Beginner teaching and safe inspection against real Flask orders.
   DOM/API integration only; this is not a rendered iPhone Safari test. */
const {make,click,delay,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict');

async function main(){
 const v=await make(390),{w,$}=v;
 let reloadStorage,seat;
 try{
  w.ww2Experience.set('simple');await delay();await click(v,$('modeEmpires'));
  assert.equal($('empHomeLearning').hidden,false);
  $('empFaction').value='river';await click(v,$('empCreate'));await delay();
  const state=()=>w.empiresUI.state,done=()=>Array.from(w.empiresLearning.done(state()));
  const primary=()=>$('empLesson').querySelector('.emp-primary');
  const close=id=>click(v,w.document.querySelector(`[data-emp-close="${id}"]`));
  const tap=async pos=>{
   const tile=$('empMap').querySelector(`polygon[aria-label^="${String.fromCharCode(65+pos[0])}${pos[1]+1}:"]`);
   assert.ok(tile);tile.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();await delay();
  };
  assert.equal($('empLearnSheet').open,true,'Simple automatically introduces the guide');
  assert.match($('empLesson').textContent,/You lead a whole civilization/);
  assert.match($('empLesson').textContent,/40 rounds/);
  assert.equal($('empLearnOpen').hidden,false);assert.equal($('empMapTools').parentElement.id,'empMobileScreen');
  assert.ok($('empMap').querySelector('.emp-map-yield'));
  let posts=0;const realFetch=w.fetch;
  w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return realFetch(url,opts);};
  await click(v,primary());assert.deepEqual(done(),['goal']);assert.equal($('empInspectToggle').getAttribute('aria-pressed'),'true');
  const city=state().cities.find(c=>c.side===state().side),worked=city.yields.worked[0];
  await tap(worked);assert.equal($('empHexSheet').open,true);assert.match($('empHexContent').textContent,/Worked by .* now/);
  assert.equal($('empHexContent').querySelectorAll('.emp-hex-yields strong').length,3);
  assert.match($('empHexContent').textContent,/A unit standing here does not collect/);
  assert.deepEqual(done(),['goal','land']);assert.equal(posts,0);
  await close('empHexSheet');await click(v,$('empLearnOpen'));assert.match($('empLesson').textContent,/Explore with your scout/);
  await click(v,primary());const scout=state().units.find(u=>u.id===w.empiresUI.selection);
  assert.equal(scout.kind,'scout');assert.equal($('empInspectToggle').getAttribute('aria-pressed'),'false');
  const move=state().legal[scout.id].moves[0],revision=state().revision;
  await click(v,$('empInspectToggle'));await tap(move.pos);
  assert.equal(state().revision,revision);assert.equal(posts,0);assert.equal(state().units.find(u=>u.id===scout.id).ap,scout.ap);
  assert.ok(!$('empLearnSheet').open);
  const moveButton=[...$('empHexContent').querySelectorAll('button')].find(b=>b.textContent.startsWith('Move Scout here'));
  assert.ok(moveButton,'Inspection offers an explicitly labelled move');
  // Reject the first move. Inspection and failed orders must not claim practice.
  w.fetch=(url,opts)=>opts?.method==='POST'?Promise.resolve({ok:false,status:503,json:async()=>({error:'Test unavailable'})}):realFetch(url,opts);
  await click(v,moveButton);assert.equal(state().revision,revision);assert.ok(!done().includes('explore'));
  // Pending orders also cannot advance a lesson before the server confirms them.
  let release;
  w.fetch=(url,opts)=>opts?.method==='POST'?new Promise(resolve=>{posts++;release=async()=>resolve(await realFetch(url,opts));}):realFetch(url,opts);
  const pending=w.empiresUI.order({kind:'move',unit:scout.id,pos:move.pos});
  assert.ok(!done().includes('explore'));assert.equal(state().revision,revision);
  await release();await pending;w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return realFetch(url,opts);};
  assert.ok(done().includes('explore'));assert.equal(state().units.find(u=>u.id===scout.id).ap,scout.ap-move.cost);
  await click(v,$('empLearnOpen'));assert.match($('empLesson').textContent,/Scout moved:/);
  assert.match(primary().textContent,/Keep this project/);
  const beforeCity=posts;await click(v,primary());assert.equal(posts,beforeCity);assert.ok(done().includes('city'));
  assert.equal($('empOrdersSheet').open,true);assert.equal(w.empiresUI.selection,city.id);
  await close('empOrdersSheet');await click(v,$('empLearnOpen'));assert.match($('empLesson').textContent,/Builders make land/);
  await click(v,primary());const builder=state().units.find(u=>u.id===w.empiresUI.selection);
  assert.equal(builder.kind,'builder');assert.ok(state().legal[builder.id].actions.includes('farm'));
  const key=builder.pos.join(','),foodBefore=state().land_yields[key].food;
  await click(v,$('empPanel').querySelector('[data-emp-action="farm"]'));
  assert.equal(state().land_yields[key].food,foodBefore+2);assert.equal(state().units.find(u=>u.id===builder.id).ap,builder.ap-2);
  assert.ok(done().includes('improve'));await close('empOrdersSheet');await click(v,$('empLearnOpen'));
  assert.match($('empLesson').textContent,/Farm completed/);assert.match(primary().textContent,/Keep this research/);
  const beforeResearch=posts;await click(v,primary());assert.equal(posts,beforeResearch);assert.ok(done().includes('research'));
  assert.match($('empPanel').textContent,/Current research: Agriculture/);await close('empOrdersSheet');await click(v,$('empLearnOpen'));
  const knowledge=state().player.knowledge,income=state().economy.knowledge;
  assert.equal(primary().textContent,'End turn');await click(v,primary());assert.equal($('empConfirm').open,true);await click(v,$('empConfirmYes'));
  assert.equal(state().player.knowledge,knowledge+income);assert.equal(done().length,7);
  assert.equal(w.empiresLearning.ignored,false);assert.equal($('empLearnOpen').hidden,false,'Completing lessons does not silently opt out');
  await click(v,$('empLearnOpen'));assert.match($('empLesson').textContent,/Turn resolved/);assert.equal($('empLearnLabel').textContent,'Next decision');await close('empLearnSheet');
  // Map explanations distinguish unknown, remembered, worked and city-center data.
  await click(v,$('empInspectToggle'));
  let unknown;for(let y=0;y<state().height;y++)for(let x=0;x<state().width;x++)if(!state().map[y][x])unknown=[x,y];
  await tap(unknown);assert.match($('empHexContent').textContent,/terrain, resources and occupants are unknown/);
  assert.equal($('empHexContent').querySelector('.emp-hex-yields'),null);assert.doesNotMatch($('empHexContent').textContent,/Units here|Grain adds/);await close('empHexSheet');
  const actualVisible=state().visible;state().visible=actualVisible.filter(k=>k!==worked.join(',')); // display-only fog fixture
  await tap(worked);assert.match($('empHexContent').textContent,/Last-seen land/);assert.match($('empHexContent').textContent,/Potential from remembered land/);
  assert.doesNotMatch($('empHexContent').textContent,/Worked by .* now/);state().visible=actualVisible;await close('empHexSheet');
  await tap(city.pos);assert.match($('empHexContent').textContent,/Food surplus/);assert.match($('empHexContent').textContent,/not another citizen-worked tile/);await close('empHexSheet');
  await tap(builder.pos);assert.match($('empHexContent').textContent,/Farm: \+2 food/);await close('empHexSheet');
  // Lens and Experience changes are presentation, without orders or camera reset.
  const map=$('empMapWrap'),beforePrefs=posts;map.scrollLeft=108;map.scrollTop=46;
  await click(v,$('empMapView'));assert.equal($('empMap').querySelector('.emp-map-yield'),null);assert.equal(w.localStorage.getItem('empires-map-lens'),'land');
  assert.equal(map.scrollLeft,108);assert.equal(map.scrollTop,46);
  for(const level of ['expert','moderate','simple']){w.ww2Experience.set(level);await delay();assert.equal($('empLearnOpen').hidden,level!=='simple');}
  assert.equal(posts,beforePrefs);
  for(const [width,height]of [[320,568],[844,390],[1440,900],[390,844]]){
   w.innerWidth=width;w.innerHeight=height;w.dispatchEvent(new w.Event('resize'));await delay();
   assert.equal(w.document.querySelectorAll('#empMapTools').length,1);assert.equal($('empMapTools').parentElement.id==='empMobileScreen',width<1100);
  }
  await click(v,$('empLearnOpen'));await click(v,$('empIgnoreTutorial'));assert.equal(w.ww2Experience.level,'simple');
  assert.equal($('empLearnOpen').hidden,true);assert.equal($('empHomeLearning').hidden,true);assert.equal(w.empiresLearning.ignored,true);
  for(const level of ['expert','simple']){w.ww2Experience.set(level);await delay();assert.equal($('empLearnOpen').hidden,true);assert.equal($('empLearnSheet').open,false);}
  seat=JSON.parse(w.localStorage.getItem('empires-sessions'))[0];reloadStorage=Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
 }finally{await delay();w.close();}
 const reloaded=await make(390,reloadStorage),{w:rw,$:r$}=reloaded;
 try{
  await rw.empiresUI.open(seat);await delay();assert.equal(rw.ww2Experience.level,'simple');assert.equal(r$('empLearnOpen').hidden,true);assert.equal(r$('empLearnSheet').open,false);
  assert.equal(r$('empMap').querySelector('.emp-map-yield'),null);assert.equal(rw.empiresLearning.done(rw.empiresUI.state).length,7);
  await click(reloaded,r$('empMenuOpen'));await click(reloaded,r$('empLearningMenu'));
  assert.equal(rw.empiresLearning.ignored,false);assert.equal(r$('empLearnOpen').hidden,false);assert.equal(r$('empLearnSheet').open,true);
  await click(reloaded,r$('empRestartTutorial'));assert.equal(rw.empiresLearning.done(rw.empiresUI.state).length,0);
  assert.match(r$('empLesson').textContent,/You lead a whole civilization/);
  await click(reloaded,rw.document.querySelector('[data-emp-close="empLearnSheet"]'));await click(reloaded,r$('empBack'));await click(reloaded,r$('empCreate'));
  assert.notEqual(rw.empiresUI.state.code,seat.code);assert.equal(rw.empiresLearning.done(rw.empiresUI.state).length,0);assert.equal(r$('empLearnOpen').hidden,false);
 }finally{await delay();rw.close();}
 console.log('PASS: Simple default welcome, real first-turn learning loop, inspection without orders, confirmed-only progress, fog-safe explanations, preference/camera separation, phone reparenting, persistent explicit opt-out, resume and per-campaign lessons. DOM/API only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
