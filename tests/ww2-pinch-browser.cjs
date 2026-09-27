const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-pinch-')),base='http://127.0.0.1:8103';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8103','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.db')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;
 browser=await chromium.launch({headless:true,executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(15000);
 await p.goto(base);await p.selectOption('#scenarioSelect','frontier');await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy);
 const cdp=await p.context().newCDPSession(p);
 const read=()=>p.evaluate(()=>{const wrap=$('mapWrap'),svg=$('playbackMap')||$('map'),r=wrap.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,m=svg.getScreenCTM(),point=new DOMPoint(x,y).matrixTransform(m.inverse());return {x,y,width:svg.getBoundingClientRect().width,height:r.height,top:r.top,scrollY,scale:visualViewport.scale,left:wrap.scrollLeft,world:[point.x,point.y],revision:state.revision,selected};});
 async function pinch(factor){
  await p.locator('#mapWrap').scrollIntoViewIfNeeded();
  const before=await read(),points=d=>[{x:before.x-d,y:before.y,id:1},{x:before.x+d,y:before.y,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(45)});
  for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(45*(1+(factor-1)*i/6))});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await read();
  assert.equal(after.scale,before.scale,'Page must not zoom');
  assert.ok(Math.abs(after.height-before.height)<1,'Viewport height must stay fixed');
  assert.ok(Math.abs(after.top-before.top)<1,'Map must not move in page');
  assert.equal(after.revision,before.revision,'Gesture must not issue orders');assert.equal(after.selected,before.selected,'Gesture must not select a unit');
  assert.ok(Math.abs(after.width/before.width-factor)<.05,JSON.stringify({before,after}));
  for(let i=0;i<2;i++)assert.ok(Math.abs(after.world[i]-before.world[i])<3,'Pinch anchor drift');
  return after;
 }
 await pinch(1.45);await pinch(.8);
 const before=await read();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:before.x,y:before.y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:before.x-60,y:before.y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok((await read()).left>before.left+40,'One finger pans the map');
 const size=await p.locator('#map').boundingBox();await p.evaluate(()=>render());
 assert.ok(Math.abs((await p.locator('#map').boundingBox()).width-size.width)<1,'Rendering preserves zoom');
 await p.screenshot({path:path.join(temp,'pinch-mobile.png')});
 await p.locator('#zoom').click();assert.equal(await p.locator('#mapWrap.touch-camera').count(),0);
 assert.equal(await p.evaluate(()=>getComputedStyle(document.body).touchAction),'auto');
 assert.ok(!(await p.locator('meta[name=viewport]').getAttribute('content')).includes('user-scalable=no'));
 // A deliberate tap after pinching still selects a counter normally.
 await p.locator('#map .unit.us').first().tap();assert.ok(await p.evaluate(()=>selected));
 await p.locator('#end').click();await p.waitForFunction(()=>!busy&&playbackSession);
 await p.locator('#pausePlayback').click();await pinch(1.3);
 await p.locator('#skipPlayback').click();assert.equal(await p.locator('#mapWrap.touch-camera').count(),1);
 await p.evaluate(async()=>{await rematchRequest({operation:'propose',scenario:'village',ruleset:'dsl',swap:false});if(playbackSession)stopPlayback();});
 assert.equal(await p.locator('#mapWrap.touch-camera').count(),0,'New battle resets camera');
 await pinch(1.4);
 await p.setViewportSize({width:1440,height:900});await p.waitForFunction(()=>window.ww2Desktop?.active);
 assert.equal(await p.locator('#mapWrap.touch-camera').count(),0,'Desktop takes over camera sizing');
 await pinch(1.2);
 assert.deepEqual(errors,[]);console.log('Map pinch, anchor, pan, click guard, reset, small/large maps, desktop and replay passed. '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
