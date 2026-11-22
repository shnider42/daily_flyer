import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../public/renderer.mjs';

function fixture(ratio=1) {
  const methods = { measureText: text => ({width:String(text).length*6}) };
  const ctx = new Proxy(methods, {get:(target,key)=>key in target ? target[key] : (()=>{})});
  const canvas = {clientWidth:1440,clientHeight:900,width:0,height:0,getContext:()=>ctx};
  const renderer = new Renderer(canvas);
  renderer.resize(1440,900,ratio);
  const actor = {id:1,x:1200,y:950,angle:0,team:'squad',role:'leader',alive:true,hp:100,maxHp:100,suppression:0};
  const state = {world:{width:2400,height:1900,buildings:[],props:[]},seed:17,missionIndex:0,playerId:1,role:'leader',squad:[actor],time:0};
  // The fixture has an already baked district; these tests exercise the frame
  // and coordinate contract rather than the browser's Canvas rasterizer.
  renderer.mapCache = {width:2400,height:1900}; renderer.mapIdentity=state.world; renderer.mapMission=0; renderer.mapSeed=17;
  return {renderer,canvas,state,actor};
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);

test('cursor world mapping uses CSS viewport dimensions at every render resolution', () => {
  let expected;
  for (const ratio of [.5,.75,1,1.5,2]) {
    const {renderer,canvas,state}=fixture(ratio);
    renderer.updateCamera(state,{zoom:1.3,reducedMotion:true});
    const cursor={x:431.5,y:199.25}, point=renderer.screenToWorld(cursor.x,cursor.y);
    const back=renderer.worldToScreen(point.x,point.y);
    near(back.x,cursor.x); near(back.y,cursor.y);
    assert.equal(canvas.width,Math.round(1440*ratio)); assert.equal(canvas.height,Math.round(900*ratio));
    if(expected){near(point.x,expected.x);near(point.y,expected.y);} else expected=point;
  }
});

test('drawing a prepared frame cannot move the camera after cursor input was calculated', () => {
  const {renderer,state,actor}=fixture();
  const view={zoom:1.1,quality:'performance',reducedMotion:true,lookahead:.5,pointer:{x:1100,y:390}};
  renderer.updateCamera(state,view);
  const camera={...renderer.camera}, aim=renderer.screenToWorld(1100,390);
  // Movement occurs in the simulation between camera preparation and drawing.
  actor.x+=80; actor.y-=30;
  renderer.render(state,{...view,cameraPrepared:true});
  assert.deepEqual(renderer.camera,camera);
  assert.deepEqual(renderer.screenToWorld(1100,390),aim);
  renderer.updateCamera(state,view);
  assert.notDeepEqual(renderer.camera,camera,'the next frame can track the moved soldier');
});

test('the Cordon spawn stays clear of the desktop HUD at 1280×720 without camera drift or aim remapping', () => {
  const {renderer,state,actor}=fixture();
  renderer.resize(1280,720,1); actor.x=200; actor.y=1720;
  const desktopObstacles=[
    {left:0,top:0,right:1280,bottom:60},
    {left:24,top:88,right:390,bottom:194},
    {left:24,top:408,right:350,bottom:620},
    {left:24,top:650,right:900,bottom:708},
    {left:1000,top:616,right:1260,bottom:708},
  ];
  renderer.updateCamera(state,{zoom:1});
  const before=renderer.worldToScreen(actor.x,actor.y), panel=desktopObstacles[2];
  assert.ok(before.x>panel.left&&before.x<panel.right&&before.y>panel.top&&before.y<panel.bottom,'fixture reproduces the covered soldier');
  const view={zoom:1,lookahead:0,quality:'performance',desktopObstacles};
  renderer.updateCamera(state,view);
  const clear=renderer.worldToScreen(actor.x,actor.y);
  for(const rect of desktopObstacles) assert.ok(clear.x<=rect.left-32||clear.x>=rect.right+32||clear.y<=rect.top-32||clear.y>=rect.bottom+32,'soldier and ring clear every HUD panel');
  assert.ok(Math.hypot(clear.x-before.x,clear.y-before.y)<100,'framing uses the nearby clear edge');
  const camera={...renderer.camera}, aim=renderer.screenToWorld(800,350);
  for(let i=0;i<12;i++) renderer.updateCamera(state,{...view,pointer:{x:100+i*70,y:220}});
  near(renderer.camera.x,camera.x); near(renderer.camera.y,camera.y);
  renderer.render(state,{...view,cameraPrepared:true});
  assert.deepEqual(renderer.screenToWorld(800,350),aim,'prepared rendering retains the adjusted aim transform');
  const bottomOverscan=(renderer.camera.y+renderer.height/renderer.camera.zoom/2-state.world.height)*renderer.camera.zoom;
  assert.ok(bottomOverscan<=renderer.height*.35,'extra map-edge framing stays bounded');
});

test('desktop HUD obstacles do not change touch, overview-map, or menu framing', () => {
  const desktopObstacles=[{left:0,top:0,right:1440,bottom:900}];
  for(const mode of [{touch:true},{showMap:true},{menu:true}]) {
    const {renderer,state}=fixture();
    renderer.updateCamera(state,{...mode,reducedMotion:true});
    const camera={...renderer.camera};
    renderer.updateCamera(state,{...mode,reducedMotion:true,desktopObstacles});
    assert.deepEqual(renderer.camera,camera);
  }
});
