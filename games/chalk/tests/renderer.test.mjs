import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, houseRevealed, renderMinimap, missionLighting, muzzleOrigin, muzzleProfile, muzzleLightPolygon } from '../public/renderer.mjs';
import { prepareBuildingInteriors } from '../public/building-geometry.mjs';
import { breachAtBlast, createDestructionState, syncBuildingDamage } from '../public/destruction.mjs';

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

test('independent allies use player sight and never reveal their own or hostile rooms', () => {
  const { renderer, state, actor } = fixture(), drawn = [];
  state.world.walls = [{ id: 'screen', x: 1280, y: 800, w: 10, h: 400 }];
  state.allies = [
    { ...actor, id: 801, team: 'allied', x: 1240, y: 950, visible: true },
    { ...actor, id: 802, team: 'allied', x: 1320, y: 950, visible: true },
    { ...actor, id: 803, team: 'allied', x: 1240, y: 920, visible: false },
  ];
  state.enemies = [{ ...actor, id: 804, team: 'enemy', x: 1350, y: 950, visible: false }];
  renderer.drawActor = (_ctx, unit) => drawn.push(unit.id);
  renderer.render(state, { quality: 'performance', reducedMotion: true });
  assert.ok(drawn.includes(801));
  assert.ok(!drawn.includes(802), 'a stale visible flag cannot see through a wall');
  assert.ok(!drawn.includes(803), 'authority can hide an independent ally');
  assert.ok(!drawn.includes(804), 'a friendly patrol does not expand player sight');
  assert.equal(state.squad.length, 1);
});

test('ambient flames require current squad sight, clip to masonry, and stay beneath fog memory', () => {
  const { renderer, state } = fixture(), drawn = [], order = [];
  state.missionIndex = 2; renderer.mapMission = 2;
  state.world.walls = [{ id: 'screen', x: 1280, y: 800, w: 10, h: 400 }];
  state.world.ambientFires = [
    { id: 'near', x: 1250, y: 950, intensity: .8, phase: 3 },
    { id: 'behind-wall', x: 1320, y: 950, intensity: .8, phase: 1 },
    { id: 'far', x: 2200, y: 150, intensity: .8, phase: 2 },
  ];
  renderer.drawFire = (_ctx, x, y, time) => { drawn.push({ x, y, time }); order.push('fire'); };
  renderer.radialSprite = () => ({});
  renderer.sharedSight.draw = () => order.push('sight');
  renderer.render(state, { quality: 'performance', reducedMotion: true });
  assert.deepEqual(drawn, [{ x: 1250, y: 950, time: 3 }]);
  assert.ok(order.indexOf('fire') < order.indexOf('sight'));
  const mask = renderer.ambientFireMasks.get('near');
  assert.ok(mask.every(point => point.x < 1280.001), 'the glow cannot spill through the nearby solid facade');
  renderer.drawAmbientFires(renderer.ctx, state, 200, { reducedMotion: true });
  assert.deepEqual(drawn[1], drawn[0], 'reduced motion keeps a steady flame and plume');
  assert.equal(renderer.ambientFireMasks.get('near'), mask, 'a stationary fire reuses its visibility fan');
  drawn.length = 0;
  renderer.drawAmbientFires(renderer.ctx, state, 300, { showMap: true });
  renderer.drawAmbientFires(renderer.ctx, state, 300, { menu: true });
  assert.equal(drawn.length, 0, 'ambient decoration never reveals extra intelligence on the map');
  state.world.walls = []; state.world.geometryRevision = 1;
  renderer.drawAmbientFires(renderer.ctx, state, 300, {});
  assert.notEqual(renderer.ambientFireMasks.get('near'), mask, 'a new breach refreshes local fire light geometry');
  assert.equal(drawn.length, 2, 'the former hidden source appears only after its sight obstruction is removed');
});

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
  state.squad.push({id:2,x:house.x+35,y:house.y+35,alive:true,downed:true,team:'squad'});
  assert.equal(houseRevealed(house,state),true,'a downed teammate remains visible for rescue');
  assert.equal(houseRevealed(house,state,{menu:true}),false,'menu panorama retains roofs');
  state.squad[1].alive=false;
  assert.equal(houseRevealed(house,state),false,'a body cannot keep a distant roof open after death');
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

test('flash exposure follows only the controlled soldier and recovers on simulation time even over the map', () => {
  const { renderer, state, actor } = fixture(), veils = [];
  renderer.ctx.fillRect = (x, y, width, height) => veils.push({ alpha: renderer.ctx.globalAlpha, color: renderer.ctx.fillStyle, width, height });
  Object.assign(actor, { flashStartedAt: 10, flashUntil: 13, flashStrength: 1 });
  state.time = 10.1; renderer.drawFlashExposure(state, {});
  assert.equal(veils.length, 1); near(veils[0].alpha, .96);
  assert.equal(veils[0].width, renderer.width); assert.equal(veils[0].height, renderer.height);
  state.time = 11.5; renderer.drawFlashExposure(state, { showMap: true });
  assert.ok(veils[1].alpha > .1 && veils[1].alpha < veils[0].alpha, 'the map does not bypass the recovery veil');
  renderer.drawFlashExposure(state, { reducedMotion: true });
  near(veils[2].alpha, veils[1].alpha); assert.equal(veils[2].color, '#17201f');
  state.time = 13; renderer.drawFlashExposure(state, {}); assert.equal(veils.length, 3);
  state.time = 10.1; state.playerId = 2; state.squad.push({ id: 2, alive: true });
  renderer.drawFlashExposure(state, {}); assert.equal(veils.length, 3, 'a soldier switch does not inherit the prior actor’s flash');
  state.playerId = 1; renderer.drawFlashExposure(state, { menu: true }); assert.equal(veils.length, 3);
});

