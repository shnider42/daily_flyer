/* Bowling plus cross-sport checks; every database is temporary. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bowling-test-')),port=8782,base=`http://127.0.0.1:${port}`,url=base+'/?theme=bowling_year_two&classic=1';
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,YEAR_TWO_DATA_DIR:folder,BOWLING_PRESET_DB:path.join(folder,'bowling.sqlite3'),BASEBALL_PRESET_DB:path.join(folder,'baseball.sqlite3'),QB_PRESET_DB:path.join(folder,'qb.sqlite3')}});
let browser;const errors=[];
const level=(p,l)=>p.click(`#yt-levels [data-detail-level=${l}]`);
(async()=>{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});server.on('error',reject);});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/tmp/dsl-chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.bw-dot').first().waitFor();
 assert.equal(await page.locator('#bw-app').getAttribute('data-detail'),'simple');assert.equal(await page.locator('.bw-panel').count(),1);
 assert.equal(await page.locator('.yt-sports a').count(),3);assert.ok(!(await page.locator('.bw-sidebar').isVisible()));
 assert.equal(await page.locator('#bw-charts [data-series]').count(),3);assert.equal(await page.locator('.bw-line-label').count(),3);
 assert.match(await page.locator('.bw-y-title').textContent(),/Scoring average.*pins/);assert.match(await page.locator('.bw-x-title').textContent(),/Year \(PBA profile\)/);
 assert.ok(await page.locator('#bw-selection>summary').isVisible());
 assert.match(await page.locator('#bw-coverage').innerText(),/79 bowlers.*813.*2025/);
 await page.screenshot({path:'/tmp/bowling-desktop.png',fullPage:true});
 const original=await page.evaluate(()=>BowlingApp.getState());
 for(const id of ['slumps','leaps','cashes','future']){await page.click(`[data-story=${id}]`);assert.equal(await page.locator(`[data-story=${id}]`).getAttribute('aria-pressed'),'true');}
 assert.ok(await page.locator('#bw-research').isVisible());assert.ok(await page.locator('.bw-research-dot').count()>10);assert.match(await page.locator('#bw-cohort-note').innerText(),/Excluded/);
 await page.click('#bw-undo');assert.deepEqual(await page.evaluate(()=>BowlingApp.getState()),original);
 await level(page,'guided');assert.ok(await page.locator('.bw-sidebar').isVisible());assert.ok(!(await page.locator('#bw-csv').isVisible()));
 await level(page,'full');assert.deepEqual(await page.evaluate(()=>BowlingApp.getState()),original);
 await page.selectOption('#bw-layout','overlay');await page.locator('#bw-selection>summary').click();await page.click('#bw-select-all');assert.ok((await page.evaluate(()=>BowlingApp.getState())).ids.length>25);
 assert.equal(await page.locator('#bw-charts [data-series]').count(),72);
 await page.click('#bw-clear');assert.equal(await page.locator('.bw-dot').count(),0);assert.match(await page.locator('#bw-charts').innerText(),/No bowlers/);
 await page.fill('#bw-search','Tackett');await page.click('#bw-select-all');assert.equal(await page.locator('#bw-players .bw-player').count(),2);
 await page.click('[data-story=rivals]');await page.selectOption('#bw-metric','earnings_per_event');assert.match(await page.locator('#bw-chart-title').innerText(),/Earnings/);
 await page.locator('details').filter({has:page.locator('#bw-csv')}).locator('summary').click();
 const downloadPromise=page.waitForEvent('download');await page.click('#bw-csv');const d=await downloadPromise;const csv=fs.readFileSync(await d.path(),'utf8');assert.ok(csv.includes('https://www.pba.com/players/ej-tackett'));
 // Three separate sports retain individual views while sharing the detail preference.
 await page.click('.yt-sports a[href*="theme=baseball_year_two"]');await page.locator('.bb-dot').first().waitFor();assert.equal(await page.locator('#bb-app').getAttribute('data-detail'),'full');
 assert.equal(await page.locator('#bb-stories button').first().getAttribute('data-story'),'boston');
 await page.click('.yt-sports a[href*="theme=qb_year_two"]');await page.locator('.qb-dot').first().waitFor();
 await page.click('.yt-sports a[href*="theme=bowling_year_two"]');await page.locator('.bw-dot').first().waitFor();assert.equal(await page.locator('#bw-metric').inputValue(),'earnings_per_event');
 // Touch inspection, true tall height, width-only redraw, and selection persistence.
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto(url);await mobile.locator('.bw-dot').first().waitFor();assert.equal(await mobile.locator('#bw-selection').getAttribute('open'),null);
 assert.equal(await mobile.locator('.bw-panel').count(),1);assert.equal(await mobile.locator('#bw-timeline').inputValue(),'calendar');
 await mobile.click('#bw-add-bowler');await mobile.fill('#bw-search','Kyle Troup');
 assert.equal(await mobile.locator('#bw-charts [data-series]').count(),3,'Searching must not remove existing lines');
 await mobile.check('[data-player=kyle-troup]');assert.equal(await mobile.locator('#bw-charts [data-series]').count(),4);
 assert.equal(await mobile.locator('#bw-app').getAttribute('data-detail'),'simple');
 assert.match(await mobile.locator('[data-line-label=kyle-troup]').textContent(),/Kyle Troup/);
 await mobile.click('#bw-picker-done');assert.equal(await mobile.locator('#bw-selection').getAttribute('open'),null);
 await mobile.reload();await mobile.locator('.bw-dot').first().waitFor();assert.equal(await mobile.locator('#bw-charts [data-series]').count(),4);
 await mobile.selectOption('#bw-timeline','career');assert.match(await mobile.locator('.bw-x-title').textContent(),/Years from first 10-event season/);
 await mobile.click('[data-story=rivals]');assert.equal(await mobile.locator('.bw-panel').count(),1);assert.equal(await mobile.locator('#bw-timeline').inputValue(),'calendar');
 await mobile.locator('#bw-charts').scrollIntoViewIfNeeded();await mobile.screenshot({path:'/tmp/bowling-shared-mobile.png'});
 await mobile.selectOption('#bw-layout','separate');
 const panel=mobile.locator('[data-panel=ej-tackett]');await panel.locator('.bw-dot').nth(1).tap();assert.match(await panel.locator('.bw-panel-inspect').innerText(),/2014/);
 const node=await panel.locator('svg').elementHandle();await mobile.setViewportSize({width:390,height:740});await mobile.waitForTimeout(100);assert.ok(await node.evaluate(n=>n.isConnected));
 const normal=await panel.locator('svg').boundingBox();await mobile.selectOption('#bw-height','tall');const tall=await panel.locator('svg').boundingBox();assert.ok(tall.height>normal.height*1.7);
 const pin=await mobile.evaluate(()=>JSON.parse(localStorage.getItem('bowling-year-two-v1')).focus);await mobile.reload();await mobile.locator('.bw-dot').first().waitFor();assert.deepEqual(await mobile.evaluate(()=>JSON.parse(localStorage.getItem('bowling-year-two-v1')).focus),pin);
 for(const width of [320,390,768,1024]){await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(100);assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'No body overflow at '+width);}
 await mobile.setViewportSize({width:390,height:844});await mobile.selectOption('#bw-height','normal');await mobile.screenshot({path:'/tmp/bowling-mobile.png',fullPage:true});
 await panel.scrollIntoViewIfNeeded();await mobile.screenshot({path:'/tmp/bowling-mobile-chart.png'});
 // USBC remains inside the third sport with mobile selection, named lines and player facts.
 await mobile.selectOption('#bw-dataset','usbc');assert.equal(await mobile.locator('#bw-threshold').inputValue(),'30');
 assert.equal(await mobile.locator('#bw-charts [data-series]').count(),3);
 assert.match(await mobile.locator('.bw-x-title').textContent(),/Year \(USBC Trials\)/);
 await mobile.click('#bw-usbc-women');assert.equal(await mobile.locator('#bw-division').inputValue(),'women');
 assert.equal(await mobile.locator('#bw-charts [data-series]').count(),3);
 await mobile.click('#bw-add-bowler');await mobile.fill('#bw-search','Crystal Elliott');
 await mobile.check('[data-player=usbc-women-crystalelliott]');assert.equal(await mobile.locator('#bw-charts [data-series]').count(),4);
 await mobile.click('#bw-picker-done');await mobile.selectOption('#bw-highlight','usbc-women-juliabond');
 assert.match(await mobile.locator('#bw-player-info').innerText(),/Nebraska/);
 assert.equal(await mobile.locator('#bw-player-info a').first().getAttribute('href'),'https://bowl.com/team-usa/julia-bond');
 await mobile.reload();await mobile.locator('.bw-dot').first().waitFor();assert.equal(await mobile.locator('#bw-dataset').inputValue(),'usbc');
 assert.equal(await mobile.locator('#bw-charts [data-series]').count(),4);assert.match(await mobile.locator('#bw-player-info').innerText(),/Julia Bond/);
 await level(mobile,'full');await mobile.selectOption('#bw-metric','finish');assert.match(await mobile.locator('#bw-metric-note').innerText(),/Lower is better/);
 assert.equal(await mobile.locator('#bw-metric option[value=cash_rate]').count(),0);
 await mobile.locator('details').filter({has:mobile.locator('#bw-csv')}).locator('summary').click();
 const usbcDownload=mobile.waitForEvent('download');await mobile.click('#bw-csv');const ud=await usbcDownload;
 const ucsv=fs.readFileSync(await ud.path(),'utf8');assert.ok(ucsv.includes('https://scores.bowl.com/'));assert.ok(ucsv.includes('Field size'));assert.ok(ucsv.includes('Julia Bond'));
 await mobile.selectOption('#bw-metric','average');await mobile.selectOption('#bw-highlight','');
 await level(mobile,'simple');for(const width of [320,390]){await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(100);assert.ok(await mobile.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'No USBC body overflow at '+width);}
 await mobile.locator('#bw-charts').scrollIntoViewIfNeeded();await mobile.screenshot({path:'/tmp/bowling-usbc-mobile.png'});
 await mobile.click('[data-story=rivals]');assert.equal(await mobile.locator('#bw-dataset').inputValue(),'pba');assert.equal(await mobile.locator('#bw-charts [data-series]').count(),3);
 // Preview, public save, conflict, import/export, and server-reset recovery.
 await page.goto(url+'&preset_admin=1');await page.locator('#bw-admin-label').waitFor();
 const second=await browser.newPage();await second.goto(url+'&preset_admin=1');
 const before=await page.request.get(base+'/api/bowling-presets').then(r=>r.json());
 await page.fill('#bw-admin-label','<b>Bowling story</b>');await page.click('#bw-admin-preview');await page.waitForFunction(()=>document.getElementById('bw-story-title').textContent.includes('DRAFT PREVIEW'));
 assert.equal((await page.request.get(base+'/api/bowling-presets').then(r=>r.json())).revision,before.revision);
 await page.click('#bw-admin-save');await page.waitForFunction(()=>document.getElementById('bw-admin-status').textContent.startsWith('Saved all five'));
 assert.equal(await page.locator('[data-story=rivals] b').count(),0);
 await second.fill('#bw-admin-label','Stale edit');await second.click('#bw-admin-save');await second.waitForFunction(()=>document.getElementById('bw-admin-status').textContent.includes('Another editor'));
 const backupPromise=page.waitForEvent('download');await page.click('#bw-admin-export');const backup=await backupPromise;const backupPath=await backup.path();
 await page.click('#bw-admin-reset');await page.setInputFiles('#bw-admin-import',backupPath);await page.waitForFunction(()=>document.getElementById('bw-admin-status').textContent.includes('Imported into this draft'));
 fs.rmSync(path.join(folder,'bowling.sqlite3'));await page.reload();await page.locator('#bw-admin-label').waitFor();
 await page.locator('#bw-admin [data-backup=saved]').click();await page.waitForFunction(()=>document.getElementById('bw-admin-status').textContent.includes('restored into this draft'));assert.equal(await page.locator('#bw-admin-label').inputValue(),'<b>Bowling story</b>');
 assert.equal((await page.request.get(base+'/api/bowling-presets').then(r=>r.json())).source,'factory');await page.click('#bw-admin-save');await page.waitForFunction(()=>document.getElementById('bw-admin-status').textContent.startsWith('Saved all five'));
 const blocked=await browser.newPage();blocked.on('pageerror',e=>errors.push(e.message));await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));await blocked.goto(url);await blocked.locator('.bw-dot').first().waitFor();await level(blocked,'guided');
 // Returning visitors with untouched old defaults get the shared graph; custom views survive.
 const legacy=await page.evaluate(()=>BowlingApp.config.legacy_factory[0].settings);
 const returning=await browser.newPage();await returning.addInitScript(s=>localStorage.setItem('bowling-year-two-v1',JSON.stringify({state:s,focus:{id:'ej-tackett',year:2014}})),legacy);
 await returning.goto(url);await returning.locator('.bw-dot').first().waitFor();assert.equal(await returning.locator('#bw-layout').inputValue(),'overlay');assert.equal(await returning.locator('#bw-timeline').inputValue(),'calendar');
 const custom=await browser.newPage();await custom.addInitScript(s=>localStorage.setItem('bowling-year-two-v1',JSON.stringify({state:{...s,height:'tall'},focus:{id:'ej-tackett',year:2014}})),legacy);
 await custom.goto(url);await custom.locator('.bw-dot').first().waitFor();assert.equal(await custom.locator('#bw-layout').inputValue(),'separate');assert.equal(await custom.locator('#bw-timeline').inputValue(),'career');assert.equal(await custom.locator('#bw-height').inputValue(),'tall');
 assert.deepEqual(errors,[]);console.log('PASS: bowling stories, metrics, 72-player charts, research, CSV, mobile pins/tall layout, three sports, presets/conflicts/backups, blocked storage.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();fs.rmSync(folder,{recursive:true,force:true});});
