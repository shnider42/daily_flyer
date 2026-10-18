/* Full UI scripts with real Flask orders; not browser rendering assertions. */
const {make,fixture,click,delay,db,root,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const cp=require('node:child_process'),assert=require('node:assert/strict');
async function prepare(v,kind){
 const code=v.e('session.code');
 const script=`import sqlite3,json,sys
from ww2_tactics.visibility import update_intel
db,code,kind=sys.argv[1:]
with sqlite3.connect(db) as conn:
 s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
 if kind=='aid':
  u=next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad');u.update(hp=1,pos=[3,9],ap=3)
 else:
  for u in s['units']:
   if u['pos']==[7,3]:u['pos']=[10,2]
  u=next(u for u in s['units'] if u['side']=='us' and u['kind']=='engineer');u.update(pos=[6,3],ap=3)
 update_intel(s)
 s['revision']+=1
 conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code))
 print(json.dumps(u['id']))`;
 const id=JSON.parse(cp.execFileSync('python',['-c',script,db,code,kind],{cwd:root,encoding:'utf8'}));
 await v.e('refresh()');v.e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(id)}))`);await delay();return id;
}
async function main(){
 for(const width of [1440,390]){
  const v=await make(width),{e,w,$}=v;
  try{
   await fixture(v,'us','current:foy');
   for(const layout of ['panels','map-first','panels']){
    w.ww2Experience.setLayout(layout);await delay();
    assert.equal($('smallFrontStatus').hidden,false);
    assert.match($('smallFrontStatus').textContent,/4 medical supplies/);
    if(width===390)assert.ok($('mobileBattleMenu').contains($('smallFrontStatus')));
    else if(layout==='map-first')assert.ok($('experimentalBattle').contains($('smallFrontStatus')));
    else assert.ok(w.document.querySelector('.desktop-battlefield').contains($('smallFrontStatus')));
   }
   e("chooseUnit(state.units.find(u=>u.side==='us'&&u.kind==='squad'))");
   assert.equal($('fieldAid').hidden,false);assert.equal($('fieldAid').getAttribute('aria-disabled'),'true');
   assert.match($('fieldAid').dataset.orderReason,/full strength/);
   for(const level of ['simple','moderate','expert']){
    w.ww2Experience.set(level);await delay();
    assert.ok(w.ww2Learning.lessons(e('state')).some(l=>l.id==='field-aid'));
   }
   for(const theme of ['light','dark']){
    if(w.document.documentElement.dataset.theme!==theme)$('appearanceToggle').click();
    assert.equal($('smallFrontStatus').hidden,false);
   }
   assert.equal(w.document.querySelectorAll('#map .small-front-marker').length,2);
   const id=await prepare(v,'aid');assert.equal(e(`state.units.find(u=>u.id===${JSON.stringify(id)}).hp`),1);
   await click(v,$('fieldAid'));assert.equal(e('state.medical_supplies'),3);
   assert.equal(e(`state.units.find(u=>u.id===${JSON.stringify(id)}).hp`),2);
   await e("act({kind:'resign'})");w.ww2Debrief.open();
   assert.match($('debriefContent').textContent,/Field aid treatments/);assert.match($('debriefContent').textContent,/Medical supplies/);$('debriefDialog').close();

   await fixture(v,'de','current:peleliu');
   e("chooseUnit(state.units.find(u=>u.side==='de'&&u.kind==='squad'&&u.pos[1]===3))");
   assert.equal($('caveMove').hidden,false);assert.equal($('fieldAid').hidden,true);
   assert.equal(w.document.querySelectorAll('#map .small-front-marker').length,3);
   assert.ok(w.ww2Learning.lessons(e('state')).some(l=>l.id==='cave-network'));
   await click(v,$('caveMove'));assert.match($('hint').textContent,/ends remaining actions/);
   assert.ok(w.document.querySelectorAll('.small-front-choice').length);
   await click(v,$('caveMove'));assert.equal(w.document.querySelectorAll('.small-front-choice').length,0);
   await click(v,$('caveMove'));
   const old=e('state.units.find(u=>u.id===selected).pos.join()');
   w.document.querySelector('.small-front-choice').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await delay();await delay();
   assert.notEqual(e('state.units.find(u=>u.id===selected).pos.join()'),old);
   assert.equal(e('state.units.find(u=>u.id===selected).ap'),0);

   await fixture(v,'us','current:peleliu');await prepare(v,'seal');
   await click(v,$('sealCave'));assert.match($('hint').textContent,/demolition charge/);
   w.document.querySelector('.small-front-choice').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await delay();await delay();
   assert.equal(e('state.sealed_caves.join()'),'north');
   assert.equal(w.document.querySelectorAll('#map .small-front-marker.sealed').length,1);
   await e('refresh()');assert.match($('smallFrontStatus').textContent,/2\/3 entrances open/);
   await e("act({kind:'resign'})");w.ww2Debrief.open();assert.match($('debriefContent').textContent,/Cave entrances sealed/);$('debriefDialog').close();
   await fixture(v,'us','current:village');
   assert.equal($('smallFrontStatus').hidden,true);assert.equal($('smallFrontManual').hidden,true);
   assert.equal(w.document.querySelectorAll('#map .small-front-marker').length,0);
   for(const id of ['fieldAid','caveMove','sealCave'])assert.equal($(id).hidden,true);
  }finally{w.close();}
 }
 console.log('PASS: Foy/Peleliu DOM + real API at 1440/390, both layouts, light/dark, all Experiences, treatment, cave selection/cancel/keyboard, sealing, reload, debrief and legacy cleanup.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
