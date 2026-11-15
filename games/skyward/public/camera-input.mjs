const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const wrapAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

export class CameraInput {
  constructor({getSettings,onZoom}) {
    this.getSettings=getSettings;
    this.onZoom=onZoom;
    this.enabled=false;
    this.pointer=null;
    this.x=this.y=0;
  }

  attach(surface) {
    this.surface=surface;
    surface.addEventListener('pointerdown',event=>this.start(event));
    surface.addEventListener('pointermove',event=>this.move(event));
    surface.addEventListener('pointerup',event=>this.end(event,true));
    for(const type of ['pointercancel','lostpointercapture'])surface.addEventListener(type,event=>this.end(event,false));
    surface.addEventListener('wheel',event=>{
      if(!this.enabled||event.ctrlKey||event.metaKey||!event.deltaY||this.getSettings().camera==='cockpit')return;
      event.preventDefault();
      this.onZoom(Math.sign(event.deltaY));
    },{passive:false});
  }

  setEnabled(enabled) {
    if(this.enabled===enabled)return;
    this.enabled=enabled;
    this.surface?.classList.toggle('camera-look-enabled',enabled);
    if(!enabled)this.cancel();
  }

  start(event) {
    if(!this.enabled||this.pointer||event.button!==0||event.pointerType!=='mouse')return;
    this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    try{this.surface.setPointerCapture(event.pointerId);}catch{this.pointer=null;return;}
    event.preventDefault();
    this.surface.classList.add('camera-looking');
  }

  move(event) {
    const pointer=this.pointer;
    if(!pointer||pointer.id!==event.pointerId)return;
    if(!event.buttons){this.end(event,true);return;}
    const speed=this.getSettings().mouseLookSensitivity*.00006;
    this.x=wrapAngle(this.x+(event.clientX-pointer.x)*speed);
    this.y=clamp(this.y+(pointer.y-event.clientY)*speed,-1.2,1.2);
    pointer.x=event.clientX;pointer.y=event.clientY;
    event.preventDefault();
  }

  end(event,released) {
    if(this.pointer?.id!==event.pointerId)return;
    this.cancel(released&&this.getSettings().keepLookAngle);
  }

  cancel(keepAngle=false) {
    const pointer=this.pointer;
    this.pointer=null;
    if(pointer){
      this.surface.classList.remove('camera-looking');
      if(this.surface.hasPointerCapture(pointer.id))this.surface.releasePointerCapture(pointer.id);
    }
    if(!keepAngle)this.x=this.y=0;
  }
}
