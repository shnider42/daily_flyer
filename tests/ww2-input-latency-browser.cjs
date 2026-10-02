/* Input-to-render measurements on representative maps, with CPU throttling.
   Timings are local comparisons, not claims about a physical iPhone or Render. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-input-latency-'),base='http://127.0.0.1:8142';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8142','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'db.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/tmp/dsl-chromium153',args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 if(process.env.WW2_BASELINE_REF){
  const assets=new Map();
  await p.route('**/assets/**',route=>{
   const file=new URL(route.request().url()).pathname.slice('/assets/'.length);
   if(!/\.(js|css)$/.test(file))return route.continue();
   if(!assets.has(file)){try{assets.set(file,cp.execFileSync('git',['show',`${process.env.WW2_BASELINE_REF}:ww2_tactics/static/${file}`],{stdio:['ignore','pipe','ignore']}));}catch{assets.set(file,null);}}
   const body=assets.get(file);return body?route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':'text/css'}):route.continue();
  });
 }
 await p.goto(base);await p.waitForFunction(()=>scenarios.length);await p.evaluate(()=>{refresh=async()=>{};});
 const cdp=await p.context().newCDPSession(p),reports=[];
 for(const scenario of (process.env.WW2_LATENCY_MAPS||'village,midway,tidal_gate,fubar').split(',')){
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  await p.evaluate(async scenario=>{remember(await api('/api/match',{scenario,ruleset:'dsl',opponent:'computer'}));state=await apiWithSession(session);render();},scenario);
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.WW2_CPU_RATE||4)});
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  const selection=await p.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),own=state.units.filter(u=>u.side===state.side&&u.hp>0&&!u.carrier_id&&!u.reserve),samples=[];
   const units=['squad','scout','commander','tank','carrier','destroyer','battleship','amphibious','fighter','sniper','leader'].map(k=>own.find(u=>u.kind===k)).filter(Boolean);
   for(let i=0;i<16;i++){await frame();const u=units[i%units.length],t=performance.now();chooseUnit(u);const sync=performance.now()-t;await frame();await frame();samples.push({kind:u.kind,sync,paint:performance.now()-t});}
   const stats=k=>{const v=samples.slice(4).map(s=>s[k]).sort((a,b)=>a-b);return {median:+v[Math.floor(v.length/2)].toFixed(1),p95:+v.at(-1).toFixed(1)};};
   return {sync:stats('sync'),paint:stats('paint'),samples:samples.slice(4)};
  });
  const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(temp,scenario+'.cpuprofile'),JSON.stringify(profile));
  const hot=profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,8).map(n=>({fn:n.callFrame.functionName,file:n.callFrame.url.split('/').at(-1),line:n.callFrame.lineNumber,hits:n.hitCount}));
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  const move=await p.evaluate(async()=>{
   const u=state.units.find(u=>u.side===state.side&&state.legal[u.id]?.moves.some(m=>!m.threats));chooseUnit(u);const destination=state.legal[u.id].moves.find(m=>!m.threats),t=performance.now();
   await act({kind:'move',unit:u.id,pos:destination.pos});return {confirmed_ms:+(performance.now()-t).toFixed(1),position:state.units.find(v=>v.id===u.id).pos,expected:destination.pos};
  });assert.deepEqual(move.position,move.expected);
  reports.push({scenario,selection,move,hot});console.log(JSON.stringify(reports.at(-1)));
 }
 fs.writeFileSync(path.join(temp,'measurements.json'),JSON.stringify(reports,null,2));assert.deepEqual(errors,[]);console.log('Profiles and measurements:',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
