/* Real API orders, retained terrain, and map-first airborne targeting. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync('/tmp/ww2-airborne-'),base='http://127.0.0.1:8136';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8136','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-preview-chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
 await p.goto(base);await p.waitForFunction(()=>scenarios.length===16);
 assert.equal(await p.locator('[data-scenario="iron_lantern"]').count(),1);
 await p.evaluate(async()=>{ww2ViewMode.set('experimental');remember(await api('/api/match',{scenario:'iron_lantern',ruleset:'dsl',opponent:'computer'}));await refresh();});
 await p.waitForFunction(()=>state?.airborne_version&&!busy&&!polling&&ww2Mobile.active);
 const start=await p.evaluate(()=>({revision:state.revision,commander:state.units.find(u=>u.airlift_commander).id,pathfinder:state.units.find(u=>u.kind==='pathfinder').id,reserve:state.units.find(u=>u.airlift_reserve).id}));
 await p.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),start.reserve);
 assert.match(await p.locator('#roleBrief').textContent(),/commander/);assert.ok(await p.locator('#airdrop').isHidden());
 await p.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),start.pathfinder);
 assert.equal(await p.locator('#map .portrait-pathfinder').count(),1);
 await tap(p,p.locator('#markLZ'));await p.waitForFunction(r=>state.revision>r&&!busy,start.revision);
 assert.equal(await p.locator('#map .beacon-mark').count(),1);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.kind==='pathfinder').beacon_charges),0);
 await p.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),start.commander);
 const before=await p.evaluate(()=>{window.airborneTerrain=$('map').querySelector('.hex');return {revision:state.revision,ap:state.units.find(u=>u.id===selected).ap};});
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(120);
  const map=await p.locator('#mapWrap').boundingBox(),home=await p.locator('#mobileHome').boundingBox();assert.ok(map.height/height>.60);assert.ok(home.y<15);
  await tap(p,p.locator('#callAirborne'));assert.equal(await p.locator('#map .airdrop-aim').count(),1020);
  assert.equal(await p.locator('#dadOrders').evaluate(d=>d.open),false);
  assert.ok(await p.evaluate(()=>airborneTerrain===$('map').querySelector('.hex')));
  await tap(p,p.locator('#callAirborne'));assert.equal(await p.locator('#map .airdrop-aim').count(),0);
 }
 assert.equal(await p.evaluate(()=>state.revision),before.revision);
 await p.setViewportSize({width:390,height:844});await tap(p,p.locator('#callAirborne'));
 p.once('dialog',async d=>{assert.match(d.message(),/Unseen Flak/);await d.dismiss();});
 await p.locator(`#map .unit[data-unit-id="${start.pathfinder}"]`).click();assert.equal(await p.evaluate(()=>state.revision),before.revision);
 assert.equal(await p.locator('#map .airdrop-aim').count(),1020);
 assert.equal(await p.evaluate(()=>selected),start.commander);
 p.once('dialog',d=>d.accept());await p.locator('#map .hex[data-x="10"][data-y="28"]').focus();await p.keyboard.press('Enter');
 await p.waitForFunction(r=>state.revision>r&&!busy,before.revision);
 const after=await p.evaluate(()=>({ap:state.units.find(u=>u.id===selected).ap,report:state.airlift_report,reserves:state.units.filter(u=>u.airlift_reserve&&u.hp>0).length,undo:state.order_history.can_undo,retained:airborneTerrain===$('map').querySelector('.hex'),unit:state.units.find(u=>u.id===state.airlift_report.unit)}));
 assert.equal(after.ap,before.ap-3);assert.equal(after.reserves,2);assert.equal(after.undo,false);assert.ok(after.retained);
 if(after.report.landed)assert.equal(after.unit.ap,1);else assert.equal(after.unit.hp,0);
 assert.equal(await p.locator('#map .airdrop-aim').count(),0);
 await p.locator('#dadOrdersOpen').click();assert.match(await p.locator('#callAirborne').textContent(),/Airlift used this round/);
 await p.locator('#dadOrdersClose').click();await p.screenshot({path:path.join(temp,'phone.png')});
 await p.setViewportSize({width:1440,height:1000});await p.waitForFunction(()=>ww2Desktop.active);
 assert.ok(await p.locator('#airliftReport').isVisible());assert.match(await p.locator('#airliftReport').textContent(),/rolled/);
 await p.locator('#battleMission').click();assert.match(await p.locator('#missionGoal').textContent(),/canal exit/);assert.doesNotMatch(await p.locator('#missionRules').textContent(),/Normandy|beach exit/);
 await p.locator('#missionClose').click();await p.evaluate(()=>chooseUnit(state.units.find(u=>u.variant==='firefly')));
 assert.equal(await p.locator('#map .portrait-firefly').count(),1);assert.match(await p.locator('#loadHE').textContent(),/no splash/);
 assert.ok((await p.locator('.desktop-briefing').boundingBox()).height<170);
 await p.screenshot({path:path.join(temp,'desktop.png')});
 await p.reload();await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state?.airborne_version&&!busy&&!polling);
 assert.equal(await p.evaluate(()=>state.airlift_report.revision),after.report.revision);
 assert.deepEqual(errors,[]);console.log('Iron Lantern: real beacon/drop orders, cancellation, finite reserves, AP, undo, persistence, art, briefing and four mobile sizes passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
