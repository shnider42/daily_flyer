/* Real desktop/phone browser interaction against a disposable local database. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-coop-browser-'),base='http://127.0.0.1:8172';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8172','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(tmp,'db.sqlite')},stdio:'ignore'});
const errors=[],pages=[];let browser;
async function settle(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function skip(p){if(await p.evaluate(()=>!!playbackSession))await p.locator('#skipPlayback').click();await settle(p);}
async function refresh(p){await p.evaluate(()=>refresh());await settle(p);await skip(p);}
async function page(width){const p=await browser.newPage({viewport:{width,height:900},hasTouch:width<1000,isMobile:width<1000});pages.push(p);p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(base);await p.waitForFunction(()=>scenarios.length===22&&ww2Commander.ready);return p;}
async function register(p,name){await p.locator('#commanderSignIn').click();await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('local-browser-pass-123');await p.locator('#commanderSubmit').click();await p.waitForFunction(()=>ww2Commander.name&&!$('commanderDialog').open);}
async function join(p,code,side){
 await p.locator('#lobbyRefresh').click();const row=p.locator(`.public-game[data-code="${code}"]`);await row.waitFor();assert.equal(await row.locator('button').textContent(),'Choose army & group');await row.locator('button').click();
 await p.locator('#coopJoinDialog').waitFor({state:'visible'});await p.locator('#coopJoinSide').selectOption(side);await p.locator('#coopJoinSubmit').click();await p.locator('#coopRoom').waitFor({state:'visible'});await settle(p);
}
async function noOverflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 const host=await page(1440),ally=await page(390),enemy=await page(390);
 await register(host,'BrowserHost');await register(ally,'BrowserAlly');await register(enemy,'BrowserEnemy');
 await host.locator('#scenarioSelect').selectOption('village');await host.locator('#createCoop').click();await host.locator('#coopDefaultDifficulty').selectOption('easy');await host.locator('#multiplayerName').fill('Co-op browser exercise');await host.locator('#namedGameSubmit').click();await host.locator('#coopRoom').waitFor({state:'visible'});await settle(host);
 const code=await host.evaluate(()=>session.code);await join(ally,code,'us');await join(enemy,code,'de');await refresh(host);
 assert.equal(await host.evaluate(()=>state.coop.players.length),3);
 for(const p of [host,ally,enemy])await noOverflow(p);
 await host.screenshot({path:path.join(tmp,'desktop-command-room.png'),fullPage:true});await ally.screenshot({path:path.join(tmp,'phone-command-room.png'),fullPage:true});
 await host.locator('#coopAssignments details').first().locator('summary').click();const difficulty=host.locator('#coopAssignments select').first();await difficulty.selectOption('standard');await settle(host);assert.equal(await difficulty.inputValue(),'standard');
 await host.locator('#coopStart').click();await host.locator('#game').waitFor({state:'visible'});await settle(host);await refresh(ally);await refresh(enemy);
 assert.equal(await host.locator('#end').textContent(),'Finish my orders');assert.equal(await ally.locator('#end').textContent(),'Finish my orders');assert.equal(await enemy.locator('#end').isDisabled(),true);
 for(const p of [host,ally,enemy])await noOverflow(p);
 await host.screenshot({path:path.join(tmp,'desktop-shared-battle.png'),fullPage:true});await ally.screenshot({path:path.join(tmp,'phone-shared-battle.png'),fullPage:true});
 await tap(host,host.locator('#end'));await settle(host);assert.equal(await host.evaluate(()=>state.coop.done),true);assert.equal(await host.evaluate(()=>state.turn),'us');
 await refresh(ally);await tap(ally,ally.locator('#end'));await settle(ally);await skip(ally);await refresh(enemy);assert.equal(await enemy.evaluate(()=>state.turn),'de');
 await tap(enemy,enemy.locator('#end'));await settle(enemy);await skip(enemy);await refresh(host);assert.equal(await host.evaluate(()=>state.round),2);
 await host.locator('#coopQuick').click();await host.locator('#coopTeamsDialog').waitFor({state:'visible'});assert.match(await host.locator('#coopPlayers').textContent(),/BrowserAlly/);await host.locator('#coopTeamsClose').click();
 if(!await host.locator('#battleOptions').evaluate(n=>n.open))await tap(host,host.locator('#battleOptions>summary'));
 await tap(host,host.locator('#resignButton'));await host.locator('#battleResultDialog').waitFor({state:'visible'});assert.equal(await host.locator('#resultRematch').isVisible(),false);await host.locator('#resultHome').click();
 await host.locator('#scenarioSelect').selectOption('shingle_cove');await host.locator('#createCoop').click();await host.locator('#coopControlSize').selectOption('platoons');await host.locator('#multiplayerSide').selectOption('de');await host.locator('#namedGameSubmit').click();await host.locator('#coopRoom').waitFor({state:'visible'});await settle(host);
 await refresh(ally);if(await ally.locator('#battleResultDialog').isVisible())await ally.locator('#resultHome').click();else await tap(ally,ally.locator('#homeBattles'));
 const prep=await host.evaluate(()=>session.code);await join(ally,prep,'de');await refresh(host);await host.locator('#coopStart').click();await settle(host);await refresh(ally);
 await host.locator('#deploymentPanel').waitFor({state:'visible'});assert.equal(await ally.locator('#deploymentPlan').isVisible(),false);assert.equal(await host.locator('#deploymentReset').isVisible(),false);
 await noOverflow(ally);await ally.screenshot({path:path.join(tmp,'phone-cooperative-preparation.png'),fullPage:true});
 await host.locator('#deploymentLock').click();await host.locator('#deploymentConfirm').click();await settle(host);assert.equal(await host.evaluate(()=>state.deployment.phase),'planning');
 await refresh(ally);await ally.locator('#deploymentLock').click();await ally.locator('#deploymentConfirm').click();await settle(ally);await skip(ally);assert.equal(await ally.evaluate(()=>state.deployment.phase),'battle');
 for(const [width,height] of [[320,740],[844,390]]){await ally.setViewportSize({width,height});await ally.waitForTimeout(150);await noOverflow(ally);await ally.screenshot({path:path.join(tmp,`phone-${width}.png`),fullPage:true});}
 const large=await page(1440);await register(large,'BrowserLarge');
 await large.locator('#scenarioSelect').selectOption('fubar');await large.locator('#createCoop').click();await large.locator('#coopControlSize').selectOption('platoons');await large.locator('#namedGameSubmit').click();await large.locator('#coopRoom').waitFor({state:'visible'});await settle(large);
 let automaticBatches=0;large.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/cooperative')&&r.postDataJSON()?.operation==='advance')automaticBatches++;});
 await large.locator('#coopStart').click();await large.locator('#game').waitFor({state:'visible'});await settle(large);await tap(large,large.locator('#end'));
 await large.waitForFunction(()=>state.round===2&&state.turn==='us'&&!state.coop.resolving,{},{timeout:120000});await settle(large);await skip(large);
 assert.ok(automaticBatches>1,'Large-map computer orders continue automatically across requests');
 assert.equal(await large.evaluate(()=>state.coop.done),false);assert.equal(await large.locator('#end').isDisabled(),false);await noOverflow(large);
 await large.screenshot({path:path.join(tmp,'desktop-large-computer-complete.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: actual desktop + phone co-op recruitment, difficulty, three players/two armies, readiness, AI replays, results, pre-battle placement, 320px + landscape overflow checks, large-map automatic computer batches ('+automaticBatches+').',tmp);
})().catch(async error=>{console.error(error);console.error(errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,`failure-${i}.png`),fullPage:true});console.error(i,await pages[i].evaluate(()=>({code:state?.code,side:state?.side,turn:state?.turn,phase:state?.coop?.phase,done:state?.coop?.done,message:$('message').textContent,playing:!!playbackSession,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})));}catch{}}console.error(tmp);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
