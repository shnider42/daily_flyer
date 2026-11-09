/* Apply a bounded, local presentation impulse after the normal camera solve.
 * The camera is rebuilt from the aircraft each frame; no kick is accumulated
 * into flight attitude, camera smoothing, or weapon aiming. */
const value=(n,limit)=>Number.isFinite(n)?Math.max(-limit,Math.min(limit,n)):0;
export function applyCombatCameraKick(camera,kick,reducedMotion=false){
  if(!kick||reducedMotion)return;
  camera.translateX(value(kick.x,.35));
  camera.translateY(value(kick.y,.3));
  camera.rotateX(value(kick.pitch,.045));
  camera.rotateY(value(kick.yaw,.04));
  camera.rotateZ(value(kick.roll,.055));
}
