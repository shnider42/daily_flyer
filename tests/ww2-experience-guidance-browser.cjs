/* Real UI checks for presentation depth, coaching consent and safe inspection.
   All game data lives in a disposable local database. */
'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),{tap}=require('./ww2-ui-helpers.cjs');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dsl-experience-guidance-')),python=process.env.DSL_TEST_PYTHON||'python',base='http://127.0.0.1:18761';
const server=cp.spawn(python,['-c','import sys; from ww2_web import create_app; create_app(sys.argv[1], background_ai=False).run(host="127.0.0.1", port=18761, threaded=True)',path.join(tmp,'games.sqlite3')],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverLog='',browser;server.stderr.on('data',b=>serverLog+=b);server.stdout.on('data',b=>serverLog+=b);
const pages=[],errors=[];
async function fresh(width=390,blocked=false){
 const p=await browser.newPage({viewport:{width,height:844},isMobile:width<1100,hasTouch:width<1100});pages.push(p);p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 if(blocked)await p.addInitScript(()=>{for(const name of ['getItem','setItem','removeItem'])Storage.prototype[name]=()=>{throw Error('Storage disabled');};});
 await p.goto(base);await p.waitForFunction(()=>window.ww2Experience&&window.ww2LinkedOperations&&currentScenarios.length>0);
 await p.locator('#homeExperience').selectOption('simple');await p.locator('#greybridgeStart').click();await p.waitForFunction(()=>state?.operation?.id==='greybridge'&&!busy&&!polling);
 await p.locator('#greybridgeDialog').waitFor({state:'visible'});await p.locator('#greybridgeClose').click();await p.locator('#fieldCoachPrompt').waitFor({state:'visible'});return p;
}
async function quiet(p){await p.waitForFunction(()=>!busy&&!polling);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function visibleMove(p){return p.evaluate(()=>{const box=$('mapWrap').getBoundingClientRect();return state.legal[selected].moves.map(m=>({pos:m.pos,box:$('map').querySelector('.hex[data-x="'+m.pos[0]+'"][data-y="'+m.pos[1]+'"]').getBoundingClientRect()})).find(m=>m.box.left>box.left+2&&m.box.right<box.right-2&&m.box.top>box.top+2&&m.box.bottom<box.bottom-55)?.pos;});}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(server.exitCode!==null)throw Error(serverLog);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await fresh(),posts=[];p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 assert.match(await p.locator('#fieldCoachPrompt').textContent(),/Choose a unit/);
 assert.equal(await p.locator('#mobileGuide').evaluate(n=>n.open),false,'Default guidance does not interrupt with a modal');
 await p.locator('#fieldCoachPrompt').click();assert.match(await p.locator('#lessonDecisionText').textContent(),/two|2/);
 await p.locator('#lessonExit').click();assert.ok(await p.locator('#fieldCoachPrompt').isVisible(),'Back to map preserves guidance');
 const id=await p.evaluate(()=>state.units.find(u=>u.side===state.side&&state.legal[u.id]?.moves.length).id);
 await tap(p,p.locator('#roster button[data-unit-id="'+id+'"]'));await quiet(p);
 await tap(p,p.locator('#orderGuideOpen'));
 assert.match(await p.locator('#orderGuideDepth').textContent(),/^Simple/);
 assert.ok(await p.locator('.guide-order[data-order="greybridgeSabotage"]').isVisible());
 assert.match(await p.locator('.guide-order[data-order="greybridgeSabotage"]>p').first().textContent(),/Optional/);
 for(const action of ['greybridgeSabotage','greybridgeExtract']){
  const reason=await p.locator('#'+action).getAttribute('data-unavailable-reason');assert.ok(reason);
  assert.equal(await p.locator('.guide-order[data-order="'+action+'"] .guide-unavailable').textContent(),'Unavailable: '+reason);
 }
 assert.ok(await p.locator('.guide-order-rules').count()>0);
 await p.locator('#orderGuideClose').click();
 // A role lesson's Show me must not route its suggested unit through the
 // gameplay selector while an order is choosing a target. Use a legal smoke
 // target so the old chooseUnit behavior would really have submitted an order.
 const smokeLesson=await p.evaluate(()=>{
  for(const unit of state.units.filter(u=>u.side===state.side&&controlsUnit(u)))for(const lesson of ww2Learning.lessons().filter(l=>l.roles?.length)){
   const suggested=state.units.find(u=>u.side===state.side&&controlsUnit(u)&&u.hp>0&&!u.reserve&&!u.carrier_id&&lesson.roles.includes(u.kind));
   if(suggested&&state.legal[unit.id]?.smoke?.some(pos=>pos[0]===suggested.pos[0]&&pos[1]===suggested.pos[1]))return {unit:unit.id,lesson:lesson.id};
  }
 });assert.ok(smokeLesson,'A role lesson has a real legal smoke target');
 await tap(p,p.locator('#roster button[data-unit-id="'+smokeLesson.unit+'"]'));await tap(p,p.locator('#smoke'));
 assert.equal(await p.evaluate(()=>smokeMode),true);
 await p.locator('#fieldCoachPrompt').click();await p.locator('#lessonContents>summary').click();await p.locator('#lessonTopics button[data-topic="'+smokeLesson.lesson+'"]').click();
 for(const mode of ['smoke','barrage','combat']){
  // The first case uses the actual Smoke UI. Also preserve the other core
  // pending flags, including a stale target choice, without normalizing them.
  if(mode!=='smoke')await p.evaluate(mode=>{smokeMode=false;barrageMode=mode==='barrage';combatMode=mode==='combat'?{kind:'artillery',unit:selected,revision:state.revision}:null;},mode);
  const snapshot=()=>p.evaluate(()=>({state:JSON.stringify(state),selected,target,smokeMode,barrageMode,combatMode,platoonFilter,left:$('mapWrap').scrollLeft,top:$('mapWrap').scrollTop}));
  const before=await snapshot();await p.locator('#lessonShow').click();
  assert.match(await p.locator('#lessonResult').textContent(),/Finish or cancel your current target choice/);
  assert.equal(await p.locator('#mobileGuide').evaluate(n=>n.open),true,'Pending targeting keeps the coach open');
  assert.deepEqual(await snapshot(),before,mode+' Show me preserves state, AP, selection, target and camera');assert.deepEqual(posts,[]);
 }
 await p.locator('#lessonExit').click();await p.evaluate(()=>{smokeMode=false;barrageMode=false;combatMode=null;render();});
 // Keep a pending aim mode and selected unit while inspecting a legal move.
 await p.evaluate(()=>{smokeMode=true;render();});await quiet(p);
 const original=await p.evaluate(()=>({revision:state.revision,selected,target,smokeMode,units:JSON.stringify(state.units),legal:JSON.stringify(state.legal)}));
 await tap(p,p.locator('#hexInspectOpen'));await p.locator('#hexInspectStatus').waitFor({state:'visible'});
 assert.equal(await p.locator('#fieldCoachPrompt').isVisible(),false);
 let pos=await visibleMove(p);assert.ok(pos,'A legal neighboring hex is visible for safe inspection');
 const hex=p.locator('#map .hex[data-x="'+pos[0]+'"][data-y="'+pos[1]+'"]');
 // A real touch drag must pan, without opening a terrain sheet or issuing an order.
 const rect=await hex.boundingBox(),cdp=await p.context().newCDPSession(p),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+35,y:y-35}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await hex.dispatchEvent('click');
 assert.equal(await p.locator('#hexInspectDialog').evaluate(n=>n.open),false,'Drag guard suppresses inspection click');
 assert.deepEqual(posts,[]);
 await p.waitForTimeout(750);pos=await visibleMove(p);assert.ok(pos);
 await p.locator('#map .hex[data-x="'+pos[0]+'"][data-y="'+pos[1]+'"]',).tap();
 await p.locator('#hexInspectDialog').waitFor({state:'visible'});assert.match(await p.locator('#hexInspectMove').textContent(),/legal move costing/);
 const camera=await p.evaluate(()=>({left:$('mapWrap').scrollLeft,top:$('mapWrap').scrollTop}));
 for(const level of ['moderate','expert','simple']){
  await p.evaluate(level=>ww2Experience.set(level),level);await quiet(p);
  assert.equal(await p.locator('#hexInspectDialog').evaluate(n=>n.open),true);
  assert.equal(await p.locator('#hexInspectDialog').getAttribute('data-experience'),level);
  assert.deepEqual(await p.evaluate(()=>({revision:state.revision,selected,target,smokeMode,units:JSON.stringify(state.units),legal:JSON.stringify(state.legal)})),original);
  assert.deepEqual(await p.evaluate(()=>({left:$('mapWrap').scrollLeft,top:$('mapWrap').scrollTop})),camera);
 }
 await p.screenshot({path:path.join(tmp,'inspect-simple-phone.png')});await p.locator('#hexInspectDone').click();
 assert.equal(await p.evaluate(()=>ww2BattleHelp.inspecting),false);assert.deepEqual(posts,[]);
 await p.evaluate(()=>{smokeMode=false;render();});
 // Ignore is explicit, remembered, and independent of Experience.
 await p.locator('#fieldCoachPrompt').click();await p.locator('#lessonIgnore').click();assert.equal(await p.locator('#fieldCoachPrompt').isVisible(),false);
 for(const level of ['expert','moderate','simple'])await p.evaluate(level=>ww2Experience.set(level),level);
 assert.equal(await p.locator('#fieldCoachPrompt').isVisible(),false);
 const code=await p.evaluate(()=>session.code);await p.reload();await p.waitForFunction(()=>window.ww2LinkedOperations&&currentScenarios.length>0);
 if(await p.locator('#game').evaluate(n=>n.hidden))await p.locator('#greybridgeSavedRuns button[data-operation-code="'+code+'"]').click();
 await p.waitForFunction(()=>state&&!busy&&!polling);if(await p.locator('#greybridgeDialog').evaluate(n=>n.open))await p.locator('#greybridgeClose').click();
 assert.equal(await p.locator('#fieldCoachPrompt').isVisible(),false);assert.match(await p.locator('#guideToggle').textContent(),/Resume tutorial/);
 await tap(p,p.locator('#guideToggle'));assert.equal(await p.evaluate(()=>ww2Learning.ignored),false);
 await p.locator('#lessonContents>summary').click();await p.locator('#lessonTopics button').last().click();await p.locator('#lessonNext').click();
 assert.ok(await p.locator('#fieldCoachPrompt').isVisible(),'Finishing lessons keeps contextual help');
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('ww2-learning-v2'))[session.code+':'+(state.battle_number||1)]);
 assert.equal(saved.completed,true);assert.ok(saved.read.length>0);assert.ok(saved.enabled);
 // The visible launcher stays inside the map, with no horizontal overflow.
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:900});await quiet(p);const box=await p.locator('#mapWrap').boundingBox(),button=await p.locator('#fieldCoachPrompt').boundingBox();
  assert.ok(button.x>=box.x&&button.y>=box.y&&button.x+button.width<=box.x+box.width+1&&button.y+button.height<=box.y+box.height+1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(tmp,'coach-'+width+'.png')});
 }
 const privatePage=await fresh(390,true);await privatePage.locator('#fieldCoachPrompt').click();await privatePage.locator('#lessonIgnore').click();
 await privatePage.evaluate(()=>{ww2Experience.set('expert');ww2Experience.set('simple');});assert.equal(await privatePage.locator('#fieldCoachPrompt').isVisible(),false);
 await tap(privatePage,privatePage.locator('#guideToggle'));assert.equal(await privatePage.evaluate(()=>ww2Learning.ignored),false);
 // The coach follows the same public turn phase as the mission briefing,
 // even when the selected unit still has AP after this player has finished.
 const waits=await p.evaluate(()=>{
  const original=state,coop={phase:'battle',done:false,controlled:[selected],me:'reviewer',waiting_for:['teammate'],players:[{id:'teammate',name:'Teammate'}]};
  try{return [{coop:{...coop,done:true}},{coop:{...coop,controlled:[]}},{coop:{...coop,needs_advance:true}},{computer_work:{pending:true,status:'running'}},{computer_work:{pending:true,status:'paused'}}].map(patch=>{state={...original,ready:true,turn:original.side,...patch};return ww2Learning.decision();});}
  finally{state=original;}
 });
 assert.deepEqual(waits.map(d=>d.title),['Wait for your teammates','Watch your army','Wait for computer orders','Wait for computer orders','Review the paused computer turn']);
 assert.deepEqual(waits.slice(0,3).map(d=>d.selector),['#coopQuick','#coopQuick','#coopQuick']);assert.equal(waits[4].selector,'#battleOptions');
 // Use real public scenario projections to check specialist lessons without
 // creating battles, changing their rules or exposing any private enemy state.
 const cases=[['current:nightfall_veil','night-drop'],['current:britain_2','britain-fuel'],['current:crosswind_strait','ap'],['current:stonebridge_2','command'],['current:the_war_1','war-fronts']];
 const projections=JSON.parse(cp.execFileSync(python,['-c',
  'import json,sys; from ww2_tactics.engine import initial; from ww2_tactics.scenarios import battlefield; from ww2_tactics.visibility import public_state; result=[]\nfor name in sys.argv[1:]:\n s=initial(name,"dsl"); board=battlefield(s); s.update(ready=True,side="us",map=board["map"],scenario={k:v for k,v in board.items() if k!="map"}); result.append(public_state(s,"us"))\nprint(json.dumps(result))',...cases.map(c=>c[0])],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
 for(let i=0;i<cases.length;i++){
  const variants=await p.evaluate(({s,id})=>['simple','moderate','expert'].map(level=>{ww2Experience.set(level);const lesson=ww2Learning.lessons(s).find(l=>l.id===id);if(!lesson)throw Error('Missing lesson '+id);return lesson.text;}),{s:projections[i],id:cases[i][1]});
  assert.notEqual(variants[0],variants[1],cases[i][0]+' has distinct Simple and Moderate lessons');
  assert.notEqual(variants[1],variants[2],cases[i][0]+' retains separate Expert detail');
  assert.ok(variants[0].length<variants[2].length,cases[i][0]+' leads with less detail in Simple');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: default Simple guidance, tiered order and specialist lessons, Greybridge unavailable reasons, co-op/computer waiting guidance, explicit opt-out/reload/resume, completed-guide handoff, blocked-storage consent, Show me preserves pending targeting without orders, legal-hex inspection and touch drag without orders, camera/state preserved.',JSON.stringify({screenshots:tmp}));
})().catch(async error=>{console.error(error);for(let i=0;i<pages.length;i++)try{await pages[i].screenshot({path:path.join(tmp,'failure-'+i+'.png')});console.error('Page',i,await pages[i].evaluate(()=>({message:$('message')?.textContent,level:ww2Experience.level,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})));}catch{}console.error('Screenshots:',tmp,'Server:',serverLog.slice(-1000));process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
