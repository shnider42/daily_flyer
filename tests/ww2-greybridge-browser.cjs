/* Real-browser linked-operation flow. Fixtures affect only a disposable local DB. */
'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {tap:baseTap}=require('./ww2-ui-helpers.cjs');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dsl-greybridge-browser-'));
const db=path.join(tmp,'battles.sqlite3');
const python=process.env.DSL_TEST_PYTHON||'python';
const port=18748;
const base=`http://127.0.0.1:${port}`;
const server=cp.spawn(python,['-c',
  'import sys; from ww2_web import create_app; create_app(sys.argv[1], background_ai=False).run(host="127.0.0.1", port=int(sys.argv[2]), threaded=True)',db,String(port)],
  {cwd:root,env:{...process.env,WW2_DB_PATH:db,WW2_BACKGROUND_AI:'0'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);
let browser;const pages=[],errors=[],badAssets=[];

async function tap(p,locator){
  // Follow the same visible disclosure controls a player uses. The current
  // desktop layout starts Battle options collapsed inside its reports sheet.
  for(let i=0;i<5;i++){
    const details=locator.locator('xpath=ancestor::details[not(@open)]').first();
    if(!await details.count())break;
    await baseTap(p,details.locator(':scope > summary'));
  }
  await baseTap(p,locator);
}

async function settle(p){
  await p.waitForFunction(()=>state&&!busy&&!polling);
  if(await p.evaluate(()=>!!playbackSession)){
    await p.locator('#skipPlayback').click();
    await p.waitForFunction(()=>!playbackSession&&!busy&&!polling);
  }
}
async function page(width,blockedStorage=false){
  const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});
  pages.push(p);p.setDefaultTimeout(25000);
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
  if(blockedStorage)await p.addInitScript(()=>{
    Storage.prototype.getItem=()=>{throw Error('Storage disabled');};
    Storage.prototype.setItem=()=>{throw Error('Storage disabled');};
    Storage.prototype.removeItem=()=>{throw Error('Storage disabled');};
  });
  await p.goto(base);await p.waitForFunction(()=>typeof currentScenarios!=='undefined'&&currentScenarios.length>0&&window.ww2LinkedOperations);
  return p;
}
async function signIn(p,name,register=false){
  await p.locator('#commanderSignIn').click();
  if(register)await p.locator('#commanderRegisterMode').click();
  await p.locator('#commanderName').fill(name);
  await p.locator('#commanderPassword').fill('local-greybridge-browser-password');
  await p.locator('#commanderSubmit').click();
  await p.waitForFunction(name=>ww2Commander.name===name&&!$('commanderDialog').open,name);
}
async function restore(p,code){
  await p.locator('#restoreOptions summary').click();
  await p.locator('#recoveryCode').fill(code);
  await p.locator('#recoverForm button').click();await settle(p);
}
async function closeBrief(p){
  if(await p.locator('#greybridgeDialog').evaluate(e=>e.open))await p.locator('#greybridgeClose').click();
}
async function start(p){
  await p.locator('#greybridgeStart').click();await settle(p);
  await p.locator('#greybridgeDialog').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>state.operation.stage),1);
  assert.equal(await p.locator('#map .hex').count(),120);
}
async function select(p,id){
  await tap(p,p.locator(`#roster button[data-unit-id="${id}"]`));await settle(p);
}
async function order(p,locator){
  const revision=await p.evaluate(()=>state.revision);
  await tap(p,locator);await p.waitForFunction(r=>state.revision>r&&!busy,revision);await settle(p);
}
async function continueOperation(p,stage){
  const old=await p.evaluate(()=>session.code);
  await p.locator('#greybridgeContinue').click();
  await p.waitForFunction(old=>session.code!==old&&state&&!busy,old);await settle(p);
  assert.equal(await p.evaluate(()=>state.operation.stage),stage);
  await p.locator('#greybridgeDialog').waitFor({state:'visible'});
}
async function resign(p){
  await closeBrief(p);await order(p,p.locator('#resignButton'));
  await p.locator('#greybridgeDialog').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>state.winner),'de');
}
async function shot(p,name){
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' page overflow');
  await p.screenshot({path:path.join(tmp,name+'.png')});
}
function fixture(code,mode){
  return JSON.parse(cp.execFileSync(python,['-c',String.raw`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
db=sqlite3.connect(sys.argv[1]); code,mode=sys.argv[2:]
s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
own=[u for u in s['units'] if u['side']=='us' and u['hp']>0]
for i,u in enumerate(u for u in s['units'] if u['side']=='de'):
 u.update(pos=[i,0],pinned=False,overwatch=False)
u=own[0]
if mode=='relay':
 u=next(v for v in own if v['kind']=='scout');u['pos']=s['battlefield']['greybridge_relay'][:]
elif mode=='hold':
 u['pos']=s['battlefield']['objective'][:]
 s['hold']=s['greybridge']['required']-1;s['greybridge']['hold']=s['hold']
elif mode=='exit':u['pos']=s['battlefield']['greybridge_exits'][0][:]
else:raise ValueError(mode)
u.update(ap=3,pinned=False,overwatch=False)
s.update(turn='us',ready=True);s['revision']+=1;s.pop('_order_history',None)
update_intel(s)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));db.commit()
print(json.dumps({'unit':u['id']}))
`,db,code,mode],{cwd:root,env:{...process.env,WW2_DB_PATH:db},encoding:'utf8'}));
}
async function position(p,mode){
  const info=fixture(await p.evaluate(()=>session.code),mode);
  await p.evaluate(()=>refresh());await settle(p);return info.unit;
}

