import {WEAPON_ORDER} from './core.mjs';
// One owner per surface: lifting a second finger must not cancel the first.
export class TouchControls {
  constructor({stick, knob, look, buttons, active, onLook, onAction = () => {}, settings=()=>({fireMode:'separate'}), now=()=>performance.now()}) {
    this.stick = {x:0, y:0};
    this.held = {fire:false, use:false, reload:false};
    this.pulses = {...this.held};
    this.bindings = [];
    this.knob = knob;
    const moveStick = e => {
      const r = stick.getBoundingClientRect(), travel = r.width * .32;
      let x = (e.clientX-r.left-r.width/2)/travel, y = (e.clientY-r.top-r.height/2)/travel;
      const length = Math.max(1, Math.hypot(x,y)); x /= length; y /= length;
      Object.assign(this.stick, {x,y});
      knob.style.transform = `translate(${x*travel}px,${y*travel}px)`;
    };
    this.bind(stick, active, moveStick, moveStick, () => {
      Object.assign(this.stick, {x:0,y:0}); knob.style.transform = '';
    });
    this.lookFire=false;this.lastTap=null;
    let lastX=0,lastY=0,startX=0,startY=0,started=0,moved=false;
    this.bind(look, active, e => {
      lastX=startX=e.clientX;lastY=startY=e.clientY;started=now();moved=false;
      const mode=settings().fireMode,previous=this.lastTap;
      this.lookFire=mode==='hold'||mode==='double'&&previous&&started-previous.time<320&&Math.hypot(startX-previous.x,startY-previous.y)<45;
      this.lastTap=null;if(this.lookFire){this.pulses.fire=true;look.classList.add('firing');onAction();}
    }, e => {
      if(Math.hypot(e.clientX-startX,e.clientY-startY)>12)moved=true;
      onLook(e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;
    }, e => {
      if(e?.type==='pointerup'&&!this.lookFire&&!moved&&now()-started<230)this.lastTap={time:now(),x:startX,y:startY};else this.lastTap=null;
      this.lookFire=false;look.classList.remove('firing');
    });
    for (const [key, element] of Object.entries(buttons)) {
      this.bind(element, active, () => {
        this.held[key]=true;this.pulses[key]=true;onAction();
      }, undefined, () => {this.held[key]=false;});
    }
  }
  bind(element, active, start, move = () => {}, end = () => {}) {
    const binding = {element, pointer:null, end}; this.bindings.push(binding);
    element.addEventListener('pointerdown', e => {
      if (!active() || binding.pointer !== null) return;
      e.preventDefault(); binding.pointer=e.pointerId;
      element.setPointerCapture(e.pointerId); element.classList.add('engaged'); start(e);
    });
    element.addEventListener('pointermove', e => {
      if (e.pointerId === binding.pointer && active()) move(e);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      element.addEventListener(type, e => {
        if (e.pointerId !== binding.pointer) return;
        binding.pointer=null; element.classList.remove('engaged');end(e);
      });
    }
  }
  consume() {
    const actions = Object.fromEntries(Object.keys(this.held).map(key => [key,this.held[key]||this.pulses[key]||(key==='fire'&&!!this.lookFire)]));
    for (const key of Object.keys(this.pulses)) this.pulses[key]=false;
    return actions;
  }
  reset() {
    for (const binding of this.bindings) {
      const id=binding.pointer;binding.pointer=null;
      if (id !== null && binding.element.hasPointerCapture(id)) binding.element.releasePointerCapture(id);
      binding.element.classList.remove('engaged');binding.end();
    }
    for (const key of Object.keys(this.pulses)) this.held[key]=this.pulses[key]=false;
  }
}

// Network liveness must not depend on requestAnimationFrame (GPU stalls,
// browser overlays and resizing can suspend rendering while a page is visible).
export function startControlStream({active, read, send, schedule = setInterval}) {
  return schedule(() => {if (active()) send(read());}, 1000/30);
}

export function bindGameLifecycle({window, document, touch, reset, pause, active}) {
  // Focus can briefly move to browser UI or a touch control without hiding the
  // game. Clear desktop keys, but only actual backgrounding pauses the world.
  window.addEventListener('blur', () => {if (!touch) reset();});
  const background = () => {if (active()) {reset();pause('background');}};
  document.addEventListener('visibilitychange', () => {if (document.hidden) background();});
  window.addEventListener('pagehide', background);
}

export function preferTouchControls({coarse, fine, touchPoints, force}) {
  // Touchscreen laptops still use mouse/keyboard unless touch is requested.
  return force || coarse || (touchPoints > 0 && !fine);
}

export function bindDesktopControls({document, canvas, keys, pulses, active, touch, lock, pause, reset, onFire, onLook, selectWeapon}) {
  let hadPointerLock=false;
  canvas.addEventListener('click',lock);
  document.addEventListener('keydown',e=>{
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable||!active()) return;
    if (e.code==='Escape') {pause();return;}
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    const action={Space:'fire',KeyE:'use',KeyR:'reload'}[e.code];
    if(action&&!e.repeat)pulses[action]=true;
    if(!e.repeat&&/^Digit[1-6]$/.test(e.code))selectWeapon(WEAPON_ORDER[Number(e.code.at(-1))-1]);
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&active())onLook(e.movementX,e.movementY);});
  canvas.addEventListener('mousedown',e=>{if(e.button===0&&document.pointerLockElement===canvas&&active()){onFire(true);pulses.fire=true;}});
  document.addEventListener('mouseup',()=>onFire(false));
  document.addEventListener('pointerlockchange',()=>{
    const locked=document.pointerLockElement===canvas,lost=hadPointerLock&&!locked;hadPointerLock=locked;
    if(lost&&!touch&&active()){reset();pause();}
  });
}
