import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from '../daily_flyer/themes/breach_assets/vendor/three.module.js';
import { SHADOW, platformSolid, platformStatus, courseStatus, shadowPuzzleInfo, jumpInfo } from '../daily_flyer/themes/breach_assets/shadow.mjs';
import { weaponViewTransform } from '../daily_flyer/themes/breach_assets/weapon-view.mjs';

// These tests inspect real Three.js geometry and both rendering paths. The
// canvas recorder distinguishes shape from palette; screenshots still provide
// the final check of composition, contrast and recognizability on a phone.
function canvas(width=926,height=428){
  const record=(context,values)=>{for(const value of values)context.shapeHash=Math.imul(context.shapeHash^Math.round(Number(value)*100),16777619)>>>0;};
  const context={texts:[],colors:new Set(),images:new Set(),fillStyle:'#000',globalAlpha:1,shapeHash:2166136261,
    fillRect(...values){this.colors.add(this.fillStyle);record(this,values);},fillText(text){this.texts.push(text);},
    fill(){this.colors.add(this.fillStyle);},stroke(){this.colors.add(this.strokeStyle);},
    moveTo(...values){record(this,[17,...values]);},lineTo(...values){record(this,[31,...values]);},arc(...values){record(this,[43,...values]);},
    drawImage(image){assert.ok(image,'Every visible sprite has an image');this.images.add(image);},
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
  };
  for(const method of['beginPath','closePath','save','restore','translate','scale','clearRect','putImageData'])context[method]=()=>{};
  return {width,height,style:{},context,getContext(){return context;},getBoundingClientRect(){return {width,height};},
    parentElement:{appendChild(){}},insertAdjacentElement(){},setAttribute(){},remove(){}};
}

class GeometryOnlyRenderer {
  constructor(){this.info={render:{calls:0,triangles:0}};}
  setPixelRatio(){} setClearColor(){} setSize(){} dispose(){}
  render(scene,camera){
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let calls=0,triangles=0;
    scene.traverseVisible(object=>{
      if(!object.isMesh&&!object.isSprite)return;
      if(object.frustumCulled&&!frustum.intersectsObject(object))return;
      calls++;triangles+=(object.geometry?.index?.count||object.geometry?.attributes.position?.count||6)/3*(object.isInstancedMesh?object.count:1);
    });
    this.info.render={calls,triangles};
  }
}

