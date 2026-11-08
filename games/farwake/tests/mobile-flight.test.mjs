import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileFlightInput, MOBILE_HEADING_DEADZONE } from '../dist/mobile-flight.mjs';
import { advanceShip, getShipClass } from '../dist/fleet.mjs';
import { inputVector } from '../dist/input.mjs';
import { cleanInput } from '../server/protocol.mjs';

const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const vessel=(classId='sparrow',changes={})=>({...getShipClass(classId).stats,id:'test-hull',classId,x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,energy:100,...changes});
const toward=angle=>({x:Math.cos(angle),y:Math.sin(angle)});

test('cardinal thumb headings use world directions and analog thrust when aligned',()=>{
 for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2]){
  const ship=vessel('sparrow',{angle}),before=structuredClone(ship);
  const full=mobileFlightInput(toward(angle),ship);near(full.turn,0);near(full.thrust,1);
  const half=mobileFlightInput({x:Math.cos(angle)*.5,y:Math.sin(angle)*.5},ship);near(half.thrust,.5);near(half.turn,0);
  assert.deepEqual(ship,before,'guidance never changes the physical ship');
 }
 const right=vessel();assert.equal(mobileFlightInput({x:0,y:-1},right).turn,-1);assert.equal(mobileFlightInput({x:0,y:1},right).turn,1);
 assert.equal(mobileFlightInput({x:-1,y:0},right).thrust,0,'turning around cannot accelerate away from the requested direction');
});

test('heading guidance takes the short wraparound route and brakes existing angular inertia without snapping',()=>{
 const wrapped=mobileFlightInput(toward(-Math.PI+.03),vessel('sparrow',{angle:Math.PI-.03}));assert.ok(wrapped.turn>0&&wrapped.turn<.2);assert.ok(wrapped.thrust>.99);
 const spinning=vessel('sparrow',{angle:-.03,angularVelocity:1,vx:80}),input=mobileFlightInput({x:1,y:0},spinning);
 assert.ok(input.turn<0,'a fast-moving nose starts countersteering before passing the target');
 const next=advanceShip(spinning,1/60,input);assert.ok(next.angularVelocity>0&&next.angularVelocity<spinning.angularVelocity);
 assert.ok(next.angle>spinning.angle&&next.angle<0);assert.notEqual(next.angle,0);assert.ok(next.vx>0,'guidance does not replace translational inertia');
});

test('centering the heading stick coasts and leaves braking to the explicit input',()=>{
 const ship=vessel('sparrow',{vx:120,vy:35,angularVelocity:.6}),neutral=mobileFlightInput({x:0,y:0},ship);
 assert.deepEqual(neutral,{thrust:0,turn:0});assert.deepEqual(mobileFlightInput({x:MOBILE_HEADING_DEADZONE/2,y:0},ship),neutral);
 const coast=advanceShip(ship,.1,{...neutral,flightAssist:false}),braked=advanceShip(ship,.1,{...neutral,flightAssist:false,brake:true});
 assert.ok(coast.vx>119);assert.ok(coast.angularVelocity>.5);assert.ok(Math.hypot(braked.vx,braked.vy)<Math.hypot(coast.vx,coast.vy)*.7);
 assert.ok(braked.angularVelocity<coast.angularVelocity);
});

test('left-stick walking coordinates cannot double-map into ship strafing and the right stick cannot rotate',()=>{
 const forwardShip=vessel(),forward=inputVector({move:{x:1,y:0},aim:{x:0,y:-1},ship:forwardShip});
 assert.equal(forward.x,1);assert.equal(forward.thrust,1);assert.equal(forward.strafe,0);assert.equal(forward.turn,0);assert.equal(forward.fire,false);
 const traveled=advanceShip(forwardShip,.1,cleanInput(forward));assert.ok(traveled.vx>0);near(traveled.vy,0);near(traveled.angle,0);
 const turnedShip=vessel('sparrow',{angle:1.1}),strafe=inputVector({aim:{x:1,y:-1},ship:turnedShip});
 assert.equal(strafe.thrust,0);assert.equal(strafe.turn,0);assert.equal(strafe.strafe,1);assert.equal(strafe.fire,false);
 const sideways=advanceShip(turnedShip,.1,cleanInput(strafe));near(sideways.angle,turnedShip.angle);near(sideways.angularVelocity,0);
 near(sideways.vx*Math.cos(turnedShip.angle)+sideways.vy*Math.sin(turnedShip.angle),0);
});

function guide(classId,{seconds=6,controlHz=60,flightAssist=true}={}){
 let ship=vessel(classId),input={},largestRate=0,reversals=0,lastSign=0;
 for(let tick=0;tick<seconds*120;tick++){
  if(tick%(120/controlHz)===0)input={...mobileFlightInput({x:0,y:-1},ship,{flightAssist}),flightAssist};
  ship=advanceShip(ship,1/120,input,{worldRadius:Infinity});largestRate=Math.max(largestRate,Math.abs(ship.angularVelocity));
  const sign=Math.abs(ship.angularVelocity)>.005?Math.sign(ship.angularVelocity):0;if(sign&&lastSign&&sign!==lastSign)reversals++;if(sign)lastSign=sign;
 }
 return{ship,largestRate,reversals};
}

test('larger hulls turn more slowly and the controller settles without repeated left/right corrections',()=>{
 const cutter=guide('sparrow',{seconds:.5}).ship,large=guide('capital',{seconds:.5}).ship;
 assert.ok(Math.abs(cutter.angle)>Math.abs(large.angle)*4);assert.ok(Math.abs(cutter.angularVelocity)>Math.abs(large.angularVelocity)*4);
 for(const classId of['sparrow','capital'])for(const flightAssist of[true,false]){
  const result=guide(classId,{seconds:10,flightAssist});
  assert.ok(Math.abs(result.ship.angle+Math.PI/2)<.002);assert.ok(Math.abs(result.ship.angularVelocity)<.003);
  assert.ok(result.largestRate<=getShipClass(classId).stats.maxAngularVelocity);assert.equal(result.reversals,0,'rate-aware guidance does not oscillate around the heading');
 }
});

test('ordinary input frames preserve the mobile mapping through server sanitization and different update rates',()=>{
 const ship=vessel('sparrow',{angle:-.6,angularVelocity:.2}),input=inputVector({move:{x:0,y:-.8},aim:{x:.45,y:-1},buttons:new Set(['fire','brake']),ship,flightAssist:false});
 const wire=cleanInput({...input,flightAssist:false});
 for(const field of['thrust','strafe','turn','fire','brake'])assert.equal(wire[field],input[field],field);
 const direct=advanceShip(ship,.05,{...input,flightAssist:false}),authority=advanceShip(ship,.05,wire);
 near(authority.x,direct.x);near(authority.y,direct.y);near(authority.angle,direct.angle);near(authority.angularVelocity,direct.angularVelocity);
 for(const classId of['sparrow','capital']){
  const slow=guide(classId,{controlHz:20}),fast=guide(classId,{controlHz:120});
  assert.ok(Math.abs(slow.ship.angle-fast.ship.angle)<.002);assert.ok(Math.abs(slow.ship.angularVelocity-fast.ship.angularVelocity)<.002);
  assert.equal(slow.reversals,0);assert.equal(fast.reversals,0);
 }
});
