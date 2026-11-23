import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,findPath,getObjective,issueCoopOrder,setHumanPlayers,stepCoop} from '../public/sim.mjs';
import {movementSpeed} from '../public/squad-roles.mjs';

function createCoop(options={}){
  const state=createGame({seed:63,...options});
  state.enemies=[];state.maxEnemies=0;
  setHumanPlayers(state,state.squad.slice(0,2).map(actor=>actor.id));
  return state;
}
function run(state,seconds,inputs={}){
  for(let i=0;i<Math.ceil(seconds*30)&&state.status==='playing';i++)stepCoop(state,typeof inputs==='function'?inputs(state):inputs,1/30);
}
const near=(actor,point,dx=0,dy=0)=>{actor.x=point.x+dx;actor.y=point.y+dy;};

test('co-op assigns only the two playable slots and keeps exactly four persistent soldiers',()=>{
  const s=createCoop(),ids=s.squad.map(a=>a.id);
  assert.deepEqual(s.humanIds,ids.slice(0,2));
  assert.equal(s.squad.filter(a=>a.human).length,2);
  assert.equal(s.squad.filter(a=>!a.human).length,2);
  setHumanPlayers(s,[ids[1],ids[1],ids[2],99999,ids[0],ids[3]]);
  assert.deepEqual(s.humanIds,[ids[1],ids[0]]);
  assert.deepEqual(s.squad.map(a=>a.id),ids);
  assert.equal(s.squad.length,4);
  assert.equal(s.playerId,ids[0]);
});

test('one shared tick moves two humans independently without applying AI movement to either',()=>{
  const s=createCoop(),[hale,mercer]=s.squad;
  const before=[{x:hale.x,y:hale.y},{x:mercer.x,y:mercer.y}];
  stepCoop(s,{[hale.id]:{moveX:1},[mercer.id]:{moveY:-1}},1/30);
  assert.ok(Math.abs(hale.x-before[0].x-112/30)<1e-9);assert.equal(hale.y,before[0].y);
  assert.equal(mercer.x,before[1].x);assert.ok(Math.abs(mercer.y-before[1].y+movementSpeed(mercer)/30)<1e-9);
  assert.ok(Math.abs(s.time-1/30)<1e-12);
  assert.equal(issueCoopOrder(s,hale.id,'move',{x:680,y:1340}),true);
  const stopped=[{x:hale.x,y:hale.y},{x:mercer.x,y:mercer.y}];
  run(s,1);
  assert.deepEqual([{x:hale.x,y:hale.y},{x:mercer.x,y:mercer.y}],stopped);
});

test('human fire, smoke and ammunition stay attributed to each assigned soldier',()=>{
  const s=createCoop(),[hale,mercer]=s.squad;
  hale.cooldown=mercer.cooldown=0;
  stepCoop(s,new Map([[hale.id,{fire:true,aimX:hale.x+200,aimY:hale.y}],[mercer.id,{fire:true,aimX:mercer.x+200,aimY:mercer.y,smoke:true}]]),1/30);
  assert.equal(hale.ammo,29);assert.equal(mercer.ammo,29);
  assert.equal(hale.smokes,3);assert.equal(mercer.smokes,2);
  assert.deepEqual(s.soundEvents.filter(e=>e.type==='shot').map(e=>e.actorId),[hale.id,mercer.id]);
  assert.equal(s.stats.shots,2);
  stepCoop(s,{[hale.id]:{reload:true}},1/30);
  assert.ok(hale.reloadTimer>0);assert.equal(mercer.reloadTimer,0);
});

test('command authority follows the leader slot rather than room ownership or arbitrary IDs',()=>{
  const s=createCoop(),[hale,mercer,medic]=s.squad;
  assert.equal(issueCoopOrder(s,mercer.id,'move',{x:680,y:1340}),false);
  assert.equal(issueCoopOrder(s,medic.id,'hold'),false);
  assert.equal(issueCoopOrder(s,99999,'hold'),false);
  assert.equal(issueCoopOrder(s,hale.id,'hold',{x:680,y:1340}),true);
  assert.equal(s.order.type,'hold');assert.equal(s.order.x,680);
  assert.equal(issueCoopOrder(s,mercer.id,'help'),true);assert.equal(s.helpTargetId,mercer.id);
  assert.equal(issueCoopOrder(s,mercer.id,'wait'),true);assert.equal(s.waitUntil,12);
  assert.equal(issueCoopOrder(s,mercer.id,'ready'),true);assert.equal(s.waitUntil,0);
  setHumanPlayers(s,[mercer.id]);
  assert.equal(issueCoopOrder(s,hale.id,'hold'),false);
  assert.equal(s.role,'member');assert.equal(s.playerId,mercer.id);
});

test('disconnect gives the vacant soldier to AI and reconnect takes over the same soldier',()=>{
  const s=createCoop(),[hale,mercer]=s.squad,ids=s.squad.map(a=>a.id);
  mercer.x=680;mercer.y=1720;mercer.hp-=20;
  const distanceBefore=Math.hypot(hale.x-mercer.x,hale.y-mercer.y),hp=mercer.hp;
  setHumanPlayers(s,[hale.id]);run(s,1);
  assert.equal(mercer.human,false);assert.equal(s.squad.filter(a=>!a.human).length,3);
  assert.ok(Math.hypot(hale.x-mercer.x,hale.y-mercer.y)<distanceBefore);
  setHumanPlayers(s,[hale.id,mercer.id]);
  const at={x:mercer.x,y:mercer.y};run(s,.5);
  assert.deepEqual({x:mercer.x,y:mercer.y},at);
  assert.equal(mercer.hp,hp);assert.deepEqual(s.squad.map(a=>a.id),ids);
  assert.equal(s.squad.filter(a=>!a.human).length,2);
});

