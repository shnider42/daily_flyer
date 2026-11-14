// KeyboardEvent.code keeps each binding on the same physical key across layouts.
export const BINDING_ACTIONS = Object.freeze([
  {id:'pitchUp',label:'Pitch up',group:'Flight movement',defaultCode:'ArrowDown'},
  {id:'pitchDown',label:'Pitch down',group:'Flight movement',defaultCode:'ArrowUp'},
  {id:'yawLeft',label:'Yaw left',group:'Flight movement',defaultCode:'KeyA'},
  {id:'yawRight',label:'Yaw right',group:'Flight movement',defaultCode:'KeyD'},
  {id:'throttleUp',label:'More thrust',group:'Flight movement',defaultCode:'KeyW'},
  {id:'throttleDown',label:'Less thrust',group:'Flight movement',defaultCode:'KeyS'},
  {id:'rollLeft',label:'Roll left',group:'Flight movement',defaultCode:'ArrowLeft'},
  {id:'rollRight',label:'Roll right',group:'Flight movement',defaultCode:'ArrowRight'},
  {id:'startup',label:'Next engine-start step',group:'Aircraft systems',defaultCode:'Enter'},
  {id:'gear',label:'Landing gear',group:'Aircraft systems',defaultCode:'KeyG'},
  {id:'flaps',label:'Flaps',group:'Aircraft systems',defaultCode:'KeyF'},
  {id:'brake',label:'Brakes',group:'Aircraft systems',defaultCode:'KeyB'},
  {id:'level',label:'Level recovery',group:'Aircraft systems',defaultCode:'KeyL'},
  {id:'hover',label:'Hover mode',group:'Aircraft systems',defaultCode:'KeyH'},
  {id:'bailout',label:'Bail out',group:'Aircraft systems',defaultCode:'KeyY'},
  {id:'fire',label:'Fire guns',group:'Weapons & targeting',defaultCode:'Space'},
  {id:'target',label:'Select target',group:'Weapons & targeting',defaultCode:'KeyT'},
  {id:'missile',label:'Launch missile',group:'Weapons & targeting',defaultCode:'KeyM'},
  {id:'payload',label:'Release payload',group:'Weapons & targeting',defaultCode:'KeyV'},
  {id:'countermeasure',label:'Countermeasures',group:'Weapons & targeting',defaultCode:'KeyX'},
  {id:'radar',label:'Radar',group:'Weapons & targeting',defaultCode:'KeyR'},
  {id:'camera',label:'Change camera',group:'View & pause',defaultCode:'KeyC'},
  {id:'pause',label:'Pause',group:'View & pause',defaultCode:'KeyP'},
].map(action=>Object.freeze(action)));

export const DEFAULT_KEY_BINDINGS = Object.freeze(Object.fromEntries(BINDING_ACTIONS.map(({id,defaultCode})=>[id,defaultCode])));

// Crew controls have their own bindings because the gunner never flies a second
// aircraft. Reusing a key in the two different roles is intentional.
export const GUNNER_BINDING_ACTIONS = Object.freeze([
  {id:'aimUp',label:'Aim up',group:'Gunner aiming',defaultCode:'ArrowUp'},
  {id:'aimDown',label:'Aim down',group:'Gunner aiming',defaultCode:'ArrowDown'},
  {id:'aimLeft',label:'Aim left',group:'Gunner aiming',defaultCode:'ArrowLeft'},
  {id:'aimRight',label:'Aim right',group:'Gunner aiming',defaultCode:'ArrowRight'},
  {id:'fire',label:'Fire station gun',group:'Gunner stations',defaultCode:'Space'},
  {id:'seat25',label:'25 mm station',group:'Gunner stations',defaultCode:'Digit1'},
  {id:'seat40',label:'40 mm station',group:'Gunner stations',defaultCode:'Digit2'},
  {id:'seat105',label:'105 mm station',group:'Gunner stations',defaultCode:'Digit3'},
  {id:'zoom',label:'Toggle sight zoom',group:'Gunner stations',defaultCode:'KeyZ'},
  {id:'recenter',label:'Centre gun sight',group:'Gunner stations',defaultCode:'KeyC'},
  {id:'target',label:'Mark next target',group:'Gunner stations',defaultCode:'KeyT'},
  {id:'pause',label:'Pause gun station',group:'Gunner stations',defaultCode:'KeyP'},
].map(action=>Object.freeze(action)));
export const DEFAULT_GUNNER_BINDINGS = Object.freeze(Object.fromEntries(GUNNER_BINDING_ACTIONS.map(({id,defaultCode})=>[id,defaultCode])));

const KEY_LABELS = Object.freeze({
  ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Space',Enter:'Enter',
  ShiftLeft:'Left Shift',ShiftRight:'Right Shift',Backspace:'Backspace',Delete:'Delete',
  Insert:'Insert',Home:'Home',End:'End',PageUp:'Page Up',PageDown:'Page Down',
  Backquote:'`',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',
  Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',IntlBackslash:'Intl \\',IntlRo:'Intl Ro',IntlYen:'Intl ¥',
  NumpadEnter:'Num Enter',NumpadAdd:'Num +',NumpadSubtract:'Num −',NumpadMultiply:'Num ×',
  NumpadDivide:'Num /',NumpadDecimal:'Num .',NumpadComma:'Num ,',NumpadEqual:'Num =',
});

// Escape is a fixed pause/cancel key. Tab, function keys, lock keys and browser
// modifiers stay available to browser navigation and operating-system shortcuts.
export function isBindableKey(code){
  return typeof code==='string'&&(/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||Object.hasOwn(KEY_LABELS,code));
}

export function formatKeyCode(code){
  if(code==='Escape')return 'Esc';
  if(!isBindableKey(code))return 'Unassigned';
  if(/^Key[A-Z]$/.test(code))return code.slice(3);
  if(/^Digit[0-9]$/.test(code))return code.slice(5);
  if(/^Numpad[0-9]$/.test(code))return 'Num '+code.slice(6);
  return KEY_LABELS[code];
}

export function normalizeKeyBindings(raw){return normalizeBindings(raw,BINDING_ACTIONS);}
export function normalizeGunnerBindings(raw){return normalizeBindings(raw,GUNNER_BINDING_ACTIONS);}
function normalizeBindings(raw,actions){
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const result={},used=new Set();
  // Reserve valid saved assignments before filling missing/invalid entries. This
  // keeps a custom key from being stolen by another action's default on upgrade.
  for(const {id} of actions){
    if(!Object.hasOwn(source,id))continue;
    const code=source[id];
    if(code===null)result[id]=null;
    else if(isBindableKey(code)){
      result[id]=used.has(code)?null:code;
      used.add(code);
    }
  }
  for(const {id,defaultCode} of actions){
    if(Object.hasOwn(result,id))continue;
    result[id]=used.has(defaultCode)?null:defaultCode;
    if(result[id]!==null)used.add(defaultCode);
  }
  return result;
}
