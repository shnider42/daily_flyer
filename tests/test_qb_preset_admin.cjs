/* Public preset editor integration; isolated temporary SQLite, never real presets. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qb-admin-test-'));
const port=8768,url=`http://127.0.0.1:${port}`;
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,DEFAULT_THEME:'qb_year_two',QB_PRESET_DB:path.join(directory,'presets.sqlite3')}
});
let browser;const errors=[];
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('qb-year-two-v1')));
async function screenshot(page,name){if(process.env.QB_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.QB_SCREENSHOT_DIR,name+'.png'),fullPage:true});}
async function changeAndWait(page,button,method,endpoint){
  const response=page.waitForResponse(r=>r.request().method()===method&&r.url().endsWith(endpoint));
  await page.click(button);const result=await response;await page.waitForFunction(()=>!document.getElementById('qb-preset-admin').hasAttribute('aria-busy'));
  return result;
}
(async()=>{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Flask startup timeout')),10000);
    server.stderr.on('data',data=>{if(String(data).includes('Running on')){clearTimeout(timer);resolve();}});
    server.on('error',reject);server.on('exit',code=>reject(new Error('Flask exited '+code)));
  });
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('year-two-detail-v1','full'));
  await page.goto(url+'/?preset_admin=1');
  await page.locator('#qa-label').waitFor();
  assert.ok((await page.locator('#qa-storage').innerText()).includes('only if that path'));
  assert.ok((await page.locator('#qb-preset-admin').innerText()).includes('intentionally public'));
  await page.fill('#qa-label','Custom slumps');await page.fill('#qa-heading','My two-player rating drops');
  await page.fill('#qa-count','2');await page.selectOption('#qa-f-metric','rating');
  await page.fill('#qa-note','A custom note, not a precomputed conclusion.');
  const before=(await (await page.request.get(url+'/api/qb-presets')).json()).revision;
  assert.equal((await changeAndWait(page,'#qa-preview','POST','/api/qb-presets/validate')).status(),200);
  assert.equal((await saved(page)).metric,'rating');assert.equal((await saved(page)).ids.length,2);
  assert.ok((await page.locator('#qb-film-story').innerText()).includes('passer rating'));
  assert.ok((await page.locator('#qb-film-story').innerText()).includes('custom note'));
  assert.equal((await (await page.request.get(url+'/api/qb-presets')).json()).revision,before,'Preview must not publish');
  assert.equal((await changeAndWait(page,'#qa-save','PUT','/api/qb-presets')).status(),200);
  assert.ok((await page.locator('#qa-status').innerText()).startsWith('Saved for everyone'));
  const visitor=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});visitor.on('pageerror',e=>errors.push(e.message));
  await visitor.addInitScript(()=>localStorage.setItem('year-two-detail-v1','full'));
  await visitor.goto(url);assert.ok(await visitor.locator('#qb-preset-admin').isHidden());
  assert.ok((await visitor.locator('[data-story="slumps"]').innerText()).includes('Custom slumps'));
  await visitor.locator('[data-story="slumps"]').tap();assert.equal((await saved(visitor)).metric,'rating');
  assert.equal((await saved(visitor)).ids.length,2,'Another browser uses the shared preset');
  await page.selectOption('#qa-slot','2');await page.fill('#qa-label','Tom and Drew');await page.fill('#qa-heading','My quarterbacks');
  await page.fill('#qa-player-search','Peyton');await page.uncheck('#qa-players [data-qb="MannPe00"]');
  await page.fill('#qa-player-search','Drew Brees');await page.check('#qa-players [data-qb="BreeDr00"]');
  await page.selectOption('#qa-f-view','year2');await page.selectOption('#qa-f-scale','symlog');
  await changeAndWait(page,'#qa-save','PUT','/api/qb-presets');
  await visitor.reload();await visitor.locator('[data-story="rivals"]').tap();
  assert.deepEqual(new Set((await saved(visitor)).ids),new Set(['BradTo00','BreeDr00']));
  assert.equal((await saved(visitor)).view,'year2');assert.equal((await saved(visitor)).scale,'symlog');
  // A slot can switch modes, and custom research values must not use a stale Hall caption.
  await page.selectOption('#qa-slot','0');await page.selectOption('#qa-mode','research');
  await page.fill('#qa-label','Keep the job');await page.fill('#qa-heading','Year-three jobs');
  await page.selectOption('#qa-r-outcome','job');await page.selectOption('#qa-r-metric','int_pct');
  await page.selectOption('#qa-r-x','delta');await page.uncheck('#qa-r-hof');
  await changeAndWait(page,'#qa-save','PUT','/api/qb-presets');
  await visitor.reload();await visitor.locator('[data-story="slumps"]').tap();
  assert.ok(await visitor.locator('#qb-research').isVisible());
  assert.equal(await visitor.locator('#qr-outcome').inputValue(),'job');assert.equal(await visitor.locator('#qr-x').inputValue(),'delta');
  assert.equal(await visitor.locator('#qr-hof').isChecked(),false);
  assert.ok((await visitor.locator('#qb-research-story').innerText()).includes('year three'));
  assert.ok(!(await visitor.locator('#qb-research-story').innerText()).includes('Hall inductions'));
  // Stored text must remain inert in both markup and client-rendered controls.
  await page.fill('#qa-label','<img src=x onerror=alert(1)>');await changeAndWait(page,'#qa-save','PUT','/api/qb-presets');
  await visitor.reload();assert.equal(await visitor.locator('[data-story="slumps"] img').count(),0);
  assert.ok((await visitor.locator('[data-story="slumps"]').innerText()).includes('<img'));
  // Conflicting editors cannot silently overwrite one another.
  const other=await browser.newPage();other.on('pageerror',e=>errors.push(e.message));await other.addInitScript(()=>localStorage.setItem('year-two-detail-v1','full'));
  await other.goto(url+'/?preset_admin=1');
  await page.fill('#qa-label','Editor A');await changeAndWait(page,'#qa-save','PUT','/api/qb-presets');
  await other.fill('#qa-label','Editor B');
  assert.equal((await changeAndWait(other,'#qa-save','PUT','/api/qb-presets')).status(),409);
  assert.equal(await other.locator('#qa-label').inputValue(),'Editor B');
  assert.ok((await other.locator('#qa-status').innerText()).includes('Someone else saved'));
  other.on('dialog',dialog=>dialog.accept());await changeAndWait(other,'#qa-reload','GET','/api/qb-presets');
  assert.equal(await other.locator('#qa-label').inputValue(),'Editor A');
  // Export/import is a draft operation until a successful Save.
  const downloadEvent=page.waitForEvent('download');await page.click('#qa-export');const download=await downloadEvent;
  const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.schema_version,1);
  await page.click('#qa-default');assert.equal(await page.locator('#qa-label').inputValue(),'Biggest slumps');
  const uploadResponse=page.waitForResponse(r=>r.url().endsWith('/api/qb-presets/validate'));
  await page.locator('#qa-import').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await uploadResponse;await page.waitForFunction(()=>!document.getElementById('qb-preset-admin').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#qa-label').inputValue(),'Editor A');
  assert.ok((await page.locator('#qa-status').innerText()).includes('draft only'));
  // Capture the active lab view without publishing it, including its group switches.
  await page.click('[data-mode="research"]');await page.selectOption('#qr-outcome','sb');
  await page.selectOption('#qr-metric','yards');await page.uncheck('#qr-field');await page.click('#qa-capture');
  assert.equal(await page.locator('#qa-mode').inputValue(),'research');assert.equal(await page.locator('#qa-r-outcome').inputValue(),'sb');
  assert.equal(await page.locator('#qa-r-metric').inputValue(),'yards');assert.equal(await page.locator('#qa-r-field').isChecked(),false);
  // Capture a pinned film view as explicit player IDs rather than a dynamic ranking.
  await page.click('[data-mode="film"]');await page.click('#qa-capture');
  assert.equal(await page.locator('#qa-mode').inputValue(),'film');assert.equal(await page.locator('#qa-selection').inputValue(),'fixed');
  await page.click('#qa-default');await changeAndWait(page,'#qa-save','PUT','/api/qb-presets');
  await page.selectOption('#qa-slot','2');await page.click('#qa-default');await changeAndWait(page,'#qa-save','PUT','/api/qb-presets');
  await visitor.reload();await visitor.click('#qb-open-preset-admin');
  for(const width of [320,390,768]){
    await visitor.setViewportSize({width,height:844});await visitor.waitForTimeout(200);
    assert.ok(await visitor.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'Editor overflow at '+width);
    await visitor.selectOption('#qa-slot','2');await visitor.locator('#qa-advanced>summary').evaluate(e=>e.parentElement.open=true);
    assert.ok(await visitor.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'Expanded editor overflow at '+width);
  }
  await visitor.setViewportSize({width:390,height:844});await visitor.waitForTimeout(200);await screenshot(visitor,'qb-v23-admin-mobile');
  await screenshot(page,'qb-v23-admin-desktop');
  await visitor.click('#qa-close');assert.ok(await visitor.locator('#qb-preset-admin').isHidden());
  await visitor.locator('[data-story="slumps"]').tap();assert.equal((await saved(visitor)).metric,'relative_anya');
  assert.deepEqual(errors,[]);
  console.log('PASS: public editor, preview isolation, shared saves in a second browser, metric/count/players/mode/outcome/group edits, safe text, conflicts, backups, capture, factory reset, 320/390px layouts, zero browser errors');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();server.kill();
  // Only the exact mkdtemp test directory is removed; no user preset file is used.
  fs.rmSync(directory,{recursive:true,force:true});
});
