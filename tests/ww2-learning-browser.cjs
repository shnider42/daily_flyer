const {tap}=require('./ww2-ui-helpers.cjs');
const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-learning-')),base='http://127.0.0.1:8100';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8100','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const errors=[],p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(10000);
 await p.goto(base);await tap(p,p.locator('#createSolo'));await tap(p,p.locator('#startSolo'));await p.waitForFunction(()=>state&&!busy);
 const original=await p.evaluate(()=>({code:session.code,revision:state.revision,token:session.token}));
 assert.equal(await p.locator('#simpleToggle').getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('#terrainToggle').textContent(),'Terrain: detailed');
 assert.equal(await p.locator('#unitStyleToggle').textContent(),'Units: illustrated');
 assert.equal(await p.locator('#tutorialCoach').isVisible(),false,'Learning is opt-in');
 await tap(p,p.locator('#leave'));await tap(p,p.locator('#learnStart'));await p.waitForFunction(()=>state&&!busy&&document.body.classList.contains('simple-play'));
 assert.notEqual(await p.evaluate(()=>session.code),original.code);assert.equal(await p.locator('#tutorialCoach').isVisible(),true);
 await tap(p,p.locator('#lessonNext'));await tap(p,p.locator('#map .unit.us').first());
 assert.match(await p.locator('#lessonTitle').textContent(),/Move/);
 assert.match(await p.locator('#mobileOrderToggle').textContent(),/2 AP/);
 assert.ok((await p.locator('#mobileOrderBody').boundingBox()).height<=844*.34+1);
 assert.equal(await p.locator('#unitMechanics').isVisible(),false);
 await tap(p,p.locator('#smoke'));assert.match(await p.locator('#smoke').textContent(),/Cancel smoke/);
 await tap(p,p.locator('#smoke'));
 await tap(p,p.locator('#map .hex.move').first());await p.waitForFunction(()=>!busy&&state.revision===1);
 assert.match(await p.locator('#lessonTitle').textContent(),/Spend actions/);
 assert.equal(await p.locator('#mobileOrderBody').isVisible(),true);
 const before=await p.evaluate(()=>JSON.stringify(state));await tap(p,p.locator('#simpleToggle'));await tap(p,p.locator('#simpleToggle'));
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);
 const terrainBefore=await p.evaluate(()=>({state:JSON.stringify(state),left:$('mapWrap').scrollLeft,top:$('mapWrap').scrollTop}));
 assert.equal(await p.locator('#map .terrain-art').count(),63);
 await tap(p,p.locator('#terrainToggle'));assert.equal(await p.locator('#map .terrain-art').count(),0);
 assert.equal(await p.locator('#terrainToggle').textContent(),'Terrain: basic');
 await tap(p,p.locator('#terrainToggle'));assert.equal(await p.locator('#map .terrain-art').count(),63);
 assert.deepEqual(await p.evaluate(()=>({state:JSON.stringify(state),left:$('mapWrap').scrollLeft,top:$('mapWrap').scrollTop})),terrainBefore);
 assert.equal(await p.locator('#map .unit-art').count(),10);
 const originalStrength=await p.locator('#map .strength').allTextContents();
 await tap(p,p.locator('#unitStyleToggle'));assert.equal(await p.locator('#map .unit-art').count(),0);
 assert.equal(await p.locator('#map .terrain-art').count(),63);
 assert.deepEqual(await p.locator('#map .strength').allTextContents(),originalStrength);
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),terrainBefore.state);
 await p.reload();await tap(p,p.locator('.saved-session').first());await p.waitForFunction(()=>state&&!busy);assert.equal(await p.locator('#simpleToggle').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#tutorialCoach').isVisible(),true);
 assert.equal(await p.locator('#unitStyleToggle').textContent(),'Units: classic');
 await tap(p,p.locator('#unitStyleToggle'));assert.equal(await p.locator('#map .unit-art').count(),10);
 await tap(p,p.locator('#roster button').nth(2));await tap(p,p.locator('#dig'));await p.waitForFunction(()=>!busy&&state.revision===2);
 assert.equal(await p.locator('#map .counter-sandbags').count(),1);
 await tap(p,p.locator('#roster button').nth(3));await tap(p,p.locator('#overwatch'));await p.waitForFunction(()=>!busy&&state.revision===3);
 assert.equal(await p.locator('#map .counter-overwatch').count(),1);
 // Browser automation clicks auto-scroll targets; invoke the same selection handler to
 // measure only game-caused movement, including preserved manual pan in enlarged view.
 await p.locator('#mapWrap').scrollIntoViewIfNeeded();
 const stability=await p.evaluate(()=>{
  const wrap=$('mapWrap'),read=()=>{const r=wrap.getBoundingClientRect();return [r.top,r.left,wrap.scrollLeft,wrap.scrollTop];};
  const checks=[],units=state.units.filter(u=>u.side===state.side);
  let before=read();chooseUnit(units[0]);checks.push([before,read()]);
  before=read();chooseUnit(units[1]);checks.push([before,read()]);
  before=read();$('smoke').click();checks.push([before,read()]);$('smoke').click();
  $('zoom').click();wrap.scrollTo(65,90);before=read();chooseUnit(units[2]);checks.push([before,read()]);
  before=read();render();checks.push([before,read()]);
  $('zoom').click();return checks;
 });
 for(const [before,after] of stability)before.forEach((value,i)=>assert.ok(Math.abs(value-after[i])<=1,`Map moved: ${before} -> ${after}`));
 await tap(p,p.locator('#roster button').nth(1));
 // Every order fits simultaneously, without internal scrolling or covering the map.
 for(const width of [320,390]){
  await p.setViewportSize({width,height:844});
  const layout=await p.evaluate(()=>{const grid=$('orders'),r=grid.getBoundingClientRect(),dock=$('mobileOrderDock').getBoundingClientRect(),map=$('mapWrap').getBoundingClientRect();return {top:dock.top,mapBottom:map.bottom,overflow:grid.scrollWidth-grid.clientWidth,vertical:grid.scrollHeight-grid.clientHeight,cards:[...grid.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>{const a=b.getBoundingClientRect();return {height:b.clientHeight,content:b.scrollHeight,wide:b.scrollWidth-b.clientWidth,inside:a.left>=r.left&&a.right<=r.right+1&&a.top>=r.top&&a.bottom<=r.bottom+1};})};});
  assert.ok(layout.top>=layout.mapBottom);assert.ok(layout.overflow<=1);assert.ok(layout.vertical<=1);for(const card of layout.cards){assert.ok(card.height>=44);assert.ok(card.content<=card.height+1,JSON.stringify(card));assert.ok(card.wide<=1);assert.ok(card.inside);}
 }
 assert.equal(await p.locator('#mobileActionsMore').count(),0);
 // Stress the grid with every action, beyond what one unit can normally perform.
 // Future additions must expand in normal flow instead of disappearing behind a clip.
 const stress=await p.evaluate(()=>{
  for(const n of $('orders').querySelectorAll('[hidden]'))if(n.tagName==='BUTTON'||n.id==='commandOrders')n.hidden=false;
  document.dispatchEvent(new Event('ww2:render'));
  const grid=$('orders'),r=grid.getBoundingClientRect();
  const result=[...grid.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>{const a=b.getBoundingClientRect();return a.left>=r.left&&a.right<=r.right+1&&a.bottom<=r.bottom+1&&b.scrollWidth<=b.clientWidth+1&&b.scrollHeight<=b.clientHeight+1;})&&r.bottom<=innerHeight;
  render();return result;
 });
 assert.ok(stress,'Every order remains visible even beyond the reserved four rows');
 await tap(p,p.locator('#mobileOrderToggle'));await p.locator('#mobileUnitDetails').waitFor({state:'visible'});await tap(p,p.locator('#mobileUnitDetailsClose'));
 await p.locator('#mobileOrderDock').screenshot({path:path.join(temp,'action-grid.png')});
 await p.locator('#map').screenshot({path:path.join(temp,'illustrated-units.png')});
 await p.screenshot({path:path.join(temp,'mobile.png'),fullPage:true});
 for(const width of [1280,390,1440,320,844,852,390]){
  console.log('Checking width',width);
  await p.setViewportSize({width,height:width===844?390:width===852?320:width===320?568:844});
  await p.waitForFunction(w=>w>=1100?window.ww2Desktop.active&&!document.getElementById('mobileOrderDock'):!!document.getElementById('mobileOrderDock'),width);
  for(const id of ['orders','end','nextUnit','unitMechanics'])assert.equal(await p.locator('#'+id).count(),1);
  assert.equal(await p.locator('#end').isVisible(),true);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width<1100){
   const bounds=await p.evaluate(()=>{const m=$('mapWrap').getBoundingClientRect(),d=$('mobileOrderDock').getBoundingClientRect(),o=$('orders');return {page:document.documentElement.scrollHeight,height:innerHeight,map:m.height,separate:m.bottom<=d.top+1||m.right<=d.left+1,within:d.bottom<=innerHeight+1&&d.right<=innerWidth+1,orders:o.scrollHeight<=o.clientHeight+1&&o.scrollWidth<=o.clientWidth+1};});
   assert.ok(bounds.page<=bounds.height+1,JSON.stringify(bounds));assert.ok(bounds.map>=150);assert.ok(bounds.separate&&bounds.within&&bounds.orders,JSON.stringify(bounds));
   await p.screenshot({path:path.join(temp,`screen-${width}.png`)});
  }
 }
 const nextBefore=await p.evaluate(()=>selected);await tap(p,p.locator('#nextUnit'));assert.notEqual(await p.evaluate(()=>selected),nextBefore);
 await tap(p,p.locator('#previousUnit'));assert.equal(await p.evaluate(()=>selected),nextBefore);
 await tap(p,p.locator('#end'));await p.locator('#playbackPanel').waitFor({state:'visible'});await tap(p,p.locator('#pausePlayback'));
 assert.equal(await p.locator('#playbackMap .terrain-art').count(),63);
 assert.equal(await p.locator('#playbackMap .unit-art').count(),await p.locator('#playbackMap .unit').count());
 const replayBefore=await p.evaluate(()=>JSON.stringify(state));
 await tap(p,p.locator('#unitStyleToggle'));assert.equal(await p.locator('#playbackMap .unit-art').count(),0);
 await tap(p,p.locator('#unitStyleToggle'));assert.equal(await p.evaluate(()=>JSON.stringify(state)),replayBefore);
 assert.equal(await p.locator('#playbackMap .counter-sandbags').count(),await p.evaluate(()=>playbackSession.frames[playbackSession.index][playbackSession.phase].units.filter(u=>u.hp>0&&u.entrenched).length));
 await tap(p,p.locator('#terrainToggle'));assert.equal(await p.locator('#playbackMap .terrain-art').count(),0);
 await tap(p,p.locator('#terrainToggle'));assert.equal(await p.locator('#playbackMap .terrain-art').count(),63);
 assert.equal(await p.locator('#mobileOrderDock').isVisible(),false);
 await p.setViewportSize({width:1280,height:900});await p.waitForFunction(()=>window.ww2Desktop.active);
 assert.equal(await p.locator('#desktopActionDock').isVisible(),false);
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!window.ww2Desktop.active);
 await tap(p,p.locator('#skipPlayback'));assert.equal(await p.locator('#end').isVisible(),true);
 const revision=await p.evaluate(()=>state.revision);await tap(p,p.locator('#lessonExit'));assert.equal(await p.evaluate(()=>state.revision),revision);
 await p.setViewportSize({width:1280,height:900});await p.screenshot({path:path.join(temp,'desktop.png'),fullPage:true});
 const old=await (await fetch(base+'/api/match/'+original.code,{headers:{Authorization:'Bearer '+original.token}})).json();assert.equal(old.revision,original.revision);
 const privatePage=await browser.newPage({viewport:{width:390,height:844}});await privatePage.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('Storage disabled');};Storage.prototype.getItem=()=>{throw Error('Storage disabled');};});
 await privatePage.goto(base);await tap(privatePage,privatePage.locator('#learnStart'));await privatePage.locator('#tutorialCoach').waitFor({state:'visible'});await tap(privatePage,privatePage.locator('#simpleToggle'));
 assert.deepEqual(errors,[]);console.log('Learning/mobile/simple UI passed. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill('SIGTERM');});
