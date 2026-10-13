/* Four real browser seats, desktop/phone, mixed ownership and actual fleet orders. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-crosswind-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8184';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8184','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:['ignore','ignore','pipe']});
const pages=[],errors=[],badAssets=[];let browser;
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function refreshPage(p){await p.evaluate(()=>refresh());await settle(p);}
async function openPage(width,name){
 const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});pages.push(p);p.setDefaultTimeout(20000);
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>currentScenarios.length===27&&ww2Commander.ready);
 assert.equal(await p.locator('#scenarioSelect option[value="current:crosswind_strait"]').count(),0);
 await p.locator('#scenarioSelectEdition').selectOption('current');await p.locator('#scenarioSelect').selectOption('current:crosswind_strait');
 assert.match(await p.locator('#operationTitle').textContent(),/Crosswind Strait/);
 await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-crosswind-test-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);
 return p;
}
async function join(p,code,side,group){
 await p.locator('#lobbyRefresh').click();await p.locator(`.public-game[data-code="${code}"] button`).click();
 await p.locator('#coopJoinSide').selectOption(side);await p.locator('#coopJoinGroup').selectOption(side+':'+group);await p.locator('#coopJoinSubmit').click();await p.locator('#coopRoom').waitFor({state:'visible'});await settle(p);
}
async function select(p,id){
 const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);
 assert.ok(index>=0,id);await tap(p,p.locator('#roster button').nth(index));await settle(p);
}
async function snap(p,name){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(tmp,name+'.png')});}
function fixture(code){
 return JSON.parse(cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
db=sqlite3.connect(sys.argv[1]);code=sys.argv[2]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
plane=next(u for u in s['units'] if u['side']=='us' and u['platoon']=='B' and u['kind']=='bomber')
carrier=next(u for u in s['units'] if u['side']=='us' and u['platoon']=='B' and u['kind']=='carrier')
plane.update(pos=carrier['pos'].copy(),hp=2,bombs=0,ap=4)
update_intel(s);s['revision']+=1
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
print(json.dumps({'plane':plane['id'],'carrier':carrier['id']}))
`,db,code],{encoding:'utf8'}));
}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const host=await openPage(1440,'CrosswindHost'),ally=await openPage(390,'CrosswindAlly'),axis=await openPage(1440,'CrosswindAxis'),axisMate=await openPage(390,'CrosswindAxisMate');
 await snap(host,'crosswind-catalog-desktop');await host.locator('#createCoop').click();assert.equal(await host.locator('#coopControlSize').inputValue(),'platoons');await host.locator('#namedGameSubmit').click();await host.locator('#coopRoom').waitFor({state:'visible'});await settle(host);
 const code=await host.evaluate(()=>session.code);
 await join(ally,code,'us','B');await join(axis,code,'de','A');await join(axisMate,code,'de','B');await refreshPage(host);
 assert.equal(await host.evaluate(()=>state.coop.groups.length),4);assert.equal(await host.evaluate(()=>state.coop.players.length),4);
 await host.locator('#coopStart').click();await settle(host);for(const p of [ally,axis,axisMate])await refreshPage(p);
 assert.equal(await host.locator('#map .hex').count(),480);assert.match(await host.locator('#objective').textContent(),/0\/12/);
 for(const level of ['simple','moderate','expert']){
  const lessons=await host.evaluate(level=>{ww2Experience.set(level);return ww2Learning.lessons();},level);
  assert.match(lessons.find(l=>l.id==='layers').text,/One ship and one aircraft/);
  assert.match(lessons.find(l=>l.id==='fleet-service').text,/six finite stores/);
  assert.ok(!lessons.some(l=>/living friendly airfield|roads can grant/i.test(l.text)),level);
 }
 await host.evaluate(()=>ww2Experience.set('simple'));
 for(const p of pages){assert.equal(await p.evaluate(()=>state.coop.controlled.length),7);assert.equal(await p.evaluate(()=>state.units.filter(u=>state.coop.controlled.includes(u.id)&&['fighter','bomber'].includes(u.kind)).length),3);}
 const ids=await host.evaluate(()=>({escort:state.units.find(u=>u.variant==='aa_escort'&&u.platoon==='A').id,ship:state.units.find(u=>u.side==='us'&&u.kind==='destroyer'&&u.platoon==='A').id}));
 await select(host,ids.escort);assert.match(await host.locator('#unitPurpose').textContent(),/AA escort.*range 3/);assert.match(await host.locator('#overwatch').textContent(),/AA interception/);
 const revision=await host.evaluate(()=>state.revision);await tap(host,host.locator('#overwatch'));await host.waitForFunction(r=>state.revision>r&&!busy,revision);await settle(host);
 assert.ok(await host.evaluate(id=>state.units.find(u=>u.id===id).overwatch,ids.escort));
 await select(host,ids.ship);await tap(host,host.locator('#findUnit'));
 const move=await host.evaluate(()=>state.legal[selected].moves.find(m=>!state.units.some(u=>u.hp>0&&u.pos[0]===m.pos[0]&&u.pos[1]===m.pos[1])));
 assert.ok(move);const shipRevision=await host.evaluate(()=>{window.crosswindHex=$('map').querySelector('.hex');return state.revision;});
 await tap(host,host.locator(`#map .hex.move[data-x="${move.pos[0]}"][data-y="${move.pos[1]}"]`));await host.waitForFunction(r=>state.revision>r&&!busy,shipRevision);await settle(host);
 assert.deepEqual(await host.evaluate(id=>state.units.find(u=>u.id===id).pos,ids.ship),move.pos);assert.ok(await host.evaluate(()=>crosswindHex===$('map').querySelector('.hex')));
 await snap(host,'crosswind-battle-desktop');
 const serviced=fixture(code);await refreshPage(ally);await select(ally,serviced.plane);
 assert.match(await ally.locator('#unitPurpose').textContent(),/Dive attack.*0\/2/);assert.match(await ally.locator('#rearm').textContent(),/Carrier service/);
 const serviceRevision=await ally.evaluate(()=>state.revision);await tap(ally,ally.locator('#rearm'));await ally.waitForFunction(r=>state.revision>r&&!busy,serviceRevision);await settle(ally);
 assert.equal(await ally.evaluate(id=>state.units.find(u=>u.id===id).bombs,serviced.plane),2);assert.equal(await ally.evaluate(id=>state.units.find(u=>u.id===id).air_stores,serviced.carrier),5);
 await tap(ally,ally.locator('#findUnit'));await ally.locator('#fubarLayers [data-layer="air"]').click();assert.equal(await ally.locator('#map .unit.joint-hidden').count()>0,true);
 await ally.locator('#fubarLayers [data-layer="both"]').click();await snap(ally,'crosswind-air-phone');
 await tap(ally,ally.locator('#battleMission'));assert.match(await ally.locator('#missionGoal').textContent(),/three sea lanes/);assert.equal(await ally.locator('#missionSectors button').count(),3);assert.match(await ally.locator('#missionRules').textContent(),/own platoon.*carrier/);await snap(ally,'crosswind-mission-phone');await ally.locator('#missionClose').click();
 await tap(ally,ally.locator('#end'));await settle(ally);assert.equal(await ally.evaluate(()=>state.turn),'us');assert.ok(await ally.evaluate(()=>state.coop.done));
 await refreshPage(host);await tap(host,host.locator('#end'));await host.waitForFunction(()=>state.turn==='de'&&!busy);await settle(host);assert.equal(await host.evaluate(()=>state.turn),'de');
 await refreshPage(axis);await refreshPage(axisMate);
 const cruiser=await axis.evaluate(()=>state.units.find(u=>u.variant==='torpedo_cruiser'&&u.platoon==='A').id);await select(axis,cruiser);assert.match(await axis.locator('#unitPurpose').textContent(),/3 salvos.*range 5/);assert.ok(await axis.locator('#torpedo').isVisible());
 const bomber=await axisMate.evaluate(()=>state.units.find(u=>u.variant==='torpedo_bomber'&&u.platoon==='B').id);await select(axisMate,bomber);assert.match(await axisMate.locator('#unitPurpose').textContent(),/Aerial torpedo.*1\/1/);await snap(axisMate,'crosswind-axis-phone');
 await tap(axis,axis.locator('#end'));await settle(axis);assert.equal(await axis.evaluate(()=>state.turn),'de');await refreshPage(axisMate);await tap(axisMate,axisMate.locator('#end'));await axisMate.waitForFunction(()=>state.round===2&&!busy);await settle(axisMate);assert.equal(await axisMate.evaluate(()=>state.round),2);
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 console.log('PASS: 480-hex Current map; four mixed platoon seats; actual ship move and AA order; finite carrier service; desktop/phone art, layers and mission; shared team turns.',JSON.stringify({screenshots:tmp}));
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,'failure-'+i+'.png')});console.error(i,await pages[i].evaluate(()=>({message:$('message').textContent,selected,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
