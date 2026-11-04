import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceStore,cleanSchedule,cleanNews,safeLink,TTL} from '../lib/providers.mjs';
import {filterNews,inferSettings,statusChanges,byeTeams,defaults,playerLens} from '../public/logic.js';
test('failed source check preserves the last successful data and timestamp',async()=>{
 const store=new SourceStore({fetcher:async()=>{throw Error('offline');},clock:()=>Date.parse('2026-11-04T12:00:00Z')});
 store.sources.news={data:[{id:'old'}],checkedAt:'2026-11-03T12:00:00Z'};
 await store.update('news','https://example.com',x=>x);
 assert.deepEqual(store.sources.news.data,[{id:'old'}]);assert.equal(store.sources.news.checkedAt,'2026-11-03T12:00:00Z');assert.equal(store.publicData().sources.news.stale,true);assert.equal(store.sources.news.error,'offline');
});
test('a failed request backs off and a fresh source is not fetched again',async()=>{
 let count=0;const store=new SourceStore({fetcher:async()=>{count++;throw Error('offline');}});
 await store.update('news','url',x=>x);await store.update('news','url',x=>x);assert.equal(count,1);
 store.sources.news={checkedAt:new Date().toISOString(),data:[]};assert.equal(store.due('news'),false);
});
test('fresh snapshots do not appear to be continually refreshing',async()=>{
 const store=new SourceStore({fetcher:async()=>{throw Error('Must not fetch');}});
 store.sources=Object.fromEntries(Object.keys(TTL).map(k=>[k,{data:[],checkedAt:new Date().toISOString()}]));
 await store.refresh();assert.equal(store.publicData().refreshing,false);
});
test('overlapping source refreshes share one run',async()=>{
 let calls=0;const store=new SourceStore({fetcher:async()=>{calls++;throw Error('offline');},path:'/tmp/rr-test-cache.json'});
 await Promise.all([store.refresh(),store.refresh()]);assert.equal(calls,4);
});
test('schedule accepts a partly completed week and rejects a wrong season',()=>{
 const state={season:'2026',week:9,season_type:'regular'};
 const make=(id,completed,a,b)=>({id,date:'2026-11-08',competitions:[{competitors:[{homeAway:'home',team:{abbreviation:a},score:'10'},{homeAway:'away',team:{abbreviation:b},score:'7'}]}],status:{type:{completed}}});
 const raw={season:{year:2026},week:{number:9},events:[make('1',true,'NE','BUF'),make('2',false,'DET','MIN')]};
 assert.equal(cleanSchedule(raw,state).games.length,2);assert.throws(()=>cleanSchedule(raw,{...state,season:'2025'}));
});
test('news strips unsafe links and associates exact players',()=>{
 const raw={articles:[{id:1,type:'Story',headline:'Josh Allen at practice',published:'2026-11-04T00:00:00Z',links:{web:{href:'https://www.espn.com/nfl/story/1'}}},{id:2,headline:'Unsafe',published:'2026-11-04',links:{web:{href:'javascript:alert(1)'}}}]};
 const result=cleanNews(raw,[{id:'a',name:'Josh Allen',espnId:'123'}]);assert.equal(result.length,1);assert.deepEqual(result[0].players,['a']);assert.equal(result[0].kind,'Availability');assert.equal(safeLink('https://espn.com.evil.test','espn.com'),null);
});
test('catch-up cutoff and player filters are independent of guidance',()=>{
 const news=[{id:'a',updated:'2026-11-04T10:00:00Z',players:['1']},{id:'b',updated:'2026-11-03T10:00:00Z',players:['2']}];
 const s={...defaults,window:'since',scope:'mine'};
 assert.deepEqual(filterNews(news,s,new Set(['1']),new Set(),'2026-11-04T00:00:00Z').map(n=>n.id),['a']);
 assert.deepEqual(filterNews(news,{...s,guidance:'expert'},new Set(['1']),new Set(),'2026-11-04T00:00:00Z').map(n=>n.id),['a']);
});
test('combined dynasty, superflex and PPR settings are retained',()=>{
 const s=inferSettings({settings:{type:2,waiver_type:2},scoring:{rec:1},positions:['QB','SUPER_FLEX'],rosters:Array(12).fill({})});
 assert.equal(s.format,'dynasty');assert.equal(s.qb,'super');assert.equal(s.scoring,'ppr');assert.equal(s.size,'12');
 assert.match(playerLens({position:'QB'},{...defaults,...s}),/future role/);
});
test('no baseline produces no invented status changes; incomplete schedules do not invent byes',()=>{
 const p=[{id:'1',team:'NE',status:'Out'}];assert.equal(statusChanges(p,{}).length,0);assert.equal(statusChanges(p,{'1':{team:'NE',status:null}}).length,1);
 assert.equal(byeTeams({seasonType:'regular',games:[]},p).size,0);
});
