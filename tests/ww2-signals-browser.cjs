/* Real HTTP creation/orders; map-first mobile layout and per-platoon rendering. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync('/tmp/ww2-signals-'),base='http://127.0.0.1:8134';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8134','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-preview-chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(15000);
 await p.goto(base);await p.waitForFunction(()=>scenarios.length===17);
 await p.evaluate(()=>ww2ViewMode.set('experimental'));
 for(const name of ['apennine','desert_signal','amba_dawn']){
  await p.evaluate(async name=>{remember(await api('/api/match',{scenario:name,ruleset:'dsl',opponent:'computer'}));await refresh();},name);
  await p.waitForFunction(()=>state?.signals_version&&!busy&&!polling&&document.querySelector('#mobileBattleScreen'));
  assert.equal(await p.locator('#battleLayout').inputValue(),'map-first');
  const checks=await p.evaluate(()=>{
   const errors=[],tile=$('map').querySelector('.hex');
   for(const platoon of ['A','B','HQ']){
    chooseUnit(state.units.find(u=>u.side===state.side&&u.platoon===platoon));
    const actual=[...$('map').querySelectorAll('.unit')].map(n=>n.dataset.unitId).filter(id=>state.units.find(u=>u.id===id)?.side!==state.side).sort();
    if(JSON.stringify(actual)!==JSON.stringify([...state.platoon_views[platoon].enemy_ids].sort()))errors.push({platoon,actual});
    if($('map').querySelectorAll('.fog-layer polygon').length!==state.map.flat().length-state.platoon_views[platoon].visible_hexes.length)errors.push('fog');
   }
   return {errors,retained:tile===$('map').querySelector('.hex')};
  });assert.deepEqual(checks.errors,[]);assert.ok(checks.retained);
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(100);
   const map=await p.locator('#mapWrap').boundingBox(),home=await p.locator('#homeBattles').boundingBox();
   assert.ok(home&&home.y<15&&home.height>=40,JSON.stringify({home,width}));
   assert.ok(map.height/height>.60,JSON.stringify({name,width,height,map}));
   const rects=await p.locator('#mobileBattleTop > :visible').evaluateAll(ns=>ns.map(n=>({id:n.id,x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right,bottom:n.getBoundingClientRect().bottom})));
   assert.ok(rects.every(r=>r.x>=0&&r.right<=width+1&&r.bottom<=91),JSON.stringify(rects));
   await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='commander')));
   await p.locator('#dadOrdersOpen').click();assert.ok(await p.locator('#dadOrders').evaluate(d=>d.open));
   assert.match(await p.locator('#radioUpdate').textContent(),/No recent reports/);
   await p.locator('#radioUpdate').focus();await p.keyboard.press('Enter');assert.ok(await p.locator('#dadOrders').evaluate(d=>d.open));
   const gray=await p.locator('#radioUpdate .action-name').evaluate(n=>getComputedStyle(n).color);assert.equal(gray,'rgb(100, 105, 97)');
   const clipped=await p.locator('#dadOrders #orders [data-order-id]:visible').evaluateAll(ns=>ns.filter(n=>n.scrollWidth>n.clientWidth+2).map(n=>n.id));assert.deepEqual(clipped,[]);
   await p.locator('#dadOrdersClose').click();assert.equal((await p.locator('#mapWrap').boundingBox()).height,map.height);
  }
  // Actual 1-AP observation and a movement must retain geography and camera.
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='scout')));
  const before=await p.evaluate(()=>({ap:state.units.find(u=>u.id===selected).ap,revision:state.revision}));
  await tap(p,p.locator('#observe'));await p.waitForFunction(r=>state.revision>r&&!busy,before.revision);
  assert.equal(await p.evaluate(()=>state.units.find(u=>u.id===selected).ap),before.ap-1);
  assert.equal(await p.locator('#dadOrders').evaluate(d=>d.open),false);
  assert.equal(await p.evaluate(()=>state.units.find(u=>u.id===selected).observing),true);
  const motion=await p.evaluate(async()=>{
   const tile=$('map').querySelector('.hex'),r=$('mapWrap').getBoundingClientRect(),u=state.units.find(u=>u.id===selected),pos=state.legal[u.id].moves[0].pos;
   await act({kind:'move',unit:u.id,pos});return {retained:tile===$('map').querySelector('.hex'),stable:r.height===$('mapWrap').getBoundingClientRect().height};
  });assert.ok(motion.retained&&motion.stable);assert.equal(await p.evaluate(()=>!!state.units.find(u=>u.id===selected).observing),false);
  await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='mortar')));
  const shell=await p.evaluate(()=>({revision:state.revision,shells:state.units.find(u=>u.id===selected).shells}));
  await tap(p,p.locator('#mortarFire'));assert.ok(await p.locator('.signal-choice').count());
  await p.locator('.signal-choice').first().click();await p.waitForFunction(r=>state.revision>r&&!busy,shell.revision);
  assert.equal(await p.evaluate(()=>state.units.find(u=>u.id===selected).shells),shell.shells-1);
  assert.equal(await p.locator('.signal-choice').count(),0);assert.ok(await p.locator('.barrage-zone').count());
  await p.screenshot({path:path.join(temp,name+'.png')});
 }
 await p.reload();assert.equal(await p.evaluate(()=>ww2ViewMode.mode),'experimental');await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state&&!busy&&!polling);
 await p.locator('#battleViewOpen').click();
 for(const level of ['simple','moderate','expert']){await p.locator('#simpleToggle').selectOption(level);assert.equal(await p.evaluate(()=>ww2Experience.level),level);assert.equal(await p.locator('#battleLayout').inputValue(),'map-first');}
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await p.setViewportSize({width:1440,height:1000});await p.waitForFunction(()=>ww2Desktop.active&&!ww2Mobile.active);
 assert.ok(await p.locator('#orders').isVisible());
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>ww2Mobile.active);
 await p.locator('#homeBattles').click();assert.ok(await p.locator('#game').isHidden());assert.ok(await p.locator('#sessionList').isVisible());
 assert.deepEqual(errors,[]);console.log('Three theaters: real HTTP observe/move/mortar, 320/390/430 and landscape layouts, persistent home, orders sheet, platoon fog, retained terrain and three-mode persistence passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
