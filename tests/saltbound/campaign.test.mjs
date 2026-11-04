import test from 'node:test';
import assert from 'node:assert/strict';
import {Voyage,PROTOCOL,SHIPS,freshProfile,EXITS} from '../../daily_flyer/themes/saltbound_assets/core.mjs';
import {CampaignLog,crewLoadout,newId} from '../../daily_flyer/themes/saltbound_assets/campaign.mjs';
import {CHAPTERS,DIFFICULTIES} from '../../daily_flyer/themes/saltbound_assets/catalog.mjs';
import {bucketFill} from '../../daily_flyer/themes/saltbound_assets/deck.mjs';
import {SeaRooms} from '../../server/saltbound/rooms.mjs';

function storage() {
  const values=new Map();
  return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
}
const charter=(chapter=0)=>({id:newId(),name:'The Copper Kites',chapter,difficulty:'normal'});
const peer=()=>({send(){},close(){}});
function crew(type='sloop',chapter=0) {
  const profile=freshProfile();profile.ships.push(type);profile.ship=type;
  const game=new Voyage({seed:31,profile,campaign:charter(chapter)});
  for(const id of ['a','b','c','d'])game.addPlayer(id,id);
  game.waiting=false;
  return game;
}
function act(game,id,command){game.player(id).actionCd=0;return game.action(id,command);}

test('legacy solo, separate campaigns and separate pirates have independent wallets across reloads',()=>{
  const first=storage(),second=storage();
  first.setItem('saltbound.profile',JSON.stringify({...freshProfile(),gold:9999,ships:['sloop','galleon'],ship:'galleon'}));
  const a=new CampaignLog(first),b=new CampaignLog(second);
  const blue=a.create('Blue','hard').charter,red=a.create('Red','gale').charter;
  b.remember(blue);
  assert.equal(a.get(blue.id).profile.gold,0);assert.equal(a.get(blue.id).profile.ship,'sloop');
  const receipt={id:'haul-1',campaignId:blue.id,gold:600,items:['carbine'],success:true};
  assert(a.settle({...blue,chapter:1},receipt,{signals:3}));assert(!a.settle(blue,receipt));
  assert(!a.settle(red,receipt));assert.equal(a.get(red.id).profile.gold,0);
  assert.equal(b.get(blue.id).profile.gold,0);
  const reloaded=new CampaignLog(first);
  assert.equal(reloaded.pirateId,a.pirateId);assert.equal(reloaded.get(blue.id).profile.gold,600);
  assert(reloaded.get(blue.id).profile.weapons.includes('carbine'));
  assert.equal(reloaded.get(blue.id).charter.chapter,1);assert.equal(reloaded.get(blue.id).watch.signals,3);
  assert.equal(JSON.parse(first.getItem('saltbound.profile')).gold,9999);
  assert.equal(crewLoadout(a.envelope(blue.id),red,a.pirateId).gold,0);
  assert.equal(crewLoadout(a.envelope(blue.id),blue,b.pirateId).gold,0);
});

test('room ignores legacy loadouts, requires two distinct pirates, and freezes again when a pirate leaves',()=>{
  const rooms=new SeaRooms(),captain=peer(),mate=peer(),manifest=charter();
  const pirate=newId(),rich={...freshProfile(),ship:'galleon',ships:['sloop','galleon']};
  const welcome=rooms.hello(captain,{protocol:PROTOCOL,create:true,pirateId:pirate,campaign:manifest,profile:rich});
  const g=captain.room.game;
  assert.equal(g.ship.type,'sloop');assert(g.waiting);rooms.step();assert.equal(g.time,0);
  assert(!g.action(welcome.id,'right'));
  assert.throws(()=>rooms.hello(peer(),{protocol:PROTOCOL,code:welcome.code,pirateId:pirate}),/already has a place/);
  rooms.hello(mate,{protocol:PROTOCOL,code:welcome.code,pirateId:newId(),
    loadout:{campaignId:newId(),pirateId:pirate,profile:rich}});
  assert(!g.waiting);rooms.step();const elapsed=g.time;assert(elapsed>0);
  rooms.disconnect(mate);rooms.step();assert(g.waiting);assert.equal(g.time,elapsed);
});

test('joining with a newer local log restores the next contract before casting off',()=>{
  const rooms=new SeaRooms(),a=peer(),b=peer(),manifest=charter();
  const w=rooms.hello(a,{protocol:PROTOCOL,create:true,campaign:manifest});
  rooms.hello(b,{protocol:PROTOCOL,code:w.code,campaign:{...manifest,chapter:3}});
  assert.equal(a.room.game.campaign.chapter,3);
  assert(a.room.game.loot.some(l=>l.island==='sable'&&l.contract==='Observatory lens'));
  assert.throws(()=>rooms.hello(peer(),{protocol:PROTOCOL,create:true,campaign:manifest}),/already at sea/);
});