test('AI leader waits for the remaining human after the human commander disconnects',()=>{
  const s=createCoop(),[hale,mercer]=s.squad;
  mercer.x=2120;mercer.y=1720;
  setHumanPlayers(s,[mercer.id]);const before={x:hale.x,y:hale.y};run(s,1);
  assert.match(s.leaderOrder,/Waiting/);
  assert.ok(Math.hypot(hale.x-before.x,hale.y-before.y)<25);
  near(mercer,hale,35);run(s,1);
  assert.ok(Math.hypot(hale.x-before.x,hale.y-before.y)>30);
});

test('the AI medic can recover either or both human players',()=>{
  const s=createCoop(),[hale,mercer]=s.squad;
  hale.hp=mercer.hp=0;hale.downed=mercer.downed=true;
  run(s,16);
  assert.equal(s.status,'playing');
  assert.equal(hale.downed,false);assert.equal(mercer.downed,false);
  assert.ok(hale.hp>0&&mercer.hp>0);
  mercer.hp=mercer.maxHp-60;issueCoopOrder(s,mercer.id,'help');run(s,8);
  assert.ok(mercer.hp>mercer.maxHp-60);
});

test('one human lost does not end the shared mission but neither player soldier recoverable does',()=>{
  const s=createCoop(),[hale,mercer]=s.squad;
  hale.downed=true;hale.hp=0;hale.bleed=85;
  s.squad[2].x=s.squad[3].x=2120;
  stepCoop(s,{},1/30);
  assert.equal(hale.alive,false);assert.equal(s.status,'playing');
  stepCoop(s,{[mercer.id]:{moveX:1}},1/30);
  assert.equal(s.playerId,mercer.id);
  mercer.downed=true;mercer.hp=0;mercer.bleed=85;
  stepCoop(s,{},1/30);
  assert.equal(s.status,'lost');
});

test('rally and convoy movement wait for both living humans',()=>{
  const s=createCoop(),[hale,mercer]=s.squad,p=s.stages[0];
  near(hale,p,-30);near(s.squad[2],p,30);near(s.squad[3],p,0,40);
  run(s,3);assert.equal(s.stageIndex,0);assert.equal(s.phaseTime,0);
  near(mercer,p,0,-35);run(s,3);assert.equal(s.stageIndex,1);
  const c=createCoop({mission:2});c.stageIndex=1;
  const v=c.vehicles[0];near(c.squad[0],v,-30);near(c.squad[2],v,30);near(c.squad[3],v,0,45);c.squad[1].x=2120;c.squad[1].y=1720;
  stepCoop(c,{},1/30);assert.equal(v.waiting,true);assert.equal(v.x,200);
  near(c.squad[1],v,0,-40);stepCoop(c,{},1/30);
  assert.equal(v.waiting,false);assert.ok(v.x>200);
});

test('either human can stabilize crew or clear barriers without doubling progress',()=>{
  const s=createCoop({mission:1}),[hale,mercer]=s.squad;s.stageIndex=1;
  const crew=s.survivors[0];near(mercer,crew,30);
  stepCoop(s,{[mercer.id]:{interact:true}},1/30);assert.ok(Math.abs(s.phaseTime-1/30)<1e-12);
  near(hale,crew,-30);stepCoop(s,{[hale.id]:{interact:true},[mercer.id]:{interact:true}},1/30);
  assert.ok(Math.abs(s.phaseTime-2/30)<1e-12);
  const c=createCoop({mission:2});c.stageIndex=1;c.convoyIndex=1;
  const barrier=c.convoyRoute[2];near(c.vehicles[0],barrier,-70);near(c.squad[1],barrier,-30);
  stepCoop(c,{[c.squad[1].id]:{interact:true}},1/30);assert.ok(Math.abs(c.convoyClear-1/30)<1e-12);
  near(c.squad[0],barrier,30);stepCoop(c,{[c.squad[0].id]:{interact:true},[c.squad[1].id]:{interact:true}},1/30);
  assert.ok(Math.abs(c.convoyClear-2/30)<1e-12);
});

test('all four missions complete with two human inputs and two AI squad mates',()=>{
  for(let mission=0;mission<4;mission++){
    const s=createCoop({mission,difficulty:'story'});
    for(let frame=0;frame<30*420&&s.status==='playing';frame++){
      const objective=getObjective(s),inputs={};
      for(const [index,a] of s.squad.slice(0,2).entries()){
        const target={x:objective.x+(index?25:-25),y:objective.y};
        const d=Math.hypot(a.x-target.x,a.y-target.y);inputs[a.id]={interact:true};
        if(d>32){const next=findPath(s,a,target)[0];if(next){const dx=next.x-a.x,dy=next.y-a.y,length=Math.hypot(dx,dy);inputs[a.id].moveX=dx/length;inputs[a.id].moveY=dy/length;}}
      }
      stepCoop(s,inputs,1/30);
    }
    assert.equal(s.status,'won',`mission ${mission}, stage ${s.stageIndex}, ${s.objective.detail}`);
    assert.equal(s.squad.length,4);assert.equal(s.squad.filter(a=>a.human).length,2);
    if(mission===1)assert.equal(s.stats.rescued,2);
    if(mission===2)assert.equal(s.convoyCleared.length,2);
  }
});
