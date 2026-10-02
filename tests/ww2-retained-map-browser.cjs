/* Authoritative snapshots must reconcile units/fog, not retain hidden enemies. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-retained-map-'),base='http://127.0.0.1:8151';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8151','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of [true,false]){
  const p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(base);await p.waitForFunction(()=>scenarios.length);
  await p.evaluate(async()=>{refresh=async()=>{};remember(await api('/api/match',{scenario:'fubar',ruleset:'dsl',opponent:'computer'}));state=await apiWithSession(session);render();});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const result=await p.evaluate(()=>{
   const svg=$('map'),first=svg.querySelector('.unit'),portrait=first.querySelector('.unit-art'),fog=svg.querySelector('.fog-layer'),fogTile=fog.firstElementChild;
   const selectedId=first.dataset.unitId;
   state=structuredClone(state);render();
   const retained=first.isConnected&&portrait?.isConnected&&fog.isConnected&&fogTile.isConnected&&svg._counters.get(selectedId)===first;
   const removed=state.units.find(u=>u.id===selectedId);state=structuredClone(state);state.units=state.units.filter(u=>u.id!==selectedId);render();
   const gone=!svg._counters.has(selectedId)&&!svg.querySelector(`.unit[data-unit-id="${selectedId}"]`);
   state=structuredClone(state);state.units.push(removed);render();
   const restored=!!svg._counters.get(selectedId)&&svg._counters.get(selectedId)!==first;
   for(let i=0;i<15;i++){state=structuredClone(state);render();}
   return {retained,gone,restored,counters:svg.querySelectorAll('.unit').length,unique:new Set([...svg.querySelectorAll('.unit')].map(g=>g.dataset.unitId)).size};
  });
  assert.ok(result.retained,'Unchanged authoritative snapshots retain counters, art and fog');assert.ok(result.gone&&result.restored,'Authoritative removals and reappearances reconcile');assert.equal(result.counters,result.unique);
  for(const layer of ['air','surface','both'])for(const group of ['all','A','HQ']){
   const result=await p.evaluate(({layer,group})=>{
    document.querySelector(`#fubarLayers [data-layer="${layer}"]`).click();platoonFilter=group;selected=null;target=null;render();
    const snapshot=window.signalSnapshot?.(state)||state,seen=new Set((layer==='air'?snapshot.visible_air_hexes:snapshot.visible_hexes).map(p=>p.join(','))),expected=[];
    state.map.forEach((row,y)=>row.forEach((_,x)=>{if(!seen.has(`${x},${y}`)){const [cx,cy]=center(x,y);expected.push(Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' '));}}));
    const actual=[...$('map').querySelectorAll('.fog-layer polygon')].map(p=>p.getAttribute('points'));
    const units=snapshot.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id).map(u=>u.id);
    return {expected:expected.sort(),actual:actual.sort(),units:units.sort(),counters:[...$('map').querySelectorAll('.unit')].map(g=>g.dataset.unitId).sort()};
   },{layer,group});assert.deepEqual(result.actual,result.expected,`Exact fog: ${layer}/${group}`);assert.deepEqual(result.counters,result.units,`Exact public counters: ${layer}/${group}`);
  }
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('Retained-map regression passed: fresh snapshots, removals/reappearance, exact air/surface/platoon fog and no duplicate counters on phone/desktop.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
