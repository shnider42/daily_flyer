// Run with jsdom available on NODE_PATH; see docs/battlezone-1980.md.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const assets=path.join(__dirname,'../daily_flyer/themes/battlezone_assets');
function setup({fixed=false,denyStorage=false}={}){
  const screen=fs.readFileSync(path.join(assets,'screen.html'),'utf8').replace('__SEED__','20261029').replace('__DATE__','2026-10-29').replace('__DATE_POLICY__',fixed?'fixed':'live');
  const dom=new JSDOM(screen,{url:'https://battlezone.example/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;let state,callback,clock=0,now='2026-10-30T03:59:59Z';
  const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return new NativeDate(now).getTime();}};
  w.matchMedia=()=>({matches:false});w.requestAnimationFrame=fn=>{callback=fn;};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:1200,height:500});
  w.HTMLElement.prototype.setPointerCapture=()=>{};
  if(denyStorage)Object.defineProperty(w,'localStorage',{get(){throw new Error('denied');}});
  w.eval(fs.readFileSync(path.join(assets,'core.js'),'utf8'));
  const create=w.VectorPatrol.create;w.VectorPatrol.create=(...args)=>(state=create(...args));
  w.eval(fs.readFileSync(path.join(assets,'view.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(assets,'controller.js'),'utf8'));
  const $=id=>w.document.getElementById('bz-'+id);
  return {w,$,get state(){return state;},setDate(value){now=value;},close:()=>w.close(),
    tick(n=1){for(let i=0;i<n;i++){clock=Math.max(clock,w.performance.now())+1000/60;callback(clock);}},
    key(code,type='keydown'){w.document.dispatchEvent(new w.KeyboardEvent(type,{code,bubbles:true}));},
    pointer(button,type,id=1){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:id});button.dispatchEvent(e);}
  };
}
test('start, drive, pause, resume, and return to mission select',()=>{
  const h=setup();h.$('start').click();assert.equal(h.state.phase,'playing');h.key('KeyW');h.tick(30);assert.ok(h.state.player.z>0);
  h.key('KeyP');const before=h.state.player.z;h.tick(60);assert.equal(h.state.player.z,before);assert.equal(h.state.phase,'paused');
  h.$('start').click();assert.equal(h.state.phase,'playing');h.$('pause').click();h.$('hangar').click();assert.equal(h.state.phase,'ready');assert.equal(h.$('difficulty').disabled,false);h.close();
});
test('fine aim supports Shift and the touch-friendly toggle; losing focus releases movement',()=>{
  const h=setup();h.$('start').click();h.key('ShiftLeft');h.key('KeyD');h.tick(10);assert.equal(h.state.player.aiming,true);
  h.key('ShiftLeft','keyup');h.key('KeyD','keyup');h.$('precision').click();h.tick();assert.equal(h.state.player.aiming,true);
  h.key('KeyW');h.tick(10);h.$('sound').focus();const before=h.state.player.z;h.tick(10);assert.equal(h.state.player.z,before);h.close();
});
test('touch movement and fire work together; cancellation and window blur release inputs',()=>{
  const h=setup({denyStorage:true});h.$('start').click();
  const drive=h.w.document.querySelector('[data-input=forward]'),fire=h.w.document.querySelector('[data-input=fire]');
  h.pointer(drive,'pointerdown',1);h.pointer(fire,'pointerdown',2);h.tick(30);assert.ok(h.state.player.z>0);assert.ok(h.state.shots>0);
  h.pointer(drive,'pointercancel',1);const z=h.state.player.z;h.tick(10);assert.equal(h.state.player.z,z);
  h.w.dispatchEvent(new h.w.Event('blur'));assert.equal(h.state.phase,'paused');h.close();
});
test('daily seed advances at New York midnight only when a new run starts',()=>{
  const h=setup();h.w.document.querySelector('[data-mode=daily]').click();h.$('start').click();assert.equal(h.state.seed,20261029);
  h.setDate('2026-10-30T04:00:01Z');h.tick(5);assert.equal(h.state.seed,20261029);
  h.$('pause').click();h.$('start').click();assert.equal(h.state.seed,20261029);
  h.$('pause').click();h.$('hangar').click();h.$('start').click();assert.equal(h.state.seed,20261030);h.close();
});
test('explicit seed remains fixed across midnight',()=>{
  const h=setup({fixed:true});h.setDate('2026-10-31T05:00:00Z');h.w.document.querySelector('[data-mode=daily]').click();h.$('start').click();assert.equal(h.state.seed,20261029);h.close();
});
test('winning displays all five completed steps, result stats, and replay',()=>{
  const h=setup();h.w.document.querySelector('[data-mode=daily]').click();h.$('start').click();
  Object.assign(h.state,{wave:5,kills:12,bonusKills:2,score:19000,shots:20,hits:14,time:80});h.state.enemies=[];h.tick(10);
  assert.equal(h.state.phase,'won');assert.equal(h.$('results').hidden,false);assert.equal(h.$('result-accuracy').textContent,'70%');
  assert.equal(h.w.document.querySelectorAll('#bz-progress [data-complete=true]').length,5);
  assert.match(h.$('overlay-copy').textContent,/2 bonus saucers/);h.$('start').click();assert.equal(h.state.phase,'playing');assert.equal(h.state.kills,0);h.close();
});
test('loss saves a best score independently of difficulty',()=>{
  const h=setup();h.$('start').click();h.state.score=12345;h.state.phase='lost';h.tick();assert.equal(h.$('best').textContent,'012345');
  h.$('difficulty').value='cadet';h.$('difficulty').dispatchEvent(new h.w.Event('change'));assert.equal(h.$('best').textContent,'000000');h.close();
});
