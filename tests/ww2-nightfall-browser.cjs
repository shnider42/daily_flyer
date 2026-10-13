/* Disposable four-seat browser check. Only this local server forces d6=6. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-nightfall-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8186';
const server=cp.spawn('python',['-c',`import os
import ww2_tactics.engine as engine
engine.secrets.randbelow=lambda n:n-1
from ww2_web import create_app
create_app(os.environ['WW2_DB_PATH'],background_ai=False).run(host='127.0.0.1',port=8186,threaded=True)
`],{env:{...process.env,WW2_DB_PATH:db},stdio:['ignore','ignore','pipe']});
const pages=[],errors=[],badAssets=[];let browser;
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);if(await p.evaluate(()=>!!playbackSession)){await p.locator('#skipPlayback').click();await p.waitForFunction(()=>!playbackSession&&!busy&&!polling);}}
async function refreshPage(p){await p.evaluate(()=>refresh());await settle(p);}
async function openPage(width,name){
 const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});pages.push(p);p.setDefaultTimeout(22000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>currentScenarios.length===28&&ww2Commander.ready);
 await p.locator('#scenarioSelectEdition').selectOption('current');await p.locator('#scenarioSelect').selectOption('current:nightfall_beacon');assert.match(await p.locator('#operationTitle').textContent(),/Nightfall Beacon/);
 await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-nightfall-test-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);return p;
}
async function join(p,code,side,group){await p.locator('#lobbyRefresh').click();await p.locator(`.public-game[data-code="${code}"] button`).click();await p.locator('#coopJoinSide').selectOption(side);await p.locator('#coopJoinGroup').selectOption(side+':'+group);await p.locator('#coopJoinSubmit').click();await p.locator('#coopRoom').waitFor({state:'visible'});await settle(p);}
async function select(p,id){const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);assert.ok(index>=0,id);await tap(p,p.locator('#roster button').nth(index));await settle(p);}
async function targetEnemy(p,id){await tap(p,p.locator(`#map .unit[data-unit-id="${id}"]`));if(await p.locator('#groundStack').isVisible())await tap(p,p.locator(`#groundStack button[data-unit-id="${id}"]`));}
async function order(p,locator){const r=await p.evaluate(()=>state.revision);await tap(p,locator);await p.waitForFunction(r=>state.revision>r&&!busy,r);await settle(p);}
async function snap(p,name){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(tmp,name+'.png')});}
function fixture(code,phase){return JSON.parse(cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
db=sqlite3.connect(sys.argv[1]);code,phase=sys.argv[2:]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
plane=next(u for u in s['units'] if u['side']=='us' and u['kind']=='transport_aircraft' and u['platoon']=='A')
lamp=next(u for u in s['units'] if u['kind']=='spotlight' and u['platoon']=='A')
pathfinder=next(u for u in s['units'] if u.get('max_flares') and u['platoon']=='B')
heavy=next(u for u in s['units'] if u.get('variant')=='lancaster' and u['platoon']=='A')
radar=next(u for u in s['units'] if u.get('mission_radar') and u['platoon']=='A')
if phase=='lights':
 plane.update(pos=[15,14],ap=4);lamp.update(pos=[12,15],ap=2);s['turn']='de';s['coop']['done']=[]
 pathfinder.update(pos=[15,17],ap=4)
elif phase=='bomb':heavy.update(pos=[8,13],ap=4)
update_intel(s);s['revision']+=1
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
print(json.dumps({'plane':plane['id'],'lamp':lamp['id'],'pathfinder':pathfinder['id'],'heavy':heavy['id'],'radar':radar['id']}))
`,db,code,phase],{encoding:'utf8'}));}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const host=await openPage(1440,'NightHost'),ally=await openPage(390,'NightAlly'),german=await openPage(1440,'NightDefense'),mate=await openPage(390,'NightDefenseMate');
 await host.locator('#createCoop').click();assert.equal(await host.locator('#coopControlSize').inputValue(),'platoons');await host.locator('#namedGameSubmit').click();await host.locator('#coopRoom').waitFor({state:'visible'});await settle(host);const code=await host.evaluate(()=>session.code);
 await join(ally,code,'us','B');await join(german,code,'de','A');await join(mate,code,'de','B');await refreshPage(host);await host.locator('#coopStart').click();await settle(host);for(const p of [ally,german,mate])await refreshPage(p);
 assert.equal(await host.locator('#map .hex').count(),780);assert.ok(await host.locator('body').evaluate(e=>e.classList.contains('night-battle')));assert.equal(await host.locator('#map .unit.de').count(),0);assert.match(await host.locator('#objective').textContent(),/Radar 0\/2/);
 const plane=await host.evaluate(()=>state.units.find(u=>u.kind==='transport_aircraft'&&u.platoon==='A').id);await select(host,plane);assert.match(await host.locator('#unitPurpose').textContent(),/Dakota.*2\/2 squads/);
 await tap(host,host.locator('#nightDrop'));assert.equal(await host.locator('#map .night-choice').count(),7);await tap(host,host.locator('#nightDrop'));assert.equal(await host.locator('#map .night-choice').count(),0);
 await tap(host,host.locator('#findUnit'));const flight=await host.evaluate(()=>state.legal[selected].moves.find(m=>m.pos[0]===8&&m.pos[1]===23));assert.ok(flight);
 await order(host,host.locator('#map .hex.move[data-x="8"][data-y="23"]'));assert.deepEqual(await host.evaluate(id=>state.units.find(u=>u.id===id).pos,plane),[8,23]);await snap(host,'nightfall-desktop-approach');
 const ids=fixture(code,'lights');await refreshPage(german);assert.ok(!await german.evaluate(id=>state.units.some(u=>u.id===id),ids.plane));await select(german,ids.lamp);assert.match(await german.locator('#unitPurpose').textContent(),/Spotlight.*8 hexes/);await tap(german,german.locator('#spotlightAim'));await order(german,german.locator('#map .night-choice[data-x="15"][data-y="14"]'));
 assert.ok(await german.evaluate(id=>state.units.some(u=>u.id===id),ids.plane));assert.equal(await german.locator('#map .searchlight-beam').count(),1);await snap(german,'nightfall-searchlight-desktop');
 await refreshPage(host);assert.ok(await host.evaluate(id=>state.units.some(u=>u.id===id),ids.lamp));await order(german,german.locator('#end'));await refreshPage(mate);await order(mate,mate.locator('#end'));assert.equal(await mate.evaluate(()=>state.turn),'us');
 await refreshPage(ally);await select(ally,ids.pathfinder);await tap(ally,ally.locator('#pathfinderFlare'));await order(ally,ally.locator('#map .night-choice[data-x="15"][data-y="13"]'));assert.equal(await ally.locator('#map .night-flare').count(),1);await snap(ally,'nightfall-flare-phone');
 await refreshPage(host);await select(host,ids.plane);await tap(host,host.locator('#nightDrop'));await order(host,host.locator('#map .night-choice[data-x="15"][data-y="13"]'));const report=await host.evaluate(()=>state.airlift_report);assert.equal(report.roll,6);assert.deepEqual(report.pos,[15,13]);assert.equal(report.guided,true);
 const troop=report.unit;assert.ok(await host.evaluate(id=>state.coop.controlled.includes(id),troop));await select(host,troop);assert.match(await host.locator('#unitPurpose').textContent(),/Just landed.*1 AP/);await snap(host,'nightfall-airborne-landing-desktop');
 fixture(code,'bomb');await refreshPage(host);await select(host,ids.heavy);await tap(host,host.locator('#findUnit'));await targetEnemy(host,ids.radar);await order(host,host.locator('#fire'));assert.equal(await host.evaluate(()=>state.night_status.radars_destroyed),0);await targetEnemy(host,ids.radar);await order(host,host.locator('#fire'));assert.equal(await host.evaluate(()=>state.night_status.radars_destroyed),1);assert.equal(await host.evaluate(()=>state.winner),null);
 for(const level of ['simple','moderate','expert']){const lessons=await host.evaluate(level=>{ww2Experience.set(level);return ww2Learning.lessons();},level);assert.match(lessons.find(l=>l.id==='night-drop').text,/Dakotas must fly within 1 hex/);assert.match(lessons.find(l=>l.id==='night-lights').text,/reveals itself|reveals.*Spotlight|reveals|reveal/i);}
 await refreshPage(ally);await tap(ally,ally.locator('#battleMission'));assert.match(await ally.locator('#missionGoal').textContent(),/landed paratroopers/);assert.match(await ally.locator('#missionRules').textContent(),/Spotlights.*1 AP/);await snap(ally,'nightfall-mission-phone');await ally.locator('#missionClose').click();
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);console.log('PASS: 780-hex night map; four seats; real flight and limited Dakota aim; German beam reveals aircraft and emitter; shared flare; guided exact drop with owned 1-AP troops; actual radar bombing; night mission, art and desktop/phone UI.',JSON.stringify({screenshots:tmp}));
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,'failure-'+i+'.png')});console.error(i,await pages[i].evaluate(()=>({message:$('message').textContent,selected,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
