import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, PORTALS, OBSTACLES, sceneAt, canTraverse, pointWalkable, movePlayer, findWalkPath, placeTerrainRock } from '../dist/world-layout.mjs';
import { initialState, perform, availableActions } from '../dist/state.mjs';

function apply(s,action){const a=availableActions(s).find(a=>a.id===action);assert(a&&!a.disabled,`Action available: ${action}`);return perform(s,action).state;}
// The unreleased 3D experiment keeps its own old geometry gate fixture.
// Its physics regression does not replay the retired recovery campaign.
function readyState(){return {...initialState(),flags:{inspectionPowered:true},receiverMode:'mute'};}
function follow(start,scene,path,state){let position={...start},current=scene;for(const point of path){const result=movePlayer(position,{x:point.x-position.x,z:point.z-position.z},current,state);assert(Math.hypot(result.x-point.x,result.z-point.z)<.03,`Path segment reaches ${point.x}, ${point.z} from ${scene}`);position={x:result.x,z:result.z};current=result.scene;}return {...position,scene:current};}

test('closed gates block both tapping and a long movement step; return remains available',()=>{
  const state=initialState();
  assert.equal(findWalkPath({x:0,z:-3},{x:0,z:-11},'junction',state),null);
  const blocked=movePlayer({x:0,z:-3},{x:0,z:-13},'junction',state);
  assert.equal(blocked.scene,'junction');assert(blocked.z>-7);
  assert.equal(canTraverse('shaft','junction',state),true);
  const lit={...state,flags:{...state.flags,inspectionPowered:true}};
  assert.equal(findWalkPath({x:0,z:-12},{x:0,z:-20},'shaft',lit),null);
  assert.equal(canTraverse('lower','shaft',state),true);
});

test('every connected room has a collision-safe route in both directions',()=>{
  const state=readyState();
  for(const p of PORTALS)for(const [from,to] of [[p.a,p.b],[p.b,p.a]]){
    const [x,z]=ROOMS[from].spawn,[tx,tz]=ROOMS[to].spawn;
    const path=findWalkPath({x,z},{x:tx,z:tz},from,state);
    assert(path?.length,`Walk path from ${from} to ${to}`);
    assert.equal(follow({x,z},from,path,state).scene,to);
  }
});

test('walls and furniture stop long or diagonal movement instead of teleporting through geometry',()=>{
  const state=readyState();
  const wall=movePlayer({x:0,z:-1},{x:-15,z:0},'junction',state);
  assert.equal(wall.scene,'junction');assert(wall.x>-3.5);
  const desk=movePlayer({x:-8,z:-3},{x:-8,z:0},'survey',state);
  assert(desk.x>-9.5);assert.equal(desk.scene,'survey');
  const corner=movePlayer({x:-2,z:-5.5},{x:-15,z:-15},'junction',state);
  assert(pointWalkable(corner.x,corner.z,corner.scene,state));
});

test('tap paths go around furniture and cannot target an unconnected room',()=>{
  const state=readyState(),start={x:-8,z:-3};
  const path=findWalkPath(start,{x:-10.9,z:-5.5},'survey',state);
  assert(path?.length);const end=follow(start,'survey',path,state);assert.equal(end.scene,'survey');
  assert.equal(findWalkPath(start,{x:7,z:-3},'survey',state),null);
  assert.equal(findWalkPath(start,{x:200,z:200},'survey',state),null);
});

test('resume positions remain inside usable space and match the original room IDs',()=>{
  const state=readyState();
  for(const [id,room] of Object.entries(ROOMS)){const [x,z]=room.spawn;assert.equal(sceneAt(x,z),id);assert(pointWalkable(x,z,id,state),id);}
});

test('exterior rock bounds cannot fill the lower landing or any other playable room',()=>{
  const nearLanding=placeTerrainRock(-Math.PI/2,22,6);
  assert(nearLanding.z<-32,'A large rock near the landing is moved beyond the entire station');
  for(let degree=0;degree<360;degree+=5)for(const radius of [1,4,10]){
    const {x,z}=placeTerrainRock(degree*Math.PI/180,22,radius);
    for(const [id,room] of Object.entries(ROOMS)){
      const nearestX=Math.max(room.minX,Math.min(room.maxX,x)),nearestZ=Math.max(room.minZ,Math.min(room.maxZ,z));
      assert(Math.hypot(x-nearestX,z-nearestZ)>radius,`Terrain bounds clear ${id} at ${degree} degrees`);
    }
  }
});
