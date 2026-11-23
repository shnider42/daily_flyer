import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, houseRevealed, renderMinimap } from '../public/renderer.mjs';
import { prepareBuildingInteriors } from '../public/building-geometry.mjs';

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

test('touch camera accepts its wider zoom range independently of desktop zoom', () => {
  const {renderer,state}=fixture();
  renderer.resize(844,390,1);
  renderer.updateCamera(state,{touch:true,zoom:.75,reducedMotion:true});
  near(renderer.camera.zoom,1.04*.75);
  renderer.resize(390,844,1);
  renderer.updateCamera(state,{touch:true,zoom:.75,reducedMotion:true});
  near(renderer.camera.zoom,1.1*.75);
  renderer.updateCamera(state,{touch:true,zoom:.1,reducedMotion:true});
  near(renderer.camera.zoom,1.1*.6);
  renderer.updateCamera(state,{touch:true,zoom:2,reducedMotion:true});
  near(renderer.camera.zoom,1.1*1.25);
  renderer.resize(1440,900,1);
  renderer.updateCamera(state,{touch:false,zoom:.6,reducedMotion:true});
  near(renderer.camera.zoom,1.2*.8);
});

function indoorFixture() {
  const fixtureState=fixture(), {renderer,state}=fixtureState;
  state.world.buildings=[
    {id:'home',x:1100,y:800,w:240,h:240,tone:.3},
    {id:'neighbor',x:1400,y:800,w:120,h:240,tone:.6},
  ];
  prepareBuildingInteriors(state.world);
  renderer.houseCutaways=state.world.buildings.map(building=>({building,canvas:{width:building.w,height:building.h},amount:0}));
  return {...fixtureState,house:state.world.buildings[0]};
}

test('roofs lift at actual door approaches and for squad occupants, not arbitrary nearby walls', () => {
  const {state,actor,house}=indoorFixture();
  const door=house.doors.find(door=>door.side==='south');
  actor.x=door.x; actor.y=door.y+65;
  assert.equal(houseRevealed(house,state),true,'entrance opens before crossing the threshold');
  actor.x=house.x-22; actor.y=house.y+100;
  assert.equal(houseRevealed(house,state),false,'a solid side wall does not expose the room');
  actor.x=door.x+door.width; actor.y=door.y+25;
  assert.equal(houseRevealed(house,state),false,'being near the front facade is insufficient');
  state.squad.push({id:2,x:house.x+35,y:house.y+35,alive:false,downed:true,team:'squad'});
  assert.equal(houseRevealed(house,state),true,'a downed teammate remains visible for rescue');
  assert.equal(houseRevealed(house,state,{menu:true}),false,'menu panorama retains roofs');
});

test('hostile and civilian occupants never trigger a roof reveal', () => {
  const {state,actor,house}=indoorFixture();
  actor.x=900; actor.y=1100;
  state.enemies=[{id:20,x:1200,y:900,alive:true,visible:true,team:'enemy'}];
  state.civilians=[{id:30,x:1200,y:900,alive:true,team:'civilian'}];
  assert.equal(houseRevealed(house,state),false);
  state.squad.push({id:2,x:1200,y:900,alive:false,downed:false,team:'squad'});
  assert.equal(houseRevealed(house,state),false,'a removed squad member cannot keep a roof open');
  state.survivors=[{id:40,x:1200,y:900,alive:true,team:'survivor',stabilized:false}];
  assert.equal(houseRevealed(house,state),false,'unrecovered occupants do not open distant houses');
  state.survivors[0].stabilized=true;
  assert.equal(houseRevealed(house,state),true,'recovered crew members remain visible while following the squad');
});

