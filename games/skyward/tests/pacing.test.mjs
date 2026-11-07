import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightControls} from '../public/controls.mjs';
import {normalizeSettings} from '../public/settings.mjs';
import {FlightSimulation} from '../public/sim.mjs';
import {getMission} from '../public/campaign.mjs';
import {FIXED_STEP,FixedStepClock,FlightPresentation} from '../public/presentation.mjs';

class Surface {
  constructor(){this.handlers=new Map();this.style={};this.value=0;this.classList={add(){},remove(){}};}
  addEventListener(type,handler){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(handler);}
  removeEventListener(type,handler){this.handlers.get(type)?.delete(handler);}
  dispatch(type,event={}){for(const handler of this.handlers.get(type)||[])handler({target:this,preventDefault(){},...event});}
  closest(){return null;}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  setPointerCapture(){}
}

function withFlight(run,assist='assisted'){
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  const window=globalThis.window=new Surface();globalThis.document=new Surface();
  const settings=normalizeSettings({assist});
  const surfaces={stick:new Surface(),knob:new Surface(),yawStick:new Surface(),yawKnob:new Surface(),fire:new Surface(),throttle:new Surface()};
  const controls=new FlightControls({...surfaces,settings});
  const mission={...structuredClone(getMission('first-light')),id:'freeflight',kind:'free',aircraft:'f15',
    start:{x:0,y:8000,z:0,speed:200,heading:Math.PI-.01,airborne:true},waypoints:[],enemies:[],targets:[],goal:{}};
  const sim=new FlightSimulation(mission,settings),clock=new FixedStepClock(),presentation=new FlightPresentation(sim);
  controls.setActive(true);controls.setThrottle(.3);sim.player.throttle=.3;
  const step=dt=>{presentation.capture(sim);sim.step(dt,controls.read(dt));};
  try{return run({controls,sim,clock,presentation,window,step,...surfaces});}
  finally{controls.destroy();globalThis.window=oldWindow;globalThis.document=oldDocument;}
}

function replay(refreshRate,assist){
  return withFlight(({controls,sim,clock,presentation,window,step})=>{
    for(const code of ['ArrowDown','ArrowRight','KeyD','KeyW'])window.dispatch('keydown',{code});
    let steps=0;
    for(let frame=0;frame<refreshRate*2;frame++){
      controls.read(0); // The frame's audio snapshot must not advance input time.
      steps+=clock.advance(1/refreshRate,step);
      presentation.sample(clock.alpha);
    }
    assert.equal(steps,120,`${assist}, ${refreshRate} Hz: two seconds must yield 120 physics steps`);
    assert.equal(sim.status,'flying');assert.ok(Math.abs(sim.player.throttle-1)<1e-9);
    return structuredClone(sim.player);
  },assist);
}

test('flight, held thrust and render sampling remain identical at 15, 30, 60, 120 and 144 Hz',()=>{
  for(const assist of ['assisted','standard','expert']){
    const reference=replay(60,assist);
    for(const refreshRate of [15,30,120,144])assert.deepEqual(replay(refreshRate,assist),reference,`${assist}, ${refreshRate} Hz must match 60 Hz`);
  }
});

test('frames shorter than a physics tick can render without advancing throttle or the aircraft',()=>withFlight(({controls,sim,clock,presentation,window,step})=>{
  window.dispatch('keydown',{code:'KeyW'});
  const before=structuredClone(sim.player);
  for(let frame=0;frame<3;frame++){
    assert.equal(controls.read(0).throttle,.3);
    assert.equal(clock.advance(FIXED_STEP/4,step),0);
    presentation.sample(clock.alpha);
    assert.deepEqual(sim.player,before);
  }
  assert.ok(Math.abs(clock.alpha-.75)<1e-9);
  assert.equal(clock.advance(FIXED_STEP/4,step),1);
  assert.ok(Math.abs(sim.player.throttle-(.3+FIXED_STEP*.35))<1e-9);
  assert.equal(sim.time,FIXED_STEP);
}));

test('pause resets pending time and resuming cannot replay held thrust',()=>withFlight(({controls,sim,clock,window,step})=>{
  window.dispatch('keydown',{code:'KeyW'});
  assert.equal(clock.advance(FIXED_STEP*.75,step),0);
  controls.setActive(false);clock.reset();
  assert.equal(clock.alpha,0);assert.equal(controls.read(5).throttle,.3);assert.equal(sim.time,0);
  controls.setActive(true);
  window.dispatch('keydown',{code:'KeyW',repeat:true});
  assert.equal(clock.advance(FIXED_STEP*.5,step),0,'a stale pre-pause fraction must not trigger a tick');
  assert.equal(clock.advance(FIXED_STEP*.5,step),1);
  assert.equal(sim.time,FIXED_STEP);assert.equal(sim.player.throttle,.3,'keys held through pause must be pressed again');
  window.dispatch('keydown',{code:'KeyW'});
  assert.equal(clock.advance(FIXED_STEP,step),1);
  assert.ok(Math.abs(sim.player.throttle-(.3+FIXED_STEP*.35))<1e-9);
}));

test('a long frame has bounded catch-up without leaving a backlog for subsequent frames',()=>withFlight(({sim,clock,step})=>{
  assert.equal(clock.advance(2,step),15);
  assert.ok(Math.abs(sim.time-.25)<1e-9);
  assert.ok(clock.alpha<1e-9);
  assert.equal(clock.advance(FIXED_STEP,step),1);
  assert.ok(Math.abs(sim.time-(.25+FIXED_STEP))<1e-9);
}));


test('left-thumb thrust matches W timing across display rates and holds its value after release',()=>{
  const run=(refreshRate,touch)=>withFlight(({controls,sim,clock,window,yawStick,step})=>{
    if(touch){yawStick.dispatch('pointerdown',{pointerId:1,clientX:50,clientY:50,pointerType:'touch'});yawStick.dispatch('pointermove',{pointerId:1,clientX:50,clientY:12});}
    else window.dispatch('keydown',{code:'KeyW'});
    let ticks=0;
    for(let frame=0;frame<refreshRate;frame++){
      controls.read(0);ticks+=clock.advance(1/refreshRate,step);
    }
    assert.equal(ticks,60);assert.ok(Math.abs(sim.player.throttle-.65)<1e-9);
    if(touch)yawStick.dispatch('pointerup',{pointerId:1});else window.dispatch('keyup',{code:'KeyW'});
    const chosen=sim.player.throttle;
    for(let i=0;i<60;i++)clock.advance(FIXED_STEP,step);
    assert.equal(sim.player.throttle,chosen,'released thumb must not keep accelerating or reset the selected thrust');
    return structuredClone(sim.player);
  });
  const keyboard=run(60,false);
  for(const rate of [15,30,60,120,144])assert.deepEqual(run(rate,true),keyboard,`${rate} Hz thumb input must match the keyboard`);
});
