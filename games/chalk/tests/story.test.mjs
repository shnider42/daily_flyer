import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,stepCoop,selectSquadMember,setHumanPlayers,chooseStoryOption,getStoryInteraction,
  getStoryLeaderId,campaignOutcome,normalizeCampaignCarry,combatLOS,findPath,getSolidWalls} from '../public/sim.mjs';

function quiet(options={}){const s=createGame({seed:63,...options});s.enemies=[];s.maxEnemies=0;return s;}
function run(s,seconds,input={}){for(let i=0;i<Math.ceil(seconds*30)&&s.status==='playing';i++)step(s,input,1/30);}
function placeSquad(s,x,y){s.squad.forEach((a,i)=>{a.x=x+(i%2?28:-28);a.y=y+(i>1?26:-26);a.path=[];a.pathTimer=0;});}
function openDecision(s){
  if(s.missionIndex===0)s.time=8;
  else s.stageIndex=1;
  if(s.missionIndex===1)placeSquad(s,1160,960);
  step(s,{},1/30);assert.ok(s.story.activeDecision);return s.story.activeDecision;
}
function choose(s,option,actorId=s.playerId){return chooseStoryOption(s,s.story.activeDecision.id,option,actorId);}

test('each chapter offers a finite radio decision and preserves its standing plan without a reply',()=>{
  for(let mission=0;mission<4;mission++){
    const s=quiet({mission}),before=s.stages.map(stage=>({...stage})),decision=openDecision(s);
    assert.equal(decision.options.length,2);assert.ok(Number.isFinite(decision.deadline));
    assert.ok(decision.options.every(option=>option.label&&option.detail));
    s.time=decision.deadline+.1;step(s,{},1/30);
    assert.equal(s.story.activeDecision,null);assert.equal(s.story.resolved[decision.id].optionId,decision.defaultOption);
    assert.deepEqual(s.stages,before,'a default reply cannot add a new required interaction or block scripted mission progression');
    assert.ok(s.story.log.some(entry=>entry.kind==='decision'&&entry.text.includes('standing plan')));
  }
});

test('the pickup decision trades real holding time for a closer reachable extraction and resolves only once',()=>{
  const s=quiet(),decision=openDecision(s),before=s.stages[1].duration;
  assert.equal(choose(s,'reposition'),true);
  assert.equal(s.stages[1].duration,before+8);assert.deepEqual({x:s.stages[2].x,y:s.stages[2].y},{x:1640,y:960});
  assert.ok(s.vehicles.every(v=>v.y===960));assert.ok(findPath(s,s.stages[1],s.stages[2]).length);
  assert.equal(chooseStoryOption(s,decision.id,'reposition'),false);assert.equal(s.stages[1].duration,before+8);
  assert.equal(s.story.consequences.fatigueAdded,0);
  const original=quiet();openDecision(original);choose(original,'original');
  assert.equal(original.stages[1].duration,before);assert.equal(original.stages[2].y,580);
  assert.equal(original.story.consequences.fatigueAdded,1);
});

test('a smoke decision consumes a finite squad round and creates an actual temporary sight screen',()=>{
  const s=quiet({mission:1});openDecision(s);
  const total=s.squad.reduce((sum,a)=>sum+a.smokes,0);
  assert.equal(choose(s,'screen'),true);assert.equal(s.squad.reduce((sum,a)=>sum+a.smokes,0),total-1);
  assert.equal(s.smokes.length,1);assert.equal(s.smokes[0].ttl,20);
  assert.equal(combatLOS(s,{x:1160,y:960},{x:1160,y:1200}),false);
  assert.equal(s.story.consequences.smokeSpent,1);
  const empty=quiet({mission:1});openDecision(empty);for(const a of empty.squad)a.smokes=0;
  assert.equal(choose(empty,'screen'),false);assert.equal(empty.smokes.length,0);
  assert.equal(empty.story.activeDecision.options.find(o=>o.id==='screen').available,false);
  assert.equal(choose(empty,'reserve'),true);
});

test('taking extra casualties lengthens exposed loading and records who actually boarded',()=>{
  const s=quiet({mission:2});openDecision(s);assert.equal(choose(s,'extra'),true);
  assert.equal(s.stages[2].duration,54);assert.equal(s.civilians.filter(c=>c.transportCandidate).length,2);
  s.stageIndex=2;placeSquad(s,2120,580);s.phaseTime=41.9;
  run(s,.4);assert.equal(s.status,'playing','the original 42-second load cannot finish the enlarged manifest');
  s.phaseTime=53.9;run(s,.4);assert.equal(s.status,'won');
  assert.equal(s.story.consequences.additionalLoaded,2);assert.equal(s.civilians.filter(c=>c.evacuated).length,2);
  assert.equal(campaignOutcome(s).fatigue,1);
  const assigned=quiet({mission:2});openDecision(assigned);choose(assigned,'manifest');
  assert.equal(assigned.stages[2].duration,42);assert.equal(assigned.civilians.filter(c=>c.transportCandidate).length,0);
  assert.ok(assigned.story.summary.some(text=>text.includes('aid team')));
});

