const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-experimental-desktop-')),base='http://127.0.0.1:8133';
const fixtures=JSON.parse(cp.execFileSync('python',['-c',`
import json
from ww2_tactics.engine import initial,options,battlefield
from ww2_tactics.visibility import public_state
result={}
for name in ['village','midway','britain','market_garden','tidal_gate','iron_lantern']:
 s=initial(name,'dsl');b=battlefield(s)
 s.update(ready=True,code='UI-'+name,side='us',map=b['map'],scenario={k:v for k,v in b.items() if k!='map'})
 s['legal']={u['id']:options(s,u) for u in s['units'] if u['side']=='us'}
 result[name]=public_state(s,'us')
print(json.dumps(result))
`],{maxBuffer:24*1024*1024}).toString());
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8133','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'games.sqlite3')},stdio:'ignore'});
let browser,current=null;const errors=[],posts=[];
async function settle(p){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function load(p,name){current=structuredClone(fixtures[name]);await p.evaluate(s=>{document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=barrageMode=false;combatMode=target=null;state=s;render();},current);await settle(p);}
async function openPrefs(p){if(!await p.locator('#battleViewSettings').evaluate(d=>d.open))await p.locator('#battleViewOpen').click();}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.route('**/api/match/*',r=>current?r.request().method()==='GET'?r.fulfill({json:current}):(posts.push(r.request().postData()),r.fulfill({status:400,json:{error:'Unexpected order'}})):r.continue());
 await p.goto(base);await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!polling);
 await p.evaluate(()=>{refresh=async()=>{};ww2ViewMode.set('experimental');});await settle(p);
 for(const [width,height] of [[1280,720],[1100,620],[1366,668],[1920,1080]]){
  await p.setViewportSize({width,height});await settle(p);
  for(const name of Object.keys(fixtures)){
   await load(p,name);
   const failures=await p.evaluate(()=>{
    const bad=[],initial=$('mapWrap').getBoundingClientRect();
    for(const u of state.units.filter(u=>u.side===state.side&&u.hp>0)){
     chooseUnit(u);const r=$('mapWrap').getBoundingClientRect();if(r.y!==initial.y||r.height!==initial.height)bad.push({unit:u.kind,jump:true});
     const bs=[...$('orders').querySelectorAll('[data-order-id]')].filter(b=>!b.hidden&&!b.closest('[hidden]'));
     if(bs.length!==unitOrderCapabilities(u).length)bad.push({unit:u.kind,count:bs.length,expected:unitOrderCapabilities(u).length});
     for(const b of bs){const rect=b.getBoundingClientRect();if(rect.bottom>innerHeight||rect.left<0||rect.right>innerWidth||b.scrollWidth>b.clientWidth+2||b.scrollHeight>b.clientHeight+2)bad.push({unit:u.kind,button:b.dataset.orderId,clip:true});
      for(const n of b.querySelectorAll('.action-name,.action-cost,.action-purpose,.action-reason'))if(n.getClientRects().length){const t=n.getBoundingClientRect();if(t.bottom>rect.bottom+1||n.scrollWidth>n.clientWidth+1)bad.push({unit:u.kind,button:b.dataset.orderId,text:n.textContent,clip:true});}
     }
    }
    return bad;
   });assert.deepEqual(failures,[],JSON.stringify({width,height,name}));
   const map=await p.locator('#mapWrap').boundingBox();assert.equal(map.width,width);assert.ok(map.height>=height*.60,JSON.stringify({width,height,name,map}));
   assert.ok((await p.locator('#end').boundingBox()).y>=map.y+map.height);
   if(name==='iron_lantern'){await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='commander')));await p.mouse.move(5,5);await p.screenshot({path:path.join(temp,`battle-${width}.png`)});}
  }
 }
 // Larger text uses a roomier, still complete command bar.
 await p.setViewportSize({width:1100,height:620});await load(p,'iron_lantern');await openPrefs(p);await p.locator('#dadModeToggle').click();await p.keyboard.press('Escape');await settle(p);
 const dadClips=await p.evaluate(()=>{const bad=[];for(const u of state.units.filter(u=>u.side===state.side&&u.hp>0)){chooseUnit(u);for(const b of $('orders').querySelectorAll('[data-order-id]')){if(b.hidden)continue;const r=b.getBoundingClientRect();if(b.scrollWidth>b.clientWidth+2||b.scrollHeight>b.clientHeight+2||r.bottom>innerHeight)bad.push([u.kind,b.dataset.orderId]);}}return bad;});assert.deepEqual(dadClips,[]);
 await p.screenshot({path:path.join(temp,'dad-1100.png')});await openPrefs(p);await p.locator('#dadModeToggle').click();await p.keyboard.press('Escape');
 // Actual controls are moved, not cloned; dialogs leave the map rectangle alone.
 await p.setViewportSize({width:1280,height:720});await load(p,'iron_lantern');await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='commander')));
 const rect=await p.locator('#mapWrap').boundingBox();
 await p.locator('#experimentalRosterOpen').click();await p.locator('#roster button').first().click();assert.equal(await p.locator('#experimentalRoster').evaluate(d=>d.open),false);assert.deepEqual(await p.locator('#mapWrap').boundingBox(),rect);
 await p.locator('#experimentalUnitOpen').click();assert.ok(await p.locator('#unitMechanics').isVisible());await p.locator('#experimentalUnitDetailsClose').click();
 await p.locator('#battleMission').click();assert.ok(await p.locator('#missionGoal').isVisible());await p.locator('#missionClose').click();
 await p.locator('#experimentalBattleOpen').click();await p.locator('#battleOptions').evaluate(d=>d.open=true);assert.ok(await p.locator('#transferButton').isVisible());await p.locator('#experimentalBattleClose').click();
 await openPrefs(p);assert.ok(await p.locator('#simpleToggle').isVisible());assert.ok(await p.locator('#unitStyleToggle').isVisible());await p.keyboard.press('Escape');
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='commander')));await p.locator('#radioUpdate').hover();await p.locator('#battleTooltip').waitFor({state:'visible'});assert.match(await p.locator('#battleTooltip').textContent(),/No recent reports/);
 await p.locator('#radioUpdate').focus();await p.keyboard.press('Enter');assert.equal(posts.length,0);
 // Enter/leave both desktop layouts and the existing phone layout repeatedly.
 for(const mode of ['on','off','experimental']){await p.evaluate(mode=>ww2ViewMode.set(mode),mode);await settle(p);assert.equal(await p.locator('#experimentalDesktopScreen').count(),mode==='experimental'?1:0);if(mode==='experimental')assert.equal(await p.locator('#battleMission>span').first().textContent(),await p.evaluate(()=>ww2Briefing.mission(state).compact));for(const id of ['orders','end','roster','playTools','battleMission','mapWrap'])assert.equal(await p.locator('#'+id).count(),1);}
 for(const [width,height] of [[390,844],[1440,1000],[1024,668],[1280,720]]){await p.setViewportSize({width,height});await settle(p);await p.waitForFunction(()=>innerWidth>=1100?!!window.ww2ExperimentalDesktop?.active:ww2Mobile.active&&!ww2ExperimentalDesktop.active);for(const id of ['orders','end','roster','playTools','battleMission','mapWrap'])assert.equal(await p.locator('#'+id).count(),1);}
 const timing=await p.evaluate(()=>{const ts=[],units=state.units.filter(u=>u.side===state.side&&u.hp>0);for(let i=0;i<12;i++){const t=performance.now();chooseUnit(units[i%units.length]);ts.push(performance.now()-t);}ts.sort((a,b)=>a-b);return {median:ts[6],max:ts.at(-1)};});
 assert.equal(posts.length,0);
 // Fresh real game: click a move, undo/redo, play a computer turn, return home.
 current=null;await p.unroute('**/api/match/*');await p.goto(base);await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!polling&&ww2ExperimentalDesktop.active);
 await p.locator('#experimentalBattleOpen').click();await p.locator('#battleOptions').evaluate(d=>d.open=true);await p.locator('#saveButton').click();await p.locator('#accessDialog').waitFor({state:'visible'});assert.match(await p.locator('#accessCode').inputValue(),/^SAVE-/);await p.locator('#closeAccess').click();await p.locator('#experimentalBattleClose').click();
 await p.locator('#map .unit.us').first().click();await p.locator('#desktopFit').click();
 const original=await p.evaluate(()=>({units:JSON.stringify(state.units),revision:state.revision}));
 await p.locator('#map .hex.move').first().click();await p.waitForFunction(r=>state.revision>r&&!busy,original.revision);
 const moved=await p.evaluate(()=>JSON.stringify(state.units));assert.notEqual(moved,original.units);
 if(await p.locator('#undoOrder').isEnabled()){await p.locator('#undoOrder').click();await p.waitForFunction(()=>!busy&&state.order_history.can_redo);assert.equal(await p.evaluate(()=>JSON.stringify(state.units)),original.units);await p.locator('#redoOrder').click();await p.waitForFunction(()=>!busy&&!state.order_history.can_redo);assert.equal(await p.evaluate(()=>JSON.stringify(state.units)),moved);}
 const liveRect=await p.locator('#mapWrap').boundingBox();await p.locator('#end').click();await p.locator('#playbackPanel').waitFor({state:'visible'});await p.locator('#pausePlayback').click();
 assert.equal(await p.locator('#experimentalCommandBar').isVisible(),false);assert.equal(await p.locator('#playbackMap').count(),1);assert.deepEqual(await p.locator('#mapWrap').boundingBox(),liveRect);
 await p.screenshot({path:path.join(temp,'replay.png')});await p.locator('#skipPlayback').click();await p.waitForFunction(()=>!playbackSession);assert.ok(await p.locator('#experimentalCommandBar').isVisible());
 await p.locator('#homeBattles').click();await p.locator('#game').waitFor({state:'hidden'});assert.equal(await p.locator('#experimentalDesktopScreen').count(),0);assert.ok(await p.locator('body>header').isVisible());
 await p.locator('#sessionList .saved-session').first().click();await p.waitForFunction(()=>ww2ExperimentalDesktop.active&&!busy);await p.reload();assert.equal(await p.evaluate(()=>ww2ViewMode.mode),'experimental');
 assert.deepEqual(errors,[]);console.log('Full-width experimental desktop: land, sea, air, all friendly roles, stable map, Dad mode, tooltips, dialogs, mode/breakpoint restoration, real movement and computer replay passed.',JSON.stringify({timing,screenshots:temp}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
