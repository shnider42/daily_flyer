import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { BallparkRenderer, samplePlayerMotion } from '../public/renderer.mjs';
import { CompatibilityRenderer } from '../public/fallback-renderer.mjs';
import { BaseballGame } from '../public/engine.mjs';
import { PARKS, getWallSegments, fieldRadius, fenceHeight, sweptParkWall, FEET_TO_METRES } from '../public/parks.mjs';
import { getRoster, getBatter, getBatterBody } from '../public/rosters.mjs';

const context=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'||key==='createLinearGradient'?()=>({addColorStop(){}}):target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
const canvas=()=>({width:1,height:1,clientWidth:1280,clientHeight:720,getContext:()=>context,removeEventListener(){}});
globalThis.document={createElement:canvas};globalThis.devicePixelRatio=1;
function renderer(){
  const r=Object.create(BallparkRenderer.prototype);
  Object.assign(r,{canvas:canvas(),width:1280,height:720,dpr:1,quality:'auto',touch:false,frameAverage:1/60,adaptiveScale:1,frameCount:0,menuTime:0,lastTick:-1,
    models:new Map(),runnerModels:[],lastBoard:'',wasMenu:true,materials:new Map(),scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(51,1280/720,.075,700),
    look:new THREE.Vector3(),targetCamera:new THREE.Vector3(),targetLook:new THREE.Vector3(),scratch:new THREE.Vector3(),
    geometries:{box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(1,10,8),cylinder:new THREE.CylinderGeometry(1,1,1,8),plane:new THREE.PlaneGeometry(1,1),disc:new THREE.CircleGeometry(1,24)},
    updateBoard(){},renderer:{setSize(){},setPixelRatio(){},dispose(){},render(s,c){s.updateMatrixWorld(true);c.updateMatrixWorld(true);}}});
  r.parkId='harbor';r.buildActors();r.buildGuides();r.buildEffects();return r;
}

test('four added parks share their exact playable outline with both rendering backends',()=>{
  const webgl=renderer(),software=new CompatibilityRenderer(canvas());
  assert.equal(Object.keys(PARKS).length,6);
  for(const id of ['wrigley','maple','sandlot','schoolyard']){
    webgl.setPark(id);software.setPark(id);
    const walls=getWallSegments(id);
    assert.equal(webgl.wallMeshes.length,walls.length);assert.equal(software.wallSurfaces.length,walls.length);
    for(const [i,wall] of walls.entries()){
      assert.deepEqual(webgl.wallMeshes[i].userData.wallSegment,wall);
      assert.deepEqual(software.wallSurfaces[i].segment,wall);
      const x=(wall.a.x+wall.b.x)/2,z=(wall.a.z+wall.b.z)/2,a=Math.atan2(x,z);
      assert(Math.abs(fieldRadius(a,id)-Math.hypot(x,z))<1e-7);
      assert.equal(fenceHeight(a,id),wall.height);
      const crossing=sweptParkWall({x:x*.99,z:z*.99},{x:x*1.01,z:z*1.01},id);
      assert(crossing&&Math.abs(crossing.t-.5)<1e-7);
    }
    webgl.scene.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
    assert(software.sortedPolygons.length>0);
    if(PARKS[id].neighborhood)assert(software.crowd.length<100,'a neighborhood should not inherit a stadium-sized crowd');
  }
  assert.deepEqual(PARKS.wrigley.dimensions.map(d=>d.feet),[355,368,400,368,353]);
  for(const d of PARKS.wrigley.dimensions)assert(Math.abs(fieldRadius(d.angle,'wrigley')/FEET_TO_METRES-d.feet)<1e-7);
  assert(fenceHeight(-.6,'schoolyard')>fenceHeight(.6,'schoolyard'));
  assert(fieldRadius(-Math.PI/4,'maple')>fieldRadius(Math.PI/4,'maple'));
  webgl.dispose();
});

