// Gameplay buttons respond on contact. Keep the later compatibility click from
// firing a second action, while retaining keyboard and assistive-tech clicks.
export function bindGameButton(button, action) {
  const activate = () => {
    if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') action();
  };
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    // Do not filter isPrimary: the other thumb may be holding the joystick.
    activate();
  });
  button.addEventListener('click', event => {
    event.preventDefault();
    if (event.detail === 0) activate();
  });
}

export function setGameButtonEnabled(button, enabled) {
  // Native disabled controls can stop receiving the events that cancel Safari
  // gestures. Keep receiver/burst surfaces responsive even during cooldowns.
  button.setAttribute('aria-disabled', String(!enabled));
}

export function protectGameSurface(surface) {
  const cancel = event => { if (event.cancelable) event.preventDefault(); };
  // Scoped to the playing surfaces; menus and dialogs retain normal scrolling
  // and pinch zoom. Explicit cancellation also covers rapid taps between keys.
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    surface.addEventListener(type, cancel, {passive: false});
  }
  for (const type of ['dblclick', 'contextmenu', 'gesturestart']) {
    surface.addEventListener(type, cancel);
  }
}
