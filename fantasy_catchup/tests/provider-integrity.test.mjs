import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, cleanNews, cleanSchedule, mergeNews, TTL } from '../lib/providers.mjs';

const now=Date.parse('2026-11-09T22:00:00Z');
const report=(id,published,extra={})=>({id,title:`Report ${id}`,url:`https://www.espn.com/nfl/story/_/id/${id}`,published,updated:published,players:[],...extra});
const rawReport=(id,headline,published,extra={})=>({id,headline,published,links:{web:{href:`https://www.espn.com/nfl/story/_/id/${id}`}},...extra});

test('rolling news retains observed reports, replaces revisions, and expires old content',()=>{
  const old=report('1','2026-11-05T12:00:00Z');
  const revised={...old,title:'Revised report',updated:'2026-11-09T15:00:00Z'};
  const result=mergeNews([old,report('2','2026-10-30T12:00:00Z'),report('3','2026-11-06T12:00:00Z')],[revised,report('4','2026-11-09T19:00:00Z')],now);
  assert.deepEqual(result.map(n=>n.id),['4','1','3']);
  assert.equal(result[1].title,'Revised report');
  assert.equal(result[1].published,old.published);
});

test('invalid and future source timestamps cannot make a report permanently new',()=>{
  const result=cleanNews({articles:[
    rawReport('1','Josh Allen at practice','2026-11-09T12:00:00Z',{lastModified:'invalid'}),
    rawReport('2','Josh Allen update','2026-11-09T13:00:00Z',{lastModified:'2030-01-01T00:00:00Z'}),
    rawReport('3','Future report','2030-01-01T00:00:00Z'),
    rawReport('4','Invalid date','not a date'),
  ]},[],now);
  assert.deepEqual(result.map(n=>n.id),['2','1']);
  assert.ok(result.every(n=>n.updated===n.published));
});

test('player matching honors name boundaries, punctuation, and explicit athlete IDs',()=>{
  const players=[{id:'a',name:'Will Levis',espnId:'11'},{id:'b',name:'A.J. Brown',espnId:'22'},{id:'c',name:'Other Player',espnId:'33'}];
  const result=cleanNews({articles:[
    rawReport('1','Will Levison joins staff','2026-11-09T12:00:00Z'),
    rawReport('2','AJ Brown returns to practice','2026-11-09T13:00:00Z'),
    rawReport('3','A roster update','2026-11-09T14:00:00Z',{categories:[{type:'athlete',athleteId:33}]}),
  ]},players,now);
  const byId=new Map(result.map(n=>[n.id,n]));
  assert.deepEqual(byId.get('1').players,[]);
  assert.deepEqual(byId.get('2').players,['b']);
  assert.deepEqual(byId.get('3').players,['c']);
});

test('news categories follow the headline development before background description',()=>{
  const result=cleanNews({articles:[
    rawReport('1','Giants trade for injury-plagued receiver','2026-11-09T12:00:00Z'),
    rawReport('2','Receiver will miss rest of season with neck issue','2026-11-09T13:00:00Z',{description:'The team acquired him in a trade.'}),
    rawReport('3','Team signs new quarterback','2026-11-09T14:00:00Z',{description:'He replaces an injured starter.'}),
  ]},[],now);
  const byId=new Map(result.map(n=>[n.id,n.kind]));
  assert.equal(byId.get('1'),'Roster moves');
  assert.equal(byId.get('2'),'Availability');
  assert.equal(byId.get('3'),'Roster moves');
});

const nflTeams='ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WSH'.split(' ');
const matchup=(home,away,id)=>({id,date:'2026-11-08T18:00:00Z',competitions:[{competitors:[{homeAway:'home',team:{abbreviation:home}},{homeAway:'away',team:{abbreviation:away}}]}],status:{type:{completed:false}}});
const current={season:'2026',week:9,season_type:'regular'};
const fullSchedule={season:{year:2026,type:2},week:{number:9,teamsOnBye:nflTeams.slice(30).map(abbreviation=>({abbreviation}))},events:Array.from({length:15},(_,i)=>matchup(nflTeams[i*2],nflTeams[i*2+1],String(i)))};

test('a complete schedule carries explicit byes and rejects contradictory bye data',()=>{
  const result=cleanSchedule(fullSchedule,current);
  assert.equal(result.complete,true);
  assert.deepEqual(result.byeTeams,nflTeams.slice(30));
  assert.equal(cleanSchedule({...fullSchedule,events:fullSchedule.events.slice(0,12)},current).complete,false);
  assert.equal(cleanSchedule({...fullSchedule,week:{number:9}},current).byeTeams,null);
  assert.throws(()=>cleanSchedule({...fullSchedule,week:{number:9,teamsOnBye:[{abbreviation:'ARI'}]}},current));
  assert.throws(()=>cleanSchedule({...fullSchedule,season:{year:2026,type:3}},current));
});

test('a new NFL week refreshes its schedule without waiting for the old schedule TTL',async()=>{
  const calls=[];
  const store=new SourceStore({clock:()=>now,fetcher:async url=>{calls.push(url);if(url.includes('/state/'))return {...current,week:10};if(url.includes('/scoreboard'))return {...fullSchedule,week:{...fullSchedule.week,number:10}};throw Error('Unexpected source');},path:'/tmp/rr-provider-week-test.json'});
  store.sources=Object.fromEntries(Object.keys(TTL).map(k=>[k,{data:[],checkedAt:new Date(now-120000).toISOString(),lastAttempt:new Date(now-120000).toISOString()}]));
  store.sources.state={data:current,checkedAt:new Date(now-7200000).toISOString()};
  store.sources.schedule.data=cleanSchedule(fullSchedule,current);
  await store.refresh();
  assert.equal(calls.length,2);
  assert.ok(calls.some(url=>url.includes('week=10')));
  assert.equal(store.publicData().schedule.week,10);
});

test('a mismatched schedule is withheld and missing sources cannot look fresh',()=>{
  const store=new SourceStore({clock:()=>now});
  store.sources.state={data:{...current,week:10},checkedAt:new Date(now).toISOString()};
  store.sources.schedule={data:cleanSchedule(fullSchedule,current),checkedAt:new Date(now).toISOString()};
  const data=store.publicData();
  assert.equal(data.schedule,null);
  assert.equal(data.sources.schedule.stale,true);
  assert.equal(data.sources.news.stale,true);
  assert.equal(data.sources.players.checkedAt,null);
});

test('damaged or future cache timestamps do not prevent refresh indefinitely',()=>{
  const store=new SourceStore({clock:()=>now});
  store.sources.news={checkedAt:'invalid'};
  assert.equal(store.due('news'),true);
  store.sources.news={checkedAt:'2030-01-01T00:00:00Z',lastAttempt:'2030-01-01T00:00:00Z'};
  assert.equal(store.due('news'),true);
});
