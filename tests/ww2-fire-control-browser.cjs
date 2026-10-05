/* Actual browser controls, private local database: no production matches. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-fire-control-browser-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8173';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8173','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
const errors=[],dialogs=[],pages=[];let browser;
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function refresh(p){await p.evaluate(()=>refresh());await settle(p);}
async function page(width,name){
 const p=await browser.newPage({viewport:{width,height:900},hasTouch:width<1000,isMobile:width<1000});pages.push(p);p.setDefaultTimeout(15000);
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await p.goto(base);await p.waitForFunction(()=>scenarios.length===24&&ww2Commander.ready);
 await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-browser-pass-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);return p;
}
async function create(p,map){await p.locator('#scenarioSelect').selectOption(map);await p.locator('#createCoop').click();await p.locator('#coopControlSize').selectOption('platoons');await p.locator('#namedGameSubmit').click();await p.locator('#coopRoom').waitFor({state:'visible'});await settle(p);}
async function select(p,id){const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);assert.ok(index>=0);await tap(p,p.locator('#roster button').nth(index));await settle(p);}
async function noOverflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
function fixture(code){
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
db=sqlite3.connect(sys.argv[1]);code=sys.argv[2]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
for y in range(4,10):
 for x in range(11):s['battlefield']['map'][y][x]='field'
s['battlefield']['map'][7][3]='building';s['buildings']['3,7']='intact'
positions={'us-A-2':[4,5],'us-A-3':[2,5],'us-B-2':[4,7],'us-B-6':[2,7],'de-A-3':[8,5],'de-A-7':[8,7]}
for u in s['units']:
 if u['id'] in positions:u['pos']=positions[u['id']]
s['revision']+=1;update_intel(s)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
`,db,code],{env:{...process.env,PYTHONPATH:process.cwd()}});
}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 const host=await page(1440,'FireHost'),ally=await page(390,'FireAlly');
 await create(host,'vire_crossroads');const code=await host.evaluate(()=>session.code);
 await ally.locator('#lobbyRefresh').click();await ally.locator(`.public-game[data-code="${code}"] button`).click();await ally.locator('#coopJoinSide').selectOption('us');await ally.locator('#coopJoinGroup').selectOption('us:B');await ally.locator('#coopJoinSubmit').click();await ally.locator('#coopRoom').waitFor({state:'visible'});await settle(ally);await refresh(host);
 assert.match(await ally.locator('#coopYourCommand').textContent(),/Americans.*British.*Platoon B/);
 await host.locator('#coopStart').click();await settle(host);await refresh(ally);
 assert.equal(await host.evaluate(()=>state.side),'us');assert.equal(await ally.evaluate(()=>state.side),'us');
 assert.equal(await host.evaluate(()=>state.coop.groups.filter(g=>!g.command&&!g.owner).length),4);
 assert.match(await host.locator('#objectiveName').textContent(),/VIRE CROSSROADS/);
 assert.match(await host.locator('#missionHint').textContent(),/River junction/);
 await host.screenshot({path:path.join(tmp,'vire-desktop.png'),fullPage:true});
 fixture(code);await refresh(host);await refresh(ally);
 assert.equal(await host.evaluate(()=>state.legal['us-A-3'].targets.find(t=>t.id==='de-A-3').threshold),6);
 await select(host,'us-A-2');assert.equal(await host.locator('#spotFire').isDisabled(),true);
 await tap(host,host.locator('#observe'));await settle(host);await tap(host,host.locator('#spotFire'));
 await tap(host,host.getByRole('button',{name:'Spot for fire at I6',exact:true}));await settle(host);
 assert.match(await host.locator('#roleBrief').textContent(),/FIRE DIRECTION/);
 assert.equal(await host.evaluate(()=>state.legal['us-A-3'].targets.find(t=>t.id==='de-A-3').threshold),5);
 assert.equal(await host.locator('.fire-direction-label').textContent(),'SPOT A');
 await select(host,'us-A-3');await tap(host,host.locator('#map .unit[data-unit-id="de-A-3"]'));assert.match(await host.locator('#unitMechanics').textContent(),/recon|Recon/);await host.screenshot({path:path.join(tmp,'direct-fire-support.png'),fullPage:true});
 await refresh(ally);await select(ally,'us-B-2');await tap(ally,ally.locator('#observe'));await settle(ally);await tap(ally,ally.locator('#spotFire'));
 await tap(ally,ally.getByRole('button',{name:'Spot for fire at I8',exact:true}));await settle(ally);
 await select(ally,'us-B-6');assert.equal(await ally.locator('#mortarFire').isVisible(),false);
 assert.match(await ally.locator('#unitMechanics').textContent(),/INDIRECT MORTAR/);
 await tap(ally,ally.locator('#areaFire'));
 const label=await ally.locator('#map .combat-choice').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')).find(label=>/I8\b/.test(label)));
 assert.ok(label);await tap(ally,ally.locator('#map .unit[data-unit-id="de-A-7"]'));await settle(ally);
 assert.ok(dialogs.some(t=>/indirect mortar.*Needs 4\+.*after the enemy turn/.test(t)));
 assert.equal(await ally.evaluate(()=>state.units.find(u=>u.id==='us-B-6').shells),2);
 assert.equal(await ally.evaluate(()=>state.barrages.find(b=>b.weapon==='observed_mortar').threshold),4);
 await noOverflow(ally);await ally.screenshot({path:path.join(tmp,'mortar-phone.png'),fullPage:true});
 await refresh(host);await tap(host,host.locator('#end'));await settle(host);
 assert.equal(await host.evaluate(()=>state.turn),'us');assert.equal(await host.evaluate(()=>state.coop.done),true);
 assert.ok(await host.evaluate(()=>state.units.find(u=>u.id==='us-A-2').fire_mark));
 await refresh(ally);await tap(ally,ally.locator('#end'));await ally.waitForFunction(()=>state.round===2&&state.turn==='us'&&!state.coop.resolving,{},{timeout:120000});await settle(ally);if(await ally.evaluate(()=>!!playbackSession))await ally.locator('#skipPlayback').click();await settle(ally);assert.equal(await ally.evaluate(()=>state.coop.done),false);assert.equal(await ally.evaluate(()=>state.barrages.filter(b=>b.side==='us').length),0);
 const valley=await page(1440,'BelfryHost');await create(valley,'belfry_valley');await valley.locator('#coopStart').click();await settle(valley);
 assert.equal(await valley.evaluate(()=>state.units.filter(u=>u.side===state.side).length),22);
 assert.match(await valley.locator('#objective').textContent(),/British.*Commonwealth/);
 assert.equal(await valley.locator('#map use.church-art').count(),2);
 assert.equal(await valley.locator('#map .front-marker').count(),3);
 await noOverflow(valley);await tap(valley,valley.locator('#desktopFit'));await valley.screenshot({path:path.join(tmp,'belfry-desktop.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: Vire/Belfry, allied platoon ownership, recon direct fire 6+ to 5+, phone indirect mortar 4+, finite shell, co-op readiness, churches/flags, responsive layout.',tmp);
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,`failure-${i}.png`),fullPage:true});console.error(i,await pages[i].evaluate(()=>({selected,side:state?.side,message:$('message').textContent,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
