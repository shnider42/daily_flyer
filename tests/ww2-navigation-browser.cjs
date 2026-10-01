/* Exercise shared navigation across real layouts, not a copy of their markup. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-navigation-'),base='http://127.0.0.1:8137';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8137','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
async function settle(p){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function camera(p){return p.locator('#mapWrap').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),left:n.scrollLeft,top:n.scrollTop}));}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const touch of [false,true]){
  const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:720},hasTouch:touch,isMobile:touch});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
  await p.goto(base);await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!polling);
  await p.evaluate(()=>{refresh=async()=>{};chooseUnit(state.units.find(u=>u.side===state.side&&u.hp>0));});
  const initial=await p.evaluate(()=>({code:state.code,revision:state.revision,selected}));
  for(const [width,height] of touch?[[320,568],[390,844],[430,932],[844,390],[1024,768]]:[[1100,600],[1280,720],[1440,1000],[1024,668]]){
   await p.setViewportSize({width,height});await settle(p);
   let first;
   for(const mode of ['on','off','experimental']){
    await p.evaluate(m=>ww2ViewMode.set(m),mode);await settle(p);
    const nav=await p.locator('#battleNavigation').boundingBox();first??=nav;
    assert.ok(nav.x<35&&nav.y<15,JSON.stringify({width,height,mode,nav}));
    assert.ok(Math.abs(nav.x-first.x)<20&&Math.abs(nav.y-first.y)<8,'Navigation remains in the same corner');
    assert.deepEqual(await p.locator('#battleNavigation button').allTextContents(),['Home','View']);
    const visible=await p.locator('#battleNavigation button').evaluateAll(ns=>ns.map(n=>({id:n.id,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width,clipped:n.scrollWidth>n.clientWidth+1})));
    assert.ok(visible.every(n=>n.height>=44&&n.width>=44&&!n.clipped),JSON.stringify(visible));
    const map=await camera(p);await p.locator('#battleViewOpen').click();assert.deepEqual(await camera(p),map,'Opening View cannot move or pan the map');
    assert.equal(await p.locator('#battleViewOpen').getAttribute('aria-expanded'),'true');
    for(const id of ['simpleToggle','dadModeToggle','terrainToggle','unitStyleToggle','rulesButton'])assert.ok(await p.locator('#'+id).isVisible());
    await p.locator('#terrainToggle').click();await p.locator('#unitStyleToggle').click();await settle(p);assert.deepEqual(await camera(p),map,'Visual toggles cannot change camera');
    await p.locator('#terrainToggle').click();await p.locator('#unitStyleToggle').click();
    await p.keyboard.press('Escape');assert.equal(await p.locator('#battleViewSettings').evaluate(d=>d.open),false);assert.equal(await p.evaluate(()=>document.activeElement.id),'battleViewOpen');
    assert.deepEqual(await camera(p),map);
    if(touch&&width===390||!touch&&width===1280){await p.screenshot({path:path.join(temp,`${touch?'phone':'desktop'}-${mode}.png`)});await p.locator('#battleViewOpen').click();await p.screenshot({path:path.join(temp,`${touch?'phone':'desktop'}-${mode}-view.png`)});await p.locator('#battleViewSettingsClose').click();}
   }
  }
  // Keep View mounted and operable while changing layout or rotating a phone.
  await p.locator('#battleViewOpen').click();await p.locator('#simpleToggle').click();await p.locator('#dadModeToggle').click();
  await p.setViewportSize(touch?{width:320,height:568}:{width:1280,height:720});await settle(p);
  assert.ok(await p.locator('#battleViewSettings').evaluate(d=>d.open));
  assert.equal(await p.locator('#battleNavigation').count(),1);assert.equal(await p.locator('#playTools').count(),1);
  await p.locator('#battleViewSettingsClose').click();
  await p.screenshot({path:path.join(temp,`${touch?'phone':'desktop'}-dad.png`)});
  if(touch){const bounds=await p.locator('#mobileBattleTop').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1);}
  await p.locator('#battleViewOpen').click();await p.mouse.click(1,1);assert.equal(await p.locator('#battleViewSettings').evaluate(d=>d.open),false,'Backdrop dismisses without clicking through to the map');
  assert.deepEqual(await p.evaluate(()=>({code:state.code,revision:state.revision,selected})),initial,'Navigation/preferences do not issue orders or change selection');
  await p.locator('#homeBattles').click();await p.locator('#game').waitFor({state:'hidden'});assert.ok(await p.locator('#sessionList .saved-session').first().isVisible());assert.ok(await p.locator('#rulesButton').isVisible());
  await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state&&!busy&&!document.getElementById('game').hidden);assert.equal(await p.evaluate(()=>state.code),initial.code);
  await p.reload();await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state&&!busy);assert.ok(await p.locator('#battleNavigation').isVisible());assert.equal(await p.evaluate(()=>ww2Dad.enabled),true);
  await p.close();
 }
 assert.deepEqual(errors,[]);console.log('Shared Home/View navigation: phone/tablet/laptop, all layouts, stable map and camera, touch targets, keyboard dismissal/focus, Dad mode, rotation, Home/resume and reload passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
