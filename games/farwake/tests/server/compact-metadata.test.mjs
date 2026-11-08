import test from 'node:test';
import assert from 'node:assert/strict';
import { compactSnapshot } from '../../server/index.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

test('serialized compact snapshots preserve boarding deck identity and revoke departed-deck controls immediately',()=>{
  const previous={protocol:1,tick:1,room:{id:'system:hearth'},state:{mode:'ship',ship:{id:'home',classId:'sparrow'},journal:['kept'],interior:null,multiplayer:{aboardVesselId:'home',ownedVesselId:'home',canTakeHelm:true}},world:{asteroids:[],bodies:[]},players:[],remoteShips:[]};
  const source={...previous,tick:2,state:{...previous.state,ship:{id:'target',classId:'sparrow',hull:37},interior:{kind:'enemy',vesselId:'target',location:{vesselId:'target',name:'Copper Finch',shipClass:'sparrow'}},multiplayer:{aboardVesselId:'target',ownedVesselId:'home',returnVesselId:'home',hostileBoarding:true,canReturn:true,canTakeHelm:false}}};
  const wire=JSON.parse(JSON.stringify(compactSnapshot(source))),merged=mergeSnapshot(previous,wire);
  assert.equal(wire.state.journal,undefined,'motion packets still omit story history');
  assert.deepEqual(wire.state.interior,source.state.interior);assert.deepEqual(wire.state.multiplayer,source.state.multiplayer);
  assert.equal(merged.state.ship.id,'target');assert.equal(merged.state.interior.location.name,'Copper Finch');assert.equal(merged.state.multiplayer.canTakeHelm,false);assert.deepEqual(merged.state.journal,['kept']);
  const departed={...source,tick:3,state:{...source.state,interior:null,boarding:null,multiplayer:{aboardVesselId:null,returnVesselId:null,hostileBoarding:false,canReturn:false,canTakeHelm:false}}};
  const left=mergeSnapshot(merged,JSON.parse(JSON.stringify(compactSnapshot(departed))));
  assert.equal(left.state.interior,null);assert.equal(left.state.boarding,null);assert.equal(left.state.multiplayer.returnVesselId,null);assert.equal(left.state.multiplayer.canReturn,false);
});
