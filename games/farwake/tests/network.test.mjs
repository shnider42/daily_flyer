import test from 'node:test';
import assert from 'node:assert/strict';
import { FarwakeNetwork, RemoteInterpolator, mergeSnapshot, readPassport, savePassport } from '../dist/network.mjs';
import { Game } from '../dist/engine.mjs';
import { advanceShip, getShipClass } from '../dist/fleet.mjs';

test('compact snapshot reconstruction keeps static metadata while applying canonical motion and mining state', () => {
  const previous = { tick: 1, room: { id: 'room-a' }, state: { journal: [{ title: 'Kept story' }], credits: 90, ship: { x: 0 } }, world: { bodies: [{ id: 'port' }], asteroids: [{ id: 'rock', x: 20, seed: 10, angle: 0, hp: 20, ore: 3, crystal: 1 }], enemies: [] }, fleet: [{ id: 'ship-a' }], events: [{ type: 'old' }] };
  const merged = mergeSnapshot(previous, { partial: true, tick: 2, room: { id: 'room-a' }, state: { credits: 102, ship: { x: 4 } }, world: { asteroidStates: [['rock', .5, 7, 2, 1]], enemies: [{ id: 'pirate' }] }, events: [] });
  assert.equal(merged.state.ship.x, 4); assert.equal(merged.state.credits, 102); assert.equal(merged.state.journal[0].title, 'Kept story');
  assert.equal(merged.world.asteroids[0].x, 20); assert.equal(merged.world.asteroids[0].hp, 7); assert.equal(merged.world.asteroids[0].angle, .5); assert.equal(merged.world.asteroids[0].seed, 10);
  assert.equal(merged.world.asteroidStates, undefined); assert.equal(merged.world.bodies[0].id, 'port'); assert.equal(merged.fleet[0].id, 'ship-a'); assert.deepEqual(merged.events, []);
});

test('client prediction handles a 100ms frame and discards acknowledged input on reconciliation', () => {
  let time = 0;
  const network = new FarwakeNetwork({ url: 'https://example.test', storage: null, autoReconnect: false, now: () => time, wallNow: () => 1000 + time }), game = new Game('prediction-regression');
  network._snapshot({ tick: 1, ack: 0, serverTime: 1000, room: { id: 'room-a', kind: 'system' }, state: game.save(), world: {}, remoteShips: [], players: [] }, true);
  const input = { thrust: 1, turn: .3, flightAssist: true }, expected = advanceShip(network.predictedShip, .1, input);
  time = 100;
  const predicted = network.predictShip(.1, input); assert.equal(predicted.x, expected.x); assert.equal(predicted.y, expected.y); assert.equal(predicted.angle, expected.angle);
  network.unacknowledged = [{ seq: 1, dt: .05, input }, { seq: 2, dt: .05, input }];
  network._snapshot({ tick: 2, ack: 1, serverTime: 1100, room: { id: 'room-a', kind: 'system' }, state: game.save(), world: {}, remoteShips: [], players: [] });
  assert.deepEqual(network.unacknowledged.map(frame => frame.seq), [2]);
  network._snapshot({ tick: 1, ack: 0, serverTime: 900, room: { id: 'room-a', kind: 'system' }, state: { ...game.save(), credits: 9999 }, world: {} }); assert.notEqual(network.state.credits, 9999);
});

test('remote interpolation is bounded and never blends movement between different interiors', () => {
  const interpolation = new RemoteInterpolator();
  interpolation.push({ serverTime: 1000, room: { id: 'one' }, remoteShips: [{ id: 'v', x: 0, y: 0, vx: 50 }], players: [] }, 1000);
  interpolation.push({ serverTime: 1100, room: { id: 'one' }, remoteShips: [{ id: 'v', x: 10, y: 0, vx: 50 }], players: [] }, 1100);
  assert.equal(interpolation.sample(1150).remoteShips[0].x, 5);
  interpolation.push({ serverTime: 1200, room: { id: 'two' }, remoteShips: [{ id: 'v', x: 800, y: 20, vx: 0 }], players: [] }, 1500);
  assert.equal(interpolation.sample(1250).remoteShips[0].x, 800); assert.ok(interpolation.delayMs >= 100 && interpolation.delayMs <= 220);
});

test('passport helpers keep per-realm identity separate and tolerate unavailable browser storage', () => {
  let value; const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  savePassport({ realmCode: 'AAAAAA11', captainId: 'one', token: 'secret-one' }, storage); savePassport({ realmCode: 'BBBBBB22', captainId: 'two', token: 'secret-two' }, storage);
  assert.equal(readPassport('AAAAAA11', storage).captainId, 'one'); assert.equal(readPassport(undefined, storage).captainId, 'two');
  assert.equal(readPassport('AAAAAA11', { getItem() { throw new Error('Storage blocked'); } }), null);
});

