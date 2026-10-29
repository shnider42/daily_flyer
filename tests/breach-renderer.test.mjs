import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from '../daily_flyer/themes/breach_assets/vendor/three.module.js';
import { UNDERWORKS } from '../daily_flyer/themes/breach_assets/underworks.mjs';
import { LEVELS } from '../daily_flyer/themes/breach_assets/core.mjs';

// Test real Three.js geometry and renderer state without pretending that this
// environment supplies a GPU. Canvas records authored labels and allocations;
// browser screenshots remain the visual acceptance check.
function canvas(width=1440,height=900){
  const context={texts:[],colors:new Set(),fillStyle:'#000',globalAlpha:1,
    fillRect(){this.colors.add(this.fillStyle);},fillText(text){this.texts.push(text);},
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
  };
  for(const method of['beginPath','moveTo','lineTo','closePath','fill','save','restore','translate','scale','clearRect','drawImage','putImageData'])context[method]=()=>{};
  return {width,height,style:{},context,getContext(){return context;},getBoundingClientRect(){return {width,height};},
    parentElement:{appendChild(){}},insertAdjacentElement(){},setAttribute(){},remove(){this.removed=true;}};
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
  .replace(/^import \* as THREE from .*;\n/,'').replace('export class BreachRenderer','class BreachRenderer');
const api=runInNewContext(source+';({surfaceLayout,doorKind,featureMode,makeDoorTexture,makeStationTexture,WebGLBreachRenderer,SoftwareBreachRenderer})',{
  THREE:{...THREE,WebGLRenderer:GeometryOnlyRenderer},document:{createElement:()=>canvas()},window:{innerWidth:1440,innerHeight:900},matchMedia:()=>({matches:false}),
});

function gameFor(level=UNDERWORKS){
  return {level,state:{status:'playing',time:0,power:false,
    player:{...level.spawn,health:100,armor:20,ammo:{pistol:40,shells:8},weapon:'pistol',key:false,hasShotgun:true},
    doors:structuredClone(level.doors),pickups:structuredClone(level.pickups),enemies:structuredClone(level.enemies),interactables:structuredClone(level.interactables),
    projectiles:[],effects:[],upgrades:{cutter:false,insulator:false,phase:false},
  }};
}
const labels=texture=>texture.image.context.texts;

test('Underworks only allocates wall faces exposed to playable terrain and merges its floor runs',()=>{
  const layout=api.surfaceLayout(UNDERWORKS,true),s=layout.stats;
  assert.equal(s.gridCells,81*81);assert.ok(s.walkableCells>3000);
  assert.ok(s.enclosedCells>0);assert.ok(s.wallTriangles<s.previousWallTriangles*.5);
  assert.ok(s.floorRuns<s.walkableCells/2);
  assert.equal(layout.indices.byteLength+layout.hazards.byteLength,2*81*81);
  for(const face of layout.walls){
    const nx=Math.round(Math.sin(face.rot)),nz=Math.round(Math.cos(face.rot));
    const outsideX=Math.floor(face.x+nx*.25),outsideZ=Math.floor(face.z+nz*.25);
    const insideX=Math.floor(face.x-nx*.25),insideZ=Math.floor(face.z-nz*.25);
    assert.notEqual(UNDERWORKS.grid[outsideZ]?.[outsideX],'#');
    assert.equal(UNDERWORKS.grid[insideZ]?.[insideX],'#');
  }
  for(const zone of UNDERWORKS.zones){
    const name=layout.names[layout.paletteAt((zone.x1+zone.x2)/2,(zone.z1+zone.z2)/2)];assert.equal(name,zone.palette);
  }
});

test('large WebGL world uses bounded shared geometry with spatial culling',t=>{
  const renderer=new api.WebGLBreachRenderer(canvas(),gameFor());
  t.diagnostic(JSON.stringify(renderer.stats));
  assert.ok(renderer.staticBatches.every(mesh=>mesh.frustumCulled));
  assert.ok(renderer.stats.staticBatches<200);
  assert.ok(renderer.stats.staticInstanceBytes+renderer.stats.geometryBytes<512_000);
  assert.ok(renderer.stats.textureSourceBytes<8_000_000);
  const doorVisuals=[...renderer.doorVisuals.values()];
  assert.equal(new Set(doorVisuals.map(v=>v.mesh.geometry)).size,2);
  assert.ok(new Set(doorVisuals.map(v=>v.mesh.material)).size<doorVisuals.length);
  renderer.render(1/60);
  assert.ok(renderer.enemyVisuals.size<UNDERWORKS.enemies.length,'Distant enemies do not allocate visuals at spawn');
  assert.ok(renderer.renderer.info.render.calls<renderer.stats.staticBatches,'Chunk frusta omit distant geometry');
  renderer.dispose();
});

test('both paths show upgrade, refuge and transit progression using shared authored state',()=>{
  for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(),renderer=new Renderer(canvas(1280,720),game),items=game.state.interactables;
    const cutter=items.find(item=>item.upgrade==='cutter'),refuge=items.find(item=>item.type==='refuge');
    const transit=items.find(item=>item.type==='transit'),partner=items.find(item=>item.id===transit.destination);
    assert.equal(api.featureMode(cutter,game.state),0);game.state.upgrades.cutter=true;assert.equal(api.featureMode(cutter,game.state),1);
    assert.equal(api.featureMode(refuge,game.state),0);refuge.used=true;assert.equal(api.featureMode(refuge,game.state),1);
    assert.equal(api.featureMode(transit,game.state),0);transit.used=true;assert.equal(api.featureMode(transit,game.state),1);
    partner.used=true;assert.equal(api.featureMode(transit,game.state),2);
    for(const item of[cutter,refuge,transit]){
      game.state.player.x=item.x;game.state.player.z=item.z+2;renderer.render(1/60);
      if(renderer.mode==='webgl'){
        const visual=renderer.featureVisuals.get(item.id);assert.equal(visual.sprite.material.map,visual.maps[api.featureMode(item,game.state)]);
      }else assert.ok(renderer.stationImages.get(`${item.type}:${item.upgrade||''}`)[api.featureMode(item,game.state)]);
    }
    renderer.dispose();
  }
});

