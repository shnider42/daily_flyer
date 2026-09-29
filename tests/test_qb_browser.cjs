/* Optional browser regression check. Requires Playwright and a Chromium install.
   NODE_PATH=/path/to/node_modules CHROMIUM_EXECUTABLE=/path/to/chromium node tests/test_qb_browser.cjs
   QB_SCREENSHOT_DIR optionally captures review screenshots (outside the repo).
*/
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const path=require('node:path');
const port=8767;
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,DEFAULT_THEME:'qb_year_two'}
});
let browser;
const errors=[];
async function screenshot(page,name){if(process.env.QB_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.QB_SCREENSHOT_DIR,name+'.png'),fullPage:true});}
const focus=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('qb-year-two-v1')).focus);
async function pinned(page,id){
  assert.equal(await focus(page),id);
  assert.equal(await page.locator(`[data-series="${id}"]`).getAttribute('style'),'opacity: 1;');
  assert.ok((await page.locator('#qb-pinned-name').innerText()).includes('pinned'));
}
(async()=>{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Flask startup timeout')),10000);
    server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});
    server.on('error',reject);server.on('exit',code=>reject(new Error('Flask exited '+code)));
  });
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(`http://127.0.0.1:${port}`);
  await mobile.locator('#qb-chart .qb-dot').first().waitFor();
  assert.equal(await mobile.locator('select:visible').count(),1,'Mobile must not expose a wall of settings');
  assert.equal(await mobile.locator('#qb-settings').getAttribute('open'),null);
  assert.ok(await mobile.locator('#qb-chart').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
  assert.equal(await mobile.locator('[data-view="year2"]').getAttribute('aria-pressed'),'true');
  assert.equal(await mobile.locator('#qb-chart .qb-dot').count(),8,'Fresh visitors see only the first two seasons of four example QBs');
  const rawSummary=await mobile.locator('#qb-summary').innerText(),rawTable=await mobile.locator('#qb-table').innerText();
  await screenshot(mobile,'qb-v21-mobile');
  const young=mobile.locator('[data-series="YounSt00"] .qb-dot').nth(1);
  await young.scrollIntoViewIfNeeded();
  const topBefore=await mobile.locator('#qb-charts').evaluate(e=>e.getBoundingClientRect().top+scrollY);
  await young.tap();await pinned(mobile,'YounSt00');
  assert.equal(await mobile.locator('#qb-charts').evaluate(e=>e.getBoundingClientRect().top+scrollY),topBefore,'Pinning must not move the graph');
  const detail=await mobile.locator('#qb-tooltip').innerText();
  assert.ok(detail.includes('Year 1 (1986)'));
  assert.ok(detail.includes('Year 2 (1987)'));
  assert.ok(detail.includes('Improved in year two'));
  const originalChart=await mobile.locator('#qb-chart').elementHandle();
  await mobile.setViewportSize({width:390,height:740});await mobile.waitForTimeout(220);
  assert.ok(await originalChart.evaluate(e=>e.isConnected),'Browser chrome height changes must not redraw');
  await pinned(mobile,'YounSt00');assert.equal(await mobile.locator('#qb-tooltip').innerText(),detail);
  const session=await mobile.context().newCDPSession(mobile);
  const scrollBefore=await mobile.evaluate(()=>scrollY);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:185,y:550}]});
  for(let y=510;y>=310;y-=40){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:185,y}]});await mobile.waitForTimeout(20);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(180);
  assert.notEqual(await mobile.evaluate(()=>scrollY),scrollBefore,'Actual touch swipe must scroll');
  await pinned(mobile,'YounSt00');assert.equal(await mobile.locator('#qb-tooltip').innerText(),detail);
  // A drag ending over a different line must not replace the pin.
  const other=mobile.locator('[data-series="MannPe00"] .qb-line-hit').first();
  await other.dispatchEvent('pointerdown',{clientX:10,clientY:10,pointerId:1,pointerType:'touch'});
  await other.dispatchEvent('pointermove',{clientX:60,clientY:60,pointerId:1,pointerType:'touch'});
  await other.dispatchEvent('click',{detail:1});await pinned(mobile,'YounSt00');
  await mobile.click('[data-quick="spread"]');
  assert.equal(await mobile.locator('#qb-chart').getAttribute('data-scale'),'density');
  assert.ok((await mobile.locator('#qb-display-note').innerText()).includes('NOT equal'));
  await pinned(mobile,'YounSt00');await screenshot(mobile,'qb-v21-spread');
  await mobile.click('[data-quick="zoom"]');
  assert.equal(await mobile.locator('#qb-chart').getAttribute('data-scale'),'linear');
  assert.ok((await mobile.locator('#qb-display-note').innerText()).includes('clipped'));
  await mobile.click('[data-quick="zoom"]');
  await mobile.click('[data-quick="separate"]');
  assert.equal(await mobile.locator('.qb-chart-panel').count(),4);
  assert.equal(new Set(await mobile.locator('.qb-chart-panel svg').evaluateAll(es=>es.map(e=>e.dataset.yLow+':'+e.dataset.yHigh))).size,1);
  await pinned(mobile,'YounSt00');
  for(const width of [320,390,768,1024]){
    await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(220);
    await pinned(mobile,'YounSt00');assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1));
  }
  await mobile.setViewportSize({width:390,height:844});await mobile.waitForTimeout(220);
  await mobile.reload();await mobile.locator('#qb-chart .qb-dot').first().waitFor();await pinned(mobile,'YounSt00');
  assert.ok((await mobile.locator('#qb-tooltip').innerText()).includes('1987'));
  await mobile.click('#qb-clear-focus');assert.equal(await focus(mobile),'');
  await mobile.locator('[data-series="MannPe00"] .qb-line-hit').first().tap();await pinned(mobile,'MannPe00');
  await mobile.click('#qb-clear-focus');
  const dot=mobile.locator('[data-series="BradTo00"] .qb-dot').first();await dot.focus();await dot.press('Enter');await pinned(mobile,'BradTo00');
  await mobile.click('#qb-settings>summary');await mobile.selectOption('#qb-normalize','delta');
  assert.equal(await mobile.locator('#qb-summary').innerText(),rawSummary);assert.equal(await mobile.locator('#qb-table').innerText(),rawTable);
  const downloadPromise=mobile.waitForEvent('download');await mobile.click('#qb-export');const download=await downloadPromise;
  const csv=require('node:fs').readFileSync(await download.path(),'utf8');assert.equal(csv.split('\r\n').length,266);
  assert.ok(csv.includes('"relative_anya"'));
  const desktop=await browser.newPage({viewport:{width:1440,height:1000}});desktop.on('pageerror',e=>errors.push(e.message));
  await desktop.goto(`http://127.0.0.1:${port}`);await desktop.locator('#qb-chart .qb-dot').first().waitFor();
  assert.equal(await desktop.locator('#qb-settings').getAttribute('open'),null);
  await desktop.locator('#qb-settings>summary').click();
  await desktop.locator('[data-series="YounSt00"] .qb-dot').nth(1).hover();assert.equal(await focus(desktop),'','Mouse hover is not a pin');
  await desktop.locator('[data-series="YounSt00"] .qb-dot').nth(1).click();await pinned(desktop,'YounSt00');
  await desktop.locator('[data-series="BradTo00"] .qb-dot').first().hover();await pinned(desktop,'YounSt00');
  await desktop.selectOption('#qb-colors','hof');assert.equal(await desktop.locator('[data-series="BradTo00"] .qb-trace').first().getAttribute('stroke-dasharray'),'5 3');
  await desktop.selectOption('#qb-scale','log');assert.equal(await desktop.locator('#qb-chart').getAttribute('data-scale'),'symlog');
  await screenshot(desktop,'qb-v21-desktop');
  await desktop.click('#qb-select-all');await desktop.click('[data-quick="spread"]');
  assert.ok((await desktop.locator('#qb-selected-count').innerText()).includes('265'));
  assert.ok(await desktop.locator('#qb-chart').evaluate(e=>!e.innerHTML.includes('NaN')));
  await desktop.click('[data-quick="separate"]');assert.equal(await desktop.locator('.qb-chart-panel').count(),265);
  await desktop.click('#qb-clear');assert.equal(await focus(desktop),'');assert.ok(await desktop.locator('#qb-empty').isVisible());
  await mobile.click('[data-mode="research"]');
  assert.equal(await mobile.locator('#qr-chart [data-qb]').count(),112);
  assert.ok((await mobile.locator('#qr-model').innerText()).includes('Fewer than five'));
  const stats=await mobile.locator('#qr-stats').innerText();
  await mobile.uncheck('#qr-field');assert.ok(await mobile.locator('#qr-chart [data-qb]').count()<112);
  assert.equal(await mobile.locator('#qr-stats').innerText(),stats);
  await mobile.check('#qr-field');
  await mobile.locator('#qr-chart [data-qb]').first().focus();
  const inspected=await mobile.locator('#qr-inspect').innerText();
  await mobile.evaluate(()=>scrollBy(0,200));assert.equal(await mobile.locator('#qr-inspect').innerText(),inspected);
  await mobile.locator('#qr-scenario>summary').click();await mobile.click('#qr-predict');
  assert.ok((await mobile.locator('#qr-prediction').innerText()).includes('estimated probability'));
  for(const outcome of ['sb','job','efficiency']){
    await mobile.selectOption('#qr-outcome',outcome);
    assert.ok(await mobile.locator('#qr-chart [data-qb]').count()>100);
    assert.ok(await mobile.locator('#qr-chart').evaluate(e=>!e.innerHTML.includes('NaN')));
  }
  await mobile.locator('.qb-research-options>summary').first().click();
  await mobile.selectOption('#qr-era','2020');assert.equal(await mobile.locator('#qr-chart [data-qb]').count(),0);
  await mobile.selectOption('#qr-era','all');await mobile.selectOption('#qr-outcome','sb');
  for(const width of [320,390,768,1024]){
    await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(200);
    assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'Research page overflow at '+width);
  }
  await mobile.setViewportSize({width:390,height:844});await mobile.waitForTimeout(220);assert.ok(await mobile.locator('#qr-chart').evaluate(e=>e.clientWidth<=innerWidth));await screenshot(mobile,'qb-v21-research-mobile');
  await desktop.click('[data-mode="research"]');await screenshot(desktop,'qb-v21-research-desktop');
  await mobile.click('[data-mode="film"]');await pinned(mobile,'BradTo00');
  // Reading a later season must still anchor the inspector to year one and two.
  await mobile.click('[data-view="performance"]');
  await mobile.selectOption('#qb-window','all');
  await mobile.locator('[data-series="BradTo00"] .qb-dot').last().tap();
  assert.ok((await mobile.locator('#qb-tooltip').innerText()).includes('Year 2 (2002)'));
  await mobile.reload();
  assert.equal(await mobile.locator('[data-view="performance"]').getAttribute('aria-pressed'),'true','A returning visitor keeps their chosen view');
  await pinned(mobile,'BradTo00');
  await mobile.selectOption('#qb-metric','int_pct');
  assert.ok((await mobile.locator('#qb-chart-help').innerText()).includes('Lower is better'));
  await mobile.click('#qb-open-research');
  assert.ok(await mobile.locator('#qb-research').isVisible());
  assert.equal(await mobile.locator('#qr-metric').inputValue(),'int_pct','Research handoff carries the film-room measure');
  assert.ok((await mobile.locator('#qr-study-context').innerText()).includes('do not limit'));
  assert.ok((await mobile.locator('#qr-plot-help').innerText()).includes('not better performance'));
  await mobile.locator('.qb-research-options>summary').first().click();
  await mobile.selectOption('#qr-x','delta');
  assert.ok((await mobile.locator('#qr-question').innerText()).includes('change from year one to year two'));
  await mobile.selectOption('#qr-x','a');
  assert.ok((await mobile.locator('#qr-answer').innerText()).includes('year-one baseline'));
  await mobile.selectOption('#qr-outcome','efficiency');
  assert.ok((await mobile.locator('#qr-answer').innerText()).includes('incremental prediction test is available'));
  await mobile.selectOption('#qr-era','2020');
  assert.ok((await mobile.locator('#qr-answer').innerText()).includes('not have enough'));
  await mobile.click('[data-mode="film"]');await pinned(mobile,'BradTo00');
  assert.deepEqual(errors,[]);
  console.log('PASS: touch pin, native swipe, drag guard, height-only resize, rotation/reload, keyboard, mobile controls, density/zoom, shared axes, raw CSV, desktop hover, 265 QBs, research outcomes/group toggles/scenarios, mobile lab widths, mode switching, zero browser errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
