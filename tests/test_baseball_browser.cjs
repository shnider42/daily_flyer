/* Isolated integration run: no live/persistent preset database is touched. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'baseball-browser-')),port=8772,url=`http://127.0.0.1:${port}/?theme=baseball_year_two`;
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BASEBALL_PRESET_DB:path.join(folder,'baseball.sqlite3'),QB_PRESET_DB:path.join(folder,'football.sqlite3')}});
const errors=[];let browser;
const waitState=(page,key,value)=>page.waitForFunction(([key,value])=>window.BaseballApp?.getState()[key]===value,[key,value]);
async function story(page,id){await page.click(`[data-story="${id}"]`);await page.waitForFunction(id=>document.querySelector(`[data-story="${id}"]`).getAttribute('aria-pressed')==='true',id);}
async function screenshot(page,name){if(process.env.BASEBALL_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BASEBALL_SCREENSHOT_DIR,name+'.png'),fullPage:false});}
(async()=>{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Flask startup timed out')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});server.on('error',reject);});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/tmp/qb-chromium'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('.bb-dot').first().waitFor();
  assert.equal(await page.locator('.bb-dot').count(),8);
  assert.equal(await page.locator('#bb-metric option').count(),35);
  assert.ok((await page.locator('#bb-graph-note').innerText()).includes('below 300 PA'));
  assert.equal((await page.locator('.yt-sports [aria-current="page"]').innerText()).trim(),'Baseball\nHitters & pitchers');
  await screenshot(page,'baseball-desktop');
  const initial=await page.evaluate(()=>BaseballApp.getState());
  await story(page,'leaps');await waitState(page,'role','pitching');
  assert.equal(await page.locator('#bb-metric').inputValue(),'era');
  assert.equal(await page.locator('#bb-metric option').count(),39);
  const improvement=await page.evaluate(async()=>{const s=BaseballApp.getState(),p=await BaseballApp.loadRole(s.role);return s.ids.map(id=>BaseballResearch.pair(p.find(p=>p.id===id),s.metric).delta);});
  assert.equal(improvement.length,4);assert.ok(improvement.every(d=>d<0),'Lower ERA is an improvement');
  await page.click('#bb-undo');await waitState(page,'role','batting');assert.deepEqual(await page.evaluate(()=>BaseballApp.getState()),initial);
  await page.keyboard.press('Alt+Shift+Digit3');await page.waitForFunction(()=>document.querySelector('[data-story="boston"]').getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('.bb-chart-panel').count(),3);
  await page.locator('.bb-dot').first().focus();await page.keyboard.press('Enter');
  const focus=await page.evaluate(()=>JSON.parse(localStorage.getItem('baseball-year-two-v1')).focus);
  assert.ok(focus.id);assert.ok((await page.locator('#bb-inspect').innerText()).includes('Year 2'));
  await page.reload();await page.locator('.bb-dot').first().waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('baseball-year-two-v1')).focus.id),focus.id);
  await page.click('#bb-graph-settings>summary');await page.selectOption('#bb-scale','density');assert.ok((await page.locator('#bb-graph-note').innerText()).includes('NOT equal'));
  const downloadPromise=page.waitForEvent('download');await page.click('#bb-csv');const download=await downloadPromise;
  const csv=fs.readFileSync(await download.path(),'utf8');assert.equal(csv.split('\r\n').length,2853);assert.ok(csv.includes('creativecommons.org/licenses/by-sa/3.0'));
  await page.click('[data-mode="scan"]');assert.equal(await page.locator('#bb-scan-table tr').count(),35);
  await page.click('#bb-scan-table [data-stat="ops"]');await waitState(page,'mode','research');
  await page.selectOption('#bb-outcome','future');await page.click('#bb-model');await page.waitForFunction(()=>document.querySelector('#bb-model-result').textContent.includes('held-out'));
  assert.ok((await page.locator('#bb-model-result').innerText()).includes('Mean squared error'));
  await page.locator('#bb-research details').first().locator('summary').click();await page.click('#bb-bootstrap');await page.waitForFunction(()=>document.querySelector('#bb-uncertainty').textContent.includes('bootstrap interval'));
  await story(page,'hall');await page.click('#bb-model');await page.waitForFunction(()=>document.querySelector('#bb-model-result').textContent.includes('held-out'));
  assert.ok((await page.locator('#bb-model-result').innerText()).includes('Brier score'));
  await screenshot(page,'baseball-research');
  // A two-way player's missing second pitching season is not skipped over.
  await page.click('[data-role="pitching"]');await waitState(page,'role','pitching');await page.click('[data-mode="compare"]');
  await page.fill('#bb-search','Ohtani');await page.uncheck('#bb-qual2');await page.click('#bb-select');await page.click('[data-view="pair"]');
  assert.equal(await page.locator('.bb-dot').count(),1);assert.ok((await page.locator('#bb-graph-note').innerText()).includes('no year-two season record'));
  // Fresh mobile visitor starts with the selection and graph settings collapsed.
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(url);await mobile.locator('.bb-dot').first().waitFor();
  assert.equal(await mobile.locator('#bb-selection').getAttribute('open'),null);
  assert.equal(await mobile.locator('#bb-graph-settings').getAttribute('open'),null);
  await mobile.evaluate(()=>scrollTo(0,0));await screenshot(mobile,'baseball-mobile');
  const dot=mobile.locator('[data-series="ortizda01"] .bb-dot').nth(1);await dot.tap();const pin=await mobile.evaluate(()=>JSON.parse(localStorage.getItem('baseball-year-two-v1')).focus.id);
  const original=await mobile.locator('.bb-chart-panel svg').elementHandle();await mobile.setViewportSize({width:390,height:740});await mobile.waitForTimeout(200);
  assert.ok(await original.evaluate(e=>e.isConnected),'Height-only browser chrome changes must not rebuild the chart');
  for(const width of [320,390,768,1024]){await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(200);assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1));assert.equal(await mobile.evaluate(()=>JSON.parse(localStorage.getItem('baseball-year-two-v1')).focus.id),pin);}
  // Each sport restores its own view and data; baseball data isn't requested by football.
  await mobile.click('.yt-sports a[href="?theme=qb_year_two"]');await mobile.locator('#qb-chart .qb-dot').first().waitFor();
  assert.equal(await mobile.locator('#bb-app').count(),0);
  await mobile.click('.yt-sports a[href="?theme=baseball_year_two"]');await mobile.locator('.bb-dot').first().waitFor();assert.equal(await mobile.evaluate(()=>JSON.parse(localStorage.getItem('baseball-year-two-v1')).focus.id),pin);
  // Shared public editing, preview isolation, and concurrent-edit conflict handling.
  await page.goto(url+'&preset_admin=1');await page.locator('#bb-admin-field-role').waitFor();
  const second=await browser.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url+'&preset_admin=1');await second.locator('#bb-admin-field-role').waitFor();
  const before=await page.request.get(`http://127.0.0.1:${port}/api/baseball-presets`).then(r=>r.json());
  await page.fill('#bb-admin-label','<b>My OPS story</b>');await page.fill('#bb-admin-count','2');await page.click('#bb-admin-preview');
  await page.waitForFunction(()=>document.querySelector('#bb-story').textContent.includes('DRAFT PREVIEW'));
  assert.equal((await page.request.get(`http://127.0.0.1:${port}/api/baseball-presets`).then(r=>r.json())).revision,before.revision);
  assert.equal((await page.evaluate(()=>BaseballApp.getState())).ids.length,2);
  await page.click('#bb-back-editor');await page.click('#bb-admin-save');await page.waitForFunction(()=>document.querySelector('#bb-admin-status').textContent.startsWith('Saved all five'));
  assert.equal(await page.locator('[data-story="slumps"] b').count(),0);
  assert.ok((await page.locator('[data-story="slumps"]').innerText()).includes('<b>My OPS story</b>'));
  await second.fill('#bb-admin-label','Stale editor');await second.click('#bb-admin-save');await second.waitForFunction(()=>document.querySelector('#bb-admin-status').textContent.includes('Another editor'));
  assert.equal(await second.locator('#bb-admin-label').inputValue(),'Stale editor');
  const third=await browser.newPage();await third.goto(url);assert.ok((await third.locator('[data-story="slumps"]').innerText()).includes('My OPS story'));
  await page.selectOption('#bb-admin-slot','1');await page.selectOption('#bb-admin-field-metric','whip');await page.selectOption('#bb-admin-field-mode','research');await page.selectOption('#bb-admin-field-outcome','job');await page.click('#bb-admin-preview');
  await waitState(page,'mode','research');assert.equal(await page.locator('#bb-metric').inputValue(),'whip');
  await page.click('#bb-back-editor');await page.click('#bb-admin-capture');assert.equal(await page.locator('#bb-admin-selection').inputValue(),'fixed');
  const backupPromise=page.waitForEvent('download');await page.click('#bb-admin-export');const backup=await backupPromise;const backupPath=await backup.path();
  await page.click('#bb-admin-reset');await page.setInputFiles('#bb-admin-import',backupPath);await page.waitForFunction(()=>document.querySelector('#bb-admin-status').textContent.includes('Imported into this draft'));
  assert.equal(await page.locator('#bb-admin-field-metric').inputValue(),'whip');
  await page.setViewportSize({width:320,height:844});assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1));await page.locator('#bb-admin').scrollIntoViewIfNeeded();await screenshot(page,'baseball-admin-mobile');
  // Recover from an actual failed data request without a broken empty explorer.
  const failed=await browser.newPage();await failed.route('**/api/baseball-data/batting',route=>route.abort());await failed.goto(url);await failed.locator('#bb-retry').waitFor();await failed.unroute('**/api/baseball-data/batting');await failed.click('#bb-retry');await failed.locator('.bb-dot').first().waitFor();
  // Full-cohort selection and drawing must not silently stop at 25 or 100.
  const large=await browser.newPage({viewport:{width:1280,height:900}});large.on('pageerror',e=>errors.push(e.message));
  await large.goto(url);await large.locator('.bb-dot').first().waitFor();await large.click('#bb-select');
  assert.equal((await large.evaluate(()=>BaseballApp.getState())).ids.length,2852);
  assert.equal(await large.locator('#bb-charts [data-series]').count(),2852);
  await large.selectOption('#bb-display','100');assert.equal(await large.locator('#bb-charts [data-series]').count(),100);
  assert.equal((await large.evaluate(()=>BaseballApp.getState())).ids.length,2852);
  await large.reload();await large.locator('.bb-dot').first().waitFor();assert.equal((await large.evaluate(()=>BaseballApp.getState())).ids.length,2852);
  assert.equal(await large.locator('#bb-display').inputValue(),'100');
  await large.click('#bb-show-all');assert.equal(await large.locator('#bb-charts [data-series]').count(),2852);
  await large.click('[data-view="career"]');assert.equal(await large.locator('#bb-charts [data-series]').count(),2852);
  await large.click('[data-role="pitching"]');await waitState(large,'role','pitching');await large.click('#bb-select');
  assert.equal((await large.evaluate(()=>BaseballApp.getState())).ids.length,3802);
  assert.equal(await large.locator('#bb-charts [data-series]').count(),3802);
  await large.close();
  assert.deepEqual(errors,[]);console.log('Baseball desktop/mobile, models, missing seasons, CSVs, sport persistence, presets, conflicts and recovery passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();fs.rmSync(folder,{recursive:true,force:true});});
