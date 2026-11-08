import { stickInput, protectGameSurface } from './shared/pgi-controls.mjs';
import { mobileFlightInput } from './mobile-flight.mjs';

const held=(keys,...names)=>names.some(name=>keys.has(name));
const clamp=n=>Math.max(-1,Math.min(1,n));

/** Pure keyboard/touch mapping; walking and vessel control remain separate axes. */
export function inputVector({keys=new Set(),move={x:0,y:0},aim={x:0,y:0},buttons=new Set(),mode='ship',combat=false,ship={},flightAssist=true}={}) {
  const onFootCombat=mode==='person'&&combat,arrowX=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),arrowY=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
  let x=move.x+Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+(onFootCombat?0:arrowX);
  let y=move.y+Number(keys.has('KeyS'))-Number(keys.has('KeyW'))+(onFootCombat?0:arrowY);
  const magnitude=Math.max(1,Math.hypot(x,y));
  const touchFlight=mode==='person'?{thrust:0,turn:0}:mobileFlightInput(move,ship||{},{flightAssist});
  const thrust=clamp(touchFlight.thrust+Number(held(keys,'KeyW','ArrowUp'))-Number(held(keys,'KeyS','ArrowDown')));
  const strafe=clamp(aim.x+Number(held(keys,'KeyD'))-Number(held(keys,'KeyA')));
  const turn=clamp(touchFlight.turn+Number(held(keys,'ArrowRight'))-Number(held(keys,'ArrowLeft')));
  const aimX=mode==='person'?clamp(aim.x+(onFootCombat?arrowX:0)):0,aimY=mode==='person'?clamp(aim.y+(onFootCombat?arrowY:0)):0,aimLength=Math.hypot(aimX,aimY);
  return {x:x/magnitude,y:y/magnitude,thrust:mode==='person'?0:thrust,strafe:mode==='person'?0:strafe,turn:mode==='person'?0:turn,aimX,aimY,aiming:onFootCombat&&aimLength>.2,
    fire:buttons.has('fire')||keys.has('Space')||mode==='person'&&(onFootCombat?Math.hypot(aim.x,aim.y)>.35:aim.y<-.45),mine:buttons.has('mine')||keys.has('KeyR'),
    boost:buttons.has('boost')||held(keys,'ShiftLeft','ShiftRight'),brake:buttons.has('brake')||keys.has('KeyX')};
}

// Every control owns its initiating pointer; releasing one never cancels the others.
export class Controls {
  constructor({stick,knob,aimStick=null,aimKnob=null,getMode=()=> 'ship',getCombat=()=>false,getFlightState=null,getShip=()=>null,fire,mine,boost,brake=null,active,onCommand}) {
    this.keys=new Set();this.held=new Map();this.move={x:0,y:0};this.aim={x:0,y:0};
    this.owner=null;this.aimOwner=null;this.stick=stick;this.knob=knob;this.aimStick=aimStick;this.aimKnob=aimKnob;
    this.active=active;this.onCommand=onCommand;this.getMode=getMode;this.getCombat=getCombat;this.getFlightState=getFlightState||(()=>({ship:getShip()}));this.cancellers=[];
    [stick,aimStick,fire,mine,boost,brake].filter(Boolean).forEach(protectGameSurface);
    this.bindStick(stick,knob,false);if(aimStick)this.bindStick(aimStick,aimKnob,true);
    this.bind(fire,'fire');this.bind(mine,'mine');this.bind(boost,'boost');this.bind(brake,'brake');
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
  bindStick(element,knob,aim) {
    if(!element)return;
    const ownerKey=aim?'aimOwner':'owner',valueKey=aim?'aim':'move';
    const update=e=>{
      const r=element.getBoundingClientRect(),horizontalOnly=aim&&this.getMode()!=='person',v=stickInput(e.clientX-r.left-r.width/2,horizontalOnly?0:e.clientY-r.top-r.height/2,r.width*.36);
      this[valueKey]={x:v.x,y:-v.y};if(knob)knob.style.transform=`translate(${v.px}px,${v.py}px)`;
    };
    element.addEventListener('pointerdown',e=>{
      if(!this.active()||this[ownerKey]!==null||(e.pointerType==='mouse'&&e.button!==0))return;
      e.preventDefault();this[ownerKey]=e.pointerId;element.setPointerCapture(e.pointerId);update(e);
    });
    element.addEventListener('pointermove',e=>{if(e.pointerId===this[ownerKey])update(e);});
    const release=e=>{if(e.pointerId!==this[ownerKey])return;this[ownerKey]=null;this[valueKey]={x:0,y:0};if(knob)knob.style.transform='translate(0,0)';};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,release);
    this.cancellers.push(()=>{const id=this[ownerKey];if(id===null)return;release({pointerId:id});if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);});
  }
  updateStick(e) {
    const r=this.stick.getBoundingClientRect(),v=stickInput(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,r.width*.36);
    this.move={x:v.x,y:-v.y};if(this.knob)this.knob.style.transform=`translate(${v.px}px,${v.py}px)`;
  }
  bind(el,action) {
    if(!el)return;
    let owner=null;
    const finish=e=>{if(e.pointerId!==owner)return;owner=null;this.held.delete(action);el.classList.remove('held');};
    el.addEventListener('pointerdown',e=>{
      if(!this.active()||owner!==null||(e.pointerType==='mouse'&&e.button!==0))return;
      e.preventDefault();owner=e.pointerId;el.setPointerCapture(owner);el.classList.add('held');this.held.set(action,owner);
      if(action==='fire')this.onCommand('primaryDown');
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,finish);
    el.addEventListener('click',e=>{if(e.detail===0&&this.active())this.onCommand(action==='fire'?'primaryDown':action);});
    this.cancellers.push(()=>{if(owner===null)return;const id=owner;finish({pointerId:id});if(el.hasPointerCapture?.(id))el.releasePointerCapture(id);});
  }
  vector(){const state=this.getFlightState()||{};return inputVector({keys:this.keys,move:this.move,aim:this.aim,buttons:this.held,mode:this.getMode(),combat:this.getCombat(),ship:state.ship||state,flightAssist:state.flightAssist!==false});}
  clear(){for(const cancel of this.cancellers)cancel();this.keys.clear();this.held.clear();this.move={x:0,y:0};this.aim={x:0,y:0};}
}
