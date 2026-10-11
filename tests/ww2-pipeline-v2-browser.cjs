/* Real production worker, client disconnect/reconnect, and bounded replay pages. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dsl-pipeline-')),db=path.join(temp,'game.sqlite'),base='http://127.0.0.1:8188';
cp.execFileSync('python',['-c',`
import sys,sqlite3,json,hashlib
from ww2_web import create_app
from ww2_tactics.engine import initial,apply,options
from ww2_tactics.visibility import view
create_app(sys.argv[1]);s=initial('current:worlds_collide','dsl');s.update(ready=True,ai_side='de');frames=[]
for uid in [u['id'] for u in s['units'] if u['side']=='us']:
    u=next(u for u in s['units'] if u['id']==uid)
    if not options(s,u).get('dig'):continue
    action=dict(kind='dig',unit=uid);before=view(s,'us');s=apply(s,'us',action,roll=lambda:4)
    frames.append(dict(action=action,before=before,after=view(s,'us'),effects=[],combat=[]))
    if len(frames)==36:break
assert len(frames)>20
s['computer_playback']=dict(id=s['revision'],frames=frames)
with sqlite3.connect(sys.argv[1]) as db:db.execute('INSERT INTO match(code,host,guest,state) VALUES (?,?,?,?)',('EEDDCCBBAA',hashlib.sha256(b'replay-human').hexdigest(),hashlib.sha256(b'computer').hexdigest(),json.dumps(s)))
`,db],{env:{...process.env,WW2_BACKGROUND_AI:'0'}});
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8188','--workers','1','--threads','4','--timeout','120'],{env:{...process.env,WW2_DB_PATH:db,WW2_BACKGROUND_AI:'1'},stdio:'ignore'});
let browser;const errors=[];
async function open(width){const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.waitForFunction(()=>scenarios.length);return p;}
async function resume(p,saved){await p.evaluate(async saved=>{remember(saved);await refresh();},saved);await p.waitForFunction(()=>state&&!busy&&!polling);}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 let p=await open(1440),moveReply,moveBody;
 await p.evaluate(async()=>{remember(await api('/api/match',{opponent:'computer',ruleset:'dsl'}));await refresh();});
 const saved=await p.evaluate(()=>({...session}));
 p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/match/'+saved.code)){const body=r.postDataJSON();if(body.kind==='move')moveBody=body;}});
 p.on('response',async r=>{if(r.request().method()==='POST'&&r.url().endsWith('/api/match/'+saved.code)&&r.request().postDataJSON().kind==='move')moveReply=await r.json();});
 await p.evaluate(async()=>{const uid=Object.keys(state.legal).find(uid=>state.legal[uid].moves.length),m=state.legal[uid].moves[0];await act({kind:'move',unit:uid,pos:m.pos});});
 await p.waitForFunction(()=>!busy&&!polling);assert.ok(moveReply.delta);assert.ok(JSON.stringify(moveBody).length<200);assert.ok(JSON.stringify(moveReply).length<5000);assert.ok(moveBody.command_id);
 await p.evaluate(()=>act({kind:'end'}));await p.close();
 // No browser and no HTTP requests: wait only by reading the disposable DB.
 cp.execFileSync('python',['-c',`
import sys,sqlite3,json,time
deadline=time.monotonic()+8
while time.monotonic()<deadline:
    with sqlite3.connect(sys.argv[1]) as db:s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
    if s['turn']=='us' and s['round']==2:break
    time.sleep(.02)
else:raise AssertionError('Computer needed the browser to continue')
`,db,saved.code]);
 p=await open(390);await resume(p,saved);assert.equal(await p.evaluate(()=>state.round),2);assert.equal(await p.evaluate(()=>state.computer_work.pending),false);await p.close();
 const replaySeat={code:'EEDDCCBBAA',token:'replay-human'},auth={Authorization:'Bearer '+replaySeat.token,'X-WW2-Protocol':'2'};
 const read=async()=>await(await fetch(base+'/api/match/EEDDCCBBAA',{headers:auth})).json();
 const before=await read();assert.ok(before.computer_playback.count>20);assert.equal(before.computer_playback.frames,undefined);
 for(const width of [1440,390]){
  p=await open(width);let posts=0;const pages=[];
  p.on('request',r=>{if(r.method()==='POST')posts++;});p.on('response',async r=>{if(r.url().includes('/replay/'))pages.push(await r.json());});
  await resume(p,replaySeat);assert.equal(await p.locator('#playbackPanel').isVisible(),false,'Large recordings never auto-block the battle');
  if(!(await p.locator('#replayTurn').isVisible())){
   const menu=p.locator(width<1000?'#mobileMenuOpen':'#experimentalBattleOpen');
   await menu.click();
  }
  await p.locator('#replayTurn').click();await p.locator('#pausePlayback').click();
  await p.waitForFunction(()=>playbackSession?.paused&&!playbackSession.loading&&playbackSession.frames[0]);
  for(let i=0;i<24;i++)await p.locator('#stepPlayback').click();
  await p.waitForFunction(()=>playbackSession?.loadedStart===12&&!playbackSession.loading);
  assert.equal(await p.evaluate(()=>playbackSession.frames[0]),undefined,'Release the previous page');
  assert.ok(pages.every(page=>page.events.length<=12));assert.ok(pages.length>=2);
  await p.locator('#skipPlayback').click();assert.equal(await p.locator('#orders').evaluate(e=>e.inert),false);
  assert.equal(posts,0);assert.deepEqual(await read(),before);
  await p.screenshot({path:path.join(temp,width+'.png')});await p.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: compact real move; AI completes with all browsers closed and no HTTP; reconnect; Current large replay opt-in, two 12-event pages, old-page release, step/pause/skip, unchanged state and zero replay POSTs on desktop/phone.',temp);
})().catch(e=>{console.error(e,errors);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
