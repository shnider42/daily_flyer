import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioBus} from '../public/audio.mjs';

test('shared gunfire is heard once, attenuates with distance, and stays in its own interior',()=>{
 const audio=new AudioBus(),heard=[];audio.noise=(...args)=>heard.push(args);
 const g={coop:{playerId:'me'},player:{x:200,y:200,interior:'cafe'},effects:[
  {id:'own',type:'muzzle',sourceId:'me',x:200,y:200,interior:'cafe'},
  {id:'near',type:'muzzle',sourceId:'friend',x:250,y:200,interior:'cafe'},
  {id:'far',type:'muzzle',sourceId:'friend',x:600,y:200,interior:'cafe'},
  {id:'other-room',type:'muzzle',sourceId:'friend',x:210,y:200,interior:'garage'}
 ]};
 audio.sharedEffects(g,true);audio.sharedEffects(g,true);
 assert.equal(heard.length,2);assert.ok(heard[0][1]>heard[1][1]);assert.ok(heard[0][2]>0);
 g.effects=[{id:'paused',type:'explosion',x:220,y:200,interior:'cafe'}];
 audio.sharedEffects(g,false);audio.sharedEffects(g,true);assert.equal(heard.length,2,'returning from a menu cannot replay old explosions');
});