test('flashbang bloom requires current sight, clips at walls, and has a quiet reduced-motion variant', () => {
  const { renderer, state } = fixture(), images = [], arcs = [];
  renderer.ctx.drawImage = (...args) => images.push(args);
  renderer.ctx.arc = (x, y, radius) => arcs.push({ x, y, radius });
  renderer.radialSprite = () => ({});
  state.world.walls = [{ id: 'screen', x: 1280, y: 800, w: 10, h: 400 }];
  state.effects = [{ type: 'flashbang', x: 1250, y: 950, radius: 240, ttl: .25, maxTtl: .35 }];
  renderer.drawEffects(renderer.ctx, state, 10);
  assert.equal(images.length, 1);
  const mask = [...renderer.flashMasks.values()][0];
  assert.ok(mask.every(point => point.x < 1280.001));
  renderer.drawEffects(renderer.ctx, state, 10.1, { reducedMotion: true });
  assert.equal(images.length, 1, 'reduced motion suppresses the bloom');
  assert.equal(arcs.at(-1).radius, 7);
  assert.equal([...renderer.flashMasks.values()][0], mask, 'an unchanged burst reuses its light mask');
  images.length = 0; arcs.length = 0;
  renderer.drawEffects(renderer.ctx, state, 10.2, { showMap: true });
  state.effects[0].x = 1350; renderer.drawEffects(renderer.ctx, state, 10.2);
  assert.equal(images.length, 0); assert.equal(arcs.length, 0, 'the flash cannot reveal a burst behind a solid wall');
});

test('mobile throw preview stops at a wall and disappears on map or canceled aim', () => {
  const { renderer, state } = fixture(), endpoints = [];
  renderer.updateCamera(state, { touch: true, reducedMotion: true });
  renderer.ctx.quadraticCurveTo = (_cx, _cy, x, y) => endpoints.push({ x, y });
  state.world.walls = [{ x: 1280, y: 800, w: 10, h: 400 }];
  const throwableAim = { x: 1425, y: 950, type: 'frag' };
  renderer.drawThrowableAim(state, { throwableAim });
  const expected = renderer.worldToScreen(1280, 950);
  near(endpoints[0].x, expected.x); near(endpoints[0].y, expected.y);
  renderer.drawThrowableAim(state, { throwableAim, showMap: true });
  renderer.drawThrowableAim(state, { throwableAim: null });
  renderer.drawThrowableAim(state, { throwableAim: { type: 'frag' } });
  assert.equal(endpoints.length, 1);
});

test('persistent remains are culled, honor closed roofs, and render below the sight memory', () => {
  const { renderer, state, actor, house } = indoorFixture(), drawn = [], order = [];
  actor.x = 900; actor.y = 1100;
  state.bodies = [
    { id: 'body:1', x: 950, y: 1100, angle: .3, team: 'enemy', seen: true },
    { id: 'body:2', x: 1000, y: 1100, team: 'enemy', seen: false },
    { id: 'body:3', x: house.x + 40, y: house.y + 40, team: 'squad', seen: true },
    { id: 'body:4', x: 9000, y: 9000, team: 'civilian', seen: true },
  ];
  renderer.bodySprite = body => { drawn.push(body.id); order.push('body'); return {}; };
  renderer.bloodSprite = () => ({});
  renderer.sharedSight.draw = () => order.push('sight');
  renderer.drawActor = () => order.push('living');
  renderer.render(state, { quality: 'performance', reducedMotion: true });
  assert.deepEqual(drawn, ['body:1'], 'unknown, roofed and distant bodies draw nothing');
  assert.ok(order.indexOf('body') < order.indexOf('sight'));
  assert.ok(order.indexOf('sight') < order.indexOf('living'));
  drawn.length = 0;
  renderer.drawBodies(renderer.ctx, state, { showMap: true });
  assert.deepEqual(drawn, ['body:1', 'body:3'], 'the map exposes only already observed remains');
  drawn.length = 0; renderer.drawBodies(renderer.ctx, state, { menu: true });
  assert.deepEqual(drawn, []);
});

test('dead actors cannot retain wounded badges or living squad minimap markers', () => {
  const { renderer, state, actor } = fixture(), badges = [], liveDraws = [], arcs = [];
  const wounded = { ...actor, id: 2, x: 1300, downed: true, hp: 0 };
  const dead = { ...wounded, id: 3, x: 1350, alive: false };
  const civilian = { ...dead, id: 4, x: 1400, team: 'civilian' };
  renderer.screenBadge = (_x, _y, label) => badges.push(label);
  renderer.drawActor(renderer.ctx, wounded, state, 1, {});
  renderer.drawActor(renderer.ctx, dead, state, 1, {});
  renderer.drawActor(renderer.ctx, civilian, state, 1, {});
  assert.deepEqual(badges, ['HELP'], 'only a living casualty asks for aid');
  state.squad.push(wounded, dead); state.civilians = [civilian];
  renderer.drawActor = (_ctx, unit) => liveDraws.push(unit.id);
  renderer.render(state, { quality: 'performance', reducedMotion: true });
  assert.deepEqual(liveDraws.sort(), [1, 2]);
  renderer.ctx.arc = (x, y) => arcs.push({ x, y });
  renderMinimap({ width: 180, height: 144, getContext: () => renderer.ctx }, state);
  assert.ok(arcs.some(arc => arc.x === wounded.x));
  assert.ok(!arcs.some(arc => arc.x === dead.x));
});

