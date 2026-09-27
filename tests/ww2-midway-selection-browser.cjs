const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-midway-selection-')),base='http://127.0.0.1:8107';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8107','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;
 browser=await chromium.launch({executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process'),headless:true});
 const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
 if(process.env.WW2_SELECTION_BASELINE)for(const file of ['game.js','naval.js','naval.css','combined.js','terrain.js','play-ui.js']){
  const body=cp.execFileSync('git',['show',`6de0d58c288c819617c62c8f2f8612fc29c89e17:ww2_tactics/static/${file}`],{encoding:'utf8'});
  await p.route(`**/assets/${file}`,route=>route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/javascript',body}));
 }
 await p.goto(base);await p.locator('#scenarioSelect').selectOption('midway');await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&!lobbyMode);
 const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.WW2_CPU_RATE||4)});
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const timing=await p.evaluate(async()=>{
  const units=['carrier','destroyer','battleship','amphibious'].map(kind=>state.units.find(u=>u.side===state.side&&u.kind===kind)),samples=[];
  for(let i=0;i<16;i++){
   await new Promise(requestAnimationFrame);
   const t=performance.now();chooseUnit(units[i%units.length]);const sync=performance.now()-t;
   const frame=await new Promise(resolve=>requestAnimationFrame(()=>resolve(performance.now()-t)));
   samples.push({sync,frame,kind:units[i%units.length].kind,platoon:units[i%units.length].platoon});
  }
  const median=key=>+samples.map(s=>s[key]).sort((a,b)=>a-b)[8].toFixed(1);
  return {selection_median_ms:median('sync'),next_frame_median_ms:median('frame'),by_unit:samples.slice(8).map(s=>({...s,sync:+s.sync.toFixed(1),frame:+s.frame.toFixed(1)}))};
 });
 const {profile}=await cdp.send('Profiler.stop');
 const hottest=profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,12).map(n=>({function:n.callFrame.functionName,line:n.callFrame.lineNumber,hits:n.hitCount}));
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
 if(!process.env.WW2_PROFILE_ONLY){
  const result=await p.evaluate(()=>{
   const svg=$('map'),zone=svg.querySelector('.sea-control'),fog=svg.querySelector('.fog-layer'),art=svg.querySelector('.terrain-art'),units=state.units.filter(u=>u.side===state.side&&u.hp>0),before=$('mapWrap').getBoundingClientRect();
   const observer=new MutationObserver(()=>{});observer.observe(svg,{subtree:true,attributes:true,childList:true});
   const unit=units.find(u=>u.kind==='destroyer');chooseUnit(unit);
   const records=observer.takeRecords();observer.disconnect();
   const changedHexes=new Set(records.filter(r=>r.target.matches?.('.hex')).map(r=>r.target));
   const expected=state.legal[unit.id].moves.map(m=>m.pos.join(',')).sort(),actual=[...svg.querySelectorAll('.hex.move')].map(t=>`${t.dataset.x},${t.dataset.y}`).sort();
   return {zone:zone.isConnected,fog:fog.isConnected,art:art.isConnected,changedHexes:changedHexes.size,expected,actual,top:[$('mapWrap').getBoundingClientRect().top,before.top]};
  });
  assert.ok(result.zone&&result.fog&&result.art,'Retain static Midway overlays');assert.ok(result.changedHexes<=12,JSON.stringify(result));assert.deepEqual(result.actual,result.expected);assert.equal(result.top[0],result.top[1]);
  await tap(p,p.locator('#terrainToggle'));await tap(p,p.locator('#mobileBattleMenuClose'));
  await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier')));
  await tap(p,p.locator('#recon'));assert.ok(await p.locator('#map .recon-choice').count()>100);await tap(p,p.locator('#recon'));assert.equal(await p.locator('#map .recon-choice').count(),0);
  await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='destroyer')));
  await tap(p,p.locator('#smoke'));assert.equal(await p.locator('#map .smoke-choice').count(),1);assert.equal(await p.locator('#map .hex.move').count(),0);await tap(p,p.locator('#smoke'));
  const planned=await p.evaluate(()=>({unit:selected,pos:state.legal[selected].moves[0].pos,revision:state.revision}));
  await p.locator(`#map .hex.move[data-x="${planned.pos[0]}"][data-y="${planned.pos[1]}"]`).dispatchEvent('click');
  await p.waitForFunction(r=>!busy&&state.revision>r,planned.revision);
  assert.deepEqual(await p.evaluate(id=>state.units.find(u=>u.id===id).pos,planned.unit),planned.pos);
  await tap(p,p.locator('#terrainToggle'));await tap(p,p.locator('#mobileBattleMenuClose'));await p.screenshot({path:path.join(temp,'midway.png')});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({timing,hottest,screenshots:temp}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
