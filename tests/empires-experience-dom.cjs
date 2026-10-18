/* Full document and real initial campaign, then presentation-only combat fixtures.
   DOM/API checks at phone widths, not an iPhone Safari layout test. */
const {make,click,delay,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const levels=['simple','moderate','expert'];
async function choose(v,id,level){v.$(id).value=level;v.$(id).dispatchEvent(new v.w.Event('change',{bubbles:true}));await delay();}
async function select(v,id){v.$('empMap').querySelector(`[data-unit-id="${id}"]`).dispatchEvent(new v.w.MouseEvent('click',{bubbles:true}));await delay();}
const actions=v=>[...v.$('empPanel').querySelectorAll('[data-emp-action]')].map(b=>[b.dataset.empAction,b.disabled]);
async function main(){
 let savedPreference;
 const v=await make(390),{w,$}=v;
 try{
  const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../ww2_tactics/static/empires.css'),'utf8');w.document.head.append(style);
  let posts=0;const fetch=w.fetch;w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return fetch(url,opts);};
  await click(v,$('modeEmpires'));assert.equal($('empHomeExperience').value,'simple');
  await click(v,$('empCreate'));assert.equal(posts,1);
  assert.equal($('empExperienceControl').parentElement.id,'empMenuExperience');
  const game=w.empiresUI.state,scout=game.units.find(u=>u.side===game.side&&u.kind==='scout');
  await select(v,scout.id);await click(v,$('empMenuOpen'));
  const map=$('empMapWrap'),initial=JSON.stringify(game),available=actions(v),moves=$('empMap').querySelectorAll('.can-move').length;
  map.scrollLeft=124;map.scrollTop=67;$('empChronicle').open=true;
  for(const level of levels){
   $('empExperience').focus();await choose(v,'empExperience',level);
   assert.equal(w.ww2Experience.level,level);assert.equal($('empires').dataset.experience,level);
   for(const id of ['homeExperience','simpleToggle','empHomeExperience','empExperience','empGuideExperience'])assert.equal($(id).value,level);
   assert.equal(JSON.parse(w.localStorage.getItem('ww2-play-preferences')).experience,level);
   assert.equal($('empMenu').open,true);assert.equal(w.document.activeElement,$('empExperience'));
   assert.equal($('empMapWrap'),map);assert.equal(map.scrollLeft,124);assert.equal(map.scrollTop,67);
   assert.equal($('empChronicle').open,true);assert.equal(w.empiresUI.selection,scout.id);
   assert.equal(JSON.stringify(game),initial);assert.equal(posts,1);assert.deepEqual(actions(v),available);
   assert.equal($('empMap').querySelectorAll('.can-move').length,moves);
   assert.equal(w.getComputedStyle($('empMap').querySelector('.emp-coordinate')).display==='none',level==='simple');
   assert.equal($('empPanel').querySelector('[data-rule="unit"]').open,level==='expert');
   assert.match($('empSelectedMeta').textContent,/HP · \d AP/);
   assert.match($('empMenuOpen').textContent,new RegExp(level,'i'));
   assert.match($('empPanel').textContent,/Fortify/);assert.ok($('empQuickOrders').querySelector('[data-emp-action="fortify"]'));
  }
  await click(v,w.document.querySelector('[data-emp-close="empMenu"]'));
  // City projects and rush prices remain available in every presentation.
  await click(v,$('empRosterOpen'));
  const city=game.cities.find(c=>c.side===game.side);
  await click(v,[...$('empRoster').querySelectorAll('button')].find(b=>b.textContent.includes(city.name)));
  const projects=[...$('empProject').options].map(o=>o.value),cityCopy=[];
  for(const level of levels){
   await choose(v,'empHomeExperience',level);assert.equal($('empOrdersSheet').open,true);
   assert.deepEqual([...$('empProject').options].map(o=>o.value),projects);assert.equal($('empProject').value,city.project);
   assert.match($('empPanel').textContent,/Rush project · \d+ gold/);
   assert.equal($('empPanel').querySelector('[data-rule="city"]').open,level==='expert');cityCopy.push($('empPanel').textContent);
  }
  assert.equal(new Set(cityCopy).size,3);
  // Research has benefits at every level; timing and prerequisites add depth.
  w.document.querySelector('[data-emp-tab="research"]').click();
  let researchActions;const researchCopy=[];
  for(const level of levels){
   await choose(v,'empHomeExperience',level);
   const now=[...$('empPanel').querySelectorAll('[data-emp-tech]')].map(b=>[b.dataset.empTech,b.disabled]);
   if(researchActions)assert.deepEqual(now,researchActions);else researchActions=now;
   assert.equal(now.length,8);assert.match($('empPanel').textContent,/Requires Writing/);
   assert.equal($('empPanel').querySelector('[data-rule="research"]').open,level==='expert');researchCopy.push($('empPanel').textContent);
  }
  assert.equal(new Set(researchCopy).size,3);
  w.document.querySelector('[data-emp-tab="diplomacy"]').click();const diplomacyCopy=[];
  for(const level of levels){await choose(v,'empHomeExperience',level);diplomacyCopy.push($('empPanel').textContent);assert.equal($('empPanel').querySelectorAll('button').length,0);}
  assert.equal(new Set(diplomacyCopy).size,3);assert.equal(JSON.stringify(game),initial);assert.equal(posts,1);
  await click(v,w.document.querySelector('[data-emp-close="empOrdersSheet"]'));
  // A legal-looking, already-visible rival is a local display fixture only.
  const enemy={id:'experience-fixture',kind:'spearman',side:game.side==='river'?'highland':'river',pos:game.legal[scout.id].moves[0].pos,hp:5,fortified:false,shaken:false};
  game.units.push(enemy);game.diplomacy.met=true;game.diplomacy.war=true;
  game.legal[scout.id].attacks.push({id:enemy.id,pos:enemy.pos,threshold:5,damage:1});
  game.journal.push({round:game.round,text:'Scout: rolled 5, needed 5+. 1 damage.'});
  await select(v,scout.id);await select(v,enemy.id);
  const combatState=JSON.stringify(game),combatCopy=[];
  for(const level of levels){
   await choose(v,'empHomeExperience',level);
   assert.equal(w.empiresUI.selection,scout.id);assert.equal($('empOrdersSheet').open,true);
   assert.match($('empPanel').querySelector('.emp-attack-preview').textContent,/33%/);
   assert.ok([...$('empPanel').querySelectorAll('button')].find(b=>b.textContent==='Confirm attack · 2 AP'&&!b.disabled));
   assert.equal($('empPanel').querySelector('[data-rule="attack"]').open,level==='expert');
   combatCopy.push($('empPanel').querySelector('.emp-attack-preview').textContent);
   assert.equal($('empLatest').textContent.includes('rolled 5'),level==='expert');
   assert.match($('empJournal').textContent,/rolled 5, needed 5\+/,'Original combat detail remains inspectable');
   assert.equal(JSON.stringify(game),combatState);assert.equal(posts,1);
  }
  assert.equal(new Set(combatCopy).size,3);
  // Important state restrictions and warnings survive every level.
  game.turn=enemy.side;
  for(const level of levels){await choose(v,'empHomeExperience',level);assert.equal($('empEnd').disabled,true);assert.match($('empPanel').querySelector('.emp-warning').textContent,/taking its turn/);}
  game.turn=game.side;scout.shaken=true;await select(v,scout.id);
  for(const level of levels){await choose(v,'empHomeExperience',level);assert.match($('empMobileHint').textContent,/Rally/);assert.match($('empPanel').textContent,/Rally before giving another order/);}
  scout.shaken=false;
  await click(v,$('empManualOpen'));assert.equal($('empManual').open,true);
  const guideCopy=[];
  for(const level of levels){
   await choose(v,'empGuideExperience',level);assert.equal($('empManual').open,true);
   assert.equal($('empRulebook').open,level==='expert');guideCopy.push($('empGuideSteps').textContent);
  }
  assert.equal(new Set(guideCopy).size,3);await click(v,$('empManualClose'));
  for(const level of levels){await choose(v,'empHomeExperience',level);await click(v,$('empEnd'));assert.equal($('empConfirm').open,true);assert.match($('empConfirmText').textContent,/1/);await click(v,$('empConfirmCancel'));}
  assert.equal(posts,1);
  // Shared preference persists on reload and remains selected when returning to DSL.
  await choose(v,'empHomeExperience','moderate');savedPreference=w.localStorage.getItem('ww2-play-preferences');
  await click(v,$('empBack'));await click(v,$('modeDSL'));assert.equal($('homeExperience').value,'moderate');
  assert.equal(w.document.body.classList.contains('empires-mobile'),false);
 }finally{await delay();w.close();}
 const fresh=await make(320,{'ww2-play-preferences':savedPreference,'dfe-game-mode':'empires'});
 try{assert.equal(fresh.$('empHomeExperience').value,'moderate');assert.equal(fresh.$('empires').dataset.experience,'moderate');assert.match(fresh.$('empHomeExperienceNote').textContent,/Useful numbers/);}finally{await delay();fresh.w.close();}
 console.log('PASS: shared Experience preference, all Empires panels/guides/history, identical legal actions and game state, phone sheets/camera/selection, combat odds/warnings, zero orders on preference changes, and reload/DSL continuity. DOM/API only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
