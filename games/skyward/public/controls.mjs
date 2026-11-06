const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class FlightControls {
  constructor({stick,knob,look,fire,throttle,onAction,onPause,onAnyGesture,settings}){
    Object.assign(this,{stick,knob,look,fire,throttle,onAction,onPause,onAnyGesture,settings});
    this.keys=new Set();this.active=false;this.stickId=null;this.lookId=null;this.axes={roll:0,pitch:0};this.lookX=0;this.lookY=0;this.firing=false;this.throttleValue=0;
    this.listeners=[];this.bind();
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
    this.on(window,'keydown',e=>{
      if(!this.active)return;const form=e.target.closest?.('input,select,textarea');if(form&&form!==throttle)return;if(form===throttle&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.code))return;
      const key=e.code;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ControlLeft','KeyG','KeyF','KeyB','KeyL','KeyT','KeyM','KeyR','KeyC','KeyX','KeyV','KeyH','KeyP','Escape','Enter'].includes(key))e.preventDefault();
      this.keys.add(key);this.onAnyGesture?.();if(e.repeat)return;
      const map={KeyG:'gear',KeyF:'flaps',KeyB:'brake',KeyL:'level',KeyT:'target',Tab:'target',KeyM:'missile',KeyR:'radar',KeyC:'camera',KeyX:'countermeasure',KeyV:'payload',KeyH:'hover',Enter:'startup'};
      if(map[key])this.onAction?.(map[key]);if(key==='Escape'||key==='KeyP')this.onPause?.();
    });
    this.on(window,'keyup',e=>this.keys.delete(e.code));
    this.on(window,'blur',()=>this.clear());
    this.on(document,'visibilitychange',()=>{if(document.hidden)this.clear();});
    this.on(document,'contextmenu',e=>{if(this.active&&e.target.closest('.touch-controls, #view'))e.preventDefault();});
  }
  moveStick(e){const r=this.stick.getBoundingClientRect(),radius=r.width*.38;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag;}const dead=this.settings.deadZone/100;const curve=v=>Math.abs(v)<dead?0:Math.sign(v)*(Math.abs(v)-dead)/(1-dead);this.axes.roll=curve(x);this.axes.pitch=-curve(y);this.knob.style.transform=`translate(calc(-50% + ${x*radius}px),calc(-50% + ${y*radius}px))`;}
  setActive(active){this.active=active;if(!active)this.clear();}
  setThrottle(v){this.throttleValue=clamp(v,0,1);this.throttle.value=Math.round(this.throttleValue*100);}
  read(dt){
    if(!this.active)return {roll:0,pitch:0,yaw:0,throttle:this.throttleValue,fire:false};
    const k=this.keys,down=c=>k.has(c)?1:0;
    this.throttleValue=clamp(this.throttleValue+(down('ShiftLeft')+down('ShiftRight')-down('ControlLeft')-down('ControlRight'))*dt*.35,0,1);this.throttle.value=Math.round(this.throttleValue*100);
    if(this.lookId===null){const f=1-Math.exp(-dt*3.8);this.lookX*=1-f;this.lookY*=1-f;}
    let roll=this.axes.roll+down('KeyD')+down('ArrowRight')-down('KeyA')-down('ArrowLeft');
    let pitch=this.axes.pitch+down('KeyW')+down('ArrowUp')-down('KeyS')-down('ArrowDown');
    if(this.settings.invertPitch)pitch=-pitch;
    return {roll:clamp(roll*this.settings.sensitivity,-1,1),pitch:clamp(pitch*this.settings.sensitivity,-1,1),yaw:down('KeyE')-down('KeyQ'),throttle:this.throttleValue,fire:this.firing||k.has('Space')};
  }
  clear(){this.keys.clear();this.stickId=this.lookId=null;this.axes.roll=this.axes.pitch=0;this.firing=false;this.knob.style.transform='translate(-50%,-50%)';this.fire.classList.remove('held');this.look.classList.remove('active');}
  destroy(){this.clear();this.listeners.forEach(fn=>fn());}
}
