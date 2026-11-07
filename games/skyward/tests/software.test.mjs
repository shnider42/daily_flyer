import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {SoftwareFlightRenderer} from '../public/software.mjs';
import {buildSoftwareTerrain} from '../public/software-terrain.mjs';
import {AIRCRAFT,MISSIONS,getMission} from '../public/campaign.mjs';
import {FlightSimulation,terrainHeight} from '../public/sim.mjs';

function mockCanvas(){
  const noop=()=>{},calls={width:0,height:0,fill:0,strokes:[]};let width=0,height=0;
  const ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop}),fill:()=>calls.fill++,stroke(){calls.strokes.push({width:this.lineWidth,color:this.strokeStyle,alpha:this.globalAlpha});}},{get:(target,key)=>target[key]??noop});
  return {calls,getContext:()=>ctx,getBoundingClientRect:()=>({width:1280,height:800}),get width(){return width;},set width(v){width=v;calls.width++;},get height(){return height;},set height(v){height=v;calls.height++;}};
}
function renderer(){const r=new SoftwareFlightRenderer(mockCanvas(),{quality:'medium'});r.loadMission(getMission('first-light'),AIRCRAFT.avro504);return r;}
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,`${message}: ${a} vs ${b}`);

test('CPU terrain tiles cover once and share complete edges across detail levels',()=>{
  for(const [x,z,cell] of [[0,0,160],[1680,-1270,160],[-8500,13300,192]]){
    const mesh=buildSoftwareTerrain({x,z,cell,radius:14000,sampleHeight:(x,z)=>30+Math.sin(x/1300)*18+Math.cos(z/1600)*12});
    const edges=new Map();let area=0;
    for(const tile of mesh.tiles){
      let tileArea=0;assert.ok(tile.boundary.length>=4);
      for(let i=0;i<tile.indices.length;i+=3){
        const ids=tile.indices.slice(i,i+3),[a,b,c]=ids.map(j=>mesh.vertices[j]);
        const triangleArea=((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]))*.5;
        assert.ok(triangleArea>0,'faces consistently point above the terrain');tileArea+=triangleArea;
        for(const p of [a,b,c])assert.ok(p[0]>=tile.x&&p[0]<=tile.x+tile.size&&p[2]>=tile.z&&p[2]<=tile.z+tile.size);
        for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);}
      }
      near(tileArea,tile.size*tile.size,'each tile contains exactly its area');area+=tileArea;
    }
    const {minX,minZ,maxX,maxZ}=mesh.bounds;near(area,(maxX-minX)*(maxZ-minZ),'complete coverage');
    for(const [key,count] of edges){
      assert.ok(count<=2,'no overlapping faces');if(count===2)continue;
      const [a,b]=key.split(':').map(i=>mesh.vertices[Number(i)]);
      assert.ok((a[0]===minX&&b[0]===minX)||(a[0]===maxX&&b[0]===maxX)||(a[2]===minZ&&b[2]===minZ)||(a[2]===maxZ&&b[2]===maxZ),'only the outer perimeter has an open edge');
    }
  }
});

test('CPU terrain retains island peaks inside coarse water cells and includes fan centers in bounds',()=>{
  const mission={biome:'pacific'},mesh=buildSoftwareTerrain({x:0,z:0,radius:21000,sampleHeight:(x,z)=>terrainHeight(x,z,mission)});
  for(const [x,z] of [[6500,7000],[-7000,13500]])assert.ok(mesh.tiles.some(t=>!t.water&&x>=t.x&&x<=t.x+t.size&&z>=t.z&&z<=t.z+t.size),'both Pacific islands have visible terrain');
  const tiny=buildSoftwareTerrain({x:0,z:0,cell:160,radius:15000,sampleHeight:(x,z)=>x===7680&&z===7680?100:-8});
  assert.ok(tiny.tiles.some(t=>!t.water&&t.maxY===100),'a center peak surrounded by water survives');
  for(const t of mesh.tiles)for(const i of t.indices){assert.ok(mesh.vertices[i][1]>=t.minY&&mesh.vertices[i][1]<=t.maxY);if(t.water)assert.ok(mesh.vertices[i][3]<0);}
});

test('settings changes keep the existing canvas backing store at the same dimensions',()=>{
  const r=renderer(),canvas=r.canvas,before={...canvas.calls};
  r.setSettings({theme:'day',sensitivity:1.3});r.setSettings({keyBindings:{pitchUp:'KeyI'}});r.resize();
  assert.equal(canvas.calls.width,before.width);assert.equal(canvas.calls.height,before.height);
  canvas.getBoundingClientRect=()=>({width:800,height:1200});r.resize();assert.equal(canvas.width,800);assert.equal(canvas.height,1200);near(r.camera.aspect,2/3,'portrait aspect');
});

test('terrain geometry stays cached between world grid crossings',()=>{
  const r=renderer(),p={x:0,y:500,z:0,heading:0,pitch:0,roll:0,speed:50};r._camera(p,1/60,{});r._terrain(p);const mesh=r._terrainMesh;
  r._queue.length=0;r._terrain({...p,x:20,z:20});assert.equal(r._terrainMesh,mesh);
  r._queue.length=0;r._terrain({...p,x:180});assert.notEqual(r._terrainMesh,mesh);
});