test('Backyard roster keeps its appearance across batting, fielding, and seated pitching without live rig builds',async()=>{
  const r=renderer(),state=new BaseballGame({team:'backyard',opponentTeam:'backyard',humanSides:[0,1]}).state;
  await r.prepare(state);const count=r.playerTemplates.size;
  r.buildPlayer=()=>{throw new Error('identity rig built during live play');};
  const club=getRoster(0,state);
  for(let i=0;i<club.lineup.length;i++){
    state.batterIndex[0]=i;r.render(state,1/60,{});
    assert.equal(r.batter.appearance.skin,club.lineup[i].appearance.skin);
    assert.equal(r.batter.body.scale.x,club.lineup[i].appearance.build);
  }
  const kenny=club.pitchers.find(p=>p.appearance.wheelchair);
  const model=r.player(false,kenny.number,false,'pitcher',kenny.throws,kenny);
  assert(model.chair,'Kenny should have a chair, not a generic standing avatar');
  const before=JSON.stringify(state),pose=samplePlayerMotion(state,'pitcher',{actor:kenny,moving:true});
  assert.equal(pose.stride,0);assert.equal(pose.leftHip,-Math.PI/2);assert.equal(JSON.stringify(state),before);
  const software=new CompatibilityRenderer(canvas());software.person({...kenny,x:0,z:18.44},state,false,'pitcher',Math.PI);
  assert.equal(r.playerTemplates.size,count);r.releaseModel(model);r.dispose();
});

test('pickup, bobble, receive, and tag each have distinct deterministic poses',()=>{
  const state={time:1.2,phase:'live',ball:{x:0,y:.3,z:20,visible:true}},poses=[];
  for(const action of ['pickup','bobble','receive','tag']){
    const actor={id:'SS',action,actionStartedAt:1,actionUntil:1.6,x:0,z:20};
    const p=samplePlayerMotion(state,'fielder',{actor});
    assert.deepEqual(p,samplePlayerMotion(state,'fielder',{actor}));
    poses.push(JSON.stringify([p.hipY,p.lean,p.twist,p.leftArm,p.leftSpread]));
  }
  assert.equal(new Set(poses).size,4);
});

test('HBP capsule scales with the rendered player and keeps the delivered pitch hitter',()=>{
  const r=renderer(),state=new BaseballGame({team:'backyard'}).state;
  const roster=getRoster(0,state);
  for(let i=0;i<roster.lineup.length;i++){
    state.batterIndex[0]=i;const person=getBatter(state),body=getBatterBody(state);
    const model=r.player(false,person.number,true,'batter',person.bats==='S'?'R':person.bats,person);
    assert.equal(body.top,1.52*model.body.scale.y);assert.equal(body.bottom,.30*model.body.scale.y);
    assert.equal(body.radius,.22*model.body.scale.x);r.releaseModel(model);
  }
  state.batterIndex[0]=2;state.pitch={batter:{...getBatter(state),hand:'R'}};
  const original=getBatterBody(state);state.batterIndex[0]=7;
  assert.deepEqual(getBatterBody(state),original,'result rendering and collision must retain the original hitter');
  r.dispose();
});

test('browsing team pairings bounds cached buffers and still prewarms replacement catchers',async()=>{
  const r=renderer();let peakBytes=0,peakTemplates=0;
  for(const team of ['harbor','foundry','backyard'])for(const opponentTeam of ['harbor','foundry','backyard']){
    const game=new BaseballGame({team,opponentTeam,humanSides:[0,1]});await r.prepare(game.options);
    const build=r.buildPlayer;r.buildPlayer=()=>{throw new Error('selected club built an unprepared live rig');};
    try{
      for(const side of [0,1]){
        const state=game.state;state.battingSide=1-side;state.fielders=game._newFielders();r.render(state,1/60,{});
        const club=getRoster(side,state),catcher=club.lineup.find(p=>p.position==='C');
        for(const reserve of club.bench){state.lineupChanges[side][catcher.id]=reserve.id;state.fielders=game._newFielders();r.render(state,1/60,{});}
        delete state.lineupChanges[side][catcher.id];
      }
    }finally{r.buildPlayer=build;}
    const geometry=new Set();for(const model of r.playerTemplates.values())for(const g of model.ownedGeometries)geometry.add(g);
    let bytes=0;for(const g of geometry){for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;if(g.index)bytes+=g.index.array.byteLength;}
    peakBytes=Math.max(peakBytes,bytes);peakTemplates=Math.max(peakTemplates,r.playerTemplates.size);
    assert.equal(r.preparedTeams.size,1);
  }
  assert(peakTemplates<190,`cache retained ${peakTemplates} templates after selection changes`);
  assert(peakBytes<40000000,`cached buffers use ${peakBytes} bytes`);
  const textureBytes=[...r.uniformMaterials.values()].reduce((n,m)=>n+m.map.image.width*m.map.image.height*4,0);
  assert(textureBytes<10000000,`uniform texture base data uses ${textureBytes} bytes`);
  r.dispose();
});