test('blood settings hide marks and pools without removing bodies; reduced motion retains static marks', () => {
  const { renderer, state } = fixture(), drawn = [];
  const body = { x: 1250, y: 950, seen: true, team: 'enemy', pose: 1 };
  state.bodies = [body]; state.bloodstains = [{ x: 1300, y: 950, seen: true, amount: .5, seed: 1 }, { x: 1350, y: 950, seen: false }];
  renderer.bloodSprite = () => ({ kind: 'blood' }); renderer.bodySprite = () => ({ kind: 'body' });
  renderer.ctx.drawImage = sprite => drawn.push(sprite.kind);
  renderer.drawBloodstains(renderer.ctx, state, { reducedMotion: true }); renderer.drawBodies(renderer.ctx, state, { reducedMotion: true });
  assert.deepEqual(drawn, ['blood', 'blood', 'body']);
  drawn.length = 0;
  renderer.drawBloodstains(renderer.ctx, state, { bloodEffects: false }); renderer.drawBodies(renderer.ctx, state, { bloodEffects: false });
  assert.deepEqual(drawn, ['body']);
  renderer.houseCutaways = [{ building: { x: 1200, y: 900, w: 200, h: 100 }, amount: 0 }];
  drawn.length = 0; renderer.drawBloodstains(renderer.ctx, state, {}); renderer.drawBodies(renderer.ctx, state, {});
  assert.deepEqual(drawn, [], 'blood and remains cannot paint onto a closed roof');
});

test('brief blood impacts require witnessed and current sight and respect both visual preferences', () => {
  const { renderer, state } = fixture(), droplets = [];
  state.effects = [{ type: 'blood', x: 1300, y: 950, angle: 0, seed: 18, amount: .5, ttl: .18, maxTtl: .24, seen: true }];
  renderer.ctx.arc = (x, y, radius) => droplets.push({ x, y, radius });
  renderer.drawEffects(renderer.ctx, state, 1);
  assert.equal(droplets.length, 5); assert.ok(droplets.every(point => Number.isFinite(point.x) && point.radius < 3));
  for (const view of [{ bloodEffects: false }, { reducedMotion: true }, { menu: true }]) {
    droplets.length = 0; renderer.drawEffects(renderer.ctx, state, 1, view); assert.equal(droplets.length, 0);
  }
  droplets.length = 0;
  state.world.walls = [{ x: 1250, y: 0, w: 10, h: 1900 }];
  renderer.drawEffects(renderer.ctx, state, 1); assert.equal(droplets.length, 0, 'a fresh wall blocks a stale witnessed effect');
  state.world.walls = []; state.smokes = [{ x: 1250, y: 950, radius: 90, ttl: 8 }];
  renderer.drawEffects(renderer.ctx, state, 1); assert.equal(droplets.length, 0, 'fresh smoke also blocks the impact');
  state.smokes = []; state.effects[0].seen = false;
  renderer.drawEffects(renderer.ctx, state, 1); assert.equal(droplets.length, 0, 'unwitnessed impacts do not appear retroactively');
});

test('corpse and ground-mark textures are small and shared across repeated frames and snapshots', t => {
  const original = globalThis.OffscreenCanvas, created = [];
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width; this.height = height; created.push(this);
      this.context = new Proxy({}, { get: (target, key) => key in target ? target[key] : (() => {}) });
    }
    getContext() { return this.context; }
  };
  t.after(() => { if (original === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = original; });
  const { renderer } = fixture(), body = { team: 'squad', role: 'support', pose: 2 };
  const sprite = renderer.bodySprite(body), blood = renderer.bloodSprite(5);
  const count = created.length;
  for (let frame = 0; frame < 100; frame++) {
    assert.equal(renderer.bodySprite({ ...body, actorId: frame }), sprite);
    assert.equal(renderer.bloodSprite(5 + frame * 4), blood);
  }
  assert.equal(created.length, count, 'new snapshot objects reuse the existing texture');
  assert.ok(created.every(canvas => canvas.width <= 64 && canvas.height <= 48));
});

test('field aid markers appear only for revealed unresolved opportunities', () => {
  const { renderer, state } = fixture(), markers = [], labels = [];
  const opportunity = { x: 1250, y: 950, radius: 60, status: 'available', revealed: true, progress: 0 };
  state.story = { opportunities: [opportunity, { ...opportunity, x: 1300, revealed: false }, { ...opportunity, x: 1350, status: 'assisted' }, { ...opportunity, x: 9000 }] };
  renderer.ctx.arc = (x, y, radius) => markers.push(radius);
  renderer.worldLabel = (_x, _y, text) => labels.push(text);
  renderer.drawStoryOpportunities(state);
  assert.equal(markers.length, 1); assert.deepEqual(labels, ['AID']);
  markers.length = 0; renderer.drawStoryOpportunities(state, { menu: true }); assert.equal(markers.length, 0);
  renderer.houseCutaways = [{ building: { x: 1200, y: 900, w: 200, h: 100 }, amount: 0 }];
  renderer.drawStoryOpportunities(state); assert.equal(markers.length, 0);
});

test('a sidewall breach lifts the roof only when approached through its actual opening', () => {
  const { state, actor, house } = indoorFixture();
  actor.x = house.x - 60; actor.y = 860;
  assert.equal(houseRevealed(house, state), false);
  const result = breachAtBlast(state.world, createDestructionState(), { x: house.x - 1, y: 860, wallId: 'home:west' });
  assert.equal(result.changed, true);
  assert.equal(houseRevealed(house, state), true);
  actor.y = 1010;
  assert.equal(houseRevealed(house, state), false, 'an intact stretch beside the breach stays roofed');
  assert.equal(houseRevealed(house, state, { menu: true }), false);
});

function joinedFacadeFixture(side, edge) {
  const f = fixture();
  f.state.world = prepareBuildingInteriors({ width: 2400, height: 1900, buildings: [{ id: 'home', x: 100, y: 100, w: 240, h: 240, tone: .3 }] });
  f.renderer.camera = { x: 220, y: 220, zoom: 1 };
  const house = f.state.world.buildings[0], door = house.doors.find(door => door.side === side);
  const join = door.x + (edge === 'left' ? -1 : 1) * door.width / 2;
  Object.assign(f.actor, { x: join, y: door.y + (side === 'north' ? -38 : 38) });
  const impact = { x: join + (edge === 'left' ? -30 : 30), y: door.y + (side === 'north' ? -1 : 1), wallId: `home:${side}-${edge}` };
  return { ...f, house, door, join, impact };
}