test('a route decision changes a reachable later rally and walking onto that approach also communicates the choice',()=>{
  const s=quiet({mission:3});openDecision(s);assert.equal(choose(s,'east'),true);
  assert.deepEqual({x:s.stages[2].x,y:s.stages[2].y},{x:2120,y:960});
  assert.ok(findPath(s,s.stages[1],s.stages[2]).length);assert.ok(findPath(s,s.stages[2],s.stages[3]).length);
  const walked=quiet({mission:3});openDecision(walked);
  Object.assign(walked.squad[0],{x:2120,y:960});step(walked,{},1/30);
  assert.equal(walked.story.resolved['dawn-approach'].optionId,'east');
  assert.equal(walked.stages[2].x,2120);
});

test('foreign, incapacitated, unknown, expired and already-passed choices cannot mutate the mission',()=>{
  const s=quiet(),decision=openDecision(s),before=structuredClone(s.stages);
  assert.equal(chooseStoryOption(s,decision.id,'reposition',s.squad[1].id),false);
  assert.equal(chooseStoryOption(s,'unknown','reposition'),false);assert.equal(choose(s,'unknown'),false);
  s.squad[0].downed=true;assert.equal(choose(s,'reposition'),false);s.squad[0].downed=false;
  s.time=decision.deadline;assert.equal(choose(s,'reposition'),false);s.time=decision.openedAt;
  s.stageIndex=2;assert.equal(choose(s,'reposition'),false);assert.deepEqual(s.stages,before);
});

test('every solo role can recommend a decision while the AI leader explains its accepted order',()=>{
  for(const role of ['leader','grenadier','medic','support']){
    const s=quiet();selectSquadMember(s,s.squad.find(a=>a.role===role).id);openDecision(s);
    assert.equal(choose(s,'reposition'),true);assert.equal(s.stages[2].y,960);
    if(role!=='leader'){
      assert.ok(s.story.log.some(entry=>entry.kind==='recommendation'));
      assert.ok(s.story.log.some(entry=>entry.kind==='decision'&&entry.speaker==='HALE'&&entry.text.includes('Agreed')));
    }
  }
});

test('a co-op member recommendation cannot overrule the human leader or spend a resource twice',()=>{
  const s=quiet();setHumanPlayers(s,s.squad.slice(0,2).map(a=>a.id));s.time=8;stepCoop(s,{},1/30);
  const [leader,member]=s.squad,decision=s.story.activeDecision;
  assert.equal(chooseStoryOption(s,decision.id,'reposition',member.id),true);
  assert.equal(s.stages[1].duration,55);assert.equal(s.stages[2].y,580);
  assert.equal(s.story.activeDecision.recommendation.actorId,member.id);
  const logCount=s.story.log.length;
  assert.equal(chooseStoryOption(s,decision.id,'reposition',member.id),true);assert.equal(s.story.log.length,logCount);
  assert.equal(chooseStoryOption(s,decision.id,'original',leader.id),true);assert.equal(s.stages[2].y,580);
  assert.equal(chooseStoryOption(s,decision.id,'reposition',member.id),false);
  const ai=quiet();setHumanPlayers(ai,[ai.squad[1].id]);ai.time=8;stepCoop(ai,{},1/30);
  assert.equal(chooseStoryOption(ai,ai.story.activeDecision.id,'reposition',ai.squad[1].id),true);
  assert.equal(ai.stages[2].y,960,'a member with an AI leader still has a usable story decision');
});

test('the exposed story commander matches fallback authority when Hale is incapacitated',()=>{
  const s=quiet();setHumanPlayers(s,s.squad.slice(0,2).map(a=>a.id));s.time=8;stepCoop(s,{},1/30);
  const [hale,mercer]=s.squad;assert.equal(getStoryLeaderId(s),hale.id);
  hale.downed=true;assert.equal(getStoryLeaderId(s),mercer.id);
  assert.equal(chooseStoryOption(s,s.story.activeDecision.id,'reposition',mercer.id),true);
  assert.equal(s.stages[2].y,960);assert.equal(s.story.log.at(-1).speaker,'MERCER');
});

