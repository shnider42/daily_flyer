const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-compact-desktop-')),base='http://127.0.0.1:8132';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8132','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'games.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
async function settle(p){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function prefs(p,id){
 if(!await p.locator('#battleViewSettings').evaluate(e=>e.open))await p.locator('#battleViewOpen').click();
 await p.locator('#'+id).click();await settle(p);
 if(await p.locator('#battleViewSettings').count()&&await p.locator('#battleViewSettings').evaluate(e=>e.open))await p.keyboard.press('Escape');
}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:1366,height:768}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('#scenarioSelect').selectOption('iron_lantern');await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy);
 await p.evaluate(()=>{refresh=async()=>{};chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='commander'));});
 const revision=await p.evaluate(()=>state.revision),sizes=[];
 for(const [w,h] of [[1366,768],[1366,668],[1280,720],[1280,620],[1152,648],[1100,600],[1920,720]]){
  await p.setViewportSize({width:w,height:h});await settle(p);
  for(const detailed of ['on','off','experimental']){
   await p.evaluate(mode=>ww2ViewMode.set(mode),detailed);await settle(p);
   for(const dad of [false,true]){
    if(dad)await prefs(p,'dadModeToggle');
    const layout=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {map:rect('#mapWrap'),end:rect('#end'),mission:rect('#battleMission'),scroll:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}});
    assert.ok(layout.map.width>=400&&layout.map.height>=180,JSON.stringify({w,h,dad,detailed,layout}));
    assert.ok(layout.end.bottom<=h&&layout.end.y>0,JSON.stringify({w,h,dad,detailed,layout}));
    assert.ok(layout.mission.bottom<=layout.map.y&&layout.scroll<=w,JSON.stringify({w,h,dad,detailed,layout}));
    if(!dad&&detailed==='on'){sizes.push({w,h,map:layout.map});await p.screenshot({path:path.join(temp,`battle-${w}-${h}.png`)});}
    if(dad)await prefs(p,'dadModeToggle');
   }
   await p.evaluate(()=>ww2ViewMode.set('on'));await settle(p);
  }
  // The display menu overlays spare space without reflowing the battlefield.
  const before=await p.locator('#mapWrap').boundingBox();await p.locator('#battleViewOpen').click();
  assert.deepEqual(await p.locator('#mapWrap').boundingBox(),before);
  const menu=await p.locator('#playTools').boundingBox();assert.ok(menu.x>=0&&menu.x+menu.width<=w);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#battleViewSettings').evaluate(e=>e.open),false);
 }
 await p.setViewportSize({width:1280,height:720});await settle(p);
 const before=await p.locator('#mapWrap').boundingBox();await p.locator('#desktopExpand').click();await settle(p);
 assert.ok((await p.locator('#mapWrap').boundingBox()).width>before.width+100);await p.locator('#desktopExpand').click();
 // A narrow mouse window has side-by-side orders. The same width on a touch
 // tablet keeps its existing layout; do not use width alone as a device guess.
 for(const [w,h] of [[1024,668],[960,600],[1024,768]]){
  await p.setViewportSize({width:w,height:h});await settle(p);
  const map=await p.locator('#mapWrap').boundingBox(),orders=await p.locator('#mobileOrderDock').boundingBox();
  assert.ok(map.width>=500&&map.height>=h-98,JSON.stringify({w,h,map,orders}));assert.ok(orders.x>=map.x+map.width);
  await p.locator('#mobileOrderDock').evaluate(e=>e.scrollTop=e.scrollHeight);const end=await p.locator('#end').boundingBox();assert.ok(end.y>=0&&end.y+end.height<=h);
  await p.locator('#mobileOrderDock').evaluate(e=>e.scrollTop=0);await p.screenshot({path:path.join(temp,`battle-${w}-${h}.png`)});
 }
 await p.setViewportSize({width:1440,height:1000});await settle(p);
 assert.equal(await p.locator('#battleViewSettings').isVisible(),false);assert.equal(await p.locator('#battleViewOpen').isVisible(),true);
 for(const id of ['playTools','orders','end','battleMission'])assert.equal(await p.locator('#'+id).count(),1);
 await p.setViewportSize({width:1280,height:720});await settle(p);await p.locator('#battleViewOpen').click();await p.locator('#simpleToggle').selectOption('expert');await p.keyboard.press('Escape');
 await p.setViewportSize({width:390,height:844});await settle(p);assert.equal(await p.locator('#battleViewSettings').count(),1);assert.equal(await p.locator('#playTools').count(),1);
 assert.equal(await p.evaluate(()=>state.revision),revision,'Layout controls never submit game orders');
 for(const [w,h] of [[390,844],[1024,768]]){
  const touch=await browser.newPage({viewport:{width:w,height:h},isMobile:true,hasTouch:true});touch.on('pageerror',e=>errors.push(e.message));
  await touch.goto(base);await touch.locator('#createSolo').click();await touch.locator('#startSolo').click();await touch.waitForFunction(()=>state&&!busy);await settle(touch);
  const map=await touch.locator('#mapWrap').boundingBox(),orders=await touch.locator('#mobileOrderDock').boundingBox();assert.ok(orders.y>=map.y+map.height,'Touch layout remains stacked');
  await touch.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({sizes,screenshots:temp}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
