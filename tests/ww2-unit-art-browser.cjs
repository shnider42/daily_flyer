/* Production artwork: every role, illustrated Detailed / symbol Basic and close-ups. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const tmp=fs.mkdtempSync('/tmp/ww2-unit-art-'),base='http://127.0.0.1:8192';
const server=cp.spawn('python',['-c',`import os
from ww2_web import create_app
create_app(os.environ['WW2_DB_PATH'],background_ai=False).run(host='127.0.0.1',port=8192,threaded=True)
`],{env:{...process.env,WW2_DB_PATH:path.join(tmp,'game.sqlite')},stdio:'ignore'});
let browser;const errors=[];
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:1440,height:1100}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.waitForFunction(()=>scenarios.length>0);await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!polling);
 const before=await p.evaluate(()=>JSON.stringify(state));
 const art=await p.evaluate(()=>{
  const base=state.units.find(u=>u.side===state.side),plate=document.createElement('div');plate.id='artPlate';
  const entries=Object.keys(kinds).map(kind=>({...base,id:'art-'+kind,kind,pos:[0,0],side:'us',pinned:false,entrenched:false,overwatch:false}));
  for(const [kind,variant] of [['tank','tiger'],['tank','firefly'],['tank','kv1'],['tank','matilda'],['bomber','lancaster'],['bomber','halifax'],['bomber','mosquito_pathfinder'],['fighter','mosquito_fighter'],['fighter','bf110'],['transport_aircraft','dakota'],['aa_gun','heavy_flak'],['aa_gun','light_flak'],['bomber','dive_bomber'],['bomber','torpedo_bomber'],['cruiser','aa_escort'],['cruiser','torpedo_cruiser']])entries.push({...base,id:'art-'+variant,kind,variant,pos:[0,0],side:'de',pinned:false,entrenched:false,overwatch:false});
  for(const u of entries){const card=document.createElement('div');card.append(makeUnitPortrait(u),document.createTextNode(u.variant||u.kind));plate.append(card);}
  document.body.append(plate);
  return {entries:entries.length,kinds:Object.keys(kinds)};
 });
 assert.ok(art.kinds.length>=33);
 for(const setting of ['detailed','basic']){
  if((await p.locator('#unitStyleToggle').textContent())!==`Units: ${setting}`)await p.evaluate(()=>$('unitStyleToggle').click());
  assert.equal(await p.locator(`#artPlate .unit-art-${setting}`).count(),art.entries);
  assert.equal(await p.locator('#artPlate image').count(),setting==='detailed'?art.entries:0,'Detailed uses painted miniatures; Basic makes no image requests');
  if(setting==='detailed')await p.waitForFunction(()=>[...document.querySelectorAll('#artPlate .unit-portrait')].every(n=>n.classList.contains('illustration-ready')));
  const shapes=await p.locator('#artPlate .unit-portrait').evaluateAll(ns=>ns.map(n=>({shapes:n.querySelectorAll('path,circle').length,text:n.querySelectorAll('text').length,ink:getComputedStyle(n.querySelector('.art-solid')).fill,details:[...n.querySelectorAll('.art-detail')].every(n=>getComputedStyle(n).display===(document.querySelector('.unit-art').classList.contains('unit-art-detailed')?'block':'none'))})));
  assert.ok(shapes.every(n=>n.shapes>=3&&n.text===0&&n.ink==='rgb(243, 237, 206)'&&n.details),JSON.stringify(shapes));
  const artPage=await browser.newPage({viewport:{width:1440,height:1100}}),markup=await p.locator('#artPlate').evaluate(n=>n.outerHTML);
  await artPage.setContent(`<base href="${base}"><link rel="stylesheet" href="/assets/game.css"><link rel="stylesheet" href="/assets/unit-art.css"><link rel="stylesheet" href="/assets/expanded.css"><style>#artPlate{position:fixed;inset:0;background:#e4e5d6;display:grid;grid-template-columns:repeat(8,1fr);align-content:center;padding:24px;gap:8px;overflow:auto}#artPlate>div{text-align:center;font:12px system-ui;color:#162e35}#artPlate>div>svg{display:block;width:100%;height:125px}</style>${markup}`);
  await artPage.screenshot({path:path.join(tmp,`all-unit-icons-${setting}.png`)});await artPage.close();
 }
 await p.locator('#artPlate').evaluate(n=>n.remove());
 assert.equal(await p.locator('#map .unit-art-basic').count(),await p.locator('#map .unit').count());
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),before,'Preference changes do not change battle state');
 await p.reload();await p.locator('.saved-session').first().click();await p.waitForFunction(()=>state&&!busy&&!polling);assert.equal(await p.locator('#unitStyleToggle').textContent(),'Units: basic');
 assert.equal(await p.locator('#map .unit-art-basic').count(),await p.locator('#map .unit').count());
 await p.evaluate(()=>$('unitStyleToggle').click());assert.equal(await p.locator('#map .unit-art-detailed').count(),await p.locator('#map .unit').count());
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side)));assert.equal(await p.locator('#map .unit-art-detailed').count(),await p.locator('#map .unit').count());
 await p.screenshot({path:path.join(tmp,'phone-unit-icons.png')});assert.deepEqual(errors,[]);
 console.log(`PASS: ${art.kinds.length} roles and ${art.entries-art.kinds.length} variants use illustrated Detailed and symbol Basic art; settings update map and close-ups, persist, preserve state and work on phone. Screenshots: ${tmp}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