(async()=>{
  for(let i=0;i<150;i++){
    try{if((await fetch(base+'/healthz')).ok)break;}catch{}
    if(server.exitCode!==null)throw new Error('Test server exited: '+serverLog);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  const desktop=await page(1440);await start(desktop);await shot(desktop,'01-raid-briefing-desktop');await closeBrief(desktop);
  // Execute an ordinary move through the real map, retaining familiar controls.
  const move=await desktop.evaluate(()=>{
    const unit=state.units.find(u=>u.side==='us'&&state.legal[u.id]?.moves.length);
    return {id:unit.id,pos:state.legal[unit.id].moves[0].pos};
  });
  await select(desktop,move.id);
  await order(desktop,desktop.locator(`#map .hex.move[data-x="${move.pos[0]}"][data-y="${move.pos[1]}"]`));
  assert.deepEqual(await desktop.evaluate(id=>state.units.find(u=>u.id===id).pos,move.id),move.pos);
  const scout=await position(desktop,'relay');await select(desktop,scout);
  await order(desktop,desktop.locator('#greybridgeSabotage'));
  assert.equal(await desktop.evaluate(()=>state.greybridge.relay_disabled),true);
  assert.equal(await desktop.evaluate(id=>state.units.find(u=>u.id===id).ap,scout),1);
  await shot(desktop,'02-relay-disabled-desktop');
  // A tactical defeat must not erase the completed secondary objective.
  await resign(desktop);assert.match(await desktop.locator('#greybridgeOutcomeDetails').textContent(),/round 6/);
  assert.match(await desktop.locator('#greybridgeOutcomeDetails').textContent(),/Teams lost: 0/);
  await shot(desktop,'03-raid-setback-consequence');
  await continueOperation(desktop,2);
  assert.equal(await desktop.locator('#map .hex').count(),168);
  assert.equal(await desktop.evaluate(()=>state.greybridge.reserve_round),6);
  assert.equal(await desktop.evaluate(()=>state.operation.history.length),1);
  await desktop.locator('#greybridgeHistory button[data-history-index="0"]').click();
  await desktop.locator('#greybridgeReviewDialog').waitFor({state:'visible'});
  assert.equal(await desktop.locator('#greybridgeReviewMap .hex').count(),120);
  assert.match(await desktop.locator('#greybridgeReviewMap').getAttribute('aria-label'),/Read only/);
  assert.match(await desktop.locator('#greybridgeReviewForce').textContent(),/Teams lost: 0.*Still on battlefield: 6.*Extracted: 0/);
  await shot(desktop,'04-archived-raid-review');
  await desktop.locator('#greybridgeReviewClose').click();await closeBrief(desktop);
  const publicState=await desktop.evaluate(()=>api(`/api/match/${session.code}`));
  assert.ok(!Object.hasOwn(publicState,'_operation'));
  assert.ok(!JSON.stringify(publicState).includes('"templates"'));
  const original=await desktop.evaluate(()=>({code:session.code,token:session.token}));
  await tap(desktop,desktop.locator('#saveButton'));await desktop.locator('#accessDialog').waitFor({state:'visible'});
  const save=await desktop.locator('#accessCode').inputValue();assert.match(save,/^SAVE-/);await desktop.locator('#closeAccess').click();
  // Restoring on a phone carries the campaign but forks its future.
  const phone=await page(390);await restore(phone,save);
  assert.equal(await phone.evaluate(()=>state.operation.stage),2);
  assert.equal(await phone.evaluate(()=>state.greybridge.reserve_round),6);
  assert.equal(await phone.evaluate(()=>state.operation.history.length),1);
  await closeBrief(phone);await shot(phone,'05-crossing-phone');
  await position(phone,'hold');await order(phone,phone.locator('#end'));
  await phone.locator('#greybridgeDialog').waitFor({state:'visible'});await continueOperation(phone,3);
  assert.equal(await phone.evaluate(()=>state.greybridge.stage),'hold');
  assert.match(await phone.locator('#greybridgeGoal').textContent(),/four|4/);
  await shot(phone,'06-bridgehead-briefing-phone');await closeBrief(phone);
  await position(phone,'hold');await order(phone,phone.locator('#end'));
  await phone.locator('#greybridgeDialog').waitFor({state:'visible'});
  assert.equal(await phone.evaluate(()=>state.operation.outcome),'operation_success');
  assert.equal(await phone.locator('#greybridgeContinue').isVisible(),false);await shot(phone,'07-operation-success-phone');
  const untouched=await fetch(`${base}/api/match/${original.code}`,{headers:{Authorization:`Bearer ${original.token}`}}).then(r=>r.json());
  assert.equal(untouched.operation.stage,2);assert.equal(untouched.winner,null);
  // The alternate path and honest strategic result at the smallest supported phone width.
  const small=await page(320);await start(small);await resign(small);await continueOperation(small,2);
  assert.equal(await small.evaluate(()=>state.greybridge.reserve_round),4);
  await resign(small);await continueOperation(small,3);
  assert.equal(await small.evaluate(()=>state.greybridge.stage),'withdrawal');await closeBrief(small);
  for(let i=0;i<4;i++){
    const id=await position(small,'exit');await select(small,id);await order(small,small.locator('#greybridgeExtract'));
  }
  await small.locator('#greybridgeDialog').waitFor({state:'visible'});
  assert.equal(await small.evaluate(()=>state.winner),'us');
  assert.equal(await small.evaluate(()=>state.operation.outcome),'objective_failed');
  assert.match(await small.locator('#greybridgeOutcomeDetails').textContent(),/Teams lost: 0.*Still on battlefield: 4.*Extracted: 4/);
  assert.match(await small.locator('#greybridgeOutcomeTitle').textContent(),/withdrawal/i);await shot(small,'08-orderly-withdrawal-phone320');
  const old=await small.evaluate(()=>session.code);await small.locator('#greybridgeRetry').click();
  await small.waitForFunction(old=>session.code!==old&&state&&!busy,old);await settle(small);
  assert.equal(await small.evaluate(()=>state.greybridge.stage),'withdrawal');assert.equal(await small.evaluate(()=>state.greybridge.extracted),0);
  assert.equal(await small.evaluate(()=>state.operation.history.length),2);await closeBrief(small);
  await tap(small,small.locator('#leave'));await small.locator('#greybridgeSavedRuns button').first().click();await settle(small);
  assert.equal(await small.evaluate(()=>state.greybridge.stage),'withdrawal');
  // Exercise actual sign-in and SAVE form handlers, then recover without a
  // browser shortcut. This catches a missing commander header on restore.
  const owner=await page(1440),name='GreybridgeBrowserOwner';
  await signIn(owner,name,true);await restore(owner,save);
  assert.equal(await owner.evaluate(()=>session.commander),name);
  const linkedFork=await owner.evaluate(()=>session.code);
  const fresh=await page(390);await signIn(fresh,name);
  const resume=fresh.locator(`#greybridgeSavedRuns button[data-operation-code="${linkedFork}"]`);
  await resume.waitFor({state:'visible'});await resume.click();await settle(fresh);
  assert.equal(await fresh.evaluate(()=>session.code),linkedFork);
  assert.equal(await fresh.evaluate(()=>state.operation.stage),2);
  assert.equal(await fresh.evaluate(()=>state.greybridge.reserve_round),6);
  // A signed-in commander remains authoritative when local storage is blocked.
  const privatePage=await page(390,true);await signIn(privatePage,name);await start(privatePage);
  const privateRun=await privatePage.evaluate(()=>session.code);
  const listed=await fresh.evaluate(()=>ww2Commander.request('/api/operations/greybridge'));
  assert.ok(listed.operations.some(op=>op.code===privateRun));
  assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
  console.log('PASS: real move, sabotage, extraction; defeated raid retains relay consequence; both finale branches; immutable history; guest and signed-in SAVE restore; fresh-device commander resume; blocked-storage identity; retry and resume; desktop/390/320 layouts.',JSON.stringify({screenshots:tmp}));
})().catch(async error=>{
  console.error(error,errors);
  for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,`failure-${i}.png`)});console.error(i,await pages[i].evaluate(()=>({message:$('message')?.textContent,selected,busy,polling,dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.id)})));}catch{}}
  console.error('Screenshots:',tmp,'Server tail:',serverLog.slice(-3500));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.kill();});
