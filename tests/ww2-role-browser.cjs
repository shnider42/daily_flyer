// Self-contained browser check. Seeds only its own temporary SQLite database.
// NODE_PATH=... WW2_PLAYWRIGHT=playwright-core WW2_PACKAGED_CHROMIUM=1 node tests/ww2-role-browser.cjs
const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-role-browser-'));
const db=path.join(temp,'match.sqlite3');
const base='http://127.0.0.1:8092';
const setup=`
import json, hashlib, sqlite3, sys
from ww2_web import create_app
from ww2_tactics.engine import initial
create_app(sys.argv[1])
s=initial(); s['ready']=True
s['battlefield']['map']=[['field']*7 for _ in range(9)]
s['battlefield']['map'][4][3]='objective'
for i,pos in [(0,[3,5]),(1,[3,7]),(2,[0,4]),(5,[3,4]),(8,[1,4])]: s['units'][i]['pos']=pos
with sqlite3.connect(sys.argv[1]) as db:
 db.execute('INSERT INTO match VALUES (1,?,?,?,?)',('AABBCCDDEE',hashlib.sha256(b'us-test').hexdigest(),hashlib.sha256(b'de-test').hexdigest(),json.dumps(s)))
`;
cp.execFileSync('python',['-c',setup,db]);
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8092','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const pages=[],errors=[];
 for(const [side,width] of [['us',390],['de',375]]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(({side})=>localStorage.setItem('ww2-session',JSON.stringify({code:'AABBCCDDEE',token:side+'-test'})),{side});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base);await page.locator('#game').waitFor({state:'visible'});pages.push(page);
 }
 const [us,de]=pages;
 await us.locator('#map .unit.us').nth(0).click();await us.locator('#map .unit.de').nth(0).click();
 assert.equal(await us.locator('#grenade').isVisible(),true);
 assert.equal(await us.locator('#odds > .chance-row .die-face').count(),6);
 await us.locator('#odds summary').click();
 assert.match(await us.locator('#odds').textContent(),/Terrain cover/);
 await us.screenshot({path:path.join(temp,'attack-preview.png'),fullPage:true});
 await us.locator('#grenade').click();
 await us.waitForFunction(()=>document.querySelector('#roleBrief').textContent.includes('0 frag grenade'));
 assert.equal(await us.locator('#latestCombat .die-face').count(),1);
 assert.match(await us.locator('#latestCombat').textContent(),/Rolled [1-6] · needed 5\+/);
 await us.screenshot({path:path.join(temp,'dice-result.png'),fullPage:true});
 await us.locator('#map .unit.us').nth(2).click();await us.locator('#map .unit.de').nth(3).click();
 await us.locator('#suppress').click();
 await us.waitForFunction(()=>document.querySelector('#combat').textContent.includes('Suppressive fire'));
 assert.doesNotMatch(await us.locator('#combat').textContent(),/undefined/);
 assert.match(await us.locator('#latestCombat').textContent(),/Automatic effect/);
 await us.locator('#combatHistoryLabel').click();
 assert.equal(await us.locator('#combatHistoryEntries .die-face').count(),1);
 await us.locator('#map .unit.us').nth(1).click();await us.locator('#barrage').click();
 // Occupied hexes route their counter tap into the active targeting mode.
 await us.locator('#map .unit.us').nth(0).click();
 await us.locator('#incoming').waitFor({state:'visible'});
 await de.locator('#incoming').waitFor({state:'visible'});
 assert.equal(await us.locator('.barrage-zone').count(),7);
 assert.equal(await de.locator('.barrage-zone').count(),7);
 assert.match(await us.locator('#supportStatus').textContent(),/US 0 \/ DE 1/);
 await us.screenshot({path:path.join(temp,'incoming-us.png'),fullPage:true});
 await de.screenshot({path:path.join(temp,'incoming-de.png'),fullPage:true});
 await us.locator('#end').click();
 await de.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 assert.match(await de.locator('#incoming').textContent(),/end of this turn/);
 await de.locator('#end').click();
 await us.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 await us.locator('#incoming').waitFor({state:'hidden'});
 assert.match(await us.locator('#combat').textContent(),/Mortar barrage/);
 await us.locator('#map .unit.us').nth(0).click();
 assert.match(await us.locator('#selection').textContent(),/PINNED/);
 await us.locator('#map .unit.us').nth(1).click();
 await us.getByRole('button',{name:'Move to D7, field, 1 action',exact:true}).click();
 await us.locator('#inspire').click();
 await us.waitForFunction(()=>document.querySelector('#latest').textContent.includes('rallied'));
 await us.locator('#map .unit.us').nth(0).click();
 assert.doesNotMatch(await us.locator('#selection').textContent(),/PINNED/);
 assert.match(await us.locator('#selection').textContent(),/2 actions/);
 await us.reload();await us.locator('#game').waitFor({state:'visible'});
 assert.match(await us.locator('#supportStatus').textContent(),/US 0/);
 for(const width of [320,375,430,768]){await us.setViewportSize({width,height:844});assert.equal(await us.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);
 console.log('PASS: grenade, suppression, two-screen barrage warnings/area, delayed impact, leader rally, preserved actions, reload, mobile overflow. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
