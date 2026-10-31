/** Local presentation preferences, independent of aim, inventory and co-op state. */
export const WEAPON_VIEW_DEFAULTS = Object.freeze({weaponSize:.7,weaponPosition:.7,weaponLowering:.12});
export function weaponViewOptions(options={}) {
  const bounded=(key,min,max)=>Number.isFinite(options[key])?Math.max(min,Math.min(max,options[key])):WEAPON_VIEW_DEFAULTS[key];
  return {weaponSize:bounded('weaponSize',.45,1.1),weaponPosition:bounded('weaponPosition',.4,.82),weaponLowering:bounded('weaponLowering',-.2,.3)};
}
export function weaponViewTransform(options,width,height) {
  const view=weaponViewOptions(options),scale=Math.min(width/400,height/270)*.9*view.weaponSize;
  // Vertical adjustment follows the sprite's size, not the screen height:
  // even a tall phone keeps the muzzle visible at the lowest setting.
  const portraitClearance=height>width?Math.min(height*.1,width*.2):0;
  return {scale,x:width*view.weaponPosition,y:height-portraitClearance+(12+180*view.weaponLowering)*scale};
}
