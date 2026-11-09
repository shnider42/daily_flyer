import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readSettings, applySettings} from '../dist/ui.mjs';
import {normalizeWorldZoom} from '../dist/camera-view.mjs';

const SETTINGS_KEY='dfe.farwake.settings.v1';

function settingsBoundary(initial=null) {
  const entries=new Map([
    ['dfe.farwake.save.v1','normal-voyage-to-preserve'],
    ['dfe.farwake.action-guide.v1','learned-actions-to-preserve'],
  ]);
  if(initial!==null)entries.set(SETTINGS_KEY,typeof initial==='string'?initial:JSON.stringify(initial));
  const writes=[],classNames=new Set(),properties=new Map();
  const original=new Map(['window','document','localStorage'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.assign(globalThis,{
    window:{matchMedia:()=>({matches:false})},
    document:{
      body:{classList:{toggle(name,on){if(on)classNames.add(name);else classNames.delete(name);},add(...names){names.forEach(name=>classNames.add(name));},remove(...names){names.forEach(name=>classNames.delete(name));},contains:name=>classNames.has(name)}},
      documentElement:{style:{setProperty(name,value){properties.set(name,value);}}},
    },
    localStorage:{getItem:key=>entries.get(key)??null,setItem(key,value){writes.push([key,value]);entries.set(key,value);}},
  });
  return {entries,writes,classNames,properties,restore(){for(const[name,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}};
}

test('new mobile view defaults preserve the established camera, text, and control scales',()=>{
  const boundary=settingsBoundary();
  try{
    const settings=readSettings();
    assert.equal(settings.worldZoom,1);
    assert.equal(settings.immersiveHud,true);
    assert.equal(settings.translucentHud,true);
    assert.equal(settings.compactTips,true);
    assert.equal(settings.textScale,1);
    assert.equal(settings.controlScale,1);
    assert.equal(boundary.writes.length,0,'Reading preferences does not mutate a voyage or browser storage.');
  }finally{boundary.restore();}
});

test('an existing captain receives the new default view without losing their prior accessibility and control preferences',()=>{
  const boundary=settingsBoundary({guidance:'moderate',textScale:1.45,controlScale:1.15,leftHanded:true,sound:false,flightAssist:false});
  try{
    const settings=readSettings();
    assert.equal(settings.worldZoom,1);
    assert.equal(settings.immersiveHud,true);
    assert.equal(settings.translucentHud,true);
    assert.equal(settings.compactTips,true);
    assert.equal(settings.guidance,'moderate');
    assert.equal(settings.textScale,1.45);
    assert.equal(settings.controlScale,1.15);
    assert.equal(settings.leftHanded,true);
    assert.equal(settings.sound,false);
    assert.equal(settings.flightAssist,false);
    assert.equal(boundary.entries.get('dfe.farwake.save.v1'),'normal-voyage-to-preserve');
  }finally{boundary.restore();}
});

test('view toggles persist independently and changing zoom never scales text or thumb controls',()=>{
  const boundary=settingsBoundary({textScale:1.4,controlScale:1.2,leftHanded:true});
  try{
    const settings=readSettings();
    Object.assign(settings,{worldZoom:.6,immersiveHud:false,translucentHud:false,compactTips:false});
    applySettings(settings);
    assert.equal(boundary.properties.get('--font-scale'),'1.4');
    assert.equal(boundary.properties.get('--control-scale'),'1.2');
    assert.equal(boundary.classNames.has('immersive-hud'),false);
    assert.equal(boundary.classNames.has('translucent-hud'),false);
    assert.equal(boundary.classNames.has('compact-tips'),false);
    let restored=readSettings();
    assert.equal(restored.worldZoom,.6);
    assert.equal(restored.immersiveHud,false);
    assert.equal(restored.translucentHud,false);
    assert.equal(restored.compactTips,false);
    assert.equal(restored.leftHanded,true);
    Object.assign(settings,{worldZoom:1.6,immersiveHud:true,translucentHud:true,compactTips:true});
    applySettings(settings);
    restored=readSettings();
    assert.equal(restored.worldZoom,1.6);
    assert.equal(boundary.classNames.has('immersive-hud'),true);
    assert.equal(boundary.classNames.has('translucent-hud'),true);
    assert.equal(boundary.classNames.has('compact-tips'),true);
    assert.equal(boundary.properties.get('--font-scale'),'1.4');
    assert.equal(boundary.properties.get('--control-scale'),'1.2');
    assert.deepEqual(boundary.writes.map(([key])=>key),[SETTINGS_KEY,SETTINGS_KEY]);
    assert.equal(boundary.entries.get('dfe.farwake.save.v1'),'normal-voyage-to-preserve');
    assert.equal(boundary.entries.get('dfe.farwake.action-guide.v1'),'learned-actions-to-preserve');
  }finally{boundary.restore();}
});

test('out-of-range and invalid zoom preferences cannot create a broken camera viewport',()=>{
  const boundary=settingsBoundary();
  try{
    const settings=readSettings();
    for(const[value,expected]of [[.1,.6],[20,1.6],['1.35',1.35],['invalid',1],[NaN,1],[Infinity,1]]){
      settings.worldZoom=value;
      applySettings(settings);
      assert.equal(settings.worldZoom,expected,String(value));
      assert.equal(settings.textScale,1);
      assert.equal(settings.controlScale,1);
    }
  }finally{boundary.restore();}
});

test('malformed stored preferences recover the new view defaults without touching the saved voyage',()=>{
  const boundary=settingsBoundary('{broken-json');
  try{
    const settings=readSettings();
    assert.equal(settings.worldZoom,1);
    assert.equal(settings.immersiveHud,true);
    assert.equal(settings.translucentHud,true);
    assert.equal(settings.compactTips,true);
    assert.equal(boundary.entries.get('dfe.farwake.save.v1'),'normal-voyage-to-preserve');
    assert.equal(boundary.writes.length,0);
  }finally{boundary.restore();}
});

// Use the real application handlers, with only their DOM and presentation
// boundaries replaced. The zoom controls must never enter the game-command or
// save paths, regardless of whether this is a normal voyage or a test exercise.
const appSource=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...appSource.matchAll(/^(?:async )?function (\w+)\(/gm)];
const appDeclaration=name=>{
  const index=declarations.findIndex(match=>match[1]===name);
  assert.ok(index>=0,`The application declares ${name}.`);
  return appSource.slice(declarations[index].index,declarations[index+1]?.index??appSource.length);
};
const viewCode=['syncViewControls','setWorldZoom','setViewPreference','resetView','setViewPanel','closeContacts','setToolTray'].map(appDeclaration).join('\n');

function viewFixture(boundary,{practice=false}={}) {
  const elements=new Map(),effects=[],settings=readSettings();
  Object.assign(settings,{textScale:1.4,controlScale:1.2,leftHanded:true,guidance:'moderate'});
  const game=Object.freeze({state:Object.freeze({mode:'ship',credits:623,ship:Object.freeze({x:120,y:350,vx:40,vy:16,angle:1.2}),seed:practice?'isolated-practice':'normal-voyage'})});
  const getElement=id=>{
    if(!elements.has(id))elements.set(id,{hidden:id==='viewPanel',value:'',textContent:'',checked:false,disabled:false,attributes:{},setAttribute(name,value){this.attributes[name]=value;},focus(options){effects.push(['focus',id,options]);}});
    return elements.get(id);
  };
  const context=vm.createContext({
    $,settings,game,testSession:practice?{game}:null,playing:true,dialog:{opened:false},viewPanelOpen:false,toolTrayOpen:true,coachExpanded:true,labelLayoutDirty:false,hudDirty:false,
    document:globalThis.document,normalizeWorldZoom,applySettings,hudText:(target,text)=>{target.textContent=text;},
    controls:{clear(){effects.push(['clear-controls']);}},clearPointerAim(){effects.push(['clear-aim']);},hideCoach(){effects.push(['hide-coach']);},
    resize(){effects.push(['resize']);},updatePerformanceHUD(){effects.push(['performance']);},
    saveGame(){throw new Error('Changing a view must not write a voyage save.');},saveNow(){throw new Error('Changing a view must not invoke game persistence.');},
    invoke(){throw new Error('Changing a view must not invoke a gameplay command.');},network:{command(){throw new Error('Changing a view must not send a multiplayer command.');}},
  });
  function $(id){return getElement(id);}
  vm.runInContext(viewCode,context);
  return {context,elements,effects,settings,game,getElement,call:(name,...args)=>context[name](...args)};
}

test('actual zoom controls change only the local camera preference in normal and practice play',()=>{
  for(const practice of [false,true]){
    const boundary=settingsBoundary();
    try{
      const f=viewFixture(boundary,{practice}),before=JSON.stringify(f.game);
      f.call('setWorldZoom',.6);
      assert.equal(f.getElement('worldZoomValue').textContent,'60%');
      assert.equal(f.getElement('worldZoom').attributes['aria-valuetext'],'60 percent world zoom');
      assert.equal(f.getElement('zoomOutView').disabled,true);
      assert.equal(f.getElement('zoomInView').disabled,false);
      f.call('setWorldZoom',1.6);
      assert.equal(f.getElement('worldZoomValue').textContent,'160%');
      assert.equal(f.getElement('zoomOutView').disabled,false);
      assert.equal(f.getElement('zoomInView').disabled,true);
      assert.equal(f.settings.textScale,1.4);
      assert.equal(f.settings.controlScale,1.2);
      assert.equal(f.settings.leftHanded,true);
      assert.equal(f.settings.guidance,'moderate');
      assert.equal(f.context.playing,true);
      assert.equal(f.context.dialog.opened,false);
      assert.equal(JSON.stringify(f.game),before);
      assert.ok(f.effects.some(([effect])=>effect==='clear-aim'));
      assert.equal(f.context.labelLayoutDirty,true);
      assert.deepEqual(boundary.writes.map(([key])=>key),[SETTINGS_KEY,SETTINGS_KEY]);
      assert.equal(boundary.entries.get('dfe.farwake.save.v1'),'normal-voyage-to-preserve');
    }finally{boundary.restore();}
  }
});

test('the actual View popup clears held actions, replaces other overlays, and returns focus without pausing play',()=>{
  const boundary=settingsBoundary();
  try{
    const f=viewFixture(boundary),before=JSON.stringify(f.game);
    f.call('setViewPanel',true);
    assert.equal(f.context.viewPanelOpen,true);
    assert.equal(f.getElement('viewPanel').hidden,false);
    assert.equal(f.getElement('viewButton').attributes['aria-expanded'],'true');
    assert.equal(f.getElement('contactsPanel').hidden,true);
    assert.equal(f.getElement('toolTray').hidden,true);
    assert.equal(f.context.toolTrayOpen,false);
    assert.ok(f.effects.some(([effect])=>effect==='clear-controls'));
    assert.ok(f.effects.some(([effect])=>effect==='clear-aim'));
    assert.ok(f.effects.some(([effect])=>effect==='hide-coach'));
    assert.deepEqual(f.effects.filter(([effect])=>effect==='focus').map(([,id])=>id),['worldZoom']);
    assert.equal(f.context.playing,true);
    assert.equal(f.context.dialog.opened,false);
    f.call('setViewPanel',false);
    assert.equal(f.getElement('viewPanel').hidden,true);
    assert.equal(f.getElement('viewButton').attributes['aria-expanded'],'false');
    assert.deepEqual(f.effects.filter(([effect])=>effect==='focus').map(([,id])=>id),['worldZoom','viewButton']);
    assert.equal(JSON.stringify(f.game),before);
    assert.equal(boundary.writes.length,0);
  }finally{boundary.restore();}
});

test('the View popup cannot open over the title or an active dialog, and closing for a dialog does not steal focus',()=>{
  const boundary=settingsBoundary();
  try{
    const f=viewFixture(boundary);
    f.context.playing=false;f.call('setViewPanel',true);
    assert.equal(f.context.viewPanelOpen,false);
    assert.equal(f.getElement('viewPanel').hidden,true);
    f.context.playing=true;f.context.dialog.opened=true;f.call('setViewPanel',true);
    assert.equal(f.context.viewPanelOpen,false);
    assert.equal(f.effects.length,0);
    f.context.dialog.opened=false;f.call('setViewPanel',true);
    f.call('setViewPanel',false,{restoreFocus:false});
    assert.equal(f.context.viewPanelOpen,false);
    assert.deepEqual(f.effects.filter(([effect])=>effect==='focus').map(([,id])=>id),['worldZoom']);
    assert.equal(boundary.writes.length,0);
  }finally{boundary.restore();}
});

test('view layout changes and reset preserve accessibility settings, game state, and tutorial progress',()=>{
  const boundary=settingsBoundary();
  try{
    const f=viewFixture(boundary,{practice:true}),before=JSON.stringify(f.game);
    f.call('setViewPreference','immersiveHud',false);
    f.call('setViewPreference','translucentHud',false);
    f.call('setViewPreference','compactTips',false);
    f.call('setWorldZoom',.6);
    assert.equal(f.getElement('viewImmersive').checked,false);
    assert.equal(f.getElement('viewTranslucent').checked,false);
    assert.equal(f.getElement('viewCompactTips').checked,false);
    assert.ok(f.effects.some(([effect])=>effect==='resize'));
    const writesBefore=boundary.writes.length;
    f.call('setViewPreference','textScale',1);
    assert.equal(boundary.writes.length,writesBefore,'The view preference allowlist cannot modify text size.');
    assert.equal(f.settings.textScale,1.4);
    f.call('resetView');
    assert.equal(f.settings.worldZoom,1);
    assert.equal(f.settings.immersiveHud,true);
    assert.equal(f.settings.translucentHud,true);
    assert.equal(f.settings.compactTips,true);
    assert.equal(f.getElement('worldZoomValue').textContent,'100%');
    assert.equal(f.settings.textScale,1.4);
    assert.equal(f.settings.controlScale,1.2);
    assert.equal(f.settings.leftHanded,true);
    assert.equal(f.settings.guidance,'moderate');
    assert.equal(JSON.stringify(f.game),before);
    assert.ok(boundary.writes.every(([key])=>key===SETTINGS_KEY));
    assert.equal(boundary.entries.get('dfe.farwake.action-guide.v1'),'learned-actions-to-preserve');
  }finally{boundary.restore();}
});
