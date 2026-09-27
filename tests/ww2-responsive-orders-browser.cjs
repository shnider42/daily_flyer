const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-responsive-orders-')),base='http://127.0.0.1:8106';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8106','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;
 browser=await chromium.launch({executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process'),headless:true});
 const errors=[];
 async function page(old=false){
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  if(old)for(const file of ['game.js','terrain.js','unit-art.js','combined.js','play-ui.js']){
   const body=cp.execFileSync('git',['show',`f66243e56e54e035aadf7192687ba8665be20f52:ww2_tactics/static/${file}`],{encoding:'utf8'});
   await p.route(`**/assets/${file}`,route=>route.fulfill({contentType:'application/javascript',body}));
  }
  await p.goto(base);return p;
 }
 async function start(p,scenario){await p.locator('#scenarioSelect').selectOption(scenario);await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!lobbyMode);}
 // Opt-in historical benchmark; the regression suite itself only requires current code.
 const timings={};
 for(const old of process.env.WW2_COMPARE_BASELINE?[true,false]:[false]){
  const p=await page(old);await start(p,'frontier');
  timings[old?'before':'after']=await p.evaluate(()=>{
   const units=state.units.filter(u=>u.side===state.side&&u.hp>0&&!u.reserve),samples=[];
   for(let i=0;i<12;i++){const t=performance.now();chooseUnit(units[i%units.length]);samples.push(performance.now()-t);}
   samples.sort((a,b)=>a-b);return {median_ms:+samples[6].toFixed(1),slowest_ms:+samples.at(-1).toFixed(1)};
  });
  if(!old){
   const retained=await p.evaluate(()=>{const tile=$('map').querySelector('.hex'),art=$('map').querySelector('.terrain-art'),unit=$('map').querySelector('.unit-art');chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='leader'));return tile.isConnected&&art.isConnected&&unit.isConnected;});assert.ok(retained,'Selection retains terrain and unit artwork');
   await tap(p,p.locator('#simpleToggle'));
   await p.locator('#mobileBattleMenuClose').click();
   for(const [width,height] of [[390,844],[320,568],[844,390],[852,320]]){
    await p.setViewportSize({width,height});await p.waitForTimeout(80);
    const layout=await p.evaluate(()=>[...$('orders').querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.hidden).map(b=>({name:b.textContent,clip:b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1,bottom:b.getBoundingClientRect().bottom})));
    assert.ok(layout.every(b=>!b.clip&&b.bottom<=height),JSON.stringify({width,layout}));
    await p.screenshot({path:path.join(temp,`mobile-detailed-${width}.png`)});
   }
   await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(temp,'mobile-detailed.png')});
  }
  await p.close();
 }
 const p=await page();await start(p,'village');
 await tap(p,p.locator('#map .unit.us').first());
 assert.equal(await p.locator('#dig .action-purpose').textContent(),'Extra cover');
 const original=await p.evaluate(()=>JSON.stringify(state.units));
 await tap(p,p.locator('#map .hex.move').first());await p.waitForFunction(()=>!busy&&state.revision===1);
 const moved=await p.evaluate(()=>JSON.stringify(state.units));assert.notEqual(moved,original);
 await p.locator('#undoOrder').click();await p.waitForFunction(()=>!busy&&state.revision===2);assert.equal(await p.evaluate(()=>JSON.stringify(state.units)),original);
 await p.reload();await p.locator('.saved-session').first().click();await p.waitForFunction(()=>state&&!busy);
 await p.locator('#redoOrder').click();await p.waitForFunction(()=>!busy&&state.revision===3);assert.equal(await p.evaluate(()=>JSON.stringify(state.units)),moved);
 await p.close();
 const desktop=await browser.newPage({viewport:{width:1440,height:1000}});await desktop.goto(base);await start(desktop,'village');
 await desktop.locator('#map .unit.us').first().click();await desktop.locator('#dig').hover();
 await desktop.locator('#battleTooltip').waitFor({state:'visible'});assert.match(await desktop.locator('#battleTooltip').textContent(),/Extra cover/);
 await desktop.locator('#simpleToggle').click();await desktop.locator('#dig').hover();assert.match(await desktop.locator('#battleTooltip').textContent(),/Enemy hit roll \+1/);
 await desktop.screenshot({path:path.join(temp,'desktop-action-help.png')});
 await desktop.locator('#map .unit.us').first().hover();assert.match(await desktop.locator('#battleTooltip').textContent(),/strength/);
 await desktop.locator('#map > .hex.woods').first().hover();assert.match(await desktop.locator('#battleTooltip').textContent(),/2 AP/);assert.match(await desktop.locator('#battleTooltip').textContent(),/Cover adds \+1/);
 await desktop.screenshot({path:path.join(temp,'desktop-terrain-help.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({timings,screenshots:temp}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
