import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomHub, RoomError, phaseKey, commandPitchId } from '../multiplayer.mjs';
import { createServer } from '../server.mjs';
import { OnlineSession } from '../public/online.mjs';
import { getBatterBody, PITCH_AIM_AREA, inStrikeZone } from '../public/engine.mjs';

function pair(options = {}) {
  let milliseconds = 100000;
  const hub = new RoomHub({ now: () => milliseconds, ...options });
  const first = hub.create({ difficulty: 'rookie', pitcher: 'knuckle' });
  const second = hub.join(first.code, { pitcher: 'balanced' });
  const credentials = [first, second], packets = [[], []], streams = [], disconnect = [];
  for (const [side, seat] of credentials.entries()) {
    streams[side] = packet => {
      packets[side].push(packet);
      if (packet.type === 'ping') hub.pong(seat.code, seat.token, packet.challenge);
    };
    disconnect[side] = hub.connect(seat.code, seat.token, streams[side]);
  }
  const room = hub.room(first.code);
  function input(side, command, extras = {}) {
    const player = room.players[side], seat = credentials[side];
    return hub.input(seat.code, seat.token, { generation: room.generation, seq: player.lastSeq + 1,
      phaseKey: phaseKey(room.game.state), command: { pitchId: commandPitchId(room.game.state), ...command }, ...extras });
  }
  function tick(seconds = 1 / 120) { milliseconds += seconds * 1000; hub.tick(seconds); }
  function until(predicate, limit = 30) { for (let i = 0; i < limit * 120; i++) { if (predicate(room.game.state)) return; tick(); } assert.fail(`Timed out in ${room.game.state.phase}`); }
  function start() { assert.equal(input(0, { type: 'ready' }).ok, true); assert.equal(input(1, { type: 'ready' }).ok, true); }
  return { hub, room, credentials, packets, streams, disconnect, input, tick, until, start,
    elapse: ms => { milliseconds += ms; }, now: () => milliseconds };
}

function offerOnlineCharge(p) {
  for(let n=0;n<2;n++){
    const body=getBatterBody(p.room.game.state);
    assert.equal(p.input(1,{type:'pitch',pitchType:'fastball',quality:1,aim:{x:body.x/PITCH_AIM_AREA.x,y:0}}).ok,true);
    p.until(s=>s.phase==='result');
    assert.equal(p.room.game.state.result.kind,'hitByPitch');
    if(n===0){p.input(0,{type:'next'});p.input(1,{type:'next'});}
  }
  assert.ok(p.room.game.state.confrontation);
}

test('defensive positioning belongs to the fielding seat and survives rejoin without moving the clock', t => {
  const p = pair(); t.after(() => p.hub.close()); p.start();
  const s = p.room.game.state, before = s.time;
  const shortstop = s.fielders.find(f => f.id === 'SS');
  const original = { x: shortstop.x, z: shortstop.z };
  assert.equal(p.input(0, { type: 'defense', side: 1, alignment: 'infieldIn' }).code, 'wrong_side');
  assert.equal(p.input(1, { type: 'defense', alignment: 'invented' }).code, 'bad_alignment');
  assert.equal(p.input(1, { type: 'defense', alignment: 'infieldIn' }, { phaseKey: 'old-play' }).code, 'stale_phase');
  assert.equal(p.input(1, { type: 'defense', alignment: 'infieldIn', pitchId: 99 }).code, 'stale_pitch');
  assert.equal(p.input(1, { type: 'defense', alignment: 'infieldIn' }).ok, true);
  assert.equal(s.time, before);
  assert.equal(s.defensiveAlignment[0], 'normal');
  assert.equal(s.defensiveAlignment[1], 'infieldIn');
  const positioned = s.fielders.find(f => f.id === 'SS');
  assert.notDeepEqual({ x: positioned.x, z: positioned.z }, original);
  const rejoined = p.hub.rejoin(p.room.code, p.credentials[1].token);
  assert.equal(rejoined.packet.snapshot.state.defensiveAlignment[1], 'infieldIn');
  assert.deepEqual(rejoined.packet.snapshot.state.fielders, p.room.game.snapshot().state.fielders);
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(p.input(1, { type: 'defense', alignment: 'deep' }).ok, false);
  assert.equal(s.defensiveAlignment[1], 'infieldIn');
});

