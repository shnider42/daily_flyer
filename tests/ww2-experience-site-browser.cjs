/* Shared guidance across Home, setup, Journey and the second game.
   Native browser controls; disposable local games; no production writes. */
'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {tap:baseTap}=require('./ww2-ui-helpers.cjs');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dsl-experience-site-'));
const base='http://127.0.0.1:18769',python=process.env.DSL_TEST_PYTHON||'python';
const server=cp.spawn(python,['-c','import sys; from ww2_web import create_app; create_app(sys.argv[1],background_ai=False).run(host="127.0.0.1",port=18769,threaded=True)',path.join(tmp,'games.sqlite3')],{cwd:root,stdio:'ignore'});
let browser;const errors=[],pages=[],posts=[];
async function settle(p){await p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.transitionProperty==='grid-template-rows').map(a=>a.finished.catch(()=>{})));});}
async function page(width){
 const p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000});pages.push(p);p.setDefaultTimeout(25000);
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>currentScenarios.length>0&&window.ww2Experience&&window.empiresUI);return p;
}
async function tap(p,locator){
 for(let i=0;i<5;i++){const details=locator.locator('xpath=ancestor::details[not(@open)]').first();if(!await details.count())break;await baseTap(p,details.locator(':scope > summary'));}
 await baseTap(p,locator);
}
async function readonly(p,change,snapshot){
 await settle(p);const before=await p.evaluate(snapshot),count=posts.length;await change();await settle(p);
 assert.deepEqual(await p.evaluate(snapshot),before);assert.equal(posts.length,count,'Guidance must not submit an order or create a game');
}
async function shot(p,name){
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
 for(const d of await p.locator('dialog[open]').all())assert.ok(await d.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Dialog content fits');
 await p.screenshot({path:path.join(tmp,name+'.png')});
}
const creation=()=>({map:$('soloScenario').value,army:$('soloSide').value,rules:$('soloRuleset').value});
const dsl=()=>({state:JSON.stringify(state),selected,target,smokeMode,barrageMode,combatMode,left:$('mapWrap').scrollLeft,top:$('mapWrap').scrollTop});
const empire=()=>({state:JSON.stringify(empiresUI.state),selection:empiresUI.selection,left:$('empMapWrap').scrollLeft,top:$('empMapWrap').scrollTop,rect:$('empMapWrap').getBoundingClientRect().toJSON()});
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(server.exitCode!==null)throw Error('Local test server exited');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const phone=await page(390);
 assert.ok(await phone.evaluate(()=>$('homeExperience').getBoundingClientRect().top<$('greybridgeHome').getBoundingClientRect().top),'Shared Experience appears before operation choices');
 assert.match(await phone.locator('#experienceRulesNote').textContent(),/Squad Leader and Empires/);
 for(const level of ['moderate','expert','simple']){
  await readonly(phone,()=>phone.locator('#homeExperience').selectOption(level),()=>({map:$('scenarioSelect').value,rules:$('rulesetSelect').value,count:$('scenarioSelect').options.length}));
  assert.match(await phone.locator('#homeExperienceNote').textContent(),{simple:/next step/,moderate:/Costs.*timing/,expert:/exact modifiers/}[level]);
 }
 await shot(phone,'home-simple-phone');
 await phone.locator('#createSolo').click();
 for(const level of ['moderate','expert','simple'])await readonly(phone,()=>phone.locator('#soloExperience').selectOption(level),creation);
 await shot(phone,'solo-simple-phone');await phone.locator('#closeSolo').click();
 await phone.locator('#learnStart').click();
 for(const level of ['simple','moderate','expert']){
  await readonly(phone,()=>phone.locator('#journeyExperience').selectOption(level),()=>({chapters:$('journeyChapters').children.length,army:$('journeySide').value,edition:$('journeyEdition').value}));
  assert.equal(await phone.locator('#journeyChapters > li').count(),14);
 }
 await shot(phone,'journey-expert-phone');await phone.locator('#journeyClose').click();
 await phone.locator('#homeExperience').selectOption('simple');await phone.locator('#createSolo').click();await phone.locator('#startSolo').click();
 await phone.waitForFunction(()=>state&&!busy&&!polling);await settle(phone);
 assert.equal(await phone.locator('#battleExperienceLabel').textContent(),'Simple');
 await tap(phone,phone.locator('#rematchButton'));
 assert.match(await phone.locator('#rematchSetupGuide').textContent(),/begins the new solo game/);
 for(const level of ['moderate','expert','simple'])await readonly(phone,()=>phone.locator('#rematchExperience').selectOption(level),dsl);
 await phone.locator('#closeRematch').click();await tap(phone,phone.locator('#homeBattles'));
 await phone.locator('#modeEmpires').click();await phone.locator('#empHome').waitFor({state:'visible'});
 assert.equal(await phone.locator('#empHomeExperience').inputValue(),'simple');
 await phone.locator('#empCreate').click();await phone.waitForFunction(()=>empiresUI.state&&empiresUI.state.revision===0);
 if(await phone.locator('#empLearnSheet').evaluate(n=>n.open))await phone.locator('[data-emp-close="empLearnSheet"]').click();
 for(const level of ['simple','moderate','expert']){
  await phone.locator('#empMenuOpen').click();
  await readonly(phone,()=>phone.locator('#empExperience').selectOption(level),empire);
  assert.equal(await phone.locator('#homeExperience').inputValue(),level,'Preference is shared with DSL');
  await phone.locator('[data-emp-close="empMenu"]').click();await phone.locator('#empOrdersOpen').click();
  assert.match(await phone.locator('#empPanel .emp-experience-context').textContent(),new RegExp(level,'i'));
  if(level!=='expert')assert.ok(await phone.locator('#empDecision').isVisible());
  await shot(phone,'empires-'+level+'-phone');await phone.locator('[data-emp-close="empOrdersSheet"]').click();
 }
 for(const [width,height] of [[320,740],[844,390],[1440,900]]){
  await phone.setViewportSize({width,height});await settle(phone);
  await phone.evaluate(()=>ww2Experience.set('moderate'));await settle(phone);
  if(width<1100)await phone.locator('#empOrdersOpen').click();
  await shot(phone,'empires-moderate-'+width);
  if(await phone.locator('#empOrdersSheet').evaluate(n=>n.open))await phone.locator('[data-emp-close="empOrdersSheet"]').click();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: prominent shared guidance, Home/Solo/Journey/solo-rematch controls, unchanged creation and live states, Empires Simple/Moderate/Expert real layouts, shared preference, zero gameplay writes from level changes, phone/landscape/desktop.',JSON.stringify({screenshots:tmp}));
})().catch(async error=>{
 console.error(error,errors);for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:path.join(tmp,'failure-'+i+'.png')});console.error('Open dialogs:',await pages[i].locator('dialog[open]').evaluateAll(ds=>ds.map(d=>d.id)));}catch{}}
 console.error('Screenshots:',tmp);process.exitCode=1;
}).finally(async()=>{await browser?.close();server.kill();});
