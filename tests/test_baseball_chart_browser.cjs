/* Chart readability regression, including actual iPhone-width geometry and touch. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bb-chart-')),port=8776,url=`http://127.0.0.1:${port}/?theme=baseball_year_two`;
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BASEBALL_PRESET_DB:path.join(folder,'bb.sqlite3'),QB_PRESET_DB:path.join(folder,'qb.sqlite3')}});
let browser;const errors=[];
const story=async(page,id)=>{await page.click(`[data-story=${id}]`);await page.waitForFunction(id=>document.querySelector(`[data-story=${id}]`).getAttribute('aria-pressed')==='true',id);};
const panel=(page,id)=>page.locator(`[data-panel=${id}]`);
(async()=>{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timed out')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});server.on('exit',code=>reject(Error('Server exited '+code)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/tmp/qb-chromium'});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.bb-dot').first().waitFor();await story(page,'boston');
 assert.equal(await page.locator('.bb-chart-panel').count(),3);assert.equal(await page.locator('.bb-dot').count(),28);
 const ortiz=panel(page,'ortizda01'),betts=panel(page,'bettsmo01'),devers=panel(page,'deverra01');
 assert.match(await ortiz.innerText(),/YEAR 1 · 1998/);assert.match(await ortiz.innerText(),/YEAR 2 · 1999/);assert.match(await ortiz.innerText(),/0.817/);assert.match(await ortiz.innerText(),/0.200/);assert.match(await ortiz.innerText(),/MIN · 25 PA/);assert.match(await ortiz.locator('.bb-sample-warning').innerText(),/small sample/);
 assert.match(await betts.innerText(),/YEAR 2 · 2016/);assert.match(await betts.innerText(),/\+0.077 OPS/);assert.match(await devers.innerText(),/\+0.184 OPS/);
 assert.match(await page.locator('#bb-chart-reading').innerText(),/getting on base/);assert.match(await page.locator('#bb-chart-window').innerText(),/first 10 calendar years/);
 const ticks=await betts.locator('svg .bb-graph-axis').allTextContents();assert.ok(ticks.includes('2016'));assert.ok(!ticks.includes('Y1'));assert.ok(await betts.locator('.bb-gridline').count()>=4);
 // Shared axes still position the same metric value identically in every panel.
 const axes=await page.locator('.bb-chart-panel svg').evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('.bb-gridline')].map(l=>l.getAttribute('y1'))));assert.deepEqual(axes[0],axes[1]);assert.deepEqual(axes[1],axes[2]);
 await ortiz.evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:'/tmp/boston-after-mobile.png'});
 await betts.locator('.bb-dot').nth(1).tap();assert.match(await betts.locator('.bb-panel-inspect').innerText(),/2016 \(year 2\)/);assert.match(await betts.locator('.bb-panel-inspect').innerText(),/0.897/);assert.match(await betts.locator('.bb-panel-inspect').innerText(),/730 PA/);
 assert.equal(await ortiz.locator('[data-series]').evaluate(e=>getComputedStyle(e).opacity),'1','Separate charts must remain legible when another player is pinned');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('baseball-year-two-v1'))),node=await betts.locator('svg').elementHandle();await page.setViewportSize({width:390,height:740});await page.waitForTimeout(200);assert.ok(await node.evaluate(e=>e.isConnected));
 for(const level of ['guided','full','simple']){await page.click(`#yt-levels [data-detail-level=${level}]`);assert.deepEqual(await page.evaluate(()=>BaseballApp.getState()),saved.state);assert.match(await betts.locator('.bb-panel-inspect').innerText(),/2016/);}
 await page.click('#bb-full-career');assert.equal(await page.evaluate(()=>BaseballApp.getState().window),'all');assert.equal(await ortiz.locator('.bb-dot').count(),19);assert.equal(await betts.locator('.bb-dot').count(),11);assert.equal(await devers.locator('.bb-dot').count(),8);assert.equal(await page.locator('#bb-full-career').isVisible(),false);
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(220);assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1));assert.ok(await betts.locator('svg').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));assert.ok(await page.locator('svg').evaluateAll(nodes=>nodes.every(e=>!e.innerHTML.includes('NaN'))));}
 await page.locator('#bb-charts').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:'/tmp/boston-after-desktop.png'});
 // Normalization is a display transformation; the labeled pair retains actual values.
 await page.click('#yt-levels [data-detail-level=full]');await page.click('#bb-graph-settings>summary');await page.selectOption('#bb-normalize','delta');await page.selectOption('#bb-scale','density');assert.match(await page.locator('#bb-chart-reading').innerText(),/comparison boxes retain actual values/);assert.match(await betts.locator('.bb-pair-readout').innerText(),/0.820/);assert.match(await betts.locator('.bb-pair-readout').innerText(),/0.897/);assert.match(await page.locator('#bb-graph-note').innerText(),/NOT equal/);
 await page.click('[data-view=span]');assert.equal(await page.locator('.bb-year-two-band').count(),0);assert.ok(await page.locator('#bb-charts svg').evaluate(e=>Math.abs(e.viewBox.baseVal.width-e.getBoundingClientRect().width)<=1),'Span view uses the full panel width, even after separate-player mode');
 await story(page,'leaps');assert.match(await page.locator('#bb-chart-reading').innerText(),/Lower is better/);assert.ok((await page.locator('.bb-pair-verdict').allTextContents()).every(t=>t.includes('Improved in year two')));
 // Ohtani's absent second pitching season must not turn into a zero dot or a bridged line.
 await page.click('#bb-selection>summary');await page.fill('#bb-search','Ohtani');await page.uncheck('#bb-qual2');await page.click('#bb-select');await page.click('[data-view=career]');
 const ohtani=panel(page,'ohtansh01');assert.match(await ohtani.innerText(),/No season recorded/);assert.match(await ohtani.innerText(),/No comparable pair/);assert.match(await ohtani.innerText(),/Year two has no plottable value/);
 assert.equal(await ohtani.locator('.bb-dot[aria-label*="year 2,"]').count(),0);assert.equal(await ohtani.locator('.bb-trace').count(),3);
 assert.deepEqual(errors,[]);console.log('PASS: explicit values/dates, year-two markers, shared axes, Boston workload context, full-career control, in-panel touch inspection, level/pin preservation, normalized labels and missing-season gaps');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
