/* Real initial campaign, with presentation changes only. No browser layout claims. */
'use strict';
const {make,click,delay,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict');
async function level(v,value){v.w.ww2Experience.set(value);await delay();}
async function main(){
 const v=await make(390,{'empires-learning-v1':JSON.stringify({ignored:true,welcomed:true,progress:{}})}),{w,$}=v;
 try{
  let posts=0;const request=w.fetch;w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return request(url,opts);};
  await click(v,$('modeEmpires'));
  assert.equal($('empHomeLearning').hidden,true,'Simple respects the explicit tutorial opt-out');
  await level(v,'moderate');
  assert.equal($('empHomeLearning').hidden,false);
  assert.match($('empHomeLearning').textContent,/Moderate.*Plan your civilization/);
  await click(v,$('empHomeLearn'));assert.equal($('empManual').open,true);
  assert.match($('empGuideTitle').textContent,/Planning/);
  await click(v,$('empManualClose'));assert.equal(posts,0);
  assert.equal(w.empiresLearning.ignored,true,'Opening planning help does not resume the tutorial');
  await click(v,$('empCreate'));assert.equal(posts,1);
  const before=JSON.stringify(w.empiresUI.state),city=w.empiresUI.state.cities.find(c=>c.side===w.empiresUI.state.side);
  const choices=[...$('empProject').options].map(o=>o.value),copy=[];
  for(const value of ['simple','moderate','expert']){
   await level(v,value);copy.push($('empPanel').textContent);
   assert.match($('empPanel').querySelector('.emp-experience-context').textContent,new RegExp(value,'i'));
   assert.deepEqual([...$('empProject').options].map(o=>o.value),choices);
   if(value==='simple')assert.match($('empDecision').textContent,/already has a job.*End turn/);
   if(value==='moderate')assert.match($('empDecision').textContent,/Rush costs \d+ gold.*immediately/);
   if(value==='expert'){assert.equal($('empDecision'),null);assert.equal($('empPanel').querySelector('[data-rule="city"]').open,true);}
   assert.equal(w.empiresUI.selection,city.id);assert.equal(JSON.stringify(w.empiresUI.state),before);assert.equal(posts,1);
  }
  assert.equal(new Set(copy).size,3);
  // Inspecting is a real read. Switching levels must preserve the sheet,
  // scroll, camera, selection, stored learning consent and authoritative game.
  await click(v,$('empInspectToggle'));
  const coordinate=String.fromCharCode(65+city.pos[0])+(city.pos[1]+1);
  $('empMap').querySelector('.emp-tile[aria-label^="'+coordinate+':"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();
  assert.equal($('empHexSheet').open,true);
  $('empHexSheet').scrollTop=48;$('empMapWrap').scrollLeft=83;$('empMapWrap').scrollTop=37;
  const teaching=w.localStorage.getItem('empires-learning-v1'),hexCopies=[];
  for(const value of ['simple','moderate','expert']){
   await level(v,value);hexCopies.push($('empHexContent').textContent);
   assert.equal($('empHexSheet').open,true);assert.equal($('empHexSheet').scrollTop,48);
   assert.equal($('empMapWrap').scrollLeft,83);assert.equal($('empMapWrap').scrollTop,37);
   assert.match($('empHexContent').querySelector('.emp-experience-context').textContent,new RegExp(value,'i'));
   assert.equal(w.localStorage.getItem('empires-learning-v1'),teaching);
   assert.equal(JSON.stringify(w.empiresUI.state),before);assert.equal(posts,1);
  }
  assert.equal(new Set(hexCopies).size,3);
  await click(v,w.document.querySelector('[data-emp-close="empHexSheet"]'));
  await click(v,$('empMenuOpen'));await click(v,$('empLearningMenu'));
  assert.equal($('empLearnSheet').open,true);$('empLearnSheet').scrollTop=62;
  const resumed=w.localStorage.getItem('empires-learning-v1');
  for(const value of ['simple','moderate','expert']){
   await level(v,value);assert.equal($('empLearnSheet').open,true);assert.equal($('empLearnSheet').scrollTop,62);
   assert.match($('empLesson').querySelector('.emp-experience-context').textContent,new RegExp(value,'i'));
   assert.equal(!!$('empLesson').querySelector('.emp-lesson-planning'),value==='moderate');
   assert.equal(w.localStorage.getItem('empires-learning-v1'),resumed);
   assert.equal(JSON.stringify(w.empiresUI.state),before);assert.equal(posts,1);
  }
  console.log('PASS: Empires tier-specific Home, decisions, inspector and lessons; full Expert detail; unchanged actions/state; stable sheets/scroll/camera; tutorial consent isolated; zero orders from tier changes.');
 }finally{await delay();w.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
