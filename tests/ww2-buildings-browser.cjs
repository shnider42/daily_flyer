const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-buildings-')),db=path.join(temp,'games.sqlite3'),base='http://127.0.0.1:8116';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8116','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[];
async function fixture(p,replay=false){
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys,copy
from ww2_tactics.engine import initial
from ww2_tactics import weapons
from ww2_tactics.visibility import view,update_intel
db=sqlite3.connect(sys.argv[1]);old=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
s=initial('stalingrad','dsl');s.update(ready=True,revision=old['revision']+1,fog_of_war=False,buildings={},building_intel={})
s['battlefield']['map']=[['field']*18 for _ in range(20)]
for x,c in [(6,'intact'),(7,'damaged'),(8,'destroyed')]:
 s['battlefield']['map'][15][x]='building';s['buildings'][str(x)+',15']=c
roster=s['units'];s['units']=[]
for i,(side,kind,pos) in enumerate([('us','scout',[6,16]),('us','squad',[7,15]),('de','commander',[14,2]),('de','squad',[15,2])]):
 u=copy.deepcopy(next(u for u in roster if u['side']==side and u['kind']==kind));u.update(id='fixture-'+str(i),pos=pos,ap=3);s['units'].append(u)
if sys.argv[3]=='replay':
 before=view(s,'us')
 weapons.resolve_artillery(s,dict(attacker='fixture-2',pos=[7,15]),lambda:6)
 update_intel(s)
 s['computer_playback']=dict(id=s['revision'],frames=[dict(action=dict(kind='artillery',unit='fixture-2',pos=[7,15]),before=before,after=view(s,'us'),combat=[s['last_combat']],effects=[])])
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));db.commit()
`,db,code,replay?'replay':'normal']);
 await p.evaluate(async()=>{combatMode=null;state=await api('/api/match/'+session.code);render();});
}
async function choose(p,id){await p.evaluate(id=>{chooseUnit(state.units.find(u=>u.id===id));focusMapUnit(state.units.find(u=>u.id===id));},id);}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(base);await p.selectOption('#scenarioSelect','stalingrad');await tap(p,p.locator('#createSolo'));await tap(p,p.locator('#startSolo'));
 await p.waitForFunction(()=>state?.building_version&&!busy);
 for(const name of ['intact','damaged','destroyed'])assert.ok(await p.locator('#map .building-'+name).count()>0);
 await fixture(p);
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:width===1440?1000:844});await choose(p,'fixture-0');
  assert.equal(await p.locator('#map .hex.building-destroyed.move').count(),0);
  assert.equal(await p.locator('#map .hex[data-x="6"][data-y="15"]').getAttribute('data-building-state'),'intact');
  const before=await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top);
  await choose(p,'fixture-1');assert.match(await p.locator('#hint').textContent(),/collapse/);
  assert.ok(Math.abs(await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top)-before)<2);
  for(const name of ['intact','damaged','destroyed'])assert.equal(await p.locator('#map .structure-'+name).count(),1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(temp,`detailed-${width}.png`)});
  await tap(p,p.locator('#terrainToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  assert.equal(await p.locator('body.detailed-terrain').count(),0);
  for(const name of ['intact','damaged','destroyed'])assert.equal(await p.locator('#map .structure-'+name).count(),1);
  await p.screenshot({path:path.join(temp,`basic-${width}.png`)});
  await tap(p,p.locator('#terrainToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 }
 // Desktop pointer help gives the actual entry restriction and collapse risk.
 const d=await browser.newPage({viewport:{width:1440,height:1000}});d.on('pageerror',e=>errors.push(e.message));
 const local=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 await d.addInitScript(values=>{for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);},local);
 await d.goto(base);await d.locator('.saved-session').first().click();await d.waitForFunction(()=>state?.building_version);
 await choose(d,'fixture-0');
 await d.locator('#map .hex[data-x="8"][data-y="15"]').hover();
 await d.waitForFunction(()=>!document.getElementById('battleTooltip').hidden);
 assert.match(await d.locator('#battleTooltip').textContent(),/ground entry blocked/);
 await d.screenshot({path:path.join(temp,'desktop-ruin-tooltip.png')});await d.close();
 await p.setViewportSize({width:390,height:844});await fixture(p,true);
 await p.evaluate(()=>{startPlayback();playbackSession.paused=true;clearTimeout(playbackTimer);drawPlayback();});
 assert.equal(await p.locator('#playbackMap .hex[data-x="7"][data-y="15"]').getAttribute('data-building-state'),'damaged');
 await p.evaluate(()=>{playbackSession.phase='after';drawPlayback();});
 assert.equal(await p.locator('#playbackMap .hex[data-x="7"][data-y="15"]').getAttribute('data-building-state'),'destroyed');
 assert.match(await p.locator('#playbackResult').textContent(),/building collapsed/);
 assert.deepEqual(errors,[]);
 console.log('Buildings: phone/desktop, both terrain styles, fixed map, collapse warnings, desktop tooltip and before/after replay passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