test('an online pitchout is available outside the pitcher repertoire and costs a called ball', t => {
  const p = pair(); t.after(() => p.hub.close()); p.start();
  const game = p.room.game;
  assert.equal(game.availablePitches.includes('pitchout'), false);
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'pitchout', quality: 1, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(game.state.pitch.type, 'pitchout');
  assert.equal(inStrikeZone(game.state.pitch.target), false);
  p.until(s => s.phase === 'result');
  assert.equal(game.state.balls, 1);
  assert.equal(game.state.strikes, 0);
  assert.equal(game.state.outs, 0);
});

test('a delayed online bunt uses the same bounded timing allowance and remains a bunt on the server', t => {
  const p = pair(); t.after(() => p.hub.close()); p.start();
  p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  const targetTime = p.room.game.state.pitch.contactAt;
  p.until(s => s.time >= targetTime + .12);
  p.room.players[0].rtt = 180;
  assert.equal(p.input(0, { type: 'swing', bunt: true, time: targetTime - .2, aim: { x: 0, y: 0 } }).code, 'late_input');
  assert.equal(p.input(0, { type: 'swing', bunt: true, power: true, time: targetTime, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(p.room.game.state.swing.bunt, true);
  assert.equal(p.room.game.state.swing.power, false);
  assert.equal(p.room.game.state.lastContact.bunt, true);
  assert.ok(Math.abs(p.room.game.state.lastContact.timing) < 1e-9);
});

test('local bunt preview cannot create contact, change the defense, or announce a result ahead of authority', t => {
  const p = pair(); t.after(() => p.hub.close()); p.start();
  p.input(1, { type: 'defense', alignment: 'doublePlay' });
  p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  p.until(s => s.time >= s.pitch.contactAt - .05);
  const session = new OnlineSession({ storageEnabled: false });
  session.side = 0; session.generation = p.room.generation; session.code = p.room.code;
  session._closed = false; session.connected = true;
  session._packet(p.hub.packet(p.room, p.room.players[0]));
  const authority = session.game.snapshot();
  session._predictionSwing = { type: 'swing', pitchId: 1, time: p.room.game.state.pitch.contactAt, aim: { x: 0, y: 0 }, bunt: true, power: false };
  session._predict(.2);
  assert.equal(session.game.state.swing.bunt, true);
  assert.equal(session.game.state.phase, 'pitch');
  assert.equal(session.game.state.lastContact, null);
  assert.deepEqual(session.game.state.score, authority.state.score);
  assert.deepEqual(session.game.state.defensiveAlignment, authority.state.defensiveAlignment);
  assert.equal(session.game.state.result, null);
  assert.equal(session.game.drainEvents().length, 0);
});

test('online mound choices belong to the hit batter and clear the other player’s ready signal', t=>{
  const p=pair();t.after(()=>p.hub.close());p.start();offerOnlineCharge(p);
  const before=p.room.game.snapshot(),key=phaseKey(p.room.game.state);
  assert.equal(p.input(1,{type:'chargeMound',side:0}).code,'wrong_side');
  assert.equal(p.input(0,{type:'chargeMound'},{phaseKey:'earlier-result'}).code,'stale_phase');
  assert.equal(p.input(0,{type:'chargeMound',pitchId:99}).code,'stale_pitch');
  assert.equal(p.input(1,{type:'next'}).ok,true);
  assert.deepEqual(p.hub.metadata(p.room).readySides,[1]);
  assert.equal(p.input(1,{type:'changePitcher',pitcherId:'foundry-heat104'}).ok,false);
  assert.equal(p.input(0,{type:'chargeMound'}).ok,true);
  assert.equal(p.room.game.state.phase,'brawl');
  assert.deepEqual(p.hub.metadata(p.room).readySides,[]);
  assert.equal(p.input(1,{type:'next'},{phaseKey:key}).ok,false);
  assert.deepEqual(p.room.game.state.bases,before.state.bases);
  assert.deepEqual(p.room.game.state.score,before.state.score);
});

test('taking the base is final for that online choice, even while the opponent is still deciding', t=>{
  const p=pair();t.after(()=>p.hub.close());p.start();offerOnlineCharge(p);
  assert.equal(p.input(0,{type:'next'}).ok,true);
  assert.equal(p.input(0,{type:'chargeMound'}).code,'choice_made');
  assert.equal(p.input(1,{type:'next'}).ok,true);
  assert.equal(p.room.game.state.phase,'ready');
  assert.equal(p.room.game.state.confrontation,null);
  assert.equal(p.room.game.state.bases.filter(Boolean).length,2);
});

test('online fights authenticate both fighters, pause and reconnect, and cannot duplicate damage', t=>{
  const p=pair();t.after(()=>p.hub.close());p.start();offerOnlineCharge(p);
  p.input(0,{type:'chargeMound'});p.until(s=>s.brawl.stage==='fight');
  assert.equal(p.input(1,{type:'fight',action:'invented'}).code,'bad_fight_action');
  assert.equal(p.input(1,{type:'fight',action:'jab'},{phaseKey:'old-fight'}).code,'stale_phase');
  const seat=p.room.players[0],envelope={generation:p.room.generation,seq:seat.lastSeq+1,phaseKey:phaseKey(p.room.game.state),command:{type:'fight',action:'jab',side:1,health:0,damage:1000,time:-1,pitchId:commandPitchId(p.room.game.state)}};
  assert.equal(p.hub.input(p.room.code,seat.token,envelope).ok,true);
  assert.equal(p.room.game.state.brawl.fighters[0].action,'jab');
  assert.equal(p.room.game.state.brawl.fighters[1].action,'idle');
  const started=p.room.game.snapshot();
  assert.equal(p.hub.input(p.room.code,seat.token,envelope).duplicate,true);
  assert.deepEqual(p.room.game.snapshot(),started);
  assert.equal(p.input(0,{type:'fight',action:'jab'}).ok,false);
  assert.equal(p.input(1,{type:'fight',action:'guard'}).ok,true);
  p.input(1,{type:'pause'});const at=p.room.game.state.time;
  p.tick(.25);assert.equal(p.room.game.state.time,at);
  assert.equal(p.input(0,{type:'fight',action:'dodge'}).code,'game_paused');
  p.input(1,{type:'resume'});p.until(s=>s.brawl.fighters[0].impactDone);
  assert.equal(p.room.game.state.brawl.fighters[1].health,97);
  p.disconnect[0]();const disconnected=p.room.game.state.time;p.tick(.25);
  assert.equal(p.room.game.state.time,disconnected);
  const rejoined=p.hub.rejoin(p.room.code,p.credentials[0].token);
  assert.deepEqual(rejoined.packet.snapshot.state.brawl,p.room.game.state.brawl);
  p.hub.connect(p.room.code,p.credentials[0].token,p.streams[0]);
  const bases=p.room.game.state.bases.map(r=>r?.id??null),score=[...p.room.game.state.score];
  p.until(s=>s.phase==='result');
  assert.equal(p.room.game.state.result.kind,'brawl');
  assert.deepEqual(p.room.game.state.bases.map(r=>r?.id??null),bases);
  assert.deepEqual(p.room.game.state.score,score);
  assert.equal(p.room.game.state.ejections[0].length,1);
  assert.equal(p.room.game.state.ejections[1].length,1);
  p.input(0,{type:'next'});p.input(1,{type:'next'});
  assert.equal(p.room.game.state.phase,'ready');
});

test('client extrapolation cannot invent fight damage, ejections, or a replacement', t=>{
  const p=pair();t.after(()=>p.hub.close());p.start();offerOnlineCharge(p);
  p.input(0,{type:'chargeMound'});p.until(s=>s.brawl.stage==='fight');
  p.input(0,{type:'fight',action:'jab'});
  const session=new OnlineSession({storageEnabled:false});
  session.generation=p.room.generation;session.side=0;
  session._packet(p.hub.packet(p.room,p.room.players[0]));
  const state=structuredClone(session.game.state);
  for(let n=0;n<6;n++)session._predict(.1);
  assert.deepEqual(session.game.state.brawl,state.brawl);
  assert.deepEqual(session.game.state.ejections,state.ejections);
  assert.deepEqual(session.game.state.lineupChanges,state.lineupChanges);
  assert.deepEqual(session.game.state.pitching,state.pitching);
  assert.deepEqual(session.game.state.score,state.score);
});

test('private online rooms require two connected ready players and never start CPU pitches', () => {
  const p = pair();
  assert.equal(p.hub.status(p.room), 'waiting');
  p.input(0, { type: 'ready' }); p.tick(.25);
  assert.equal(p.room.game.state.time, 0);
  p.input(1, { type: 'ready' });
  for (let n = 0; n < 16; n++) p.tick(.25);
  assert.equal(p.hub.status(p.room), 'playing');
  assert.equal(p.room.game.state.phase, 'ready');
  assert.equal(p.room.game.state.pitch, null);
  assert.deepEqual(p.room.game.options.humanSides, [0, 1]);
  assert.equal(p.room.game.options.pitcher, 'knuckle');
  assert.equal(p.room.game.options.opponentPitcher, 'balanced');
  p.hub.close();
});

test('the creator selects one authoritative park for both seats and rejoin', t => {
  const hub = new RoomHub(); t.after(() => hub.close());
  const first = hub.create({ park: 'fenway' });
  const second = hub.join(first.code, { park: 'harbor' });
  const room = hub.room(first.code);
  assert.equal(hub.metadata(room).options.park, 'fenway');
  for (const seat of [first, second]) {
    const packet = hub.rejoin(seat.code, seat.token).packet;
    assert.equal(packet.room.options.park, 'fenway');
    assert.equal(packet.snapshot.state.options.park, 'fenway');
  }
  const invalid = hub.create({ park: 'constructor' });
  assert.equal(invalid.packet.room.options.park, 'harbor');
  assert.equal(invalid.packet.snapshot.state.options.park, 'harbor');
});

test('an online seat cannot control the opposing side, select an unavailable pitch, or send nonfinite aim', () => {
  const p = pair(); p.start();
  assert.equal(p.input(0, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } }).code, 'wrong_side');
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'knuckleball', quality: 1, aim: { x: 0, y: 0 } }).ok, false);
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: Infinity, y: 0 } }).code, 'bad_aim');
  assert.equal(p.room.game.state.phase, 'ready');
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(p.room.game.state.pitch.aiSwing, null);
  assert.equal(p.input(1, { type: 'swing', time: p.room.game.state.time, aim: { x: 0, y: 0 } }).code, 'wrong_side');
  p.hub.close();
});

