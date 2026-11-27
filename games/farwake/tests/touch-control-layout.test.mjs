import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {touchControlLayout,normalizeThumbPreferences} from '../dist/touch-control-layout.mjs';
import {inputVector} from '../dist/input.mjs';
import {pickDeviceSettings} from '../dist/privacy-data.mjs';

const disjoint=(a,b)=>a.left+a.width<=b.left+.001||b.left+b.width<=a.left+.001||a.bottom+a.height<=b.bottom+.001||b.bottom+b.height<=a.bottom+.001;
test('separate thumb preferences fit portrait, landscape, handedness and large buttons without overlapping controls',()=>{
 for(const [width,height]of [[320,568],[390,844],[844,390],[740,360],[568,320]])for(const leftHanded of [false,true])for(const onFoot of [false,true])for(const steeringStickScale of [.65,1.2])for(const strafeStickScale of [.8,1.5]){
  const layout=touchControlLayout({width,height,left:18,right:18,bottom:16,leftHanded,onFoot,combat:onFoot,controlScale:1.2,steeringStickScale,strafeStickScale});
  const center={...layout.center,height:48};for(const rect of [layout.move,layout.aim,layout.fire,center]){assert.ok(rect.left>=0);assert.ok(rect.left+rect.width<=width+.01);assert.ok(rect.width>=44&&rect.height>=44);}
  assert.ok(disjoint(layout.move,layout.aim));assert.ok(disjoint(layout.move,center));assert.ok(disjoint(layout.aim,center));assert.ok(disjoint(layout.aim,layout.fire));assert.ok(disjoint(layout.move,layout.fire));
  const safe={left:layout.center.safeLeft,width:layout.center.safeWidth,bottom:0,height:height};assert.ok(disjoint(safe,layout.move));assert.ok(disjoint(safe,layout.aim));assert.ok(disjoint(safe,layout.fire));
  if(width>height){const action={left:layout.center.actionLeft,width:layout.center.actionWidth,bottom:0,height};for(const control of [layout.move,layout.aim,layout.fire,center])assert.ok(disjoint(action,control),'The landscape contextual action has its own gap.');}
 }
});

test('independent geometry leaves Farwake’s horizontal strafe and separate trigger semantics intact',()=>{
 const small=touchControlLayout({steeringStickScale:.65,strafeStickScale:1.5}),large=touchControlLayout({steeringStickScale:1.2,strafeStickScale:1.5,width:700});
 assert.ok(small.move.width<large.move.width);assert.ok(small.aim.width>small.move.width);assert.ok(small.aim.width>small.aim.height);
 const strafe=inputVector({mode:'ship',aim:{x:.8,y:-1}});assert.equal(strafe.strafe,.8);assert.equal(strafe.fire,false);assert.equal(strafe.aiming,false);
 assert.equal(inputVector({mode:'ship',aim:{x:.8,y:-1},buttons:new Set(['fire'])}).fire,true);
 const prefs=normalizeThumbPreferences({steeringStickScale:.7,strafeStickScale:1.4});assert.deepEqual(pickDeviceSettings({...prefs,unrelated:'drop'}),prefs);
 assert.deepEqual(normalizeThumbPreferences({steeringStickScale:NaN,strafeStickScale:Infinity}),normalizeThumbPreferences());
});

test('the shipped layout synchronizer clears held input before geometry changes and leaves a stable layout alone',()=>{
 const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),start=source.indexOf('function syncTouchControlLayout(){'),end=source.indexOf('\nfunction resize(){',start);
 assert.ok(start>=0&&end>start);const events=[],properties=new Map(),deck={getBoundingClientRect:()=>({width:390})};
 const context=vm.createContext({touchLayout:true,touchGeometryKey:'',touchControlLayout,settings:{controlScale:1,steeringStickScale:.9,strafeStickScale:1.1,leftHanded:false},$:()=>deck,
  getComputedStyle:()=>({paddingLeft:'18px',paddingRight:'18px',paddingBottom:'14px'}),window:{innerWidth:390,innerHeight:844},
  controls:{clear:()=>events.push('clear')},clearPointerAim:()=>events.push('aim-clear'),document:{body:{style:{setProperty:(key,value)=>{events.push('geometry');properties.set(key,value);}}}},labelLayoutDirty:false,
 });vm.runInContext(source.slice(start,end),context);context.syncTouchControlLayout();assert.deepEqual(events.slice(0,2),['clear','aim-clear']);assert.ok(properties.has('--fw-flight-aim-width'));
 events.length=0;context.syncTouchControlLayout();assert.equal(events.length,0);
 context.settings.strafeStickScale=1.4;context.syncTouchControlLayout();assert.deepEqual(events.slice(0,2),['clear','aim-clear']);assert.equal(context.settings.steeringStickScale,.9);
});
