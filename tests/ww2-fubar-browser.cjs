/* Real Fubar creation, server moves and layer selection on phone / desktop. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync('/tmp/ww2-fubar-'),base='http://127.0.0.1:8138';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8138','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;const errors=[],badAssets=[];
const camera=p=>p.locator('#mapWrap').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),left:n.scrollLeft,top:n.scrollTop}));
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const touch of [true,false]){
  const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:720},isMobile:touch,hasTouch:touch});p.setDefaultTimeout(15000);
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});p.on('dialog',d=>d.accept());
  await p.goto(base);await p.locator('#scenarioSelect').selectOption('fubar');await p.locator('#createSolo').click();
  assert.equal(await p.locator('#soloScenario').inputValue(),'fubar');await p.locator('#startSolo').click();
  await p.waitForFunction(()=>state?.joint_ops_version&&!busy&&!polling);
  const plane=await p.evaluate(()=>state.units.find(u=>u.side===state.side&&u.kind==='fighter'));
  await p.evaluate(id=>focusMapUnit(state.units.find(u=>u.id===id)),plane.id);
  const before=await camera(p);
  await tap(p,p.locator(`#map .unit[data-unit-id="${plane.id}"]`));
  assert.ok(await p.locator('#fubarStack').evaluate(d=>d.open));
  assert.equal(await p.locator('#fubarStack .fubar-stack-options button').count(),2);
  await p.locator(`#fubarStack button[data-unit-id="${plane.id}"]`).click();
  assert.equal(await p.evaluate(()=>selected),plane.id);
  assert.ok(await p.locator('#map .hex.move').count()>10);
  assert.match(await p.locator('#roleBrief').textContent(),/Intercept aircraft/);
  assert.equal(await p.locator('#rearm').evaluate(n=>n.hidden),false);assert.equal(await p.locator('#dig').evaluate(n=>n.hidden),true);
  assert.deepEqual(await camera(p),before,'Shared-hex picker and selection cannot shift the map');
  for(const mode of ['on','off','experimental']){
   await p.evaluate(m=>ww2ViewMode.set(m),mode);
   await p.waitForFunction(()=>!document.querySelector('#fubarLayers').hidden);
   await p.evaluate(id=>focusMapUnit(state.units.find(u=>u.id===id)),plane.id);
   const rect=await p.locator('#fubarLayers').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=(touch?390:1280));
   assert.deepEqual(await p.locator('#battleNavigation button').allTextContents(),['Home','View','Team orders']);
   const cam=await camera(p),rev=await p.evaluate(()=>state.revision);
   for(const layer of ['air','surface','both']){
    await p.locator(`#fubarLayers [data-layer="${layer}"]`).click();
    assert.equal(await p.evaluate(()=>state.revision),rev);
    assert.deepEqual(await camera(p),cam,'Layer filtering cannot pan, resize or scroll the battlefield');
    const wrong=await p.evaluate(layer=>[...$('map').querySelectorAll('.unit:not(.joint-hidden)')].filter(g=>{const u=state.units.find(u=>u.id===g.dataset.unitId);return layer==='air'?!['fighter','bomber'].includes(u.kind):layer==='surface'?['fighter','bomber'].includes(u.kind):false;}).length,layer);
    assert.equal(wrong,0);
   }
   await p.locator('#battleViewOpen').click();assert.ok(await p.locator('#terrainToggle').isVisible());assert.ok(await p.locator('#unitStyleToggle').isVisible());await p.locator('#battleViewSettingsClose').click();
  }
  await p.locator('#fubarLayers [data-layer="air"]').click();
  await p.evaluate(id=>focusMapUnit(state.units.find(u=>u.id===id)),plane.id);await tap(p,p.locator(`#map .unit[data-unit-id="${plane.id}"]`));
  const dest=[17,25],rev=await p.evaluate(()=>state.revision);
  assert.ok(await p.evaluate(pos=>state.units.some(u=>u.side===state.side&&u.kind==='leader'&&u.pos[0]===pos[0]&&u.pos[1]===pos[1]),dest));
  await tap(p,p.locator(`#map .hex.move[data-x="${dest[0]}"][data-y="${dest[1]}"]`));await p.waitForFunction(r=>!busy&&state.revision>r,rev);
  assert.deepEqual(await p.evaluate(id=>state.units.find(u=>u.id===id).pos,plane.id),dest);
  assert.equal(await p.evaluate(()=>state.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id&&u.pos[0]===17&&u.pos[1]===25).length),2);
  await p.locator('#fubarLayers [data-layer="both"]').click();
  await p.evaluate(id=>focusMapUnit(state.units.find(u=>u.id===id)),plane.id);
  await p.screenshot({path:path.join(temp,`${touch?'phone':'desktop'}-fubar.png`)});
  for(const kind of ['carrier','destroyer','battleship','bomber','aa_gun','radar','airfield','landing_craft','commander','sniper']){
   await p.evaluate(kind=>{const u=state.units.find(u=>u.side===state.side&&u.kind===kind);chooseUnit(u);focusMapUnit(u);},kind);
   const ids=await p.locator('[data-order-id]').evaluateAll(ns=>ns.filter(n=>!n.hidden).map(n=>n.dataset.orderId));
   if(kind==='carrier'){assert.ok(ids.includes('recon')&&ids.includes('airstrike')&&ids.includes('repair'));assert.ok(!ids.includes('dig'));}
   if(kind==='destroyer')assert.ok(ids.includes('torpedo'));
   if(kind==='bomber'){assert.ok(ids.includes('areaFire')&&ids.includes('rearm'));assert.ok(!ids.includes('assault'));}
   if(['radar','airfield'].includes(kind))assert.equal(ids.length,0);
  }
  const mission=await p.evaluate(()=>ww2Briefing.mission(state));assert.match(mission.goal,/10 control points/);assert.doesNotMatch(mission.compact,/canal exit/);
  const code=await p.evaluate(()=>state.code);await p.locator('#homeBattles').click();await p.locator('#game').waitFor({state:'hidden'});
  await p.waitForFunction(()=>document.querySelector('#fubarLayers').hidden);
  await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state?.joint_ops_version&&!busy&&!document.querySelector('#game').hidden);
  assert.equal(await p.evaluate(()=>state.code),code);assert.deepEqual(await p.evaluate(id=>state.units.find(u=>u.id===id).pos,plane.id),dest);
  await p.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);console.log('Fubar: phone/desktop, all layouts, real cross-layer move, shared-hex picker, stable camera, domain orders, mission and resume passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
