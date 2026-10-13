/* Real desktop/phone fog and search controls. All matches are local and disposable. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-nightveil-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8193';
const server=cp.spawn('python',['-c',`import os
from ww2_web import create_app
create_app(os.environ['WW2_DB_PATH'],background_ai=False).run(host='127.0.0.1',port=8193,threaded=True)
`],{env:{...process.env,WW2_DB_PATH:db},stdio:['ignore','ignore','pipe']});
const pages=[],errors=[],badAssets=[];let browser;
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);if(await p.evaluate(()=>!!playbackSession)){await p.locator('#skipPlayback').click();await p.waitForFunction(()=>!playbackSession&&!busy&&!polling);}}
async function refreshPage(p){await p.evaluate(()=>refresh());await settle(p);}
async function openPage(width,name){
 const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});pages.push(p);p.setDefaultTimeout(22000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>currentScenarios.length===28&&ww2Commander.ready);
 assert.equal(await p.locator('#scenarioSelect option[value="current:nightfall_veil"]').count(),0);
 await p.locator('#scenarioSelectEdition').selectOption('current');await p.locator('#scenarioSelect').selectOption('current:nightfall_veil');assert.match(await p.locator('#operationTitle').textContent(),/Nightfall Veil/);
 await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-nightveil-test-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);return p;
}
async function select(p,id){const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);assert.ok(index>=0,id);await tap(p,p.locator('#roster button').nth(index));await settle(p);}
async function order(p,locator){const r=await p.evaluate(()=>state.revision);await tap(p,locator);await p.waitForFunction(r=>state.revision>r&&!busy,r);await settle(p);}
async function returnToMap(p){for(const id of ['mobileBattleMenu','experimentalBattle'])if(await p.locator(`#${id}[open]`).count())await p.locator(`#${id}Close`).click();}
async function snap(p,name){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(tmp,name+'.png')});}
function privateFixture(code,movePathfinder=false){return JSON.parse(cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
from ww2_tactics import domains,nightveil
db=sqlite3.connect(sys.argv[1]);code=sys.argv[2]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
radar=next(u for u in s['units'] if u.get('mission_radar') and u['platoon']=='A')
plane=next(u for u in s['units'] if u.get('max_flares') and u['platoon']=='A')
if sys.argv[3]=='move':
 plane.update(pos=[radar['pos'][0],radar['pos'][1]+3],ap=4)
 update_intel(s);s['revision']+=1
 db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
for u in s['units']:
 if u['side']=='de' and u['kind']!='airfield':
  assert u['pos'] in nightveil.candidates(s,u),(u['id'],u['pos'])
 if not u.get('reserve'):assert not domains.blocked(s,u,u['pos']),u['id']
print(json.dumps({'radar':radar['id'],'pos':radar['pos'],'plane':plane['id'],'defenders':{u['id']:u['pos'] for u in s['units'] if u['side']=='de'}}))
`,db,code,movePathfinder?'move':'inspect'],{encoding:'utf8'}));}
async function checkSearch(p){
 assert.equal(await p.locator('#map .hex').count(),780);assert.ok(await p.locator('body').evaluate(e=>e.classList.contains('night-battle')));
 assert.equal(await p.locator('#map .night-search-sector').count(),2);assert.equal(await p.locator('#map .night-possible-site').count(),18);assert.equal(await p.locator('#map .night-target').count(),0);
 assert.deepEqual(await p.evaluate(()=>state.scenario.night_targets),[]);assert.ok(!await p.evaluate(()=>Object.hasOwn(state,'night_search_checked')));
}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const host=await openPage(1440,'VeilHost'),german=await openPage(390,'VeilDefense');
 const catalog=await (await host.request.get(base+'/api/scenarios')).json();assert.equal(catalog.current_scenarios.length,28);assert.ok(!catalog.scenarios.some(b=>b.id.includes('nightfall_veil')));const board=catalog.current_scenarios.find(b=>b.id==='current:nightfall_veil');assert.deepEqual(board.night_targets,[]);
 await snap(host,'nightveil-catalog-desktop');await host.locator('#create').click();await host.locator('#namedGameSubmit').click();await settle(host);const code=await host.evaluate(()=>session.code);
 await german.locator('#lobbyRefresh').click();await german.locator(`.public-game[data-code="${code}"] button`).click();await settle(german);await refreshPage(host);await returnToMap(host);await returnToMap(german);
 await checkSearch(host);await checkSearch(german);assert.equal(await host.locator('#map .unit.de').count(),0);assert.equal(await host.evaluate(()=>state.units.filter(u=>u.side==='de').length),0);
 const initial=privateFixture(code);assert.deepEqual(await german.evaluate(()=>Object.fromEntries(state.units.filter(u=>u.side==='de').map(u=>[u.id,u.pos]))),initial.defenders);assert.equal(await german.evaluate(()=>state.units.filter(u=>u.side==='de').length),20);
 assert.match(await host.locator('#missionHint').textContent(),/Search the two marked sectors/);await snap(host,'nightveil-search-desktop');await snap(german,'nightveil-private-defense-phone');
 await tap(german,german.locator('#battleMission'));assert.match(await german.locator('#missionRules').textContent(),/nine marked buildings|nine possible buildings/);assert.match(await german.locator('#missionRules').textContent(),/private until spotted/);await snap(german,'nightveil-mission-phone');await german.locator('#missionClose').click();
 const probe=privateFixture(code,true);await refreshPage(host);assert.ok(!await host.evaluate(id=>state.units.some(u=>u.id===id),probe.radar));await select(host,probe.plane);await tap(host,host.locator('#findUnit'));await tap(host,host.locator('#pathfinderFlare'));
 await order(host,host.locator(`#map .night-choice[data-x="${probe.pos[0]}"][data-y="${probe.pos[1]}"]`));assert.equal(await host.locator('#map .night-flare').count(),1);assert.ok(await host.evaluate(id=>state.units.some(u=>u.id===id),probe.radar));assert.equal(await host.evaluate(id=>state.units.find(u=>u.id===id).flares,probe.plane),1);await checkSearch(host);await snap(host,'nightveil-discovered-radar-desktop');
 await refreshPage(german);assert.equal(await german.locator('#map .night-flare').count(),1);assert.deepEqual(await german.evaluate(()=>Object.fromEntries(state.units.filter(u=>u.side==='de').map(u=>[u.id,u.pos]))),initial.defenders);
 // The public save/restore routes preserve the private rolled deployment.
 // Keep this separate solo fixture so no multiplayer player is displaced.
 const saveProof=await german.evaluate(async()=>{
  const seat=await api('/api/match',{scenario:'current:nightfall_veil',ruleset:'dsl',opponent:'computer',side:'de'});
  const headers={Authorization:`Bearer ${seat.token}`,'Content-Type':'application/json'};
  const before=await (await fetch(`/api/match/${seat.code}`,{headers})).json();
  const saved=await (await fetch(`/api/match/${seat.code}/save`,{method:'POST',headers,body:JSON.stringify({revision:before.revision})})).json();
  const restored=await api('/api/restore',{code:saved.save_code});remember(restored);await refresh();
  return {before:before.units.filter(u=>u.side==='de').map(u=>({id:u.id,pos:u.pos,hp:u.hp})),code:restored.code,original:seat.code};
 });await settle(german);await checkSearch(german);assert.notEqual(saveProof.code,saveProof.original);assert.deepEqual(await german.evaluate(()=>state.units.filter(u=>u.side==='de').map(u=>({id:u.id,pos:u.pos,hp:u.hp}))),saveProof.before);await snap(german,'nightveil-restored-defense-phone');
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);console.log('PASS: Current-only Veil; 780 hexes; 2 search sectors/18 possible sites without exact radar markers; concealed randomized legal defenses visible to their owner; actual finite Pathfinder flare reveals radar; shared light; stable private save restore; desktop/phone mission and views.',JSON.stringify({screenshots:tmp}));
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,'failure-'+i+'.png')});console.error(i,await pages[i].evaluate(()=>({message:$('message').textContent,selected,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
