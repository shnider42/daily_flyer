/* Specialist presentation against real, private Flask fixture states. */
'use strict';
const assert=require('node:assert/strict');
const {make,fixture,click,delay,cleanup}=require('./ww2-weather-debrief-dom.cjs');
async function level(v,value){v.w.ww2Experience.set(value);await delay();}
async function main(){
 const v=await make(390),{w,e,$}=v;
 try{
  let posts=0;const request=w.fetch;w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return request(url,opts);};
  for(const setup of [
   {map:'current:midway_2',kind:'carrier',button:'carrierGroupOpen',dialog:'carrierAirGroupDialog',content:'carrierAirGroupContent',decision:'carrierDecision',rules:'carrierDeckRules',action:'data-launch-plane'},
   {map:'current:britain_2',kind:'airfield',button:'airfieldGroupOpen',dialog:'britainAirfieldDialog',content:'britainAirfieldContent',decision:'airfieldDecision',rules:'airfieldRunwayRules',action:'data-scramble-flight'}
  ]){
   await fixture(v,'us',setup.map);e(`chooseUnit(state.units.find(u=>u.side==='us'&&u.kind==='${setup.kind}'))`);
   await click(v,$(setup.button));assert.equal($(setup.dialog).open,true);
   const initial=e('JSON.stringify(state)'),selected=e('selected'),actions=()=>[...$(setup.content).querySelectorAll('button')].map(b=>[b.getAttribute(setup.action)||b.dataset.servicePlane||b.dataset.serviceFlight||b.dataset.repairStation||'',b.disabled]);
   const available=actions();$(setup.dialog).scrollTop=55;$('mapWrap').scrollLeft=73;$('mapWrap').scrollTop=46;
   for(const value of ['simple','moderate','expert']){
    await level(v,value);
    assert.equal($(setup.dialog).open,true);assert.equal(e('selected'),selected);
    assert.equal($(setup.dialog).scrollTop,55);assert.equal($('mapWrap').scrollLeft,73);assert.equal($('mapWrap').scrollTop,46);
    assert.match($(setup.decision).textContent,new RegExp('^'+value,'i'));
    assert.deepEqual(actions(),available);assert.equal($(setup.rules).open,value==='expert');
    assert.match($(setup.rules).textContent,/next own turn|next turn/);
    assert.match($(setup.content).textContent,/AP/);assert.match($(setup.content).textContent,/store/);
    assert.equal(e('JSON.stringify(state)'),initial);assert.equal(posts,0);
   }
   assert.ok($(setup.content).querySelector('['+setup.action+']'),'Launch remains available at every level');
   if(setup.kind==='airfield')assert.match($(setup.content).textContent,/Fuel \d+\/\d+/);
  }
  await fixture(v,'us','current:nightfall_beacon');e("chooseUnit(state.units.find(u=>u.side==='us'&&u.kind==='transport_aircraft'))");
  await click(v,$('nightDrop'));assert.match($('nightDrop').textContent,/Cancel/);
  const before=e('JSON.stringify(state)'),targetChoices=$('map').querySelectorAll('.night-choice').length;assert.ok(targetChoices>0);
  for(const value of ['simple','moderate','expert']){
   await level(v,value);
   assert.match($('hint').textContent,/lost|loses/);
   assert.equal($('hint').textContent.includes('Roll 1'),value==='expert');
   assert.match($('nightAimRules').textContent,/Roll 1 loses the squad/);
   assert.equal($('nightAimRules').hidden,value==='expert');
   assert.equal($('map').querySelectorAll('.night-choice').length,targetChoices);
   assert.equal(e('JSON.stringify(state)'),before);assert.equal(posts,0);
  }
  console.log('PASS: carrier and airfield tiers, costs/readiness/fuel and all actions retained; night targeting keeps risk and exact disclosure; open dialogs and targeting survive; no game orders or state changes.');
 }finally{await delay();w.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
