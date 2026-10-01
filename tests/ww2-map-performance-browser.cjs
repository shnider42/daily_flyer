/* Real HTTP orders with a 4x CPU throttle; navigation must retain static terrain. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-map-performance-'),base='http://127.0.0.1:8131';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8131','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-preview-chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of [true,false]){
  const p=await browser.newPage({viewport:{width:mobile?390:1440,height:mobile?844:1000},isMobile:mobile,hasTouch:mobile}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(20000);
  await p.goto(base);await p.waitForFunction(()=>scenarios.length);
  await p.evaluate(async()=>{remember(await api('/api/match',{scenario:'tidal_gate',ruleset:'dsl',opponent:'computer'}));await refresh();});
  const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const timing=await p.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),now=()=>performance.now(),svg=$('map');
   const tile=svg.querySelector('.hex'),art=svg.querySelector('.terrain-art'),out={nodes:svg.querySelectorAll('*').length};
   await frame();let t=now();for(const id of ['us-A-1','us-A-3','us-A-8','us-HQ-1'])chooseUnit(state.units.find(u=>u.id===id));out.selection4=now()-t;
   t=now();state=structuredClone(state);render();out.freshRender=now()-t;
   out.retainedAfterRefresh=tile===svg.querySelector('.hex')&&art===svg.querySelector('.terrain-art');
   // Discard initial repaint before measuring sustained camera movement.
   await frame();await frame();const intervals=[];let previous=now();
   for(let i=0;i<40;i++){const w=$('mapWrap');w.scrollLeft=200+Math.sin(i*.3)*150;w.scrollTop=300+i*8;await frame();const n=now();intervals.push(n-previous);previous=n;}
   out.panMedian=intervals.sort((a,b)=>a-b)[20];out.panP95=intervals[38];
   const u=state.units.find(u=>state.legal[u.id]?.moves.length);chooseUnit(u);focusMapUnit(u);
   const move=state.legal[u.id].moves[0],ap=u.ap,rect=$('mapWrap').getBoundingClientRect(),camera=[$('mapWrap').scrollLeft,$('mapWrap').scrollTop];
   performance.clearResourceTimings();t=now();await act({kind:'move',unit:u.id,pos:move.pos});out.move=now()-t;
   out.extraFullGets=performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/api/match/'+session.code)).length-1;
   out.pos=state.units.find(v=>v.id===u.id).pos;out.expectedPos=move.pos;out.ap=state.units.find(v=>v.id===u.id).ap;out.expectedAP=ap-move.cost;
   out.retainedAfterMove=tile===svg.querySelector('.hex')&&art===svg.querySelector('.terrain-art');
   out.viewportStable=Math.abs($('mapWrap').getBoundingClientRect().top-rect.top)<2&&Math.abs($('mapWrap').getBoundingClientRect().height-rect.height)<2;
   out.cameraStable=Math.abs($('mapWrap').scrollLeft-camera[0])<2&&Math.abs($('mapWrap').scrollTop-camera[1])<2;
   out.fogCount=svg.querySelectorAll('.fog-layer polygon').length;out.expectedFog=state.map.flat().length-state.visible_hexes.length;
   // Reused geography must still replace transient overlays as state changes.
   state=structuredClone(state);state.smoke=[{pos:[6,30]}];state.barrages=[{pos:[8,30],area:[[8,30],[9,30]],ttl:1}];render();
   out.effects=[svg.querySelectorAll('.smoke-cloud').length,svg.querySelectorAll('.barrage-zone').length];
   state=structuredClone(state);state.smoke=[];state.barrages=[];render();
   out.cleared=svg.querySelectorAll('.smoke-cloud,.barrage-zone,.incoming-mark').length;
   return out;
  });
  assert.ok(timing.nodes<8000,'Keep large-map SVG complexity bounded');
  assert.ok(timing.retainedAfterRefresh&&timing.retainedAfterMove,'Server revisions retain unchanged geography');
  assert.equal(timing.extraFullGets,0,'Successful order must not fetch the full state a second time');
  assert.deepEqual(timing.pos,timing.expectedPos);assert.equal(timing.ap,timing.expectedAP);
  assert.ok(timing.viewportStable&&timing.cameraStable,'Orders preserve the viewport and camera');
  assert.equal(timing.fogCount,timing.expectedFog);assert.deepEqual(timing.effects,[1,2]);assert.equal(timing.cleared,0);
  // Real touch events: local pinch and drag remain independent of orders.
  if(mobile){
   const camera=await p.evaluate(()=>{const w=$('mapWrap'),r=w.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,width:$('map').getBoundingClientRect().width,revision:state.revision,left:w.scrollLeft,scale:visualViewport.scale};});
   const points=d=>[{x:camera.x-d,y:camera.y,id:1},{x:camera.x+d,y:camera.y,id:2}];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(45)});
   for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(45+i*4)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const zoom=await p.evaluate(()=>({width:$('map').getBoundingClientRect().width,revision:state.revision,scale:visualViewport.scale,left:$('mapWrap').scrollLeft}));
   assert.ok(zoom.width>camera.width*1.4);assert.equal(zoom.scale,camera.scale);assert.equal(zoom.revision,camera.revision);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:camera.x,y:camera.y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:camera.x-60,y:camera.y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.ok(await p.evaluate(left=>$('mapWrap').scrollLeft>left+40,zoom.left));
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await p.screenshot({path:path.join(temp,mobile?'phone.png':'desktop.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({mobile,...timing}));await p.close();
 }
 console.log('Map performance and live-order regressions passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