test('door-adjacent breaches form one continuous roof approach and reset restores the intact jamb', () => {
  for (const side of ['north', 'south']) for (const edge of ['left', 'right']) {
    const { state, actor, house, join, impact } = joinedFacadeFixture(side, edge);
    assert.equal(houseRevealed(house, state), false, 'the original doorway edge is still masonry');
    const result = breachAtBlast(state.world, createDestructionState(), impact), opening = result.created[0];
    assert.equal(result.changed, true);
    near(edge === 'left' ? opening.to : opening.from, join);
    for (const offset of [-4, 0, 4]) {
      actor.x = join + offset;
      assert.equal(houseRevealed(house, state), true, `${side}/${edge}: no false post remains at the shared threshold`);
    }
    actor.x = edge === 'left' ? opening.from - 6 : opening.to + 6;
    assert.equal(houseRevealed(house, state), false, 'the surviving outer support still hides the room');
    actor.x = join;
    syncBuildingDamage(state.world, createDestructionState());
    assert.equal(houseRevealed(house, state), false, 'damage reset invalidates the merged opening cache');
  }
});

test('joined doorway artwork removes both old and new posts while retaining the real wall edge and threshold', () => {
  for (const side of ['north', 'south']) for (const edge of ['left', 'right']) {
    const { renderer, state, impact } = joinedFacadeFixture(side, edge), fills = [], strokes = [], sprites = [];
    const opening = breachAtBlast(state.world, createDestructionState(), impact).created[0];
    let path = [];
    renderer.ctx.beginPath = () => { path = []; };
    renderer.ctx.moveTo = (x, y) => path.push([x, y]); renderer.ctx.lineTo = (x, y) => path.push([x, y]);
    renderer.ctx.stroke = () => strokes.push({ style: renderer.ctx.strokeStyle, path: [...path] });
    renderer.ctx.fillRect = (x, y, w, h) => fills.push({ style: renderer.ctx.fillStyle, x, y, w, h });
    renderer.breachSprite = () => ({ kind: 'rubble' }); renderer.ctx.drawImage = sprite => sprites.push(sprite.kind);
    renderer.drawBreaches(renderer.ctx, state);
    const joined = opening.width / 2 * ((side === 'north') === (edge === 'left') ? -1 : 1);
    const jambs = strokes.filter(stroke => stroke.style === '#474b3a'), chips = strokes.filter(stroke => stroke.style === '#b6a680');
    assert.equal(jambs.length, 1); assert.equal(chips.length, 1, 'chips mark only a real surviving wall edge');
    assert.equal(jambs[0].path[0][0], -joined);
    assert.ok(fills.some(fill => fill.style === '#777762' && fill.x < joined - 7 && fill.x + fill.w > joined + 7 && fill.y <= -opening.thickness - 14 && fill.y + fill.h >= 12), 'the patch covers the cached doorway post and folded leaf on both sides of the join');
    assert.ok(fills.some(fill => fill.style === '#a59b7c' && fill.x < joined && fill.x + fill.w > joined), 'the worn threshold continues through the cleared join');
    assert.deepEqual(sprites, ['rubble']);
  }
  const { renderer, state } = fixture(), jambs = [];
  state.world.buildings = [{ breaches: [{ side: 'west', x: 1200, y: 950, width: 48, thickness: 10, angle: Math.PI / 2 }] }];
  renderer.breachSprite = () => ({}); renderer.ctx.stroke = () => { if (renderer.ctx.strokeStyle === '#474b3a') jambs.push(true); };
  renderer.drawBreaches(renderer.ctx, state);
  assert.equal(jambs.length, 2, 'a narrower isolated opening retains both masonry edges');
});

test('geometry changes repaint only the affected room texture and a same-seed restart restores it', () => {
  const { renderer, state } = indoorFixture(), pristine = structuredClone(state.world), map = renderer.mapCache, repainted = [];
  for (const house of renderer.houseCutaways) house.canvas.getContext = () => renderer.ctx;
  const patch = renderer.houseCutaways[0].canvas;
  renderer.drawInterior = (_ctx, building) => repainted.push(building.id);
  renderer.makeMap = () => assert.fail('a breach must not rebuild the district texture');
  renderer.refreshHouseGeometry(state.world);
  assert.deepEqual(repainted, []);
  breachAtBlast(state.world, createDestructionState(), { x: 1099, y: 860, wallId: 'home:west' });
  renderer.refreshHouseGeometry(state.world);
  assert.deepEqual(repainted, ['home']);
  renderer.refreshHouseGeometry(state.world);
  assert.deepEqual(repainted, ['home'], 'unchanged frames do no texture work');
  renderer.refreshHouseGeometry(pristine);
  assert.deepEqual(repainted, ['home', 'home']);
  assert.equal(renderer.houseCutaways[0].building, pristine.buildings[0]);
  assert.equal(renderer.houseCutaways[0].canvas, patch); assert.equal(renderer.mapCache, map);
  assert.equal(renderer.houseCutaways[0].building.breaches.length, 0);
});

test('a stationary aim cue immediately sees a new breach without cursor movement', () => {
  const { renderer, state, actor } = indoorFixture();
  actor.x = 1040; actor.y = 860;
  const view = { pointer: renderer.worldToScreen(1200, 860), aimLine: true, crosshair: 'dot' };
  renderer.drawDesktopAim(state, view);
  const original = renderer.aimTrace;
  assert.equal(original.result.blocked, true);
  renderer.drawDesktopAim(state, view); assert.equal(renderer.aimTrace, original);
  breachAtBlast(state.world, createDestructionState(), { x: 1099, y: 860, wallId: 'home:west' });
  renderer.drawDesktopAim(state, view);
  assert.notEqual(renderer.aimTrace, original);
  assert.equal(renderer.aimTrace.result.blocked, false);
});

