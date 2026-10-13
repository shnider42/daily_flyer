/* Real pointer/touch orders, normal polling, and readable movement pacing. */
'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/ww2-motion-input-'),port=Number(process.env.WW2_MOTION_PORT||8196),base=`http://127.0.0.1:${port}`,engine=process.env.WW2_BROWSER||'chromium';
const server=cp.spawn('python',['-c',"from ww2_web import create_app; create_app('"+path.join(temp,'game.sqlite')+"',background_ai=False).run(host='127.0.0.1',port="+port+",threaded=True)"],{stdio:'ignore'});
let browser;
const separation=(a,b)=>Math.hypot(a[1]-b[1],a[2]-b[2]);
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const errors=[];let checks=0;
 for(const mobile of [false,true])for(const style of ['basic','detailed'])for(const scenario of ['village','current:nightfall_veil','current:crosswind_strait']){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(style=>localStorage.setItem('ww2-unit-style',style),style);
  await page.goto(base);await page.waitForFunction(()=>scenarios.length>0&&window.ww2Motion);
  await page.evaluate(async scenario=>{await run(async()=>{remember(await api('/api/match',{scenario,ruleset:'dsl',opponent:'computer'}));});},scenario);
  await page.waitForFunction(()=>state?.ready&&!busy&&!lobbyMode);await page.waitForTimeout(250);
  const unit=await page.evaluate(()=>{
   const u=state.units.find(u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id&&['fighter','squad'].includes(u.kind)&&state.legal[u.id]?.moves?.length);
   focusMapUnit(u);return u;
  });
  await page.waitForTimeout(200);
  const location=await page.evaluate(id=>{
   const g=$('map').querySelector(`.unit[data-unit-id="${id}"]`),p=new DOMPoint(...center(...state.units.find(u=>u.id===id).pos)).matrixTransform(g.getScreenCTM());return {x:p.x,y:p.y};
  },unit.id);
  if(mobile)await page.touchscreen.tap(location.x,location.y);else await page.mouse.click(location.x,location.y);
  await page.waitForFunction(id=>selected===id,unit.id);
  const destination=await page.evaluate(id=>{
   const u=state.units.find(u=>u.id===id),wrap=$('mapWrap').getBoundingClientRect();
   const available=state.legal[id].moves.filter(m=>!state.units.some(u=>u.hp>0&&!u.reserve&&!u.carrier_id&&u.pos.join(',')===m.pos.join(','))).map(m=>{
    const p=new DOMPoint(...center(...m.pos)).matrixTransform($('map').getScreenCTM());return {...m,x:p.x,y:p.y};
   }).filter(m=>m.x>wrap.left+35&&m.x<wrap.right-30&&m.y>wrap.top+40&&m.y<wrap.bottom-30);
   available.sort((a,b)=>(b.path?.length||1)-(a.path?.length||1));const move=available[0];if(!move)throw new Error('No visible legal input destination');
   window.inputMotionRecords=[];window.inputMotionReady=null;const revision=state.revision,original=Element.prototype.animate;
   document.addEventListener('ww2:render',()=>{if(state.revision>revision&&inputMotionRecords.length)inputMotionReady={busy,active:inputMotionRecords.some(r=>!r.finished)};});
   Element.prototype.animate=function(frames,options){
    const animation=original.call(this,frames,options);
    if(this.classList.contains('unit-motion-overlay')){
     const record={id:this.dataset.unitId,duration:options.duration,samples:[],finished:false};inputMotionRecords.push(record);
     const start=performance.now(),id=record.id;
     function sample(){
      const node=window.ww2Motion.visual($('map'),id),unit=state.units.find(u=>u.id===id);if(!node?.isConnected||!unit){record.finished=true;return;}
      const p=new DOMPoint(...center(...unit.pos)).matrixTransform(node.getScreenCTM());record.samples.push([performance.now()-start,p.x,p.y]);
      if(animation.playState!=='finished'&&animation.playState!=='idle')requestAnimationFrame(sample);else record.finished=true;
     }
     sample();
    }
    return animation;
   };
   return {move,revision:state.revision,ap:u.ap};
  },unit.id);
  if(mobile)await page.touchscreen.tap(destination.move.x,destination.move.y);else await page.mouse.click(destination.move.x,destination.move.y);
  await page.waitForFunction(revision=>state.revision>revision&&!busy,destination.revision);
  const availableDuringMotion=await page.evaluate(()=>inputMotionReady);
  await page.waitForFunction(()=>inputMotionRecords.length>0&&inputMotionRecords.every(r=>r.finished));
  const result=await page.evaluate(id=>{
   const u=state.units.find(u=>u.id===id),g=$('map').querySelector(`.unit[data-unit-id="${id}"]`),p=new DOMPoint(...center(...u.pos)).matrixTransform(g.getScreenCTM());
   return {records:inputMotionRecords,pos:u.pos,ap:u.ap,expected:[0,p.x,p.y],style:document.body.classList.contains('detailed-unit-art')?'detailed':'basic'};
  },unit.id);
  assert.equal(result.style,style);assert.deepEqual(result.pos,destination.move.pos);assert.equal(result.ap,destination.ap-destination.move.cost);
  assert.equal(availableDuringMotion.busy,false,'A visual glide never keeps the next order busy');assert.ok(availableDuringMotion.active,'Input becomes available before the glide finishes');
  const record=result.records.find(r=>r.id===unit.id),samples=record.samples,first=samples[0],last=samples.at(-1),pixels=separation(first,last);
  assert.ok(record.duration>=280&&record.duration<=650,'Ordinary moves are readable without long animation waits');
  if(destination.move.path?.length>=3)assert.ok(record.duration>=450,'A multi-hex flight must have visible travel time for its route');
  assert.ok(pixels>20,'The order crosses a visible screen distance');
  assert.ok(samples.filter(p=>separation(p,first)>1&&separation(p,last)>1).length>=5,'Actual clicked/tapped movement has multiple visible intermediate frames');
  assert.ok(separation(last,result.expected)<2,'The visual finishes at the authoritative position');
  assert.ok(Math.max(...samples.slice(1).map((p,i)=>separation(p,samples[i])))<pixels*.6,'Motion does not jump most of its distance in one frame');
  checks++;await page.close();
 }
 assert.deepEqual(errors,[]);console.log(`PASS: ${checks} ${engine} real desktop clicks/phone taps, Basic/Detailed icons, readable ground/multi-hex flight motion, immediate input, normal polling and confirmed endpoints.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