test('guest starter selection initializes its named left-handed pitcher and survives rejoin', t => {
  const hub = new RoomHub(); t.after(() => hub.close());
  const host = hub.create({ pitcher: 'heat104' });
  const guest = hub.join(host.code, { pitcher: 'southpaw' });
  const game = hub.room(host.code).game;
  assert.equal(game.state.pitching[0].activeId, 'harbor-heat104');
  assert.equal(game.activePitcher.playerId, 'foundry-southpaw');
  assert.equal(game.activePitcher.throws, 'L');
  assert.equal(game.activePitcher.id, 'southpaw');
  assert.deepEqual(hub.rejoin(guest.code, guest.token).packet.snapshot.state.pitching, game.state.pitching);
  const invalid = hub.create({ pitcher: 'constructor' });
  const invalidGuest = hub.join(invalid.code, { pitcher: '__proto__' });
  assert.equal(invalid.packet.snapshot.state.pitching[0].activeId, 'harbor-balanced');
  assert.equal(invalidGuest.packet.snapshot.state.pitching[1].activeId, 'foundry-balanced');
});

test('online pitching changes are owned by the authenticated manager and preserve time-outs and count', () => {
  const p = pair(); p.start();
  p.room.game.state.balls = 2; p.room.game.state.strikes = 1;
  p.room.game.state.bases[1] = { id: 71, number: 4, side: 0, speed: 7 };
  const before = p.room.game.snapshot();
  p.input(0, { type: 'pause' });
  assert.equal(p.input(1, { type: 'changePitcher', pitcherId: 'foundry-heat104' }).ok, true);
  assert.equal(p.room.game.activePitcher.playerId, 'foundry-heat104');
  assert.equal(p.hub.status(p.room), 'paused');
  assert.equal(p.room.game.state.time, before.state.time);
  assert.equal(p.room.game.state.balls, 2); assert.equal(p.room.game.state.strikes, 1);
  assert.deepEqual(p.room.game.state.bases, before.state.bases);
  assert.equal(p.input(0, { type: 'changePitcher', side: 1, pitcherId: 'foundry-southpaw' }).ok, false, 'a forged side cannot change the opponent staff');
  assert.equal(p.input(0, { type: 'changePitcher', pitcherId: 'harbor-southpaw' }).ok, true, 'a batting manager may prepare their own next-inning pitcher');
  assert.equal(p.room.game.state.pitching[0].activeId, 'harbor-southpaw');
  assert.equal(p.room.game.state.pitching[1].activeId, 'foundry-heat104');
  assert.equal(p.input(1, { type: 'changePitcher', pitcherId: 'foundry-balanced' }).ok, false, 'removed pitchers cannot re-enter');
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } }).code, 'game_paused');
  p.input(0, { type: 'resume' });
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(p.input(1, { type: 'changePitcher', pitcherId: 'foundry-sidearm' }).ok, false, 'a delivery cannot change mid-pitch');
  const restored = p.hub.rejoin(p.room.code, p.credentials[0].token).packet.snapshot;
  assert.deepEqual(restored.state.pitching, p.room.game.state.pitching);
  p.hub.close();
});

