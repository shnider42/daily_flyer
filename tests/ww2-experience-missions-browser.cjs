/* Presentation-only mission depth: real UI selectors, unchanged battle state. */
'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-mission-depth-'));
const port=18758,base='http://127.0.0.1:'+port,python=process.env.DSL_TEST_PYTHON||'python';
const server=cp.spawn(python,['-c','import sys; from ww2_web import create_app; create_app(sys.argv[1], background_ai=False).run(host="127.0.0.1", port=int(sys.argv[2]), threaded=True)',path.join(tmp,'game.sqlite3'),String(port)],{cwd:root,stdio:'ignore'});
let browser;const errors=[],posts=[];
const settle=p=>p.waitForFunction(()=>state&&!busy&&!polling);
const snapshot=p=>p.evaluate(()=>({state:JSON.stringify(state),selected,target,smokeMode,barrageMode,combatMode,code:session.code}));
async function level(p,id,value){await p.locator('#'+id).selectOption(value);await p.waitForFunction(value=>ww2Experience.level===value,value);await settle(p);}
async function shot(p,name){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(tmp,name+'.png')});}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(20000);
 p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('dialog',d=>d.accept());
 p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>ww2Experience&&ww2LinkedOperations&&currentScenarios.length>0);
 await p.locator('#greybridgeStart').click();await settle(p);await p.locator('#greybridgeDialog').waitFor({state:'visible'});
 assert.equal(await p.locator('#greybridgeExperience').inputValue(),'simple');
 assert.match(await p.locator('#greybridgeGoal').textContent(),/2 infantry teams.*round 10/);
 assert.match(await p.locator('#greybridgeNextText').textContent(),/Extract unit.*1 action point/);
 assert.equal(await p.locator('#greybridgeFullDetails').evaluate(n=>n.open),false);
 assert.equal(await p.locator('#greybridgeRecordDetails').evaluate(n=>n.open),false);
 await shot(p,'greybridge-simple-phone');
 const start=await snapshot(p),postCount=posts.length;
 for(const value of ['moderate','expert','simple']){
  await level(p,'greybridgeExperience',value);
  assert.equal(await p.locator('#greybridgeDialog').evaluate(n=>n.open),true);
  assert.equal(await p.locator('#greybridgeFullDetails').evaluate(n=>n.open),value==='expert');
  assert.equal(await p.locator('#greybridgeDecisions').isVisible(),value!=='simple');
  assert.deepEqual(await snapshot(p),start);
  await shot(p,'greybridge-'+value+'-phone');
 }
 assert.equal(posts.length,postCount,'Changing explanation depth submits no gameplay requests');
 await p.locator('#greybridgeFullDetails > summary').click();
 assert.match(await p.locator('#greybridgeRules').textContent(),/2 AP.*adjacent/);
 await p.evaluate(()=>render());assert.equal(await p.locator('#greybridgeFullDetails').evaluate(n=>n.open),true,'A manual disclosure stays open during a regular repaint');
 await p.locator('#greybridgeFind').click();
 assert.equal(await p.locator('#greybridgeDialog').evaluate(n=>n.open),false);
 assert.deepEqual(await snapshot(p),start,'Find exit changes only the camera');assert.equal(posts.length,postCount);
 // Ordinary mission briefings use the same hierarchy without changing goals.
 await p.evaluate(()=>run(async()=>remember(await api('/api/match',{scenario:'current:village',ruleset:'dsl',opponent:'computer',side:'us'}))));
 await settle(p);await p.evaluate(()=>ww2Briefing.open());await p.locator('#missionDialog').waitFor({state:'visible'});
 const ordinary=await snapshot(p),ordinaryPosts=posts.length;
 for(const value of ['simple','moderate','expert']){
  await level(p,'missionExperience',value);
  assert.equal(await p.locator('#missionDialog').evaluate(n=>n.open),true);
  assert.equal(await p.locator('#missionFullDetails').evaluate(n=>n.open),value==='expert');
  assert.equal(await p.locator('#missionEssentials').isVisible(),value==='moderate');
  assert.match(await p.locator('#missionGoal').textContent(),/two.*turns.*row/);
  assert.deepEqual(await snapshot(p),ordinary);
  await shot(p,'mission-'+value+'-phone');
 }
 assert.equal(posts.length,ordinaryPosts);
 const phaseGuidance=await p.evaluate(()=>{
  const shared={...state,ready:true,turn:state.side,deployment:null,computer_work:null,order_history:{},coop:{done:false,controlled:state.units.filter(u=>u.side===state.side).map(u=>u.id),waiting_for:['teammate'],players:[{id:'teammate',name:'Teammate'}]}};
  const next=s=>ww2Briefing.guidance(s,ww2Briefing.mission(s)).next;
  return {
   preparation:next({...shared,side:'de',turn:'us',deployment:{phase:'planning',locked:{us:false,de:false}}}),
   finishedOrders:next({...shared,coop:{...shared.coop,done:true}}),
   watching:next({...shared,coop:{...shared.coop,controlled:[]}}),
   computer:next({...shared,computer_work:{pending:true,status:'running'}}),
   redo:next({...shared,coop:null,order_history:{redo_required:true}})
  };
 });
 assert.match(phaseGuidance.preparation,/Finish my preparation.*captain/,'Preparation guidance respects shared authority before ordinary turn state');
 assert.match(phaseGuidance.finishedOrders,/orders are finished.*Teammate/);
 assert.match(phaseGuidance.watching,/computer controlled/);
 assert.match(phaseGuidance.computer,/Orders continue on the server/);
 assert.match(phaseGuidance.redo,/Redo before giving a new order/);
 await p.locator('#missionClose').click();await p.evaluate(()=>act({kind:'resign'}));
 await p.waitForFunction(()=>!!state.winner&&!busy&&!polling);
 await p.locator('#battleResultDialog').waitFor({state:'visible'});
 const final=await snapshot(p),finalPosts=posts.length;
 await level(p,'battleResultExperience','simple');assert.match(await p.locator('#battleResultNext').textContent(),/without giving orders/);
 await p.locator('#resultDebrief').click();await p.locator('#debriefDialog').waitFor({state:'visible'});
 assert.match(await p.locator('#debriefContent').textContent(),/You resigned this battle/);
 for(const value of ['simple','moderate','expert']){
  await level(p,'debriefExperience',value);
  assert.equal(await p.locator('#debriefDialog').evaluate(n=>n.open),true);
  assert.equal(await p.locator('#debriefFullRecord').evaluate(n=>n.open),value==='expert');
  assert.equal(await p.locator('#debriefActivity').count(),value==='moderate'?1:0);
  assert.match(await p.locator('#debriefContent').textContent(),/Fuel exhaustion losses/,'Exact record remains available at every level');
  assert.deepEqual(await snapshot(p),final);
  await shot(p,'debrief-'+value+'-phone');
 }
 assert.equal(posts.length,finalPosts);
 await p.setViewportSize({width:1440,height:900});await shot(p,'debrief-expert-desktop');
 assert.deepEqual(errors,[]);
 console.log('PASS: Greybridge, ordinary mission, result and debrief tiers; native selectors; complete rules accessible; no state/order changes; safe objective finding; disclosures; phone/desktop.',JSON.stringify({screenshots:tmp}));
})().catch(e=>{console.error(e);console.error('Screenshots:',tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
