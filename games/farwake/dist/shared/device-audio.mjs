// Safari's speaker route needs a media playback session, not ambient game audio.
// Call from a trusted gesture, before creating/resuming the AudioContext.
export function playbackSession(nav = globalThis.navigator) {
  try {
    if (nav?.audioSession && nav.audioSession.type !== "playback")
      nav.audioSession.type = "playback";
  } catch {
    /* Feature is optional. */
  }
}
export function bindAudioActivation(
  unlock,
  {
    target = globalThis.document,
    win = globalThis.window,
    nav = globalThis.navigator,
    enabled = () => true,
  } = {},
) {
  const activate = (e) => {
    if (e?.isTrusted === false || target.hidden || !enabled()) return;
    unlock();
  };
  // touchend is intentional: iOS may not grant audio activation on pointerdown.
  for (const name of ["pointerdown", "touchend", "keydown"])
    target.addEventListener(name, activate, { capture: true, passive: true });
  const restore = () => {
    if (!target.hidden && enabled()) unlock();
  };
  target.addEventListener("visibilitychange", restore);
  win?.addEventListener("pageshow", restore);
  nav?.mediaDevices?.addEventListener?.("devicechange", restore);
  return activate;
}