test('breach rubble stays local and dust is witnessed, temporary and reduced-motion aware', () => {
  const { renderer, state } = fixture(), draws = [];
  state.world.buildings = [{ breaches: [{ x: 1300, y: 950, width: 80, thickness: 10, from: 910, angle: 0 }, { x: 9000, y: 9000 }] }];
  renderer.breachSprite = () => ({ kind: 'rubble' }); renderer.radialSprite = () => ({ kind: 'dust' });
  renderer.ctx.drawImage = sprite => draws.push(sprite.kind);
  renderer.drawBreaches(renderer.ctx, state, { reducedMotion: true });
  assert.deepEqual(draws, ['rubble']);
  state.effects = [{ type: 'breach', x: 1300, y: 950, angle: 0, ttl: .6, maxTtl: .7, seen: true }];
  renderer.drawEffects(renderer.ctx, state, 1);
  assert.deepEqual(draws, ['rubble', 'dust']);
  draws.length = 0;
  renderer.drawEffects(renderer.ctx, state, 1, { reducedMotion: true }); assert.deepEqual(draws, []);
  state.world.walls = [{ x: 1250, y: 0, w: 10, h: 1900 }];
  renderer.drawEffects(renderer.ctx, state, 1); assert.deepEqual(draws, [], 'fresh cover blocks stale witnessed dust');
});

function shotFixture() {
  const f = fixture();
  f.state.mission = { lighting: 'night' }; f.state.time = 1; f.state.status = 'playing';
  f.state.soundEvents = [{ id: 10, type: 'shot', actorId: 1, team: 'squad', weapon: 'rifle', x: 1220, y: 950, angle: 0, time: 1, sourceTime: 1 }];
  f.renderer.muzzleSprite = weapon => ({ kind: 'core', weapon });
  f.renderer.radialSprite = key => ({ kind: 'light', key });
  return f;
}

test('weapon flashes start at the barrel and stay on the near side of thin cover', () => {
  const source = { x: 500, y: 500, angle: 0, weapon: 'support' };
  const world = { walls: Array.from({ length: 30 }, (_, i) => ({ x: i * 20, y: 10, w: 10, h: 10 })) };
  near(muzzleOrigin(source, world).x, 510);
  world.walls.push({ x: 505, y: 450, w: 4, h: 100 });
  assert.ok(muzzleOrigin(source, world).x < 505, 'longer weapon artwork cannot project the flash through a wall');
  assert.ok(muzzleProfile('support').duration > muzzleProfile('rifle').duration);
  assert.ok(muzzleProfile('sniper').length > muzzleProfile('rifle').length);
  const polygon = muzzleLightPolygon({ walls: [{ x: 530, y: 0, w: 8, h: 1900 }] }, source, 86);
  assert.ok(polygon.length >= 24);
  assert.ok(polygon.every(point => point.x < 530), 'every light ray terminates on this side of the wall');
  assert.ok(polygon.some(point => point.x > 529), 'the light actually reaches the wall instead of disappearing');
});

test('shot-ring flashes survive missed short effects, expire on presentation time, and never replay a repeated packet', () => {
  const { renderer, state } = shotFixture();
  state.effects = []; state.soundEvents[0].sourceTime = .88;
  renderer.updateMuzzleFlashes(state, { time: 10 });
  assert.equal(renderer.muzzleFlashes.length, 1, 'a recently received real shot gets a brief visible presentation');
  const flash = renderer.muzzleFlashes[0], polygon = flash.polygon;
  renderer.updateMuzzleFlashes(state, { time: 10.015 });
  assert.equal(renderer.muzzleFlashes.length, 1); assert.equal(renderer.muzzleFlashes[0], flash);
  renderer.drawMuzzleFlashes(renderer.ctx, state, { time: 10.015 });
  assert.equal(flash.polygon, polygon, 'unchanged frames reuse the local clipping polygon');
  renderer.updateMuzzleFlashes(state, { time: 10.06 });
  assert.equal(renderer.muzzleFlashes.length, 0, 'a stalled network clock cannot freeze a muzzle flash');
  state.soundEvents = structuredClone(state.soundEvents);
  renderer.updateMuzzleFlashes(state, { time: 11 });
  assert.equal(renderer.muzzleFlashes.length, 0, 'a copied snapshot cannot replay the event');
  state.soundEvents.push({ ...state.soundEvents[0], id: 11, sourceTime: .1 });
  renderer.updateMuzzleFlashes(state, { time: 11.1 });
  assert.equal(renderer.muzzleFlashes.length, 0, 'stale history does not become a new flash');
});

test('night muzzle sources need current unobstructed sight but never expose a distant enemy actor', () => {
  const { renderer, state } = shotFixture();
  state.soundEvents[0] = { ...state.soundEvents[0], x: 1750, actorId: 40, weapon: 'sniper', team: 'enemy' };
  const enemy = { id: 40, x: 1730, y: 950, team: 'enemy', kind: 'sniper', alive: true, visible: false };
  state.enemies = [enemy];
  renderer.updateMuzzleFlashes(state, { time: 10 });
  assert.equal(renderer.muzzleFlashes.length, 1, 'an unobstructed distant night source can be momentarily seen');
  assert.equal(renderer.actorVisible(state, enemy), false);
  assert.equal(enemy.visible, false, 'a flash grants neither a silhouette nor lasting contact intelligence');
  const flash = renderer.muzzleFlashes[0];
  state.world.walls = [{ x: 1500, y: 0, w: 10, h: 1900 }];
  assert.equal(renderer.muzzleVisible(state, flash), false);
  state.world.walls = []; state.smokes = [{ x: 1500, y: 950, radius: 100, ttl: 10 }];
  assert.equal(renderer.muzzleVisible(state, flash), false);
  state.smokes = []; renderer.houseCutaways = [{ building: { x: 1700, y: 900, w: 130, h: 150 }, amount: 0 }];
  assert.equal(renderer.muzzleVisible(state, flash), false, 'closed roofs do not carry flashes from rooms underneath');
  renderer.houseCutaways = []; state.mission.lighting = 'day';
  assert.equal(renderer.muzzleVisible(state, flash), false, 'daytime sources retain normal sight range');
});

