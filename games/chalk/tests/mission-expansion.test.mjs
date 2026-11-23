import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, createGame, step, stepCoop, setHumanPlayers, getMissionInteraction, buildingAt, campaignOutcome } from '../public/sim.mjs';
import { ENCOUNTERS } from '../public/encounters.mjs';

const quiet=mission=>{const game=createGame({mission,seed:17,difficulty:'story'});game.enemies=[];game.maxEnemies=0;return game;};
const run=(game,seconds,input={})=>{for(let frame=0;frame<Math.ceil(seconds*30)&&game.status==='playing';frame++)step(game,input,1/30);};
const enter=(game,id)=>{game.stageIndex=game.stages.findIndex(stage=>stage.id===id);game.phaseTime=0;step(game,{},1/30);return game.stages[game.stageIndex];};

test('four standalone additions have distinct task rhythms and preserve the campaign and previous missions',()=>{
  assert.deepEqual(MISSIONS.slice(0,6).map(m=>m.id),['cordon','first-crash','night-relief','dawn-mile','signal-house','courtyard-evac']);
  assert.deepEqual(MISSIONS.slice(6).map(m=>[m.id,m.lighting]),[['lantern-search','night'],['dead-engine','late-afternoon'],['crossing-guard','day'],['watchline','dawn']]);
  const rhythms=[];
  for(let mission=6;mission<MISSIONS.length;mission++){
    const game=quiet(mission);
    assert.equal(game.mission.category,'side');assert.match(game.mission.time,/FICTIONAL/);
    assert.ok(game.mission.briefing.some(line=>/fictional/i.test(line)));
    assert.ok(ENCOUNTERS[mission].length>=3);
    for(const group of ENCOUNTERS[mission])assert.ok(game.stages.some(stage=>stage.id===group.stageId),group.id);
    assert.equal(new Set(game.stages.map(stage=>stage.id)).size,game.stages.length);
    rhythms.push(game.stages.map(stage=>stage.kind).join('/'));
    game.status='won';assert.equal(campaignOutcome(game),null);
  }
  assert.equal(new Set(rhythms).size,4);
});

test('Lantern Search requires separate room searches and reveals each lead only when that search finishes',()=>{
  const game=quiet(6),first=game.stages[0],second=game.stages[1],courier=game.survivors[0];
  assert.equal(new Set(game.stages.filter(s=>s.interior).map(s=>buildingAt(game.world,s).id)).size,3);
  assert.equal(courier.name,'Courier');assert.equal(courier.downed,true);assert.equal(courier.missionWait,true);
  assert.equal(game.operation.items.length,0,'search does not borrow the battery-carry loop');
  assert.ok(!game.radio.some(message=>message.text===first.completedMessage));
  Object.assign(game.squad[0],{x:first.x,y:first.y});run(game,3,{interact:true});assert.equal(game.stageIndex,0);
  run(game,1.1,{interact:true});assert.equal(game.stageIndex,1);
  assert.ok(game.radio.some(message=>message.text===first.completedMessage));
  assert.ok(!game.radio.some(message=>message.text===second.completedMessage));
  assert.equal(courier.missionWait,true);assert.equal(courier.stabilized,false);
  Object.assign(game.squad[0],{x:second.x,y:second.y});run(game,5.1,{interact:true});assert.equal(game.stageIndex,2);
  assert.ok(game.radio.some(message=>message.text===second.completedMessage));
});

test('Crossing Guard keeps three healthy residents sheltered until one completed gather interaction',()=>{
  const game=quiet(8),waiting=game.survivors.map(actor=>({x:actor.x,y:actor.y}));
  assert.equal(game.survivors.length,3);
  assert.ok(game.survivors.every(actor=>actor.alive&&!actor.downed&&actor.hp===actor.maxHp&&actor.missionWait));
  run(game,2);assert.deepEqual(game.survivors.map(actor=>({x:actor.x,y:actor.y})),waiting);
  const target=enter(game,'crossing-call');
  run(game,4,{interact:true});assert.ok(game.survivors.every(actor=>actor.missionWait),'holding Assist far away cannot summon anyone');
  Object.assign(game.squad[0],{x:target.x,y:target.y});assert.equal(getMissionInteraction(game)?.label,'Call residents');
  run(game,2,{interact:true});assert.ok(game.survivors.every(actor=>actor.missionWait));
  run(game,1.1,{interact:true});assert.ok(game.survivors.every(actor=>!actor.missionWait));
  assert.equal(game.stages[game.stageIndex].id,'crossing-east-stop');
  assert.equal(game.operation.completed.filter(id=>id==='crossing-call').length,1);
});

