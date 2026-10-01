const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-tidal-gate-')),db=path.join(temp,'games.sqlite3'),base='http://127.0.0.1:8126';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8126','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[];
async function choose(p,id){await p.evaluate(id=>{document.dispatchEvent(new Event('ww2:cancel-targeting'));const u=state.units.find(u=>u.id===id);chooseUnit(u);focusMapUnit(u);},id);}
async function fixture(p){
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.engine import initial
from ww2_tactics.campaigns import unit
from ww2_tactics import weapons
db=sqlite3.connect(sys.argv[1]);old=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
s=initial('tidal_gate','dsl');s.update(ready=True,revision=old['revision']+1,fog_of_war=False,buildings={},building_intel={})
s['battlefield']['map']=[['field']*36 for _ in range(44)]
s['battlefield']['map'][30][29]='bocage';s['battlefield']['map'][29][28]='water';s['battlefield']['map'][30][27]='bunker';s['buildings']['27,30']='destroyed'
s['units']=[unit('us','engineer',[28,30],'A',1,ap=3),unit('us','tank',[28,31],'A',2),unit('de','squad',[18,10],'HQ',1)]
weapons.initialize(s);s['units'][0]['ap']=3
s['fieldworks_intel']={'us':{},'de':{}}
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));db.commit()
`,db,code]);
 await p.evaluate(async()=>{document.dispatchEvent(new Event('ww2:cancel-targeting'));combatMode=null;smokeMode=false;barrageMode=false;selected=null;target=null;state=await api('/api/match/'+session.code);render();});
}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(base);await p.waitForFunction(()=>scenarios.some(s=>s.id==='tidal_gate'));await p.locator('[data-scenario="tidal_gate"]').click();await p.waitForFunction(()=>$('operationTitle').textContent.includes('Tidal Gate'));
 assert.match(await p.locator('#operationTitle').textContent(),/Tidal Gate/);assert.match(await p.locator('#homeMapSize').textContent(),/36 × 44/);
 assert.equal(await p.locator('#scenarioPreview .hex').count(),1584);
 await p.screenshot({path:path.join(temp,'home-phone.png')});
 await tap(p,p.locator('#createSolo'));await tap(p,p.locator('#startSolo'));await p.waitForFunction(()=>state?.linked_front_version&&!busy);
 assert.equal(await p.locator('#map .hex').count(),1584);assert.equal(await p.locator('#map .linked-marker').count(),3);
 assert.match(await p.locator('#battleMission').textContent(),/town \+ an exit/);
 assert.ok(await p.locator('#map .tile-label').evaluateAll(ns=>ns.some(n=>n.textContent==='AJ44')));
 // Mission navigation uses known geography, and the same panel explains either side.
 await p.locator('#battleMission').click();assert.equal(await p.locator('#missionSectors button').count(),5);
 assert.match(await p.locator('#missionFlags').textContent(),/West causeway exit: Germans/);
 await p.locator('#missionSectors button').filter({hasText:'Airborne'}).click();assert.ok(!await p.locator('#missionDialog').evaluate(n=>n.open));
 const usGoal=await p.evaluate(()=>ww2Briefing.mission(state).goal);
 assert.match(usGoal,/town AND either/);assert.match(await p.evaluate(()=>ww2Briefing.mission({...state,side:'de'}).goal),/Break/);
 await tap(p,p.locator('#mobileGuideOpen'));await p.locator('#lessonContents>summary').click();
 assert.equal(await p.locator('#lessonTopics [data-topic="engineering"]').count(),1);assert.equal(await p.locator('#lessonTopics [data-topic="linked"]').count(),1);
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:width===1440?1000:844});
  await choose(p,'us-A-8');await p.waitForTimeout(100);
  const bounds=await p.locator('#mapWrap').boundingBox();assert.ok(bounds.height>180,JSON.stringify(bounds));
  for(const id of ['us-HQ-1','us-A-3','us-A-10','us-HQ-5']){
   await choose(p,id);const after=await p.locator('#mapWrap').boundingBox();assert.ok(Math.abs(after.y-bounds.y)<2);assert.ok(Math.abs(after.height-bounds.height)<2);
  }
  assert.match(await p.locator('#hint').textContent(),/round 5/);
  assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#platoonFilters [data-platoon="D"]')).getPropertyValue('--platoon-color').trim()),'#336d83');
  await choose(p,'us-A-8');assert.ok(await p.locator('#bridgeGap').isVisible());assert.equal(await p.locator('#bridgeGap').getAttribute('aria-disabled'),'true');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(temp,`battle-${width}.png`)});
 }
 // Exercise actual HTTP engineering on a controlled local snapshot, including undo.
 await p.setViewportSize({width:390,height:844});
 for(const [id,kind,coord,tile] of [['breach','breach',[29,30],'field'],['clearWreck','clear_wreck',[27,30],'rubble'],['bridgeGap','bridge_gap',[28,29],'bridge']]){
  await fixture(p);await choose(p,'us-A-1');await tap(p,p.locator('#'+id));
  assert.equal(await p.locator('#map .hex.move').count(),0);assert.ok(await p.locator('#map .engineering-choice').count()>0);
  await p.locator(`#map .engineering-choice[aria-label$="${String.fromCharCode(65+Math.floor(coord[0]/26)-1)}${String.fromCharCode(65+coord[0]%26)}${coord[1]+1}"]`).click();
  await p.waitForFunction(({coord,tile})=>!busy&&state.map[coord[1]][coord[0]]===tile,{coord,tile});
  assert.equal(await p.evaluate(()=>state.units[0].ap),kind==='bridge_gap'?0:1);
  await tap(p,p.locator('#undoOrder'));await p.waitForFunction(()=>!busy);assert.equal(await p.evaluate(()=>Object.keys(state.fieldworks).length),0);
  await tap(p,p.locator('#redoOrder'));await p.waitForFunction(()=>!busy);assert.equal(await p.evaluate(coord=>state.map[coord[1]][coord[0]],coord),tile);
 }
 // The replay's terrain snapshot overrides the live post-order map.
 await p.evaluate(()=>{state.computer_playback={id:state.revision,frames:[{action:{kind:'bridge_gap',unit:'us-A-1',pos:[28,29]},before:{units:state.units,fieldworks:{},buildings:{'27,30':'destroyed'},objective_control:state.objective_control,round:1,turn:'us',hold:0,winner:null},after:{units:state.units,fieldworks:state.fieldworks,buildings:state.buildings,objective_control:state.objective_control,round:1,turn:'us',hold:0,winner:null},combat:[],effects:[]}]};startPlayback();playbackSession.paused=true;clearTimeout(playbackTimer);});
 assert.equal(await p.locator('#playbackMap .hex[data-x="28"][data-y="29"]').getAttribute('class'),'hex water');
 await p.evaluate(()=>{playbackSession.phase='after';drawPlayback();});assert.equal(await p.locator('#playbackMap .hex[data-x="28"][data-y="29"]').getAttribute('class'),'hex bridge');
 await p.evaluate(()=>stopPlayback());
 assert.deepEqual(errors,[]);console.log('Tidal Gate: live creation, huge-map labels, public missions, sectors, learning, responsive selection, 3 engineering orders, undo/redo and terrain replay passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