test('pitching-change messages reject stale phases and duplicate commands cannot remove a second pitcher', () => {
  const p = pair(); p.start();
  assert.equal(p.input(1, { type: 'changePitcher', pitcherId: 'foundry-sidearm' }, { phaseKey: 'earlier-play' }).code, 'stale_phase');
  assert.equal(p.input(1, { type: 'changePitcher', pitcherId: 'foundry-sidearm', pitchId: 999 }).code, 'stale_pitch');
  const player = p.room.players[1];
  const envelope = { generation: p.room.generation, seq: player.lastSeq + 1, phaseKey: phaseKey(p.room.game.state), command: { type: 'changePitcher', pitcherId: 'foundry-sidearm', pitchId: commandPitchId(p.room.game.state) } };
  assert.equal(p.hub.input(p.room.code, player.token, envelope).ok, true);
  const state = p.room.game.snapshot();
  assert.equal(p.hub.input(p.room.code, player.token, envelope).duplicate, true);
  assert.deepEqual(p.room.game.snapshot(), state);
  assert.equal(p.room.game.activePitcher.playerId, 'foundry-sidearm');
  p.hub.close();
});

test('online commands are generation scoped, ordered and idempotent', () => {
  const p = pair(); p.start();
  const player = p.room.players[1], seq = player.lastSeq + 1;
  const envelope = { generation: p.room.generation, seq, command: { type: 'pitch', pitchId: 1, pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } } };
  assert.throws(() => p.hub.input(p.room.code, player.token, { ...envelope, generation: 'old-game' }), error => error.code === 'wrong_game');
  assert.throws(() => p.hub.input(p.room.code, player.token, { ...envelope, seq: seq + 1 }), error => error.code === 'sequence_gap');
  assert.equal(p.hub.input(p.room.code, player.token, envelope).ok, true);
  const state = p.room.game.snapshot();
  assert.equal(p.hub.input(p.room.code, player.token, envelope).duplicate, true);
  assert.deepEqual(p.room.game.snapshot(), state);
  assert.equal(p.input(0, { type: 'swing', pitchId: 99, time: p.room.game.state.time, aim: { x: 0, y: 0 } }).code, 'stale_pitch');
  p.hub.close();
});

