// Start a fresh disposable server; set WW2_TEST_URL if not using port 8000.
// Requires Playwright. Optionally use WW2_PACKAGED_CHROMIUM=1 with @sparticuz/chromium.
const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.WW2_TEST_URL||'http://127.0.0.1:8000';
const shots=process.env.WW2_SCREENSHOTS||'/tmp/ww2-battlefields-screens';
(async()=>{
 const packagedModule=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null;
 const packaged=packagedModule?.default||packagedModule;
 const browser=await chromium.launch({headless:true,...(packaged?{executablePath:await packaged.executablePath(),args:packaged.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const errors=[];
 const usContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const deContext=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 const us=await usContext.newPage(),de=await deContext.newPage();
 for(const page of [us,de]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());}
 fs.mkdirSync(shots,{recursive:true});
 await us.goto(base);
 await us.locator('#scenarioSelect').selectOption('orchard');
 await us.waitForFunction(()=>document.querySelector('#scenarioBrief').textContent.includes('wider'));
 assert.equal(await us.locator('#scenarioPreview polygon').count(),81);
 await us.screenshot({path:shots+'/lobby.png',fullPage:true});
 await us.locator('#create').click();await us.locator('#waiting').waitFor({state:'visible'});
 await de.goto(await us.locator('#invite').inputValue());await de.locator('#joinForm button').click();
 await de.locator('#game').waitFor({state:'visible'});
 await us.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 assert.equal(await us.locator('#map polygon').count(),81);
 await us.locator('#roster button').first().click();
 await us.locator('#overwatch').click();
 await us.waitForFunction(()=>document.querySelector('#roster').textContent.includes('Watching'));
 assert.equal(await us.locator('.watch-marker').count(),1);
 await us.locator('#end').click();
 await de.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 await de.locator('#roster button').first().click();
 await de.getByRole('button',{name:'Move to C2, field, 1 action',exact:true}).click();
 await de.waitForFunction(()=>document.querySelector('#selection').textContent.includes('1 actions'));
 await de.locator('#end').click();
 await us.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 assert.equal(await us.locator('.watch-marker').count(),0);
 // Rematch with a different map and swapped armies; keep both player keys.
 const hostKey=await us.evaluate(()=>localStorage.getItem('ww2-session'));
 await us.locator('#rematchButton').click();
 await us.locator('#rematchScenario').selectOption('stonebridge');
 await us.locator('#proposeRematch').click();
 await de.locator('#rematchProposal').waitFor({state:'visible'});
 await de.screenshot({path:shots+'/proposal.png',fullPage:true});
 await de.locator('#acceptRematch').click();
 await de.waitForFunction(()=>document.querySelector('#battleTitle').textContent==='Stonebridge');
 await us.waitForFunction(()=>document.querySelector('#side').textContent.includes('Germans'));
 assert.equal(await us.evaluate(()=>localStorage.getItem('ww2-session')),hostKey);
 assert.equal(await de.locator('#map polygon').count(),77);
 assert.equal(await de.locator('#round').textContent(),'1 / 12');
 assert.equal(await de.locator('#map .water').count(),5);
 assert.equal(await de.locator('#map .bridge').count(),2);
 assert.equal(await de.locator('#selection').textContent(),'Tap one of your units to see its orders.');
 await de.reload();await de.locator('#game').waitFor({state:'visible'});
 await de.waitForFunction(()=>document.querySelector('#side').textContent.includes('Americans'));
 await de.locator('#roster button').first().click();
 await de.screenshot({path:shots+'/stonebridge.png',fullPage:true});
 await de.locator('#zoom').click();assert.equal(await de.locator('#mapWrap').evaluate(e=>e.scrollWidth>e.clientWidth),true);
 await de.locator('#zoom').click();
 for(const width of [320,375,390,430,768,1280]){
  await de.setViewportSize({width,height:844});
  assert.equal(await de.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
 }
 await de.setViewportSize({width:375,height:812});
 await de.locator('#rulesButton').click();assert.equal(await de.locator('#rules').isVisible(),true);await de.locator('#closeRules').click();
 // End the quiet battle through authenticated real APIs to check the report/score.
 async function end(page){return page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('ww2-session'));const headers={'Content-Type':'application/json',Authorization:`Bearer ${s.token}`};const path=`/api/match/${s.code}`;const state=await (await fetch(path,{headers})).json();const r=await fetch(path,{method:'POST',headers,body:JSON.stringify({kind:'end',revision:state.revision})});if(!r.ok)throw Error(await r.text());return r.json();});}
 for(let i=0;i<12;i++){await end(de);await end(us);}
 await de.locator('#refresh').click();await de.locator('#battleReport').waitFor({state:'visible'});
 assert.match(await de.locator('#seriesScore').textContent(),/Germans 1/);
 await de.screenshot({path:shots+'/report.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: mobile scenario picker/previews, 9x9 and 7x11 maps, overwatch/expiry, synchronized turns, consenting rematch, army swap, unchanged player keys, reload, zoom, 320–1280px overflow checks, battle report and score; no JS errors.');
})().catch(e=>{console.error(e);process.exit(1);});