test('pause, map, epoch changes and same-seed restarts clear obsolete flashes', () => {
  const { renderer, state } = shotFixture();
  renderer.updateMuzzleFlashes(state, { time: 10, effectEpoch: 'room:1' });
  assert.equal(renderer.muzzleFlashes.length, 1);
  renderer.updateMuzzleFlashes(state, { time: 10.01, paused: true, effectEpoch: 'room:1' });
  assert.equal(renderer.muzzleFlashes.length, 0);
  renderer.updateMuzzleFlashes(state, { time: 10.02, effectEpoch: 'room:1' });
  assert.equal(renderer.muzzleFlashes.length, 0);
  state.soundEvents.push({ ...state.soundEvents[0], id: 11 });
  renderer.updateMuzzleFlashes(state, { time: 10.03, showMap: true, effectEpoch: 'room:1' });
  renderer.updateMuzzleFlashes(state, { time: 10.04, effectEpoch: 'room:1' });
  assert.equal(renderer.muzzleFlashes.length, 0, 'closing the map cannot play shots that happened while it was open');
  state.soundEvents.push({ ...state.soundEvents[0], id: 12 });
  renderer.updateMuzzleFlashes(state, { time: 10.05, effectEpoch: 'room:1' });
  assert.equal(renderer.muzzleFlashes.length, 1);
  renderer.updateMuzzleFlashes(state, { time: 10.06, effectEpoch: 'room:2' });
  assert.equal(renderer.muzzleFlashes.length, 0, 'changing co-op role clears the previous presentation without replay');
  state.time = .05; state.soundEvents = [{ ...state.soundEvents[0], id: 2, time: .05, sourceTime: .05 }];
  renderer.updateMuzzleFlashes(state, { time: 11, effectEpoch: 'room:3' });
  assert.equal(renderer.muzzleFlashes.length, 1, 'new low event IDs are valid after a real mission restart');
});

test('night flash light is local, clipped, cached and reduced-motion aware', () => {
  const { renderer, state } = shotFixture(), draws = [], clips = [];
  renderer.ctx.drawImage = (sprite, ...rect) => draws.push({ kind: sprite.kind, rect, alpha: renderer.ctx.globalAlpha });
  renderer.ctx.clip = mode => clips.push(mode);
  renderer.updateMuzzleFlashes(state, { time: 10 });
  renderer.drawMuzzleFlashes(renderer.ctx, state, { time: 10 });
  assert.deepEqual(draws.map(draw => draw.kind), ['light', 'core']);
  assert.ok(draws[0].rect[2] <= 236 && draws[0].rect[3] <= 236, 'the brighter lighting remains a short patch rather than the viewport');
  assert.ok(clips.includes('evenodd'), 'closed roofs are removed from the local light/core clip');
  draws.length = 0;
  renderer.drawMuzzleFlashes(renderer.ctx, state, { time: 10.01, reducedMotion: true });
  assert.deepEqual(draws.map(draw => draw.kind), ['core']);
  assert.ok(draws[0].alpha < .7, 'the basic shot cue survives with a quieter intensity');
  const oldPolygon = renderer.muzzleFlashes[0].polygon;
  state.world.walls = [{ x: 1250, y: 0, w: 8, h: 1900 }]; state.world.geometryRevision = 1;
  renderer.drawMuzzleFlashes(renderer.ctx, state, { time: 10.02 });
  assert.notEqual(renderer.muzzleFlashes[0].polygon, oldPolygon);
  assert.ok(renderer.muzzleFlashes[0].polygon.every(point => point.x < 1250));
});

test('night flashes have a readable peak at desktop and mobile zoom without amplifying day or reduced-motion shots', () => {
  for (const [width, height, touch] of [[1440, 900, false], [390, 844, true], [844, 390, true]]) {
    const { renderer, state } = shotFixture(), draws = [];
    renderer.resize(width, height, 1);
    renderer.updateCamera(state, { touch, zoom: touch ? .75 : 1, reducedMotion: true });
    renderer.ctx.drawImage = (sprite, ...rect) => draws.push({ kind: sprite.kind, rect, alpha: renderer.ctx.globalAlpha });
    renderer.updateMuzzleFlashes(state, { time: 10 });
    const capture = (lighting, elapsed, reducedMotion = false) => {
      state.mission.lighting = lighting; draws.length = 0;
      renderer.drawMuzzleFlashes(renderer.ctx, state, { time: 10 + elapsed, reducedMotion });
      return draws.map(draw => ({ ...draw }));
    };
    const [dayCore] = capture('day', .03);
    near(dayCore.rect[2], muzzleProfile('rifle').length * .86 * 1.25);
    const [nightLight, nightCore] = capture('night', .03);
    assert.equal(nightLight.kind, 'light'); assert.equal(nightCore.kind, 'core');
    assert.ok(nightCore.rect[2] > dayCore.rect[2] * 1.8, 'the night flare is materially larger than the unchanged daylight cue');
    // The warm rifle artwork occupies 52 of its cached texture's 96 pixels.
    assert.ok(nightCore.rect[2] * 52 / 96 * renderer.camera.zoom >= 18, 'the visible flare survives 75% mobile zoom');
    assert.ok(nightCore.alpha >= .99 && nightLight.alpha >= .85, 'the early peak survives a normal frame interval');
    assert.ok(nightLight.rect[2] * renderer.camera.zoom >= 130, 'a visible warm light pool surrounds the muzzle at mobile zoom');
    const [reducedCore] = capture('night', .03, true);
    assert.equal(draws.length, 1, 'reduced motion retains only the basic muzzle cue');
    assert.ok(reducedCore.rect[2] < nightCore.rect[2] * .7 && reducedCore.alpha < .65);
    const [lateLight, lateCore] = capture('night', .09);
    assert.ok(lateLight.alpha < nightLight.alpha * .7 && lateCore.alpha < nightCore.alpha * .7, 'both layers decay before the original shot ends');
    assert.deepEqual(capture('night', .111), [], 'stronger night feedback does not prolong a shot');
  }
});

