/* Independent pointer ownership keeps the move thumb alive while looking/acting. */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const editable = target => !!target?.closest?.('input,select,textarea,[contenteditable="true"],[data-input-ignore]');
const handledKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyC','KeyE','KeyF','KeyQ','KeyJ','KeyM','Escape']);

export class Input {
  constructor({canvas,moveZone,lookZone,stick,stickKnob,buttons={},onAction=()=>{},onPause=()=>{},onGesture=()=>{},settings={}}) {
    Object.assign(this,{canvas,moveZone,lookZone,stick,stickKnob,buttons,onAction,onPause,onGesture});
    this.enabled=false;
    this.keys=new Set();
    this.movePointer=null;
    this.lookPointer=null;
    this.buttonPointers=new Map();
    this.touchMove={x:0,z:0};
    this.look={x:0,y:0};
    this.lookDistance=0;
    this.jumpPending=false;
    this.crouchToggle=false;
    this.runToggle=false;
    this.wasLocked=false;
    this.unbind=[];
    this.pauseRequested=false;
    this.idleStickStyle=stick ? {left:stick.style.left,top:stick.style.top,bottom:stick.style.bottom,right:stick.style.right,transform:stick.style.transform} : null;
    this.settings={stickSize:88,buttonSize:100,sensitivity:1,leftHanded:false,controls:'auto'};
    this.updateSettings(settings);

    this.coarseQuery=typeof matchMedia==='function'?matchMedia('(pointer: coarse)'):null;
    this.syncTouchMode=()=>document.body.classList.toggle('touch-mode',this.isTouchLayout());
    this.syncTouchMode();
    if(this.coarseQuery?.addEventListener){this.coarseQuery.addEventListener('change',this.syncTouchMode);this.unbind.push(()=>this.coarseQuery.removeEventListener('change',this.syncTouchMode));}

    this.listen(window,'keydown',e=>this.keyDown(e));
    this.listen(window,'keyup',e=>this.keyUp(e));
    this.listen(window,'blur',()=>{
      // Focus and page visibility are different. Touch browsers can move focus
      // while the game remains visible; do not discard the player's held thumbs
      // or open a pause dialog for those foreground focus changes.
      if(document.hidden)this.pause('visibility');
      else if(!this.isTouchLayout()||this.wasLocked||document.pointerLockElement===this.canvas)this.pause('blur');
    });
    this.listen(document,'visibilitychange',()=>{if(document.hidden)this.pause('visibility');});
    this.listen(window,'pagehide',()=>this.pause('pagehide'));
    this.listen(document,'pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.canvas;
      const lost=this.wasLocked&&!locked;
      this.wasLocked=locked;
      document.body.classList.toggle('pointer-locked',locked);
      if(locked&&this.lookPointer?.target===this.canvas){
        const pointer=this.lookPointer;
        this.release(pointer.id);
        try{if(this.canvas.hasPointerCapture?.(pointer.id))this.canvas.releasePointerCapture(pointer.id);}catch{}
      }
      if(lost&&this.enabled)this.pause('pointerlock');
    });
    this.listen(document,'pointerlockerror',()=>{
      // Pointer lock is optional: dragging the view also works on desktops.
      document.body.classList.remove('pointer-locked');
    });
    this.listen(document,'mousemove',e=>{
      if(!this.enabled||document.pointerLockElement!==this.canvas)return;
      this.addLook(Number(e.movementX)||0,Number(e.movementY)||0);
    });

