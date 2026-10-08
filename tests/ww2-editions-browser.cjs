/* Real desktop / phone controls; every match and fixture is local and disposable. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-editions-browser-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8175';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8175','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
const errors=[],pages=[];let browser;
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function refresh(p){await p.evaluate(()=>refresh());await settle(p);}
async function page(width,name){
 const p=await browser.newPage({viewport:{width,height:900},hasTouch:width<1000,isMobile:width<1000});pages.push(p);p.setDefaultTimeout(18000);
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(base);
 await p.waitForFunction(()=>scenarios.length===24&&currentScenarios.length===25&&ww2Commander.ready);
 await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-editions-test-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);return p;
}
async function edition(p,map,value='current'){
 await p.locator('#scenarioSelectEdition').selectOption(value);await p.locator('#scenarioSelect').selectOption((value==='current'?'current:':'')+map);
}
async function create(p,map,value='current',size='platoons'){
 await edition(p,map,value);await p.locator('#createCoop').click();await p.locator('#coopControlSize').selectOption(size);await p.locator('#namedGameSubmit').click();await p.locator('#coopRoom').waitFor({state:'visible'});await settle(p);
}
async function join(p,code,group){
 await p.locator('#lobbyRefresh').click();await p.locator(`.public-game[data-code="${code}"] button`).click();
 await p.locator('#coopJoinSide').selectOption('us');await p.locator('#coopJoinGroup').selectOption(group);await p.locator('#coopJoinSubmit').click();await p.locator('#coopRoom').waitFor({state:'visible'});await settle(p);
}
async function select(p,id){
 const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);
 assert.ok(index>=0,id);await tap(p,p.locator('#roster button').nth(index));await settle(p);
}
async function counter(p,id){await tap(p,p.locator(`#map .unit[data-unit-id="${id}"]`));}
function fixture(code,kind){
 return JSON.parse(cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
db=sqlite3.connect(sys.argv[1]);code,kind=sys.argv[2:]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
own=lambda role,group:next(u for u in s['units'] if u['side']=='us' and u['kind']==role and u['platoon']==group)
if kind=='kharkov':
 scout,tank,mate=own('scout','A'),own('tank','A'),own('leader','B')
 enemy=next(u for u in s['units'] if u['side']=='de' and u['kind']=='tank' and not u.get('reserve'))
 for y in range(3,9):
  for x in range(11):s['battlefield']['map'][y][x]='field'
 scout['pos']=[3,4];tank['pos']=[2,5];mate['pos']=[4,4];enemy['pos']=[8,5]
 result=dict(scout=scout['id'],tank=tank['id'],mate=mate['id'],enemy=enemy['id'])
elif kind=='fubar':
 scout,squad,plane=own('leader','A'),own('squad','A'),own('fighter','AIR')
 for y in range(10,15):
  for x in range(8,15):s['battlefield']['map'][y][x]='field'
 scout['pos']=[9,12];squad['pos']=[10,12];plane['pos']=[11,12]
 result=dict(scout=scout['id'],squad=squad['id'],plane=plane['id'])
s['revision']+=1;update_intel(s)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
print(json.dumps(result))
`,db,code,kind],{env:{...process.env,PYTHONPATH:process.cwd()}}));
}
async function screenshot(p,name){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(tmp,name+'.png'),fullPage:true});}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 const host=await page(1440,'EditionHost'),ally=await page(390,'EditionAlly');
 assert.equal(await host.locator('#scenarioSelectEdition').inputValue(),'legacy');
 await edition(host,'kharkov');assert.equal(await host.locator('#rulesetSelect').inputValue(),'dsl');assert.equal(await host.locator('#scenarioSelect option').count(),25);
 assert.match(await host.locator('#scenarioSelectEditionNote').textContent(),/two friendly ground units/);await screenshot(host,'current-catalog-desktop');
 await create(host,'kharkov');const code=await host.evaluate(()=>session.code);
 assert.match(await host.locator('#coopRoomMap').textContent(),/Current DSL/);await join(ally,code,'us:B');
 assert.match(await ally.locator('#coopYourCommand').textContent(),/Soviet|Soviets/);await refresh(host);await host.locator('#coopStart').click();await settle(host);await refresh(ally);
 const ids=fixture(code,'kharkov');await refresh(host);await refresh(ally);
 const before=await host.evaluate(id=>state.legal[id].targets.find(t=>t.id===state.units.find(u=>u.side==='de'&&u.kind==='tank'&&!u.reserve).id)?.threshold,ids.tank);
 await select(host,ids.scout);await counter(host,ids.mate);await host.locator('#groundStackMove').click();await settle(host);
 assert.deepEqual(await host.evaluate(id=>state.units.find(u=>u.id===id).pos,ids.scout),[4,4]);
 await host.locator('#observe').click();await settle(host);await host.locator('#spotFire').click();
 await tap(host,host.getByRole('button',{name:/^Spot for fire at I6/}));await settle(host);
 await select(host,ids.tank);await counter(host,ids.enemy);assert.equal(await host.evaluate(id=>state.legal[selected].targets.find(t=>t.id===id).threshold,ids.enemy),before-1);
 assert.match(await host.locator('#rulesetBadge').textContent(),/Current/);await screenshot(host,'current-kharkov-recon-desktop');
 await refresh(ally);await counter(ally,ids.scout);assert.equal(await ally.locator('#groundStack .ground-stack-options button').count(),2);assert.match(await ally.locator('#groundStack').textContent(),/Controlled by EditionHost/);await screenshot(ally,'current-kharkov-owners-phone');
 await ally.locator('#groundStackClose').click();await ally.reload();await ally.waitForFunction(()=>ww2Commander.ready);await ally.locator('#lobbyRefresh').click();await ally.locator(`.public-game[data-code="${code}"] button`).click();await settle(ally);
 assert.equal(await ally.evaluate(()=>state.edition),'current');assert.equal(await ally.evaluate(()=>state.side),'us');
 await host.locator('#homeBattles').click();await ally.locator('#homeBattles').click();
 await create(host,'fubar');const fubar=await host.evaluate(()=>session.code);await join(ally,fubar,'us:AIR');await refresh(host);await host.locator('#coopStart').click();await settle(host);await refresh(ally);
 const joint=fixture(fubar,'fubar');await refresh(host);await refresh(ally);
 await select(host,joint.scout);await counter(host,joint.squad);await host.locator('#groundStackMove').click();await settle(host);await refresh(ally);
 await select(ally,joint.plane);await counter(ally,joint.squad);assert.match(await ally.locator('#groundStackMove').textContent(),/Fly.*above/);await ally.locator('#groundStackMove').click();await settle(ally);
 assert.equal(await ally.evaluate(()=>state.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id&&u.pos[0]===10&&u.pos[1]===12).length),3);
 await counter(ally,joint.plane);assert.equal(await ally.locator('#groundStack .ground-stack-options button').count(),3);assert.match(await ally.locator('#groundStack').textContent(),/Air layer/);await screenshot(ally,'current-fubar-two-ground-one-air-phone');await ally.locator('#groundStackClose').click();
 await refresh(host);await select(host,joint.scout);await host.locator('#findUnit').click();await screenshot(host,'current-fubar-three-occupants-desktop');
 assert.equal(await host.locator(`#map .unit[data-unit-id="${joint.plane}"] .joint-air-badge`).count(),0);assert.ok((await host.locator('#map .ground-stack-count').allTextContents()).includes('2+AIR'));
 await host.locator('#homeBattles').click();await create(host,'vire_crossroads','legacy');await host.locator('#coopStart').click();await settle(host);
 assert.equal(await host.evaluate(()=>!!state.ground_stack_version),false);assert.equal(await host.evaluate(()=>!!state.edition),false);assert.match(await host.locator('#rulesetBadge').textContent(),/Legacy/);assert.equal(await host.locator('#groundStackManual').isVisible(),false);await screenshot(host,'legacy-vire-unchanged');
 await host.locator('#homeBattles').click();await edition(host,'village');await host.locator('#learnStart').click();assert.equal(await host.locator('#journeyEdition').inputValue(),'current');
 await host.locator('[data-chapter="village"] button').click();await settle(host);assert.equal(await host.evaluate(()=>state.scenario.id),'current:village');assert.equal(await host.evaluate(()=>ww2Learning.lessons(state)[0].id),'current-edition');
 await host.locator('#lessonExit').click();await host.locator('#homeBattles').click();await host.locator('#learnStart').click();assert.match(await host.locator('[data-chapter="village"] button').textContent(),/Resume/);
 await host.locator('#journeyEdition').selectOption('legacy');assert.match(await host.locator('[data-chapter="village"] button').textContent(),/Start/);await host.locator('#journeyClose').click();
 assert.deepEqual(errors,[]);console.log('PASS: desktop/phone Current and Legacy catalogs, cooperative ownership/reconnect, Kharkov recon backport, two ground plus one air under separate players, Legacy Vire, and separate Journey progress.',tmp);
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,`failure-${i}.png`),fullPage:true});console.error(i,await pages[i].evaluate(()=>({selected,side:state?.side,message:$('message').textContent,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