test('night shot feedback is drawn after the tint and overlapping automatic rounds stay bounded', () => {
  const { renderer, state } = shotFixture(), order = [];
  renderer.drawActor = () => order.push('actor'); renderer.drawAtmosphere = () => order.push('night'); renderer.drawMuzzleFlashes = () => order.push('flash');
  renderer.render(state, { time: 10, quality: 'performance', reducedMotion: true });
  assert.ok(order.indexOf('actor') < order.indexOf('night'));
  assert.ok(order.indexOf('night') < order.indexOf('flash'));
  state.soundEvents = Array.from({ length: 40 }, (_, i) => ({ ...state.soundEvents[0], id: 20 + i, actorId: i + 50, x: 1240 + i }));
  renderer.updateMuzzleFlashes(state, { time: 10.01 });
  assert.equal(renderer.muzzleFlashes.length, 24);
  state.soundEvents.push({ ...state.soundEvents.at(-1), id: 61, weapon: 'support' });
  renderer.updateMuzzleFlashes(state, { time: 10.02 });
  assert.equal(renderer.muzzleFlashes.filter(flash => flash.actorId === 89).length, 1, 'automatic fire shares one local pulse per weapon');
  assert.equal(missionLighting({ missionIndex: 4, mission: { lighting: 'night' } }), 'night');
});

test('muzzle textures are small and reused across weapon families and snapshots', t => {
  const original = globalThis.OffscreenCanvas, created = [];
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; created.push(this); this.context = new Proxy({}, { get: (target, key) => key in target ? target[key] : (() => {}) }); }
    getContext() { return this.context; }
  };
  t.after(() => { if (original === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = original; });
  const { renderer } = fixture();
  const rifle = renderer.muzzleSprite('rifle'), support = renderer.muzzleSprite('support'), sniper = renderer.muzzleSprite('sniper');
  for (let i = 0; i < 100; i++) { assert.equal(renderer.muzzleSprite('hostile'), rifle); assert.equal(renderer.muzzleSprite('hostile_support'), support); assert.equal(renderer.muzzleSprite('sniper'), sniper); }
  assert.equal(created.length, 3); assert.ok(created.every(canvas => canvas.width === 96 && canvas.height === 48));
});

test('operation equipment requires sight and contextual objectives use compact action markers', () => {
  const { renderer, state } = fixture(), positions = [], arcs = [];
  state.operation = { objects: [{ id: 'radio', kind: 'radio', x: 1260, y: 950 }, { id: 'hidden', kind: 'medical', x: 1400, y: 950 }], items: [{ id: 'battery', kind: 'battery', status: 'carried', carrierId: 1 }] };
  state.world.walls = [{ x: 1350, y: 0, w: 10, h: 1900 }];
  renderer.ctx.translate = (x, y) => positions.push({ x, y });
  renderer.drawOperationObjects(renderer.ctx, state);
  assert.ok(positions.some(point => point.x === 1260));
  assert.ok(positions.some(point => point.x === 1184), 'carried equipment follows its actual carrier');
  assert.ok(!positions.some(point => point.x === 1400), 'an equipment marker cannot reveal a hidden room');
  renderer.ctx.arc = (x, y, r) => arcs.push(r); renderer.worldLabel = () => {};
  for (const kind of ['interact', 'recon', 'deliver', 'escort']) {
    state.objective = { kind, x: 1260, y: 950, radius: 120, title: 'Action', lookAt: { x: 1500, y: 950 }, progress: .5 };
    renderer.drawObjective(state, 1, {});
  }
  assert.ok(arcs.every(radius => radius <= 55), 'action phases do not inherit the old wide hold circle');
});

test('threatened civilians keep an unarmed bent posture without extra labels', () => {
  const { renderer, state, actor } = fixture(), scales = [], labels = [];
  renderer.ctx.scale = (x, y) => scales.push({ x, y }); renderer.worldLabel = (_x, _y, text) => labels.push(text);
  const civilian = { ...actor, id: 30, team: 'civilian', role: undefined, civilianState: 'cowering' };
  renderer.drawActor(renderer.ctx, civilian, state, 1, {});
  assert.ok(scales.some(scale => scale.x === .88 && scale.y === .86));
  assert.deepEqual(labels, []);
  scales.length = 0; civilian.civilianState = 'idle'; renderer.drawActor(renderer.ctx, civilian, state, 1, {});
  assert.equal(scales.length, 0);
  civilian.civilianState = 'fleeing'; civilian.panicked = 0; renderer.drawActor(renderer.ctx, civilian, state, 1, {});
  assert.equal(scales.length, 0, 'quiet homeward movement does not look like an active panic');
});