test('compact boarding metadata replaces the actual vessel, permissions and interior including explicit clearing', () => {
  const previous={tick:1,room:{id:'deck'},state:{ship:{id:'source',classId:'sparrow'},journal:['kept'],interior:{kind:'ship',location:{vesselId:'source',name:'Homeward'}},multiplayer:{aboardVesselId:'source',ownedVesselId:'source',canTakeHelm:true,stalePermission:true}},world:{bodies:[],parkedShips:[]}};
  const next={partial:true,tick:2,room:{id:'deck'},state:{ship:{id:'target',classId:'sparrow',hull:31},interior:{kind:'enemy',location:{vesselId:'target',name:'Copper Finch',shipClass:'sparrow'}},multiplayer:{aboardVesselId:'target',ownedVesselId:'source',returnVesselId:'source',hostileBoarding:true,canReturn:true,canTakeHelm:false}},world:{parkedShips:[{id:'source',name:'Homeward'}]}};
  const before=JSON.stringify({previous,next}),merged=mergeSnapshot(previous,next);
  assert.deepEqual(merged.state.multiplayer,next.state.multiplayer);
  assert.deepEqual(merged.state.interior,next.state.interior);
  assert.equal(merged.state.ship.id,'target');assert.equal(merged.state.ship.hull,31);
  assert.equal(merged.state.journal[0],'kept');assert.equal(merged.world.parkedShips[0].id,'source');
  const left=mergeSnapshot(merged,{partial:true,tick:3,room:{id:'deck'},state:{interior:null,boarding:null,multiplayer:{aboardVesselId:null,returnVesselId:null,hostileBoarding:false,canReturn:false,canTakeHelm:false}},world:{}});
  assert.equal(left.state.interior,null);assert.equal(left.state.boarding,null);
  assert.equal(left.state.multiplayer.returnVesselId,null);assert.equal(left.state.multiplayer.hostileBoarding,false);assert.equal(left.state.multiplayer.canReturn,false);
  assert.equal(JSON.stringify({previous,next}),before);
});

test('same-class vessel switches discard old controls and smoothing even when only aboard metadata changes', () => {
  for(const metadataOnly of[false,true]){
    let time=0;
    const network=new FarwakeNetwork({url:'https://example.test',storage:null,autoReconnect:false,now:()=>time,wallNow:()=>1000+time});
    const ship={...getShipClass('sparrow').stats,id:'source',classId:'sparrow',x:0,y:0,vx:0,vy:0,angle:0,energy:100};
    const initial={tick:1,serverTime:1000,ack:0,room:{id:'system:hearth',kind:'system'},state:{mode:'ship',systemId:'hearth',ship,multiplayer:{aboardVesselId:'source'}},world:{},remoteShips:[],players:[]};
    network._snapshot(initial,true);
    time=100;network.setInput({thrust:1,turn:.4,fire:true,aimX:1,aimY:0,aiming:true},.1);network.predictShip(.1);
    network.unacknowledged=[{seq:7,input:{thrust:1,fire:true},at:90}];
    const packet={partial:true,tick:2,serverTime:1060,simulatedAt:1060,ack:2,room:initial.room,state:{ship:{...ship,id:metadataOnly?'source':'target',x:70,y:30,angle:1},multiplayer:{aboardVesselId:'target',returnVesselId:'source',hostileBoarding:false,canTakeHelm:true}},world:{},remoteShips:[],players:[]},before=JSON.stringify(packet);
    network._snapshot(packet);
    assert.equal(network.predictionReset,'vessel');
    assert.deepEqual(network.input,{});assert.deepEqual(network.unacknowledged,[]);
    assert.deepEqual(network.visualOffset,{x:0,y:0,angle:0});
    assert.equal(network.predictedShip.x,70);assert.equal(network.renderedShip.x,70);assert.equal(network.renderedShip.y,30);
    assert.ok(network.inputFrames(0,100).every(frame=>!frame.input.fire&&!frame.input.aiming&&!frame.input.thrust));
    network.renderedShip.x=-500;
    assert.equal(network.predictedShip.x,70);assert.equal(network.state.ship.x,70,'visual poses never overwrite authority');
    assert.equal(JSON.stringify(packet),before);
  }
});

