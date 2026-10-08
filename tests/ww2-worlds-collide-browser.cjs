/* Real Current catalog, co-op ownership, moves and layers on desktop and phone. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync('/tmp/ww2-worlds-'),base='http://127.0.0.1:8182';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8182','--workers','1','--threads','4','--timeout','120'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite')},stdio:['ignore','ignore','pipe']});
let browser;const errors=[],badAssets=[],pages=[];
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function register(width,name){
 const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});pages.push(p);p.setDefaultTimeout(45000);
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>scenarios.length===24&&currentScenarios.length===25&&ww2Commander.ready);
 assert.equal(await p.locator('#scenarioSelect option[value="current:worlds_collide"]').count(),0);
 await p.locator('#scenarioSelectEdition').selectOption('current');await p.locator('#scenarioSelect').selectOption('current:worlds_collide');
 assert.match(await p.locator('#operationTitle').textContent(),/Worlds Collide/);assert.match(await p.locator('#operationFactions').textContent(),/Americans.*British.*Germans.*Japanese/);
 assert.match(await p.locator('.home-map-footer').textContent(),/6 CONTROL ZONES/);
 await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-worlds-test-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);
 return p;
}
async function select(p,id){
 const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);
 assert.ok(index>=0,id);await tap(p,p.locator('#roster button').nth(index));await settle(p);
}
async function screenshot(p,name){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(temp,name+'.png')});}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const host=await register(1440,'WorldsHost'),ally=await register(390,'WorldsAlly');
 await screenshot(host,'worlds-current-catalog-desktop');
 await host.locator('#createCoop').click();assert.equal(await host.locator('#coopControlSize').inputValue(),'platoons');await host.locator('#namedGameSubmit').click();await host.locator('#coopRoom').waitFor({state:'visible'});await settle(host);
 const code=await host.evaluate(()=>session.code);
 for(const side of ['us','de'])assert.equal(await host.evaluate(side=>state.coop.groups.filter(g=>g.side===side&&!g.command).length,side),5);
 await ally.locator('#lobbyRefresh').click();await ally.locator(`.public-game[data-code="${code}"] button`).click();await ally.locator('#coopJoinSide').selectOption('us');await ally.locator('#coopJoinGroup').selectOption('us:E');await ally.locator('#coopJoinSubmit').click();await ally.locator('#coopRoom').waitFor({state:'visible'});await settle(ally);
 await host.evaluate(()=>refresh());await settle(host);await host.locator('#coopStart').click();await settle(host);await ally.evaluate(()=>refresh());await settle(ally);
 assert.equal(await host.evaluate(()=>state.scenario.id),'current:worlds_collide');assert.equal(await host.locator('#map .hex').count(),3584);
 assert.match(await host.locator('#objective').textContent(),/0\/40/);assert.match(await host.evaluate(()=>ww2Briefing.mission(state).goal),/40 control points.*2 sea lanes.*4 land flags/);
 assert.equal(await host.locator('#platoonFilters button').count(),6);
 const ids=await host.evaluate(()=>({scout:state.units.find(u=>u.side==='us'&&u.platoon==='A'&&u.kind==='scout').id,plane:state.units.find(u=>u.side==='us'&&u.kind==='fighter').id,commander:state.units.find(u=>u.side==='us'&&u.kind==='commander').id}));
 assert.ok(await host.evaluate(id=>state.coop.controlled.includes(id),ids.commander));assert.ok(!await ally.evaluate(id=>state.coop.controlled.includes(id),ids.commander));
 assert.equal(await host.evaluate(id=>state.legal[id].moves.length,ids.plane),0);assert.ok(await ally.evaluate(id=>state.legal[id].moves.length>0,ids.plane));
 await select(host,ids.scout);await tap(host,host.locator('#findUnit'));
 const move=await host.evaluate(()=>state.legal[selected].moves.find(m=>m.cost===1&&!state.units.some(u=>u.hp>0&&!u.reserve&&!u.carrier_id&&u.pos[0]===m.pos[0]&&u.pos[1]===m.pos[1])));assert.ok(move);
 const revision=await host.evaluate(()=>{window.worldsOldHex=$('map').querySelector('.hex');return state.revision;});
 await tap(host,host.locator(`#map .hex.move[data-x="${move.pos[0]}"][data-y="${move.pos[1]}"]`));await host.waitForFunction(r=>state.revision>r&&!busy,revision);await settle(host);
 assert.deepEqual(await host.evaluate(id=>state.units.find(u=>u.id===id).pos,ids.scout),move.pos);assert.ok(await host.evaluate(()=>worldsOldHex===$('map').querySelector('.hex')));
 const timings=await host.evaluate(async()=>{const out=[];for(const u of state.units.filter(u=>u.side===state.side&&u.platoon==='A').slice(0,8)){const t=performance.now();chooseUnit(u);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));out.push(performance.now()-t);}return out;});
 assert.ok(Math.max(...timings)<750,JSON.stringify(timings));await screenshot(host,'worlds-battle-desktop');
 await ally.evaluate(()=>refresh());await settle(ally);await select(ally,ids.plane);await tap(ally,ally.locator('#findUnit'));
 await ally.locator('#fubarLayers [data-layer="air"]').click();
 const flight=await ally.evaluate(()=>state.legal[selected].moves.find(m=>!state.units.some(u=>u.pos[0]===m.pos[0]&&u.pos[1]===m.pos[1]&&!['fighter','bomber'].includes(u.kind))));assert.ok(flight);
 const airRevision=await ally.evaluate(()=>state.revision);
 await tap(ally,ally.locator(`#map .hex.move[data-x="${flight.pos[0]}"][data-y="${flight.pos[1]}"]`));await ally.waitForFunction(r=>state.revision>r&&!busy,airRevision);await settle(ally);
 assert.deepEqual(await ally.evaluate(id=>state.units.find(u=>u.id===id).pos,ids.plane),flight.pos);
 await ally.locator('#fubarLayers [data-layer="both"]').click();await screenshot(ally,'worlds-air-phone');
 await tap(ally,ally.locator('#battleMission'));assert.match(await ally.locator('#missionGoal').textContent(),/40 control points.*2 sea lanes.*4 land flags/);assert.equal(await ally.locator('#missionSectors button').count(),6);await screenshot(ally,'worlds-mission-phone');await ally.locator('#missionClose').click();
 // Finishing one command must leave the shared army turn open for the host.
 await tap(ally,ally.locator('#end'));await settle(ally);assert.equal(await ally.evaluate(()=>state.coop.done),true);assert.equal(await ally.evaluate(()=>state.turn),'us');
 await host.evaluate(()=>refresh());await settle(host);assert.equal(await host.evaluate(()=>state.coop.done),false);assert.equal(await host.evaluate(()=>state.turn),'us');
 await ally.reload();await ally.waitForFunction(()=>ww2Commander.ready);await ally.locator('#lobbyRefresh').click();await ally.locator(`.public-game[data-code="${code}"] button`).click();await settle(ally);
 assert.equal(await ally.evaluate(()=>state.scenario.id),'current:worlds_collide');assert.equal(await ally.evaluate(()=>state.coop.controlled.includes(state.units.find(u=>u.side==='us'&&u.kind==='fighter').id)),true);
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 console.log('PASS: Current-only discovery; desktop/phone map and mission; five platoons per coalition; commander/plane ownership; real infantry and flight moves; retained map; layer controls; Finish my orders waits for teammate; reconnect.',JSON.stringify({selectionMs:timings.map(n=>Math.round(n)),screenshots:temp}));
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(temp,`failure-${i}.png`)});console.error(i,await pages[i].evaluate(()=>({message:$('message').textContent,selected,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(temp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
