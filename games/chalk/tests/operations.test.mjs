import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,createGame,step,stepCoop,setHumanPlayers,selectSquadMember,getNextCampaignMission,getMissionInteraction,buildingAt,campaignOutcome} from '../public/sim.mjs';
import {ENCOUNTERS} from '../public/encounters.mjs';
const quiet=(options={})=>{const s=createGame({seed:17,...options});s.enemies=[];s.maxEnemies=0;return s;};
const run=(s,seconds,input={})=>{for(let f=0;f<Math.ceil(seconds*30)&&s.status==='playing';f++)step(s,input,1/30);};
const stage=(s,id)=>s.stages.find(p=>p.id===id);
function enterStage(s,id){s.stageIndex=s.stages.findIndex(p=>p.id===id);s.phaseTime=0;step(s,{},1/30);return s.stages[s.stageIndex];}

test('six operations have distinct action routes, real indoor targets, and a four-chapter continuation boundary',()=>{
  assert.equal(MISSIONS.length,6);assert.deepEqual(MISSIONS.map(m=>m.category),['campaign','campaign','campaign','campaign','side','side']);
  assert.deepEqual(MISSIONS.map((_,i)=>getNextCampaignMission(i)),[1,2,3,null,null,null]);
  for(let mission=0;mission<6;mission++)for(const seed of [4,17,63]){
    const s=quiet({mission,seed});assert.ok(s.stages.length>=5);
    assert.ok(s.stages.some(p=>['recon','interact','deliver','escort'].includes(p.kind)));
    for(const target of s.stages.filter(p=>p.interior))assert.ok(buildingAt(s.world,target),`${s.mission.title}: ${target.id} is an actual indoor target`);
    if(mission>=4){s.status='won';assert.equal(campaignOutcome(s),null);}
  }
});

test('an item must be picked up and physically carried to delivery; incapacitation drops it for recovery',()=>{
  const s=quiet(),pick=enterStage(s,'cordon-radio'),hale=s.squad[0];Object.assign(hale,{x:pick.x,y:pick.y});
  assert.equal(getMissionInteraction(s)?.label,'Pick up radio');run(s,3.1,{interact:true});
  const item=s.operation.items[0];assert.equal(item.status,'carried');assert.equal(item.carrierId,hale.id);
  const delivery=enterStage(s,'cordon-delivery');run(s,4,{interact:true});assert.equal(item.status,'carried','holding Assist away from delivery cannot complete it');
  Object.assign(hale,{x:680,y:1340,alive:false,hp:0});selectSquadMember(s,s.squad[1].id);step(s,{},1/30);
  assert.equal(item.status,'ground');assert.equal(item.carrierId,null);assert.equal(s.objective.actionTarget.recovery,true);
  const mercer=s.squad[1];Object.assign(mercer,{x:680,y:1340});run(s,2.1,{interact:true});
  assert.equal(item.status,'carried');assert.equal(item.carrierId,mercer.id);
  Object.assign(mercer,{x:delivery.x,y:delivery.y});run(s,3.1,{interact:true});
  assert.equal(item.status,'delivered');assert.ok(s.operation.completed.includes('cordon-delivery'));
});

test('recon uses real line of sight and facing, accepts binoculars, and cannot be completed through smoke',()=>{
  const s=quiet(),p=enterStage(s,'cordon-observe'),hale=s.squad[0];Object.assign(hale,{x:1160,y:1340,angle:Math.PI/2});
  run(s,.5,{interact:true,aimX:1160,aimY:1720});assert.equal(s.phaseTime,0);
  s.smokes=[{x:1160,y:1140,radius:110,ttl:20}];run(s,.5,{interact:true,aimX:p.lookAt.x,aimY:p.lookAt.y});assert.equal(s.phaseTime,0);
  s.smokes=[];selectSquadMember(s,s.squad[1].id);const mercer=s.squad[1];Object.assign(mercer,{x:1160,y:1340});
  run(s,3.1,{observe:true,aimX:p.lookAt.x,aimY:p.lookAt.y});assert.ok(s.operation.observed.includes('cordon-observe'));
});

test('two humans cannot double pickup or delivery progress or duplicate a carried item',()=>{
  const s=quiet();setHumanPlayers(s,s.squad.slice(0,2).map(a=>a.id));const p=enterStage(s,'cordon-radio');
  for(const [i,a] of s.squad.slice(0,2).entries())Object.assign(a,{x:p.x+(i?20:-20),y:p.y});
  const inputs=Object.fromEntries(s.humanIds.map(id=>[id,{interact:true}]));for(let f=0;f<30;f++)stepCoop(s,inputs,1/30);
  assert.ok(Math.abs(s.phaseTime-1)<1e-6);for(let f=0;f<63;f++)stepCoop(s,inputs,1/30);
  assert.equal(s.operation.items.length,1);assert.equal(s.operation.items[0].status,'carried');assert.equal(s.operation.items[0].carrierId,s.squad[0].id);
});

