/* Fresh-visitor + state-preservation tests for both sports. No persistent DB is used. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'year-two-levels-')),port=8774,base=`http://127.0.0.1:${port}/?classic=1`;
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BASEBALL_PRESET_DB:path.join(folder,'bb.sqlite3'),QB_PRESET_DB:path.join(folder,'qb.sqlite3')}});
let browser;const errors=[];
const level=(page,l)=>page.click(`#yt-levels [data-detail-level="${l}"]`);
const snapshot=page=>page.evaluate(()=>{
  if(window.BaseballApp)return JSON.parse(localStorage.getItem('baseball-year-two-v1'));
  const film={},research={};document.dispatchEvent(new CustomEvent('qb:film-snapshot',{detail:film}));document.dispatchEvent(new CustomEvent('qb:research-snapshot',{detail:research}));return {film:film.value,research:research.value};
});
const visible=(page,selector)=>page.locator(selector).isVisible();
(async()=>{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timed out')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});server.on('error',reject);});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/tmp/qb-chromium'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'&theme=baseball_year_two');await page.locator('.bb-dot').first().waitFor();
  assert.equal(await page.locator('#bb-app').getAttribute('data-detail'),'simple');
  assert.ok(!await visible(page,'.bb-sidebar'));assert.ok(!await visible(page,'#bb-csv'));
  assert.ok(await visible(page,'#yt-bb-compare'));assert.match(await page.locator('#yt-bb-compare').innerText(),/players in this chart selection/);
  assert.match(await page.locator('#bb-graph-note').innerText(),/below 300 PA/);
  await page.locator('.bb-dot').first().click();let before=await snapshot(page);
  await level(page,'guided');assert.ok(await visible(page,'.bb-sidebar'));assert.ok(await visible(page,'#bb-metric'));assert.ok(!await visible(page,'#bb-graph-settings'));
  assert.deepEqual(await snapshot(page),before);
  await level(page,'full');assert.ok(await visible(page,'#bb-graph-settings'));assert.ok(await visible(page,'#bb-csv'));assert.ok(!await visible(page,'#yt-bb-compare'));assert.deepEqual(await snapshot(page),before);
  await page.click('#bb-graph-settings>summary');await page.selectOption('#bb-normalize','zscore');await page.selectOption('#bb-scale','density');
  before=await snapshot(page);await level(page,'simple');assert.deepEqual(await snapshot(page),before);
  assert.match(await page.locator('#yt-bb-compare').innerText(),/own career/);assert.match(await page.locator('#yt-bb-compare').innerText(),/not equal numerical changes/);
  await page.click('[data-story="leaps"]');await page.waitForFunction(()=>BaseballApp.getState().role==='pitching'&&document.querySelector('[data-story="leaps"]').getAttribute('aria-pressed')==='true');
  assert.match(await page.locator('#yt-bb-compare').innerText(),/4 improved/);assert.match(await page.locator('#yt-bb-compare').innerText(),/Down is an improvement/);
  before=await snapshot(page);await level(page,'guided');await level(page,'simple');assert.deepEqual(await snapshot(page),before);assert.ok(await visible(page,'#bb-story'));await page.click('#bb-undo');
  await page.click('[data-mode="scan"]');assert.equal(await page.locator('#bb-scan-picks button').count(),3);assert.ok(!await visible(page,'#bb-scan-table'));
  before=await snapshot(page);await level(page,'full');assert.ok(await visible(page,'#bb-scan-table'));await level(page,'simple');assert.deepEqual(await snapshot(page),before);
  await page.locator('#bb-scan-picks button').first().click();assert.ok(await visible(page,'#yt-bb-research'));
  await page.click('#bb-model');await page.waitForFunction(()=>document.querySelector('#bb-model-result').textContent.includes('held-out'));
  const result=await page.locator('#bb-model-result').textContent();before=await snapshot(page);
  assert.ok(!await visible(page,'#bb-model-result table'));await level(page,'full');assert.ok(await visible(page,'#bb-model-result table'));await level(page,'simple');assert.deepEqual(await snapshot(page),before);assert.equal(await page.locator('#bb-model-result').textContent(),result);
  // An admin draft remains fully editable even when ordinary controls are hidden.
  await page.click('#bb-admin-open');await page.locator('#bb-admin-field-metric').waitFor();await page.fill('#bb-admin-label','Draft survives detail change');await level(page,'guided');await level(page,'simple');assert.equal(await page.locator('#bb-admin-label').inputValue(),'Draft survives detail change');
  await page.click('#bb-admin-close');await level(page,'guided');await page.reload();await page.locator('.bb-dot,#bb-scatter svg').first().waitFor();assert.equal(await page.locator('#bb-app').getAttribute('data-detail'),'guided');
  await page.click('.yt-sports a[href*="theme=qb_year_two"]');await page.locator('#qb-chart .qb-dot').first().waitFor();assert.equal(await page.locator('#qb-app').getAttribute('data-detail'),'guided');
  await page.locator('#qb-chart .qb-dot').first().click();before=await snapshot(page);await level(page,'simple');await level(page,'full');assert.deepEqual(await snapshot(page),before);
  assert.ok(await visible(page,'#qb-export'));await level(page,'simple');assert.ok(!await visible(page,'#qb-export'));assert.ok(!await visible(page,'.qb-sidebar'));assert.ok(await visible(page,'#yt-qb-film'));
  await page.click('[data-story="hall"]');await page.locator('#qr-chart [data-qb]').first().waitFor();assert.ok(await visible(page,'#yt-qb-research'));assert.match(await page.locator('#yt-qb-research').innerText(),/test|not enough/i);
  before=await snapshot(page);await level(page,'full');assert.ok(await visible(page,'#qr-stats'));await level(page,'guided');assert.deepEqual(await snapshot(page),before);assert.ok(!await visible(page,'#qr-stats'));assert.ok(await visible(page,'#qb-research-story'));
  await page.click('#qb-story-undo');assert.ok(await visible(page,'#qb-film'));await level(page,'simple');
  // Phone and narrow-screen views keep the large top control usable without sideways scrolling.
  for(const sport of ['qb_year_two','baseball_year_two']){
    await page.goto(base+'&theme='+sport);await page.locator(sport==='qb_year_two'?'#qb-chart .qb-dot':'#bb-scatter svg,.bb-dot').first().waitFor();
    assert.equal(await page.locator('.yt-level-heading strong').evaluate(e=>getComputedStyle(e).color),'rgb(24, 63, 55)','The level heading must remain dark on its light background');
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const l of ['simple','guided','full']){await level(page,l);await page.waitForTimeout(180);assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),`${sport}/${width}/${l} overflows`);}}
  }
  await page.setViewportSize({width:390,height:844});await level(page,'simple');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/year-two-simple-mobile.png'});
  await page.locator('#yt-bb-research').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/year-two-simple-reading.png'});
  const fresh=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});fresh.on('pageerror',e=>errors.push(e.message));await fresh.goto(base+'&theme=baseball_year_two');await fresh.locator('.bb-dot').first().waitFor();assert.equal(await fresh.locator('#bb-app').getAttribute('data-detail'),'simple');
  await fresh.locator('#yt-levels [data-detail-level=guided]').focus();await fresh.keyboard.press('Enter');assert.equal(await fresh.locator('#bb-app').getAttribute('data-detail'),'guided');
  await fresh.click('#bb-selection>summary');await fresh.click('#bb-clear');await level(fresh,'simple');assert.match(await fresh.locator('#yt-bb-compare').innerText(),/No selected players/);
  await fresh.click('[data-mode=scan]');await fresh.selectOption('#bb-scan-target','future');assert.match(await fresh.locator('#yt-bb-scan').innerText(),/not testing one shared target/);
  await fresh.locator('#bb-scan-picks button').first().click();assert.match(await fresh.locator('#bb-outcome-note').innerText(),/survivors/);
  const blocked=await browser.newPage();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));blocked.on('pageerror',e=>errors.push(e.message));await blocked.goto(base+'&theme=qb_year_two');await blocked.locator('#qb-chart .qb-dot').first().waitFor();await level(blocked,'full');assert.equal(await blocked.locator('#qb-app').getAttribute('data-detail'),'full');
  assert.deepEqual(errors,[]);console.log('PASS: three levels, live explanations, state/pin/story/model/admin preservation, scan, cross-sport persistence, responsive layout and blocked storage');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
