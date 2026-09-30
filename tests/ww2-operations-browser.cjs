const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-operations-')),db=path.join(temp,'games.sqlite3'),base='http://127.0.0.1:8117';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8117','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[];
async function fixture(p){
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.engine import initial
from ww2_tactics.campaigns import unit
from ww2_tactics import weapons
db=sqlite3.connect(sys.argv[1]);old=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
s=initial('market_garden','dsl');s.update(ready=True,revision=old['revision']+1,fog_of_war=False,buildings={},building_intel={})
s['battlefield']['map']=[['field']*22 for _ in range(28)]
s['units']=[unit(side,kind,pos,'A',i) for i,(side,kind,pos) in enumerate([
 ('us','sniper',[5,15]),('us','scout',[5,18]),('us','engineer',[5,17]),('us','tank',[6,17]),
 ('us','commander',[8,17]),('de','squad',[10,15]),('de','squad',[11,17]),('de','tank',[18,5])])]
s['units'][3].update(hp=2,immobilized=True)
s['units'][4].update(cooldowns={'artillery':3})
for pos,kind,condition in [([5,15],'tower','intact'),([8,13],'tower','damaged'),([11,17],'building','damaged')]:
 x,y=pos;s['battlefield']['map'][y][x]=kind;s['buildings'][str(x)+','+str(y)]=condition
weapons.initialize(s)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));db.commit()
`,db,code]);
 await p.evaluate(async()=>{document.dispatchEvent(new Event('ww2:cancel-targeting'));combatMode=null;selected=null;state=await api('/api/match/'+session.code);render();});
}
async function choose(p,id){await p.evaluate(id=>{const u=state.units.find(u=>u.id===id);chooseUnit(u);focusMapUnit(u);},id);}
async function settled(p){await p.waitForFunction(()=>!busy);}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(base);
 for(const name of ['carentan','market_garden']){
  await p.selectOption('#scenarioSelect',name);await p.waitForFunction(name=>document.getElementById('scenarioSelect').value===name&&document.getElementById('operationTitle').textContent.includes(name==='carentan'?'Carentan':'Market Garden'),name);
  assert.ok(await p.locator('#scenarioPreview .tower').count()>0);
 }
 await p.selectOption('#scenarioSelect','carentan');await tap(p,p.locator('#createSolo'));await tap(p,p.locator('#startSolo'));
 await p.waitForFunction(()=>state?.tactics_version&&!busy);assert.equal(await p.evaluate(()=>state.scenario.id),'carentan');
 await p.screenshot({path:path.join(temp,'carentan-phone.png')});
 await fixture(p);
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:width===1440?1000:844});await choose(p,'us-A-0');
  assert.match(await p.locator('#selection').textContent(),/Sniper team/);
  assert.equal(await p.locator('#map .range-guide').count(),1);
  assert.ok(await p.locator('#map image[href$="sniper-v1.webp"]').count()>0);
  assert.match(await p.locator('#roleBrief').textContent(),/Sight 12.*snipe 8/);
  assert.equal(await p.locator('#map .tower-art').count(),2);
  const top=await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top);
  for(const [id,button] of [['us-A-2','repairTank'],['us-A-3','areaFire'],['us-A-4','artillery']]){
   await choose(p,id);assert.ok(Math.abs(await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top)-top)<2);
   assert.ok(await p.locator('#'+button).isVisible());
   if(width<1100){
    const overflow=await p.locator('#orders').evaluate(n=>n.scrollHeight>n.clientHeight+2||n.scrollWidth>n.clientWidth+2);assert.equal(overflow,false);
   }
  }
  assert.match(await p.locator('#artillery').textContent(),/Ready R3/);assert.ok(await p.locator('#artillery').isDisabled());
  assert.ok(await p.locator('#fieldRecon').isEnabled());
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await choose(p,'us-A-0');await p.screenshot({path:path.join(temp,`sniper-${width}.png`)});
  await tap(p,p.locator('#terrainToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  assert.equal(await p.locator('#map .tower-art').count(),2);
  await tap(p,p.locator('#terrainToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 }
 await p.setViewportSize({width:390,height:844});await choose(p,'us-A-2');await tap(p,p.locator('#repairTank'));
 assert.equal(await p.locator('#map .hex.move').count(),0);
 await p.locator('#map .repair-choice').click();await settled(p);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id==='us-A-3').hp),3);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id==='us-A-2').repair_kits),2);
 await tap(p,p.locator('#undoOrder'));await settled(p);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id==='us-A-3').hp),2);
 await choose(p,'us-A-0');await tap(p,p.locator('#snipe'));
 assert.ok(await p.locator('#map .snipe-choice').count()>0);assert.equal(await p.locator('#map .hex.move').count(),0);
 await p.locator('#map .snipe-choice').first().click();await settled(p);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id==='us-A-0').exposed_turns),2);
 const roll=await p.evaluate(()=>state.last_combat.roll);
 await tap(p,p.locator('#undoOrder'));await settled(p);await tap(p,p.locator('#redoOrder'));await settled(p);
 assert.equal(await p.evaluate(()=>state.last_combat.roll),roll);
 await choose(p,'us-A-3');await tap(p,p.locator('#areaFire'));
 assert.ok(await p.locator('#map .combat-choice').count()>0);
 await p.evaluate(()=>focusMapUnit({pos:[9,17]}));await p.locator('#map .hex[data-x="9"][data-y="17"]').click();await settled(p);
 assert.equal(await p.evaluate(()=>state.last_combat.kind),'Area fire');
 await fixture(p);await choose(p,'us-A-1');
 assert.equal(await p.evaluate(()=>state.legal['us-A-1'].range_guide.snipe_range),0);
 await tap(p,p.locator('#rangeGuideToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 assert.equal(await p.locator('#map .range-guide').count(),0);
 // Selection stays client-side and reuses the board/terrain nodes.
 const timing=await p.evaluate(()=>{const tile=document.querySelector('#map .hex'),art=document.querySelector('#map .terrain-art');const times=[];for(let i=0;i<30;i++){const t=performance.now();chooseUnit(state.units.find(u=>u.id==='us-A-'+(i%4)));times.push(performance.now()-t);}return {max:Math.max(...times),median:times.sort((a,b)=>a-b)[15],reused:tile===document.querySelector('#map .hex')&&art===document.querySelector('#map .terrain-art')};});
 assert.equal(timing.reused,true);assert.ok(timing.median<100,JSON.stringify(timing));
 assert.deepEqual(errors,[]);console.log('Operations: new maps, mobile/desktop layout, tower styles, sniper art, cooldowns, repairs, snipe/redo, area targeting and range guides passed.',timing,temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
