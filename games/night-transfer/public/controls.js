export function movementVector(yaw, forward, side, speed, dt) {
  const length = Math.hypot(forward, side) || 1;
  const scale = speed * Math.min(0.05, Math.max(0, dt)) / Math.max(1, length);
  return { x: (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * scale,
    z: (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * scale };
}

export class FirstPersonControls {
  constructor({canvas,joystick,knob,onInteract,onPause,onTap,onCrouch}) {
    this.pose={x:0,z:3.2,yaw:0,pitch:0,crouch:false}; this.enabled=false;
    this.sensitivity=1; this.invert=false; this.keys=new Set(); this.stick={x:0,y:0};
    this.drag=null; this.stickId=null; this.canvas=canvas; this.knob=knob; this.onCrouch=onCrouch;
    const reset=()=>{this.keys.clear();this.drag=null;this.stickId=null;this.stick={x:0,y:0};knob.style.transform='';};
    this.reset=reset;
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){if(this.enabled){e.preventDefault();reset();onPause();}return;}
      if(!this.enabled||e.ctrlKey||e.metaKey||e.altKey)return;
      const key=e.key.toLowerCase();
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','c',' '].includes(key)){e.preventDefault();this.keys.add(key);}
      if(!e.repeat&&key==='e')onInteract();
      if(!e.repeat&&(key==='c'||key===' '))this.toggleCrouch();
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur',reset);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{
      if(!this.enabled||e.button>0)return;
      this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now(),moved:false};
      canvas.setPointerCapture(e.pointerId);e.preventDefault();
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.enabled||!this.drag||this.drag.id!==e.pointerId)return;
      const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
      this.drag.moved ||= Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)>7;
      this.pose.yaw-=dx*0.0035*this.sensitivity;
      this.pose.pitch=Math.max(-1.12,Math.min(1.12,this.pose.pitch-dy*0.003*this.sensitivity*(this.invert?-1:1)));
      this.drag.x=e.clientX;this.drag.y=e.clientY;e.preventDefault();
    });
    const endLook=e=>{
      if(!this.drag||this.drag.id!==e.pointerId)return;
      const tap=!this.drag.moved&&performance.now()-this.drag.time<450;
      this.drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(tap&&this.enabled&&e.type!=='pointercancel')onTap(e.clientX,e.clientY);
    };
    canvas.addEventListener('pointerup',endLook);canvas.addEventListener('pointercancel',endLook);
    const moveStick=e=>{
      const box=joystick.getBoundingClientRect(),radius=box.width*.38;
      const dx=e.clientX-box.left-box.width/2,dy=e.clientY-box.top-box.height/2;
      const factor=Math.min(1,radius/(Math.hypot(dx,dy)||1));
      this.stick={x:dx*factor/radius,y:dy*factor/radius};knob.style.transform=`translate(${dx*factor}px,${dy*factor}px)`;
    };
    joystick.addEventListener('pointerdown',e=>{if(!this.enabled)return;this.stickId=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);e.preventDefault();});
    joystick.addEventListener('pointermove',e=>{if(this.stickId===e.pointerId&&this.enabled){moveStick(e);e.preventDefault();}});
    const endStick=e=>{if(this.stickId!==e.pointerId)return;this.stickId=null;this.stick={x:0,y:0};knob.style.transform='';};
    joystick.addEventListener('pointerup',endStick);joystick.addEventListener('pointercancel',endStick);joystick.addEventListener('lostpointercapture',endStick);
  }
  setEnabled(enabled){this.enabled=enabled;if(!enabled)this.reset();}
  setPose(pose){this.pose={x:pose.x,z:pose.z,yaw:pose.yaw||0,pitch:pose.pitch||0,crouch:!!pose.crouch};this.reset();this.onCrouch?.(this.pose.crouch);}
  toggleCrouch(){if(!this.enabled)return;this.pose.crouch=!this.pose.crouch;this.onCrouch?.(this.pose.crouch);}
  update(dt,canMove){
    if(!this.enabled)return false;
    dt=Math.min(.25,Math.max(0,dt));
    const forward=(this.keys.has('w')||this.keys.has('arrowup')?1:0)-(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-this.stick.y;
    const side=(this.keys.has('d')?1:0)-(this.keys.has('a')?1:0)+this.stick.x;
    this.pose.yaw+=((this.keys.has('arrowleft')?1:0)-(this.keys.has('arrowright')?1:0))*dt*1.7*this.sensitivity;
    const steps=Math.max(1,Math.ceil(dt/.05));
    const vector=movementVector(this.pose.yaw,forward,side,this.pose.crouch?1.45:2.45,dt/steps);
    for(let i=0;i<steps;i++){
      if(canMove(this.pose.x+vector.x,this.pose.z,.23))this.pose.x+=vector.x;
      if(canMove(this.pose.x,this.pose.z+vector.z,.23))this.pose.z+=vector.z;
    }
    return Math.hypot(vector.x,vector.z)>0;
  }
}
