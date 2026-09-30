const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-dad-mode-')),base='http://127.0.0.1:8108';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8108','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const binary=process.env.CHROMIUM_EXECUTABLE_PATH,pack=binary?null:require('@sparticuz/chromium');
 browser=await chromium.launch({executablePath:binary||await pack.executablePath(),args:binary?['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']:pack.args.filter(a=>a!=='--single-process'),headless:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
 await p.goto(base);assert.equal(await p.locator('#dadModeHome').getAttribute('aria-pressed'),'false');await p.locator('#dadModeHome').click();
 await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy);
 const original=await p.evaluate(()=>JSON.stringify(state));
 await p.locator('#map .unit.us').first().hover();await p.locator('#battleTooltip .dad-unit-portrait').waitFor({state:'visible'});
 assert.ok((await p.locator('#battleTooltip .dad-unit-portrait').boundingBox()).width>=120);
 await p.screenshot({path:path.join(temp,'desktop-hover.png')});
 await p.reload();await p.locator('.saved-session').first().click();await p.waitForFunction(()=>state&&!busy);
 assert.equal(await p.locator('#dadModeToggle').getAttribute('aria-pressed'),'true');
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!!document.getElementById('mobileOrderDock'));
 await tap(p,p.locator('#map .unit.us').first());
 assert.equal(await p.locator('#mobileOrderToggle .dad-unit-portrait').count(),1);
 assert.ok(await p.locator('#dadOrdersOpen').isVisible());
 await p.locator('#mobileOrderToggle').click();await p.locator('#dadUnitDetails').waitFor({state:'visible'});assert.match(await p.locator('#dadUnitDetails h2').textContent(),/Rifle squad/);await p.locator('#dadUnitDetailsClose').click();
 const stability=await p.evaluate(()=>{const b=$('mapWrap').getBoundingClientRect();chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='leader'));const a=$('mapWrap').getBoundingClientRect();return [b.top,b.height,a.top,a.height];});assert.deepEqual(stability.slice(0,2),stability.slice(2));
 for(const [width,height] of [[390,844],[320,568],[844,390]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(100);
  await p.screenshot({path:path.join(temp,`phone-${width}.png`)});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok((await p.locator('#mapWrap').boundingBox()).height>=150);
  await p.locator('#dadOrdersOpen').click();await p.screenshot({path:path.join(temp,`orders-${width}.png`)});
  const cards=await p.locator('#dadOrders #orders button:visible').evaluateAll(bs=>bs.map(b=>({text:b.textContent,clip:b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1,height:b.clientHeight})));
  assert.ok(cards.every(b=>!b.clip&&b.height>=76),JSON.stringify(cards));await p.locator('#dadOrdersClose').click();
 }
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.smoke>0)));await tap(p,p.locator('#smoke'));
 assert.equal(await p.locator('#dadOrders').evaluate(e=>e.open),false);assert.ok(await p.locator('#map .smoke-choice').count()>0);await tap(p,p.locator('#smoke'));
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),original);
 await tap(p,p.locator('#unitStyleToggle'));await p.locator('#mobileBattleMenuClose').click();assert.equal(await p.locator('#map .unit-art').count(),0);assert.equal(await p.locator('#mobileOrderToggle .unit-art').count(),1);
 await tap(p,p.locator('#dadModeToggle'));await p.locator('#mobileBattleMenuClose').click();assert.equal(await p.locator('#mobileOrderBody #orders').count(),1);assert.equal(await p.locator('#dadOrdersOpen').isVisible(),false);
 await tap(p,p.locator('#dadModeToggle'));await p.locator('#mobileBattleMenuClose').click();
 await p.setViewportSize({width:1440,height:1000});await p.waitForFunction(()=>window.ww2Desktop.active&&!document.getElementById('mobileOrderDock'));
 assert.equal(await p.locator('#orders').count(),1);assert.equal(await p.locator('.desktop-orders #orders').count(),1);
 const guest=await browser.newPage();await guest.goto(base);assert.equal(await guest.locator('#dadModeHome').getAttribute('aria-pressed'),'false');
 await guest.locator('#dadModeHome').click();await guest.selectOption('#scenarioSelect','midway');await guest.locator('#createSolo').click();await guest.locator('#startSolo').click();await guest.waitForFunction(()=>state&&!busy&&state.naval_version);
 await guest.setViewportSize({width:390,height:844});await guest.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier')));
 assert.equal(await guest.locator('#mobileOrderToggle .unit-bitmap').count(),1);await guest.locator('#mobileOrderToggle').click();assert.match(await guest.locator('#dadUnitDetails h2').textContent(),/carrier/i);await guest.locator('#dadUnitDetailsClose').click();
 assert.deepEqual(errors,[]);console.log('Dad mode: persistence, isolated preferences, desktop hover, mobile close-ups/orders, stable map and restoration passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