test('touch follow keeps the controlled soldier at the usable center at every world edge and through zoom or binocular changes', () => {
  for (const [width, height, safeInsets] of [
    [390, 844, { top: 176, bottom: 196, left: 16, right: 16 }],
    [844, 390, { top: 86, bottom: 108, left: 14, right: 14 }],
  ]) {
    const { renderer, state, actor } = fixture(); renderer.resize(width, height, 1);
    const view = { touch: true, zoom: .75, safeInsets, lookahead: 1, pointer: { x: width, y: height } };
    const positions = [[13, 13], [2387, 13], [2387, 1887], [13, 1887], [1200, 950]];
    for (const [x, y] of positions) {
      actor.x = x; actor.y = y; renderer.updateCamera(state, view);
      const point = renderer.worldToScreen(actor.x, actor.y);
      near(point.x, renderer.safeRect.cx); near(point.y, renderer.safeRect.cy);
      const before = { ...renderer.camera }; actor.x += 3; actor.y += 2;
      renderer.updateCamera(state, view);
      near(renderer.camera.x - before.x, 3); near(renderer.camera.y - before.y, 2);
      near(renderer.worldToScreen(actor.x, actor.y).x, renderer.safeRect.cx);
    }
    actor.role = 'grenadier'; actor.observing = true;
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      actor.angle = angle;
      renderer.updateCamera(state, { ...view, zoom: 1.15, observing: true });
      const point = renderer.worldToScreen(actor.x, actor.y);
      near(point.x, renderer.safeRect.cx); near(point.y, renderer.safeRect.cy);
    }
    const preparedZoom = renderer.camera.zoom;
    actor.x -= 11; actor.y += 9;
    renderer.render(state, { ...view, quality: 'performance', reducedMotion: true, cameraPrepared: true });
    near(renderer.camera.zoom, preparedZoom);
    const postStep = renderer.worldToScreen(actor.x, actor.y);
    near(postStep.x, renderer.safeRect.cx); near(postStep.y, renderer.safeRect.cy);
    state.squad.push({ ...actor, id: 2, x: 27, y: 1850 }); state.playerId = 2;
    renderer.updateCamera(state, view);
    const selected = renderer.worldToScreen(27, 1850);
    near(selected.x, renderer.safeRect.cx); near(selected.y, renderer.safeRect.cy);
    renderer.updateCamera(state, { ...view, showMap: true });
    const districtCenter = renderer.worldToScreen(state.world.width / 2, state.world.height / 2);
    near(districtCenter.x, renderer.safeRect.cx); near(districtCenter.y, renderer.safeRect.cy);
  }
});

test('touch corner framing fills the whole viewport with matching ground outside the cropped district', () => {
  for (const [width, height] of [[390, 844], [844, 390]]) for (const [x, y] of [[13, 13], [2387, 13], [2387, 1887], [13, 1887]]) {
    const { renderer, state, actor } = fixture(), fills = []; renderer.resize(width, height, 1);
    actor.x = x; actor.y = y;
    renderer.ctx.fillRect = (x, y, w, h) => { if (renderer.ctx.fillStyle === '#6d6550') fills.push({ x, y, w, h }); };
    const view = { touch: true, zoom: .6, safeInsets: { top: height > width ? 220 : 90, bottom: height > width ? 240 : 115, left: 16, right: 16 }, quality: 'performance', reducedMotion: true };
    renderer.updateCamera(state, view); renderer.render(state, { ...view, cameraPrepared: true });
    assert.equal(fills.length, 1);
    const ground = fills[0], topLeft = renderer.worldToScreen(ground.x, ground.y), bottomRight = renderer.worldToScreen(ground.x + ground.w, ground.y + ground.h);
    assert.ok(topLeft.x <= 0 && topLeft.y <= 0 && bottomRight.x >= width && bottomRight.y >= height, 'the camera margin cannot expose an unpainted or dark background strip');
  }
});

test('Expert touch hides routine world text while retaining action markers and casualty cues; other touch labels avoid the controlled soldier', () => {
  const { renderer, state, actor } = fixture(), labels = []; renderer.resize(390, 844, 1);
  renderer.ctx.fillText = text => labels.push(text);
  const view = { touch: true, zoom: .75, guidance: 'expert', reducedMotion: true };
  renderer.updateCamera(state, view);
  renderer.drawActor(renderer.ctx, { ...actor, id: 2, name: 'Ames', role: 'medic', x: actor.x + 25 }, state, 1, view);
  state.order = { type: 'move', x: actor.x + 15, y: actor.y + 15, label: 'Move to this point' };
  renderer.drawOrder(state, 1, view);
  renderer.worldLabel(actor.x, actor.y - 70, 'CONVOY WAITING');
  state.objective = { kind: 'interact', x: actor.x + 50, y: actor.y, title: 'Repair radio', radius: 120 };
  let strokes = 0; renderer.ctx.stroke = () => strokes++;
  renderer.drawObjective(state, 1, view);
  assert.ok(strokes > 0, 'the actionable target still has its compact visual marker');
  assert.deepEqual(labels, []);
  renderer.drawActor(renderer.ctx, { ...actor, id: 3, x: actor.x, y: actor.y - 70, downed: true }, state, 1, view);
  assert.deepEqual(labels, ['HELP']);
  labels.length = 0; renderer.updateCamera(state, { ...view, guidance: 'moderate' });
  renderer.drawActor(renderer.ctx, { ...actor, id: 4, name: 'Webb', role: 'support', x: actor.x + 30, y: actor.y + 70 }, state, 1, { ...view, guidance: 'moderate' });
  assert.deepEqual(labels, [], 'Moderate touch uses squad HUD cards instead of repeating healthy names over the world');
  renderer.worldLabel(actor.x, actor.y + 10, 'SQUAD MATE');
  renderer.worldLabel(actor.x, actor.y + 70, 'CLEAR OF THE SOLDIER');
  assert.deepEqual(labels, ['CLEAR OF THE SOLDIER']);
});
