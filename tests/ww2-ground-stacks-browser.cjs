/* Actual browser controls, private local database: no production matches. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-ground-stacks-browser-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8174';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8174','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
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
 for x in range(10):s['battlefield']['map'][y][x]='field'
positions={'us-A-1':[2,5],'us-A-2':[2,6],'us-A-5':[2,7],'us-B-2':[3,5],'us-B-1':[4,5],'de-A-4':[6,7],'de-A-2':[6,7]}
for u in s['units']:
 if u['id'] in positions:u['pos']=positions[u['id']]
s['revision']+=1;update_intel(s)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
`,db,code],{env:{...process.env,PYTHONPATH:process.cwd()}});
}
async function counter(p,id){await tap(p,p.locator(`#map .unit[data-unit-id="${id}"]`));}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 const host=await page(1440,'StackHost'),ally=await page(390,'StackAlly');
 await create(host,'belfry_valley');const code=await host.evaluate(()=>session.code);
 await ally.locator('#lobbyRefresh').click();await ally.locator(`.public-game[data-code="${code}"] button`).click();await ally.locator('#coopJoinSide').selectOption('us');await ally.locator('#coopJoinGroup').selectOption('us:B');await ally.locator('#coopJoinSubmit').click();await ally.locator('#coopRoom').waitFor({state:'visible'});await settle(ally);await refresh(host);
 await host.locator('#coopStart').click();await settle(host);await refresh(ally);
 fixture(code);await refresh(host);await refresh(ally);
 await select(host,'us-A-1');await counter(host,'us-B-2');await host.locator('#groundStack').waitFor({state:'visible'});
 assert.match(await host.locator('#groundStack').textContent(),/Controlled by StackAlly/);
 await host.locator('#groundStackMove').click();await settle(host);
 assert.deepEqual(await host.evaluate(()=>state.units.find(u=>u.id==='us-A-1').pos),[3,5]);
 assert.equal(await host.evaluate(()=>state.units.find(u=>u.id==='us-A-1').ap),2);
 assert.equal(await host.locator('#map .ground-shared').count(),4);
 await counter(host,'us-A-1');assert.equal(await host.locator('#groundStack .ground-stack-options button').count(),2);
 assert.match(await host.locator('#groundStack').textContent(),/Your command.*Controlled by StackAlly/s);
 await host.screenshot({path:path.join(tmp,'desktop-shared-hex-owners.png'),fullPage:true});
 await host.locator('#groundStack button[data-unit-id="us-A-1"]').click();
 await refresh(ally);await select(ally,'us-B-1');await counter(ally,'us-A-1');
 assert.equal(await ally.locator('#groundStackMove').count(),0,'A third unit cannot enter');
 assert.match(await ally.locator('#groundStack').textContent(),/Controlled by StackHost/);
 await noOverflow(ally);await ally.screenshot({path:path.join(tmp,'phone-shared-hex-owners.png'),fullPage:true});
 await ally.locator('#groundStack button[data-unit-id="us-B-2"]').click();
 await tap(ally,ally.locator('#map .hex.move[data-x="4"][data-y="6"]'));await settle(ally);
 assert.deepEqual(await ally.evaluate(()=>state.units.find(u=>u.id==='us-B-2').pos),[4,6]);
 assert.deepEqual(await ally.evaluate(()=>state.units.find(u=>u.id==='us-A-1').pos),[3,5]);
 await ally.reload();await ally.waitForFunction(()=>ww2Commander.ready);await ally.locator('#lobbyRefresh').click();await ally.locator(`.public-game[data-code="${code}"] button`).click();await settle(ally);assert.deepEqual(await ally.evaluate(()=>state.units.find(u=>u.id==='us-B-2').pos),[4,6]);
 await refresh(host);await select(host,'us-A-5');await counter(host,'de-A-4');
 assert.equal(await host.locator('#groundStack button[data-unit-id]').count(),2);
 await host.locator('#groundStack button[data-unit-id="de-A-4"]').click();assert.equal(await host.evaluate(()=>target),'de-A-4');
 assert.equal(await host.locator('#fire').isDisabled(),false);
 await tap(host,host.locator('#snipe'));await tap(host,host.getByRole('button',{name:/^Snipe Rifle squad A4,/}));
 await host.locator('#groundStack').waitFor({state:'visible'});assert.match(await host.locator('#groundStackTitle').textContent(),/choose target/);
 const unchosen=await host.evaluate(()=>state.units.find(u=>u.id==='de-A-4').hp);
 await host.locator('#groundStack button[data-unit-id="de-A-2"]').click();await settle(host);
 assert.equal(await host.evaluate(()=>state.last_combat.target),'de-A-2');
 assert.equal(await host.evaluate(()=>state.units.find(u=>u.id==='de-A-4').hp),unchosen);
 assert.equal(await host.evaluate(()=>state.units.find(u=>u.id==='us-A-5').ap),0);
 assert.match(await host.locator('#manualAP').textContent(),/two friendly ground units/);
 await host.screenshot({path:path.join(tmp,'desktop-shared-target-result.png'),fullPage:true});
 await host.locator('#homeBattles').click();await create(host,'vire_crossroads');
 assert.equal(await host.evaluate(()=>state.coop.groups.filter(g=>!g.command).length),4);
 assert.equal(await host.locator('#coopGroup option').count(),2);
 await host.locator('#coopStart').click();await settle(host);
 assert.equal(await host.evaluate(()=>state.units.filter(u=>u.side==='us').length),17);
 assert.equal(await host.evaluate(()=>!!state.ground_stack_version),false);
 assert.equal(await host.locator('#groundStackManual').isVisible(),false);
 await noOverflow(host);await host.screenshot({path:path.join(tmp,'vire-two-platoons.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: desktop/phone shared-hex movement, two owners, full-capacity refusal, independent exit, reload, enemy selection, sniper chooser, Vire two-platoon recruitment and saved-rule UI.',tmp);
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,`failure-${i}.png`),fullPage:true});console.error(i,await pages[i].evaluate(()=>({selected,side:state?.side,message:$('message').textContent,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