const source=readFileSync(new URL('../daily_flyer/themes/breach_assets/renderer.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export class BreachRenderer','class BreachRenderer');
const api=runInNewContext(source+';({SHADOW_PALETTES,SHADOW_ENEMY_TYPES,surfaceLayout,shadowSurfaceLayout,shadowPadState,shadowGuideCues,featureMode,stationKey,enemyArt,enemyHeight,enemyWidth,enemyBottom,drawEnemy,makeShadowWallTexture,makeShadowFloorTexture,makeGardenGroundDetails,allLandmarkPanels,landmarkTexture,makePlatformTexture,encounterCues,skimmerFan,cueBillboard,WebGLBreachRenderer,SoftwareBreachRenderer})',{
  platformSolid,platformStatus,courseStatus,shadowPuzzleInfo,jumpInfo,weaponViewTransform,
  THREE:{...THREE,WebGLRenderer:GeometryOnlyRenderer},document:{createElement:()=>canvas()},window:{innerWidth:926,innerHeight:428},matchMedia:()=>({matches:false}),
});
const Renderers=[api.WebGLBreachRenderer,api.SoftwareBreachRenderer];
function gameFor(){
  return {level:SHADOW,state:{status:'playing',time:0,power:false,
    player:{...SHADOW.spawn,health:100,armor:20,ammo:{pistol:40,shells:8,cells:12,slugs:4},weapon:'pistol',key:false,hasShotgun:true,alive:true},
    doors:structuredClone(SHADOW.doors),pickups:structuredClone(SHADOW.pickups),enemies:structuredClone(SHADOW.enemies),interactables:structuredClone(SHADOW.interactables),
    projectiles:[],effects:[],shadowHazards:[],upgrades:{cutter:false,insulator:false,phase:false},
  }};
}
const used=(game,id)=>{game.state.interactables.find(item=>item.id===id).used=true;};
const signature=texture=>texture.image.context.shapeHash;
const padVisual=(renderer,pad)=>renderer.mode==='webgl'?renderer.shadowPlatforms.find(v=>v.pad.id===pad.id).view:renderer.shadowPadViews[renderer.shadowLayout.pads.findIndex(v=>v.pad.id===pad.id)];

test('all ten Shadow districts own different architectural shapes and material palettes',()=>{
  const layout=api.surfaceLayout(SHADOW,true),names=Object.keys(api.SHADOW_PALETTES);
  assert.equal(names.length,10);assert.equal(new Set(names.map(id=>api.SHADOW_PALETTES[id].motif)).size,10);
  assert.equal(new Set(names.map(id=>signature(api.makeShadowWallTexture(id)))).size,10,'Wall identities differ geometrically, beyond recoloring');
  assert.equal(new Set(names.map(id=>JSON.stringify(api.SHADOW_PALETTES[id].fog))).size,10);
  for(const zone of SHADOW.zones){
    assert.equal(layout.names[layout.paletteAt((zone.x1+zone.x2)/2,(zone.z1+zone.z2)/2)],zone.id);
    const wall=api.makeShadowWallTexture(zone.id),floor=api.makeShadowFloorTexture(zone.id),ceiling=api.makeShadowFloorTexture(zone.id,true);
    assert.equal(wall.image.width,64);assert.equal(wall.image.height,128);
    assert.notEqual(signature(floor),signature(ceiling),'The floor and overhead structure read differently');
  }
});

test('district landmarks and greenhouse planting never invent cover or a floor over a real gap',()=>{
  const panels=api.allLandmarkPanels(SHADOW),districts=new Set(panels.map(p=>p.shadowDistrict));
  assert.equal(districts.size,10);
  for(const landmark of SHADOW.landmarks){
    const faces=panels.filter(p=>p.id===landmark.id);assert.equal(faces.length,4,landmark.id);
    for(const face of faces)assert.ok(face.bottom+face.height<=2.5,'Shadow facades fit beneath the collision-backed ceiling');
  }
  for(const zoneId of['null','hydra']){
    const faces=panels.filter(p=>p.shadowDistrict===zoneId);
    assert.ok(faces.some(p=>p.type==='glass-lab'));assert.ok(faces.some(p=>p.type==='cultivation-bed'));assert.ok(faces.some(p=>p.type==='pump-bank'));
  }
  const glass=panels.filter(p=>p.type==='glass-lab'&&p.view==='side');
  assert.notEqual(signature(api.landmarkTexture(glass.find(p=>p.shadowDistrict==='null'))),signature(api.landmarkTexture(glass.find(p=>p.shadowDistrict==='hydra'))));
  const details=api.makeGardenGroundDetails(SHADOW),lookup=api.shadowSurfaceLayout(SHADOW);
  for(const area of details.areas)for(const cell of area.cells){
    assert.notEqual(SHADOW.grid[cell.z][cell.x],'#');assert.equal(lookup.roomCells[cell.z*SHADOW.width+cell.x],-1);
  }
  for(let n=0;n<lookup.roomCells.length;n++)if(lookup.roomCells[n]>=0)assert.equal(details.waterCells[n],0,'Water above a pit cannot imply walkable floor');
  assert.ok(details.waterCells.some(Boolean));
  const modified=structuredClone(SHADOW),landmark=modified.landmarks.find(p=>p.id==='street-anchor');
  const x=Math.floor(landmark.x),z=Math.floor(landmark.z),row=modified.grid[z].split('');row[x]='.';modified.grid[z]=row.join('');
  assert.equal(api.allLandmarkPanels(modified).some(p=>p.id===landmark.id),false,'Removing a collision cell removes the facade rather than creating phantom cover');
  const layout=api.surfaceLayout(SHADOW,true);
  assert.ok(layout.runs.some(run=>run.pit));
  for(const run of layout.runs)for(let x=run.x1;x<run.x2;x++)assert.equal(run.pit,lookup.roomCells[run.z*SHADOW.width+x]>=0);
});

test('both paths use real control gates, timing, arrival holds and restored walks without mutating state',()=>{
  for(const Renderer of Renderers){
    const game=gameFor(),renderer=new Renderer(canvas(),game,{quality:'low',reducedMotion:true});
    const street=SHADOW.platformRooms.find(r=>r.id==='street'),aqueduct=SHADOW.platformRooms.find(r=>r.id==='aqueduct');
    game.state.time=6;Object.assign(game.state.player,{x:59.5,z:52.5,angle:0});
    const render=()=>{
      const before=JSON.stringify(game.state);renderer.render(0);assert.equal(JSON.stringify(game.state),before);
      for(const room of SHADOW.platformRooms)for(const pad of room.platforms){
        const actual=platformStatus(pad,game.state.time,game),view=padVisual(renderer,pad);
        assert.equal(view.solid,actual.solid,pad.id);assert.equal(view.held,actual.held,pad.id);assert.equal(view.remaining,actual.remaining,pad.id);
        if(renderer.mode==='webgl'){
          const visual=renderer.shadowPlatforms.find(v=>v.pad.id===pad.id);assert.equal(visual.mesh.visible,actual.solid);
          if(actual.solid)assert.ok(Math.abs(visual.mesh.position.y+.09)<.0001,'The pad top stays exactly at gameplay ground height');
        }
      }
    };
    render();assert.equal(padVisual(renderer,street.platforms[2]).solid,false);assert.equal(padVisual(renderer,aqueduct.platforms[2]).locked,true);
    const beforeFloor=renderer.floorBuffer?.data.slice();
    game.state.power=true;used(game,'street-feed');render();assert.equal(padVisual(renderer,street.platforms[2]).stabilized,true);
    if(beforeFloor)assert.notDeepEqual(renderer.floorBuffer.data,beforeFloor,'The software floor changes from visible void to a supported pad');
    used(game,'aqueduct-flow');render();assert.equal(padVisual(renderer,aqueduct.platforms[2]).solid,false);
    Object.assign(game.state.player,{x:59.5,z:12.5});render();assert.equal(padVisual(renderer,aqueduct.platforms[2]).held,true);
    used(game,'aqueduct-latch');used(game,'aqueduct-sluice');used(game,'street-bridge');render();
    assert.equal(padVisual(renderer,aqueduct.platforms[2]).stabilized,true);
    for(const room of SHADOW.platformRooms){assert.equal(padVisual(renderer,room.platforms[5]).solid,true);assert.equal(courseStatus(game,room).solved,true);}
    for(const item of game.state.interactables.filter(o=>o.type==='shadow-puzzle')){
      assert.equal(api.featureMode(item,game.state,game),2);
      const maps=renderer.stationMaps?.get(api.stationKey(item))||renderer.stationImages.get(api.stationKey(item));assert.equal(maps.length,3);
      const completeImage=maps[2].image||maps[2];assert.ok(completeImage.context.texts.includes('LINK COMPLETE'));
      assert.ok(completeImage.context.texts.some(text=>['FLOW VALVE OPEN','PRESSURE LATCHED','RETURN WALK RAISED','ISLAND STABLE'].includes(text)),'A completed control states its result rather than asking the player to do it again');
    }
    renderer.dispose();
  }
});

test('launch guidance reserves the full safe window and shows locked, countdown and ready states',()=>{
  const game=gameFor(),launch=game.state.interactables.find(o=>o.id==='jump-aqueduct-1');
  Object.assign(game.state.player,{x:launch.x,z:launch.z,angle:0});game.state.power=true;
  const cue=()=>api.shadowGuideCues(game).find(o=>o.id===`route-${launch.id}`);
  assert.equal(cue().ready,false);assert.equal(api.cueBillboard(cue()).map,'route-locked');
  used(game,'aqueduct-flow');game.state.time=6.5;
  assert.equal(platformSolid(launch.landingPhase,game.state.time+1.25,game),true,'A future-only probe would misleadingly advertise this launch');
  assert.equal(jumpInfo(game,launch).ready,false);assert.equal(cue().ready,false);assert.equal(api.featureMode(launch,game.state,game),0);
  assert.equal(cue().wait,jumpInfo(game,launch).waitSeconds);assert.equal(api.cueBillboard(cue()).map,'route-wait-1');
  game.state.time=5;assert.equal(platformStatus(launch.landingPhase,5,game).solid,true);assert.equal(cue().ready,false,'An almost-expired solid pad is not a safe launch window');
  game.state.time=7.5;assert.equal(cue().ready,true);assert.equal(api.cueBillboard(cue()).map,'route-ready');
  used(game,'aqueduct-latch');game.state.time=16;assert.equal(cue().ready,true);
  assert.ok(api.shadowGuideCues(game).filter(o=>o.kind==='route').length<=3,'Nearby launch guides remain bounded');
  assert.notEqual(signature(api.makePlatformTexture(false)),signature(api.makePlatformTexture(true)),'Temporary pads carry striped hourglass marks; stable pads use bolts');
});

test('four hunters have distinct outlines and state poses, including a low and aimable skimmer',()=>{
  const types=Array.from(api.SHADOW_ENEMY_TYPES),idle=types.map(type=>signature(api.drawEnemy(type,0)));
  assert.equal(new Set(idle).size,4);
  for(const type of types)assert.notEqual(signature(api.drawEnemy(type,0)),signature(api.drawEnemy(type,4)),type+' visibly commits to its warning');
  for(const[enemy,art]of[
    [{type:'cinder-sower',shadowPhase:'recover'},'cinder-sower-spent'],
    [{type:'tether-widow',shadowPhase:'tether'},'tether-widow-linked'],
    [{type:'glass-skimmer',shadowPhase:'recover'},'glass-skimmer-open'],
    [{type:'lantern-maw',revealed:false,shadowPhase:'disguised'},'lantern-maw-disguised'],
    [{type:'lantern-maw',revealed:true,shadowPhase:'recover'},'lantern-maw-spent'],
  ]){
    assert.equal(api.enemyArt(enemy),art);assert.notEqual(signature(api.drawEnemy(art,0)),signature(api.drawEnemy(enemy.type,0)));
  }
  const skimmer={type:'glass-skimmer',health:68,alive:true};
  assert.equal(api.enemyBottom(skimmer),.23);assert.ok(api.enemyBottom(skimmer)<.35);assert.ok(api.enemyWidth(skimmer)>api.enemyHeight(skimmer));
  assert.ok(api.enemyWidth({type:'tether-widow'})>api.enemyHeight({type:'tether-widow'}));
  for(const Renderer of Renderers){
    const game=gameFor();Object.assign(game.state.player,{x:64,z:101,angle:0});
    game.state.enemies=types.map((type,i)=>({id:type,type,x:62+i,z:97,health:90,alive:true,revealed:true,shadowPhase:'windup',shadowCycle:0,telegraph:{kind:['cinder','tether','skimmer','maw'][i],x:64,z:99,radius:.6,remaining:.8,duration:1}}));
    const renderer=new Renderer(canvas(),game,{quality:'low',reducedMotion:true}),before=JSON.stringify(game.state);renderer.render(0);
    assert.equal(JSON.stringify(game.state),before);
    for(const enemy of game.state.enemies){
      const expected=renderer.getEnemyFrames(api.enemyArt(enemy,game.state.player))[4];
      if(renderer.mode==='webgl'){
        const visual=renderer.enemyVisuals.get(enemy.id);assert.equal(visual.sprite.material.map,expected);assert.equal(visual.sprite.scale.x,api.enemyWidth(enemy));assert.equal(visual.sprite.position.y,api.enemyBottom(enemy));
      }else assert.ok(renderer.context.images.has(expected),'Software path draws the warning pose for '+enemy.type);
    }
    if(renderer.waterMap)assert.equal(renderer.waterMap.offset.length(),0,'Reduced motion freezes decorative water drift');
    renderer.dispose();
  }
});

test('both paths reveal attack lanes, finite fire, active tethers and exact skimmer fans, then clear stale cues',()=>{
  for(const Renderer of Renderers){
    const game=gameFor();Object.assign(game.state.player,{x:64,z:101,angle:0});
    game.state.enemies=Array.from(api.SHADOW_ENEMY_TYPES,(type,i)=>({id:type,type,x:62+i,z:97,health:90,alive:true,revealed:true,shadowPhase:'windup',shadowCycle:type==='glass-skimmer'?1:0,
      telegraph:{kind:['cinder','tether','skimmer','maw'][i],x:64,z:99,fromX:62+i,fromZ:97,radius:i===0?1.1:.6,remaining:.7,duration:1.25}}));
    game.state.shadowHazards=[{id:'hot-floor',type:'cinder',x:65,z:99,radius:1.1,duration:3.8,remaining:2}];
    const renderer=new Renderer(canvas(),game,{quality:'low',reducedMotion:true});renderer.render(0);
    let cues=api.encounterCues(game.state);assert.equal(cues.length,5);assert.equal(cues[0].radius,1.1);assert.equal(cues[4].radius,1.1);assert.equal(cues[4].progress,2/3.8);
    const fan=api.skimmerFan(cues[2]),length=Math.hypot(cues[2].x-cues[2].fromX,cues[2].z-cues[2].fromZ);
    for(const end of fan)assert.ok(Math.abs(Math.hypot(end.x-cues[2].fromX,end.z-cues[2].fromZ)-length)<1e-9);
    if(renderer.mode==='webgl'){
      assert.equal(renderer.cueVisuals[1].beam.visible,false);assert.equal(renderer.cueVisuals[1].dots.filter(p=>p.visible).length,8);
      assert.equal(renderer.cueVisuals[2].fan.filter(p=>p.visible).length,2);assert.equal(renderer.cueVisuals[2].beam.visible,false);
      assert.equal(renderer.cueVisuals[3].beam.position.y,.025);assert.equal(renderer.cueVisuals[4].field.scale.x,1.1);
    }else assert.ok(renderer.stats.drawnCuePoints>0);
    game.state.enemies[1].shadowPhase='tether';game.state.enemies[2].shadowCycle=0;renderer.render(0);
    if(renderer.mode==='webgl'){
      assert.equal(renderer.cueVisuals[1].beam.visible,true);assert.equal(renderer.cueVisuals[1].dots.some(p=>p.visible),false);
      assert.equal(renderer.cueVisuals[2].beam.visible,true);assert.equal(renderer.cueVisuals[2].fan.some(p=>p.visible),false);
    }
    game.state.enemies=[];game.state.shadowHazards=[];renderer.render(0);assert.equal(renderer.stats.encounterCues,0);
    if(renderer.mode==='webgl')for(const visual of renderer.cueVisuals){
      assert.equal(visual.ring.visible||visual.beam.visible||visual.echo.visible||visual.field?.visible||false,false);
      for(const part of[...visual.dots||[],...visual.fan||[],...visual.arc||[]])assert.equal(part.visible,false);
    }else assert.equal(renderer.stats.drawnCuePoints,0);
    renderer.dispose();
  }
  const game=gameFor();game.state.enemies=[];game.state.shadowHazards=Array.from({length:15},(_,i)=>({id:String(i),type:'cinder',x:5,z:5,radius:1.1,duration:3.8,remaining:1}));
  assert.equal(api.encounterCues(game.state).length,12);game.state.shadowHazards.forEach(h=>h.remaining=0);assert.equal(api.encounterCues(game.state).length,0);
});

test('the expanded city stays inside phone rendering and lookup budgets in both paths',t=>{
  for(const Renderer of Renderers){
    const game=gameFor(),renderer=new Renderer(canvas(),game,{quality:'low',reducedMotion:true});let maxCalls=0;
    for(const zone of SHADOW.zones){
      Object.assign(game.state.player,{x:zone.x1+2.5,z:zone.z2-2.5,angle:0});renderer.render(0);
      assert.equal(renderer.stats.shadowDistrict,zone.id);maxCalls=Math.max(maxCalls,renderer.stats.drawCalls||0);
      if(renderer.mode==='software'){assert.ok(renderer.stats.pixelCount<=64000);assert.ok(renderer.stats.lastMaxRaySteps<=160);}
    }
    t.diagnostic(JSON.stringify({mode:renderer.mode,maxCalls,...renderer.stats}));
    assert.ok(renderer.stats.textureSourceBytes<20_000_000);
    if(renderer.mode==='webgl'){
      assert.ok(renderer.stats.geometryBytes<400_000);assert.ok(renderer.stats.geometryBytes+renderer.stats.staticInstanceBytes<800_000);assert.ok(maxCalls<300);
      assert.equal(new Set(renderer.shadowPlatforms.map(v=>v.mesh.geometry)).size,1,'Pads share one box geometry');
    }else{
      assert.equal(renderer.stats.cellLookupBytes,SHADOW.width*SHADOW.height*6);
      assert.ok(renderer.stats.textureReadbackBytes<5_000_000);
    }
    renderer.dispose();
  }
});