test('traversal barriers and station art retain distinct readable capability cues',()=>{
  const expected={grille:'CUTTER',hazard:'HIGH VOLT',phase:'PHASE',shortcut:'SHORTCUT'};
  for(const[kind,title]of Object.entries(expected))assert.ok(labels(api.makeDoorTexture(kind)).includes(title));
  assert.equal(api.doorKind({kind:'shortcut',requires:'cutter'}),'shortcut');
  assert.equal(api.doorKind({requires:'insulator'}),'hazard');
  for(const upgrade of['cutter','insulator','phase']){
    assert.ok(labels(api.makeStationTexture({type:'upgrade',upgrade},0)).includes('USE TO INSTALL'));
    assert.ok(labels(api.makeStationTexture({type:'upgrade',upgrade},1)).includes('MODULE INSTALLED'));
  }
  assert.ok(labels(api.makeStationTexture({type:'transit'},1)).includes('FIND PAIRED STATION'));
  assert.ok(labels(api.makeStationTexture({type:'transit'},2)).includes('LINKED / USE TO TRAVEL'));
});

test('software ray work and frame buffers remain bounded on the largest map at high desktop quality',()=>{
  const game=gameFor(),renderer=new api.SoftwareBreachRenderer(canvas(1920,1080),game,{quality:'high',fov:100});
  for(const point of[UNDERWORKS.spawn,{x:40.5,z:40.5,angle:0},{x:67.5,z:40.5,angle:Math.PI/2}]){
    Object.assign(game.state.player,point);renderer.render(1/60);
    assert.ok(renderer.stats.pixelCount<=160000);assert.ok(renderer.stats.lastMaxRaySteps<=160);
    assert.ok([...renderer.depth].every(distance=>distance>0&&distance<=28));
  }
  renderer.dispose();
});

test('existing mission materials and co-op local-player behavior survive every mission in both paths',()=>{
  const original=Object.values(LEVELS).filter(level=>['blacksite-07','relay-09','crosslink-11'].includes(level.missionId));
  assert.equal(original.length,3);
  for(const level of[...original,UNDERWORKS])for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(level),renderer=new Renderer(canvas(960,540),game);
    game.state.localPlayerId='p1';game.state.player.id='p1';game.state.players={p1:game.state.player,p2:{...structuredClone(game.state.player),id:'p2',x:game.state.player.x+1,alive:true}};
    renderer.handleEvents([{type:'shot',playerId:'p2',weapon:'shotgun'}]);assert.equal(renderer.flash,0);assert.equal(renderer.recoil,0);
    renderer.render(1/60);
    assert.equal(renderer.visuals.underworks,level.missionId==='underworks-13');assert.equal(renderer.layout.names.length,level.missionId==='underworks-13'?7:1);
    assert.ok((renderer.teammateVisuals||renderer.teammateMotion).has('p2'));
    game.state.players.p2.alive=false;game.state.players.p2.health=0;renderer.render(1/60);
    if(renderer.mode==='webgl')assert.ok(Object.values(renderer.teammateFrames.p2).some(frames=>frames[4]===renderer.teammateVisuals.get('p2').sprite.material.map));
    renderer.handleEvents([{type:'shot',playerId:'p1',weapon:'pistol'}]);assert.ok(renderer.flash>0);assert.ok(renderer.recoil>0);
    delete game.state.players.p2;renderer.render(1/60);assert.equal((renderer.teammateVisuals||renderer.teammateMotion).has('p2'),false);
    renderer.dispose();
  }
});
