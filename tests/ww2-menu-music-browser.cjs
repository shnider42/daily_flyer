// Full app, disposable database, real MP3 decoding. No production game writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-music-'));
const base='http://127.0.0.1:8116',asset='/assets/audio/battlefield-1942-full-arrangement-v1.mp3';
const bytes=fs.readFileSync(path.join(__dirname,'../ww2_tactics/static/audio/battlefield-1942-full-arrangement-v1.mp3'));
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8116','--workers','1','--threads','4'],{cwd:path.join(__dirname,'..'),env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
const playing=p=>p.waitForFunction(()=>!document.getElementById('menuMusic').paused&&document.getElementById('menuMusic').currentTime>0);
const paused=p=>p.waitForFunction(()=>document.getElementById('menuMusic').paused);
(async()=>{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'Local game server starts');
 const response=await fetch(base+asset);
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^audio\/mpeg/);
 assert.match(response.headers.get('cache-control'),/immutable/);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes,'Asset route preserves approved audio bytes');
 const range=await fetch(base+asset,{headers:{Range:'bytes=0-1023'}});
 assert.equal(range.status,206);assert.match(range.headers.get('cache-control'),/immutable/);
 assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(0,1024));
 browser=await chromium.launch({headless:true,timeout:20000,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--no-zygote','--disable-gpu','--disable-software-rasterizer','--autoplay-policy=user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 let downloads=0;p.on('request',r=>{if(r.url().includes(asset))downloads++;});
 await p.goto(base);await p.locator('#menuMusicControls').waitFor();
 await paused(p);assert.equal(downloads,0,'No download before first interaction');
 await p.locator('#entryStatus').click();await playing(p);
 const media=await p.locator('#menuMusic').evaluate(a=>({duration:a.duration,loop:a.loop,volume:a.volume}));
 assert.ok(media.duration>=160&&media.duration<161,JSON.stringify(media));
 assert.equal(media.loop,true);assert.equal(media.volume,.35);
 await p.locator('#menuMusic').evaluate(a=>{a.currentTime=a.duration-.15;});
 await p.waitForFunction(()=>{const a=document.getElementById('menuMusic');return !a.paused&&a.currentTime<2;});
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:900});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No overflow at ${width}`);
  await p.screenshot({path:path.join(temp,`music-${width}.png`)});
 }
 await p.locator('#menuMusicToggle').click();await paused(p);
 assert.equal(await p.locator('#menuMusicToggle').getAttribute('aria-pressed'),'false');
 downloads=0;await p.reload();await p.locator('#menuMusicControls').waitFor();
 await p.locator('#entryStatus').click();await paused(p);assert.equal(downloads,0,'Mute survives reload and gestures');
 await p.locator('#menuMusicToggle').click();await playing(p);
 await p.locator('#menuMusic').evaluate(a=>{a.currentTime=30;});
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await paused(p);
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));await playing(p);
 assert.ok(await p.locator('#menuMusic').evaluate(a=>a.currentTime>=30),'Resume retains position');
 // Exercise visibility handling deterministically, independent of headless tab focus.
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await paused(p);
 await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await playing(p);
 await p.locator('#modeEmpires').click();await paused(p);
 await p.locator('#modeDSL').click();await playing(p);
 await p.locator('#createSolo').click();await p.locator('#startSolo').click();
 await p.waitForFunction(()=>state&&!busy&&!document.getElementById('game').hidden);await paused(p);
 await p.locator('#homeBattles').click();await playing(p);
 // Native play() rejection must be handled and leave an explicit retry.
 await p.locator('#menuMusicToggle').click();await paused(p);
 await p.locator('#menuMusic').evaluate(a=>{const play=a.play.bind(a);a.play=()=>{a.play=play;return Promise.reject(new DOMException('Gesture required','NotAllowedError'));};});
 await p.locator('#menuMusicToggle').click();await p.waitForFunction(()=>document.getElementById('menuMusicToggle').textContent==='Music: retry');
 await p.locator('#menuMusicToggle').click();await playing(p);
 assert.deepEqual(errors,[]);
 // A touch device starts through the same gesture path, even without storage.
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await mobile.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage unavailable');};Storage.prototype.setItem=()=>{throw new Error('Storage unavailable');};});
 const phone=await mobile.newPage();await phone.goto(base);await phone.locator('#menuMusicControls').waitFor();
 await phone.locator('#entryStatus').tap();await playing(phone);
 await phone.locator('#menuMusicToggle').tap();await paused(phone);
 // Muting while the first download is pending must not restart it on completion.
 const pendingContext=await browser.newContext(),slow=await pendingContext.newPage();
 const slowErrors=[];slow.on('pageerror',e=>slowErrors.push(e.message));
 let release,requested;
 const requestedPromise=new Promise(r=>requested=r);
 await slow.route('**'+asset,async route=>{requested();await new Promise(r=>release=r);await route.fulfill({status:200,contentType:'audio/mpeg',body:bytes});});
 await slow.goto(base);await slow.locator('#entryStatus').click();await requestedPromise;
 await slow.locator('#menuMusicToggle').click();release();await paused(slow);
 await slow.waitForTimeout(300);await paused(slow);assert.deepEqual(slowErrors,[]);
 await pendingContext.close();await mobile.close();await context.close();
 console.log('PASS: audio bytes/ranges, real 2:40 decoding and loop, gesture/touch start, mute persistence, battle/menu/Empires, lifecycle, blocked storage, rejected and pending playback. Screenshots:',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
