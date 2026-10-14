/* Real launch, recovery and service clicks/taps on desktop and phone layouts. */
'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-midway2-'),db=path.join(tmp,'game.sqlite'),port=Number(process.env.WW2_MIDWAY_PORT||8198),base=`http://127.0.0.1:${port}`,engine=process.env.WW2_BROWSER||'chromium';
const server=cp.spawn('python',['-c',`from ww2_web import create_app; create_app('${db}',background_ai=False).run(host='127.0.0.1',port=${port},threaded=True)`],{stdio:'ignore'});
let browser;const errors=[],assets=[];
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function select(p,id){
 const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);
 assert.ok(index>=0,id);await tap(p,p.locator('#roster button').nth(index));await settle(p);
}
async function order(p,locator){const revision=await p.evaluate(()=>state.revision);await tap(p,locator);await p.waitForFunction(r=>state.revision>r&&!busy,revision);await settle(p);}
function fixture(code,phase,planeId){
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.engine import apply
from ww2_tactics.visibility import update_intel
db=sqlite3.connect(sys.argv[1]);code,phase,uid=sys.argv[2:]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
p=next(u for u in s['units'] if u['id']==uid)
cv=next(u for u in s['units'] if u['id']==p['home_carrier'])
if phase=='return':
 p.pop('carrier_id',None);p.update(pos=cv['pos'].copy(),hp=1,bombs=0,ap=3)
 cv.update(ap=3,deck_used=0);s['round']=2
elif phase=='next':
 s=apply(s,s['turn'],dict(kind='end'));s=apply(s,s['turn'],dict(kind='end'))
 s.pop('computer_work',None);s.pop('computer_playback',None)
update_intel(s);s['revision']+=1
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
`,db,code,phase,planeId],{encoding:'utf8'});
}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 for(const mobile of [false,true])for(const side of ['us','de']){
  const p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});p.setDefaultTimeout(18000);
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)assets.push(r.url());});
  await p.goto(base);await p.waitForFunction(()=>currentScenarios.length===29&&ww2Commander.ready);
  assert.equal(await p.locator('#scenarioSelect option[value="current:midway_2"]').count(),0);
  await p.locator('#scenarioSelectEdition').selectOption('current');await p.locator('#scenarioSelect').selectOption('current:midway_2');
  assert.match(await p.locator('#operationTitle').textContent(),/Midway 2.0/);
  await p.evaluate(async side=>{await run(async()=>{remember(await api('/api/match',{scenario:'current:midway_2',ruleset:'dsl',opponent:'computer',side}));});},side);
  await p.waitForFunction(()=>state?.ready&&!busy&&!lobbyMode);await settle(p);
  assert.equal(await p.locator('#map .hex').count(),780);
  assert.equal(await p.locator('#map .unit.'+side).count(),side==='us'?9:10);
  assert.equal(await p.locator('#map .unit.'+side+'.joint-air').count(),0);
  assert.equal(await p.locator('#map .passenger-marker').count(),0,'Carrier manifest count replaces single infantry passenger badges');
  assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('night-battle')),false);
  const ids=await p.evaluate(()=>{const cv=state.units.find(u=>u.side===state.side&&u.kind==='carrier'),plane=state.units.find(u=>u.carrier_id===cv.id&&u.kind==='bomber');return {cv:cv.id,plane:plane.id,code:state.code,capacity:cv.air_capacity};});
  await select(p,ids.cv);await tap(p,p.locator('#carrierGroupOpen'));
  assert.equal(await p.locator('#carrierAirGroup .midway-flight').count(),ids.capacity);
  assert.match(await p.locator('#carrierAirGroup').textContent(),/2\/2 deck cycles remaining/);
  assert.equal(await p.locator('#recon').isVisible(),false);assert.equal(await p.locator('#airstrike').isVisible(),false);
  assert.equal(await p.locator(`[data-service-plane="${ids.plane}"]`).isEnabled(),false);
  await p.screenshot({path:path.join(tmp,`${engine}-${mobile?'phone':'desktop'}-${side}-airgroup.png`)});
  await tap(p,p.locator(`[data-launch-plane="${ids.plane}"]`));
  assert.equal(await p.locator('#carrierAirGroupDialog').evaluate(e=>e.open),false);
  assert.ok(await p.locator('.midway-launch-choice').count()>0);
  const planeBefore=await p.evaluate(id=>state.units.find(u=>u.id===id),ids.plane);
  await order(p,p.locator('.midway-launch-choice').first());
  await p.waitForFunction(id=>selected===id,ids.plane);
  assert.equal(await p.locator(`#map .unit[data-unit-id="${ids.plane}"]`).count(),1);
  assert.equal(await p.evaluate(id=>state.units.find(u=>u.id===id).ap,ids.plane),planeBefore.ap-1);
  assert.equal(await p.locator('#rearm').isVisible(),false);
  assert.equal(await p.evaluate(id=>state.units.find(u=>u.id===id).deck_used,ids.cv),1);
  fixture(ids.code,'return',ids.plane);await p.evaluate(()=>refresh());await settle(p);
  await select(p,ids.plane);await tap(p,p.locator('#carrierGroupOpen'));
  await order(p,p.locator(`[data-recover-carrier="${ids.cv}"]`));
  assert.equal(await p.locator(`#map .unit[data-unit-id="${ids.plane}"]`).count(),0);
  assert.equal(await p.evaluate(id=>state.units.find(u=>u.id===id).carrier_id,ids.plane),ids.cv);
  await tap(p,p.locator(`[data-midway-carrier="${ids.cv}"]`));
  assert.equal(await p.locator(`[data-launch-plane="${ids.plane}"]`).isEnabled(),false);
  const stores=await p.evaluate(id=>state.units.find(u=>u.id===id).air_stores,ids.cv);
  await order(p,p.locator(`[data-service-plane="${ids.plane}"]`));
  const serviced=await p.evaluate(id=>state.units.find(u=>u.id===id),ids.plane);
  assert.equal(serviced.hp,side==='us'?3:2);assert.equal(serviced.bombs,1);assert.equal(serviced.ap,0);
  assert.equal(await p.evaluate(id=>state.units.find(u=>u.id===id).air_stores,ids.cv),stores-1);
  assert.match(await p.locator('#carrierAirGroup').textContent(),/0\/2 deck cycles remaining/);
  assert.equal(await p.locator(`[data-launch-plane="${ids.plane}"]`).isEnabled(),false);
  fixture(ids.code,'next',ids.plane);await p.evaluate(()=>refresh());await settle(p);
  assert.equal(await p.locator(`[data-launch-plane="${ids.plane}"]`).isEnabled(),true);
  await tap(p,p.locator('#carrierAirGroupClose'));
  for(const experience of ['simple','moderate','expert']){
   await p.evaluate(level=>ww2Experience.set(level),experience);await settle(p);
   // Map-first phone layouts intentionally put all orders in the Orders sheet.
   // Follow that visible route and operate the actual control at every depth.
   await tap(p,p.locator('#carrierGroupOpen'));
   assert.equal(await p.locator('#carrierAirGroupDialog').isVisible(),true,`${mobile?'phone':'desktop'} ${side} ${experience}: air group reachable`);
   assert.equal(await p.locator('#carrierAirGroup .midway-flight').count(),ids.capacity);
   assert.equal(await p.locator('dialog[open]').count(),1,'No underlying order sheet blocks the map after closing');
   await tap(p,p.locator('#carrierAirGroupClose'));
  }
  for(const width of mobile?[320,390,430]:[1100,1440]){
   await p.setViewportSize({width,height:mobile?844:1000});await settle(p);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
   await tap(p,p.locator('#carrierGroupOpen'));
   assert.ok(await p.locator('#carrierAirGroupDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   const boxes=await p.locator('.midway-flight-actions button').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().height));assert.ok(boxes.every(h=>h>=44));
   await tap(p,p.locator('#carrierAirGroupClose'));
  }
  await p.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);
 console.log(`PASS ${engine}: desktop/phone, both fleets, real takeoff/landing/service, deck limits and turnaround, all Experiences, 320–1440px, no JS/asset errors. Screenshots: ${tmp}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill('SIGTERM');});
