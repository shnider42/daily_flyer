/* Real placement controls, private two-browser plans, stable maps and illustrated assets. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const tmp=fs.mkdtempSync('/tmp/ww2-deployment-'),base='http://127.0.0.1:8156';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8156','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(tmp,'game.sqlite')},stdio:'ignore'});
let browser;const errors=[],badAssets=[];
async function settled(p){await p.waitForFunction(()=>!!state&&!busy&&!polling);}
async function fireAt(p,x,y){await p.locator('#deploymentPlan').click();await p.evaluate(pos=>focusMapUnit({pos}),[x,y]);await p.locator(`.deployment-choice[data-x="${x}"][data-y="${y}"]`).click();await settled(p);}
async function lock(p){await p.locator('#deploymentLock').click();await p.locator('#deploymentDialog').waitFor({state:'visible'});await p.locator('#deploymentConfirm').click();await settled(p);}
const dimensions=p=>p.locator('#mapWrap').evaluate(n=>({top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width}));
async function page(touch=true){const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:800},hasTouch:touch,isMobile:touch});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});return p;}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const touch of [true,false]){
  const p=await page(touch);
  for(const scenario of ['shingle_cove','breakwater']){
   await p.goto(base);await p.waitForFunction(()=>scenarios.length===22);
   await p.locator('#scenarioSelect').selectOption(scenario);await p.locator('#createSolo').click();await p.locator('#startSolo').click();
   await p.waitForFunction(id=>state?.scenario.id===id&&!busy,scenario);await p.locator('#deploymentPanel').waitFor({state:'visible'});
   assert.equal(await p.evaluate(()=>state.deployment.phase),'planning');
   assert.equal(await p.evaluate(()=>state.units.every(u=>u.side===state.side)),true);
   assert.match(await p.locator('#turnBanner').textContent(),/PRE-BATTLE/);
   const boat=await p.evaluate(()=>state.units.find(u=>u.kind==='landing_craft')),shore=await p.evaluate(()=>state.scenario.deployment_rules.shore);
   await p.locator('#deploymentUnit').selectOption(boat.id);await p.waitForTimeout(100);
   const camera=await dimensions(p),revision=await p.evaluate(()=>state.revision);
   await p.evaluate(pos=>focusMapUnit({pos}),[2,shore+1]);
   await p.locator(`.deployment-choice[data-x="2"][data-y="${shore+1}"]`).click();await settled(p);
   assert.equal(await p.evaluate(()=>state.revision),revision+1);
   assert.deepEqual(await dimensions(p),camera,'Placement does not resize the map');
   assert.deepEqual(await p.evaluate(id=>state.units.find(u=>u.id===id).pos,boat.id),[2,shore+1]);
   assert.deepEqual(await p.evaluate(id=>state.units.find(u=>u.carrier_id===id).pos,boat.id),[2,shore+1]);
   for(const experience of ['simple','moderate','expert']){
    const rev=await p.evaluate(()=>state.revision);await p.evaluate(level=>ww2Experience.set(level),experience);
    await p.locator('#deploymentHelp').click();assert.match(await p.locator('#deploymentExplanation').textContent(),/casualty confirmation/);await p.locator('#deploymentClose').click();
    assert.equal(await p.evaluate(()=>state.revision),rev);assert.deepEqual(await dimensions(p),camera,'Experiences preserve map space');
   }
   await fireAt(p,0,3);assert.equal(await p.evaluate(()=>state.deployment.fire.length),1);
   await p.locator('.deployment-choice[data-x="0"][data-y="3"]').click();await settled(p);assert.equal(await p.evaluate(()=>state.deployment.fire.length),0);
   await fireAt(p,0,3);
   await p.screenshot({path:path.join(tmp,`${touch?'phone':'desktop'}-${scenario}-plan.png`)});
   await p.reload();await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state?.deployment?.fire?.length===1&&!busy);await p.locator('#deploymentPanel').waitFor({state:'visible'});
   if(touch){
    for(const [width,height] of [[320,740],[844,390],[390,844]]){
     await p.setViewportSize({width,height});await p.waitForTimeout(150);
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
     assert.ok((await dimensions(p)).height>=160,'Map remains usable');
     await p.locator('#deploymentHelp').click();await p.locator('#deploymentClose').click();
    }
   }else{
    for(const layout of ['panels','map-first']){await p.evaluate(l=>ww2Experience.setLayout(l),layout);await p.locator('#deploymentPanel').waitFor({state:'visible'});await p.locator('#deploymentHelp').click();await p.locator('#deploymentClose').click();}
   }
   await lock(p);await p.waitForFunction(()=>state?.deployment?.phase==='battle'&&!busy);
   assert.equal(await p.locator('#deploymentPanel').isVisible(),false);assert.equal(await p.evaluate(()=>state.round),1);
   assert.equal(await p.evaluate(()=>state.order_history.can_undo),false);
   assert.equal(await p.locator('#end').isVisible(),true);
   // Real movement resumes, and boats can unload infantry on the beach.
   await p.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),boat.id);
   assert.ok(await p.evaluate(id=>state.legal[id].moves.length>0,boat.id));
   await p.evaluate(async id=>{const m=state.legal[id].moves.find(m=>m.pos[1]===state.scenario.deployment_rules.shore);await act({kind:'move',unit:id,pos:m.pos});},boat.id);await settled(p);
   assert.ok(await p.evaluate(id=>state.legal[id].unload.length>0,boat.id));
   await p.screenshot({path:path.join(tmp,`${touch?'phone':'desktop'}-${scenario}-battle.png`)});
   await p.locator('#homeBattles').click({force:true}).catch(()=>{});
   await p.evaluate(()=>{session=null;state=null;localStorage.removeItem('ww2-session');});
  }
  await p.close();
 }
 // Independent commanders both edit without taking the opponent's turn.
 const a=await page(),b=await page(false),created=await (await fetch(base+'/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:'shingle_cove',ruleset:'dsl'})})).json();
 const guest=await(await fetch(base+`/api/match/${created.code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
 for(const [p,seat] of [[a,created],[b,guest]]){await p.addInitScript(s=>localStorage.setItem('ww2-session',JSON.stringify(s)),seat);await p.goto(base);await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>state?.deployment?.phase==='planning');}
 await b.locator('#deploymentPlan').click();await b.evaluate(()=>focusMapUnit({pos:[0,3]}));await b.locator('.deployment-choice[data-x="0"][data-y="3"]').click();await settled(b);
 await a.evaluate(()=>refresh());await settled(a);assert.equal(await a.evaluate(()=>state.deployment.bunkers.length),0);
 await fireAt(a,0,3);await lock(a);assert.match(await a.locator('#deploymentTitle').textContent(),/locked/);
 await b.evaluate(()=>refresh());await settled(b);
 await b.locator('#deploymentUnits').click();const gun=await b.evaluate(()=>state.units.find(u=>u.kind==='at_gun'));
 await b.locator('#deploymentUnit').selectOption(gun.id);await b.evaluate(()=>focusMapUnit({pos:[0,1]}));await b.locator('.deployment-choice[data-x="0"][data-y="1"]').click();await settled(b);
 // The real radio portrait uses the generated atlas, including close-up UI.
 const radio=await b.evaluate(()=>state.units.find(u=>u.kind==='radioman'));
 await b.locator('#deploymentUnit').selectOption(radio.id);
 await b.waitForFunction(id=>document.querySelector(`[data-unit-id="${id}"] .specialist-atlas image`)?.href.baseVal.includes('specialists-atlas-v1'),radio.id);
 await b.waitForFunction(id=>document.querySelector(`[data-unit-id="${id}"] .portrait-radioman > .raster-fallback`)?.getAttribute('display')==='none',radio.id);
 await b.screenshot({path:path.join(tmp,'german-defense.png')});
 await lock(b);await a.evaluate(()=>refresh());await settled(a);assert.equal(await a.evaluate(()=>state.deployment.phase),'battle');
 // Artwork plate reuses the production portrait renderer for all nine roles.
 await b.evaluate(()=>{const plate=document.createElement('div');plate.id='artPlate';for(const kind of ['radioman','mortar','supply','commando','mountain','partisan','askari','pathfinder','flak']){const u={...state.units.find(u=>u.side===state.side),id:'art-'+kind,kind,pinned:false,entrenched:false,overwatch:false};const card=document.createElement('div');card.append(makeUnitPortrait(u),document.createTextNode(kind));plate.append(card);}document.body.append(plate);});
 const artPage=await browser.newPage({viewport:{width:1100,height:850}});const artMarkup=await b.locator('#artPlate').evaluate(n=>n.outerHTML);await artPage.setContent('<base href="'+base+'"><link rel="stylesheet" href="/assets/game.css"><link rel="stylesheet" href="/assets/unit-art.css"><link rel="stylesheet" href="/assets/expanded.css"><link rel="stylesheet" href="/assets/dad-mode.css"><style>'+ '#artPlate{position:fixed;inset:0;background:#ecebdf;z-index:9999;display:grid;grid-template-columns:repeat(3,1fr);padding:30px;gap:20px}#artPlate>div{text-align:center;font:16px sans-serif}#artPlate>div>svg{display:block;width:100%;height:170px}'+ '</style>'+artMarkup);
 await artPage.waitForTimeout(350);await artPage.screenshot({path:path.join(tmp,'specialist-art.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 console.log('Pre-battle: phone/desktop, placement, targets, lock, resume, both armies, fog, camera, Experience, normal move/unload and new artwork passed.',tmp);
})().catch(async e=>{console.error(e);process.exitCode=1;for(const [i,p] of (browser?.contexts().flatMap(c=>c.pages())||[]).entries()){console.error(await p.evaluate(()=>({scenario:state?.scenario?.id,phase:state?.deployment,body:document.body.className,message:$('message')?.textContent})).catch(()=>({})));await p.screenshot({path:path.join(tmp,`failure-${i}.png`)}).catch(()=>{});}console.error(tmp);}).finally(async()=>{await browser?.close();server.kill();if(process.env.DSL_SCREENSHOTS)fs.cpSync(tmp,process.env.DSL_SCREENSHOTS,{recursive:true});});
