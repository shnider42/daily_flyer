// Replay a deterministic real-engine combat recording in an isolated test database.
const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-playback-')),db=path.join(temp,'match.sqlite3'),base='http://127.0.0.1:8094';
cp.execFileSync('python',['-c',`
import sys,sqlite3,json,hashlib
from unittest.mock import patch
from ww2_web import create_app
from ww2_tactics.engine import initial
from ww2_tactics.computer import play_turn
create_app(sys.argv[1]);s=initial();s.update(ready=True,ai_side='us')
s['units'][0]['pos']=[3,5];s['units'][5]['pos']=[3,4]
actions=iter([dict(kind='fire',unit='us0',target='de0'),dict(kind='end')])
with patch('ww2_tactics.computer.choose_order',side_effect=lambda *args:next(actions)): s=play_turn(s,roll=lambda:5)
with sqlite3.connect(sys.argv[1]) as db: db.execute('INSERT INTO match VALUES (1,?,?,?,?)',('AABBCCDDEE',hashlib.sha256(b'computer').hexdigest(),hashlib.sha256(b'human').hexdigest(),json.dumps(s)))
`,db]);
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8094','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>localStorage.setItem('ww2-session',JSON.stringify({code:'AABBCCDDEE',token:'human'})));
 let posts=0;const errors=[];page.on('request',r=>{if(r.method()==='POST')posts++;});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#game').waitFor({state:'visible'});
 const read=async()=>await(await fetch(base+'/api/match/AABBCCDDEE',{headers:{Authorization:'Bearer human'}})).json();
 const before=await read();
 await page.locator('#replayTurn').click();await page.locator('#pausePlayback').click();
 assert.match(await page.locator('#playbackMap .unit.de .strength').first().textContent(),/●●●/);
 await page.locator('#stepPlayback').click();
 assert.match(await page.locator('#playbackResult').textContent(),/Rolled 5 · needed 5\+/);
 assert.match(await page.locator('#playbackMap .unit.de .strength').first().textContent(),/●● ·/);
 assert.equal(await page.locator('#playbackMap .unit.de .pin').count(),1);
 await page.screenshot({path:path.join(temp,'recorded-fire.png'),fullPage:true});
 for(const width of [320,375,430,768]){await page.setViewportSize({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.locator('#pausePlayback').click();
 await page.locator('#playbackPanel').waitFor({state:'hidden'});
 assert.equal(await page.locator('#orders').evaluate(e=>e.inert),false);
 assert.deepEqual(await read(),before);
 await page.locator('#replayTurn').click();await page.reload();
 await page.locator('#game').waitFor({state:'visible'});
 assert.equal(await page.locator('#playbackPanel').isVisible(),false);
 assert.deepEqual(await read(),before);assert.equal(posts,0);assert.deepEqual(errors,[]);
 console.log('PASS: real recorded die/HP/pin, automatic completion, replay, reload mid-playback, zero POSTs, unchanged server state, phone widths. Screenshot: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
