const {tap}=require('./ww2-ui-helpers.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-combined-')),base='http://127.0.0.1:8102';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8102','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.db')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;
 browser=await chromium.launch({headless:true,executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')});
 const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(15000);
 await p.goto(base);await p.selectOption('#scenarioSelect','frontier');await tap(p,p.locator('#createSolo'));
 assert.equal(await p.locator('#soloScenario').inputValue(),'frontier');
 await tap(p,p.locator('#startSolo'));await p.waitForFunction(()=>state&&!busy&&state.dsl_expansion);
 assert.equal(await p.locator('#map .unit.us').count(),18);
 assert.ok(await p.locator('#map .fog-layer polygon').count()>0);
 assert.ok(await p.locator('#map .unit.de').count()<20);
 await tap(p,p.locator('#platoonFilters button[data-platoon="HQ"]'));
 await tap(p,p.locator('#roster button').filter({hasText:'Commander'}));
 assert.ok(await p.locator('#map .commander-star').count()>0);
 await tap(p,p.locator('#roster button').filter({hasText:/Paratroopers.*HQ7/}));
 assert.match(await p.locator('#mobileOrderToggle').textContent(),/Paratroopers/);
 await tap(p,p.locator('#airdrop'));assert.ok(await p.locator('#map .landing-zone').count()>0);
 await p.evaluate(()=>document.querySelector('#map .landing-zone').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 await p.waitForFunction(()=>!busy&&state.revision===1);
 assert.equal(await p.locator('#map .unit.us').count(),19);
 assert.equal(await p.locator('#map .landing-zone').count(),0);
 const stable=await p.evaluate(()=>{const m=$('mapWrap'),before=m.getBoundingClientRect().top;chooseUnit(state.units.find(u=>u.kind==='tank'&&u.side===state.side));return [before,m.getBoundingClientRect().top];});
 assert.ok(Math.abs(stable[0]-stable[1])<=1);
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:900});await p.waitForTimeout(200);
  for(const [kind,label,role] of [['scout','Recon team',/concealed/],['engineer','Engineers',/smoke and grenades/]]){
   const geometry=await p.evaluate(kind=>{const before=$('mapWrap').getBoundingClientRect().top;chooseUnit(state.units.find(u=>u.side===state.side&&u.kind===kind));return [before,$('mapWrap').getBoundingClientRect().top];},kind);
   if(width<1100){assert.ok(Math.abs(geometry[0]-geometry[1])<=1);assert.equal(await p.locator('.selected-unit-name').textContent(),label);assert.ok(await p.locator('.selected-unit-name').evaluate(e=>e.scrollWidth<=e.clientWidth));}
   assert.equal(await p.locator('#roster .active .roster-unit-name').textContent(),label);
   assert.match(await p.locator('#unitPurpose').textContent(),role);assert.equal(await p.locator('#unitPurpose').isVisible(),width>=1100);
   await p.waitForFunction(()=>document.querySelector('#map .unit.selected .unit-bitmap')?.classList.contains('bitmap-ready'));
   assert.match(await p.locator('#map .unit.selected .unit-bitmap').getAttribute('href'),new RegExp(kind+'-v1.webp'));
  }
  await p.screenshot({path:path.join(temp,`combined-${width}.png`),fullPage:true});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),JSON.stringify(await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='absolute').slice(0,15).map(e=>[e.tagName,e.id,e.className?.baseVal||e.className,e.getBoundingClientRect().width])}))));
  if(width<1100)assert.ok(await p.evaluate(()=>$('mobileOrderDock').getBoundingClientRect().top>=$('mapWrap').getBoundingClientRect().bottom));
  await p.screenshot({path:path.join(temp,`combined-${width}.png`),fullPage:true});
 }
 await tap(p,p.locator('#end'));await p.waitForFunction(()=>!busy&&playbackSession);
 await tap(p,p.locator('#pausePlayback'));assert.ok(await p.locator('#playbackMap .fog-layer').count()>0);
 await tap(p,p.locator('#skipPlayback'));
 await tap(p,p.locator('#saveButton'));await p.locator('#accessDialog').waitFor({state:'visible'});
 assert.match(await p.locator('#accessCode').inputValue(),/^SAVE-/);await tap(p,p.locator('#closeAccess'));
 await p.evaluate(async()=>{await rematchRequest({operation:'propose',scenario:'frontier',ruleset:'dsl',swap:true});if(playbackSession)stopPlayback();});
 await p.waitForFunction(()=>!busy&&state.side==='de');
 assert.equal(await p.evaluate(()=>state.units.filter(u=>u.side==='de'&&u.kind==='halftrack').length),2);
 assert.equal(await p.evaluate(()=>state.units.filter(u=>u.side==='de'&&u.kind==='paratrooper').length),0);
 assert.equal(await p.locator('#map .insignia-halftrack').count(),2);
 await p.setViewportSize({width:320,height:844});
 await tap(p,p.locator('#platoonFilters button[data-platoon="HQ"]'));
 await tap(p,p.locator('#roster button').filter({hasText:/Half-track section.*HQ7/}));
 await p.screenshot({path:path.join(temp,'halftrack-mobile.png'),fullPage:true});
 // Disposable local fixture: test real transport API, UI, checkpoint and movement.
 const code=await p.evaluate(()=>session.code);
 cp.execFileSync('python',['-c',`
import json,sqlite3,sys
from ww2_tactics.engine import initial
db=sqlite3.connect(sys.argv[1]);old=json.loads(db.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
s=initial('frontier','dsl');s.update(ready=True,turn='de',ai_side='us',revision=old['revision']+1,intel={})
s['battlefield']['map']=[['field']*24 for _ in range(24)];s['battlefield']['map'][5]=['road']*24;s['battlefield']['map'][5][7]='woods'
s['units']=[next(u for u in s['units'] if u['id']==uid) for uid in ['de18','de4','us13']]
for u,pos in zip(s['units'],[[5,5],[6,5],[22,22]]):u.update(pos=pos,reserve=False)
db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));db.commit()
`,path.join(temp,'game.db'),code]);
 await p.evaluate(async()=>{state=await api('/api/match/'+session.code);render();chooseUnit(state.units.find(u=>u.kind==='halftrack'));});
 assert.equal(await p.locator('#load').isVisible(),true);
 await tap(p,p.locator('#load'));assert.equal(await p.locator('.transport-choice').count(),1);
 await tap(p,p.locator('.transport-choice'));await p.waitForFunction(()=>!busy&&state.units.some(u=>u.carrier_id));
 assert.equal(await p.locator('#map .unit[data-unit-id="de4"]').count(),0);
 assert.equal(await p.locator('#map .passenger-marker').count(),1);
 assert.match(await p.locator('#unitPurpose').textContent(),/Carrying Engineers/);
 assert.match(await p.locator('#unload').textContent(),/1 infantry AP/);
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.id==='de4')));
 assert.match(await p.locator('#roster .active').textContent(),/Aboard/);
 assert.equal(await p.locator('#fire').isVisible(),false);
 await tap(p,p.locator('#viewTransport'));assert.match(await p.locator('#mobileOrderToggle').textContent(),/Half-track/);
 const save=await p.evaluate(async()=>api('/api/match/'+session.code+'/save',{revision:state.revision}));
 await p.reload();await tap(p,p.locator('.saved-session').first());await p.waitForFunction(()=>state&&!busy);
 assert.ok(await p.evaluate(()=>state.units.some(u=>u.carrier_id)));
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.kind==='halftrack')));
 await p.evaluate(async()=>act({kind:'move',unit:selected,pos:[6,5]}));
 assert.deepEqual(await p.evaluate(()=>state.units.find(u=>u.id==='de4').pos),[6,5]);
 await tap(p,p.locator('#unload'));
 await p.getByRole('button',{name:'Unload infantry at H6 · 1 infantry AP',exact:true}).click();
 await p.waitForFunction(()=>!busy&&!state.units.find(u=>u.id==='de4').carrier_id);
 assert.equal(await p.locator('#map .unit[data-unit-id="de4"]').count(),1);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id==='de4').ap),0);
 // Loading the checkpoint restores the still-embarked unit, not its newer position.
 await p.evaluate(async saveCode=>{remember(await api('/api/restore',{code:saveCode}));await refresh();},save.save_code);
 assert.ok(await p.evaluate(()=>state.units.find(u=>u.id==='de4').carrier_id));
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.kind==='halftrack')));
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:844});
  assert.equal(await p.locator('#unload').isVisible(),true);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width<1100)assert.ok(await p.evaluate(()=>{const r=$('orders');return r.scrollWidth<=r.clientWidth+1&&r.scrollHeight<=r.clientHeight+1;}));
  await p.screenshot({path:path.join(temp,`transport-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('Combined arms: mobile/desktop, reserve landing, stable map, fog replay, save passed. '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
