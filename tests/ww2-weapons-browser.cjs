const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-weapons-')),db=path.join(temp,'games.sqlite3'),base='http://127.0.0.1:8113';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8113','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;const errors=[],badAssets=[];
async function select(p,kind){await p.evaluate(kind=>{combatMode=null;chooseUnit(state.units.find(u=>u.side===state.side&&u.kind===kind));focusMapUnit(state.units.find(u=>u.id===selected));},kind);}
async function fixture(p,scenario='frontier'){
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.engine import initial
db=sqlite3.connect(sys.argv[1]);old=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
s=initial(sys.argv[3],'dsl');s.update(ready=True,revision=old['revision']+1)
if sys.argv[3]=='frontier':
 s['battlefield']['map']=[['field']*24 for _ in range(24)]
 chosen=[]
 for side,kind,pos in [('us','commander',[3,15]),('us','tank',[6,15]),('us','mg',[5,15]),('de','squad',[8,15]),('de','tank',[15,15])]:
  u=next(u for u in s['units'] if u['side']==side and u['kind']==kind);u.update(pos=pos,reserve=False);chosen.append(u)
  if kind=='tank' and side=='us':u['immobilized']=True
 s['units']=chosen;s['intel']={}
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));db.commit()
`,db,code,scenario]);
 await p.evaluate(async()=>{combatMode=null;state=await api('/api/match/'+session.code);render();});
}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executable=process.env.CHROMIUM_EXECUTABLE_PATH;
 if(executable)browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']});
 else {const mod=require('@sparticuz/chromium'),pack=mod.default||mod;browser=await chromium.launch({headless:true,executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')});}
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(12000);
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url());});
 await p.goto(base);await p.selectOption('#scenarioSelect','frontier');await tap(p,p.locator('#createSolo'));await tap(p,p.locator('#startSolo'));
 await p.waitForFunction(()=>state?.combat_version&&!busy);
 await fixture(p);
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:width===1440?1000:844});
  await select(p,'commander');
  await tap(p,p.locator('#artillery'));assert.ok(await p.locator('.hex.combat-choice').count()>0);
  assert.equal(await p.locator('.hex.move').count(),0);assert.match(await p.locator('#hint').textContent(),/artillery/);
  const before=await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top);
  await tap(p,p.locator('#artillery'));await select(p,'tank');
  assert.equal(await p.locator('.hex.move').count(),0);assert.equal(await p.locator('.track-marker').count(),1);
  assert.equal(await p.locator('#repairTracks').isVisible(),true);assert.equal(await p.locator('#loadHE').isVisible(),true);
  if(width<1100){
   assert.ok(Math.abs(await p.locator('#mapWrap').evaluate(n=>n.getBoundingClientRect().top)-before)<2);
   assert.match(await p.locator('#mobileOrderToggle').textContent(),/TRACKS DISABLED/);
   assert.ok(await p.evaluate(()=>$('mobileOrderDock').getBoundingClientRect().top>=$('mapWrap').getBoundingClientRect().bottom-1));
   const grid=await p.locator('#orders > .order-buttons:not(#commandOrders)').evaluate(n=>({scroll:n.scrollHeight,height:n.clientHeight}));
   assert.ok(grid.scroll<=grid.height+1,JSON.stringify(grid));
  }
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(temp,`tank-${width}.png`)});
 }
 await p.setViewportSize({width:390,height:844});await select(p,'tank');
 let revision=await p.evaluate(()=>state.revision);
 await tap(p,p.locator('#loadHE'));await p.waitForFunction(rev=>state.revision>rev&&!busy,revision);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id===selected).ammo),'he');assert.match(await p.locator('#mobileOrderToggle').textContent(),/HE loaded/);
 revision=await p.evaluate(()=>state.revision);
 await tap(p,p.locator('#repairTracks'));await p.waitForFunction(rev=>state.revision>rev&&!busy,revision);
 assert.equal(await p.locator('.track-marker').count(),0);assert.equal(await p.evaluate(()=>state.units.find(u=>u.id===selected).ap),0);
 await fixture(p);await select(p,'commander');await tap(p,p.locator('#fieldRecon'));
 assert.ok(await p.locator('.hex.combat-search').count()>0);
 await p.evaluate(()=>focusMapUnit({pos:[15,15]}));revision=await p.evaluate(()=>state.revision);
 await tap(p,p.locator('.hex[data-x="15"][data-y="15"]'));await p.waitForFunction(rev=>state.revision>rev&&!busy,revision);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id===selected).field_recon_charges),1);
 assert.equal(await p.evaluate(()=>state.order_history.can_undo),false);
 assert.ok(await p.locator('#map .unit.de').count()>=2);
 await fixture(p);await select(p,'commander');await tap(p,p.locator('#artillery'));
 await p.evaluate(()=>focusMapUnit({pos:[15,15]}));revision=await p.evaluate(()=>state.revision);
 await tap(p,p.locator('.hex[data-x="15"][data-y="15"]'));await p.waitForFunction(rev=>state.revision>rev&&!busy,revision);
 assert.equal(await p.evaluate(()=>state.barrages[0].weapon),'artillery');assert.ok(await p.locator('.barrage-zone').count()>0);
 await fixture(p,'midway');await select(p,'battleship');await tap(p,p.locator('#bombard'));
 assert.ok(await p.locator('.hex.combat-choice').count()>100);assert.equal(await p.locator('.move-beacon').count(),0);
 await p.screenshot({path:path.join(temp,'midway-bombard-mobile.png')});
 const pos=await p.evaluate(()=>state.legal[selected].bombard.find(p=>!state.visible_hexes.some(v=>v[0]===p[0]&&v[1]===p[1])));
 assert.ok(pos);await p.evaluate(pos=>focusMapUnit({pos}),pos);revision=await p.evaluate(()=>state.revision);
 await tap(p,p.locator(`.hex[data-x="${pos[0]}"][data-y="${pos[1]}"]`));await p.waitForFunction(rev=>state.revision>rev&&!busy,revision);
 assert.equal(await p.evaluate(()=>state.last_combat.kind),'Area bombardment');assert.equal(await p.locator('.hex.combat-choice').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 console.log('Weapons: 320/390/1440 layout, tank ammo/repair, Commander recon/artillery, fog bombardment and real server actions passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
