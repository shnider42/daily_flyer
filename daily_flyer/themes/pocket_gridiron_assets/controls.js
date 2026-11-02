// Gameplay buttons respond on contact. Keep the later compatibility click from
// firing a second action, while retaining keyboard and assistive-tech clicks.
export function bindGameButton(button, action) {
  const activate = () => {
    if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') action();
  };
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    button.classList?.add('is-pressed');
    // Do not filter isPrimary: the other thumb may be holding the joystick.
    activate();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture','pointerleave'])button.addEventListener(type,()=>button.classList?.remove('is-pressed'));
  button.addEventListener('click', event => {
    event.preventDefault();
    if (event.detail === 0) activate();
  });
}

export function primaryCommand(game){
  if(!game||game.paused)return null;
  if(game.phase==='penalty')return 'accept';
  if(['kick_ready','kick_charge'].includes(game.phase))return 'kick';
  if(game.phase==='ready')return game.userOffense?'snap':null;
  if(game.userOffense&&game.breakAvailable)return 'break';
  if(game.userOffense&&(game.contact||game.breakArm))return null;
  if(game.isLive&&(!game.userOffense||!game.pass)&&(game.userOffense?game.burstCooldown<=0&&(game.stamina??100)>=12:game.diveCooldown<=0))return 'burst';
  return null;
}

export function stickInput(dx,dy,radius){
  const length=Math.hypot(dx,dy),travel=Math.min(1,length/radius),amount=Math.max(0,(travel-.12)/.88);
  return {x:length?dx/length*amount:0,y:length?-dy/length*amount:0,px:length?dx/length*travel*radius:0,py:length?dy/length*travel*radius:0};
}

// Read at the instant a receiver button is pressed, not the previous frame.
export function movementInput(stick={},keys={}){
 const x=(stick.x||0)+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),y=(stick.y||0)+(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0),n=Math.max(1,Math.hypot(x,y));
 return {x:x/n,y:y/n};
}

export function setGameButtonEnabled(button, enabled) {
  // Native disabled controls can stop receiving the events that cancel Safari
  // gestures. Keep receiver/burst surfaces responsive even during cooldowns.
  button.setAttribute('aria-disabled', String(!enabled));
}

export function protectGameSurface(surface) {
  const cancel = event => { if (event.target?.closest?.('.quickcall')&&event.type.startsWith('touch'))return;if (event.cancelable) event.preventDefault(); };
  // Scoped to the playing surfaces; menus and dialogs retain normal scrolling
  // and pinch zoom. Explicit cancellation also covers rapid taps between keys.
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    surface.addEventListener(type, cancel, {passive: false});
  }
  for (const type of ['dblclick', 'contextmenu', 'gesturestart']) {
    surface.addEventListener(type, cancel);
  }
}
