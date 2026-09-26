const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-dsl-')),db=path.join(temp,'game.sqlite3'),base='http://127.0.0.1:8099';
cp.execFileSync('python',['-c',`
import sys,json,sqlite3,hashlib
from ww2_web import create_app
from ww2_tactics.engine import initial
create_app(sys.argv[1]);s=initial('village','dsl');s['ready']=True
s['battlefield']['map']=[['field']*7 for _ in range(9)]
for x in range(1,6):s['battlefield']['map'][4][x]='road'
s['units'][0]['pos']=[1,4];s['units'][1]['pos']=[2,5];s['units'][5]['pos']=[3,3]
with sqlite3.connect(sys.argv[1]) as db:db.execute('INSERT INTO match (code,host,guest,state) VALUES (?,?,?,?)',('DD00112233',hashlib.sha256(b'dsl-human').hexdigest(),hashlib.sha256(b'dsl-guest').hexdigest(),json.dumps(s)))

from unittest.mock import patch
from ww2_tactics.computer import play_turn
s=initial('village','dsl');s.update(ready=True,ai_side='de',turn='de');s['units'][0]['pos']=[3,5];s['units'][5]['pos']=[3,4]
actions=iter([dict(kind='grenade',unit='de0',target='us0'),dict(kind='end')])
with patch('ww2_tactics.computer.choose_order',side_effect=lambda *args:next(actions)):s=play_turn(s,roll=lambda:1)
with sqlite3.connect(sys.argv[1]) as db:db.execute('INSERT INTO match (code,host,guest,state) VALUES (?,?,?,?)',('EE00112233',hashlib.sha256(b'dsl-replay').hexdigest(),None,json.dumps(s)))
`,db]);
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8099','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const errors=[];
 async function page(width=390){const p=await browser.newPage({viewport:{width,height:900}});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
 const mobile=await page();await mobile.goto(base);
 assert.equal(await mobile.locator('#rulesetSelect').inputValue(),'dsl');assert.equal(await mobile.locator('#rulesetSelect option[value="asl"]').isDisabled(),true);
 await mobile.locator('#createSolo').click();await mobile.locator('#startSolo').click();await mobile.locator('#game').waitFor({state:'visible'});
 await mobile.waitForFunction(()=>!busy&&state?.ruleset==='dsl');
 assert.equal(await mobile.evaluate(()=>state.units[1].ap),3);
 await mobile.locator('#roster button').nth(1).click();
 assert.match(await mobile.locator('#unitMechanics').textContent(),/Actions 3\/5/);
 assert.match(await mobile.locator('#commandOrders').textContent(),/2 units/);
 await mobile.locator('#commandOrders button').click();await mobile.waitForFunction(()=>!busy&&state.revision===1);
 assert.equal(await mobile.evaluate(()=>state.units[0].ap),3);
 assert.equal(await mobile.evaluate(()=>state.units[1].ap),1);
 await mobile.screenshot({path:path.join(temp,'dsl-mobile-command.png'),fullPage:true});
 await mobile.locator('#end').click();await mobile.locator('#playbackPanel').waitFor({state:'visible'});await mobile.locator('#skipPlayback').click();
 assert.equal(await mobile.evaluate(()=>state.units[1].ap),4);
 assert.equal(await mobile.evaluate(()=>state.units[0].ap_received),3);
 await mobile.locator('#roster button').nth(1).click();assert.equal(await mobile.locator('#commandOrders').isVisible(),false);
 await mobile.locator('#rulesButton').click();assert.equal(await mobile.locator('#dslManual').isVisible(),true);await mobile.locator('#closeRules').click();
 await mobile.locator('#saveButton').click();await mobile.locator('#accessDialog').waitFor({state:'visible'});
 const saved=await mobile.locator('#accessCode').inputValue();await mobile.locator('#closeAccess').click();
 const pc=await page(1440);await pc.goto(base);await pc.locator('#recoveryCode').fill(saved);await pc.locator('#recoverForm button').click();await pc.locator('#game').waitFor({state:'visible'});
 assert.equal(await pc.evaluate(()=>state.ruleset),'dsl');assert.equal(await pc.evaluate(()=>state.units[1].ap),4);
 await pc.screenshot({path:path.join(temp,'dsl-desktop.png'),fullPage:true});
 await pc.locator('#rematchButton').click();await pc.locator('#rematchRuleset').selectOption('classic');await pc.locator('#swapArmies').uncheck();await pc.locator('#proposeRematch').click();await pc.waitForFunction(()=>!busy&&state.ruleset==='classic');
 assert.equal(await pc.evaluate(()=>state.units[1].ap),2);
 // Road extension, group order and live animation use actual validated UI actions.
 const field=await page();await field.addInitScript(()=>localStorage.setItem('ww2-session',JSON.stringify({code:'DD00112233',token:'dsl-human'})));
 await field.goto(base);await field.locator('#game').waitFor({state:'visible'});
 await field.locator('#roster button').first().click();
 // Orders now float over the map; dismiss them to reach a covered destination.
 await field.locator('#mobileOrderToggle').click();
 await field.locator('#map [aria-label^="Move to C5,"]').click();await field.waitForFunction(()=>!busy&&state.revision===1);
 assert.match(await field.locator('#hint').textContent(),/ROAD BONUS/);
 assert.ok(await field.locator('#map .road-bonus').count()>0);
 await field.locator('#map [aria-label^="Move to D5,"]').click();await field.waitForFunction(()=>!busy&&state.revision===2);
 assert.equal(await field.evaluate(()=>state.units[0].ap),1);
 await field.locator('#roster button').nth(1).click();await field.locator('#commandOrders button').click();await field.waitForFunction(()=>!busy&&state.revision===3);
 await field.locator('#roster button').first().click();await field.locator('#mobileOrderToggle').click();await field.locator('#map .unit.de').first().click();await field.locator('#grenade').click();
 await field.locator('#map .effect-explosion').waitFor({state:'attached'});
 assert.equal(await field.evaluate(()=>state.units[0].ap),0);
 await field.locator('#roster button').nth(3).click();await field.locator('#smoke').click();await field.locator('#map .unit.us.selected').click();
 await field.locator('#map .effect-smoke').waitFor({state:'attached'});
 await field.screenshot({path:path.join(temp,'smoke-effect.png'),fullPage:true});
 const revision=await field.evaluate(()=>state.revision);
 await field.waitForFunction(()=>document.querySelectorAll('.battle-effect').length===0);
 assert.equal(await field.evaluate(()=>state.revision),revision);
 await field.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await field.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),true);
 const replay=await page(1280);await replay.emulateMedia({reducedMotion:'reduce'});
 await replay.addInitScript(()=>localStorage.setItem('ww2-session',JSON.stringify({code:'EE00112233',token:'dsl-replay'})));
 await replay.goto(base);await replay.locator('#game').waitFor({state:'visible'});const recorded=await replay.evaluate(()=>state.revision);
 let posts=0;replay.on('request',r=>{if(r.method()==='POST')posts++;});
 await replay.locator('#replayTurn').click();await replay.locator('#pausePlayback').click();await replay.locator('#stepPlayback').click();
 await replay.locator('#playbackMap .effect-explosion').waitFor({state:'attached'});
 assert.equal(await replay.locator('#playbackMap .effect-ring').evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.match(await replay.locator('#playbackResult').textContent(),/Rolled 1/);
 await replay.locator('#skipPlayback').click();assert.equal(posts,0);assert.equal(await replay.evaluate(()=>state.revision),recorded);
 for(const p of [mobile,pc,field])for(const width of [320,390,1280]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);
 console.log('PASS: DSL default, unavailable ASL, LT and group AP, banking/caps, AI playback, exact saved profile, Classic rematch, road bonus, actual grenade/smoke effects, no effect mutations, responsive layouts. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
