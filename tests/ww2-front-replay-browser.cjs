/* Actual engine-generated mission frames; playback must never show final scores early. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-front-replay-'),db=path.join(temp,'game.sqlite'),base='http://127.0.0.1:8148';
cp.execFileSync('python',['-c',`
import sys,json,sqlite3,hashlib
from unittest.mock import patch
from ww2_web import create_app
from ww2_tactics.engine import initial
from ww2_tactics.computer import play_turn
create_app(sys.argv[1])
for name,code in [('dunkirk','DUNKREPLAY'),('kharkov','TANKREPLAY')]:
 s=initial(name,'dsl'); s.update(ready=True,ai_side='us' if name=='dunkirk' else 'de',turn='us' if name=='dunkirk' else 'de')
 if name=='dunkirk':
  boat=next(u for u in s['units'] if u['kind']=='landing_craft');troop=next(u for u in s['units'] if u.get('evacuee'));boat.update(pos=[3,0],ap=1);troop.update(pos=[3,0],carrier_id=boat['id']); orders=iter([dict(kind='evacuate',unit=boat['id']),dict(kind='end')])
 else:
  next(u for u in s['units'] if u['side']=='de' and u['kind']=='tank')['pos']=[11,10];orders=iter([dict(kind='end')])
 with patch('ww2_tactics.computer.choose_order',side_effect=lambda *args:next(orders)):s=play_turn(s,roll=lambda:6)
 with sqlite3.connect(sys.argv[1]) as d:
  human=hashlib.sha256(b'human').hexdigest(); ai=hashlib.sha256(b'ai').hexdigest();d.execute('INSERT INTO match (code,host,guest,state) VALUES (?,?,?,?)',(code,ai if name=='dunkirk' else human,human if name=='dunkirk' else ai,json.dumps(s)))
`,db]);
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8148','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const code of ['DUNKREPLAY','TANKREPLAY']){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];let posts=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts++;});
  await page.addInitScript(code=>localStorage.setItem('ww2-session',JSON.stringify({code,token:'human'})),code);
  await page.goto(base);await page.locator('.saved-session').first().click();await page.waitForFunction(()=>!!state&&!busy);
  const read=async()=>await(await fetch(base+'/api/match/'+code,{headers:{Authorization:'Bearer human'}})).json();const before=await read();
  await page.evaluate(()=>{startPlayback();playbackSession.paused=true;clearTimeout(playbackTimer);drawPlayback();});
  if(code==='DUNKREPLAY'){assert.match(await page.locator('#objective').textContent(),/Rescued 0\/6/);assert.match(await page.locator('#battleMission').textContent(),/Rescued 0\/6/);}
  else{assert.match(await page.locator('#objective').textContent(),/Germans 0\/10/);assert.equal(await page.locator('#playbackMap .front-objectives').count(),1);}
  await page.locator('#stepPlayback').click();
  if(code==='DUNKREPLAY'){assert.match(await page.locator('#objective').textContent(),/Rescued 1\/6/);assert.match(await page.locator('#battleMission').textContent(),/Rescued 1\/6/);assert.match(await page.locator('#playbackResult').textContent(),/Rescued units: 0 → 1/);}
  else{assert.match(await page.locator('#objective').textContent(),/Germans 2\/10/);assert.match(await page.locator('#playbackResult').textContent(),/Flag score/);}
  await page.evaluate(()=>stopPlayback());assert.deepEqual(await read(),before);assert.equal(posts,0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Mission playback: recorded rescue and flag scores, before/after order, public-only manifests, zero POSTs and unchanged saved state passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