test('two human helpers cannot accelerate or duplicate the civilian gather task',()=>{
  const game=quiet(8),target=enter(game,'crossing-call');setHumanPlayers(game,game.squad.slice(0,2).map(actor=>actor.id));
  for(const actor of game.squad.slice(0,2))Object.assign(actor,{x:target.x,y:target.y});
  const inputs=Object.fromEntries(game.humanIds.map(id=>[id,{interact:true}]));
  for(let frame=0;frame<30;frame++)stepCoop(game,inputs,1/30);
  assert.ok(Math.abs(game.phaseTime-1)<1e-6);assert.ok(game.survivors.every(actor=>actor.missionWait));
  for(let frame=0;frame<64;frame++)stepCoop(game,inputs,1/30);
  assert.equal(game.survivors.length,3);assert.ok(game.survivors.every(actor=>!actor.missionWait));
  assert.equal(game.operation.completed.filter(id=>id==='crossing-call').length,1);
});

test('Crossing Guard extraction waits for a separated or downed resident and counts those recovered',()=>{
  const game=quiet(8),target=enter(game,'crossing-extract');
  for(const [index,actor] of [...game.squad,...game.survivors].entries())Object.assign(actor,{x:target.x+index*12,y:target.y,missionWait:false});
  const last=game.survivors.at(-1);last.x=target.x+500;
  run(game,3.2);assert.equal(game.status,'playing');assert.equal(game.phaseTime,0);
  Object.assign(last,{x:target.x+55,y:target.y,downed:true,hp:0});run(game,.1);assert.equal(game.status,'playing');
  last.downed=false;last.hp=50;run(game,3.2);assert.equal(game.status,'won');assert.equal(game.stats.rescued,3);
});

test('Dead Engine starts with a physical restart and ends along its own two-vehicle route',()=>{
  const game=quiet(7),target=enter(game,'engine-convoy'),lead=game.vehicles[0];
  assert.equal(game.vehicles.length,2);assert.equal(game.convoyRoute[1].repair,true);
  assert.deepEqual(game.convoyRoute.at(-1),{x:2120,y:960});
  assert.equal(game.convoyRoute.filter(point=>point.blocked&&!point.repair).length,1);
  for(const [index,actor] of game.squad.entries())Object.assign(actor,{x:lead.x+index*15,y:lead.y+30});
  step(game,{},1/30);assert.equal(game.objective.kind,'repair');assert.equal(getMissionInteraction(game)?.label,'Restart carrier');
  run(game,7,{interact:true});assert.equal(game.convoyCleared.length,0);assert.equal(lead.x,target.x);
  run(game,1.1,{interact:true});assert.ok(game.convoyCleared.includes(1));assert.ok(lead.x>target.x);
});

test('Watchline uses three sightlines and a real transmission that must finish before extraction',()=>{
  const game=quiet(9),recon=game.stages.filter(stage=>stage.kind==='recon');
  assert.equal(recon.length,3);assert.equal(game.operation.items.length,0);assert.equal(game.survivors.length,0);
  assert.equal(new Set(recon.map(stage=>`${stage.lookAt.x},${stage.lookAt.y}`)).size,3);
  const radio=enter(game,'watch-transmit');Object.assign(game.squad[0],{x:radio.x,y:radio.y});
  run(game,5,{interact:true});assert.equal(game.operation.transmission,null);
  run(game,1.1,{interact:true});assert.ok(game.operation.transmission.remaining>29);
  const target=enter(game,'watch-extract');for(const [index,actor] of game.squad.entries())Object.assign(actor,{x:target.x+index*20,y:target.y});
  run(game,3.2);assert.equal(game.status,'playing');assert.equal(game.phaseTime,0);
  run(game,31);assert.equal(game.operation.transmission.complete,true);assert.equal(game.status,'won');
});
