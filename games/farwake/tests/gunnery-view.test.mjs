import test from 'node:test';
import assert from 'node:assert/strict';
import {clampGunneryAim} from '../dist/gunnery.mjs';
import {getGunneryView,displayMode,projectGunneryInput,gunneryWeaponStatus,gunneryReticle,drawGunneryOverlay} from '../dist/gunnery-view.mjs';

const ship={x:800,y:-220,angle:.5};
const status={active:true,available:true,origin:{x:920,y:-180},arcCenter:.5,arcHalfAngle:Math.PI/3,aimAngle:.5,range:530,cooldownRemaining:0,energy:80,energyCost:12,canFire:true};

test('station input keeps aim and trigger but cannot carry walking, steering, boost, brake, or mining',()=>{
 const input={x:1,y:-1,thrust:1,turn:-1,strafe:1,boost:true,brake:true,mine:true,aiming:true,aimX:.6,aimY:.8,fire:true};
 const before=structuredClone(input),result=projectGunneryInput(input,status,ship);
 assert.deepEqual(input,before,'projection does not mutate Controls’ own vector');
 for(const key of ['x','y','thrust','turn','strafe'])assert.equal(result[key],0,key);
 for(const key of ['boost','brake','mine'])assert.equal(result[key],false,key);
 assert.equal(result.fire,true);assert.equal(result.aiming,true);assert.equal(result.aimX,.6);assert.equal(result.aimY,.8);
 assert.equal(projectGunneryInput(input,{active:false},ship),input,'ordinary play retains the original controls');
});

test('mouse aim uses the exterior camera and physical gun mount rather than the captain’s cabin position',()=>{
 const pointer={active:true,fire:true,x:100,y:120};
 const result=projectGunneryInput({},status,ship,{pointer,toWorld:(x,y)=>({x:x+920,y:y-180})});
 assert.equal(result.fire,true);assert.equal(result.aiming,true);
 assert.ok(Math.abs(result.aimX-100/Math.hypot(100,120))<1e-12);
 assert.ok(Math.abs(result.aimY-120/Math.hypot(100,120))<1e-12);
 const stick=projectGunneryInput({aiming:true,aimX:0,aimY:-1},status,ship,{pointer,toWorld:()=>{assert.fail('a held aim stick takes precedence over a stale pointer');}});
 assert.equal(stick.aimX,0);assert.equal(stick.aimY,-1);
});

test('gun reticle uses the real range from the mount and exactly matches authoritative traverse across wraparound',()=>{
 for(const center of [-Math.PI+.1,0,Math.PI-.1])for(const desired of [-2.8,-.4,1.4,2.9]){
  const profile={...status,arcCenter:center},input={aiming:true,aimX:Math.cos(desired),aimY:Math.sin(desired)},reticle=gunneryReticle(profile,ship,input);
  assert.equal(reticle.angle,clampGunneryAim(desired,center,status.arcHalfAngle));
  assert.ok(Math.abs(Math.hypot(reticle.x-status.origin.x,reticle.y-status.origin.y)-status.range)<1e-9);
  assert.deepEqual(reticle.origin,status.origin);
 }
 const fills=[],ctx={save(){},restore(){},fillRect(...args){fills.push(args);}};
 drawGunneryOverlay(ctx,{zoom:.75,offsetX:20,offsetY:50},{status,ship,input:{aiming:true,aimX:-1,aimY:0},rasterScale:2});
 assert.ok(fills.length>37&&fills.length<2500,'a fixed amount of range marking and short pixel lines is bounded');
 assert.ok(fills.every(args=>args.every(Number.isFinite)));
});

test('an exterior display selects ship zoom while leaving the real person, room, and hull intact',()=>{
 const game={state:{mode:'person',person:{x:120,y:220},interior:{kind:'ship',location:{vesselId:'carrier'}},ship},gunneryStatus:()=>status},before=structuredClone(game.state);
 assert.equal(getGunneryView(game),status);assert.equal(displayMode(game),'ship');assert.deepEqual(game.state,before);
 assert.equal(displayMode(game,{active:false}),'person');
 assert.equal(getGunneryView({state:{mode:'person'}}).active,false);
});

test('battery feedback distinguishes cooldown, low power, and the NPC captain’s standby phase',()=>{
 assert.equal(gunneryWeaponStatus(status).state,'READY');
 assert.equal(gunneryWeaponStatus({...status,cooldownRemaining:.3}).state,'CYCLING');
 assert.equal(gunneryWeaponStatus({...status,energy:0}).state,'LOW POWER');
 assert.equal(gunneryWeaponStatus({...status,canFire:false}).state,'STANDBY');
 assert.equal(gunneryWeaponStatus({active:false}),null);
});