test('both online players acknowledge a completed play and stale next messages cannot skip another', () => {
  const p = pair(); p.start();
  p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  p.until(s => s.phase === 'result'); const oldKey = phaseKey(p.room.game.state);
  p.input(0, { type: 'next' });
  assert.equal(p.room.game.state.phase, 'result'); assert.deepEqual(p.hub.metadata(p.room).readySides, [0]);
  p.input(1, { type: 'next' }); assert.equal(p.room.game.state.phase, 'ready');
  p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  p.until(s => s.phase === 'result');
  assert.equal(p.input(0, { type: 'next' }, { phaseKey: oldKey }).code, 'stale_phase');
  assert.deepEqual(p.hub.metadata(p.room).readySides, []);
  p.hub.close();
});

test('online roles and pitcher repertoires swap correctly after the third out', () => {
  const p = pair(); p.start(); p.room.game.state.outs = 2; p.room.game.state.strikes = 2;
  p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  p.until(s => s.phase === 'result');
  p.input(0, { type: 'next' }); p.input(1, { type: 'next' });
  assert.equal(p.room.game.state.phase, 'half');
  p.input(0, { type: 'next' }); p.input(1, { type: 'next' });
  assert.equal(p.room.game.state.half, 'bottom'); assert.equal(p.room.game.state.battingSide, 1);
  assert.equal(p.room.game.activePitcher.id, 'knuckle');
  assert.equal(p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } }).code, 'wrong_side');
  assert.equal(p.input(0, { type: 'pitch', pitchType: 'knuckleball', quality: 1, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(p.room.game.state.pitch.aiSwing, null); p.hub.close();
});

test('a bounded delayed online swing uses its observed timestamp while excessive rewind is rejected', () => {
  const p = pair(); p.start();
  p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  const targetTime = p.room.game.state.pitch.contactAt;
  p.until(s => s.time >= targetTime + .12);
  p.room.players[0].rtt = 180;
  assert.equal(p.input(0, { type: 'swing', time: targetTime - .2, aim: { x: 0, y: 0 } }).code, 'late_input');
  assert.equal(p.input(0, { type: 'swing', time: targetTime, aim: { x: 0, y: 0 } }).ok, true);
  assert.equal(p.room.game.state.phase, 'live');
  assert.ok(Math.abs(p.room.game.state.lastContact.timing) < 1e-9);
  p.hub.close();
});

test('disconnect freezes the authoritative clock, rejoin retains the seat, and manual pause needs its owner to resume', () => {
  const p = pair(); p.start(); p.tick(.1);
  const time = p.room.game.state.time;
  p.disconnect[1](); p.tick(.25);
  assert.equal(p.hub.status(p.room), 'paused'); assert.equal(p.room.game.state.time, time);
  const restored = p.hub.rejoin(p.room.code, p.credentials[1].token);
  assert.equal(restored.side, 1); assert.equal(restored.lastSeq, p.room.players[1].lastSeq);
  p.hub.connect(p.room.code, restored.token, p.streams[1]); p.tick(.1);
  assert.ok(p.room.game.state.time > time);
  p.input(0, { type: 'pause' }); const pausedTime = p.room.game.state.time;
  p.input(1, { type: 'resume' }); p.tick(.25); assert.equal(p.room.game.state.time, pausedTime);
  p.input(0, { type: 'resume' }); p.tick(.1); assert.ok(p.room.game.state.time > pausedTime);
  p.hub.close();
});

test('expired seats close ephemeral rooms and room capacity is bounded', () => {
  const p = pair({ maxRooms: 1 });
  assert.throws(() => p.hub.create(), error => error.code === 'capacity');
  assert.throws(() => p.hub.rejoin(p.room.code, 'a'.repeat(64)), error => error.status === 401);
  p.disconnect[1](); p.elapse(120001); p.hub.prune();
  assert.equal(p.hub.rooms.size, 0);
  assert.throws(() => p.hub.rejoin(p.room.code, p.credentials[1].token), error => error.code === 'room_missing');
  assert.match(p.hub.create().code, /^[A-Z2-9]{6}$/); p.hub.close();
});

test('client extrapolation previews a swing without publishing a contact or an early called strike', () => {
  const p = pair(); p.start(); p.input(1, { type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } });
  p.until(s => s.time >= s.pitch.contactAt - .05);
  const session = new OnlineSession({ storageEnabled: false });
  session.side = 0; session.generation = p.room.generation; session.code = p.room.code; session._closed = false; session.connected = true;
  session._packet(p.hub.packet(p.room, p.room.players[0]));
  const authority = session.game.snapshot();
  session._predictionSwing = { type: 'swing', pitchId: 1, time: p.room.game.state.pitch.contactAt, aim: { x: 0, y: 0 }, power: false };
  session._predict(.2);
  assert.equal(session.game.state.phase, 'pitch');
  assert.equal(session.game.state.lastContact, null);
  assert.deepEqual(session.game.state.score, authority.state.score);
  assert.equal(session.game.state.strikes, authority.state.strikes);
  assert.equal(session.game.drainEvents().length, 0);
  assert.ok(session.game.state.swing, 'the bat animation should have a local preview');
  session._predictionSwing = null;
  session._packet(p.hub.packet(p.room, p.room.players[0]));
  for (let n = 0; n < 8; n++) session._predict(.1);
  assert.equal(session.game.state.phase, 'pitch', 'prediction must wait for the official call');
  assert.equal(session.game.state.strikes, 0); assert.equal(session.game.state.result, null);
  p.hub.close();
});

