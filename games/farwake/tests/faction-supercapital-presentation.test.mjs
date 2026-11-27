import test from 'node:test';
import assert from 'node:assert/strict';
import {installFactionSupercapitals,supercapitalTelegraphs} from '../dist/faction-supercapitals.mjs';
import {drawFactionSupercapitalTelegraphs} from '../dist/space-art.mjs';

function recording(){let path=[];const paths=[];return{paths,save(){},restore(){},setLineDash(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){paths.push(path);}};}
function armed(){const world={id:'sol',radius:8100,bodies:[{id:'earth',x:0,y:0}],traffic:[]};const[actor]=installFactionSupercapitals(world);actor.active=true;Object.assign(actor.supercapitalState,{phase:'windup',remaining:1.2,targetVesselId:'warned-hull',aimX:800,aimY:300});return{world,actor};}

test('flagship warnings draw the exact live muzzle lanes for the warned hull without changing the world',()=>{
 const{world,actor}=armed(),before=JSON.stringify(world),ctx=recording(),to=(x,y)=>({x:x*.5+500,y:y*.5+500});
 drawFactionSupercapitalTelegraphs(ctx,world,{to,targetVesselId:'warned-hull'});const rays=supercapitalTelegraphs(actor);assert.equal(ctx.paths.length,1);assert.equal(ctx.paths[0].length,rays.length*2);
 rays.forEach((ray,index)=>{const from=to(ray.origin.x,ray.origin.y),end=to(ray.origin.x+Math.cos(ray.angle)*ray.length,ray.origin.y+Math.sin(ray.angle)*ray.length);assert.deepEqual(ctx.paths[0][index*2],[from.x,from.y]);assert.deepEqual(ctx.paths[0][index*2+1],[end.x,end.y]);});
 assert.equal(JSON.stringify(world),before);
});

test('quiet, other-target, destroyed and fully offscreen flagships add no false firing warning',()=>{
 const{world,actor}=armed();
 for(const options of [{targetVesselId:'another-hull'},{targetVesselId:'warned-hull',width:100,height:100,to:(x,y)=>({x:x+10000,y:y+10000})}]){const ctx=recording();drawFactionSupercapitalTelegraphs(ctx,world,options);assert.equal(ctx.paths.length,0);}
 for(const phase of ['idle','recovery']){actor.supercapitalState.phase=phase;const ctx=recording();drawFactionSupercapitalTelegraphs(ctx,world,{targetVesselId:'warned-hull'});assert.equal(ctx.paths.length,0);}
 actor.supercapitalState.phase='windup';actor.hp=0;const ctx=recording();drawFactionSupercapitalTelegraphs(ctx,world,{targetVesselId:'warned-hull'});assert.equal(ctx.paths.length,0);
});
