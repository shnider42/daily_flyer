/* Delete the server database to exercise actual redeploy-style recovery. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'preset-recovery-')),port=8778,base=`http://127.0.0.1:${port}`;
const server=spawn('python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BASEBALL_PRESET_DB:path.join(folder,'baseball.sqlite3'),QB_PRESET_DB:path.join(folder,'qb.sqlite3')}});
let browser;const errors=[];
(async()=>{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timed out')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/tmp/dsl-chromium'});
 for(const [sport,prefix,panel,ready] of [['baseball','bb-admin','bb-admin','bb-admin-field-role'],['qb','qa','qb-preset-admin','qa-label']]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const url=base+`/?theme=${sport}_year_two&preset_admin=1`;
  if(sport==='baseball')await page.route('**/api/baseball-data/batting',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
  await page.goto(url);await page.locator('#'+ready).waitFor();
  if(sport==='baseball'){await page.locator('#bb-workspace').waitFor({state:'visible'});await page.unroute('**/api/baseball-data/batting');}
  await page.fill(`#${prefix}-label`,'Keep this across deploys');await page.click(`#${prefix}-save`);
  await page.waitForFunction(prefix=>document.getElementById(prefix+'-status').textContent.startsWith('Saved'),prefix);
  await page.fill(`#${prefix}-note`,'Unfinished editor draft');await page.reload();await page.locator('#'+ready).waitFor();
  await page.click(`#${panel} [data-backup=draft]`);
  await page.waitForFunction(prefix=>document.getElementById(prefix+'-note').value==='Unfinished editor draft',prefix);
  await page.reload();await page.locator('#'+ready).waitFor();
  fs.unlinkSync(path.join(folder,sport+'.sqlite3'));
  await page.reload();await page.locator('#'+ready).waitFor();
  assert.notEqual(await page.inputValue(`#${prefix}-label`),'Keep this across deploys');
  await page.click(`#${panel} [data-backup=saved]`);
  await page.waitForFunction(prefix=>document.getElementById(prefix+'-label').value==='Keep this across deploys',prefix);
  const before=await page.request.get(base+`/api/${sport}-presets`).then(r=>r.json());assert.equal(before.source,'factory','Restore must not silently publish');
  await page.click(`#${prefix}-save`);await page.waitForFunction(prefix=>document.getElementById(prefix+'-status').textContent.startsWith('Saved'),prefix);
  assert.equal((await page.request.get(base+`/api/${sport}-presets`).then(r=>r.json())).presets[0].label,'Keep this across deploys');
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: both sports retain browser drafts and restore saved presets after real server database loss, without automatic public writes.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