test('cancelling a room request cannot adopt a late response or leave a hidden stream', async () => {
  const hub = new RoomHub(), seat = hub.create(), session = new OnlineSession({ storageEnabled: false });
  let resolveCreate, enteredRequest, streamsOpened = 0, discarded = false;
  const entered = new Promise(resolve => { enteredRequest = resolve; });
  session._request = async (path, data) => {
    if (path === '/api/rooms') { enteredRequest(); return new Promise(resolve => { resolveCreate = resolve; }); }
    if (path.endsWith('/input') && data.command?.type === 'leave') { discarded = true; hub.input(seat.code, seat.token, data); return { ok: true }; }
    throw new Error('Unexpected request');
  };
  session._openStream = async () => { streamsOpened++; };
  const creating = session.create(); await entered; await session.leave(); resolveCreate(seat);
  await assert.rejects(creating, error => error.code === 'cancelled');
  assert.equal(session.isOnline, false); assert.equal(session.token, null); assert.equal(streamsOpened, 0);
  assert.equal(discarded, true); assert.equal(hub.rooms.size, 0); hub.close();
});

test('cancelling a join before its response does not restore the guest seat', async () => {
  const hub = new RoomHub(), host = hub.create(), seat = hub.join(host.code), session = new OnlineSession({ storageEnabled: false });
  let resolveJoin, enteredRequest, opened = false;
  const entered = new Promise(resolve => { enteredRequest = resolve; });
  session._request = async (path, data) => {
    if (path.endsWith('/join')) { enteredRequest(); return new Promise(resolve => { resolveJoin = resolve; }); }
    if (data.command?.type === 'leave') return hub.input(seat.code, seat.token, data);
    throw new Error('Unexpected request');
  };
  session._openStream = async () => { opened = true; };
  const joining = session.join(host.code); await entered; await session.leave(); resolveJoin(seat);
  await assert.rejects(joining, error => error.code === 'cancelled');
  assert.equal(opened, false); assert.equal(session.isOnline, false); assert.equal(hub.rooms.size, 0); hub.close();
});

