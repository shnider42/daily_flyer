/* Smooth public counter motion, render interruptions, shared layers and replay. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-motion-'),base='http://127.0.0.1:8194';
const server=cp.spawn('python',['-c',`import os
from ww2_web import create_app
create_app(os.environ['WW2_DB_PATH'],background_ai=False).run(host='127.0.0.1',port=8194,threaded=True)
`],{env:{...process.env,WW2_DB_PATH:path.join(temp,'game.sqlite')},stdio:'ignore'});
let browser;const errors=[];
async function prepare(mobile){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base);await page.waitForFunction(()=>scenarios.length>0&&window.ww2Motion);
 await page.evaluate(async()=>{
  refresh=async()=>{};
  remember(await api('/api/match',{scenario:'current:nightfall_beacon',ruleset:'dsl',opponent:'computer'}));
  state=await apiWithSession(session);render();
  window.motionTestId=state.units.find(u=>u.side===state.side&&u.kind==='transport_aircraft').id;
  window.motionPoint=(id,svg=$('map'),animated=true)=>{
   const g=svg.querySelector(`.unit[data-unit-id="${id}"]`),u=(svg.id==='playbackMap'?playbackSession.frames[playbackSession.index][playbackSession.phase].units:state.units).find(u=>u.id===id);
   const layer=animated?g.querySelector('.unit-motion')||g:g,matrix=layer.getScreenCTM(),[x,y]=center(...u.pos),point=new DOMPoint(x,y).matrixTransform(matrix);
   return [point.x,point.y];
  };
  const plane=state.units.find(u=>u.id===motionTestId),move=state.legal[plane.id].moves.find(m=>m.path?.length>1)||state.legal[plane.id].moves[0];
  chooseUnit(plane);focusMapUnit(plane);const start=motionPoint(plane.id),oldRevision=state.revision,oldAP=plane.ap;
  performance.clearResourceTimings();await act({kind:'move',unit:plane.id,pos:move.pos});
  const initial=motionPoint(plane.id),end=motionPoint(plane.id,$('map'),false),samples=[];
  for(let i=0;i<22;i++){await new Promise(requestAnimationFrame);samples.push(motionPoint(plane.id));}
  window.actualMotionResult={start,initial,end,samples,pos:state.units.find(u=>u.id===plane.id).pos,expectedPos:move.pos,ap:state.units.find(u=>u.id===plane.id).ap,expectedAP:oldAP-move.cost,revision:state.revision,oldRevision,extraFullGets:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/api/match/'+session.code)).length-1,busy};
  state=structuredClone(state);state.units.find(u=>u.id===motionTestId).pos=[12,18];state.revision++;render();
 });
 await page.waitForTimeout(450);
 await page.evaluate(()=>{chooseUnit(state.units.find(u=>u.id===motionTestId));focusMapUnit(state.units.find(u=>u.id===motionTestId));});
 return page;
}
function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of [false,true]){
  const page=await prepare(mobile);
  const live=await page.evaluate(()=>actualMotionResult);
  assert.deepEqual(live.pos,live.expectedPos);assert.equal(live.ap,live.expectedAP);assert.equal(live.revision,live.oldRevision+1);assert.equal(live.extraFullGets,0);assert.equal(live.busy,false,'Motion does not delay issuing the next authoritative order');
  assert.ok(live.samples.some(p=>distance(p,live.start)>1&&distance(p,live.end)>1),'Actual HTTP flight animates between confirmed endpoints');assert.ok(distance(live.samples.at(-1),live.end)<2);
  if(!mobile){await page.evaluate(()=>ww2Experience.setLayout('map-first'));await page.waitForTimeout(250);await page.evaluate(()=>focusMapUnit(state.units.find(u=>u.id===motionTestId)));}
  {
   const reportHeight=mobile?104:92;
   const report=await page.evaluate(async()=>{
    const frame=()=>new Promise(requestAnimationFrame),wrap=$('mapWrap'),height=()=>wrap.getBoundingClientRect().height,camera=()=>[wrap.scrollLeft,wrap.scrollTop];
    const start=height(),cameraBefore=camera(),counterBefore=motionPoint(motionTestId),mapWidthBefore=$('map').getBoundingClientRect().width;state=structuredClone(state);state.revision++;
    state.airlift_report={roll:1,landed:false,result:'The squad was lost before landing.',unit:state.units.find(u=>u.kind==='paratrooper').id,revision:state.revision,round:state.round};render();
    const initial=height(),openSamples=[],positions=[];for(let i=0;i<22;i++){await frame();openSamples.push(height());positions.push(motionPoint(motionTestId));}
    const final=height(),panelHeight=$('battleFeedback').getBoundingClientRect().height,text=$('battleFeedback').textContent,cameraAfter=camera();
    $('battleFeedback').querySelector('.battle-result-dismiss').click();const closeInitial=height(),closeSamples=[];for(let i=0;i<22;i++){await frame();closeSamples.push(height());positions.push(motionPoint(motionTestId));}
    return {start,initial,openSamples,final,panelHeight,text,cameraBefore,cameraAfter,cameraClosed:camera(),counterBefore,positions,mapWidthBefore,mapWidthAfter:$('map').getBoundingClientRect().width,closeInitial,closeSamples,closed:height()};
   });
   assert.ok(Math.abs(report.start-report.final-reportHeight)<2,'Result strip has enough final space for clear dice and outcome');assert.ok(Math.abs(report.initial-report.start)<3,'Opening a report does not immediately jump the map border');
   assert.ok(report.openSamples.filter(h=>h<report.start-2&&h>report.final+2).length>=3,'Result strip opens across multiple intermediate heights');assert.ok(report.panelHeight>=reportHeight-2);assert.match(report.text,/SQUAD LOST · ROLLED 1/);
   assert.deepEqual(report.cameraBefore,report.cameraAfter);assert.deepEqual(report.cameraClosed,report.cameraBefore);assert.ok(report.positions.every(p=>distance(p,report.counterBefore)<2),'Showing or dismissing a report does not move the visible counter');assert.ok(Math.abs(report.closeInitial-report.final)<3);assert.ok(report.closeSamples.filter(h=>h>report.final+2&&h<report.start-2).length>=3,'Result strip closes smoothly');assert.ok(Math.abs(report.closed-report.start)<2,'Dismissal returns the report space to the map');
   assert.ok(Math.abs(report.mapWidthBefore-report.mapWidthAfter)<2,'Report transitions preserve the chosen map scale');
   await page.emulateMedia({reducedMotion:'reduce'});
   const reducedReport=await page.evaluate(()=>{
    const wrap=$('mapWrap'),start=wrap.getBoundingClientRect().height;state=structuredClone(state);state.revision++;state.airlift_report.revision=state.revision;render();const open=wrap.getBoundingClientRect().height;
    $('battleFeedback').querySelector('.battle-result-dismiss').click();return {start,open,closed:wrap.getBoundingClientRect().height};
   });
   assert.ok(Math.abs(reducedReport.start-reducedReport.open-reportHeight)<2,'Reduced motion opens the report instantly');assert.ok(Math.abs(reducedReport.closed-reducedReport.start)<2,'Reduced motion closes instantly');await page.emulateMedia({reducedMotion:'no-preference'});
   const simultaneous=await page.evaluate(async()=>{
    const frame=()=>new Promise(requestAnimationFrame),start=motionPoint(motionTestId);state=structuredClone(state);state.units.find(u=>u.id===motionTestId).pos[0]++;state.revision++;state.airlift_report.revision=state.revision;render();
    const initial=motionPoint(motionTestId),samples=[];for(let i=0;i<22;i++){await frame();samples.push(motionPoint(motionTestId));}
    const end=motionPoint(motionTestId,$('map'),false);$('battleFeedback').querySelector('.battle-result-dismiss').click();for(let i=0;i<22;i++)await frame();return {start,initial,samples,end};
   });
   assert.ok(distance(simultaneous.start,simultaneous.initial)<2,'Movement and a new report begin without a counter jump');assert.ok(simultaneous.samples.filter(p=>distance(p,simultaneous.start)>1&&distance(p,simultaneous.end)>1).length>=3,'Counter remains continuous while report space opens');assert.ok(distance(simultaneous.samples.at(-1),simultaneous.end)<2);
  }
  const continuous=await page.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),point=()=>motionPoint(motionTestId),wrap=$('mapWrap');
   const start=point(),camera=[wrap.scrollLeft,wrap.scrollTop];state=structuredClone(state);const u=state.units.find(u=>u.id===motionTestId);u.pos=[14,18];u.ap--;state.revision++;render();
   const initial=point(),end=motionPoint(motionTestId,$('map'),false),samples=[];let rebuilt=false;
   for(let i=0;i<22;i++){await frame();samples.push(point());if(i===3){state=structuredClone(state);render();rebuilt=true;}}
   return {start,initial,end,samples,rebuilt,camera,cameraAfter:[wrap.scrollLeft,wrap.scrollTop],animations:$('map').querySelector(`.unit[data-unit-id="${motionTestId}"] .unit-motion`)?.getAnimations().length||0};
  });
  const length=distance(continuous.start,continuous.end);
  assert.ok(length>30,'Fixture moves a visible distance');assert.ok(distance(continuous.start,continuous.initial)<2,'Move starts at old visible counter center');
  assert.ok(continuous.samples.filter(p=>distance(p,continuous.start)>2&&distance(p,continuous.end)>2).length>=3,'Move has multiple intermediate frames');
  assert.ok(distance(continuous.samples.at(-1),continuous.end)<2,'Move settles at authoritative hex');
  assert.ok(Math.max(...continuous.samples.slice(1).map((p,i)=>distance(p,continuous.samples[i])))<length*.6,'Same-position redraw does not teleport the counter');
  assert.deepEqual(continuous.cameraAfter,continuous.camera,'Movement preserves map camera');assert.equal(continuous.animations,0,'Completed animations release their resources');
  const retarget=await page.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame);state=structuredClone(state);state.units.find(u=>u.id===motionTestId).pos=[16,18];state.revision++;render();
   for(let i=0;i<4;i++)await frame();const before=motionPoint(motionTestId);state=structuredClone(state);state.units.find(u=>u.id===motionTestId).pos=[17,17];state.revision++;render();const after=motionPoint(motionTestId),end=motionPoint(motionTestId,$('map'),false);
   for(let i=0;i<22;i++)await frame();return {before,after,end,final:motionPoint(motionTestId)};
  });
  assert.ok(distance(retarget.before,retarget.after)<2,'New authoritative move continues from current visual position');assert.ok(distance(retarget.final,retarget.end)<2);
  const shared=await page.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),plane=state.units.find(u=>u.id===motionTestId),base=state.units.find(u=>u.kind==='paratrooper');
   state=structuredClone(state);state.units.push({...base,id:'motion-shared-infantry',pos:[18,17],reserve:false,carrier_id:undefined,hp:4,ap:2});state.revision++;render();
   const start=motionPoint(motionTestId);state=structuredClone(state);state.units.find(u=>u.id===motionTestId).pos=[18,17];state.revision++;render();
   const initial=motionPoint(motionTestId),end=motionPoint(motionTestId,$('map'),false),counter=$('map').querySelector(`.unit[data-unit-id="${motionTestId}"]`),transform=counter.getAttribute('transform');
   for(let i=0;i<22;i++)await frame();return {start,initial,end,final:motionPoint(motionTestId),shared:counter.classList.contains('ground-shared'),transform};
  });
  assert.ok(shared.shared&&/scale\(\.78\)/.test(shared.transform),'Separate air/ground counter stacking retains its final layout');assert.ok(distance(shared.start,shared.initial)<2,'Stack transform composes with movement without a position jump');assert.ok(distance(shared.final,shared.end)<2);
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(()=>{state=structuredClone(state);state.units.find(u=>u.id===motionTestId).pos=[19,17];state.revision++;render();const g=$('map').querySelector(`.unit[data-unit-id="${motionTestId}"]`);return {actual:motionPoint(motionTestId),expected:motionPoint(motionTestId,$('map'),false),animations:g.querySelector('.unit-motion')?.getAnimations().length||0};});
  assert.ok(distance(reduced.actual,reduced.expected)<1);assert.equal(reduced.animations,0,'Reduced motion applies the result immediately');await page.emulateMedia({reducedMotion:'no-preference'});
  const contacts=await page.evaluate(()=>{
   const base=state.units.find(u=>u.kind==='fighter');state=structuredClone(state);state.units.push({...base,id:'motion-new-contact',side:'de',pos:[20,12],hp:3,reserve:false,carrier_id:undefined});state.revision++;render();
   const first=$('map').querySelector('.unit[data-unit-id="motion-new-contact"]'),initial=first.querySelector('.unit-motion')?.getAnimations().length||0;
   state=structuredClone(state);state.units=state.units.filter(u=>u.id!=='motion-new-contact');state.revision++;render();const gone=!$('map').querySelector('.unit[data-unit-id="motion-new-contact"]');
   state=structuredClone(state);state.units.push({...base,id:'motion-new-contact',side:'de',pos:[24,8],hp:3,reserve:false,carrier_id:undefined});state.revision++;render();const reappeared=$('map').querySelector('.unit[data-unit-id="motion-new-contact"]');
   return {initial,gone,reappearance:reappeared.querySelector('.unit-motion')?.getAnimations().length||0,actual:motionPoint('motion-new-contact'),expected:motionPoint('motion-new-contact',$('map'),false)};
  });
  assert.equal(contacts.initial,0);assert.ok(contacts.gone);assert.equal(contacts.reappearance,0,'Newly spotted contact never traces an unseen origin');assert.ok(distance(contacts.actual,contacts.expected)<1);
  const privacy=await page.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),id='motion-new-contact',sight={ground:state.visible_hexes,air:state.visible_air_hexes};
   state=structuredClone(state);state.visible_hexes=[[24,8],[21,8]];state.visible_air_hexes=[[24,8],[21,8]];state.revision++;render();
   state=structuredClone(state);state.units.find(u=>u.id===id).pos=[21,8];state.revision++;render();
   const hiddenRoute=$('map').querySelector(`.unit[data-unit-id="${id}"] .unit-motion`)?.getAnimations().length||0;
   state=structuredClone(state);state.visible_air_hexes=[[21,8],[22,8]];state.revision++;render();
   const start=motionPoint(id);state=structuredClone(state);state.units.find(u=>u.id===id).pos=[22,8];state.revision++;render();
   const knownRoute=$('map').querySelector(`.unit[data-unit-id="${id}"] .unit-motion`)?.getAnimations().length||0,initial=motionPoint(id);
   for(let i=0;i<22;i++)await frame();
   state=structuredClone(state);state.visible_hexes=sight.ground;state.visible_air_hexes=sight.air;state.revision++;render();
   const base=state.units.find(u=>u.kind==='paratrooper');state=structuredClone(state);state.units.push({...base,id:'motion-arrival',pos:[10,19],reserve:true,carrier_id:undefined,hp:4});state.revision++;render();
   const reserveAbsent=!$('map').querySelector('.unit[data-unit-id="motion-arrival"]');
   state=structuredClone(state);const arrival=state.units.find(u=>u.id==='motion-arrival');arrival.reserve=false;arrival.pos=[13,19];state.revision++;render();
   const landed=$('map').querySelector('.unit[data-unit-id="motion-arrival"] .unit-motion')?.getAnimations().length||0;
   state=structuredClone(state);state.units.find(u=>u.id==='motion-arrival').carrier_id=motionTestId;state.revision++;render();
   const boardedAbsent=!$('map').querySelector('.unit[data-unit-id="motion-arrival"]');
   state=structuredClone(state);const unloaded=state.units.find(u=>u.id==='motion-arrival');delete unloaded.carrier_id;unloaded.pos=[15,19];state.revision++;render();
   const unload=$('map').querySelector('.unit[data-unit-id="motion-arrival"] .unit-motion')?.getAnimations().length||0;
   return {hiddenRoute,knownRoute,start,initial,reserveAbsent,landed,boardedAbsent,unload};
  });
  assert.equal(privacy.hiddenRoute,0,'Observed enemy endpoints do not expose an unseen intermediate route');assert.ok(privacy.knownRoute>0,'Fully observed enemy movement remains animated');assert.ok(distance(privacy.start,privacy.initial)<2);
  assert.ok(privacy.reserveAbsent&&privacy.boardedAbsent);assert.equal(privacy.landed,0,'Airborne arrivals do not fly from their reserve coordinates');assert.equal(privacy.unload,0,'Unloaded infantry appear at the confirmed exit hex');
  const playback=await page.evaluate(async()=>{
   const frame=()=>new Promise(requestAnimationFrame),before=structuredClone(state),after=structuredClone(state),u=after.units.find(u=>u.id===motionTestId);u.pos=[20,17];u.ap--;
   const second=structuredClone(after);second.units.find(u=>u.id===motionTestId).pos=[21,17];
   state.computer_playback={id:'motion-browser-replay',count:2,frames:[{action:{kind:'move',unit:motionTestId,pos:u.pos},before,after,effects:[],combat:[]},{action:{kind:'move',unit:motionTestId,pos:[21,17]},before:after,after:second,effects:[],combat:[]}]};startPlayback();playbackSession.paused=true;clearTimeout(playbackTimer);
   const start=motionPoint(motionTestId,$('playbackMap')),camera=[$('mapWrap').scrollLeft,$('mapWrap').scrollTop];playbackSession.phase='after';drawPlayback();const initial=motionPoint(motionTestId,$('playbackMap')),end=motionPoint(motionTestId,$('playbackMap'),false),samples=[];
   for(let i=0;i<22;i++){await frame();samples.push(motionPoint(motionTestId,$('playbackMap')));}
   const cameraAfter=[$('mapWrap').scrollLeft,$('mapWrap').scrollTop];playbackSession.index=1;playbackSession.phase='before';drawPlayback();
   const nextOrderCamera=[$('mapWrap').scrollLeft,$('mapWrap').scrollTop],nextStart=motionPoint(motionTestId,$('playbackMap'));playbackSession.phase='after';drawPlayback();const nextInitial=motionPoint(motionTestId,$('playbackMap'));
   for(let i=0;i<22;i++)await frame();
   playbackSession.phase='before';drawPlayback();const backwardAnimations=$('playbackMap').querySelector(`.unit[data-unit-id="${motionTestId}"] .unit-motion`)?.getAnimations().length||0;
   stopPlayback();return {start,initial,end,samples,camera,cameraAfter,nextOrderCamera,nextStart,nextInitial,backwardAnimations};
  });
  assert.ok(distance(playback.start,playback.initial)<2,'Replay result begins at before-frame location');assert.ok(playback.samples.some(p=>distance(p,playback.start)>1&&distance(p,playback.end)>1),'Replay has intermediate movement');assert.ok(distance(playback.samples.at(-1),playback.end)<2);assert.deepEqual(playback.cameraAfter,playback.camera,'Replay does not jerk the camera between adjacent phases');assert.deepEqual(playback.nextOrderCamera,playback.cameraAfter,'Consecutive visible replay orders do not recenter the camera');assert.ok(distance(playback.nextStart,playback.nextInitial)<2);assert.equal(playback.backwardAnimations,0,'Backward inspection does not fabricate a reverse move');
  await page.screenshot({path:path.join(temp,mobile?'phone.png':'desktop.png')});await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: desktop/phone continuous movement, real orders, redraw/retarget, shared layers, reduced motion, concealed-route/arrival privacy, replay cameras, smooth readable result strips without camera or scale jumps.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
