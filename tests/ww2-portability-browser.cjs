// Cross-device and cookie/storage-free recovery against a disposable server.
const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-portability-')),base='http://127.0.0.1:8097';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8097','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'battles.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const errors=[];
 async function page(width=390,blocked=false){
  const p=await browser.newPage({viewport:{width,height:844},isMobile:width<500,hasTouch:width<500});
  p.setDefaultTimeout(20000);p.setDefaultNavigationTimeout(20000);
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  if(blocked)await p.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}}));
  await p.goto(base);return p;
 }
 async function start(p,scenario='village'){
  await p.locator('#createSolo').click();await p.locator('#soloScenario').selectOption(scenario);await p.locator('#startSolo').click();
  await p.locator('#game').waitFor({state:'visible'});await p.waitForFunction(()=>!busy&&state?.ready);
 }
 async function load(p,code){
  await p.locator('#recoveryCode').fill(code);await p.locator('#recoverForm button').click();
  await p.locator('#game').waitFor({state:'visible'});await p.waitForFunction(()=>!busy&&state?.ready);
 }
 async function checkpoint(p){
  await p.locator('#saveButton').click();await p.locator('#accessDialog').waitFor({state:'visible'});
  const code=await p.locator('#accessCode').inputValue();assert.match(code,/^SAVE-/);return code;
 }
 const phone=await page();await start(phone,'riverfront');
 console.log('Phone battle created');const original=await phone.evaluate(()=>state.code);
 await phone.locator('#transferButton').click();
 await phone.locator('#accessDialog').waitFor({state:'visible'});
 const transfer=await phone.locator('#accessCode').inputValue();
 await phone.screenshot({path:path.join(temp,'phone-transfer.png'),fullPage:true});
 await phone.locator('#closeAccess').click();
 const pc=await page(1280);await load(pc,transfer);
 assert.equal(await pc.evaluate(()=>state.code),original);console.log('PC transferred');
 await pc.locator('#end').click();await pc.locator('#playbackPanel').waitFor({state:'visible'});await pc.locator('#skipPlayback').click();
 await pc.waitForFunction(()=>state.round===2&&!busy);
 const before=await pc.evaluate(()=>state);
 const save=await checkpoint(pc);
 await pc.screenshot({path:path.join(temp,'desktop-save.png'),fullPage:true});
 await pc.locator('#closeAccess').click();
 await pc.locator('#end').click();await pc.locator('#playbackPanel').waitFor({state:'visible'});await pc.locator('#skipPlayback').click();
 // No cookies and no localStorage: restore into a fresh browser and save again.
 console.log('Snapshot saved; source advanced');const privatePhone=await page(320,true);await load(privatePhone,save);
 const restored=await privatePhone.evaluate(()=>state);
 assert.notEqual(restored.code,original);delete restored.code;delete before.code;assert.deepEqual(restored,before);
 assert.equal(await privatePhone.locator('#replayTurn').isVisible(),true);
 assert.equal(await privatePhone.locator('#playbackPanel').isVisible(),false);
 const secondSave=await checkpoint(privatePhone);
 await privatePhone.screenshot({path:path.join(temp,'private-phone-save.png'),fullPage:true});
 assert.equal(await privatePhone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await privatePhone.close();console.log('Storage-free save/restore passed');
 const fresh=await page(375);await load(fresh,secondSave);
 const again=await fresh.evaluate(()=>state);delete again.code;assert.deepEqual(again,before);
 // Independent solo creation leaves the original live match available locally.
 await phone.reload();await phone.locator('#game').waitFor({state:'visible'});await phone.waitForFunction(()=>!busy&&state?.round===3);
 await phone.locator('#leave').click();await start(phone);
 assert.notEqual(await phone.evaluate(()=>state.code),original);
 await phone.locator('#leave').click();assert.equal(await phone.locator('#sessionList button').count(),2);
 await phone.screenshot({path:path.join(temp,'phone-battles.png'),fullPage:true});
 await phone.locator('#sessionList button').filter({hasText:'Riverfront'}).click();
 await phone.waitForFunction(code=>state?.code===code&&!busy,original);
 assert.equal(await phone.evaluate(()=>state.round),3);
 await phone.reload();await phone.locator('#game').waitFor({state:'visible'});
 assert.equal(await phone.evaluate(()=>state.code),original);
 // Used and malformed codes leave the current saved battle intact.
 await fresh.locator('#leave').click();await fresh.locator('#recoveryCode').fill(transfer);await fresh.locator('#recoverForm button').click();
 await fresh.waitForFunction(()=>document.querySelector('#message').textContent.includes('already used'));
 assert.equal(await fresh.locator('#lobby').isVisible(),true);
 for(const width of [320,390,768,1280]){await fresh.setViewportSize({width,height:844});assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);
 console.log('PASS: phone-to-PC transfer, exact frozen checkpoint, storage-disabled private browser, save reuse after closing browser, independent battles, browser resume, used-code errors, mobile/desktop widths. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