test('physical field aid works with every solo role and costs one supply before self-bandaging',()=>{
  for(const role of ['leader','grenadier','medic','support']){
    const s=quiet(),helper=s.squad.find(a=>a.role===role);selectSquadMember(s,helper.id);
    const op=s.story.opportunities[0],resident=s.civilians.find(c=>c.id===op.actorId);
    Object.assign(helper,{x:op.x,y:op.y,hp:helper.maxHp-20});
    const supply=helper.medkits,hp=helper.hp;
    assert.equal(getStoryInteraction(s,helper.id)?.label,'Aid resident');
    run(s,role==='medic'?4.6:6.1,{interact:true});
    assert.equal(op.status,'assisted',role);assert.equal(helper.medkits,supply-1);assert.equal(helper.hp,hp,'field aid takes priority over healing yourself');
    assert.equal(resident.hp,resident.maxHp);assert.equal(resident.needsAid,false);assert.equal(s.story.consequences.assisted,1);
    assert.equal(getStoryInteraction(s,helper.id),null);
  }
});

test('field aid respects actual proximity, walls and finite medical supplies',()=>{
  const s=quiet(),helper=s.squad[0],op=s.story.opportunities[0],resident=s.civilians.find(c=>c.id===op.actorId);
  assert.equal(getStoryInteraction(s),null);
  Object.assign(helper,{x:op.x,y:op.y,medkits:0});assert.equal(getStoryInteraction(s),null);run(s,.5,{interact:true});assert.equal(op.progress,0);
  helper.medkits=2;const wall=getSolidWalls(s.world).find(w=>Math.min(w.w,w.h)<18);
  if(wall.w<wall.h){helper.x=wall.x-20;helper.y=wall.y+wall.h/2;op.x=wall.x+wall.w+20;op.y=helper.y;}
  else{helper.x=wall.x+wall.w/2;helper.y=wall.y-20;op.x=helper.x;op.y=wall.y+wall.h+20;}
  Object.assign(resident,{x:op.x,y:op.y});assert.ok(Math.hypot(helper.x-op.x,helper.y-op.y)<op.radius);
  assert.equal(getStoryInteraction(s),null,'a resident in the next room cannot be treated through its wall');
  run(s,.5,{interact:true});assert.equal(op.progress,0);assert.equal(helper.medkits,2);
});

test('two humans giving field aid advance one treatment and consume exactly one supply',()=>{
  const s=quiet();setHumanPlayers(s,s.squad.slice(0,2).map(a=>a.id));const op=s.story.opportunities[0];
  s.squad.slice(0,2).forEach((a,i)=>Object.assign(a,{x:op.x+i*24,y:op.y}));
  const total=s.squad.reduce((n,a)=>n+a.medkits,0),inputs=Object.fromEntries(s.humanIds.map(id=>[id,{interact:true}]));
  for(let i=0;i<90;i++)stepCoop(s,inputs,1/30);
  assert.ok(op.progress>.49&&op.progress<.51,'two workers cannot halve the treatment time');
  for(let i=0;i<93;i++)stepCoop(s,inputs,1/30);
  assert.equal(op.status,'assisted');assert.equal(s.squad.reduce((n,a)=>n+a.medkits,0),total-1);
});

test('civilian harm quiets distant field calls without spawning retaliation, and close aid remains possible',()=>{
  const clear=quiet(),hurt=quiet(),op=clear.story.opportunities[0];
  placeSquad(clear,op.x,op.y+240);placeSquad(hurt,op.x,op.y+240);
  hurt.stats.civilianHarm=1;step(clear,{},1/30);step(hurt,{},1/30);
  assert.equal(clear.story.opportunities[0].revealed,true);assert.equal(hurt.story.opportunities[0].revealed,false);
  assert.equal(hurt.story.consequences.localCallsQuiet,true);assert.equal(hurt.enemies.length,0);assert.equal(hurt.maxEnemies,0);
  Object.assign(hurt.squad[0],{x:op.x,y:op.y+40});step(hurt,{},1/30);
  assert.equal(hurt.story.opportunities[0].revealed,true);assert.ok(getStoryInteraction(hurt));
});

