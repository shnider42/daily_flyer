/* Mobile Chromium 4x CPU samples; frame scheduling, not physical iPhone presentation. */
const root=process.argv[2]||process.cwd();
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/dsl-browser-'),base='http://127.0.0.1:8150';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8150','--workers','1','--threads','4'],{cwd:root,env:{...process.env,WW2_DB_PATH:path.join(temp,'db.sqlite')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(base);await p.waitForFunction(()=>scenarios.length);await p.evaluate(()=>refresh=async()=>{});
 const cdp=await p.context().newCDPSession(p),reports=[];
 for(const scenario of ['village','fubar']){
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  await p.evaluate(async scenario=>{remember(await api('/api/match',{scenario,ruleset:'dsl',opponent:'computer'}));state=await apiWithSession(session);render();},scenario);
  await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(100);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const result=await p.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),own=state.units.filter(u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id),samples=[],renders=[];
   const units=['squad','scout','commander','tank','fighter','leader'].map(k=>own.find(u=>u.kind===k)).filter(Boolean);
   for(let i=0;i<16;i++){await frame();const t=performance.now();chooseUnit(units[i%units.length]);const js=performance.now()-t;await frame();await frame();samples.push({js,frames:performance.now()-t});}
   for(let i=0;i<5;i++){await frame();state=structuredClone(state);const t=performance.now();render();const js=performance.now()-t;await frame();await frame();renders.push({js,frames:performance.now()-t});}
   const median=(a,k)=>a.map(x=>x[k]).sort((a,b)=>a-b)[Math.floor(a.length/2)];
   return {selection_js:median(samples.slice(4),'js'),selection_frames:median(samples.slice(4),'frames'),fresh_js:median(renders,'js'),fresh_frames:median(renders,'frames'),nodes:$('map').querySelectorAll('*').length};
  });reports.push({scenario,...result});console.log(JSON.stringify(reports.at(-1)));
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(root+'/browser-results.json',JSON.stringify(reports,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
