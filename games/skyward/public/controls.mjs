import {normalizeKeyBindings} from './keybindings.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const CONTINUOUS_ACTIONS=new Set(['pitchUp','pitchDown','yawLeft','yawRight','throttleUp','throttleDown','rollLeft','rollRight','fire']);
const isFormTarget=target=>Boolean(target?.isContentEditable||target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
export class FlightControls {
  constructor({stick,knob,yawStick,yawKnob,fire,throttle,onAction,onPause,onAnyGesture,settings={}}){
    Object.assign(this,{stick,knob,yawStick,yawKnob,fire,throttle,onAction,onPause,onAnyGesture,settings});
    this.keys=new Set();this.active=false;this.axes={roll:0,pitch:0,yaw:0,thrust:0};this.lookX=0;this.lookY=0;this.fireId=null;this.firing=false;this.throttleValue=0;
    this.pads=[
      {element:stick,knob,xAxis:'roll',yAxis:'pitch',yDirection:1,pointerId:null,anchor:null},
      {element:yawStick,knob:yawKnob,xAxis:'yaw',yAxis:'thrust',yDirection:-1,pointerId:null,anchor:null},
    ];
    this.listeners=[];this.refreshBindings();this.bind();
  }
  on(el,type,fn,opts){el.addEventListener(type,fn,opts);this.listeners.push(()=>el.removeEventListener(type,fn,opts));}
  ownsPointer(id){return this.fireId===id||this.pads.some(pad=>pad.pointerId===id);}
  releaseCapture(element,id){
    if(id===null)return;
    try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{}
  }
  resetPad(pad){
    const id=pad.pointerId;pad.pointerId=null;pad.anchor=null;
    this.axes[pad.xAxis]=this.axes[pad.yAxis]=0;
    pad.knob.style.transform='translate(-50%,-50%)';pad.element.classList.remove('active');
    this.releaseCapture(pad.element,id);
  }
  resetFire(){
    const id=this.fireId;this.fireId=null;this.firing=false;this.fire.classList.remove('held');
    this.releaseCapture(this.fire,id);
  }
  bindPad(pad){
    this.on(pad.element,'pointerdown',e=>{
      if(!this.active||(e.button!==undefined&&e.button!==0))return;
      e.preventDefault();
      if(pad.pointerId!==null||this.ownsPointer(e.pointerId)||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
      const rect=pad.element.getBoundingClientRect();
      // Contact begins neutral anywhere in the pad. Only subsequent thumb
      // travel deflects the centered knob, so placement cannot jerk the plane.
      pad.anchor={x:e.clientX,y:e.clientY,radius:Math.max(1,Math.min(rect.width,rect.height||rect.width)*.38)};
      pad.pointerId=e.pointerId;this.axes[pad.xAxis]=this.axes[pad.yAxis]=0;
      pad.knob.style.transform='translate(-50%,-50%)';pad.element.classList.add('active');
      try{pad.element.setPointerCapture(e.pointerId);}catch{this.resetPad(pad);return;}
      this.onAnyGesture?.();
    });
    this.on(pad.element,'pointermove',e=>{
      if(!this.active||pad.pointerId!==e.pointerId||!pad.anchor)return;
      e.preventDefault();this.movePad(pad,e);
    });
    const end=e=>{if(e.pointerId===pad.pointerId)this.resetPad(pad);};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.on(pad.element,event,end);
  }
  bind(){
    const {fire,throttle}=this;
    for(const pad of this.pads)this.bindPad(pad);
    this.on(fire,'pointerdown',e=>{
      if(!this.active||(e.button!==undefined&&e.button!==0))return;
      e.preventDefault();if(this.fireId!==null||this.ownsPointer(e.pointerId))return;
      this.fireId=e.pointerId;this.firing=true;fire.classList.add('held');
      try{fire.setPointerCapture(e.pointerId);}catch{this.resetFire();return;}
      this.onAnyGesture?.();
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.on(fire,event,e=>{if(e.pointerId===this.fireId)this.resetFire();});
    // Also release by owner if a browser delivers the final event outside the
    // original element. Releasing one thumb never releases the other controls.
    for(const event of ['pointerup','pointercancel'])this.on(window,event,e=>{
      for(const pad of this.pads)if(e.pointerId===pad.pointerId)this.resetPad(pad);
      if(e.pointerId===this.fireId)this.resetFire();
    });
    this.on(throttle,'input',()=>{const value=Number(throttle.value);if(Number.isFinite(value))this.setThrottle(value/100);this.onAnyGesture?.();});
    // Pointer use returns focus to flying. Tab focus keeps native range-key
    // operation available, including to keyboard and assistive-technology users.
    for(const event of ['pointerup','pointercancel'])this.on(throttle,event,()=>throttle.blur?.());
    this.on(window,'keydown',e=>{
      if(!this.active)return;
      if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey){this.keys.clear();return;}
      if(e.code==='Escape'){
        e.preventDefault();if(e.repeat)return;this.clear();this.onAnyGesture?.();this.onPause?.();return;
      }
      if(isFormTarget(e.target)){this.keys.clear();return;}
      this.refreshBindings();const action=this.codeToAction.get(e.code);
      if(!action)return;
      e.preventDefault();
      // Held keys already live in the set. Ignoring repeat after a clear also
      // prevents a key held through a pause or blur from restarting by itself.
      if(e.repeat)return;
      this.onAnyGesture?.();
      if(action==='pause'){this.clear();this.onPause?.();}
      else if(CONTINUOUS_ACTIONS.has(action))this.keys.add(e.code);
      else this.onAction?.(action);
    });
    this.on(window,'keyup',e=>this.keys.delete(e.code));
    for(const event of ['blur','resize','orientationchange'])this.on(window,event,()=>this.clear());
    if(window.visualViewport?.addEventListener)this.on(window.visualViewport,'resize',()=>this.clear());
    this.on(document,'focusin',e=>{if(isFormTarget(e.target))this.keys.clear();});
    this.on(document,'visibilitychange',()=>{if(document.hidden)this.clear();});
    this.on(document,'contextmenu',e=>{if(this.active&&e.target.closest?.('.touch-controls, #view'))e.preventDefault();});
  }
  movePad(pad,e){
    if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
    const {x:anchorX,y:anchorY,radius}=pad.anchor;
    let x=(e.clientX-anchorX)/radius,y=(e.clientY-anchorY)/radius;
    const magnitude=Math.hypot(x,y);if(magnitude>1){x/=magnitude;y/=magnitude;}
    const dead=clamp(Number.isFinite(this.settings.deadZone)?this.settings.deadZone/100:.12,0,.95);
    const curve=value=>Math.abs(value)<=dead?0:Math.sign(value)*(Math.abs(value)-dead)/(1-dead);
    this.axes[pad.xAxis]=curve(x);this.axes[pad.yAxis]=curve(y*pad.yDirection);
    pad.knob.style.transform=`translate(calc(-50% + ${x*radius}px),calc(-50% + ${y*radius}px))`;
  }
  setActive(active){this.active=active;if(!active)this.clear();}
  setThrottle(v){this.throttleValue=clamp(v,0,1);this.throttle.value=Math.round(this.throttleValue*100);}
  refreshBindings(){
    const source=this.settings.keyBindings;
    if(this.keyBindings&&source===this.bindingSource)return;
    const bindings=normalizeKeyBindings(source);
    this.bindingSource=source;
    // Normalizing a sound/display preference creates a new bindings object too.
    // Only a real reassignment should cancel controls the pilot is holding.
    if(this.keyBindings&&Object.entries(bindings).every(([action,code])=>this.keyBindings[action]===code))return;
    this.keyBindings=bindings;
    this.codeToAction=new Map(Object.entries(bindings).filter(([,code])=>code!==null).map(([action,code])=>[code,action]));
    this.keys.clear();
  }
  read(dt){
    if(!this.active)return {roll:0,pitch:0,yaw:0,throttle:this.throttleValue,fire:false};
    this.refreshBindings();const down=action=>this.keys.has(this.keyBindings[action])?1:0,elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
    const thrust=clamp(this.axes.thrust+down('throttleUp')-down('throttleDown'),-1,1);
    this.throttleValue=clamp(this.throttleValue+thrust*elapsed*.35,0,1);this.throttle.value=Math.round(this.throttleValue*100);
    const roll=this.axes.roll+down('rollRight')-down('rollLeft');
    const pitch=this.axes.pitch*(this.settings.touchPitch==='push'?-1:1)+down('pitchUp')-down('pitchDown');
    const sensitivity=Number.isFinite(this.settings.sensitivity)?this.settings.sensitivity:1;
    return {roll:clamp(roll*sensitivity,-1,1),pitch:clamp(pitch*sensitivity,-1,1),yaw:clamp(this.axes.yaw+down('yawRight')-down('yawLeft'),-1,1),throttle:this.throttleValue,fire:this.firing||Boolean(down('fire'))};
  }
  clear(){this.keys.clear();for(const pad of this.pads)this.resetPad(pad);this.resetFire();this.lookX=this.lookY=0;}
  destroy(){this.clear();this.listeners.forEach(fn=>fn());}
}
