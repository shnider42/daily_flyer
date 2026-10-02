/* Real touch/mouse input plus delayed, rejected and lost movement replies.
   Previewing a destination must never mutate authoritative game state. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-move-feedback-'),base='http://127.0.0.1:8143';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8143','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'db.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
const gate=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
const snapshot=p=>p.evaluate(()=>({revision:state.revision,units:state.units,legal:state.legal,visible:state.visible_hexes,air:state.visible_air_hexes,contacts:state.contacts}));
const camera=p=>p.locator('#mapWrap').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),left:n.scrollLeft,top:n.scrollTop}));
async function tapHex(p,pos,touch){
 const point=await p.evaluate(pos=>{const [x,y]=center(...pos),p=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM());return {x:p.x,y:p.y};},pos);
 if(touch)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
}
async function plan(p){
 return p.evaluate(()=>{
  const u=state.units.find(u=>u.side===state.side&&['squad','destroyer'].includes(u.kind)&&state.legal[u.id]?.moves.some(m=>!m.threats)&&state.units.filter(v=>v.hp>0&&!v.reserve&&!v.carrier_id&&v.pos.join(',')===u.pos.join(',')).length===1);
  chooseUnit(u);focusMapUnit(u);
  const move=state.legal[u.id].moves.find(m=>!m.threats);
  return {id:u.id,pos:u.pos,destination:move.pos,cost:move.cost,ap:u.ap};
 });
}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/dsl-chromium153',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const touch of [true,false])for(const scenario of ['midway','fubar']){
  const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:720},isMobile:touch,hasTouch:touch});p.setDefaultTimeout(15000);
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(base);await p.waitForFunction(()=>scenarios.length);
  await p.evaluate(async scenario=>{
   const originalRefresh=refresh;window.testRefreshEnabled=false;refresh=()=>window.testRefreshEnabled?originalRefresh():Promise.resolve();
   remember(await api('/api/match',{scenario,ruleset:'dsl',opponent:'computer'}));state=await apiWithSession(session);render();
  },scenario);
  await p.waitForFunction(()=>innerWidth>=1100?ww2Desktop?.active:ww2Mobile?.active);
  await p.evaluate(()=>{
   const own=state.units.filter(u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id),saved=own.map(u=>[$('map')._counters.get(u.id),$('map')._counters.get(u.id)?.querySelector('.unit-art')]);
   for(const u of own){
    chooseUnit(u);
    const view=signalSnapshot(state),expected=view.units.filter(v=>v.hp>0&&!v.reserve&&!v.carrier_id).map(v=>v.id).sort(),actual=[...$('map').querySelectorAll('.unit')].map(g=>g.dataset.unitId).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Retained counters disagree with the public platoon view');
    if($('map').querySelectorAll('.fog-layer polygon').length!==state.map.flat().length-view.visible_hexes.length)throw new Error('Fog differs from the public view');
    if(saved.some(([g,art])=>!g?.isConnected||!art?.isConnected))throw new Error('Selection recreated an unchanged friendly counter or picture');
   }
  });
  const code=await p.evaluate(()=>state.code),url=`**/api/match/${code}`;
  const move=await plan(p);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const cam=await camera(p);
  // Physical input selects the unit; a selection alone keeps the camera still.
  await p.evaluate(()=>{selected=null;render();});await tapHex(p,move.pos,touch);
  assert.equal(await p.evaluate(()=>selected),move.id);assert.deepEqual(await camera(p),cam);
  const before=await snapshot(p),held=gate();let requests=0;
  await p.route(url,async route=>{if(route.request().method()!=='POST')return route.continue();requests++;await held.promise;await route.continue();});
  await tapHex(p,move.destination,touch);
  await p.waitForFunction(()=>busy&&ww2MoveFeedback.pending);
  assert.deepEqual(await snapshot(p),before,'No speculative AP, position, fog, contacts or legal orders');
  assert.equal(await p.locator('#map .move-pending').count(),1);assert.ok(await p.locator('#moveStatus').isVisible());
  const translated=await p.evaluate(move=>{
   const c=$('map')._counters.get(move.id),m=c.transform.baseVal.consolidate().matrix,[x,y]=center(...move.pos),[dx,dy]=center(...move.destination);
   return Math.abs(m.e-(dx-x))<.01&&Math.abs(m.f-(dy-y))<.01;
  },move);assert.ok(translated,'Counter immediately acknowledges the requested destination');
  await tapHex(p,move.destination,touch);await p.evaluate(()=>render());
  assert.equal(requests,1,'Repeated taps cannot submit duplicate orders');
  assert.ok(await p.locator('#map .move-pending').count(),'A view render cannot remove a pending preview');
  assert.deepEqual(await camera(p),cam);
  if(touch&&scenario==='fubar')await p.screenshot({path:path.join(temp,'pending-phone.png')});
  held.release();await p.waitForFunction(r=>!busy&&state.revision>r,before.revision);
  const confirmed=await snapshot(p),u=confirmed.units.find(u=>u.id===move.id);
  assert.deepEqual(u.pos,move.destination);assert.equal(u.ap,move.ap-move.cost);
  assert.equal(await p.locator('.move-pending,.move-pending-mark').count(),0);assert.equal(await p.evaluate(()=>ww2MoveFeedback.pending),false);
  await p.unroute(url);
  // The server may reject a stale move. Clear only the preview, not live state.
  const rejected=await plan(p),preReject=await snapshot(p),rejectGate=gate();requests=0;
  await p.route(url,async route=>{if(route.request().method()!=='POST')return route.continue();requests++;await rejectGate.promise;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'The battle changed; refresh and try again.'})});});
  await p.evaluate(()=>{window.testRefreshEnabled=true;});await tapHex(p,rejected.destination,touch);await p.waitForFunction(()=>ww2MoveFeedback.pending);
  rejectGate.release();await p.waitForFunction(()=>!busy&&!polling&&!ww2MoveFeedback.pending);
  assert.equal(requests,1);assert.deepEqual(await snapshot(p),preReject);assert.equal(await p.locator('.move-pending,.move-pending-mark').count(),0);
  assert.match(await p.locator('#message').textContent(),/battle changed/);await p.unroute(url);
  // Lost acknowledgement AFTER a successful commit: GET reconciles it. Never
  // retry a random/damage-bearing POST whose outcome is uncertain.
  const lost=await plan(p),preLost=await snapshot(p),lostGate=gate();requests=0;
  await p.route(url,async route=>{if(route.request().method()!=='POST')return route.continue();requests++;const response=await route.fetch();assert.equal(response.status(),200,await response.text());await lostGate.promise;await route.abort('failed');});
  await tapHex(p,lost.destination,touch);await p.waitForFunction(()=>ww2MoveFeedback.pending);lostGate.release();
  try{await p.waitForFunction(r=>!busy&&!polling&&state.revision>r,preLost.revision);}catch(error){console.error('Lost-ack recovery',scenario,touch,await p.evaluate(()=>({busy,polling,revision:state.revision,enabled:window.testRefreshEnabled,message:$('message').textContent,connection:$('connection').textContent})),errors);throw error;}
  assert.equal(requests,1);assert.deepEqual((await snapshot(p)).units.find(u=>u.id===lost.id).pos,lost.destination);
  assert.equal(await p.locator('.move-pending,.move-pending-mark').count(),0);await p.unroute(url);
  // Synthetic server outcome: reaction fire halts a move and destroys the
  // unit. The client must accept that outcome, never promote its preview.
  const stopped=await plan(p),correctionGate=gate();
  await p.evaluate(()=>{window.testRefreshEnabled=false;});
  const corrected=await p.evaluate(id=>{const s=structuredClone(state),u=s.units.find(u=>u.id===id);u.hp=0;u.ap=0;s.revision++;return s;},stopped.id);
  await p.route(url,async route=>{if(route.request().method()!=='POST')return route.continue();await correctionGate.promise;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corrected)});});
  await tapHex(p,stopped.destination,touch);await p.waitForFunction(()=>ww2MoveFeedback.pending);correctionGate.release();
  await p.waitForFunction(r=>!busy&&state.revision===r,corrected.revision);
  assert.equal(await p.locator(`#map .unit[data-unit-id="${stopped.id}"]`).count(),0);
  assert.deepEqual((await snapshot(p)).units.find(u=>u.id===stopped.id).pos,stopped.pos);
  assert.equal(await p.locator('.move-pending,.move-pending-mark').count(),0);await p.unroute(url);
  console.log(`${scenario} ${touch?'touch':'mouse'}: immediate preview, unchanged fog/AP, stable camera, one POST, success, rejection and lost-ack recovery passed`);
  await p.close();
 }
 assert.deepEqual(errors,[]);console.log('Move feedback regressions passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
