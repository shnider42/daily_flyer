/* Real Flask orders + whole-app DOM. CSS computed visibility, not browser layout. */
const {make,fixture,click,delay,db,root,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const ids={area_fire:'areaFire',spot_fire:'spotFire',clear_wreck:'clearWreck',bridge_gap:'bridgeGap'};
async function prepare(v,kind){
 const script=`import sqlite3,json,sys
from ww2_tactics.visibility import update_intel
db,code,kind=sys.argv[1:]
with sqlite3.connect(db) as conn:
 s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
 if kind=='suppress':
  s['battlefield']['map']=[['field']*s['battlefield']['width'] for _ in range(s['battlefield']['height'])]
  for u in s['units']:u.update(hp=0,ap=0)
  u=next(u for u in s['units'] if u['side']=='de' and u['kind']=='mg');u.update(pos=[1,5],hp=3,ap=3)
  t=next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad');t.update(pos=[5,5],hp=3,ap=2)
 else:
  u=next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad');u.update(pos=[5,7],pinned=True,role_pinned_start=True,ap=2)
  t=next(u for u in s['units'] if u['side']=='us' and u['kind']=='leader');t.update(pos=[4,7],ap=3)
 update_intel(s);s['revision']+=1
 conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code))
 print(json.dumps([u['id'],t['id']]))`;
 const result=JSON.parse(cp.execFileSync('python',['-c',script,db,v.e('session.code'),kind],{cwd:root,encoding:'utf8'}));
 await v.e('refresh()');await delay();return result;
}
async function main(){
 for(const width of [1440,390]){
  const v=await make(width),{w,e,$}=v;
  try{
   for(const file of ['game.css','midway2.css','ground-roles.css']){const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'ww2_tactics/static',file),'utf8');w.document.head.append(style);}
   for(const map of ['current:village_2','current:stonebridge_2']){
    await fixture(v,'de',map);
    for(const level of ['simple','moderate','expert']){
     w.ww2Experience.set(level);await delay();
     for(const uid of e("state.units.filter(u=>u.side===state.side).map(u=>u.id)")){
      e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(uid)}))`);await delay();
      const expected=Array.from(e('state.units.find(u=>u.id===selected).role_orders')).filter(k=>k!=='move').map(k=>ids[k]||k).sort().join();
      const shown=[...w.document.querySelectorAll('[data-order-id]')].filter(b=>!b.hidden&&!b.closest('[hidden]')).map(b=>b.dataset.orderId).sort().join();
      assert.equal(shown,expected,`${map} ${uid} ${level}`);
      assert.equal($('carrierGroupOpen').hidden,true);assert.equal(w.getComputedStyle($('carrierGroupOpen')).display,'none');
     }
     const lessons=w.ww2Learning.lessons(e('state'));
     assert.ok(lessons.some(l=>l.id==='specialist-infantry'));
     assert.ok(!lessons.some(l=>l.id==='armor-control'||l.id==='radio'));
     assert.match(lessons.find(l=>l.id==='rally').text,/full own turn/);
     assert.match(lessons.find(l=>l.id==='watch-lanes').text,/Mortar teams and MG 42 teams have no overwatch/);
    }
    e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='mg'))");await delay();
    assert.match($('roleBrief').textContent,/Suppress 2–6.*base sight 4/);
    assert.equal($('fire').hidden,true);assert.equal($('rally').hidden,true);assert.equal($('overwatch').hidden,true);
    assert.match(w.orderHelp('suppress',e('state.units.find(u=>u.id===selected)'),e('state.legal[selected]'),true),/no strength damage/);
    assert.equal($('suppress').getAttribute('aria-disabled'),'true');
    for(const layout of ['map-first','panels']){w.ww2Experience.setLayout(layout);await delay();assert.equal($('fire').hidden,true);assert.equal($('suppress').hidden,false);}
    for(const theme of ['light','dark']){if(w.document.documentElement.dataset.theme!==theme)$('appearanceToggle').click();await delay();assert.ok(w.document.querySelector('#map .unit-role-badge'));}
    assert.equal($('groundRolesManual').hidden,false);assert.ok($('rules').classList.contains('specialist-manual'));
    assert.match($('unitBadgeLegend').textContent,/Captain.*Major.*Machine-gun|Captain.*Machine-gun/);
    $('unitStyleToggle').click();await delay();assert.ok(w.document.querySelector('#map .unit-art-basic .unit-role-badge'));
    $('unitStyleToggle').click();await delay();assert.ok(w.document.querySelector('#map .unit-primary-insignia'));
    $('unitStyleToggle').click();await delay();assert.ok(w.document.querySelector('#map .unit-illustration'));
   }
   await fixture(v,'de','current:village_2');
   const [mg,t]=await prepare(v,'suppress');e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(mg)}));chooseUnit(state.units.find(u=>u.id===${JSON.stringify(t)}))`);await delay();
   assert.equal($('suppress').getAttribute('aria-disabled'),'false');assert.match($('hint').textContent,/zero strength damage/);
   await click(v,$('suppress'));assert.equal(e(`state.units.find(u=>u.id===${JSON.stringify(t)}).hp`),3);assert.equal(e(`state.units.find(u=>u.id===${JSON.stringify(mg)}).ap`),1);
   await fixture(v,'us','current:village_2');
   const [rifle,officer]=await prepare(v,'pin');e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(rifle)}))`);await delay();
   assert.equal($('rally').hidden,true);assert.match($('hint').textContent,/recover when this army turn ends/);
   assert.match($('unitMechanics').textContent,/Officer rally preserves/);assert.doesNotMatch($('unitMechanics').textContent,/Rally costs 1 action/);
   e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(officer)}))`);await delay();await click(v,$('inspire'));
   assert.equal(e(`state.units.find(u=>u.id===${JSON.stringify(rifle)}).pinned`),false);assert.equal(e(`state.units.find(u=>u.id===${JSON.stringify(rifle)}).ap`),2);
   await e('refresh()');assert.equal(e('state.ground_roles_version'),1);
   // Reproduce the old CSS bug, including leaving an operation with carriers.
   await fixture(v,'us','current:midway_2');w.ww2Experience.set('simple');await delay();
   e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier'))");await delay();
   assert.notEqual(w.getComputedStyle($('carrierGroupOpen')).display,'none');await click(v,$('carrierGroupOpen'));assert.equal($('carrierAirGroupDialog').open,true);
   $('carrierAirGroupDialog').close();e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='destroyer'))");await delay();
   assert.equal(w.getComputedStyle($('carrierGroupOpen')).display,'none');$('carrierGroupOpen').click();assert.equal($('carrierAirGroupDialog').open,false);
   await fixture(v,'us','current:village');e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='squad'))");await delay();
   assert.equal($('groundRolesManual').hidden,true);assert.ok(!$('rules').classList.contains('specialist-manual'));
   assert.equal(w.getComputedStyle($('carrierGroupOpen')).display,'none');assert.equal($('rally').hidden,false);assert.equal($('smoke').hidden,false);
  }finally{await delay();w.close();}
 }
 console.log('PASS: role orders, computed carrier visibility, real suppression/rally API, help, badges, mode/layout/theme switching and existing-map cleanup at desktop/phone widths.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