test('assigned stations, exclusive claims and Holding work entirely aboard',()=>{
  const g=crew();
  assert.deepEqual(g.players.map(p=>p.station),['helm','guns','medic','mast']);
  assert(!act(g,'b','station:helm'));assert(act(g,'a','station:holding'));assert.equal(g.ship.helm,null);
  assert(act(g,'b','station:helm'));assert.equal(g.ship.helm,'b');assert(act(g,'a','station:guns'));
  assert(g.players.every(p=>p.aboard));
  assert(act(g,'b','station:holding'));assert(!act(g,'b','left'));assert(!act(g,'b','repair'));assert(!act(g,'b','scan'));
  assert(act(g,'a','station:holding'));assert.equal(g.players.filter(p=>p.station==='holding').length,2);
});

test('compact helm covers vacant guns, heavy ships require the gun station, hull handling and reload differ',()=>{
  const small=crew('yawl'),heavy=crew('galleon');
  assert(!act(small,'a','right'));act(small,'b','station:holding');
  assert(act(small,'a','right'));assert.equal(small.bullets.length,1);
  act(heavy,'b','station:holding');assert(!act(heavy,'a','right'));
  act(heavy,'b','station:guns');assert(act(heavy,'b','right'));assert.equal(heavy.bullets.length,5);
  assert(heavy.ship.right>small.ship.right);assert(SHIPS.yawl.draft<SHIPS.galleon.draft);
  assert(SHIPS.yawl.speed>SHIPS.galleon.speed);
});

test('hull strikes wound crew and leak; the medic times a bucket, patches holes and revives an injured sailor',()=>{
  const g=crew();g.damageShip(24);assert(g.ship.leaks>0 && g.ship.water>0);
  assert(g.players.some(p=>p.hp<p.maxHp));
  g.ship.water=65;assert(!act(g,'b','bucket'));assert(act(g,'c','bucket'));
  g.time+=.8;assert(bucketFill(g)>.64);assert(act(g,'c','bucket'));assert.equal(g.ship.water,65-SHIPS.sloop.pump);
  assert(!g.ship.bucket);assert.equal(g.ship.leaks,1);
  assert(!act(g,'b','repair'));assert(act(g,'c','repair'));assert.equal(g.ship.leaks,0);
  g.damagePlayer(g.player('a'),999);assert(g.player('a').down&&g.player('a').aboard);
  assert(act(g,'c','treat'));assert(!g.player('a').down&&g.player('a').hp>0);
  assert(act(g,'a','station:helm'));
});

test('only the lookout can signal a distant contact, and a mark expires or disappears when sunk',()=>{
  const g=crew('frigate');
  g.hostiles=[{...g.hostiles[0],x:g.ship.x+2800,y:g.ship.y}];
  assert(!act(g,'b','scan'));assert(act(g,'d','scan'));
  assert.equal(g.ship.mark.id,g.hostiles[0].id);assert.equal(g.score.spotted,1);
  assert(!act(g,'d','scan'));g.time+=23;g.step(.03);assert.equal(g.ship.mark,null);
  assert(act(g,'d','scan'));g.hostiles[0].hp=0;g.step(.03);assert.equal(g.ship.mark,null);
});

test('six charter orders only advance on a successful extraction with the right cargo and feats',()=>{
  for(let i=0;i<CHAPTERS.length;i++){
    const failed=crew('sloop',i);failed.cargo=[{value:100}];failed.finish(true,'Home');
    assert.equal(failed.campaign.chapter,i);assert.equal(failed.receipt.gold,100);
    const g=crew('sloop',i),order=CHAPTERS[i];
    g.cargo=[{island:'palm',value:100,salvage:true,contract:order.prize}];
    g.score.ships=2;g.score.spotted=1;g.score.captains=['fort'];
    Object.assign(g.ship,{x:EXITS[0].x,y:EXITS[0].y});assert(act(g,'a','extract'));
    g.exitProgress=9.99;g.step(.03);
    assert.equal(g.status,'extracted');assert.equal(g.campaign.chapter,i+1);
    assert.equal(g.receipt.gold,100+order.bonus);assert.equal(g.receipt.campaignId,g.campaign.id);
    g.finish(true,'Again');assert.equal(g.campaign.chapter,i+1);
  }
});

test('sea conditions change raid time, incoming damage, and the extracted reward',()=>{
  for(const [name,rules] of Object.entries(DIFFICULTIES)){
    const g=new Voyage({difficulty:name});g.addPlayer('p');assert.equal(g.limit,60*rules.minutes);
    g.damageShip(10);assert.equal(g.ship.hp,g.ship.maxHp-10*rules.damage);
    g.cargo.push({value:100});g.finish(true,'Home');assert.equal(g.receipt.gold,Math.round(100*rules.payout));
  }
});
