export const VERSION = '0.1.0';
export const DEFAULTS = Object.freeze({
  assist:'assisted',guidance:'guided',stickSize:104,buttonSize:58,controlOpacity:80,
  sensitivity:1,lookSensitivity:1,deadZone:12,invertPitch:false,leftHanded:false,
  offsetX:22,offsetY:22,lookPad:true,sound:true,volume:60,engineVolume:60,
  effectsVolume:70,reducedMotion:false,highContrast:false,largeText:false,
  quality:'auto',camera:'chase',autoLevel:true,units:'metric',captions:true,
});
export const RANGES={stickSize:[80,152],buttonSize:[44,76],controlOpacity:[35,100],sensitivity:[0.4,1.8],lookSensitivity:[0.4,2],deadZone:[0,30],offsetX:[12,80],offsetY:[12,90],volume:[0,100],engineVolume:[0,100],effectsVolume:[0,100]};
const ENUMS={assist:['assisted','standard','expert'],guidance:['guided','standard','minimal'],quality:['auto','low','high'],camera:['chase','cockpit','cinematic'],units:['metric','aviation']};
export function normalizeSettings(raw={}) {
  const s={...DEFAULTS};
  for(const [k,v] of Object.entries(raw||{})) {
    if(RANGES[k]&&Number.isFinite(v))s[k]=Math.max(RANGES[k][0],Math.min(RANGES[k][1],v));
    else if(ENUMS[k]?.includes(v))s[k]=v;
    else if(typeof DEFAULTS[k]==='boolean'&&typeof v==='boolean')s[k]=v;
  }
  return s;
}
export function loadSettings(storage=globalThis.localStorage) {
  try {const raw=storage.getItem('dfe.skyward.settings.v1');return raw?normalizeSettings(JSON.parse(raw)):normalizeSettings({reducedMotion:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false});}catch{return {...DEFAULTS};}
}
export function saveSettings(settings,storage=globalThis.localStorage){try{storage.setItem('dfe.skyward.settings.v1',JSON.stringify(normalizeSettings(settings)));return true;}catch{return false;}}
export function loadProgress(storage=globalThis.localStorage){try{const p=JSON.parse(storage.getItem('dfe.skyward.logbook.v1')||'{}');return {completed:p.completed&&typeof p.completed==='object'?p.completed:{},lastMission:typeof p.lastMission==='string'?p.lastMission:null,totalTime:Number.isFinite(p.totalTime)?p.totalTime:0};}catch{return {completed:{},lastMission:null,totalTime:0};}}
export function saveProgress(progress,storage=globalThis.localStorage){try{storage.setItem('dfe.skyward.logbook.v1',JSON.stringify(progress));return true;}catch{return false;}}
export function applySettings(s){
  const r=document.documentElement;
  for(const [k,v] of Object.entries({'--stick-size':s.stickSize+'px','--button-size':s.buttonSize+'px','--control-opacity':s.controlOpacity/100,'--control-x':s.offsetX+'px','--control-y':s.offsetY+'px'}))r.style.setProperty(k,v);
  r.classList.toggle('left-handed',s.leftHanded);r.classList.toggle('reduce-motion',s.reducedMotion);r.classList.toggle('high-contrast',s.highContrast);r.classList.toggle('large-text',s.largeText);r.classList.toggle('hide-look-pad',!s.lookPad);
}
