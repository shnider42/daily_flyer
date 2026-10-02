/* Real UI preferences, catalog filters, creation and reload; no gameplay writes
   except starting isolated test battles. Screenshots use a disposable database. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-experience-'),base='http://127.0.0.1:8139';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8139','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const snapshot=p=>p.evaluate(()=>{const w=$('mapWrap');return {state:JSON.stringify(state),selected,target,smokeMode,barrageMode,combatMode,rect:w.getBoundingClientRect().toJSON(),left:w.scrollLeft,top:w.scrollTop,orders:[...$('orders').querySelectorAll('[data-order-id]')].filter(b=>!b.hidden).map(b=>[b.id,b.getAttribute('aria-disabled'),b.dataset.orderReason]),fog:$('map').querySelector('.fog-layer')?.outerHTML||null};});
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const migrations=[{old:{simple:true,mode:'on'},level:'simple',layout:'panels'},{old:{simple:false,mode:'off'},level:'expert',layout:'panels'},{old:{simple:true,mode:'experimental'},level:'simple',layout:'map-first'},{old:{simple:false},level:'expert',layout:'panels'},{old:{version:2,experience:'moderate',layout:'panels'},level:'moderate',layout:'panels'},{old:{version:2,experience:'bad',layout:'bad'},level:'simple',layout:'map-first'}];
 for(const test of migrations){
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(old=>localStorage.setItem('ww2-play-preferences',JSON.stringify(old)),test.old);await p.goto(base);
  assert.deepEqual(await p.evaluate(()=>({level:ww2Experience.level,layout:ww2Experience.layout})),{level:test.level,layout:test.layout});await p.close();
 }
 for(const touch of [true,false]){
  const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:720},isMobile:touch,hasTouch:touch});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.waitForFunction(()=>scenarios.length===17&&window.ww2OperationBrowser);
  assert.deepEqual(await p.evaluate(()=>({level:ww2Experience.level,layout:ww2Experience.layout})),{level:'simple',layout:'map-first'});
  assert.equal(await p.locator('#homeExperience').inputValue(),'simple');assert.equal(await p.locator('#scenarioSelect option').count(),17);
  await p.locator('#scenarioSelectCategory').selectOption('naval');assert.equal(await p.locator('#scenarioSelect').inputValue(),'village');
  assert.deepEqual(await p.locator('#scenarioSelect > option').evaluateAll(ns=>ns.map(n=>n.value)),['midway','fubar']);
  assert.match(await p.locator('#scenarioSelectResults').textContent(),/current choice kept/);
  await p.locator('#scenarioSelect').selectOption('fubar');await p.locator('#scenarioSelectCategory').selectOption('all');
  await p.locator('#scenarioSelectSort').selectOption('newest');assert.equal(await p.locator('#scenarioSelect option').first().getAttribute('value'),'fubar');
  for(const level of ['moderate','expert','simple']){await p.locator('#homeExperience').selectOption(level);assert.equal(await p.locator('#scenarioSelect').inputValue(),'fubar');assert.equal(await p.locator('#scenarioSelect option').count(),17);}
  await p.locator('#scenarioSelectSort').selectOption('smallest');assert.equal(await p.locator('#scenarioSelect option').first().getAttribute('value'),'village');
  await p.locator('#scenarioSelect').selectOption('village');await p.screenshot({path:path.join(temp,`${touch?'phone':'desktop'}-home.png`),fullPage:true});
  await p.locator('#createSolo').click();await p.locator('#soloScenarioCategory').selectOption('air');await p.locator('#soloScenario').selectOption('britain');await p.locator('#closeSolo').click();
  await p.locator('#createSolo').click();assert.equal(await p.locator('#soloScenario').inputValue(),'village','Reopening preserves the requested Home map despite a previous filter');
  await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!polling);await settle(p);
  await p.evaluate(()=>{refresh=async()=>{};chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='squad'));});await settle(p);
  assert.equal(await p.locator('#tutorialCoach').isVisible(),false,'Guide remains opt-in');
  for(const [width,height] of touch?[[320,568],[390,844],[844,390]]:[[1100,600],[1280,720],[1440,1000]]){
   await p.setViewportSize({width,height});await settle(p);
   await p.locator('#battleViewOpen').click();const before=await snapshot(p);
   for(const level of ['moderate','expert','simple']){
    await p.locator('#simpleToggle').selectOption(level);await settle(p);
    assert.deepEqual(await snapshot(p),before,`Experience ${level} cannot move the map or change rules/selection/fog/orders at ${width}`);
    assert.equal(await p.locator('#battleLayout').inputValue(),'map-first');assert.ok(await p.locator('#battleViewSettings').evaluate(n=>n.open));
   }
   assert.ok(await p.locator('#battleViewSettings').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   await p.screenshot({path:path.join(temp,`view-${width}.png`)});await p.locator('#battleViewSettingsClose').click();
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const field=await p.locator('#mapWrap').boundingBox();assert.ok(field.height>height*.5);
  }
  // Moderate's odds summary is real shared UI, not a change to attack legality.
  await p.evaluate(()=>ww2Experience.set('moderate'));
  await p.evaluate(()=>{$('odds').hidden=false;$('odds').replaceChildren(chanceRow('Fire',4,{cover:1},'Hit: 1 damage.'));});
  await p.locator(touch?'#mobileOrderToggle':'#experimentalUnitOpen').click();
  assert.ok(await p.locator('#odds').isVisible());assert.match(await p.locator('#odds').textContent(),/50%/);assert.equal(await p.locator('#odds .dice-options').isVisible(),false);
  await p.keyboard.press('Escape');
  // Changing Experience during targeting keeps the same pending target action.
  await p.evaluate(()=>{ww2Experience.set('simple');smokeMode=true;render();});await settle(p);const targeting=await snapshot(p);
  await p.locator('#battleViewOpen').click();await p.locator('#simpleToggle').selectOption('expert');await settle(p);assert.deepEqual(await snapshot(p),targeting);
  await p.locator('#simpleToggle').selectOption('moderate');await p.locator('#battleViewSettingsClose').click();
  const code=await p.evaluate(()=>state.code);await p.locator('#homeBattles').click();assert.equal(await p.locator('#homeExperience').inputValue(),'moderate');
  await p.reload();assert.equal(await p.locator('#homeExperience').inputValue(),'moderate');await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state&&!busy);assert.equal(await p.evaluate(()=>state.code),code);
  assert.equal(await p.evaluate(()=>ww2Experience.layout),'map-first');
  // Retained Panels layout must also keep its camera when changing information.
  await p.evaluate(()=>{ww2Experience.setLayout('panels');chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='squad'));});await settle(p);
  await p.locator('#battleViewOpen').click();const panelCamera=await snapshot(p);
  for(const level of ['simple','expert','moderate']){await p.locator('#simpleToggle').selectOption(level);await settle(p);assert.deepEqual(await snapshot(p),panelCamera,'Panels camera stays stable across Experience');}
  await p.close();
 }
 const privatePage=await browser.newPage();privatePage.on('pageerror',e=>errors.push(e.message));await privatePage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('disabled');};Storage.prototype.setItem=()=>{throw Error('disabled');};});await privatePage.goto(base);await privatePage.locator('#homeExperience').selectOption('expert');assert.equal(await privatePage.evaluate(()=>ww2Experience.level),'expert');
 assert.deepEqual(errors,[]);console.log('Experience: migration, all levels, map categories/sorts, safe selection, Home/Solo, stable camera/targeting/orders/fog, mobile/desktop, reload and unavailable storage passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
