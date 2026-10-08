/* DOM/API integration, deliberately not a substitute for visual browser QA.
   Uses jsdom and Flask's test client, without opening browser/network sockets. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync('/tmp/ww2-journey-dom-'),db=path.join(tmp,'game.sqlite');
const root=path.resolve(__dirname,'..'),errors=[];
function request(route,options={}){
 const result=JSON.parse(cp.execFileSync('python',['tests/ww2-api-bridge.py',db],{cwd:root,env:{...process.env,PYTHONPATH:root},input:JSON.stringify({path:route,method:options.method||'GET',headers:options.headers||{},body:options.body}),encoding:'utf8'}));
 return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.data};
}
const html=fs.readFileSync(path.join(root,'ww2_tactics/static/index.html'),'utf8');
const delay=()=>new Promise(r=>setTimeout(r,30));
let dom,w,ctx;
async function setup(){
 dom=new JSDOM(html,{url:'http://dsl.test/',runScripts:'outside-only',pretendToBeVisual:true});w=dom.window;ctx=dom.getInternalVMContext();
 w.innerWidth=1280;w.innerHeight=900;w.scrollTo=()=>{};
 w.matchMedia=query=>({matches:query.includes('min-width:1100')||query.includes('min-width: 1100'),media:query,addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.CSS={supports:()=>true,escape:s=>s};w.confirm=()=>true;
 w.fetch=async(url,opts)=>request(new URL(url,w.location.href).pathname+new URL(url,w.location.href).search,opts);
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};
 w.SVGElement.prototype.getBBox=function(){return {x:0,y:0,width:600,height:800};};
 w.SVGElement.prototype.getScreenCTM=function(){return {inverse(){return this;},a:1,b:0,c:0,d:1,e:0,f:0};};
 w.SVGSVGElement.prototype.createSVGPoint=function(){return {x:0,y:0,matrixTransform(){return this;}};};
 Object.defineProperty(w.SVGSVGElement.prototype,'viewBox',{get(){const n=(this.getAttribute('viewBox')||'0 0 600 800').split(/[ ,]+/).map(Number);return {baseVal:{x:n[0],y:n[1],width:n[2],height:n[3]}};}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new w.Event('close'));}};
 w.addEventListener('error',e=>{errors.push(e.error?.stack||e.message);e.preventDefault();});
 for(const script of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(path.join(root,'ww2_tactics/static',script.getAttribute('src').replace('/assets/','')),'utf8'),ctx,{filename:script.getAttribute('src')});
 await delay();assert.deepEqual(errors,[]);
}
const e=code=>vm.runInContext(code,ctx),$=id=>w.document.getElementById(id);
async function click(id){$(id).click();await delay();await delay();assert.deepEqual(errors,[]);}
async function select(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('change'));await delay();assert.deepEqual(errors,[]);}
async function coachTopic(id){w.ww2Learning.open();const b=w.document.querySelector(`[data-topic="${id}"]`);assert.ok(b,id);b.click();await delay();}
async function main(){
 await setup();
 assert.equal(e('scenarios.length'),24);
 await click('createSolo');await select('soloScenario','britain');assert.deepEqual([...$('soloSide').options].map(o=>o.text),['RAF','Luftwaffe']);
 await select('soloScenario','village');await select('soloSide','de');await click('startSolo');
 assert.equal(e('state.side'),'de');assert.equal(e('state.turn'),'de');assert.ok(e('state.computer_playback.frames.length')>0);e('window.firstSeat={...session}');
 await click('resignButton');assert.equal($('battleResultDialog').open,true);assert.equal($('battleResultTitle').textContent,'Defeat');await click('resultReview');e('render()');await delay();assert.equal($('battleResultDialog').open,false);
 await click('showBattleResult');assert.equal($('battleResultDialog').open,true);await click('resultHome');
 await select('homeExperience','moderate');await click('learnStart');assert.equal($('journeyDialog').open,true);assert.equal($('journeyExperience').value,'moderate');assert.equal(w.document.querySelectorAll('.journey-chapter').length,14);
 w.document.querySelector('[data-chapter="village"] button').click();await delay();assert.deepEqual(errors,[]);assert.equal(e('state.side'),'us');assert.equal(w.ww2Learning.enabled,true);
 const chapter=e('session.code'),revision=e('state.revision'),copy=[];
 await coachTopic('dice');
 for(const level of ['simple','moderate','expert']){w.ww2Experience.set(level);await delay();copy.push($('lessonText').textContent);assert.ok($('lessonCount').textContent.includes(level.toUpperCase()));assert.equal(e('state.revision'),revision);}
 assert.equal(new Set(copy).size,3);assert.match(copy[0],/six-sided/);assert.doesNotMatch(copy[1],/six-sided/);assert.match(copy[2],/modifier/);
 await coachTopic('move');$('lessonShow').click();e("chooseUnit(state.units.find(u=>u.side===state.side&&state.legal[u.id].moves.length))");await e("act({kind:'move',unit:selected,pos:state.legal[selected].moves[0].pos})");await coachTopic('move');assert.match($('lessonResult').textContent,/You tried/);
 e("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");await click('homeBattles');await click('learnStart');assert.equal(w.document.querySelector('[data-chapter="village"] button').textContent,'Resume chapter');w.document.querySelector('[data-chapter="village"] button').click();await delay();assert.equal(e('session.code'),chapter);
 e("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");await click('resignButton');assert.equal($('resultJourney').hidden,false);await click('resultJourney');assert.match(w.document.querySelector('[data-chapter="village"]').textContent,/Defeat reviewed/);
 await select('journeySide','de');w.document.querySelector('[data-chapter="shingle_cove"] button').click();await delay();assert.deepEqual(errors,[]);assert.equal(e('state.side'),'de');assert.equal(e('state.deployment.phase'),'planning');assert.match($('lessonTitle').textContent,/Before round 1/);
 await coachTopic('preparation-support');$('lessonShow').click();await e("act({kind:'deploy_bunker',pos:state.deployment.bunker_zone[0]})");await coachTopic('preparation-support');assert.match($('lessonResult').textContent,/You tried/);
 // Build lessons from actual fog-filtered API responses for every map and army.
 const scenarios=e('operationCatalog().map(s=>s.id)'),expected={relay_crossing:['radio','observe','mortar','supply'],kharkov:['armor-control','supply','armor'],dunkirk:['evacuation','transport'],iron_lantern:['airlift','flak','arrival'],tidal_gate:['engineering','linked'],midway:['fleet'],britain:['service'],fubar:['layers','joint-air','joint-sea'],shingle_cove:['preparation','preparation-support','preparation-lock'],breakwater:['preparation','preparation-support','preparation-lock']};
 for(const scenario of scenarios){
  const seat=await request('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario,ruleset:'dsl'})}).json();
  const guest=await request(`/api/match/${seat.code}/join`,{method:'POST'}).json();
  for(const user of [seat,guest]){
   const state=await request(`/api/match/${user.code}`,{headers:{Authorization:`Bearer ${user.token}`}}).json();
   for(const level of ['simple','moderate','expert']){
    w.ww2Experience.set(level);const book=w.ww2Learning.lessons(state);
    assert.equal(new Set(book.map(l=>l.id)).size,book.length,scenario);
    for(const l of book){assert.ok(l.text.length>50,`${scenario} ${level} ${l.id}`);if(l.selector!=='@mission')assert.ok(w.document.querySelector(l.selector),`Missing selector ${l.selector}`);}
    if(state.side==='us')for(const id of expected[state.scenario.source_id||scenario]||[])assert.ok(book.some(l=>l.id===id),`${scenario} ${id}`);
    if(state.edition==='current')for(const id of ['current-edition','shared-hexes'])assert.ok(book.some(l=>l.id===id),`${scenario} ${id}`);
    if(scenario==='village')assert.ok(!book.some(l=>['mortar','supply','airlift','fleet','service','preparation'].includes(l.id)));
   }
  }
 }
 // Actual recorded frames exercise result gating while replay is active.
 e("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
 await e("(async()=>{const s=await apiWithSession(firstSeat);remember(firstSeat);state=s;state.battle_number=90;render();startPlayback();playbackSession.paused=true;clearTimeout(playbackTimer);})()");
 await delay();assert.equal($('battleResultDialog').open,false);
 e("stopPlayback()");await delay();await delay();assert.equal($('battleResultDialog').open,true);await click('resultReview');e("render()");await delay();assert.equal($('battleResultDialog').open,false);
 // Visible signed-in multiplayer form, both assignment methods and the open Allied seat.
 await click('homeBattles');await click('commanderSignIn');await click('commanderRegisterMode');$('commanderName').value='DOMCommander';$('commanderPassword').value='Test-password-for-local-DOM';
 $('commanderForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();await delay();assert.equal(w.ww2Commander.name,'DOMCommander');
 assert.equal(w.document.querySelector('.home-learn').hidden,false);
 for(const method of ['selected','coin_flip','random']){
  await click('create');await select('teamAssignment',method);await select('multiplayerSide','de');assert.equal($('multiplayerArmyChoice').hidden,method!=='selected');
  $('namedGameForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();await delay();
  assert.equal(e('state.team_assignment.method'),method);
  const code=e('session.code'),side=e('state.side');if(method==='selected')assert.equal(side,'de');
  const games=await request('/api/lobby').json(),game=games.games.find(g=>g.code===code);assert.equal(game.open_side,side==='us'?'de':'us');assert.equal(game.full,0);
  const joined=await request(`/api/match/${code}/join`,{method:'POST'}).json();
  const opponent=await request(`/api/match/${code}`,{headers:{Authorization:`Bearer ${joined.token}`}}).json();assert.notEqual(opponent.side,side);
  await request(`/api/match/${code}`,{method:'POST',headers:{Authorization:`Bearer ${joined.token}`,'Content-Type':'application/json'},body:JSON.stringify({kind:'resign',revision:opponent.revision})}).json();
  await e('refresh()');await delay();await delay();assert.equal($('battleResultTitle').textContent,'Victory');assert.equal($('battleResultDialog').open,true);await click('resultHome');
 }
 assert.deepEqual(errors,[]);console.log(`DOM/API checks passed: complete script boot, actual creation/results/Journey/resume/placement, all Experiences, ${scenarios.length} edition/maps × 2 armies × 3 levels, selector targets and replay result gating. No visual-layout claims.`,tmp);
}
main().catch(err=>{console.error(err);console.error(errors);console.error(e("({winner:state?.winner,busy,polling,lobbyMode,hidden:$('game').hidden,playing:!!playbackSession,seen:[...Object.keys(sessionStorage)],resultTitle:$('battleResultTitle').textContent,message:$('message').textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),resignDisabled:$('resignButton').disabled})"));process.exitCode=1;}).finally(()=>dom?.window.close());