test('chapter carry is bounded, explicit and applies only to the next chapter; a fresh mission has fresh supplies',()=>{
  const s=quiet(),op=s.story.opportunities[0];Object.assign(s.squad[0],{x:op.x,y:op.y});run(s,6.1,{interact:true});openDecision(s);choose(s,'original');
  assert.equal(campaignOutcome(s),null);s.status='won';s.stats.civilianHarm=1;
  const carry=campaignOutcome(s);assert.deepEqual(carry,{version:1,fromMission:0,medicalDebt:1,smokeDebt:0,fatigue:1,civilianHarm:1,aided:1});
  const next=quiet({mission:1,campaign:carry}),fresh=quiet({mission:1});
  assert.equal(next.squad.find(a=>a.role==='medic').medkits,fresh.squad.find(a=>a.role==='medic').medkits-1);
  assert.equal(next.stages[0].duration,fresh.stages[0].duration+2);assert.equal(next.story.consequences.localCallsQuiet,true);
  assert.deepEqual(next.campaign,carry);assert.ok(next.story.log.some(entry=>entry.kind==='carry'&&entry.text.includes('fewer medical')));
  assert.equal(quiet({mission:3,campaign:carry}).campaign,null);
  const replay=createGame({mission:1,seed:next.seed,campaign:next.campaign});assert.deepEqual(replay.campaign,next.campaign);assert.equal(replay.stages[0].duration,next.stages[0].duration);
  assert.equal(normalizeCampaignCarry({version:1,fromMission:99}),null);assert.equal(normalizeCampaignCarry([]),null);
  assert.deepEqual(normalizeCampaignCarry({version:1,fromMission:2,medicalDebt:999,smokeDebt:-9,fatigue:1e9,civilianHarm:Infinity,aided:999,unknown:'ignored'}),
    {version:1,fromMission:2,medicalDebt:3,smokeDebt:0,fatigue:3,civilianHarm:0,aided:4});
});

test('bullet hit events describe the post-hit victim and actual death produces retained blood and a body',()=>{
  const s=createGame({seed:63}),p=s.squad[0],enemy=s.enemies[0];s.enemies=[enemy];s.maxEnemies=0;
  Object.assign(enemy,{x:p.x+60,y:p.y,hp:24,cooldown:999});
  step(s,{fire:true,aimX:enemy.x,aimY:enemy.y},.05);
  const event=s.soundEvents.find(event=>event.type==='victim_hit');assert.ok(event);
  assert.equal(event.actorId,enemy.id);assert.equal(event.victimId,enemy.id);assert.equal(event.sourceId,p.id);
  assert.equal(event.team,'enemy');assert.equal(event.cause,'bullet');assert.equal(event.damage,24);assert.equal(event.alive,false);assert.equal(event.downed,true);
  assert.equal(s.bodies.filter(body=>body.actorId===enemy.id).length,1);assert.ok(s.bloodstains.length>0);
  assert.equal(s.effects.some(effect=>effect.type==='hit'),false,'there is no ungated generic impact puff leaking a concealed victim');
  const wounded=quiet(),soldier=wounded.squad[0];soldier.hp=7;
  wounded.bullets.push({id:++wounded.nextId,x:soldier.x-40,y:soldier.y,vx:930,vy:0,team:'enemy',owner:999,weapon:'hostile',damage:10,ttl:1});
  step(wounded,{},.05);const hit=wounded.soundEvents.find(event=>event.type==='victim_hit');
  assert.equal(hit.alive,true);assert.equal(hit.downed,true);assert.equal(hit.damage,7);assert.equal(wounded.bodies.some(body=>body.actorId===soldier.id),false);
});

test('blast damage is identified separately and never produces fear from an already dead civilian',()=>{
  const s=quiet({role:'member'}),p=s.squad[1],resident=s.civilians[0];s.civilians=[resident];
  Object.assign(resident,{x:p.x+180,y:p.y,needsAid:true});
  step(s,{grenade:true,aimX:resident.x,aimY:resident.y},1/30);run(s,1);
  const hit=s.soundEvents.find(event=>event.type==='victim_hit'&&event.actorId===resident.id);
  assert.ok(hit);assert.equal(hit.cause,'blast');assert.equal(hit.alive,false);
  assert.equal(s.soundEvents.some(event=>event.type==='civilian_fear'&&event.actorId===resident.id),false);
});

test('fear is spatial and bounded per person and globally while repeated shots continue',()=>{
  const s=quiet(),p=s.squad[0];s.civilians=s.civilians.slice(0,3);
  s.civilians.forEach((c,i)=>Object.assign(c,{x:i===2?2120:p.x+100+i*25,y:i===2?200:p.y+35,needsAid:true}));
  const farId=s.civilians[2].id,heard=new Map();
  for(let i=0;i<13*30;i++){
    step(s,{fire:true,aimX:p.x-200,aimY:p.y},1/30);
    for(const event of s.soundEvents)if(event.type==='civilian_fear')heard.set(event.id,event);
  }
  const events=[...heard.values()];assert.ok(events.length>=2);assert.ok(events.length<=4);assert.ok(events.every(event=>event.actorId!==farId&&event.alive));
  for(let i=1;i<events.length;i++)assert.ok(events[i].time-events[i-1].time>=4);
  for(const resident of s.civilians){const own=events.filter(event=>event.actorId===resident.id);for(let i=1;i<own.length;i++)assert.ok(own[i].time-own[i-1].time>=10);}
});