test('disposing a failed connection preserves a late seat instead of ending the shared match', async () => {
  const hub = new RoomHub(), host = hub.create(), seat = hub.join(host.code), session = new OnlineSession({ storageEnabled: false });
  let resolveJoin, enteredRequest, leaves = 0;
  const entered = new Promise(resolve => { enteredRequest = resolve; });
  session._request = async (path, data) => {
    if (path.endsWith('/join')) { enteredRequest(); return new Promise(resolve => { resolveJoin = resolve; }); }
    if (data.command?.type === 'leave') { leaves++; return hub.input(seat.code, seat.token, data); }
    throw new Error('Unexpected request');
  };
  session._openStream = async () => assert.fail('A disposed attempt cannot open a stream');
  const joining = session.join(host.code); await entered; await session.disconnect(); resolveJoin(seat);
  await assert.rejects(joining, error => error.code === 'cancelled');
  assert.equal(leaves, 0); assert.equal(hub.rooms.size, 1); assert.equal(hub.rejoin(host.code, seat.token).side, 1);
  hub.close();
});

test('health, static assets and online HTTP origin/auth/body boundaries work together', async t => {
  const server = createServer({ automaticTicks: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.shutdown(resolve)));
  const health = await fetch(`${base}/health`).then(r => r.json()); assert.equal(health.ok, true);
  assert.equal((await fetch(base)).status, 200);
  const blocked = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: 'https://unrelated.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(blocked.status, 403);
  const made = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: 'https://dfe-pocket-baseball.onrender.com', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(made.headers.get('access-control-allow-origin'), 'https://dfe-pocket-baseball.onrender.com');
  const seat = await made.json();
  assert.equal((await fetch(`${base}/api/rooms/${seat.code}/stream`)).status, 401);
  const invalid = await fetch(`${base}/api/rooms/${seat.code}/input`, { method: 'POST', headers: { Authorization: `Bearer ${seat.token}`, 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalid.status, 400);
});

async function waitUntil(predicate, message, maximum = 3000) {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > maximum) assert.fail(message); await new Promise(resolve => setTimeout(resolve, 10)); }
}

