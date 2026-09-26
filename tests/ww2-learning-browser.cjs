const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-learning-')),base='http://127.0.0.1:8100';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8100','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const errors=[],p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(10000);
 await p.goto(base);await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy);
 const original=await p.evaluate(()=>({code:session.code,revision:state.revision,token:session.token}));
 await p.locator('#leave').click();await p.locator('#learnStart').click();await p.waitForFunction(()=>state&&!busy&&document.body.classList.contains('simple-play'));
 assert.notEqual(await p.evaluate(()=>session.code),original.code);assert.equal(await p.locator('#tutorialCoach').isVisible(),true);
 await p.locator('#lessonNext').click();await p.locator('#map .unit.us').first().click();
 assert.match(await p.locator('#lessonTitle').textContent(),/Move/);assert.equal(await p.locator('#mobileOrderToggle').getAttribute('aria-expanded'),'true');
 assert.match(await p.locator('#mobileOrderToggle').textContent(),/2 AP/);
 assert.ok((await p.locator('#mobileOrderBody').boundingBox()).height<=844*.28+1);
 assert.equal(await p.locator('#unitMechanics').isVisible(),false);
 await p.locator('#smoke').click();assert.equal(await p.locator('#mobileOrderToggle').getAttribute('aria-expanded'),'false');
 await p.locator('#mobileOrderToggle').click();await p.locator('#smoke').click();
 await p.locator('#map .hex.move').first().click();await p.waitForFunction(()=>!busy&&state.revision===1);
 assert.match(await p.locator('#lessonTitle').textContent(),/Spend actions/);
 assert.equal(await p.locator('#mobileOrderToggle').getAttribute('aria-expanded'),'false');
 const before=await p.evaluate(()=>JSON.stringify(state));await p.locator('#simpleToggle').click();await p.locator('#simpleToggle').click();
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);
 await p.reload();await p.waitForFunction(()=>state&&!busy);assert.equal(await p.locator('#simpleToggle').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#tutorialCoach').isVisible(),true);
 // Browser automation clicks auto-scroll targets; invoke the same selection handler to
 // measure only game-caused movement, including preserved manual pan in enlarged view.
 await p.locator('#mapWrap').scrollIntoViewIfNeeded();
 const stability=await p.evaluate(()=>{
  const wrap=$('mapWrap'),read=()=>{const r=wrap.getBoundingClientRect();return [r.top,r.left,wrap.scrollLeft,wrap.scrollTop];};
  const checks=[],units=state.units.filter(u=>u.side===state.side);
  let before=read();chooseUnit(units[0]);checks.push([before,read()]);
  before=read();chooseUnit(units[1]);checks.push([before,read()]);
  before=read();$('mobileOrderToggle').click();checks.push([before,read()]);
  $('zoom').click();wrap.scrollTo(65,90);before=read();chooseUnit(units[2]);checks.push([before,read()]);
  before=read();render();checks.push([before,read()]);
  $('zoom').click();return checks;
 });
 for(const [before,after] of stability)before.forEach((value,i)=>assert.ok(Math.abs(value-after[i])<=1,`Map moved: ${before} -> ${after}`));
 await p.locator('#roster button').nth(1).click();
 await p.screenshot({path:path.join(temp,'mobile.png'),fullPage:true});
 for(const width of [1280,390,1440,320,844,390]){
  console.log('Checking width',width);
  await p.setViewportSize({width,height:width===844?390:844});
  await p.waitForFunction(w=>w>=1100?window.ww2Desktop.active&&!document.getElementById('mobileOrderDock'):!!document.getElementById('mobileOrderDock'),width);
  for(const id of ['orders','end','nextUnit','unitMechanics'])assert.equal(await p.locator('#'+id).count(),1);
  assert.equal(await p.locator('#end').isVisible(),true);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await p.locator('#end').click();await p.locator('#playbackPanel').waitFor({state:'visible'});await p.locator('#pausePlayback').click();
 assert.equal(await p.locator('#mobileOrderDock').isVisible(),false);
 await p.setViewportSize({width:1280,height:900});await p.waitForFunction(()=>window.ww2Desktop.active);
 assert.equal(await p.locator('#desktopActionDock').isVisible(),false);
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!window.ww2Desktop.active);
 await p.locator('#skipPlayback').click();assert.equal(await p.locator('#end').isVisible(),true);
 const revision=await p.evaluate(()=>state.revision);await p.locator('#lessonExit').click();assert.equal(await p.evaluate(()=>state.revision),revision);
 await p.setViewportSize({width:1280,height:900});await p.screenshot({path:path.join(temp,'desktop.png'),fullPage:true});
 const old=await (await fetch(base+'/api/match/'+original.code,{headers:{Authorization:'Bearer '+original.token}})).json();assert.equal(old.revision,original.revision);
 const privatePage=await browser.newPage({viewport:{width:390,height:844}});await privatePage.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('Storage disabled');};Storage.prototype.getItem=()=>{throw Error('Storage disabled');};});
 await privatePage.goto(base);await privatePage.locator('#learnStart').click();await privatePage.locator('#tutorialCoach').waitFor({state:'visible'});await privatePage.locator('#simpleToggle').click();
 assert.deepEqual(errors,[]);console.log('Learning/mobile/simple UI passed. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill('SIGTERM');});
