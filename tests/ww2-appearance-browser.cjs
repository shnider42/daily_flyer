/* Appearance must survive navigation without changing tactical information. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-appearance-')),base='http://127.0.0.1:8119';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8119','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
const errors=[];
async function palette(p){
 return p.locator('#map').evaluate(map=>[...map.querySelectorAll('*')].map(e=>{
  const c=getComputedStyle(e);return [e.tagName,e.getAttribute('class'),c.fill,c.stroke,c.opacity,c.filter];
 }));
}
async function darkSurfaces(p){
 const bright=await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{
  if(e.namespaceURI.includes('svg')||e.closest('svg,#mapWrap,.dad-unit-portrait,.team-key,.midway-air-group,.midway-recovery')||e.classList.contains('legend'))return false;
  if(!e.checkVisibility()||!e.getBoundingClientRect().width)return false;
  const c=getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number);
  return c&&c.length>=3&&(c[3]===undefined||c[3]>.7)&&Math.min(...c.slice(0,3))>165;
 }).map(e=>({node:e.tagName+'#'+e.id+'.'+e.className,text:e.textContent.slice(0,100),parent:e.parentElement.id,background:getComputedStyle(e).backgroundColor})));
 assert.deepEqual(bright,[],'No unthemed pale UI surfaces outside the tactical map');
 const unreadable=await p.evaluate(()=>{
  const rgb=c=>(c.match(/[\d.]+/g)||[]).map(Number),blend=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll('body *')].filter(e=>e.namespaceURI.includes('xhtml')&&e.checkVisibility()&&!e.closest('svg,#mapWrap,button:disabled,option')&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>{
   let bg=[23,30,27],chain=[];for(let n=e;n;n=n.parentElement)chain.unshift(n);
   for(const n of chain)bg=blend(rgb(getComputedStyle(n).backgroundColor),bg);
   const fg=blend(rgb(getComputedStyle(e).color),bg),a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   return {node:e.tagName+'#'+e.id,text:e.textContent.trim().slice(0,55),ratio:Math.round(ratio*100)/100};
  }).filter(e=>e.ratio<4.5);
 });
 assert.deepEqual(unreadable,[],'Visible UI text meets 4.5:1 contrast');
}
async function shot(p,name){await p.screenshot({path:path.join(temp,name+'.png'),fullPage:await p.locator('body').evaluate(e=>e.classList.contains('home-screen'))});}
async function setNight(p,dark){
 if(await p.locator('#appearanceToggle').getAttribute('aria-pressed')!==String(dark))await p.locator('#appearanceToggle').click();
 assert.equal(await p.locator('html').getAttribute('data-theme'),dark?'dark':'light');
}
async function start(p,scenario){
 await p.locator('#createSolo').click();
 await p.locator('#soloScenarioEdition').selectOption(scenario.startsWith('current:')?'current':'legacy');
 await p.locator('#soloScenario').selectOption(scenario);
 await p.locator('#startSolo').click();
 await p.waitForFunction(()=>state&&!busy&&!lobbyMode);
 await p.locator('#battleViewOpen').waitFor({state:'visible'});
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.hp>0&&!u.carrier_id&&!u.reserve)));
}
async function appearanceInBattle(p,name){
 await p.locator('#battleViewOpen').click();
 assert.equal(await p.locator('#battleViewSettings #appearanceToggle').count(),1);
 const before=await p.evaluate(()=>{window.appearanceMap=document.getElementById('map');return {state:JSON.stringify(state),selected,target,session:JSON.stringify(session)};});
 const colors=await palette(p),posts=[];
 const onRequest=r=>{if(r.method()!=='GET')posts.push(r.method()+' '+r.url());};p.on('request',onRequest);
 await setNight(p,false);
 assert.equal(JSON.stringify(await palette(p)),JSON.stringify(colors),'Day/night keeps every map terrain, unit, ownership and highlight color');
 await setNight(p,true);
 assert.equal(JSON.stringify(await palette(p)),JSON.stringify(colors));
 assert.deepEqual(await p.evaluate(()=>({state:JSON.stringify(state),selected,target,session:JSON.stringify(session)})),before,'Appearance does not change state, selection, target or session');
 assert.ok(await p.evaluate(()=>window.appearanceMap===document.getElementById('map')),'The map remains mounted');
 p.off('request',onRequest);assert.deepEqual(posts,[],'Appearance never submits a game action');
 await darkSurfaces(p);await shot(p,name+'-view');
 await p.locator('#battleViewSettingsClose').click();
 await darkSurfaces(p);await shot(p,name);
}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH;
 browser=await chromium.launch(executablePath?{executablePath,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote'],headless:true}:{headless:true});
 const context=await browser.newContext(),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('#scenarioPreview > polygon.hex').first().waitFor();
 assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
 for(const width of [1440,390,320,844]){
  await p.setViewportSize({width,height:width===844?390:1000});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Home fits '+width);
  await darkSurfaces(p);await shot(p,'home-'+width);
 }
 await p.setViewportSize({width:390,height:844});
 await p.locator('#commanderSignIn').click();await darkSurfaces(p);await shot(p,'commander');await p.locator('#closeCommander').click();
 await setNight(p,false);await p.reload();assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
 const other=await context.newPage();await other.goto(base+'/admin');
 assert.equal(await other.locator('html').getAttribute('data-theme'),'light');
 await setNight(p,true);await other.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await darkSurfaces(other);await shot(other,'admin');
 await other.locator('#appearanceToggle').click();await p.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await setNight(p,true);await other.close();
 for(const width of [1440,390]){
  await p.setViewportSize({width,height:900});
  for(const scenario of ['village','current:midway_2','current:britain_2']){
   if(!await p.locator('body').evaluate(e=>e.classList.contains('home-screen'))){await p.locator('#homeBattles').click();await p.locator('#game').waitFor({state:'hidden'});}
   await start(p,scenario);
   await appearanceInBattle(p,scenario.replace(':','-')+'-'+width);
   if(width===1440&&scenario==='village'){
    await p.locator('#battleViewOpen').click();await p.locator('#battleLayout').selectOption('panels');await p.locator('#battleViewSettingsClose').click();
    await appearanceInBattle(p,'command-center');
    await p.locator('#battleViewOpen').click();await p.locator('#battleLayout').selectOption('map-first');await p.locator('#battleViewSettingsClose').click();
   }
  }
 }
 const coop=await context.newPage();coop.on('pageerror',e=>errors.push(e.message));coop.on('dialog',d=>d.accept());await coop.goto(base);
 await coop.locator('#commanderSignIn').click();await coop.locator('#commanderRegisterMode').click();
 await coop.locator('#commanderName').fill('ThemeCommander');await coop.locator('#commanderPassword').fill('local-appearance-test-pass');await coop.locator('#commanderSubmit').click();await coop.locator('#commanderDialog').waitFor({state:'hidden'});
 await coop.locator('#createCoop').click();await darkSurfaces(coop);await coop.locator('#multiplayerName').fill('Night command');await coop.locator('#namedGameSubmit').click();await coop.locator('#coopRoom').waitFor({state:'visible'});
 for(const width of [1440,320]){await coop.setViewportSize({width,height:900});await darkSurfaces(coop);await shot(coop,'coop-room-'+width);assert.ok(await coop.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await coop.locator('#coopStart').click();await coop.waitForFunction(()=>state?.coop?.phase==='battle'&&!busy);await coop.locator('#coopQuick').click();await darkSurfaces(coop);await shot(coop,'team-orders');await coop.close();
 // A blocked storage API must not prevent initial appearance or its control.
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});
 const bp=await blocked.newPage();await bp.goto(base);await setNight(bp,false);assert.equal(await bp.locator('html').getAttribute('data-theme'),'light');
 await blocked.close();assert.deepEqual(errors,[]);
 console.log('PASS: dark surfaces, 320–1440 home, dialogs/admin, persistence/tabs/blocked storage, desktop/mobile and both battle layouts; tactical palette and game state unchanged.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