test('the transport invokes fetch with the browser global receiver', async () => {
  let called = false;
  function browserFetch(url, options) {
    assert.equal(this, globalThis, 'native Window.fetch must not receive OnlineSession as this');
    assert.equal(url, 'https://example.invalid/api/rooms'); assert.equal(options.method, 'POST');
    called = true; return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  }
  const session = new OnlineSession({ baseUrl: 'https://example.invalid', fetchImpl: browserFetch, storageEnabled: false });
  assert.equal((await session._request('/api/rooms', {}, { auth: false })).ok, true);
  assert.equal(called, true);
});

test('two real HTTP/SSE clients receive matching authority, correct local roles, and a shared pause', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const errors = [], compression = [];
  const observedFetch = async (url, options) => { const response = await fetch(url, options); if (url.endsWith('/stream')) compression.push(response.headers.get('content-encoding')); return response; };
  const first = new OnlineSession({ baseUrl, storageEnabled: false, fetchImpl: observedFetch, onError: e => errors.push(e.message) }), second = new OnlineSession({ baseUrl, storageEnabled: false, fetchImpl: observedFetch, onError: e => errors.push(e.message) });
  t.after(async () => { await first.leave(); await second.leave(); await new Promise(resolve => server.shutdown(resolve)); });
  await first.create({ difficulty: 'rookie', pitcher: 'knuckle', park: 'fenway' }); await second.join(first.code, { pitcher: 'power', park: 'harbor' });
  await waitUntil(() => first.room.players[1].connected && second.room.players[0].connected, 'Both streams should connect');
  await first.ready(); await second.ready();
  await waitUntil(() => first.room.status === 'playing' && second.room.status === 'playing', 'Both clients should enter play');
  assert.equal(first.game.isBatting, true); assert.equal(second.game.isBatting, false);
  assert.equal(second.game.activePitcher.id, 'power');
  for (const client of [first, second]) {
    assert.equal(client.room.options.park, 'fenway');
    assert.equal(client.game.options.park, 'fenway');
    assert.equal(client.game.state.options.park, 'fenway');
  }
  await first.pause(); await waitUntil(() => first.room.status === 'paused' && second.room.status === 'paused', 'Both clients should see the bullpen time-out');
  assert.equal((await second.send({ type: 'changePitcher', pitcherId: 'foundry-heat104' })).ok, true);
  await waitUntil(() => first.game.activePitcher.playerId === 'foundry-heat104' && second.game.activePitcher.playerId === 'foundry-heat104', 'Both clients should receive the relief pitcher');
  assert.deepEqual(first.game.state.pitching, second.game.state.pitching);
  await first.resume(); await waitUntil(() => first.room.status === 'playing' && second.room.status === 'playing', 'The manager should resume the time-out');
  assert.equal((await second.send({ type: 'pitch', pitchType: 'fastball', quality: 1, aim: { x: 0, y: 0 } })).ok, true);
  await waitUntil(() => first.game.state.pitch?.id === 1 && second.game.state.pitch?.id === 1, 'Both clients should see the same pitch');
  assert.deepEqual(first.game.state.pitch.target, second.game.state.pitch.target);
  assert.equal(first.game.state.pitch.aiSwing, null);
  await first.pause(); await waitUntil(() => second.room.status === 'paused', 'Opponent should observe a shared pause');
  const serverTime = server.baseballHub.room(first.code).game.state.time;
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(server.baseballHub.room(first.code).game.state.time, serverTime);
  assert.deepEqual(first.game.state.score, second.game.state.score);
  assert.deepEqual(first.game.state.bases, second.game.state.bases);
  assert.deepEqual(compression, ['gzip', 'gzip']);
  assert.equal(errors.length, 0, errors.join('; '));
});
