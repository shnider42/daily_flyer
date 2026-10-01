const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-capabilities-')),base='http://127.0.0.1:8121';
const fixtures=JSON.parse(cp.execFileSync('python',['-c',`
import copy,json
from ww2_tactics.engine import initial,options,battlefield
from ww2_tactics.visibility import public_state
from ww2_tactics.campaigns import unit
from ww2_tactics import weapons
def publish(s):
 s=copy.deepcopy(s);b=battlefield(s)
 s.update(code='UI-'+b['id'],side='us',map=b['map'],scenario={k:v for k,v in b.items() if k!='map'})
 s['legal']={u['id']:options(s,u) for u in s['units'] if u['side']=='us'}
 return public_state(s,'us')
result={}
for name in ['village','orchard','stonebridge','riverfront','frontier','midway','stalingrad','britain','omaha','carentan','market_garden','tidal_gate']:
 s=initial(name,'dsl');s['ready']=True;result[name]=publish(s)
s=initial('market_garden','dsl');s.update(ready=True,buildings={},building_intel={})
s['battlefield']['map']=[['field']*22 for _ in range(28)]
s['units']=[unit(side,kind,pos,'A',i) for i,(side,kind,pos) in enumerate([
 ('us','engineer',[5,19]),('us','tank',[6,19]),('us','commander',[8,19]),('us','sniper',[8,20]),('us','scout',[9,20]),
 ('de','squad',[15,1])])]
s['units'][2]['cooldowns']={'artillery':3}
weapons.initialize(s)
result['fogA']=publish(s)
s['units'][-1]['pos']=[17,2];result['fogB']=publish(s)
s['fog_of_war']=False;s['units'][0].update(ap=0,smoke=0,grenades=0,repair_kits=0)
result['spent']=publish(s)
s['turn']='de';result['waiting']=publish(s)
s=initial('village','classic');s['ready']=True;result['classic']=publish(s)
print(json.dumps(result))
`],{maxBuffer:16*1024*1024}).toString());
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8121','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'games.sqlite3')},stdio:'ignore'});
let browser,current=null;const errors=[],posts=[];
async function load(p,name,id){current=structuredClone(fixtures[name]);await p.evaluate(({s,id})=>{document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=false;barrageMode=false;combatMode=null;target=null;state=s;render();chooseUnit(state.units.find(u=>u.id===(id||s.units.find(u=>u.side===s.side).id)));},{s:current,id});}
const summary=p=>p.locator('#orders [data-order-id]:visible').evaluateAll(ns=>ns.map(n=>[n.dataset.orderId,n.textContent,n.getAttribute('aria-disabled')]));
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/qb-chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']});
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/match/*',r=>current?r.request().method()==='GET'?r.fulfill({json:current}):(posts.push(r.request().postData()),r.fulfill({status:400,json:{error:'Unexpected order'}})):r.continue());
 await p.goto(base);await tap(p,p.locator('#createSolo'));await tap(p,p.locator('#startSolo'));await p.waitForFunction(()=>state&&!busy&&!polling);
 // Freeze polling while swapping deterministic public snapshots. Actual order
 // requests still run through the normal API and are trapped above if issued.
 await p.evaluate(()=>{refresh=async()=>{};});
 // Every current map and unit role uses the same discovery controls.
 for(const name of Object.keys(fixtures).filter(n=>!['fogA','fogB','spent','waiting','classic'].includes(n))){
  await load(p,name);
  const failures=await p.evaluate(()=>{
   const bad=[];
   for(const u of state.units.filter(u=>u.side===state.side)){
    selected=u.id;render();const expected=unitOrderCapabilities(u);
    const shown=[...document.querySelectorAll('#orders [data-order-id]')].filter(n=>!n.hidden&&!n.closest('[hidden]')).map(n=>n.dataset.orderId);
    if(expected.some(id=>!shown.includes(id))||new Set(shown).size!==shown.length)bad.push({unit:u.kind,expected,shown});
   }
   return bad;
  });assert.deepEqual(failures,[],name);
 }
 // Same public view, different hidden enemy position: identical choices/reasons.
 await load(p,'fogA','us-A-0');const a=await summary(p);
 await load(p,'fogB','us-A-0');assert.deepEqual(await summary(p),a);
 assert.equal(await p.evaluate(()=>state.units.some(u=>u.side==='de')),false);
 assert.ok(await p.locator('#repairTank').isDisabled());
 await p.locator('#repairTank').scrollIntoViewIfNeeded();await p.waitForTimeout(100);await p.locator('#repairTank').hover();await p.waitForFunction(()=>!document.getElementById('battleTooltip').hidden);
 assert.match(await p.locator('#battleTooltip').textContent(),/Unavailable: Needs adjacent damaged tank/);
 // Keyboard focus reaches the explanation; an unavailable click cannot POST.
 await p.locator('#repairTank').focus();await p.keyboard.press('Enter');assert.equal(posts.length,0);
 assert.match(await p.locator('#hint').textContent(),/Needs adjacent damaged tank/);
 await load(p,'spent','us-A-0');
 assert.deepEqual((await summary(p)).map(r=>r[0]),a.map(r=>r[0]));
 assert.match(await p.locator('#smoke').textContent(),/No smoke left/);
 assert.match(await p.locator('#repairTank').textContent(),/No repair kits left/);
 assert.match(await p.locator('#dig').textContent(),/Needs 2 AP/);
 await load(p,'waiting','us-A-0');assert.ok((await summary(p)).every(r=>r[2]==='true'));
 await load(p,'classic');assert.ok(await p.locator('#dig').isEnabled());assert.equal(await p.locator('#dig').getAttribute('aria-disabled'),null);
 // Map zoom anchors the same hex under the pointer; selection in view is stable.
 await load(p,'fogA','us-A-2');await p.evaluate(()=>focusMapUnit(state.units.find(u=>u.id===selected)));
 const view=await p.locator('#mapWrap').boundingBox(),point={x:view.x+view.width/2,y:view.y+view.height/2};
 const mapPoint=()=>p.evaluate(point=>{const m=document.getElementById('map').getScreenCTM().inverse();const pt=new DOMPoint(point.x,point.y).matrixTransform(m);return [pt.x,pt.y];},point);
 await p.locator('#desktopFit').click();for(let i=0;i<4;i++)await p.locator('#desktopZoomIn').click();await p.evaluate(()=>focusMapUnit(state.units.find(u=>u.id===selected)));
 const before=await mapPoint();await p.mouse.move(point.x,point.y);await p.mouse.wheel(0,-80);await p.waitForTimeout(100);const after=await mapPoint();
 assert.ok(Math.hypot(before[0]-after[0],before[1]-after[1])<5,JSON.stringify({before,after}));
 const scroll=()=>p.locator('#mapWrap').evaluate(n=>[n.scrollLeft,n.scrollTop]);const oldScroll=await scroll();await p.evaluate(()=>chooseUnit(state.units.find(u=>u.id===selected)));assert.deepEqual(await scroll(),oldScroll);
 const width=view.width;await p.locator('#desktopExpand').click();await p.waitForFunction(()=>document.querySelector('.desktop-layout').classList.contains('map-expanded'));await p.waitForTimeout(100);
 assert.ok((await p.locator('#mapWrap').boundingBox()).width>width+100);assert.ok(await p.locator('#fieldRecon').isVisible());assert.ok(await p.locator('#roster').isHidden());
 await p.screenshot({path:path.join(temp,'desktop-wide.png')});await p.locator('#desktopExpand').click();
 await p.locator('#desktopFit').click();assert.equal(await p.locator('#desktopZoomValue').textContent(),'100%');
 // Mobile: all orders visible, no map jumps, no text clipping, preferences survive.
 for(const width of [320,390]){
  await p.setViewportSize({width,height:844});await load(p,'fogA','us-A-2');
  await p.waitForFunction(()=>!!document.getElementById('mobileBattleScreen'));
  const rect=await p.locator('#mapWrap').boundingBox();
  for(const id of ['us-A-0','us-A-1','us-A-2','us-A-3','us-A-4']){
   await p.evaluate(id=>chooseUnit(state.units.find(u=>u.id===id)),id);const next=await p.locator('#mapWrap').boundingBox();
   assert.equal(next.y,rect.y);assert.equal(next.height,rect.height);
   const clipped=await p.locator('#orders [data-order-id]:visible').evaluateAll(ns=>ns.filter(n=>n.scrollHeight>n.clientHeight+2||n.scrollWidth>n.clientWidth+2).map(n=>n.id));assert.deepEqual(clipped,[],String(width)+id);
   const buttons=await p.locator('#orders [data-order-id]:visible').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().bottom));assert.ok(buttons.every(bottom=>bottom<=845));
  }
  await p.evaluate(()=>chooseUnit(state.units.find(u=>u.id==='us-A-2')));await p.screenshot({path:path.join(temp,'mobile-'+width+'.png')});
  await tap(p,p.locator('#simpleToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  assert.match(await p.locator('#artillery').textContent(),/Ready R3/);await tap(p,p.locator('#simpleToggle'));await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 }
 assert.equal(posts.length,0);assert.deepEqual(errors,[]);console.log('Capabilities on 12 maps, fog invariance, unavailable click/keyboard guards, desktop zoom/selection/widen, phone stability and contrast passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
