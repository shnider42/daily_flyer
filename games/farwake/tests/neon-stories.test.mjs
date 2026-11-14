import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {NEON_QUEST_THREADS,NEON_QUEST_CONTACTS} from '../dist/neon-content.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||result?.message);return result;};
function arrive(game,target) {
  if(game.state.exploration)game._returnFromSite(false);
  game._persistRuntime();Object.assign(game.state,{mode:'ship',interior:null,locationId:null,exploration:null,systemId:target.systemId});game._loadSystem(target.systemId);
  const body=game.system.bodies.find(body=>body.id===target.bodyId);assert.ok(body,target.bodyId);
  Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(game.dock(body.id));
  if(!target.entityId)return;
  const surface=generateSurface(body,game.state.seed,game.state.flags),entity=surface.entities.find(entity=>entity.id===target.entityId);assert.ok(entity,target.entityId);
  Object.assign(game.state.person,{x:entity.x,y:entity.y});
}
function accept(game,definition) {
  const contact=NEON_QUEST_CONTACTS.find(contact=>contact.id===definition.offeredBy);arrive(game,{...contact,entityId:`quest:${contact.id}`});
  return ok(game.threadAction({threadId:definition.id,action:'accept',entityId:`quest:${contact.id}`}));
}
const command=(definition,step,choice)=>({threadId:definition.id,action:step.kind==='choice'?'choose':step.kind==='puzzle'?'solve':'advance',entityId:step.at.entityId,choiceId:choice?.id,solution:step.puzzle?.solution});

for(const definition of NEON_QUEST_THREADS)for(const ending of definition.stages.at(-1).options)test(`${definition.title}: ${ending.id} completes across saves and pays once`,()=>{
  let game=new Game(`voltage-story-${ending.id}`);game.state.credits=1000;
  accept(game,definition);
  const quote=game.state.narrative.quests[definition.id].rewardQuote;
  let finalResult;
  for(let guard=0;guard<8&&game.state.narrative.quests[definition.id].status==='active';guard++){
    const stage=definition.stages[game.state.narrative.quests[definition.id].stage];arrive(game,stage.at);
    const credits=game.state.credits;
    if(stage.kind==='puzzle'){
      const wrong=game.threadAction({...command(definition,stage,ending),solution:['0','0','0']});assert.equal(wrong.ok,false);assert.equal(game.state.credits,credits,'an incorrect grid allocation cannot earn a reward');
    }
    finalResult=ok(game.threadAction(command(definition,stage,ending)));
    if(stage.kind!=='choice'){assert.equal(game.state.credits,credits,'intermediate evidence does not pay the final contract');game=Game.fromSave(game.save());}
  }
  assert.equal(game.state.narrative.quests[definition.id].status,'completed');assert.equal(game.state.narrative.quests[definition.id].choices[definition.stages.at(-1).id],ending.id);
  assert.equal(finalResult.paid,quote);assert.equal(game.state.credits,1000+quote-(ending.cost?.credits||0));
  for(const flag of ending.effects.flags)assert.ok(game.state.flags.includes(`thread:${flag}`));
  for(const[contact,trust]of Object.entries(ending.effects.trust||{}))assert.equal(Math.sign(game.state.narrative.relations[contact].trust),Math.sign(trust));
  game=Game.fromSave(game.save());arrive(game,definition.stages.at(-1).at);const paid=game.state.credits;
  assert.equal(game.threadAction(command(definition,definition.stages.at(-1),ending)).ok,false);assert.equal(game.state.credits,paid);
  assert.equal(game.threadAction({threadId:definition.id,action:'accept',entityId:`quest:${definition.offeredBy}`}).ok,false);
});

test('Voltage stories reject remote evidence, fabricated contacts and unaffordable resolutions',()=>{
  const definition=NEON_QUEST_THREADS[0],game=new Game('voltage-story-guards');game.state.credits=1000;accept(game,definition);
  let stage=definition.stages[game.state.narrative.quests[definition.id].stage];
  arrive(game,{systemId:'voltage',bodyId:'voltage-crown'});const state=JSON.stringify(game.state.narrative.quests[definition.id]);
  assert.equal(game.threadAction(command(definition,stage)).ok,false);assert.equal(JSON.stringify(game.state.narrative.quests[definition.id]),state);
  arrive(game,stage.at);assert.equal(game.threadAction({...command(definition,stage),entityId:'quest:voltage-asa'}).ok,false);
  while((stage=definition.stages[game.state.narrative.quests[definition.id].stage]).kind!=='choice'){arrive(game,stage.at);ok(game.threadAction(command(definition,stage)));}
  arrive(game,stage.at);game.state.credits=0;const before=JSON.stringify(game.state.narrative.quests[definition.id]);
  assert.equal(game.threadAction(command(definition,stage,stage.options.find(option=>option.cost.credits))).ok,false);assert.equal(game.state.credits,0);assert.equal(JSON.stringify(game.state.narrative.quests[definition.id]),before);
  ok(game.threadAction(command(definition,stage,stage.options.find(option=>!option.cost.credits))));assert.equal(game.state.narrative.quests[definition.id].status,'completed');
});
