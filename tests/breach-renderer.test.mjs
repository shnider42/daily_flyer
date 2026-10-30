import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from '../daily_flyer/themes/breach_assets/vendor/three.module.js';
import { UNDERWORKS } from '../daily_flyer/themes/breach_assets/underworks.mjs';
import { SWITCHYARD } from '../daily_flyer/themes/breach_assets/switchyard.mjs';
import { LEVELS } from '../daily_flyer/themes/breach_assets/core.mjs';

// Test real Three.js geometry and renderer state without pretending that this
// environment supplies a GPU. Canvas records authored labels and allocations;
// browser screenshots remain the visual acceptance check.
function canvas(width=1440,height=900){
  const record=(context,values)=>{for(const value of values)context.shapeHash=Math.imul(context.shapeHash^Math.round(Number(value)*100),16777619)>>>0;};
  const context={texts:[],colors:new Set(),images:new Set(),fillStyle:'#000',globalAlpha:1,shapeHash:2166136261,
    fillRect(...values){this.colors.add(this.fillStyle);record(this,values);},fillText(text){this.texts.push(text);},
    fill(){this.colors.add(this.fillStyle);},
    moveTo(...values){record(this,[17,...values]);},lineTo(...values){record(this,[31,...values]);},
    drawImage(image){this.images.add(image);},
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
  };
  for(const method of['beginPath','closePath','save','restore','translate','scale','clearRect','putImageData'])context[method]=()=>{};
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
const api=runInNewContext(source+';({surfaceLayout,doorKind,doorStyleKey,doorReady,doorFrame,stationKey,featureMode,enemyArt,encounterCues,makeDoorTexture,makeStationTexture,makePickupTexture,yardLandmarkPanels,destinationPanels,WebGLBreachRenderer,SoftwareBreachRenderer})',{
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

test('barriers convey different materials and capabilities without requiring an instructional label',()=>{
  const kinds=['grille','hazard','phase','shortcut','key','power','relays'];
  const shapes=kinds.map(kind=>api.makeDoorTexture(kind).image.context.shapeHash);
  assert.equal(new Set(shapes).size,kinds.length,'Each obstacle has a different silhouette and mark, independent of color');
  for(const kind of kinds)assert.equal(labels(api.makeDoorTexture(kind)).length,0,'Barrier artwork leaves explanations to the selected guidance level');
  assert.equal(api.doorKind({kind:'shortcut',requires:'cutter'}),'grille','A return shortcut carries the same material cue as any other cuttable barrier');
  assert.equal(api.doorKind({kind:'shortcut',requires:'phase'}),'phase');
  assert.equal(api.doorKind({requires:'insulator'}),'hazard');
  for(const upgrade of['cutter','insulator','phase']){
    const before=api.makeStationTexture({type:'upgrade',upgrade},0),after=api.makeStationTexture({type:'upgrade',upgrade},1);
    assert.notEqual(before.image.context.shapeHash,after.image.context.shapeHash,'Acquiring a module removes its model from the station');
    assert.ok(!labels(before).join(' ').includes('USE TO INSTALL'));
  }
  assert.notEqual(api.makeStationTexture({type:'transit'},1).image.context.shapeHash,api.makeStationTexture({type:'transit'},2).image.context.shapeHash,'A paired transit visibly completes its circuit');
});

test('barrier circuits follow acquired capabilities and reduced motion keeps the field stable',()=>{
  for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(),renderer=new Renderer(canvas(960,540),game,{reducedMotion:true});
    const door=game.state.doors.find(door=>door.requires==='phase');
    assert.equal(api.doorReady(door,game.state),false);
    const before=renderer.mode==='webgl'?renderer.doorVisuals.get(door.id).mesh.material:null;
    game.state.player.x=door.x;game.state.player.z=door.z+2;
    game.state.upgrades.phase=true;renderer.render(1/60);
    assert.equal(api.doorReady(door,game.state),true);
    assert.equal(api.doorFrame(door,game.state,5,true).frame,0);
    if(renderer.mode==='webgl'){
      const visual=renderer.doorVisuals.get(door.id);assert.notEqual(visual.mesh.material,before);
      const readyMaterial=visual.mesh.material;renderer.clock+=1.4;renderer.render(1/60);assert.equal(visual.mesh.material,readyMaterial);
      door.open=true;renderer.render(1/60);assert.equal(visual.remnant.visible,true);
    }else assert.ok(renderer.doorRemnants.phase,'The fallback retains the opened frame too');
    renderer.dispose();
  }
});

test('both renderers expose faction changes, a boss recovery window and fixed attack telegraphs',()=>{
  for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(LEVELS['blacksite-07']),p=game.state.player;
    const sentry={id:'visual-sentry',type:'sentry',faction:'security',provoked:false,x:p.x,z:p.z-2,health:80,alive:true};
    game.state.enemies=[sentry];
    const renderer=new Renderer(canvas(960,540),game,{reducedMotion:true});
    renderer.render(1/60);assert.equal(api.enemyArt(sentry),'sentry');
    sentry.provoked=true;renderer.render(1/60);assert.equal(api.enemyArt(sentry),'sentry-hostile');
    if(renderer.mode==='webgl')assert.equal(renderer.enemyVisuals.get(sentry.id).sprite.material.map,renderer.enemyFrames['sentry-hostile'][0]);
    sentry.guardian=true;sentry.bossPhase='recover';renderer.render(1/60);assert.equal(api.enemyArt(sentry),'guardian-exposed');
    sentry.guardian=false;sentry.type='stalker';sentry.telegraph={kind:'blink',x:p.x+.3,z:p.z-2.5,radius:.7,remaining:.6,duration:.75,fromX:sentry.x,fromZ:sentry.z};
    renderer.render(1/60);assert.equal(renderer.stats.encounterCues,1);
    if(renderer.mode==='webgl'){
      const cue=renderer.cueVisuals[0];assert.equal(cue.ring.visible,true);assert.equal(cue.echo.visible,true);
      assert.equal(cue.ring.position.x,sentry.telegraph.x);assert.equal(cue.ring.position.z,sentry.telegraph.z);
    }else assert.ok(renderer.stats.drawnCuePoints>0,'Fallback draws a visible floor warning');
    const target=api.encounterCues(game.state)[0];p.x+=.1;renderer.render(1/60);
    assert.equal(api.encounterCues(game.state)[0].x,target.x,'The marker does not chase the camera while the player dodges');
    sentry.alive=false;renderer.render(1/60);assert.equal(renderer.stats.encounterCues,0);
    if(renderer.mode==='webgl')assert.equal(renderer.cueVisuals[0].ring.visible,false);
    renderer.dispose();
  }
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

test('Switchyard landmarks occupy real solid footprints and their visible cables follow playable floor',()=>{
  for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(SWITCHYARD),renderer=new Renderer(canvas(960,540),game,{quality:'low'});
    assert.equal(renderer.visuals.switchyard,true);assert.equal(renderer.stats.landmarkPanels,12);
    assert.equal(new Set(api.yardLandmarkPanels(game.level).map(panel=>panel.type)).size,3);
    assert.ok(renderer.groundPaths.length>=4);
    for(const route of renderer.groundPaths)for(const point of route.points)assert.notEqual(game.level.grid[Math.floor(point.z)][Math.floor(point.x)],'#','A visible control cable cannot lead through an unwalkable wall');
    assert.ok(renderer.destinationSigns.some(sign=>(sign.panel||sign).label==='FREIGHT LIFT'));
    assert.ok(renderer.destinationSigns.some(sign=>(sign.panel||sign).label.includes('LIFT RETURN')));
    assert.ok(renderer.stats.textureSourceBytes<8_000_000);
    for(const point of[{x:33.5,z:35.5,angle:Math.PI/2},{x:7.5,z:28.5,angle:Math.PI/2},{x:37.5,z:36.5,angle:Math.PI/2}]){Object.assign(game.state.player,point);renderer.render(1/60);}
    if(renderer.mode==='software')assert.ok(renderer.stats.pixelCount<=64000);
    renderer.dispose();
  }
  const invalid={...SWITCHYARD,landmarks:[{id:'phantom',type:'freight-car',x:22.5,z:43.5,width:1,depth:1,axis:'z'}]};
  assert.equal(api.yardLandmarkPanels(invalid).length,0,'No decorative train appears on a traversable cell');
});

test('both renderers close a previously opened shutter and show actual circuit state at every switch',()=>{
  for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(SWITCHYARD),door=game.state.doors.find(door=>door.id==='yard-shutter');
    const switches=game.state.interactables.filter(item=>item.doorIds?.includes(door.id));
    Object.assign(game.state.player,{x:28.5,z:34.5,angle:Math.PI/2});game.state.power=true;
    const renderer=new Renderer(canvas(960,540),game);
    for(const open of[false,true,false,true,false]){
      door.open=open;
      for(const item of switches)item.used=!open; // Door state wins over stale cached interaction flags.
      for(let n=0;n<10;n++)renderer.render(.08);
      for(const item of switches){
        assert.equal(api.featureMode(item,game.state),open?2:1);
        if(renderer.mode==='webgl'){
          const visual=renderer.featureVisuals.get(item.id);assert.equal(visual.sprite.material.map,visual.maps[open?2:1]);
        }else assert.ok(renderer.stationImages.get(api.stationKey(item))[open?2:1]);
      }
      if(renderer.mode==='webgl'){
        const visual=renderer.doorVisuals.get(door.id);assert.equal(visual.remnant.visible,open);assert.equal(visual.mesh.visible,!open);
        assert.ok(Math.abs(visual.amount-Number(open))<.01);
      }else{
        assert.equal(renderer.depthDoorIds.includes(door.id),!open,'Fallback ray occlusion is rebuilt on re-close');
        assert.equal(renderer.doorCells[Math.floor(door.z)*game.level.width+Math.floor(door.x)]===door,!open);
      }
    }
    assert.equal(api.doorStyleKey(door),'shutter:01');
    for(const item of switches)assert.ok(labels(api.makeStationTexture(item,2)).includes('01'));
    renderer.dispose();
  }
});

test('Arc caster has its own weapon and pickup art, electrical discharge, and truthful stun feedback',()=>{
  assert.notEqual(api.makePickupTexture('arc').image.context.shapeHash,api.makePickupTexture('shotgun').image.context.shapeHash);
  assert.notEqual(api.makePickupTexture('cells').image.context.shapeHash,api.makePickupTexture('ammo').image.context.shapeHash);
  for(const Renderer of[api.WebGLBreachRenderer,api.SoftwareBreachRenderer]){
    const game=gameFor(SWITCHYARD),p=game.state.player;
    p.hasArc=true;p.weapon='arc';p.ammo.cells=8;
    const enemy={id:'arc-visual-target',type:'runner',x:p.x,z:p.z-2,alive:true,health:50,stunTimer:.65};game.state.enemies=[enemy];
    const renderer=new Renderer(canvas(960,540),game,{reducedMotion:true});
    renderer.render(1/60);
    if(renderer.mode==='webgl')assert.equal(renderer.enemyVisuals.get(enemy.id).stun.visible,true);
    else assert.ok(renderer.context.images.has(renderer.stunImage));
    enemy.guardian=true;
    if(renderer.mode==='software')renderer.context.images.clear();renderer.render(1/60);
    if(renderer.mode==='webgl')assert.equal(renderer.enemyVisuals.get(enemy.id).stun.visible,false);
    else assert.equal(renderer.context.images.has(renderer.stunImage),false,'An immune guardian must never display the disabled cue');
    renderer.handleEvents([{type:'shot',weapon:'arc'}]);
    game.state.effects=[{id:'arc-shot',type:'arc',x:p.x,z:p.z,targetX:enemy.x,targetZ:enemy.z,life:.18}];
    renderer.render(1/60);assert.ok(renderer.flash>0);assert.equal(renderer.lastWeapon,'arc');assert.equal(renderer.stats.encounterCues,1);
    assert.ok(renderer.weaponContext.colors.has('#c7ffeb'),'The caster draws its electrical discharge instead of a firearm muzzle flash');
    if(renderer.mode==='webgl')assert.equal(renderer.cueVisuals[0].arc.filter(piece=>piece.visible).length,4);
    else assert.ok(renderer.stats.drawnCuePoints>0);
    game.state.effects=[];renderer.render(1/60);
    if(renderer.mode==='webgl')assert.equal(renderer.cueVisuals[0].arc.some(piece=>piece.visible),false);
    renderer.dispose();
  }
});
