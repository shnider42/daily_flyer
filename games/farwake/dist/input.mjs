import { stickInput, protectGameSurface } from './shared/pgi-controls.mjs';

// DFE pointer ownership: every control keeps its own initiating finger.
export class Controls {
 constructor({stick,knob,fire,mine,boost,active,onCommand}){
  this.keys=new Set();this.held=new Map();this.move={x:0,y:0};this.owner=null;this.stick=stick;this.knob=knob;this.active=active;this.onCommand=onCommand;this.cancellers=[];
  [stick,fire,mine,boost].forEach(protectGameSurface);
  stick.addEventListener('pointerdown',e=>{if(!active()||this.owner!==null||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();this.owner=e.pointerId;stick.setPointerCapture(e.pointerId);this.updateStick(e);});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===this.owner)this.updateStick(e);});
  const release=e=>{if(e.pointerId!==this.owner)return;this.owner=null;this.move={x:0,y:0};knob.style.transform='translate(0,0)';};
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>stick.addEventListener(name,release));
  this.bind(fire,'fire');this.bind(mine,'mine');this.bind(boost,'boost');
  window.addEventListener('keydown',e=>{
   if(['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;
   const commands={KeyE:'interact',KeyM:'galaxy',KeyJ:'journal',KeyI:'ship',KeyC:'cabin',Escape:'pause',KeyP:'pause',KeyF:'scan'};
   if(commands[e.code]&&!e.repeat){e.preventDefault();onCommand(commands[e.code]);return;}
   if(!active())return;
   if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyR','ShiftLeft','ShiftRight','KeyX'].includes(e.code)){e.preventDefault();this.keys.add(e.code);}
  });
  window.addEventListener('keyup',e=>this.keys.delete(e.code));
  window.addEventListener('blur',()=>this.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
 }
 updateStick(e){const r=this.stick.getBoundingClientRect(),v=stickInput(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,r.width*.36);this.move={x:v.x,y:-v.y};this.knob.style.transform=`translate(${v.px}px,${v.py}px)`;}
 bind(el,action){let owner=null;const finish=e=>{if(e.pointerId!==owner)return;owner=null;this.held.delete(action);el.classList.remove('held');};el.addEventListener('pointerdown',e=>{if(!this.active()||owner!==null||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();owner=e.pointerId;el.setPointerCapture(owner);el.classList.add('held');this.held.set(action,owner);if(action==='fire')this.onCommand('primaryDown');});for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,finish);el.addEventListener('click',e=>{if(e.detail===0&&this.active()){this.onCommand(action==='fire'?'primaryDown':action);}});this.cancellers.push(()=>{if(owner===null)return;const id=owner;finish({pointerId:id});if(el.hasPointerCapture?.(id))el.releasePointerCapture(id);});}
 vector(){let x=this.move.x+(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0),y=this.move.y+(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0);const d=Math.max(1,Math.hypot(x,y));return{x:x/d,y:y/d,fire:this.held.has('fire')||this.keys.has('Space'),mine:this.held.has('mine')||this.keys.has('KeyR'),boost:this.held.has('boost')||this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'),brake:this.keys.has('KeyX')};}
 clear(){for(const cancel of this.cancellers)cancel();const owner=this.owner;this.owner=null;if(owner!==null&&this.stick.hasPointerCapture?.(owner))this.stick.releasePointerCapture(owner);this.keys.clear();this.held.clear();this.move={x:0,y:0};this.knob.style.transform='translate(0,0)';}
}
