/* Real local drop/fire orders: readable dice results never depend on a menu. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync('/tmp/ww2-result-feedback-'),db=path.join(temp,'game.sqlite'),dice=path.join(temp,'die.txt'),base='http://127.0.0.1:8191';fs.writeFileSync(dice,'1');
const server=cp.spawn('python',['-c',`import os
import ww2_tactics.engine as engine
def test_roll(n):
 path=os.environ['TEST_DIE_PATH']
 values=list(map(int,open(path).read().split(',')))
 if len(values)>1:
  with open(path,'w') as output:output.write(','.join(map(str,values[1:])))
 return values[0]-1
engine.secrets.randbelow=test_roll
from ww2_web import create_app
create_app(os.environ['WW2_DB_PATH'],background_ai=False).run(host='127.0.0.1',port=8191,threaded=True)
`],{env:{...process.env,WW2_DB_PATH:db,TEST_DIE_PATH:dice},stdio:'ignore'});
let browser,page;const errors=[];
async function settle(){await page.waitForFunction(()=>state&&!busy&&!polling);await page.waitForTimeout(60);}
function fixture(code,phase){return JSON.parse(cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
conn=sqlite3.connect(sys.argv[1]);code,phase=sys.argv[2:]
s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(code,)).fetchone()[0])
platoon='A' if phase in ('lost','scatter') else 'B'
plane=next(u for u in s['units'] if u['side']=='us' and u['kind']=='transport_aircraft' and u['platoon']==platoon)
if platoon=='B':
 other=next(u for u in s['units'] if u['side']=='us' and u['kind']=='transport_aircraft' and u['platoon']=='A')
 other.update(pos=[8,23])
plane.update(pos=[15,14],ap=4)
heavy=next(u for u in s['units'] if u.get('variant')=='lancaster' and u['platoon']=='A')
radar=next(u for u in s['units'] if u.get('mission_radar') and u['platoon']=='A')
if phase=='bomb':heavy.update(pos=[8,13],ap=4)
if phase in ('scatter','flak'):s['round']=2
if phase=='scatter':
 other=next(u for u in s['units'] if u['side']=='us' and u['kind']=='transport_aircraft' and u['platoon']=='B')
 other.update(pos=[22,23])
if phase=='flak':
 other=next(u for u in s['units'] if u['side']=='us' and u['kind']=='transport_aircraft' and u['platoon']=='A')
 other.update(pos=[8,23])
 gun=next(u for u in s['units'] if u['kind']=='aa_gun' and u['platoon']=='A')
 gun.update(pos=[15,15],pinned=False)
s['turn']='us';s['revision']+=1;update_intel(s)
conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),code));conn.commit()
print(json.dumps({'plane':plane['id'],'heavy':heavy['id'],'radar':radar['id']}))
`,db,code,phase],{encoding:'utf8'}));}
async function select(id){await page.evaluate(id=>{chooseUnit(state.units.find(u=>u.id===id));},id);await settle();}
async function drop(){await tap(page,page.locator('#nightDrop'));const revision=await page.evaluate(()=>state.revision);await tap(page,page.locator('#map .night-choice[data-x="15"][data-y="13"]'));await page.waitForFunction(r=>state.revision>r&&!busy,revision);await settle();}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(20000);
 await page.goto(base);await page.waitForFunction(()=>scenarios.length&&typeof ww2Experience!=='undefined');
 await page.evaluate(async()=>{ww2Experience.set('simple');ww2Experience.setLayout('map-first');remember(await api('/api/match',{scenario:'current:nightfall_beacon',ruleset:'dsl',opponent:'computer',side:'us'}));await refresh();});await settle();
 const code=await page.evaluate(()=>session.code),ids=fixture(code,'lost');await page.evaluate(()=>refresh());await settle();await select(ids.plane);await drop();
 assert.equal(await page.evaluate(()=>state.airlift_report.roll),1);assert.equal(await page.evaluate(()=>state.airlift_report.landed),false);
 assert.ok(await page.locator('#battleFeedback').isVisible());assert.match(await page.locator('.battle-result-title').textContent(),/SQUAD LOST.*ROLLED 1/);assert.match(await page.locator('.battle-result-roll').textContent(),/D6 · 1/);assert.match(await page.locator('.battle-result-detail').textContent(),/No sight established/);assert.match(await page.locator('.battle-result-cargo').textContent(),/1\/2 squads aboard/);
 assert.equal(await page.locator('#battleFeedback').evaluate(n=>n.closest('dialog')),null);assert.equal(await page.locator('#battleFeedback .die-face').getAttribute('aria-label'),'Die 1');
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
  await page.setViewportSize({width,height});await settle();const panel=await page.locator('#battleFeedback').boundingBox(),map=await page.locator('#mapWrap').boundingBox(),dismiss=await page.locator('.battle-result-dismiss').boundingBox();
  assert.ok(panel.y>=0&&panel.y+panel.height<=height+1,JSON.stringify({width,height,panel}));assert.ok(map.height>100);assert.ok(map.width>Math.min(width/2,320));assert.ok(dismiss.x+dismiss.width<=width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(panel.y>=map.y+map.height-1||panel.x>=map.x+map.width-1,'Result must not cover map');await page.screenshot({path:path.join(temp,`loss-${width}.png`)});
 }
 await page.locator('.battle-result-dismiss').click();assert.ok(await page.locator('#battleFeedback').isHidden());await select(ids.plane);assert.ok(await page.locator('#battleFeedback').isHidden());
 fs.writeFileSync(dice,'6');const second=fixture(code,'landed');await page.evaluate(()=>refresh());await settle();await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>ww2Desktop.active&&ww2ExperimentalDesktop.active);await select(second.plane);
 assert.match(await page.locator('#hint').textContent(),/Click an outlined hex to fly.*2 hexes \/ 1 AP/);await drop();
 assert.equal(await page.evaluate(()=>state.airlift_report.roll),6);assert.equal(await page.evaluate(()=>state.airlift_report.landed),true);assert.match(await page.locator('.battle-result-title').textContent(),/LANDED/);assert.match(await page.locator('.battle-result-detail').textContent(),/1 AP on arrival.*Exact drop/);assert.match(await page.locator('.battle-result-cargo').textContent(),/1\/2 squads aboard/);
 assert.equal(await page.locator('#battleFeedback').evaluate(n=>n.parentElement.id),'experimentalDesktopScreen');await page.screenshot({path:path.join(temp,'landing-desktop-map-first.png')});
 await page.evaluate(()=>ww2Experience.setLayout('panels'));await settle();assert.equal(await page.locator('#battleFeedback').evaluate(n=>n.parentElement.className),'desktop-command-column');assert.ok(await page.locator('#battleFeedback').isVisible());
 const bomb=fixture(code,'bomb');await page.evaluate(()=>refresh());await settle();await select(bomb.heavy);await page.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),bomb.radar);const before=await page.evaluate(()=>state.revision);await tap(page,page.locator('#fire'));await page.waitForFunction(r=>state.revision>r&&!busy,before);await settle();
 assert.match(await page.locator('.battle-result-title').textContent(),/HIT/);assert.match(await page.locator('.battle-result-detail').textContent(),/Rolled 6.*needed/);assert.match(await page.locator('.battle-result-roll').textContent(),/D6 · 6/);await page.screenshot({path:path.join(temp,'bomb-result-desktop.png')});
 await page.setViewportSize({width:390,height:844});await settle();assert.equal(await page.locator('#battleFeedback').evaluate(n=>n.parentElement.id),'mobileBattleScreen');assert.ok(await page.locator('#battleFeedback').isVisible());
 await page.evaluate(()=>ww2Experience.setLayout('map-first'));fs.writeFileSync(dice,'4,2,6');const scatter=fixture(code,'scatter');await page.evaluate(()=>refresh());await settle();await select(scatter.plane);await drop();
 assert.equal(await page.evaluate(()=>state.airlift_report.roll),4);assert.equal(await page.evaluate(()=>state.airlift_report.landed),true);assert.match(await page.locator('.battle-result-detail').textContent(),/Scattered 1 hex/);assert.match(await page.locator('.battle-result-cargo').textContent(),/0\/2 squads aboard/);
 fs.writeFileSync(dice,'6,1');const flak=fixture(code,'flak');await page.evaluate(()=>refresh());await settle();await select(flak.plane);await drop();
 assert.equal(await page.evaluate(()=>state.airlift_report.roll),6);assert.equal(await page.evaluate(()=>state.airlift_report.landed),false);assert.match(await page.locator('.battle-result-title').textContent(),/LOST ON APPROACH/);assert.match(await page.locator('.battle-result-detail').textContent(),/Gun locations remain unknown/);assert.doesNotMatch(await page.locator('#battleFeedback').textContent(),/de-night/);assert.equal(await page.locator('#battleFeedback').getAttribute('data-tone'),'lost');assert.ok(await page.locator('#message').isHidden());await page.screenshot({path:path.join(temp,'flak-loss-phone.png')});
 assert.deepEqual(errors,[]);console.log('PASS: actual roll-1 loss, roll-6 exact/1AP landing, roll-4 scatter, hidden-Flak loss after roll6; visible dice/cargo, dismiss, four mobile sizes, both desktop layouts, real bombing result.',temp);
})().catch(async e=>{console.error(e,errors);try{await page?.screenshot({path:path.join(temp,'failure.png')});console.error(await page?.evaluate(()=>({message:$('message')?.textContent,selected,busy,state:state&&{revision:state.revision,side:state.side,airlift_report:state.airlift_report}})));}catch{}console.error(temp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
