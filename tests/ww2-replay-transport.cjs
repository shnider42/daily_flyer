/* Exercise the real game.js request adapter without DOM/browser dependencies. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../ww2_tactics/static/game.js'),'utf8');
const start=code.indexOf('function replayIdentity('),end=code.indexOf('function persistSessions(',start);
assert.ok(start>=0&&end>start);
const movie={id:7,frames:[{action:{kind:'contact'},before:{units:[]},after:{units:[]}}]};
const base=()=>({code:'BATTLE',side:'us',battle_number:1,revision:3,computer_playback:structuredClone(movie)});
function client(reply){
 const calls=[],context=vm.createContext({state:base(),session:{code:'BATTLE',token:'original'},fetch:async(url,options={})=>{calls.push({url,options});return reply(calls.length,url,options,context);}});
 vm.runInContext(code.slice(start,end),context);
 return {context,calls,api:(url,body)=>context.api(url,body)};
}
const response=(value,ok=true)=>({ok,json:async()=>structuredClone(value)});
(async()=>{
 let c=client(()=>response({...base(),revision:4,computer_playback:{id:7,unchanged:true}}));
 let result=await c.api('/api/match/BATTLE',{kind:'move',revision:3});
 assert.equal(c.calls.length,1);assert.equal(c.calls[0].options.headers['X-WW2-Replay'],'BATTLE:us:1:7');
 assert.equal(result.computer_playback,c.context.state.computer_playback);assert.equal(result.revision,4);
 c=client((n,url,options,ctx)=>{const answer={...base(),revision:4,computer_playback:{id:7,unchanged:true}};ctx.state={...base(),side:'de',computer_playback:{id:8,frames:[]}};ctx.session={code:'OTHER',token:'later'};return response(answer);});
 const captured=c.context.state.computer_playback;
 result=await c.api('/api/match/BATTLE');assert.equal(result.computer_playback,captured,'Use the request snapshot, not a later battle/movie');
 c=client(n=>response({...base(),computer_playback:n===1?{id:99,unchanged:true}:{id:99,frames:[]}}));
 result=await c.api('/api/match/BATTLE',{kind:'end',revision:3});
 assert.equal(c.calls.length,2);assert.equal(c.calls[0].options.method,'POST');
 assert.equal(c.calls[1].options.method,undefined);assert.equal(c.calls[1].options.body,undefined);assert.equal(c.calls[1].options.headers['X-WW2-Replay'],undefined);
 assert.equal(c.calls[1].options.headers.Authorization,'Bearer original');assert.equal(result.computer_playback.id,99);
 c=client(()=>response({error:'Conflict'},false));
 await assert.rejects(c.api('/api/match/BATTLE',{kind:'move'}),/Conflict/);assert.equal(c.calls.length,1,'Never automatically repeat a failed POST');
 c=client(()=>{throw new Error('Lost reply');});
 await assert.rejects(c.api('/api/match/BATTLE',{kind:'end'}),/Lost reply/);assert.equal(c.calls.length,1);
 c=client(()=>response({...base(),computer_playback:{id:99,frames:[]}}));
 result=await c.api('/api/match/BATTLE',{kind:'end'});assert.equal(result.computer_playback.id,99);assert.equal(c.calls.length,1,'New movie/older-server full response remains intact');
 c=client(()=>response({code:'BATTLE',unchanged:true}));result=await c.api('/api/match/BATTLE?since=3');assert.equal(result.unchanged,true);assert.equal(c.calls.length,1);
 c=client(()=>response(base()));c.context.state=null;await c.api('/api/match/BATTLE');assert.equal(c.calls[0].options.headers['X-WW2-Replay'],undefined);
 c=client(()=>response(base()));await c.api('/api/match/OTHER');assert.equal(c.calls[0].options.headers['X-WW2-Replay'],undefined);
 c=client(()=>response(base()));await c.api('/api/match/BATTLE/save',{revision:3});assert.equal(c.calls[0].options.headers['X-WW2-Replay'],undefined);
 c=client(()=>response({...base(),computer_playback:{id:99,unchanged:true}}));
 await assert.rejects(c.api('/api/match/BATTLE',{kind:'end'}),/Could not refresh the replay/);assert.equal(c.calls.length,2);
 console.log('Replay adapter: acknowledged/full/next movie, captured-request isolation, reconnect, GET-only recovery and no POST retries passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
