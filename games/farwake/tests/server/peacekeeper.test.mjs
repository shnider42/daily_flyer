import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { isPeacekeeper, PEACEKEEPER_ID } from '../../dist/peacekeeper.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const pose=ship=>Object.fromEntries(['id','x','y','vx','vy','angle','angularVelocity'].map(key=>[key,ship[key]]));
async function fixture(count=1){
  const realm=new Realm({id:'WATCH001',seed:'shared-watch',persistence:storage()}),captains=[];
  for(let index=0;index<count;index++){
    const {captain}=await realm.createCaptain(`Watch visitor ${index+1}`);ok(realm.attach(captain,{close(){}}));captains.push(captain);
  }
  const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];
  return{realm,captains,room};
}
function approach(realm,captain){
  const keeper=realm._room('hearth').runtime.traffic.find(isPeacekeeper),vessel=realm.vessels.get(captain.aboard||captain.ownedVesselId),range=keeper.renderLength/2+vessel.ship.radius+120;
  Object.assign(vessel.ship,{x:keeper.x+Math.cos(keeper.angle)*range,y:keeper.y+Math.sin(keeper.angle)*range,vx:0,vy:0});
  return{keeper,vessel};
}

test('one shared world advances one watch identically with one or four captains, including restart',async t=>{
  let time=1_800_000_000_000;t.mock.method(Date,'now',()=>time);
  const single=await fixture(1),party=await fixture(4);
  for(let tick=0;tick<80;tick++){
    time+=1000/30;
    single.realm.step(1/30,tick+1,time);party.realm.step(1/30,tick+1,time);
  }
  const expected=pose(single.room.runtime.traffic.find(isPeacekeeper));
  assert.deepEqual(pose(party.room.runtime.traffic.find(isPeacekeeper)),expected);
  for(const captain of party.captains){
    const snapshot=party.realm.snapshotFor(captain),keepers=snapshot.world.traffic.filter(isPeacekeeper);
    assert.equal(keepers.length,1);assert.deepEqual(pose(keepers[0]),expected);
    assert.equal(JSON.stringify(keepers[0]).includes('_peacekeeperPatrol'),false);
    assert.equal(snapshot.fleet.some(ship=>ship.id===PEACEKEEPER_ID),false,'naval traffic is not a player-owned or boardable hull');
  }
  const restored=new Realm({id:party.realm.id,snapshot:party.realm.document(),persistence:storage()});
  const resumed=restored._room('hearth').runtime.traffic.filter(isPeacekeeper);
  assert.equal(resumed.length,1);assert.deepEqual(pose(resumed[0]),expected);
  assert.equal(restored._room('nacre').runtime.traffic.filter(isPeacekeeper).length,0);
});

test('radio authority rejects forged clearance, remote requests and generic-encounter bypass',async()=>{
  const {realm,captains:[captain]}=await fixture(),{keeper,vessel}=approach(realm,captain);
  const before={credits:captain.game.state.credits,owned:[...captain.game.state.fleet.owned],vessels:realm.vessels.size};
  const reply=ok(await realm.command(captain,'hailTraffic',{id:keeper.id,factionId:'freewake',enlisted:true,clearance:true},'forged-radio-clearance'));
  assert.equal(reply.clearance,false);assert.match(reply.message,/Alter course/);
  const bad=await realm.command(captain,'triggerEncounter',{sourceType:'traffic',sourceId:keeper.id,id:'patrol'},'fake-watch-news');
  assert.equal(bad.code,'restricted-channel');assert.equal(captain.game.state.pendingEncounter,null);
  const board=await realm.command(captain,'boardShip',{vesselId:keeper.id},'fake-watch-boarding');assert.equal(board.ok,false);
  vessel.ship.x=2600;vessel.ship.y=-2600;
  assert.equal((await realm.command(captain,'hailTraffic',{id:keeper.id,x:keeper.x,y:keeper.y},'forged-radio-position')).code,'distance');
  assert.deepEqual({credits:captain.game.state.credits,owned:[...captain.game.state.fleet.owned],vessels:realm.vessels.size},before);
});

test('a scanner operator uses the occupied hull range but their own faction identity, not the owner’s',async()=>{
  const {realm,captains:[owner,guest]}=await fixture(2),{keeper,vessel}=approach(realm,owner);
  owner.game._activateClass('puffin',true);vessel.actor=null;
  Object.assign(owner.game.state.professions.careers.military,{enlisted:true,factionId:'freewake'});
  const guestShip=realm.vessels.get(guest.ownedVesselId);
  Object.assign(guestShip.ship,{x:vessel.ship.x+80,y:vessel.ship.y,vx:0,vy:0});
  ok(await realm.command(owner,'setCrewAccess',{captainId:guest.id,allowed:true,roles:['scanner','navigation']},'scanner-grant'));
  ok(await realm.command(guest,'boardShip',{vesselId:vessel.id},'board-scan-deck'));
  const station=realm._surface(guest).entities.find(entity=>entity.data?.stationRole==='navigation');assert.ok(station);
  Object.assign(guest.game.state.person,{x:station.x,y:station.y});
  ok(await realm.command(guest,'takeStation',{role:'scanner',entityId:station.id},'take-scan-station'));
  Object.assign(guestShip.ship,{x:2500,y:-2500});
  const refused=ok(await realm.command(guest,'hailTraffic',{id:keeper.id,clearanceCaptainId:owner.id},'guest-clearance'));
  assert.equal(refused.clearance,false,'the serving owner cannot lend a civilian their radio identity');
  Object.assign(guest.game.state.professions.careers.military,{enlisted:true,factionId:'freewake'});
  assert.equal(ok(await realm.command(guest,'hailTraffic',{id:keeper.id},'operator-clearance')).clearance,true);
  guest.game.state.person.x+=500;guest.game.state.person.y+=500;
  assert.equal((await realm.command(guest,'hailTraffic',{id:keeper.id},'left-scanner')).ok,false,'the role alone is not remote console access');
});
