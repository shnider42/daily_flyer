const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-campaigns-')),base='http://127.0.0.1:8111';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8111','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'games.sqlite3')},stdio:'ignore'});
let browser;const errors=[],badAssets=[];
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const binary=process.env.CHROMIUM_EXECUTABLE_PATH;
 const pack=binary?null:require('@sparticuz/chromium');browser=await chromium.launch({headless:true,executablePath:binary||await pack.executablePath(),args:binary?['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']:pack.args.filter(a=>a!=='--single-process')});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});p.setDefaultTimeout(12000);
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});p.on('dialog',d=>d.accept());
 await p.goto(base);await p.locator('#scenarioPreview .hex').first().waitFor();
 assert.equal(await p.getByText('Your next move matters',{exact:false}).count(),0);
 await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>!document.body.classList.contains('home-motion'));
 assert.equal(await p.locator('#homeMotionToggle').isDisabled(),true);
 await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>document.body.classList.contains('home-motion'));
 for(const name of ['stalingrad','britain','omaha']){
  await p.selectOption('#scenarioSelect',name);assert.equal(await p.locator('#scenarioSelect').inputValue(),name);
  await p.screenshot({path:path.join(temp,`${name}-home-mobile.png`),fullPage:true});
  await p.locator('#createSolo').click();assert.equal(await p.locator('#soloScenario').inputValue(),name);await p.locator('#startSolo').click();
  await p.waitForFunction(name=>state?.scenario.id===name&&!busy&&!lobbyMode,name);
  assert.equal(await p.evaluate(()=>document.body.classList.contains('home-motion')),false);
  const kind=name==='britain'?'fighter':name==='omaha'?'landing_craft':'squad';
  const id=await p.evaluate(kind=>state.units.find(u=>u.side===state.side&&u.kind===kind).id,kind);
  await p.evaluate(id=>focusMapUnit(state.units.find(u=>u.id===id)),id);
  await tap(p,p.locator(`#map .unit[data-unit-id="${id}"]`));
  assert.ok(await p.locator('#map .hex.move').count()>0);
  const top=await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top);
  await tap(p,p.locator(`#map .unit[data-unit-id="${id}"]`));
  assert.ok(Math.abs(await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top)-top)<2);
  await p.screenshot({path:path.join(temp,`${name}-battle-mobile.png`)});
  if(name==='britain'){
   assert.equal(await p.locator('#map .unit.us .portrait-fighter .atlas-viewport').count(),4);
   assert.match(await p.locator('#roleBrief').textContent(),/3 hexes per AP/);
   const revision=await p.evaluate(()=>state.revision);
   await tap(p,p.locator('#map .hex.move').first());await p.waitForFunction(rev=>!busy&&state.revision>rev,revision);
   assert.equal(await p.evaluate(id=>state.units.find(u=>u.id===id).ap,id),3);
   await tap(p,p.locator('#dadModeToggle'));await p.locator('#mobileBattleMenuClose').click();
   await p.evaluate(id=>focusMapUnit(state.units.find(u=>u.id===id)),id);await tap(p,p.locator(`#map .unit[data-unit-id="${id}"]`));
   assert.ok(await p.locator('#mobileOrderToggle .dad-unit-portrait .atlas-viewport').count()>0);
   await p.screenshot({path:path.join(temp,'britain-dad-mobile.png')});
   await tap(p,p.locator('#dadModeToggle'));await p.locator('#mobileBattleMenuClose').click();
  }
  if(name==='omaha')assert.equal(await p.locator('#map .portrait-landing_craft .atlas-viewport').count(),4);
  await tap(p,p.locator('#homeBattles'));await p.waitForFunction(()=>lobbyMode);
 }
 const desktop=await browser.newPage({viewport:{width:1440,height:1000}});desktop.on('pageerror',e=>errors.push(e.message));
 await desktop.goto(base);await desktop.locator('#scenarioPreview .hex').first().waitFor();
 for(const width of [320,390,1440]){await desktop.setViewportSize({width,height:1000});assert.ok(await desktop.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await desktop.screenshot({path:path.join(temp,`home-${width}.png`),fullPage:true});}
 await desktop.locator('#scenarioSelect').selectOption('britain');await desktop.locator('#createSolo').click();await desktop.locator('#startSolo').click();await desktop.waitForFunction(()=>state?.air_version&&!busy);
 await desktop.locator('#map .unit.us').first().click();await desktop.locator('#map .hex.move').first().hover();assert.equal(await desktop.locator('#map .flight-trail').count(),1);
 await desktop.screenshot({path:path.join(temp,'britain-desktop.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);console.log('Three campaigns, mobile map continuity, flight moves, original bitmap art, Dad mode, reduced motion, desktop flight preview and responsive home passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