test('cutaways fade, honor reduced motion, and reuse district and room textures on entry and exit', () => {
  const {renderer,state,actor,house}=indoorFixture();
  const map=renderer.mapCache, patch=renderer.houseCutaways[0].canvas;
  actor.x=house.x+40; actor.y=house.y+40;
  renderer.updateHouseCutaways(state,{},10);
  assert.ok(renderer.houseCutaways[0].amount>0&&renderer.houseCutaways[0].amount<1);
  for(const time of [10.08,10.16,10.24]) renderer.updateHouseCutaways(state,{},time);
  assert.equal(renderer.houseCutaways[0].amount,1);
  actor.x=900; actor.y=1100;
  renderer.updateHouseCutaways(state,{},10.32);
  assert.ok(renderer.houseCutaways[0].amount>0&&renderer.houseCutaways[0].amount<1,'roof fades back after leaving');
  renderer.makeMap=()=>assert.fail('entering or leaving must not bake the district again');
  const view={time:11,quality:'performance',reducedMotion:true};
  renderer.render(state,view);
  assert.equal(renderer.houseCutaways[0].amount,0);
  actor.x=house.x+40; actor.y=house.y+40;
  // A fresh co-op snapshot with the same layout must also retain the textures.
  state.world={...state.world};
  renderer.render(state,{...view,time:12});
  assert.equal(renderer.houseCutaways[0].amount,1);
  assert.equal(renderer.mapCache,map);
  assert.equal(renderer.houseCutaways[0].canvas,patch);
});

test('an open roof keeps friendly actors readable without exposing enemies behind partitions', () => {
  const {renderer,state,actor,house}=indoorFixture();
  actor.x=house.x+35; actor.y=house.y+60;
  state.enemies=[
    {id:20,x:house.x+35,y:house.y+180,alive:true,team:'enemy'},
    {id:21,x:house.x+65,y:house.y+60,alive:true,team:'enemy'},
    {id:22,x:house.x+75,y:house.y+60,alive:true,team:'enemy',visible:false},
  ];
  state.civilians=[{id:30,x:1435,y:850,alive:true,team:'civilian'}];
  const drawn=[];
  renderer.drawActor=(_ctx,actor)=>drawn.push(actor.id);
  renderer.render(state,{time:1,quality:'performance',reducedMotion:true});
  assert.equal(renderer.houseCutaways[0].amount,1);
  assert.ok(drawn.includes(1),'controlled soldier is visible inside');
  assert.ok(drawn.includes(21),'enemy with direct squad sight is visible');
  assert.ok(!drawn.includes(20),'partition still blocks enemy sight after the roof lifts');
  assert.ok(!drawn.includes(22),'authoritative hidden state is retained');
  assert.ok(!drawn.includes(30),'closed neighboring roofs suppress actor bodies and labels');
  const muzzleAngles=[];
  renderer.ctx.rotate=angle=>muzzleAngles.push(angle);
  state.effects=[
    {type:'muzzle',team:'enemy',actorId:20,x:1135,y:980,angle:.2,ttl:.05,maxTtl:.075},
    {type:'muzzle',team:'enemy',actorId:21,x:1165,y:860,angle:.7,ttl:.05,maxTtl:.075},
  ];
  renderer.drawEffects(renderer.ctx,state,1);
  assert.deepEqual(muzzleAngles,[.7],'a hidden indoor enemy does not leak its position through a muzzle flash');
});

test('binocular framing widens the view and preserves the prepared input transform', () => {
  const { renderer, state, actor } = fixture();
  renderer.updateCamera(state, { reducedMotion: true, observing: true });
  const ordinary = { ...renderer.camera };
  assert.equal(ordinary.zoom, 1.2, 'other roles cannot activate binocular framing');
  actor.role = 'grenadier'; actor.observing = true;
  const view = { reducedMotion: true, observing: true, quality: 'performance' };
  renderer.updateCamera(state, view);
  assert.ok(renderer.camera.zoom < ordinary.zoom);
  assert.ok(renderer.camera.x > ordinary.x, 'framing looks toward the binocular direction');
  const camera = { ...renderer.camera }, aim = renderer.screenToWorld(1050, 420), labels = [];
  renderer.ctx.fillText = text => labels.push(text);
  actor.angle = .4;
  renderer.render(state, { ...view, cameraPrepared: true });
  assert.deepEqual(renderer.camera, camera);
  assert.deepEqual(renderer.screenToWorld(1050, 420), aim);
  assert.ok(labels.includes('BINOCULARS · SHARED SIGHT'));
  actor.observing = false;
  renderer.updateCamera(state, { reducedMotion: true });
  near(renderer.camera.zoom, ordinary.zoom);
});

