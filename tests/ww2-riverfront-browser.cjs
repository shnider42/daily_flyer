// Large-map navigation and playback against a disposable server/database.
const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-riverfront-')),base='http://127.0.0.1:8095';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8095','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'match.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base);await page.locator('#createSolo').click();await page.locator('#soloScenario').selectOption('riverfront');await page.locator('#startSolo').click();
 await page.locator('#game').waitFor({state:'visible'});
 assert.equal(await page.locator('#map .hex').count(),324);assert.equal(await page.locator('#map .unit').count(),30);
 assert.equal(await page.locator('#map .platoon-marker').count(),30);
 assert.match(await page.locator('#armyCount').textContent(),/15\/15.*15\/15/);
 assert.equal(await page.locator('#platoonFilters button').count(),4);assert.equal(await page.locator('#roster button').count(),5);
 assert.ok(await page.locator('#mapWrap').evaluate(e=>e.scrollTop>0&&e.scrollWidth>e.clientWidth));
 await page.locator('#platoonFilters button').filter({hasText:'Charlie'}).click();
 assert.ok(await page.locator('#mapWrap').evaluate(e=>e.scrollLeft>400));
 await page.locator('#roster button').first().click();await page.locator('#nextUnit').click();
 assert.equal(await page.evaluate(()=>state.units.find(u=>u.id===selected).platoon),'C');
 await page.locator('#zoom').click();assert.equal(await page.locator('#zoom').textContent(),'Detail');
 await page.screenshot({path:path.join(temp,'overview.png'),fullPage:true});
 await page.locator('#zoom').click();await page.locator('#mapWrap').evaluate(e=>e.scrollTo(0,0));await page.locator('#findUnit').click();
 assert.ok(await page.locator('#mapWrap').evaluate(e=>e.scrollTop>0&&e.scrollLeft>400));
 await page.locator('#platoonFilters button').filter({hasText:'All'}).click();assert.equal(await page.locator('#roster button').count(),15);
 for(const width of [320,375,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.locator('#platoonFilters button').filter({hasText:'Bravo'}).click();
 await page.screenshot({path:path.join(temp,'detail.png'),fullPage:true});
 await page.locator('#end').click();await page.locator('#playbackPanel').waitFor({state:'visible'});await page.locator('#pausePlayback').click();
 assert.equal(await page.locator('#playbackMap .unit').count(),30);
 await page.locator('#zoom').click();await page.locator('#zoom').click();
 assert.ok(await page.locator('#mapWrap').evaluate(e=>e.scrollWidth>e.clientWidth));
 await page.locator('#stepPlayback').click();await page.locator('#skipPlayback').click();
 assert.equal(await page.locator('#platoonFilters').isVisible(),true);
 await page.reload();await page.locator('#game').waitFor({state:'visible'});assert.equal(await page.locator('#map .unit').count(),30);
 await page.locator('#rematchButton').click();await page.locator('#rematchScenario').selectOption('village');await page.locator('#proposeRematch').click();
 await page.locator('#playbackPanel').waitFor({state:'visible'});await page.locator('#skipPlayback').click();
 assert.equal(await page.locator('#map .unit').count(),10);assert.equal(await page.locator('#platoonFilters').isVisible(),false);
 assert.match(await page.locator('#armyCount').textContent(),/5\/5.*5\/5/);assert.deepEqual(errors,[]);
 console.log('PASS: 324 hexes, 30 counters, platoon navigation, overview/detail, phone layout, large-army playback, reload and small-map rematch. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
