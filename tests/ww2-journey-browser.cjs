/* New entry flows and learning use a disposable DB and real public controls. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-journey-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8161';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8161','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[];
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function close(p){await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));}
async function topic(p,id){if(!await p.locator('#tutorialCoach').isVisible())await tap(p,p.locator('#guideToggle'));if(!await p.locator('#lessonContents').evaluate(n=>n.open))await p.locator('#lessonContents>summary').click();await p.locator('#lessonSearch').fill('');await p.locator(`[data-topic="${id}"]`).click();}
async function register(p,name){await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('Local-test-password-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);}
async function page(viewport){const p=await browser.newPage({viewport,hasTouch:viewport.width<1000,isMobile:viewport.width<1000});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(base);await p.waitForFunction(()=>scenarios.length===22&&ww2Commander.ready);return p;}
async function fixture(p,scenario){
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`import sqlite3,json,sys
from ww2_tactics.engine import initial
d=sqlite3.connect(sys.argv[1]);old=json.loads(d.execute('select state from match where code=?',(sys.argv[2],)).fetchone()[0]);s=initial(sys.argv[3],'dsl');s.update(ready=True,revision=old['revision']+1,battle_number=old.get('battle_number',1)+1);d.execute('update match set state=? where code=?',(json.dumps(s),sys.argv[2]));d.commit()`,db,code,scenario]);
 await p.evaluate(async()=>{state=await apiWithSession(session);selected=null;render();});
}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await page({width:390,height:844});
 // Explicit solo army selection, actual scenario names and an Allied opening turn.
 await p.locator('#createSolo').click();await p.locator('#soloScenario').selectOption('britain');
 assert.deepEqual(await p.locator('#soloSide option').allTextContents(),['RAF','Luftwaffe']);
 await p.locator('#soloScenario').selectOption('village');await p.locator('#soloSide').selectOption('de');await p.locator('#startSolo').click();await settle(p);
 assert.equal(await p.evaluate(()=>state.side),'de');assert.equal(await p.evaluate(()=>state.turn),'de');assert.ok(await p.evaluate(()=>state.computer_playback.frames.length>0));
 // A live defeat is prominently shown, with safe dismissal, reopen and reload.
 await tap(p,p.locator('#resignButton'));await p.locator('#battleResultDialog').waitFor({state:'visible'});
 assert.equal(await p.locator('#battleResultTitle').textContent(),'Defeat');assert.match(await p.locator('#battleResultReason').textContent(),/You resigned/);
 await p.screenshot({path:path.join(tmp,'phone-defeat.png')});await p.locator('#resultReview').click();await p.evaluate(()=>render());assert.equal(await p.locator('#battleResultDialog').isVisible(),false);
 await tap(p,p.locator('#showBattleResult'));await p.locator('#resultHome').click();await p.reload();await p.locator('#sessionList .saved-session').first().click();await settle(p);assert.equal(await p.locator('#battleResultDialog').isVisible(),false);
 await p.locator('#homeBattles').click();
 // Journey is opt-in and adopts the Experience chosen BEFORE entering.
 await p.locator('#homeExperience').selectOption('moderate');await p.locator('#learnStart').click();assert.equal(await p.locator('#journeyExperience').inputValue(),'moderate');assert.equal(await p.locator('.journey-chapter').count(),14);
 await p.screenshot({path:path.join(tmp,'phone-journey.png')});await p.locator('[data-chapter="village"] button').click();await settle(p);await p.locator('#tutorialCoach').waitFor({state:'visible'});
 const chapter=await p.evaluate(()=>session.code);await topic(p,'dice');
 const content={};const before=await p.evaluate(()=>JSON.stringify(state));
 for(const level of ['simple','moderate','expert']){
  await p.evaluate(l=>ww2Experience.set(l),level);content[level]=await p.locator('#lessonText').textContent();
  assert.match(await p.locator('#lessonCount').textContent(),new RegExp(level.toUpperCase()));assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);
  await p.screenshot({path:path.join(tmp,`phone-coach-${level}.png`)});
 }
 assert.match(content.simple,/six-sided/);assert.doesNotMatch(content.moderate,/six-sided|4, 5 or 6/);assert.match(content.expert,/modifier|threshold/);assert.equal(new Set(Object.values(content)).size,3);
 await p.evaluate(()=>ww2Experience.set('moderate'));await topic(p,'move');await p.locator('#lessonShow').click();await p.locator('#map .unit.us').first().click();await p.locator('#map .hex.move').first().click();await settle(p);await topic(p,'move');assert.match(await p.locator('#lessonResult').textContent(),/You tried/);
 await close(p);await p.locator('#homeBattles').click();await p.locator('#learnStart').click();assert.equal(await p.locator('[data-chapter="village"] button').textContent(),'Resume chapter');await p.locator('[data-chapter="village"] button').click();await settle(p);assert.equal(await p.evaluate(()=>session.code),chapter);
 await close(p);await tap(p,p.locator('#resignButton'));await p.locator('#battleResultDialog').waitFor({state:'visible'});assert.ok(await p.locator('#resultJourney').isVisible());await p.locator('#resultJourney').click();assert.match(await p.locator('[data-chapter="village"]').textContent(),/Defeat reviewed/);
 // Pick the Axis in the preparation chapter, then practice the setup controls.
 await p.locator('#journeySide').selectOption('de');await p.locator('[data-chapter="shingle_cove"] button').click();await settle(p);await p.locator('#tutorialCoach').waitFor({state:'visible'});
 assert.equal(await p.evaluate(()=>state.side),'de');assert.match(await p.locator('#lessonTitle').textContent(),/Before round 1/);
 await topic(p,'preparation-support');assert.match(await p.locator('#lessonText').textContent(),/bunker/i);await p.locator('#lessonShow').click();assert.ok(await p.locator('#deploymentPanel').isVisible());
 await p.locator('#deploymentPlan').click();await p.evaluate(()=>focusMapUnit({pos:[0,3]}));await p.locator('.deployment-choice[data-x="0"][data-y="3"]').click();await settle(p);await topic(p,'preparation-support');assert.match(await p.locator('#lessonResult').textContent(),/You tried/);
 await close(p);
 // Every new mechanic is taught only on applicable maps, at all three levels.
 const expected={relay_crossing:['radio','observe','mortar','supply'],kharkov:['armor-control','supply','armor'],dunkirk:['evacuation','transport'],iron_lantern:['airlift','flak','arrival'],tidal_gate:['engineering','linked'],midway:['fleet'],britain:['service'],fubar:['layers','joint-air','joint-sea']};
 for(const [scenario,ids] of Object.entries(expected)){
  await fixture(p,scenario);
  for(const level of ['simple','moderate','expert']){
   await p.evaluate(l=>ww2Experience.set(l),level);
   const book=await p.evaluate(()=>ww2Learning.lessons().map(l=>({id:l.id,text:l.text,detail:l.detail,selector:l.selector})));
   for(const id of ids){assert.ok(book.some(l=>l.id===id),`${scenario} teaches ${id}`);assert.ok(book.find(l=>l.id===id).text.length>60);}
   assert.equal(new Set(book.map(l=>l.id)).size,book.length,'No duplicate chapters');
  }
 }
 // Landscape, small phone and both desktop layouts retain map geometry.
 for(const [width,height] of [[320,740],[844,390],[1440,900]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(120);
  await topic(p,'layers');await p.screenshot({path:path.join(tmp,`coach-${width}.png`)});await close(p);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const rect=await p.locator('#mapWrap').boundingBox();await p.evaluate(()=>ww2Experience.set(ww2Experience.level==='simple'?'expert':'simple'));const next=await p.locator('#mapWrap').boundingBox();assert.deepEqual(next,rect);
 }
 // Multiplayer creation uses visible settings; the lobby offers the actual open army.
 const a=await page({width:1440,height:900}),b=await page({width:390,height:844});await register(a,'Creator'+Date.now());await register(b,'Opponent'+Date.now());
 await a.locator('#create').click();await a.locator('#teamAssignment').selectOption('selected');await a.locator('#multiplayerSide').selectOption('de');await a.locator('#namedGameSubmit').click();await settle(a);
 assert.equal(await a.evaluate(()=>state.side),'de');assert.match(await a.locator('#waiting').textContent(),/You command Germans/);
 const code=await a.evaluate(()=>session.code);await b.locator('#lobbyRefresh').click();const row=b.locator(`.public-game[data-code="${code}"]`);await row.waitFor();assert.equal(await row.locator('button').textContent(),'Join as Americans');await row.locator('button').click();await settle(b);assert.equal(await b.evaluate(()=>state.side),'us');
 await tap(b,b.locator('#resignButton'));await b.locator('#battleResultDialog').waitFor({state:'visible'});await a.evaluate(()=>refresh());await a.locator('#battleResultDialog').waitFor({state:'visible'});assert.equal(await a.locator('#battleResultTitle').textContent(),'Victory');await a.screenshot({path:path.join(tmp,'desktop-victory.png')});
 await a.locator('#resultHome').click();await a.locator('#learnStart').click();assert.ok(await a.locator('#journeyDialog').isVisible(),'Signed-in players can use Journey');await a.locator('#journeyClose').click();
 for(const method of ['coin_flip','random']){
  await a.locator('#create').click();await a.locator('#teamAssignment').selectOption(method);assert.ok(await a.locator('#multiplayerArmyChoice').isHidden());await a.locator('#namedGameSubmit').click();await settle(a);
  assert.equal(await a.evaluate(()=>state.team_assignment.method),method);assert.match(await a.locator('#waiting').textContent(),method==='coin_flip'?/Coin flip: (Heads|Tails)/:/randomly/);await close(a);await a.locator('#homeBattles').click();
 }
 assert.deepEqual(errors,[]);console.log('Journey, all Experiences, both solo sides, private preparation coaching, chapter resume/progress, all modern map topics, both multiplayer seats/random/coin, live result dialogs and responsive layouts passed.',tmp);
})().catch(async e=>{console.error(e);for(const [i,p] of (browser?.contexts().flatMap(c=>c.pages())||[]).entries()){await p.screenshot({path:path.join(tmp,`failure-${i}.png`)}).catch(()=>{});console.error(await p.evaluate(()=>({errors:$('message')?.textContent,code:state?.code,scenario:state?.scenario?.id,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})).catch(()=>({})));}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