test('chase camera follows aircraft translation without changing its relative distance at different frame rates',()=>{
  for(const dt of [1/30,1/60,1/120]){
    const r=renderer(),p={x:0,y:900,z:0,heading:.2,pitch:.04,roll:0,speed:450};r._camera(p,dt,{camera:'chase'});
    const offset=r.camera.position.clone().sub(new THREE.Vector3(p.x,p.y,p.z));
    for(let i=0;i<30;i++){p.x+=120*dt;p.z+=450*dt;r._camera(p,dt,{camera:'chase'});const actual=r.camera.position.clone().sub(new THREE.Vector3(p.x,p.y,p.z));near(actual.distanceTo(offset),0,'relative chase offset');}
  }
});

test('cockpit position and look direction remain attached when translating, looking, and switching camera modes',()=>{
  const r=renderer(),p={x:0,y:900,z:0,heading:0,pitch:.08,roll:.3,speed:400};r._camera(p,1/60,{camera:'chase'});
  for(let i=0;i<6;i++){
    p.x+=40;p.z+=50;p.heading+=.2;const lookX=.4,lookY=-.1;r._camera(p,1/60,{camera:'cockpit',lookX,lookY});
    const direction=r.camera.getWorldDirection(new THREE.Vector3()),yaw=p.heading+lookX,pitch=p.pitch+lookY;
    near(direction.x,Math.sin(yaw)*Math.cos(pitch),'cockpit yaw x');near(direction.y,Math.sin(pitch),'cockpit pitch');near(direction.z,Math.cos(yaw)*Math.cos(pitch),'cockpit yaw z');
  }
  r._camera(p,1/60,{camera:'chase'});const fresh=renderer();fresh._camera(p,1/60,{camera:'chase'});near(r.camera.position.distanceTo(fresh.camera.position),0,'mode reset');
});

test('painter preserves complete objects when earlier passes approach the former triangle cutoff',()=>{
  const r=renderer();r.stats.drawCalls=2799;r._queue=[{type:'triangle',points:[0,0,1,0,0,1],depth:1,fill:'#fff',alpha:1},{type:'triangle',points:[1,0,1,1,0,1],depth:1,fill:'#fff',alpha:1}];
  r._paint();assert.equal(r.stats.drawCalls,2801);assert.equal(r.stats.triangles,2);assert.equal(r.canvas.calls.fill,2);
});

test('CPU renderer projects near-plane clipping and campaign aircraft with finite coordinates',()=>{
  const r=renderer();r._visibilityFar=20000;r._fogColor=[100,100,100];r._sunView.set(0,1,0);r._upView.set(0,1,0);r._focal=500;
  r._triangle([-1,-1,-.2],[1,-1,-3],[0,1,-3],[120,140,110],1,true);assert.equal(r._queue.length,1);assert.equal(r._queue[0].points.length,8);assert.ok(r._queue[0].points.every(Number.isFinite));r._paint();
  for(const id of ['avro504','b17','f15','b2']){
    const mission=MISSIONS.find(m=>m.aircraft===id),sim=new FlightSimulation(mission);r.loadMission(mission,AIRCRAFT[id]);Object.assign(sim.player,{y:900,onGround:false,speed:AIRCRAFT[id].cruise,engine:true});
    r.render(sim,1/60,{camera:'chase'});assert.ok(r.stats.triangles>100);for(const item of r._drawPool.slice(0,r._poolIndex))assert.ok(item.points.every(Number.isFinite));
  }
});


test('opaque terrain edges cover raster seams without outlining aircraft or pooled transparent faces',()=>{
  const r=renderer(),p={x:0,y:200,z:-800,heading:0,pitch:-.02,roll:0,speed:44};r.pixelRatio=1.4;r._camera(p,1/60,{camera:'chase'});r._terrain(p);
  const ground=r._queue.length;assert.ok(ground>0);assert.ok(r._queue.every(item=>item.coverEdges===true));r._paint();
  assert.equal(r.canvas.calls.strokes.length,ground);for(const stroke of r.canvas.calls.strokes){near(stroke.width*r.pixelRatio,1.25,'physical-pixel edge coverage');assert.equal(stroke.alpha,1);}
  // A pooled ground record becomes an ordinary aircraft face next frame. Its
  // coverage flag must be reset so the aircraft does not acquire an outline.
  const reused=r._drawPool[0];r._poolIndex=0;
  r._triangle([-1,-1,-3],[1,-1,-3],[0,1,-3],[120,140,110],1,true);assert.equal(r._queue[0],reused);assert.equal(r._queue[0].coverEdges,false);r._paint();
  assert.equal(r.canvas.calls.strokes.length,ground);
  r._triangleXYZ(-1,-1,-3,1,-1,-3,0,1,-3,[120,140,110],.4,true,false,true);r._paint();
  assert.equal(r.canvas.calls.strokes.length,ground,'transparent surfaces must not accumulate darker edge coverage');
});
