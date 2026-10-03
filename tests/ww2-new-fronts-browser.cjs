/* Actual phone/desktop controls. Fixtures edit only this temporary test database. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-new-fronts-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8147';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8147','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[],badAssets=[];
const camera=p=>p.locator('#mapWrap').evaluate(n=>({top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height,left:n.scrollLeft,scrollTop:n.scrollTop}));
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const touch of [true,false]){
  const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:800},hasTouch:touch,isMobile:touch});p.setDefaultTimeout(20000);
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
  let posts=0;p.on('request',r=>{if(r.method()==='POST')posts++;});
  await p.goto(base);await p.waitForFunction(()=>scenarios.length>=20);
  for(const scenario of ['kharkov','relay_crossing','dunkirk']){
   if(await p.locator('#game').isVisible())await p.locator('#homeBattles').click();
   await p.locator('#scenarioSelect').selectOption(scenario);await p.locator('#createSolo').click();await p.locator('#startSolo').click();
   await p.waitForFunction(id=>state?.scenario.id===id&&!busy&&!polling,scenario);
   const radio=await p.evaluate(()=>state.units.find(u=>u.side===state.side&&u.kind==='radioman'));
   await p.evaluate(id=>{chooseUnit(state.units.find(u=>u.id===id));focusMapUnit(state.units.find(u=>u.id===id));},radio.id);
   await p.waitForTimeout(150);
   for(const level of ['simple','moderate','expert']){
    const snapshot=await p.evaluate(()=>JSON.stringify({units:state.units,legal:state.legal,round:state.round,revision:state.revision})),layout=await p.evaluate(()=>ww2Experience.layout);
    await p.evaluate(level=>ww2Experience.set(level),level);await p.waitForTimeout(60);
    assert.equal(await p.evaluate(()=>ww2Experience.layout),layout);
    assert.equal(await p.evaluate(()=>JSON.stringify({units:state.units,legal:state.legal,round:state.round,revision:state.revision})),snapshot);
    assert.equal(await p.locator('#orderGuideOpen').isVisible(),true,'Explanations reachable without hover');
    const beforePosts=posts,cam=await camera(p);
    await p.locator('#orderGuideOpen').click();await p.locator('#orderGuide').waitFor({state:'visible'});
    assert.match(await p.locator('#orderGuide').textContent(),/dated contact reports/);
    assert.match(await p.locator('#orderGuide').textContent(),/not its weapon range/);
    assert.match(await p.locator('#orderGuideDepth').textContent(),new RegExp(level,'i'));
    assert.match(await p.locator('#orderGuide').textContent(),/does not reveal secret Overwatch/);
    assert.equal(posts,beforePosts,'Inspection cannot send an order');
    await p.locator('#orderGuideClose').click();assert.deepEqual(await camera(p),cam,'Inspection preserves the map');
    await p.locator('#battleViewOpen').click();
    assert.equal(await p.locator('#simpleToggle').inputValue(),level);
    assert.match(await p.locator('#experienceControl .experience-mark').textContent(),new RegExp(level,'i'));
    await p.locator('#experienceControl .experience-compare summary').click();
    assert.equal(await p.locator('#experienceControl [data-experience-choice]').count(),3);
    await p.locator('#experienceControl .experience-compare summary').click();
    await p.locator('#battleViewSettingsClose').click();
   }
   const ap=await p.evaluate(id=>state.units.find(u=>u.id===id).ap,radio.id);
   await tap(p,p.locator('#observe'));
   await p.waitForFunction(id=>!busy&&state.units.find(u=>u.id===id).observing,radio.id);
   assert.equal(await p.evaluate(id=>state.units.find(u=>u.id===id).ap,radio.id),ap-1);
   await p.locator('#orderGuideOpen').click();assert.match(await p.locator('#orderGuideStatus').textContent(),/OBSERVING \+2 sight/);await p.locator('#orderGuideClose').click();
   await p.locator('#battleMission').click();const mission=await p.locator('#missionDialog').textContent();
   assert.match(mission,scenario==='kharkov'?/10 points/:scenario==='dunkirk'?/6 of 8/:/two of your turns/);await p.locator('#missionClose').click();
   if(scenario==='relay_crossing'){
    // Spend an actual shell; no invented inventory change on the live response.
    await p.evaluate(async()=>{const m=state.units.find(u=>u.side===state.side&&u.kind==='mortar');chooseUnit(m);await act({kind:'mortar_fire',unit:m.id,pos:state.legal[m.id].mortar_fire[0]});});
    await p.waitForFunction(()=>!busy);
    await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='supply')));
    assert.equal(await p.locator('#resupply').getAttribute('aria-disabled'),'false');
    await tap(p,p.locator('#resupply'));await p.locator('#supplyDialog').waitFor({state:'visible'});await p.locator('#supplyRecipients button').first().click();
    await p.waitForFunction(()=>!busy&&state.units.find(u=>u.side===state.side&&u.kind==='supply').supply_packs===2);
    assert.equal(await p.evaluate(()=>state.units.find(u=>u.side===state.side&&u.kind==='mortar').shells),3);
    assert.equal(await p.evaluate(()=>state.legal[state.units.find(u=>u.side===state.side&&u.kind==='mortar').id].mortar_fire.length),0);
   }
   if(scenario==='dunkirk'){
    const code=await p.evaluate(()=>state.code);
    cp.execFileSync('python',['-c',`import sqlite3,json,sys\nwith sqlite3.connect(sys.argv[1]) as d:\n s=json.loads(d.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0]); b=next(u for u in s['units'] if u['kind']=='landing_craft'); t=next(u for u in s['units'] if u.get('evacuee'));b.update(pos=[3,0],ap=1);t.update(pos=[3,0],carrier_id=b['id']);s['revision']+=1;d.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]))`,db,code]);
    await p.evaluate(async()=>{await refresh();const b=state.units.find(u=>u.kind==='landing_craft');chooseUnit(b);focusMapUnit(b);});
    assert.equal(await p.locator('#evacuate').getAttribute('aria-disabled'),'false');await tap(p,p.locator('#evacuate'));
    await p.waitForFunction(()=>!busy&&state.evacuated_count===1);assert.equal(await p.evaluate(()=>state.order_history.can_undo),false);
    assert.equal(await p.locator('#map .front-objectives').count(),1);
   }
   await p.evaluate(()=>{ww2Experience.set('simple');});
   if(touch){const width=await p.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth));assert.ok(width<=392,'No page horizontal overflow: '+width);}
   await p.screenshot({path:path.join(tmp,`${touch?'phone':'desktop'}-${scenario}.png`),fullPage:false});
   const code=await p.evaluate(()=>state.code);await p.locator('#homeBattles').click();await p.locator('#sessionList .saved-session').first().click();
   await p.waitForFunction(code=>state?.code===code&&!busy&&!$('game').hidden,code);
   assert.equal(await p.evaluate(()=>state.scenario.id),scenario);
  }
  // Narrow touch layout: explanation target retains a usable 44px hit area.
  if(touch){await p.setViewportSize({width:320,height:740});await p.waitForTimeout(150);const r=await p.locator('#orderGuideOpen').boundingBox();assert.ok(r&&r.width>=44&&r.x+r.width<=320);await p.screenshot({path:path.join(tmp,'phone-320.png')});}
  await p.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 console.log('Three theaters and shared Experience: real Observe, supply, rescue, mobile help, mission progress, no-inspection POST, unchanged rules, resume and narrow layout passed.',tmp);
 if(process.env.DSL_SCREENSHOTS)fs.cpSync(tmp,process.env.DSL_SCREENSHOTS,{recursive:true});
})().catch(async e=>{console.error(e);process.exitCode=1;if(process.env.DSL_SCREENSHOTS){fs.mkdirSync(process.env.DSL_SCREENSHOTS,{recursive:true});const pages=browser?.contexts().flatMap(c=>c.pages())||[];for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:path.join(process.env.DSL_SCREENSHOTS,`failure-${i}.png`)}).catch(()=>{});}}).finally(async()=>{await browser?.close();server.kill();});