test('squad labels identify the four loadouts without adding another panel', () => {
  const { renderer, state, actor } = fixture();
  state.playerId = 'uncontrolled';
  const labels = [];
  renderer.worldLabel = (_x, _y, text) => labels.push(text);
  for (const [name, role] of [['Hale', 'leader'], ['Mercer', 'grenadier'], ['Ames', 'medic'], ['Webb', 'support']]) {
    renderer.drawActor(renderer.ctx, { ...actor, name, role }, state, 1, {});
  }
  assert.deepEqual(labels, ['HALE · LEAD', 'MERCER · GREN', 'AMES · MEDIC', 'WEBB · SAW']);
});

test('quick battlefield orders flash at the supplied point even before the persistent order arrives', () => {
  const { renderer, state } = fixture(), arcs = [];
  state.order = { type: 'follow' };
  renderer.ctx.arc = (x, y, radius) => arcs.push({ x, y, radius });
  renderer.drawOrder(state, 1, { quickOrder: { point: { x: 1400, y: 820 }, active: true }, reducedMotion: true });
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].x, 1400); assert.equal(arcs[0].y, 820);
  assert.ok(arcs[0].radius > 0);
  renderer.drawOrder(state, 1, { quickOrder: { point: { x: 1400, y: 820 }, active: false } });
  renderer.drawOrder(state, 1, { quickOrder: { point: { x: NaN, y: 820 }, active: true } });
  assert.equal(arcs.length, 1, 'inactive or invalid previews draw nothing');
});

test('a sniper glint and minimap contact both disappear behind a fresh wall or smoke', () => {
  const { renderer, state } = fixture(), arcs = [];
  const sniper = { id: 20, x: 1400, y: 950, angle: Math.PI, alive: true, team: 'enemy', kind: 'sniper', aimCharge: .8, visible: true };
  state.enemies = [sniper];
  renderer.ctx.arc = (x, y, radius) => arcs.push({ x, y, radius });
  const render = () => { arcs.length = 0; renderer.render(state, { quality: 'performance', reducedMotion: true }); };
  render();
  assert.ok(arcs.some(arc => arc.x === 17 && arc.y === -1), 'a sighted charged sniper has the restrained scope cue');
  state.world.walls = [{ x: 1300, y: 0, w: 10, h: 1900 }];
  render();
  assert.ok(!arcs.some(arc => arc.x === 17 && arc.y === -1), 'stale visible flags do not expose the sniper');
  const minimap = { width: 180, height: 144, getContext: () => renderer.ctx };
  arcs.length = 0; renderMinimap(minimap, state);
  assert.ok(!arcs.some(arc => arc.x === sniper.x && arc.y === sniper.y));
  state.world.walls = []; state.smokes = [{ x: 1300, y: 950, radius: 90, ttl: 10 }];
  arcs.length = 0; renderMinimap(minimap, state);
  assert.ok(!arcs.some(arc => arc.x === sniper.x && arc.y === sniper.y), 'smoke uses the same contact gate on the minimap');
});

test('launcher projectiles have a raised arc and a short ground blast without uncached fire textures', () => {
  const { renderer, state } = fixture(), arcs = [];
  renderer.ctx.arc = (x, y, radius) => arcs.push({ x, y, radius });
  renderer.drawFire = () => assert.fail('launcher impact should use its brief ground burst');
  state.grenades = [{ x: 1300, y: 950, px: 1290, py: 950, progress: .5, team: 'squad' }];
  state.effects = [{ x: 1400, y: 950, type: 'explosion', weapon: 'grenade', radius: 76, ttl: .3, maxTtl: .6 }];
  renderer.drawEffects(renderer.ctx, state, 1);
  assert.ok(arcs.some(arc => arc.x === 1300 && arc.y < 950), 'the round lifts above its ground position');
  assert.ok(arcs.some(arc => arc.x > 1300 && arc.x < 1310 && arc.y > 950), 'a small ground shadow gives the arc depth');
  const blast = arcs.find(arc => arc.x === 1400 && arc.y === 950);
  assert.ok(blast.radius > 20 && blast.radius < 76);
  assert.ok(arcs.every(arc => Number.isFinite(arc.radius)));
});