    for(const [zone,role] of [[moveZone,'move'],[lookZone,'look']]) {
      if(!zone)continue;
      zone.style.touchAction='none';
      this.listen(zone,'pointerdown',e=>this.zoneDown(e,role));
      this.listen(zone,'pointermove',e=>this.zoneMove(e));
      for(const type of ['pointerup','pointercancel','lostpointercapture'])this.listen(zone,type,e=>this.release(e.pointerId));
      this.listen(zone,'contextmenu',e=>{if(this.enabled)e.preventDefault();});
    }
    if(canvas){
      canvas.style.touchAction='none';
      this.listen(canvas,'pointerdown',e=>{
        if(!this.enabled||editable(e.target)||e.pointerType==='touch')return;
        this.gesture(e);
        if(document.pointerLockElement===canvas){if(e.button===0)this.onAction('tool');}
        else if(e.button===0){
          // Begin a real drag immediately. If pointer lock is denied or absent,
          // captured pointer moves continue to provide desktop mouse-look.
          this.lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY,target:canvas};
          this.capture(canvas,e.pointerId);
          this.requestPointerLock();
        }
        e.preventDefault();
      });
      this.listen(canvas,'pointermove',e=>{
        if(document.pointerLockElement!==canvas)this.zoneMove(e);
      });
      for(const type of ['pointerup','pointercancel','lostpointercapture'])this.listen(canvas,type,e=>this.release(e.pointerId));
      this.listen(canvas,'contextmenu',e=>{if(this.enabled)e.preventDefault();});
    }

    for(const [action,button] of Object.entries(buttons)) {
      if(!button)continue;
      button.style.touchAction='none';
      this.listen(button,'pointerdown',e=>{
        if(!this.enabled)return;
        e.preventDefault();e.stopPropagation();
        this.gesture(e);
        this.capture(button,e.pointerId);
        this.buttonPointers.set(e.pointerId,{action,button});
        button.classList.add('is-held');
        if(action==='jump')this.jumpPending=true;
        else if(action==='crouch'){
          this.crouchToggle=!this.crouchToggle;
          this.syncCrouch();
        } else if(action==='run'){
          this.runToggle=!this.runToggle;
          this.syncRun();
        } else this.onAction(action);
      });
      for(const event of ['pointerup','pointercancel','lostpointercapture'])this.listen(button,event,e=>{
        e.stopPropagation();
        this.release(e.pointerId);
      });
      // Keyboard activation of focused buttons remains accessible; pointer click is
      // already handled on down and must not dispatch a second action on release.
      this.listen(button,'click',e=>{
        if(!this.enabled||e.detail!==0)return;
        e.preventDefault();this.gesture(e);
        if(action==='jump')this.jumpPending=true;
        else if(action==='crouch'){this.crouchToggle=!this.crouchToggle;this.syncCrouch();}
        else if(action==='run'){this.runToggle=!this.runToggle;this.syncRun();}
        else this.onAction(action);
      });
    }
  }

  listen(target,type,handler,options={passive:false}) {
    target?.addEventListener(type,handler,options);
    this.unbind.push(()=>target?.removeEventListener(type,handler,options));
  }

  gesture(event) {
    try {const promise=this.onGesture(event);if(promise?.catch)promise.catch(()=>{});}catch{}
  }

  capture(target,id) {
    try{target.setPointerCapture(id);}catch{}
  }

  addLook(x,y) {
    this.look.x+=x;this.look.y+=y;
    this.lookDistance+=Math.hypot(x,y);
    if(this.lookDistance>12)document.body.classList.add('has-looked');
  }

  zoneDown(event,role) {
    if(!this.enabled||editable(event.target)||event.target?.closest?.('button'))return;
    if(event.pointerType==='mouse'&&document.pointerLockElement===this.canvas)return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(role==='move'&&event.pointerType==='mouse'&&this.settings.controls!=='touch')return;
    if(role==='move'&&this.movePointer)return;
    if(role==='look'&&this.lookPointer)return;
    event.preventDefault();
    this.gesture(event);
    if(event.pointerType==='touch')this.syncTouchMode();
    const target=role==='move'?this.moveZone:this.lookZone;
    this.capture(target,event.pointerId);
    const pointer={id:event.pointerId,x:event.clientX,y:event.clientY,target};
    if(role==='move'){
      this.movePointer=pointer;
      this.touchMove.x=0;this.touchMove.z=0;
      if(this.stick){
        const rect=this.moveZone.getBoundingClientRect();
        Object.assign(this.stick.style,{left:`${event.clientX-rect.left}px`,top:`${event.clientY-rect.top}px`,bottom:'auto',right:'auto',transform:'translate(-50%,-50%)'});
        this.stick.classList.add('is-active');
      }
    } else {
      this.lookPointer=pointer;
      this.lookZone.classList.add('is-active');
    }
  }

  zoneMove(event) {
    if(!this.enabled)return;
    if(this.movePointer?.id===event.pointerId){
      event.preventDefault();
      const dx=event.clientX-this.movePointer.x,dy=event.clientY-this.movePointer.y;
      const radius=Math.max(24,this.settings.stickSize*.43);
      const distance=Math.hypot(dx,dy),limit=Math.min(1,radius/Math.max(distance,.001));
      let x=dx/radius,z=-dy/radius;
      const magnitude=Math.hypot(x,z);
      if(magnitude<.11){x=0;z=0;}
      else {const normalized=Math.min(1,(magnitude-.11)/.89);x=x/magnitude*normalized;z=z/magnitude*normalized;}
      this.touchMove.x=x;this.touchMove.z=z;
      if(this.stickKnob)this.stickKnob.style.transform=`translate(${dx*limit}px,${dy*limit}px)`;
    } else if(this.lookPointer?.id===event.pointerId){
      event.preventDefault();
      this.addLook(event.clientX-this.lookPointer.x,event.clientY-this.lookPointer.y);
      this.lookPointer.x=event.clientX;this.lookPointer.y=event.clientY;
    }
  }

  release(pointerId) {
    if(this.movePointer?.id===pointerId){
      this.movePointer=null;
      this.touchMove.x=0;this.touchMove.z=0;
      this.stick?.classList.remove('is-active');
      if(this.stick&&this.idleStickStyle)Object.assign(this.stick.style,this.idleStickStyle);
      if(this.stickKnob)this.stickKnob.style.transform='translate(0px,0px)';
    }
    if(this.lookPointer?.id===pointerId){this.lookPointer=null;this.lookZone?.classList.remove('is-active');}
    const held=this.buttonPointers.get(pointerId);
    if(held){
      this.buttonPointers.delete(pointerId);
      if(![...this.buttonPointers.values()].some(item=>item.button===held.button))held.button.classList.remove('is-held');
    }
  }

  keyDown(event) {
    if(!this.enabled||editable(event.target)||event.metaKey||event.ctrlKey||event.altKey)return;
    if(!handledKeys.has(event.code))return;
    event.preventDefault();
    this.gesture(event);
    this.keys.add(event.code);
    if(event.repeat)return;
    const actions={KeyE:'use',KeyF:'flashlight',KeyQ:'tool',KeyJ:'journal',KeyM:'map'};
    if(actions[event.code])this.onAction(actions[event.code]);
    else if(event.code==='Space')this.jumpPending=true;
    else if(event.code==='KeyC'){this.crouchToggle=!this.crouchToggle;this.syncCrouch();}
    else if(event.code==='Escape')this.pause('escape');
  }

  keyUp(event) {
    this.keys.delete(event.code);
    if(this.enabled&&handledKeys.has(event.code)&&!editable(event.target))event.preventDefault();
  }

  syncCrouch() {
    this.buttons.crouch?.classList.toggle('is-toggled',this.crouchToggle);
    this.buttons.crouch?.setAttribute('aria-pressed',String(this.crouchToggle));
  }

  syncRun() {
    this.buttons.run?.classList.toggle('is-toggled',this.runToggle);
    this.buttons.run?.setAttribute('aria-pressed',String(this.runToggle));
  }

  isTouchLayout() {
    return this.settings.controls==='touch'||(this.settings.controls!=='desktop'&&!!this.coarseQuery?.matches);
  }

  sample() {
    if(!this.enabled)return {moveX:0,moveZ:0,lookX:0,lookY:0,run:false,crouch:false,jump:false};
    let moveX=this.touchMove.x+(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0);
    let moveZ=this.touchMove.z+(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0);
    const length=Math.hypot(moveX,moveZ);
    if(length>1){moveX/=length;moveZ/=length;}
    const run=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.runToggle;
    const sample={moveX,moveZ,lookX:this.look.x*this.settings.sensitivity,lookY:this.look.y*this.settings.sensitivity,run,crouch:this.crouchToggle,jump:this.jumpPending};
    this.look.x=0;this.look.y=0;this.jumpPending=false;
    return sample;
  }

  setEnabled(value) {
    const next=!!value;
    if(this.enabled===next)return;
    this.enabled=next;
    this.pauseRequested=false;
    this.reset();
    if(!next&&document.pointerLockElement===this.canvas){
      this.wasLocked=false;
      document.exitPointerLock?.();
    }
  }

  updateSettings(settings={}) {
    this.settings={...this.settings,...settings};
    this.settings.stickSize=clamp(Number(this.settings.stickSize)||88,60,150);
    this.settings.buttonSize=clamp(Number(this.settings.buttonSize)||100,70,145);
    this.settings.sensitivity=clamp(Number(this.settings.sensitivity)||1,.4,2);
    this.settings.leftHanded=!!this.settings.leftHanded;
    this.settings.controls=['auto','touch','desktop'].includes(this.settings.controls)?this.settings.controls:'auto';
    document.documentElement.style.setProperty('--stick-size',`${this.settings.stickSize}px`);
    document.documentElement.style.setProperty('--button-scale',String(this.settings.buttonSize/100));
    document.documentElement.style.setProperty('--button-size',`${56*this.settings.buttonSize/100}px`);
    document.body.classList.toggle('left-handed',this.settings.leftHanded);
    this.syncTouchMode?.();
    if(this.stick){this.stick.style.width=`${this.settings.stickSize}px`;this.stick.style.height=`${this.settings.stickSize}px`;}
  }

  requestPointerLock() {
    if(!this.enabled||!this.canvas?.requestPointerLock||this.isTouchLayout())return;
    try {const promise=this.canvas.requestPointerLock();if(promise?.catch)promise.catch(()=>{});}catch{}
  }

  pause(reason) {
    this.reset();
    if(!this.enabled||this.pauseRequested)return;
    this.pauseRequested=true;
    this.onPause(reason);
  }

  reset() {
    this.keys.clear();
    const pointers=[this.movePointer,this.lookPointer].filter(Boolean);
    for(const pointer of pointers){this.release(pointer.id);try{if(pointer.target.hasPointerCapture?.(pointer.id))pointer.target.releasePointerCapture(pointer.id);}catch{}}
    for(const [id,held] of [...this.buttonPointers]){this.release(id);try{if(held.button.hasPointerCapture?.(id))held.button.releasePointerCapture(id);}catch{}}
    this.touchMove.x=0;this.touchMove.z=0;this.look.x=0;this.look.y=0;
    this.jumpPending=false;this.crouchToggle=false;this.runToggle=false;this.syncCrouch();this.syncRun();
  }

  destroy() {
    this.setEnabled(false);
    this.reset();
    for(const unbind of this.unbind)unbind();
    this.unbind.length=0;
    document.body.classList.remove('pointer-locked');
  }
}
