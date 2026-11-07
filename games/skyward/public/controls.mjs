import {normalizeKeyBindings} from './keybindings.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const CONTINUOUS_ACTIONS=new Set(['pitchUp','pitchDown','yawLeft','yawRight','throttleUp','throttleDown','rollLeft','rollRight','fire']);
const isFormTarget=target=>Boolean(target?.isContentEditable||target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
export class FlightControls {
  constructor({stick,knob,look,fire,throttle,onAction,onPause,onAnyGesture,settings}){
    Object.assign(this,{stick,knob,look,fire,throttle,onAction,onPause,onAnyGesture,settings});
    this.keys=new Set();this.active=false;this.stickId=null;this.lookId=null;this.axes={roll:0,pitch:0};this.lookX=0;this.lookY=0;this.firing=false;this.throttleValue=0;
    this.listeners=[];this.refreshBindings();this.bind();
  }
  on(el,type,fn,opts){el.addEventListener(type,fn,opts);this.listeners.push(()=>el.removeEventListener(type,fn,opts));}
  bind(){
    const {stick,look,fire,throttle}=this;
    this.on(stick,'pointerdown',e=>{if(!this.active||this.stickId!==null)return;e.preventDefault();this.onAnyGesture?.();this.stickId=e.pointerId;stick.setPointerCapture(e.pointerId);this.moveStick(e);});
    this.on(stick,'pointermove',e=>{if(e.pointerId===this.stickId){e.preventDefault();this.moveStick(e);}});
    const end=e=>{if(e.pointerId===this.stickId){this.stickId=null;this.axes.roll=this.axes.pitch=0;this.knob.style.transform='translate(-50%,-50%)';}};
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])this.on(stick,ev,end);
    this.on(look,'pointerdown',e=>{if(!this.active||this.lookId!==null)return;e.preventDefault();this.onAnyGesture?.();this.lookId=e.pointerId;this.lastLook={x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);look.classList.add('active');});
    this.on(look,'pointermove',e=>{if(e.pointerId!==this.lookId)return;e.preventDefault();this.lookX=clamp(this.lookX+(e.clientX-this.lastLook.x)*.007*this.settings.lookSensitivity,-2.6,2.6);this.lookY=clamp(this.lookY+(e.clientY-this.lastLook.y)*.005*this.settings.lookSensitivity,-.8,.8);this.lastLook={x:e.clientX,y:e.clientY};});
    const endLook=e=>{if(e.pointerId===this.lookId){this.lookId=null;look.classList.remove('active');}};
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])this.on(look,ev,endLook);
    this.on(fire,'pointerdown',e=>{if(!this.active)return;e.preventDefault();this.onAnyGesture?.();this.firing=true;fire.setPointerCapture(e.pointerId);fire.classList.add('held');});
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])this.on(fire,ev,()=>{this.firing=false;fire.classList.remove('held');});
    this.on(throttle,'input',()=>{this.throttleValue=Number(throttle.value)/100;this.onAnyGesture?.();});
    // Pointer use returns focus to flying. Tab focus keeps native range-key
    // operation available, including to keyboard and assistive-technology users.
    for(const ev of ['pointerup','pointercancel'])this.on(throttle,ev,()=>throttle.blur?.());
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
    this.on(window,'blur',()=>this.clear());
    this.on(document,'focusin',e=>{if(isFormTarget(e.target))this.keys.clear();});
    this.on(document,'visibilitychange',()=>{if(document.hidden)this.clear();});
    this.on(document,'contextmenu',e=>{if(this.active&&e.target.closest?.('.touch-controls, #view'))e.preventDefault();});
  }
  moveStick(e){const r=this.stick.getBoundingClientRect(),radius=r.width*.38;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag;}const dead=this.settings.deadZone/100;const curve=v=>Math.abs(v)<dead?0:Math.sign(v)*(Math.abs(v)-dead)/(1-dead);this.axes.roll=curve(x);this.axes.pitch=-curve(y);this.knob.style.transform=`translate(calc(-50% + ${x*radius}px),calc(-50% + ${y*radius}px))`;}
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
    this.throttleValue=clamp(this.throttleValue+(down('throttleUp')-down('throttleDown'))*elapsed*.35,0,1);this.throttle.value=Math.round(this.throttleValue*100);
    if(this.lookId===null){const f=1-Math.exp(-elapsed*3.8);this.lookX*=1-f;this.lookY*=1-f;}
    const roll=this.axes.roll+down('rollRight')-down('rollLeft');
    const pitch=this.axes.pitch*(this.settings.invertPitch?-1:1)+down('pitchUp')-down('pitchDown');
    return {roll:clamp(roll*this.settings.sensitivity,-1,1),pitch:clamp(pitch*this.settings.sensitivity,-1,1),yaw:down('yawRight')-down('yawLeft'),throttle:this.throttleValue,fire:this.firing||Boolean(down('fire'))};
  }
  clear(){this.keys.clear();this.stickId=this.lookId=null;this.axes.roll=this.axes.pitch=0;this.lookX=this.lookY=0;this.firing=false;this.knob.style.transform='translate(-50%,-50%)';this.fire.classList.remove('held');this.look.classList.remove('active');}
  destroy(){this.clear();this.listeners.forEach(fn=>fn());}
}
