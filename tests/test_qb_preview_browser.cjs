/* Local, isolated usability regressions. Human comprehension still needs review. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'qb-preview-test-')),port=8784,base=`http://127.0.0.1:${port}`,url=base+'/?theme=qb_year_two_preview&classic=1';
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,YEAR_TWO_DATA_DIR:folder,QB_PRESET_DB:path.join(folder,'qb.sqlite3')}});
let browser;const errors=[],axes=p=>p.locator('#qp-charts svg').evaluateAll(es=>es.map(e=>[e.dataset.lo,e.dataset.hi,e.dataset.end||''].join(':')));
const data=p=>p.evaluate(()=>QBPreview.getState());
async function ready(p,link=url){await p.goto(link);await p.locator('#qp-charts svg').first().waitFor();}
(async()=>{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['qb-year-two-v1','baseball-year-two-v1','bowling-year-two-v1','year-two-detail-v1'])localStorage.setItem(key,'legacy-sentinel');});
 await ready(page);
 assert.equal(await page.locator('.yt-sports a').count(),3);assert.equal(await page.locator('#yt-levels').count(),0);
 assert.equal(await page.locator('[data-player-panel]').count(),2);assert.equal(new Set(await axes(page)).size,1);
 assert.match(await page.locator('[data-player-panel=BradTo00]').innerText(),/86.5/);assert.match(await page.locator('[data-player-panel=BradTo00]').innerText(),/−0.7/);
 assert.match(await page.locator('[data-player-panel=MannPe00]').innerText(),/\+19.5/);
 assert.match(await page.locator('#qp-summary').innerText(),/2 comparable quarterbacks: 1 improved, 1 declined/);
 const lowContrast=await page.locator('#qp-app').evaluate(root=>{
  const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),lum=c=>c.slice(0,3).map(n=>{n/=255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[0.2126,0.7152,0.0722][i],0);
  return [...root.querySelectorAll('*')].filter(e=>!(e instanceof SVGElement)&&e.getBoundingClientRect().height&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).flatMap(e=>{
   const s=getComputedStyle(e),fg=rgb(s.color);let bg=[255,254,250],p=e;
   while(p){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}p=p.parentElement;}
   const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
   return ratio<(large?3:4.5)?[{text:e.textContent.trim().slice(0,60),ratio}]:[];
  });
 });
 assert.deepEqual(lowContrast,[],'Visible default text meets project contrast targets');
 await page.screenshot({path:'/tmp/qb-preview-desktop.png',fullPage:true});
 await page.click('#qp-picker>summary');await page.fill('#qp-search','Steve Young');
 assert.equal(await page.locator('[data-player-panel]').count(),2,'Search must not change chart selection');
 await page.check('[data-player=YounSt00]');assert.equal(await page.locator('[data-player-panel]').count(),3);
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.player),'YounSt00');
 await page.click('#qp-done');assert.match(await page.locator('[data-player-panel=YounSt00] .qp-row-warning').innerText(),/3 starts and 69 attempts/);
 await page.click('[data-display=table]');assert.equal(await page.locator('#qp-tbody tr').count(),3);
 assert.match(await page.locator('#qp-tbody').innerText(),/3 \/ 69/);
 const download=page.waitForEvent('download');await page.click('#qp-export');const d=await download;
 const csv=fs.readFileSync(await d.path(),'utf8');assert.equal(csv.split('\r\n').length,8);assert.match(csv,/85.7217/);assert.match(csv,/qb_sources.json/);
 await page.click('[data-display=chart]');await page.click('[data-view=career]');
 assert.equal(new Set(await axes(page)).size,1);assert.ok((await axes(page))[0].endsWith(':5'));
 await page.selectOption('#qp-metric','relative_anya');
 await page.selectOption('#qp-season-MannPe00','2000');assert.match(await page.locator('#qp-inspect-MannPe00').innerText(),/Metric unavailable/);
 assert.ok((await page.locator('[data-player-panel=MannPe00] .qp-line').getAttribute('d')).split('M').length>=3,'Missing 2000 baseline breaks the line');
 await page.click('[data-display=table]');assert.equal(await page.locator('#qp-tbody tr').count(),15);
 assert.match(await page.locator('#qp-tbody').innerText(),/Metric unavailable/);
 await page.click('#qp-share');const shared=await page.locator('#qp-share-url').inputValue();
 const copy=await browser.newPage();await copy.goto(shared);await copy.locator('#qp-tbody tr').first().waitFor();
 assert.deepEqual(await data(copy),await data(page),'Share link round-trips the complete selection and view');
 await page.click('#qp-reset');await page.click('#qp-picker>summary');await page.click('#qp-add-all');await page.click('#qp-done');
 assert.equal((await data(page)).ids.length,265);assert.equal(await page.locator('[data-player-panel]').count(),6);
 const firstAxes=await axes(page);await page.click('#qp-next');assert.deepEqual(await axes(page),firstAxes,'Paging cannot rescale the metric');
 assert.match(await page.locator('#qp-scope').innerText(),/7–12 of 265/);
 await page.click('[data-display=table]');assert.equal(await page.locator('#qp-tbody tr').count(),265);
 assert.equal((await page.evaluate(()=>QBPreview.csv())).split('\r\n').length,532);
 await page.click('#qp-reset');await page.click('#qp-picker>summary');await page.click('#qp-clear');await page.click('#qp-done');
 assert.ok(await page.locator('#qp-empty').isVisible());assert.ok(await page.locator('#qp-export').isDisabled());
 await page.click('#qp-empty-reset');assert.equal(await page.locator('[data-player-panel]').count(),2);
 for(const key of ['qb-year-two-v1','baseball-year-two-v1','bowling-year-two-v1','year-two-detail-v1'])assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'legacy-sentinel');
 assert.deepEqual(fs.readdirSync(folder),[],'Preview must never create or update shared presets');
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await ready(mobile);
 await mobile.screenshot({path:'/tmp/qb-preview-mobile.png',fullPage:true});
 await mobile.click('#qp-picker>summary');await mobile.fill('#qp-search','Steve Young');await mobile.check('[data-player=YounSt00]');await mobile.click('#qp-done');
 await mobile.reload();await mobile.locator('[data-player-panel=YounSt00]').waitFor();
 await mobile.click('[data-view=career]');await mobile.locator('[data-player-panel=BradTo00]').scrollIntoViewIfNeeded();
 const node=await mobile.locator('#qp-charts svg').first().elementHandle();
 await mobile.setViewportSize({width:390,height:740});await mobile.waitForTimeout(120);assert.ok(await node.evaluate(n=>n.isConnected),'Height-only changes must not redraw');
 await mobile.selectOption('#qp-season-BradTo00','2003');assert.ok(await node.evaluate(n=>n.isConnected),'Season inspection must not redraw');
 await mobile.screenshot({path:'/tmp/qb-preview-career-mobile.png'});
 for(const width of [320,390,768,1440]){
  await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(120);
  assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'No page overflow at '+width);
  assert.equal(new Set(await axes(mobile)).size,1);
 }
 await mobile.setViewportSize({width:320,height:844});await mobile.selectOption('#qp-window','all');
 const overlaps=await mobile.locator('#qp-charts svg').evaluateAll(svgs=>svgs.flatMap(svg=>{
  const end=svg.viewBox.baseVal.height-29,labels=[...svg.querySelectorAll('text.qp-axis')].filter(t=>Number(t.getAttribute('y'))===end).map(t=>t.getBBox());
  return labels.flatMap((box,i)=>i&&box.x<labels[i-1].x+labels[i-1].width+4?[i]:[]);
 }));
 assert.deepEqual(overlaps,[],'Full-career time labels stay separated at 320px');
 await mobile.setViewportSize({width:320,height:844});await mobile.click('#qp-reset');await mobile.click('#qp-picker>summary');
 await mobile.fill('#qp-search','Bo Nix');await mobile.check('[data-player=NixxBo00]');await mobile.click('#qp-done');
 assert.match(await mobile.locator('[data-player-panel=NixxBo00]').innerText(),/outside this snapshot/);
 assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'Unavailable change must fit narrow screens');
 const sizes=await mobile.locator('#qp-app button:visible,#qp-app select:visible,#qp-picker>summary').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
 assert.ok(sizes.every(h=>h>=44),'Primary targets are at least 44 CSS px tall');
 const blocked=await browser.newPage();blocked.on('pageerror',e=>errors.push(e.message));await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));await ready(blocked);
 assert.equal(await blocked.locator('[data-player-panel]').count(),2);
 await blocked.goto(url+'&players=BradTo00,BradTo00,unknown&measure=invalid&view=invalid');await blocked.locator('#qp-charts svg').waitFor();
 assert.deepEqual((await data(blocked)).ids,['BradTo00']);assert.equal((await data(blocked)).metric,'rating');
 assert.deepEqual(errors,[]);console.log('PASS: preview data, missing years, samples, selectors, 265-player pagination, CSV, links, isolated storage, 320–1440px layouts and mobile inspection.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();fs.rmSync(folder,{recursive:true,force:true});});
