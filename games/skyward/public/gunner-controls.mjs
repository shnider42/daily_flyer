import {normalizeGunnerBindings} from './keybindings.mjs';
import {clampCrewInput,GUNSHIP_SEATS} from './gunship.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const continuous=new Set(['aimUp','aimDown','aimLeft','aimRight','fire']);
const seats={seat25:'25mm',seat40:'40mm',seat105:'105mm'};
const formTarget=target=>Boolean(target?.isContentEditable||target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));

// The gunner has no flight axes. Aim is a bounded angle in the shared aircraft's
// frame; releasing a thumb holds that angle while the pilot keeps flying.
export class GunnerControls {
  constructor({surface,pad,knob,fire,settings={},onPause,onAction,onAnyGesture,onRelease,onPress,onCancel}){
    Object.assign(this,{surface,pad,knob,fire,settings,onPause,onAction,onAnyGesture,onRelease,onPress,onCancel});
    this.active=false;this.keys=new Set();this.listeners=[];
    this.seat='25mm';this.yaw=0;this.pitch=0;this.zoom=false;
    this.padId=this.fireId=this.mouseFireId=null;this.anchor=this.lastMouse=null;
    this.axes={x:0,y:0};this.refreshBindings();this.bind();
  }
  on(el,event,handler){el.addEventListener(event,handler);this.listeners.push(()=>el.removeEventListener(event,handler));}
  capture(el,id){try{el.setPointerCapture(id);return true;}catch{return false;}}
  release(el,id){if(id===null)return;try{if(el.hasPointerCapture?.(id))el.releasePointerCapture(id);}catch{}}
  owns(id){return [this.padId,this.fireId,this.mouseFireId].includes(id);}
  resetPad(){const id=this.padId;this.padId=null;this.anchor=null;this.axes={x:0,y:0};this.knob.style.transform='translate(-50%,-50%)';this.pad.classList.remove('active');this.release(this.pad,id);}
  resetFire(){const id=this.fireId,mouseId=this.mouseFireId;this.fireId=this.mouseFireId=null;this.fire.classList.remove('held');this.surface.classList.remove('firing');this.release(this.fire,id);this.release(this.surface,mouseId);}
  constrain(){const input=clampCrewInput({seat:this.seat,yaw:this.yaw,pitch:this.pitch,fire:false});this.seat=input.seat;this.yaw=input.yaw;this.pitch=input.pitch;}
  bind(){
    this.on(this.pad,'pointerdown',e=>{
      if(!this.active||e.button>0||this.padId!==null||this.owns(e.pointerId))return;
      if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
      e.preventDefault();const r=this.pad.getBoundingClientRect();this.anchor={x:e.clientX,y:e.clientY,radius:Math.max(1,Math.min(r.width,r.height)*.38)};
      this.padId=e.pointerId;this.axes={x:0,y:0};this.pad.classList.add('active');
      if(!this.capture(this.pad,e.pointerId)){this.resetPad();return;}this.onAnyGesture?.();
    });
    this.on(this.pad,'pointermove',e=>{
      if(!this.active||e.pointerId!==this.padId||!this.anchor)return;
      if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
      e.preventDefault();const r=this.anchor.radius;let x=(e.clientX-this.anchor.x)/r,y=(e.clientY-this.anchor.y)/r;
      const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
      const dead=clamp((this.settings.deadZone??12)/100,0,.3),curve=v=>Math.abs(v)<=dead?0:Math.sign(v)*(Math.abs(v)-dead)/(1-dead);
      this.axes={x:curve(x),y:-curve(y)};this.knob.style.transform='translate(calc(-50% + '+x*r+'px),calc(-50% + '+y*r+'px))';
    });
    this.on(this.fire,'pointerdown',e=>{
      if(!this.active||e.button>0||this.fireId!==null||this.owns(e.pointerId))return;
      e.preventDefault();this.fireId=e.pointerId;this.fire.classList.add('held');
      if(!this.capture(this.fire,e.pointerId)){this.resetFire();return;}this.onAnyGesture?.();this.onPress?.();
    });
    this.on(this.surface,'pointerdown',e=>{
      if(!this.active||e.pointerType==='touch'||e.button>0||this.mouseFireId!==null||this.owns(e.pointerId))return;
      e.preventDefault();this.mouseFireId=e.pointerId;this.lastMouse={x:e.clientX,y:e.clientY};this.surface.classList.add('firing');
      if(!this.capture(this.surface,e.pointerId)){this.resetFire();return;}this.onAnyGesture?.();this.onPress?.();
    });
    this.on(this.surface,'pointermove',e=>{
      if(!this.active||e.pointerType==='touch'||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
      if(this.lastMouse){
        const sensitivity=clamp(this.settings.sensitivity??1,.4,1.8)*(this.zoom?.0007:.0017);
        this.yaw+=clamp(e.clientX-this.lastMouse.x,-100,100)*sensitivity;
        this.pitch-=clamp(e.clientY-this.lastMouse.y,-100,100)*sensitivity;this.constrain();
      }
      this.lastMouse={x:e.clientX,y:e.clientY};
    });
    this.on(this.surface,'pointerleave',()=>{if(this.mouseFireId===null)this.lastMouse=null;});
    const end=e=>{
      if(e.pointerId===this.padId)this.resetPad();
      if(e.pointerId===this.fireId||e.pointerId===this.mouseFireId){this.resetFire();this.onRelease?.();}
    };
    for(const event of ['pointerup','pointercancel','lostpointercapture'])for(const el of [this.pad,this.fire,this.surface])this.on(el,event,end);
    for(const event of ['pointerup','pointercancel'])this.on(window,event,end);
    this.on(window,'keydown',e=>{
      if(!this.active)return;
      if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey){this.clear();return;}
      if(formTarget(e.target)){this.clear();return;}
      this.refreshBindings();const action=e.code==='Escape'?'pause':this.codeToAction.get(e.code);
      if(!action)return;e.preventDefault();if(e.repeat)return;this.onAnyGesture?.();
      if(continuous.has(action)){this.keys.add(e.code);if(action==='fire')this.onPress?.();}
      else if(seats[action])this.selectSeat(seats[action]);
      else if(action==='zoom')this.toggleZoom();
      else if(action==='recenter')this.recenter();
      else if(action==='pause'){this.clear();this.onPause?.();}
      else this.onAction?.(action);
    });
    this.on(window,'keyup',e=>{const fired=this.keys.has(this.keyBindings.fire);this.keys.delete(e.code);if(fired&&!this.keys.has(this.keyBindings.fire))this.onRelease?.();});
    for(const event of ['blur','resize','orientationchange'])this.on(window,event,()=>this.clear());
    if(window.visualViewport?.addEventListener)this.on(window.visualViewport,'resize',()=>this.clear());
    this.on(document,'visibilitychange',()=>{if(document.hidden)this.clear();});
    this.on(document,'focusin',e=>{if(formTarget(e.target))this.clear();});
    this.on(this.surface,'contextmenu',e=>{if(this.active)e.preventDefault();});
  }
  refreshBindings(){
    const bindings=normalizeGunnerBindings(this.settings.gunnerBindings);
    if(this.keyBindings&&Object.entries(bindings).every(([action,code])=>this.keyBindings[action]===code))return;
    this.keyBindings=bindings;this.codeToAction=new Map(Object.entries(bindings).filter(([,code])=>code!==null).map(([action,code])=>[code,action]));this.keys.clear();
  }
  setActive(active){if(this.active===active)return;this.active=active;if(!active)this.clear();}
  selectSeat(seat){if(!GUNSHIP_SEATS.includes(seat))return;this.clear({cancel:false});this.seat=seat;this.constrain();this.onAction?.('seat',this.seat);}
  toggleZoom(){this.zoom=!this.zoom;this.onAction?.('zoom',this.zoom);}
  recenter(){this.yaw=this.pitch=0;this.lastMouse=null;this.onAction?.('recenter');}
  reset(input={}){this.clear();this.seat=input.seat||'25mm';this.yaw=input.yaw||0;this.pitch=input.pitch||0;this.zoom=false;this.constrain();}
  read(dt=0){
    this.refreshBindings();const down=key=>this.keys.has(this.keyBindings[key])?1:0;
    if(this.active){
      const rate=(this.zoom?.28:.6)*clamp(this.settings.sensitivity??1,.4,1.8)*clamp(Number.isFinite(dt)?dt:0,0,.1);
      this.yaw+=clamp(this.axes.x+down('aimRight')-down('aimLeft'),-1,1)*rate;
      this.pitch+=clamp(this.axes.y+down('aimUp')-down('aimDown'),-1,1)*rate;this.constrain();
    }
    return {seat:this.seat,yaw:this.yaw,pitch:this.pitch,fire:this.active&&(this.fireId!==null||this.mouseFireId!==null||!!down('fire')),zoom:this.zoom};
  }
  clear({cancel=true}={}){this.keys.clear();this.resetPad();this.resetFire();this.lastMouse=null;if(cancel&&this.onCancel)this.onCancel();else this.onRelease?.();}
  destroy(){this.clear();this.listeners.forEach(fn=>fn());}
}
