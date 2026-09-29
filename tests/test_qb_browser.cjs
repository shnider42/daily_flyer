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
  assert.equal(await mobile.locator('select:visible').count(),2,'Mobile must not expose a wall of settings');
  assert.equal(await mobile.locator('#qb-settings').getAttribute('open'),null);
  assert.ok(await mobile.locator('#qb-chart').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
  const rawSummary=await mobile.locator('#qb-summary').innerText(),rawTable=await mobile.locator('#qb-table').innerText();
  await screenshot(mobile,'qb-v12-mobile');
  const young=mobile.locator('[data-series="YounSt00"] .qb-dot').nth(1);
  await young.scrollIntoViewIfNeeded();
  const topBefore=await mobile.locator('#qb-charts').evaluate(e=>e.getBoundingClientRect().top+scrollY);
  await young.tap();await pinned(mobile,'YounSt00');
  assert.equal(await mobile.locator('#qb-charts').evaluate(e=>e.getBoundingClientRect().top+scrollY),topBefore,'Pinning must not move the graph');
  const detail=await mobile.locator('#qb-tooltip').innerText();
  assert.ok(detail.includes('1987'));
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
  await pinned(mobile,'YounSt00');await screenshot(mobile,'qb-v12-spread');
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
  assert.equal(await desktop.locator('#qb-settings').getAttribute('open'),'');
  await desktop.locator('[data-series="YounSt00"] .qb-dot').nth(1).hover();assert.equal(await focus(desktop),'','Mouse hover is not a pin');
  await desktop.locator('[data-series="YounSt00"] .qb-dot').nth(1).click();await pinned(desktop,'YounSt00');
  await desktop.locator('[data-series="BradTo00"] .qb-dot').first().hover();await pinned(desktop,'YounSt00');
  await desktop.selectOption('#qb-colors','hof');assert.equal(await desktop.locator('[data-series="BradTo00"] .qb-trace').first().getAttribute('stroke-dasharray'),'5 3');
  await desktop.selectOption('#qb-scale','log');assert.equal(await desktop.locator('#qb-chart').getAttribute('data-scale'),'symlog');
  await screenshot(desktop,'qb-v12-desktop');
  await desktop.click('#qb-select-all');await desktop.click('[data-quick="spread"]');
  assert.ok((await desktop.locator('#qb-selected-count').innerText()).includes('265'));
  assert.ok(await desktop.locator('#qb-chart').evaluate(e=>!e.innerHTML.includes('NaN')));
  await desktop.click('[data-quick="separate"]');assert.equal(await desktop.locator('.qb-chart-panel').count(),265);
  await desktop.click('#qb-clear');assert.equal(await focus(desktop),'');assert.ok(await desktop.locator('#qb-empty').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: touch pin, native swipe, drag guard, height-only resize, rotation/reload, keyboard, mobile controls, density/zoom, shared axes, raw CSV, desktop hover, 265 QBs, zero browser errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