test('manual sidearm aim survives input transport and timestamped replay independently of walking', () => {
  let time=0;const sent=[];
  const network=new FarwakeNetwork({url:'https://example.test',storage:null,autoReconnect:false,now:()=>time,wallNow:()=>1000+time});
  network._snapshot({tick:1,serverTime:1000,room:{id:'deck',kind:'ship'},state:{mode:'person',systemId:'hearth',ship:{id:'source',classId:'sparrow',x:0,y:0}},world:{},players:[],remoteShips:[]},true);
  network.socket={readyState:1,send:json=>sent.push(JSON.parse(json))};network.connected=true;
  time=50;const input={x:.3,y:-.8,aimX:-.6,aimY:.8,aiming:true,fire:true};network.setInput(input,.05);network._sendInput();
  assert.deepEqual(sent[0].input,input);
  const frames=network.inputFrames(0,50);assert.equal(frames.length,1);
  assert.equal(frames[0].input.x,.3);assert.equal(frames[0].input.y,-.8);
  assert.equal(frames[0].input.aimX,-.6);assert.equal(frames[0].input.aimY,.8);assert.equal(frames[0].input.aiming,true);assert.equal(frames[0].input.fire,true);
  input.aimX=0;assert.equal(network.input.aimX,-.6,'the caller cannot mutate a pending input frame');
});

test('remote aim interpolates on one deck while vessel switches and casualties snap to current authority', () => {
  const interpolation=new RemoteInterpolator();
  const player={captainId:'guest',roomId:'deck:a',vesselId:'a',systemId:'hearth',mode:'person',x:0,y:0,health:100,weapon:'pulse-sidearm',aimAngle:Math.PI-.1,home:{vesselId:'a'}};
  const vessel={id:'remote',classId:'sparrow',systemId:'hearth',mode:'ship',x:0,y:0,ship:{id:'a'}};
  const packet=(serverTime,p,ship=vessel)=>({serverTime,room:{id:'observer-room'},players:[p],remoteShips:[ship]});
  interpolation.push(packet(1000,player),1000);
  interpolation.push(packet(1100,{...player,x:20,health:76,aimAngle:-Math.PI+.1},{...vessel,x:20}),1100);
  const sample=interpolation.sample(1150);
  assert.equal(sample.players[0].x,10);assert.equal(sample.players[0].health,76);assert.equal(sample.players[0].weapon,'pulse-sidearm');
  assert.ok(Math.abs(sample.players[0].aimAngle-Math.PI)<.0001,'aim uses the short rotation across the angle seam');
  sample.players[0].home.vesselId='changed';sample.remoteShips[0].ship.id='changed';
  assert.equal(interpolation.sample(1150).players[0].home.vesselId,'a');assert.equal(interpolation.sample(1150).remoteShips[0].ship.id,'a');
  interpolation.push(packet(1200,{...player,x:80,roomId:'deck:b',vesselId:'b'},{...vessel,x:70,ship:{id:'b'}}),1200);
  const switched=interpolation.sample(1250);assert.equal(switched.players[0].x,80);assert.equal(switched.remoteShips[0].x,70);
  interpolation.push(packet(1300,{...player,x:90,vx:100,roomId:'deck:b',vesselId:'b',health:0,down:true}),1300);
  assert.equal(interpolation.sample(1350).players[0].x,90,'a fallen captain cannot slide along an old movement frame');
});

test('taking and leaving the helm keeps the visible pilot at the physical station', () => {
  const interpolation=new RemoteInterpolator();
  const walking={captainId:'guest',roomId:'deck:owner',vesselId:'owner',systemId:'hearth',mode:'person',x:150,y:220,vx:60,vy:-30,health:100};
  const packet=(serverTime,person)=>({serverTime,room:{id:'deck:owner'},players:[person],remoteShips:[]});
  interpolation.push(packet(1000,walking),1000);
  const piloting={...walking,perspective:'ship',station:'helm',x:160,y:180,vx:0,vy:0};
  interpolation.push(packet(1100,piloting),1100);
  assert.deepEqual(interpolation.sample(1150).players[0],piloting,'taking command immediately places the body at the helm instead of tweening through the cabin');
  interpolation.push(packet(1200,piloting),1200);
  const held=interpolation.sample(1700).players[0];
  assert.equal(held.x,160);assert.equal(held.y,180);assert.equal(held.station,'helm','stale movement does not drift the pilot away from the console');
  const released={...walking,x:160,y:185,vx:0,vy:20};
  interpolation.push(packet(1300,released),1300);
  assert.deepEqual(interpolation.sample(1350).players[0],released,'leaving the helm clears its projected pose and role immediately');
  interpolation.push({...packet(1400,released),players:[]},1400);
  assert.equal(interpolation.sample(1450).players.length,0,'a departed crewmate is removed rather than retained as a station ghost');
});