test('mission groups are finite, preplaced snipers are reliable, and quiet stages do not replenish a random ring',()=>{
  for(let mission=0;mission<6;mission++)for(const seed of [4,17,63]){
    const s=createGame({mission,seed,difficulty:'story'}),initial=s.encounters.totalSpawned;
    if([1,3,4].includes(mission))assert.equal(s.enemies.filter(a=>a.kind==='sniper').length,1);
    for(const a of s.squad){a.hp=100000;a.maxHp=100000;a.ammo=0;a.reserve=0;}
    s.time=80;run(s,1);const after=s.encounters.totalSpawned;s.enemies=[];s.time=200;run(s,1);
    assert.equal(s.encounters.totalSpawned,after,'an exhausted approach group cannot refill around the player');
    assert.ok(s.encounters.totalSpawned<=ENCOUNTERS[mission].reduce((n,g)=>n+g.kinds.length,0));assert.ok(after>=initial);
  }
});

test('an authored sniper produces its own report and a directional warning only after a real shot',()=>{
  const s=createGame({mission:1,seed:17,difficulty:'story'}),sniper=s.enemies.find(a=>a.kind==='sniper'),hale=s.squad[0];s.maxEnemies=0;s.enemies=[sniper];
  for(const a of s.squad){a.ammo=0;a.reserve=0;a.hp=100000;a.maxHp=100000;}
  Object.assign(hale,{x:680,y:1200});run(s,1);
  assert.equal(s.radio.some(r=>r.text.includes('Long rifle report')),false);
  run(s,1);assert.ok(s.soundEvents.some(e=>e.type==='shot'&&e.weapon==='sniper'&&e.actorId===sniper.id));
  assert.ok(s.radio.some(r=>r.text.includes('Long rifle report from the north')));
});

test('defensive enemies do not converge on unseen squad positions through walls',()=>{
  const s=createGame({seed:17}),enemy=s.enemies[0],hale=s.squad[0];s.maxEnemies=0;s.enemies=[enemy];
  s.world.walls=[{x:575,y:0,w:10,h:1900}];s.grid.fill(0);s.squad.slice(1).forEach(a=>a.alive=false);
  Object.assign(enemy,{x:500,y:500,home:{x:500,y:500},senseTimer:0,lastKnown:null,lastSeenAt:-100});Object.assign(hale,{x:650,y:500});
  run(s,8);assert.equal(enemy.alert,false);assert.equal(enemy.x,500);assert.equal(enemy.y,500);assert.equal(enemy.lastKnown,null);
});

test('Night Relief has a physical carrier restart after the first road obstruction',()=>{
  const s=quiet({mission:2});s.stageIndex=s.stages.findIndex(p=>p.kind==='convoy');s.convoyIndex=3;
  const next=s.convoyRoute[4],lead=s.vehicles[0];assert.equal(next.repair,true);Object.assign(lead,{x:next.x-70,y:next.y});Object.assign(s.squad[0],{x:lead.x,y:lead.y+30});
  step(s,{},1/30);assert.equal(s.objective.kind,'repair');assert.equal(getMissionInteraction(s)?.label,'Restart carrier');
  run(s,4,{interact:true});assert.ok(Math.abs(s.convoyClear-4)<1e-6);assert.equal(lead.waiting,true);
  run(s,4.1,{interact:true});assert.ok(s.convoyCleared.includes(4));assert.ok(s.radio.some(r=>r.text.includes('Carrier running')));
});

test('snapshot object positions keep delivery interactions correct after a route decision',()=>{
  const s=quiet();const p=enterStage(s,'cordon-delivery'),item=s.operation.items[0],hale=s.squad[0];
  // Client stages are reconstructed once; operation objects carry revised coordinates.
  const object=s.operation.objects.find(o=>o.id===p.id);object.x=1640;object.y=960;
  item.status='carried';item.carrierId=hale.id;Object.assign(hale,{x:1640,y:960});
  assert.equal(p.y,580);assert.equal(getMissionInteraction(s)?.label,'Hand over radio');
  run(s,3.1,{interact:true});assert.equal(item.status,'delivered');assert.equal(item.y,960);
});

test('the Assist action remains available after switching away from an AI cargo carrier, only when cargo has physically arrived',()=>{
  const s=quiet(),p=enterStage(s,'cordon-delivery'),hale=s.squad[0],mercer=s.squad[1],item=s.operation.items[0];
  item.status='carried';item.carrierId=mercer.id;
  Object.assign(hale,{x:p.x-95,y:p.y});Object.assign(mercer,{x:p.x-240,y:p.y});
  assert.equal(getMissionInteraction(s),null,'a distant carrier cannot hand cargo over through the helper');
  Object.assign(mercer,{x:p.x-20,y:p.y});
  const action=getMissionInteraction(s);assert.equal(action?.helperCarrierId,mercer.id);assert.match(action.detail,/signal Mercer/);
  run(s,3.1,{interact:true});assert.equal(item.status,'delivered');assert.ok(s.radio.some(r=>r.speaker==='MERCER'&&r.text.includes('handed over')));
});
