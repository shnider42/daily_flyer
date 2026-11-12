import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { cabinLayout } from '../dist/interior-layouts.mjs';
import { MILITARY_RECRUITER } from '../dist/military-content.mjs';
import { navyServiceProof } from '../dist/navy-service.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function recruiter(game){
 const entity=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.find(item=>item.id===MILITARY_RECRUITER.id);
 assert.ok(entity);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity.id;
}
function embark(seed){
 const game=new Game(seed,{startMode:'hardcore'});
 ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter(game)}));
 ok(game.militaryCareerAction({action:'start',entityId:recruiter(game)}));
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);
 return game;
}
function tick(game,seconds){
 for(let n=0;n<Math.ceil(seconds*10);n++){
  if(game.gunneryStatus().available&&!game.gunneryStatus().active)ok(game.enterGunnery());
  game.step(.1,{});
 }
}
function until(game,predicate){
 for(let n=0;n<2400&&!predicate();n++)tick(game,.1);
 assert.ok(predicate(),`carrier did not reach expected state: ${game.state.npcContract?.phase}`);
}
function crewNeutralizesTargets(game,{personalDamage=0}={}){
 const contract=game.state.npcContract;
 for(const [index,id] of contract.navy.targetIds.entries()){
  const target=game.system.enemies.find(enemy=>enemy.id===id);assert.ok(target);
  target.hp=1;target.disabled=true;target.professionContributors={other_gunner:target.maxHp-1};
  if(index===0&&personalDamage)target.professionContributors[game.playerId]=personalDamage;
 }
}

test('a personal Navy qualification uses the same crew objective and personal watch rule as a shared qualification',()=>{
 let game=embark('solo-qualification-watch-parity');
 until(game,()=>game.state.npcContract.phase==='working');
 let contract=game.state.npcContract;
 crewNeutralizesTargets(game);tick(game,1);
 assert.equal(contract.work.done,false,'crew success alone cannot qualify an idle captain');
 assert.equal(contract.work.damage,0);
 const soloProof=navyServiceProof(contract,game.playerId),shared=structuredClone(contract);shared.military.sharedOperation=true;
 assert.deepEqual(navyServiceProof(shared,game.playerId),{...soloProof,sharedOperation:true});
 const operationId=contract.id;
 game=Game.fromSave(game.save());contract=game.state.npcContract;
 assert.equal(contract.id,operationId);assert.equal(contract.military.participants[game.playerId].watchSeconds,soloProof.watchSeconds);
 until(game,()=>contract.phase==='docked');
 assert.equal(contract.work.shots,0);assert.equal(contract.work.damage,0);
 assert.ok(navyServiceProof(contract,game.playerId).watchSeconds>=15);
 const receipt=ok(game.completeNpcContract());assert.equal(receipt.completed,true);assert.equal(receipt.teamNeutralized,2);assert.equal(receipt.teamTargetCount,2);
 assert.equal(game.state.militaryCareer.active.phase,'debrief');
 const pay=game.state.credits;ok(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}));
 assert.equal(game.state.credits,pay+100);assert.equal(game.state.professions.careers.military.completed,1);
});

test('a confirmed personal gun contribution qualifies the same way without requiring a hit on every crew target',()=>{
 const game=embark('solo-qualification-hit-parity');until(game,()=>game.state.npcContract.phase==='working');
 const contract=game.state.npcContract;
 crewNeutralizesTargets(game,{personalDamage:contract.navy.requiredDamage});tick(game,.1);
 assert.equal(contract.work.done,true);assert.equal(contract.phase,'returning');
 const proof=navyServiceProof(contract,game.playerId);assert.ok(proof.watchSeconds<15);assert.equal(proof.duty,true);assert.equal(proof.targets.filter(target=>target.damage>0).length,1);
 const shared=structuredClone(contract);shared.military.sharedOperation=true;
 assert.deepEqual(navyServiceProof(shared,game.playerId),{...proof,sharedOperation:true});
});

test('restoring an older personal Navy sortie preserves earned gun work without granting fictitious watch time',()=>{
 let game=embark('legacy-personal-duty-record');until(game,()=>game.state.npcContract.phase==='working');
 const contract=game.state.npcContract;
 contract.work.damage=17;contract.work.shots=2;contract.work.targets=[{id:contract.navy.targetIds[0],damage:17,neutralized:false,maxHull:112}];
 delete contract.military.participants;
 game=Game.fromSave(game.save());
 const member=game.state.npcContract.military.participants[game.playerId];
 assert.equal(member.damage,17);assert.equal(member.shots,2);assert.equal(member.watchSeconds,0);assert.equal(member.targets[0].damage,17);
 assert.equal(navyServiceProof(game.state.npcContract,game.playerId).duty,false);
});
