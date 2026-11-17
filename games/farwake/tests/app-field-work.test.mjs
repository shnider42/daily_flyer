import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game} from '../dist/engine.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {fieldSurfaceView} from '../dist/floodworks.mjs';
import {reconcileSurfacePosition} from '../dist/surface-position.mjs';
import {updateNpcLife} from '../dist/npc-life.mjs';
import {rescueOccupants} from '../dist/rescue-rules.mjs';
import {getGunneryView} from '../dist/gunnery-view.mjs';
import {syncRecoveredCrewSurface} from '../dist/survivor-surface.mjs';

const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
function declaration(name){const index=declarations.findIndex(match=>match[1]===name);assert.ok(index>=0);return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);}
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function fieldGame(){
 const game=new Game('app-field-work',{startMode:'casual',startSystemId:'brindle'}),body=game.system.bodies.find(value=>value.id==='orchard');
 game._arriveAsPassenger(body,{discovery:false});
 const entrance=generateSurface(body,game.state.seed).entities.find(value=>value.data?.siteId==='floodworks-6');
 Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite('floodworks-6'));return game;
}
function surfaceFixture(game=fieldGame()){
 let clears=0;
 const context=vm.createContext({game,network:null,onlineSnapshot:null,surface:null,surfaceKey:'',surfaceTarget:null,generateSurface,isWalkable,fieldSurfaceView,reconcileSurfacePosition,updateNpcLife,rescueOccupants,syncRecoveredCrewSurface,
  controls:{clear(){clears++;}},updateSurfaceFlags(){},syncDeckDamage(){}});
 vm.runInContext(['ensureSurface','syncNpcLife','npcTime'].map(declaration).join('\n'),context);
 context.ensureSurface();return{game,context,get clears(){return clears;}};
}

test('the actual app refreshes opened field collision and retains a valid same-place marker',()=>{
 const f=surfaceFixture(),{game,context}=f,closed=context.surface;
 assert.equal(isWalkable(closed,300,684),false);
 const cutter=closed.entities.find(value=>value.data?.fieldObjectId==='workshop-cutter');
 Object.assign(game.state.person,{x:cutter.x,y:cutter.y});ok(game.fieldWorkAction({action:'claim',objectId:'workshop-cutter'}));
 Object.assign(game.state.person,{x:300,y:756});context.surfaceTarget=cutter.id;
 ok(game.fieldWorkAction({action:'cut',objectId:'service-panel'}));context.ensureSurface();
 assert.notEqual(context.surface.tiles,closed.tiles);assert.equal(isWalkable(context.surface,300,684),true);
 assert.equal(context.surfaceTarget,cutter.id);assert.equal(context.surface.field,game.state.exploration.encounter.field);
});

test('compact snapshot survivor movement refreshes app interactions without rebuilding tiles or clearing input',()=>{
 const f=surfaceFixture(),{game,context}=f,tiles=context.surface.tiles,clears=f.clears,key=context.surfaceKey;
 const next=structuredClone(game.state.exploration.encounter);next.field.survivors.mara.x-=48;next.field.survivors.mara.status='following';
 game.state.exploration.encounter=next;context.ensureSurface();
 const visible=context.surface.entities.find(value=>value.data?.survivorId==='mara');
 assert.equal(visible.x,next.field.survivors.mara.x);assert.equal(visible.data.survivorStatus,'following');
 assert.equal(context.surface.field,next.field);assert.equal(context.surface.tiles,tiles);assert.equal(context.surfaceKey,key);assert.equal(f.clears,clears);
});

test('E dispatches a field object to its physical controls and the prompt names it',async()=>{
 const game=fieldGame(),opened=[],context=vm.createContext({game,testSession:null,getGunneryView,fieldWorkUI:{openObject(entity){opened.push(entity);}},openSiteEntity(){throw new Error('Field controls must not fall into ordinary cache/record actions.');}});
 vm.runInContext(['handleEntity','contextLabel'].map(declaration).join('\n'),context);
 const entity=game._expeditionSurface().entities.find(value=>value.data?.fieldObjectId==='workshop-cutter');
 assert.equal(context.contextLabel(entity),'Use · Field cutter rack');await context.handleEntity(entity);assert.equal(opened[0],entity);
});

test('the app routes solo and shared field commands with their actual arguments',async()=>{
 const game=fieldGame(),cutter=game._expeditionSurface().entities.find(value=>value.data?.fieldObjectId==='workshop-cutter');Object.assign(game.state.person,{x:cutter.x,y:cutter.y});
 const context=vm.createContext({game,testSession:null,network:null});vm.runInContext(declaration('performInvoke'),context);
 ok(await context.performInvoke('fieldWorkAction',{action:'claim',objectId:'workshop-cutter'}));assert.equal(game.state.fieldWork.tools.cutter,true);
 const requests=[];context.network={async command(name,args){requests.push({name,args});return{ok:true,result:{ok:true,text:'Authority accepted'}};}};
 const args={action:'inspect',objectId:'service-panel'};ok(await context.performInvoke('fieldWorkAction',args));assert.equal(requests[0].name,'fieldWorkAction');assert.equal(requests[0].args,args);
});

test('field navigation follows each verified task and keeps explicit tool destinations before an assignment',()=>{
 const game=fieldGame(),target={systemId:'brindle',bodyId:'orchard',siteId:'floodworks-6',entityId:'orchard:site:floodworks-6:field:workshop-bridge',fieldObjectId:'workshop-bridge',label:'Portable power bridge'},context=vm.createContext({game,trackedThreadId:'@field-work',fieldWorkTarget:target});
 vm.runInContext(declaration('narrativeNavigation'),context);assert.equal(context.narrativeNavigation().target,target);
 const cutter=game._expeditionSurface().entities.find(value=>value.data?.fieldObjectId==='workshop-cutter');Object.assign(game.state.person,{x:cutter.x,y:cutter.y});
 ok(game.fieldWorkAction({action:'begin',assignmentId:'engineering-safe-access'}));
 const view=context.narrativeNavigation();assert.equal(view.stageId,'inspect-panel');assert.equal(view.target.entityId,'orchard:site:floodworks-6:field:service-panel');
});
