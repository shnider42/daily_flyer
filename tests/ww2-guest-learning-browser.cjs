const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-guest-learning-')),base='http://127.0.0.1:8124',db=path.join(temp,'games.sqlite3');
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8124','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[];
async function open(p){if(await p.locator('#tutorialCoach').isVisible())return;await tap(p,p.locator('#guideToggle'));await p.locator('#tutorialCoach').waitFor({state:'visible'});}
async function topic(p,id){await open(p);if(!await p.locator('#lessonContents').evaluate(n=>n.open))await p.locator('#lessonContents>summary').click();await p.locator(`#lessonTopics [data-topic="${id}"]`).click();}
async function close(p){await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));}
async function fixture(p,name,side='us'){
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.engine import initial
db=sqlite3.connect(sys.argv[1]);old=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
s=initial(sys.argv[3],'dsl');s.update(ready=True,revision=old['revision']+1)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));db.commit()
`,db,code,name]);
 await p.evaluate(async side=>{document.dispatchEvent(new Event('ww2:cancel-targeting'));combatMode=null;smokeMode=false;barrageMode=false;selected=null;target=null;state=await api('/api/match/'+session.code);if(side!==state.side){state.side=side;state.legal={};}render();},side);
}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']});
 const p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
 await p.goto(base);await p.waitForFunction(()=>ww2Commander.guest);await p.locator('#learnStart').click();await p.locator('[data-chapter="village"] button').click();
 await p.waitForFunction(()=>state&&!busy&&ww2Learning.enabled);await p.locator('#tutorialCoach').waitFor({state:'visible'});
 assert.ok(await p.locator('#lessonTopics button').count()>=15);assert.match(await p.locator('#lessonText').textContent(),/two of your turns/);
 const original=await p.evaluate(()=>({code:session.code,revision:state.revision,preferences:[document.body.classList.contains('simple-play'),$('terrainToggle').textContent,$('unitStyleToggle').textContent]}));
 await p.locator('#lessonShow').click();await p.locator('#missionDialog').waitFor({state:'visible'});assert.match(await p.locator('#missionRules').textContent(),/Losing the objective/);await p.locator('#missionClose').click();
 assert.ok(await p.locator('#battleMission').isVisible());assert.match(await p.locator('#mobileBattleStatus strong').textContent(),/YOUR TURN/);
 await topic(p,'select');await p.locator('#lessonShow').click();await p.locator('#map .unit.us').first().click();
 await open(p);assert.match(await p.locator('#lessonResult').textContent(),/You tried/);
 await topic(p,'move');await p.locator('#lessonShow').click();await p.locator('#map .hex.move').first().click();await p.waitForFunction(()=>!busy&&state.revision===1);
 await open(p);assert.match(await p.locator('#lessonResult').textContent(),/You tried/);await topic(p,'orders');
 await topic(p,'ap');await close(p);await p.reload();await p.waitForFunction(()=>ww2Commander.guest);await tap(p,p.locator('.saved-session').first());await p.waitForFunction(()=>state&&!busy);await open(p);
 assert.match(await p.locator('#lessonTitle').textContent(),/Plan your AP/);assert.equal(await p.evaluate(()=>state.revision),1);await close(p);
 // Mission and turn signals apply to both sides; lessons follow the scenario.
 for(const [name,side,pattern,topicId] of [['market_garden','us',/hold ★ for 2 turns/,'observation'],['market_garden','de',/deny ★/,'command'],['midway','us',/6 points or carriers/,'fleet'],['britain','us',/defend stations/,'service'],['britain','de',/destroy stations/,'fire']]){
  await fixture(p,name,side);assert.match(await p.locator('#battleMission').textContent(),pattern);await p.locator('#battleMission').click();
  assert.match(await p.locator('#missionGoal').textContent(),name==='midway'?/6 control points/:name==='britain'?/RAF|bomber|station/:side==='us'?/two of your turns/:/Keep the attackers/);
  await p.locator('#missionClose').click();await topic(p,topicId);assert.ok((await p.locator('#lessonText').textContent()).length>80);await close(p);
 }
 await fixture(p,'market_garden');
 const pending=await p.evaluate(()=>polling);if(pending)await p.waitForFunction(()=>!polling);
 // Synthetic public turn transitions, isolated from polling; never inspect a
 // private enemy state to build mission progress or change orders.
 await p.evaluate(()=>{window.realRefresh=refresh;refresh=async()=>{};});
 for(const [change,phase,text] of [[{ready:false},'waiting','WAITING'],[{ready:true,turn:'de'},'opponent','THEIR TURN'],[{turn:'us',round:2},'yours','YOUR TURN'],[{order_history:{redo_required:true}},'redo','REDO FIRST'],[{order_history:{},winner:'us'},'finished','VICTORY']]){
  await p.evaluate(change=>{Object.assign(state,change);render();},change);assert.equal(await p.locator('#game').getAttribute('data-phase'),phase);assert.match(await p.locator('#mobileBattleStatus strong').textContent(),new RegExp(text));
  await close(p);
 }
 await p.evaluate(()=>{state.winner=null;state.ready=true;state.order_history={};render();});
 await p.waitForTimeout(300);assert.match(await p.locator('#battleAnnouncer').textContent(),/YOUR TURN/);
 const spoken=await p.locator('#battleAnnouncer').textContent();await p.evaluate(()=>{busy=true;document.dispatchEvent(new Event('ww2:busy'));busy=false;render();});await p.waitForTimeout(300);assert.equal(await p.locator('#battleAnnouncer').textContent(),spoken);
 // All familiar preferences and layouts retain one stable map/mission control.
 for(const [width,height] of [[320,844],[390,844],[844,390],[1440,1000]]){
  await p.setViewportSize({width,height});await p.waitForFunction(w=>w>=1100?ww2Desktop.active:!!document.getElementById('mobileBattleScreen'),width);
  assert.equal(await p.locator('#battleMission').count(),1);assert.ok(await p.locator('#battleMission').isVisible());
  const map=await p.locator('#mapWrap').boundingBox();const goal=await p.locator('#battleMission').boundingBox();assert.ok(goal.y+goal.height<=map.y+1);
  for(const id of await p.evaluate(()=>state.units.filter(u=>u.side===state.side&&u.hp>0&&!u.reserve).slice(0,5).map(u=>u.id))){
   await p.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),id);const next=await p.locator('#mapWrap').boundingBox();assert.ok(Math.abs(next.y-map.y)<1&&Math.abs(next.height-map.height)<1);
  }
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width<1100){const overflow=await p.locator('#mobileBattleTop').evaluate(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1);assert.equal(overflow,false);}
  await p.screenshot({path:path.join(temp,`battle-${width}.png`)});await open(p);await p.screenshot({path:path.join(temp,`guide-${width}.png`)});await close(p);
 }
 await p.evaluate(()=>{refresh=window.realRefresh;});await fixture(p,'village');
 // The login is a real commander account, not a selected Commander unit.
 await tap(p,p.locator('#leave'));await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();
 await p.locator('#commanderName').fill('GuideTest'+Date.now());await p.locator('#commanderPassword').fill('Local-test-password-42');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>!!ww2Commander.name&&!document.getElementById('commanderDialog').open);
 assert.ok(await p.locator('.home-learn').isVisible());await tap(p,p.locator('.saved-session').first());await p.waitForFunction(()=>state&&!busy);
 assert.equal(await p.locator('#guideToggle').evaluate(e=>e.hidden),false);await p.evaluate(()=>ww2Learning.open());assert.ok(await p.locator('#tutorialCoach').isVisible());await close(p);assert.ok(await p.locator('#battleMission').isVisible());
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!!document.getElementById('mobileBattleScreen'));assert.equal(await p.locator('#guideToggle').evaluate(e=>e.hidden),false);
 await tap(p,p.locator('#leave'));await p.locator('#commanderSignOut').click();await p.waitForFunction(()=>ww2Commander.guest);assert.ok(await p.locator('#learnStart').isVisible());
 await tap(p,p.locator('.saved-session').first());await p.waitForFunction(()=>state&&!busy);assert.equal(await p.locator('#guideToggle').evaluate(e=>e.hidden),false);
 assert.deepEqual(await p.evaluate(()=>[document.body.classList.contains('simple-play'),$('terrainToggle').textContent,$('unitStyleToggle').textContent]),original.preferences);
 // Expired login and storage-disabled guests can still learn.
 const expired=await browser.newPage({viewport:{width:390,height:844}});await expired.addInitScript(()=>localStorage.setItem('ww2-commander',JSON.stringify({name:'Expired commander',token:'invalid-local-test-token'})));await expired.goto(base);await expired.waitForFunction(()=>ww2Commander.guest);assert.ok(await expired.locator('#learnStart').isVisible());
 const privatePage=await browser.newPage({viewport:{width:390,height:844}});privatePage.on('pageerror',e=>errors.push(e.message));await privatePage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('Storage disabled');};Storage.prototype.setItem=()=>{throw Error('Storage disabled');};});
 await privatePage.goto(base);await privatePage.waitForFunction(()=>ww2Commander.guest);await privatePage.locator('#learnStart').click();await privatePage.locator('[data-chapter="village"] button').click();await privatePage.locator('#tutorialCoach').waitFor({state:'visible'});assert.ok(await privatePage.locator('#lessonTopics button').count()>=15);
 assert.deepEqual(errors,[]);console.log('Guest practice, live tasks, saved lessons, login/logout/expired sessions, private storage, map-specific victory/turn signals and stable mobile/desktop layouts passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
