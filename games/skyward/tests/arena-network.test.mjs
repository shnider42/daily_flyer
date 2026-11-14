import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from '../vendor/ws/wrapper.mjs';
import { createSkywardServer, PROTOCOL_VERSION } from '../server.mjs';
import { SquadronClient } from '../public/network.mjs';
import { AIRCRAFT } from '../public/campaign.mjs';
import { FlightSimulation } from '../public/sim.mjs';
import { createArenaMission } from '../public/arena.mjs';
import { basis, orientationFromEuler } from '../public/orientation.mjs';

class Peer {
  constructor(url) {
    this.socket = new WebSocket(url); this.messages = []; this.waiters = [];
    this.socket.on('error', () => {});
    this.socket.on('message', bytes => {
      const message = JSON.parse(bytes.toString()), index = this.waiters.findIndex(w => w.match(message));
      if (index < 0) this.messages.push(message);
      else { const w = this.waiters.splice(index, 1)[0]; clearTimeout(w.timer); w.resolve(message); }
    });
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  next(type, predicate = () => true) {
    const match = m => m.type === type && predicate(m), index = this.messages.findIndex(match);
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error(`Timed out waiting for ${type}; queued message types: ${this.messages.map(m => m.type).join(', ')}`));
      }, 2500);
      this.waiters.push(waiter);
    });
  }
  close() { for (const w of this.waiters) clearTimeout(w.timer); this.socket.terminate(); }
}

async function setup(t, extra = {}) {
  const app = await createSkywardServer({ port: 0, host: '127.0.0.1', reconnectGraceMs: 2000, tickMs: 30, ...extra });
  const url = `ws://127.0.0.1:${app.port}/ws`, peers = [];
  t.after(async () => { for (const p of peers) p.close(); await app.close(); });
  async function connect({ modern = true } = {}) {
    const peer = new Peer(url); peers.push(peer);
    await peer.next('hello'); peer.send({ type: 'hello', version: PROTOCOL_VERSION, flightProtocol: modern ? 2 : undefined }); await peer.next('welcome');
    return peer;
  }
  return { app, connect, url };
}
async function until(predicate) {
  const deadline = Date.now() + 2500;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), 'the real WebSocket exchange completed');
}
const pose = (lifeId = 1, aircraft = 'f16') => ({ x: 100, y: 700, z: -800, heading: 0, pitch: 0, roll: 0,
  speed: 90, throttle: .7, aircraft, health: 100, lifeId, targetId: null, radarOn: true, gear: false, onGround: false });
const participant = (p, overrides = {}) => ({ id: p.id, name: p.name, aircraft: p.aircraft, startMode: p.startMode,
  lifeId: 1, alive: true, health: AIRCRAFT[p.aircraft].health, livesRemaining: null, kills: 0, deaths: 0,
  damageId: 0, respawnAt: 0, connected: true, pose: pose(1, p.aircraft), ...overrides });
const snapshot = (players, overrides = {}) => ({ status: 'flying', time: 1, participants: players,
  round: { duration: 300, remaining: 299, ended: false }, ...overrides });

async function arena(t) {
  const context = await setup(t), host = await context.connect(), guest = await context.connect();
  host.send({ type: 'create', name: 'Host', missionId: 'arena-canyon', config: { mode: 'dogfight', mapId: 'canyon', durationSeconds: 300, lives: 3 }, aircraft: 'f16', startMode: 'carrier' });
  const hostSession = await host.next('session');
  guest.send({ type: 'join', code: hostSession.code, name: 'Guest', aircraft: 'camel', startMode: 'airborne' });
  const guestSession = await guest.next('session');
  guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 2 && m.players.every(p => p.ready));
  host.send({ type: 'start', missionId: 'arena-canyon' });
  const start = await host.next('start'); await guest.next('start');
  return { ...context, host, guest, hostSession, guestSession, start };
}

test('every flyable aircraft may choose a carrier and all supported round lengths are accepted', async t => {
  const { app, connect } = await setup(t);
  for (const [index, aircraft] of Object.keys(AIRCRAFT).entries()) {
    const peer = await connect(), durationSeconds = [180, 300, 600, 1200][index % 4];
    peer.send({ type: 'create', name: aircraft, missionId: 'arena-islands', config: { mode: 'dogfight', mapId: 'islands', durationSeconds, lives: 3 }, aircraft, startMode: 'carrier' });
    const session = await peer.next('session');
    assert.equal(session.mode, 'dogfight'); assert.equal(session.maxPlayers, 4);
    assert.equal(session.config.durationSeconds, durationSeconds); assert.equal(session.missionId, 'arena-islands');
    assert.equal(session.aircraft, aircraft); assert.equal(session.startMode, 'carrier');
    assert.equal(app.rooms.get(session.code).players.get(session.id).aircraft, aircraft);
  }
  const invalid = await connect();
  invalid.send({ type: 'create', missionId: 'arena-canyon', config: { mode: 'dogfight', durationSeconds: 60 }, aircraft: 'f22' });
  assert.equal((await invalid.next('error')).code, 'bad_mission');
  invalid.send({ type: 'create', missionId: 'arena-canyon', config: { mode: 'dogfight', durationSeconds: 300 }, aircraft: 'invented-plane' });
  assert.equal((await invalid.next('error')).code, 'bad_loadout');
  invalid.send({ type: 'create', missionId: 'arena-canyon', config: { mode: 'freeflight', durationSeconds: 0, lives: 5 }, aircraft: 'c47', startMode: 'runway' });
  const free = await invalid.next('session');
  assert.equal(free.mode, 'freeflight'); assert.equal(free.config.durationSeconds, 0); assert.equal(free.config.lives, 5);
});

test('four connected browsers launch 2v2 with a host-selected wingmate and immutable teams', async t => {
  const { connect } = await setup(t), host = await connect();
  host.send({ type: 'create', name: 'Lead', missionId: 'arena-canyon', config: { mode: 'team-dogfight', durationSeconds: 180 } });
  const { code, id: hostId } = await host.next('session');
  host.send({ type: 'start' });
  assert.equal((await host.next('error')).code, 'need_four_pilots');
  const guests = [];
  for (const name of ['One', 'Two', 'Three']) {
    const peer = await connect();
    peer.send({ type: 'join', code, name });
    const { id, token } = await peer.next('session');
    guests.push({ peer, id, token });
  }
  const full = await host.next('roster', m => m.players.length === 4);
  assert.deepEqual(full.players.map(p => p.team), ['blue', 'red', 'blue', 'red']);
  const [one, two, three] = guests;
  one.peer.send({ type: 'team-partner', playerId: two.id });
  assert.equal((await one.peer.next('error')).code, 'host_only');
  for (const { peer } of guests) peer.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 4 && m.players.every(p => p.ready));
  host.send({ type: 'team-partner', playerId: three.id });
  const chosen = await host.next('roster', m => m.players.find(p => p.id === three.id)?.team === 'blue');
  assert.ok(chosen.players.filter(p => p.id !== hostId).every(p => !p.ready));
  for (const { peer } of guests) peer.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 4 && m.players.every(p => p.ready));
  host.send({ type: 'start' });
  const start = await host.next('start');
  for (const { peer } of guests) assert.deepEqual(await peer.next('start'), start);
  assert.equal(start.config.durationSeconds, 180);
  assert.deepEqual(start.players.map(p => p.team), ['blue', 'red', 'red', 'blue']);
  host.send({ type: 'team-partner', playerId: one.id });
  assert.equal((await host.next('error')).code, 'lobby_only');
  host.send({ type: 'world', runId: start.runId, seq: 0,
    snapshot: snapshot(start.players.map(p => participant(p, { team: p.team === 'red' ? 'blue' : 'red' }))) });
  const world = await three.peer.next('world');
  assert.deepEqual(world.snapshot.participants.map(p => p.team), ['blue', 'red', 'red', 'blue']);
  three.peer.send({ type: 'pose', runId: start.runId, seq: 0, player: { ...pose(), team: 'red' } });
  assert.equal((await host.next('pose', m => m.playerId === three.id)).player.team, 'blue');
  three.peer.socket.terminate();
  await host.next('roster', m => m.players.some(p => p.id === three.id && !p.connected));
  const revived = await connect();
  revived.send({ type: 'resume', code, playerId: three.id, token: three.token });
  assert.equal((await revived.next('start')).players.find(p => p.id === three.id).team, 'blue');
});

test('four-player co-op requires four ready pilots and starts the selected scenario', async t => {
  const { connect } = await setup(t), host = await connect();
  host.send({ type: 'create', missionId: 'coop-canyon', config: { mode: 'coop', mapId: 'canyon', lives: 5 } });
  const { code } = await host.next('session');
  const guests = [];
  for (const name of ['One', 'Two', 'Three', 'Five']) {
    const peer = await connect();
    peer.send({ type: 'join', code, name });
    if (name === 'Five') assert.equal((await peer.next('error')).code, 'room_full');
    else { await peer.next('session'); guests.push(peer); }
  }
  await host.next('roster', m => m.players.length === 4);
  host.send({ type: 'start' });
  assert.equal((await host.next('error')).code, 'not_ready');
  host.send({ type: 'configure', missionId: 'coop-islands', config: { mode: 'coop', mapId: 'islands', lives: 1 } });
  await host.next('roster', m => m.missionId === 'coop-islands');
  for (const peer of guests) peer.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.every(p => p.ready));
  host.send({ type: 'start' });
  const start = await host.next('start');
  assert.equal(start.mode, 'coop'); assert.equal(start.missionId, 'coop-islands');
  assert.deepEqual(start.config, { mode: 'coop', mapId: 'islands', durationSeconds: 0, lives: 1 });
  assert.equal(start.players.length, 4);
  assert.ok(start.players.every(p => !p.team));
});

test('arena identities, loadouts, run sequences and player lives survive death and authenticated recovery', async t => {
  const { app, connect, host, guest, hostSession, guestSession, start } = await arena(t);
  const room = app.rooms.get(hostSession.code), runId = start.runId;
  const hp = start.players.find(p => p.id === hostSession.id), gp = start.players.find(p => p.id === guestSession.id);
  let state = [participant(hp), participant(gp)];

  guest.send({ type: 'pose', runId, seq: 0, playerId: hostSession.id,
    player: { ...pose(1, 'f22'), kills: 999, targetId: hostSession.id, radarOn: true, hover: false, brake: false } });
  const relayed = await host.next('pose');
  assert.equal(relayed.playerId, guestSession.id); assert.equal(relayed.player.aircraft, 'camel');
  assert.equal(relayed.player.kills, undefined); assert.equal(relayed.player.lifeId, 1);
  assert.equal(relayed.player.targetId, hostSession.id); assert.equal(relayed.player.radarOn, true);
  guest.send({ type: 'action', runId, seq: 0, lifeId: 1, actionId: 'forged', playerId: hostSession.id,
    action: { name: 'fire', killerId: hostSession.id, damage: 9999 }, player: pose(1, 'f22') });
  const shot = await host.next('action');
  assert.deepEqual(shot.action, { name: 'fire' }); assert.equal(shot.playerId, guestSession.id);
  assert.equal(shot.player.aircraft, 'camel'); assert.equal(shot.player.id, guestSession.id);
  assert.match(shot.actionId, new RegExp(`^${runId}:\\d+$`)); assert.equal(shot.lifeId, 1);
  guest.send({ type: 'action', runId, seq: 0, lifeId: 1, action: 'fire' });
  assert.equal((await guest.next('error')).code, 'stale_sequence');
  guest.send({ type: 'action', runId: 'old-sortie', seq: 1, lifeId: 1, action: 'fire' });
  assert.equal((await guest.next('error')).code, 'stale_run');
  guest.send({ type: 'pose', runId: 'old-sortie', seq: 1, player: pose() });
  assert.equal((await guest.next('error')).code, 'stale_run');
  guest.send({ type: 'world', runId, seq: 0, snapshot: snapshot(state.map(p => ({ ...p, kills: 999 }))) });
  assert.equal((await guest.next('error')).code, 'host_only');

  host.send({ type: 'world', runId, seq: 0, snapshot: snapshot(state) });
  await guest.next('world', m => m.seq === 0);
  guest.send({ type: 'pose', runId, seq: 1, player: { ...pose(1), health: 9999 } });
  assert.equal((await host.next('pose', m => m.seq === 1)).player.health, AIRCRAFT.camel.health, 'movement cannot overwrite host-owned health');

  state = [participant(hp, { alive: false, health: 0, deaths: 1, respawnAt: 5 }), participant(gp, { kills: 1 })];
  host.send({ type: 'world', runId, seq: 1, snapshot: snapshot(state) });
  assert.equal((await guest.next('world', m => m.seq === 1)).snapshot.participants[0].alive, false);
  assert.equal(room.phase, 'flying'); assert.equal(room.paused, false); assert.equal(host.socket.readyState, WebSocket.OPEN);
  guest.send({ type: 'action', runId, seq: 1, lifeId: 1, action: 'fire' });
  const nextShot = await host.next('action', m => m.seq === 1);
  assert.notEqual(nextShot.actionId, shot.actionId, 'host death does not disable its authority or duplicate a shot identity');

  await delay(110);
  state[0] = participant(hp, { lifeId: 2, deaths: 1, pose: pose(2) });
  host.send({ type: 'world', runId, seq: 2, snapshot: snapshot(state) }); await guest.next('world', m => m.seq === 2);
  host.send({ type: 'pose', runId, seq: 0, player: pose(1) });
  assert.equal((await host.next('error')).code, 'stale_life');
  host.send({ type: 'pose', runId, seq: 0, player: pose(2) });
  assert.equal((await guest.next('pose')).player.lifeId, 2);

  await delay(110);
  state[1] = participant(gp, { alive: false, health: 0, deaths: 1, kills: 1, respawnAt: 7 });
  host.send({ type: 'world', runId, seq: 3, snapshot: snapshot(state) }); await guest.next('world', m => m.seq === 3);
  guest.send({ type: 'action', runId, seq: 2, lifeId: 1, action: 'fire' });
  assert.equal((await guest.next('error')).code, 'pilot_down');
  guest.send({ type: 'action', runId, seq: 2, lifeId: 1, action: 'respawn' });
  assert.equal((await host.next('action', m => m.seq === 2)).action, 'respawn');
  assert.equal(room.participants.get(guestSession.id).alive, false, 'respawn is an intention; only the host can grant a new life');
  await delay(110);
  state[1] = participant(gp, { lifeId: 2, deaths: 1, kills: 1, pose: pose(2, 'camel') });
  host.send({ type: 'world', runId, seq: 4, snapshot: snapshot(state) }); await guest.next('world', m => m.seq === 4);
  guest.send({ type: 'pose', runId, seq: 2, player: pose(1) });
  assert.equal((await guest.next('error')).code, 'stale_life');
  guest.send({ type: 'pose', runId, seq: 2, player: pose(2) });
  assert.equal((await host.next('pose', m => m.seq === 2)).player.lifeId, 2);
  guest.send({ type: 'action', runId, seq: 3, lifeId: 1, action: 'crash' });
  assert.equal((await guest.next('error')).code, 'stale_life');

  guest.socket.terminate();
  await host.next('roster', m => m.players.some(p => p.id === guestSession.id && !p.connected));
  const recovered = await connect();
  recovered.send({ type: 'resume', code: hostSession.code, playerId: guestSession.id, token: guestSession.token });
  const recoveredSession = await recovered.next('session');
  assert.equal(recoveredSession.lifeId, 2); assert.equal(recoveredSession.actionSeq, 2);
  assert.equal(recoveredSession.aircraft, 'camel'); assert.equal((await recovered.next('start')).runId, runId);
  const restored = await recovered.next('world');
  assert.equal(restored.snapshot.participants[1].kills, 1); assert.equal(restored.snapshot.participants[1].deaths, 1);
  recovered.send({ type: 'action', runId, seq: 2, lifeId: 2, action: 'respawn' });
  assert.equal((await recovered.next('error')).code, 'stale_sequence');
  const late = await connect(); late.send({ type: 'join', code: hostSession.code, name: 'Late' });
  assert.equal((await late.next('error')).code, 'flight_in_progress');
});

test('browser clients configure rounds and individual loadouts, return together to the same lobby, and invalidate old sorties', async t => {
  const { app, url } = await setup(t);
  const hostStarts = [], guestStarts = [], hostLobbies = [], guestLobbies = [], hostErrors = [], worlds = [];
  const host = new SquadronClient({ url, onStart: m => hostStarts.push(m), onLobby: m => hostLobbies.push(m), onStatus: (status, message) => { if (status === 'error') hostErrors.push(message); } });
  const guest = new SquadronClient({ url, onStart: m => guestStarts.push(m), onLobby: m => guestLobbies.push(m), onWorld: m => worlds.push(m) });
  t.after(() => { host.leave(); guest.leave(); });
  assert.equal(await host.create('Host', 'arena-islands', { mode: 'freeflight', mapId: 'islands', aircraft: 'c47', startMode: 'carrier' }), true);
  assert.equal(await guest.join(host.code, 'Guest', { aircraft: 'harrier', startMode: 'runway' }), true);
  assert.equal(host.configure({ mode: 'dogfight', mapId: 'canyon', durationSeconds: 1200, lives: 5 }), true);
  await until(() => guest.config?.durationSeconds === 1200 && guest.missionId === 'arena-canyon');
  guest.ready(); await until(() => host.roster.every(p => p.ready));
  guest.setLoadout('b2', 'carrier', 'hydrogen');
  await until(() => host.roster.some(p => p.id === guest.id && p.aircraft === 'b2' && !p.ready));
  guest.ready(); await until(() => host.roster.every(p => p.ready));
  host.start(); await until(() => hostStarts.length === 1 && guestStarts.length === 1);
  assert.deepEqual(hostStarts[0], guestStarts[0]);
  assert.deepEqual(hostStarts[0].players.map(p => [p.aircraft, p.startMode]), [['c47', 'carrier'], ['b2', 'carrier']]);
  assert.equal(guest.payload, 'hydrogen');
  assert.equal(hostStarts[0].players.find(p => p.id === guest.id).payload, 'hydrogen');
  const firstRun = hostStarts[0].runId;
  host.sendWorld(snapshot(hostStarts[0].players.map(p => participant(p))));
  await until(() => worlds.length === 1);
  assert.equal(guest.sendPose(pose(1, 'b2')), true);
  await until(() => host.samplePlayers().some(p => p.id === guest.id));
  assert.equal(host.samplePlayers()[0].aircraft, 'b2');

  assert.equal(guest.returnToLobby(), false);
  assert.equal(host.returnToLobby(), true);
  assert.equal(host.sendWorld(snapshot(hostStarts[0].players.map(p => participant(p)))), false, 'the previous round cannot send a throttled world during the lobby transition');
  assert.equal(host.sendPose(pose()), false);
  await until(() => hostLobbies.length === 1 && guestLobbies.length === 1 && guest.roomState === 'lobby');
  assert.equal(host.connected, true); assert.equal(guest.connected, true); assert.equal(host.code, guest.code);
  assert.equal(app.rooms.size, 1); assert.equal(guest.roster.find(p => p.id === guest.id).ready, false);
  assert.equal(guest.sendAction('fire'), false);
  host.configure({ mode: 'freeflight', mapId: 'islands', durationSeconds: 0 });
  await until(() => guest.mode === 'freeflight');
  guest.setLoadout('camel', 'airborne');
  await until(() => host.roster.find(p => p.id === guest.id)?.aircraft === 'camel');
  guest.ready(); await until(() => host.roster.every(p => p.ready));
  await delay(1005);
  host.start(); await until(() => hostStarts.length === 2 && guestStarts.length === 2);
  assert.notEqual(hostStarts[1].runId, firstRun); assert.equal(hostStarts[1].config.durationSeconds, 0);
  host._ws.send(JSON.stringify({ type: 'world', runId: firstRun, seq: 900, snapshot: snapshot(hostStarts[0].players.map(p => participant(p))) }));
  await until(() => hostErrors.some(message => /earlier sortie/.test(message)));
  assert.equal(app.rooms.get(host.code).worldSeq, -1, 'a delayed prior-round world cannot win against the new round');
  assert.equal(host.sendWorld(snapshot(hostStarts[1].players.map(p => participant(p)))), true);
  await until(() => worlds.length === 2);
  assert.equal(worlds.at(-1).participants.find(p => p.id === guest.id).aircraft, 'camel');
});

test('ordinary co-op supports selected aircraft and mission lives while AC-130 keeps its shared two-seat model', async t => {
  const { connect } = await setup(t), host = await connect(), guest = await connect();
  host.send({ type: 'create', missionId: 'first-light', config: { mode: 'squadron', lives: 5 }, aircraft: 'f15', startMode: 'carrier' });
  const hs = await host.next('session');
  guest.send({ type: 'join', code: hs.code, aircraft: 'camel', startMode: 'airborne' });
  const gs = await guest.next('session');
  assert.equal(gs.mode, 'squadron'); assert.equal(gs.config.lives, 5); assert.equal(gs.aircraft, 'camel');
  guest.send({ type: 'configure', config: { lives: 1 } });
  assert.equal((await guest.next('error')).code, 'host_only');
  guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 2 && m.players.every(p => p.ready));
  host.send({ type: 'configure', config: { lives: 1 } });
  const changed = await guest.next('roster', m => m.config.lives === 1);
  assert.equal(changed.players.find(p => p.id === gs.id).ready, false);
  assert.equal(changed.players.find(p => p.id === hs.id).aircraft, 'f15');
  host.send({ type: 'mission', missionId: 'gunship-nightwatch' });
  const crew = await guest.next('roster', m => m.mode === 'crew');
  assert.equal(crew.maxPlayers, 2); assert.ok(crew.players.every(p => p.aircraft === 'ac130'));
  assert.equal(crew.players.find(p => p.id === gs.id).role, 'gunner');
  guest.send({ type: 'loadout', aircraft: 'f22', startMode: 'carrier' });
  assert.equal((await guest.next('error')).code, 'crew_aircraft');
  guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.mode === 'crew' && m.players.every(p => p.ready));
  host.send({ type: 'start', missionId: 'gunship-nightwatch' });
  const start = await host.next('start'); await guest.next('start');
  host.send({ type: 'pose', runId: start.runId, seq: 0, player: pose(1, 'f22') });
  assert.equal((await guest.next('pose')).player.aircraft, 'ac130');
  guest.send({ type: 'crew-input', runId: start.runId, seq: 0, input: { seat: '105mm', yaw: 0, pitch: 0, fire: true } });
  assert.equal((await host.next('crew-input', m => m.seq === 0)).playerId, gs.id);
});

test('a guest cannot opt out of run and life validation in a modern ordinary squadron', async t => {
  const { connect } = await setup(t), host = await connect(), guest = await connect({ modern: false });
  host.send({ type: 'create', missionId: 'first-light', aircraft: 'f16' });
  const hs = await host.next('session');
  guest.send({ type: 'join', code: hs.code, aircraft: 'camel' }); await guest.next('session');
  guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 2 && m.players.every(p => p.ready));
  host.send({ type: 'start', missionId: 'first-light' });
  const { runId } = await host.next('start'); await guest.next('start');
  guest.send({ type: 'pose', seq: 0, player: pose() });
  assert.equal((await guest.next('error')).code, 'stale_run');
  const { lifeId, ...withoutLife } = pose();
  guest.send({ type: 'pose', runId, seq: 0, player: withoutLife });
  assert.equal((await guest.next('error')).code, 'stale_life');
  guest.send({ type: 'pose', runId, seq: 0, player: pose() }); await host.next('pose');
  guest.send({ type: 'action', runId, lifeId: 1, action: 'fire' });
  assert.equal((await guest.next('error')).code, 'stale_sequence');
  guest.send({ type: 'action', runId, lifeId: 1, seq: 0, action: 'fire' });
  assert.equal((await host.next('action')).player.aircraft, 'camel');
});

test('actual guest gunfire earns one host-verified kill, host death preserves the round, and respawn reaches both simulations', async t => {
  const { app, url } = await setup(t);
  let hostSim, guestSim;
  const actions = [], errors = [];
  const host = new SquadronClient({ url,
    onStart: start => { hostSim = new FlightSimulation(createArenaMission(start.config, 'f16'), { playerId: host.id }).configureMultiplayer({ ...start, playerId: host.id }); },
    onAction: message => {
      const accepted = hostSim.applyRemoteAction(message.action, message.player, message);
      actions.push({ ...message, accepted }); host.sendWorld(hostSim.getSnapshot());
    },
    onStatus: (state, message) => { if (state === 'error') errors.push(message); },
  });
  const guest = new SquadronClient({ url,
    onStart: start => { guestSim = new FlightSimulation(createArenaMission(start.config, 'camel'), { playerId: guest.id }).configureMultiplayer({ ...start, playerId: guest.id }); },
    onWorld: world => guestSim.applySnapshot(world),
    onStatus: (state, message) => { if (state === 'error') errors.push(message); },
  });
  t.after(() => { host.leave(); guest.leave(); });
  await host.create('Host jet', 'arena-islands', { mode: 'dogfight', mapId: 'islands', durationSeconds: 300, aircraft: 'f16', startMode: 'airborne' });
  await guest.join(host.code, 'Guest biplane', { aircraft: 'camel', startMode: 'airborne' });
  guest.ready(); await until(() => host.roster.length === 2 && host.roster.every(p => p.ready));
  host.start(); await until(() => hostSim && guestSim);
  assert.equal(guestSim.worldAuthority, false); assert.equal(hostSim.worldAuthority, true);
  guest.sendPose(guestSim.player); await until(() => host.samplePlayers().some(p => p.id === guest.id));
  hostSim.setRemotePlayers(host.samplePlayers());
  const source = hostSim.participants.get(guest.id).pose, forward = basis(source.orientation).forward;
  const putHostOnGunLine = distance => Object.assign(hostSim.player, {
    x: source.x + forward.x * distance, y: source.y + forward.y * distance, z: source.z + forward.z * distance,
    heading: source.heading, pitch: source.pitch, roll: source.roll,
    orientation: orientationFromEuler(source.heading, source.pitch, source.roll),
  });
  putHostOnGunLine(400);
  host.sendWorld(hostSim.getSnapshot());
  await until(() => guestSim.participants.get(host.id)?.pose.x === hostSim.player.x);

  for (let i = 0; i < 12 && hostSim.localParticipant.alive; i++) {
    putHostOnGunLine(400);
    const before = actions.length;
    assert.equal(guest.sendAction('fire'), true);
    await until(() => actions.length > before);
    assert.equal(actions.at(-1).accepted, true, 'the host resolves the real relayed gun action');
    for (let step = 0; step < 3; step++) hostSim.step(.05);
    await delay(115);
  }
  host.sendWorld(hostSim.getSnapshot());
  await until(() => guestSim.participants.get(host.id)?.alive === false);
  assert.equal(hostSim.localParticipant.deaths, 1); assert.equal(hostSim.participants.get(guest.id).kills, 1);
  assert.equal(hostSim.status, 'flying'); assert.equal(guestSim.status, 'flying');
  assert.equal(app.rooms.get(host.code).phase, 'flying'); assert.equal(host.connected, true);
  assert.ok(actions.every(action => action.player.aircraft === 'camel' && action.actionId.startsWith(hostSim.multiplayer.runId)));
  const lastShot = actions.at(-1);
  assert.equal(hostSim.applyRemoteAction(lastShot.action, lastShot.player, lastShot), false, 'the same server shot identity cannot score twice');

  for (let step = 0; step < 82; step++) hostSim.step(.05);
  assert.equal(hostSim.requestRespawn(), true);
  host.sendWorld(hostSim.getSnapshot());
  await until(() => guestSim.participants.get(host.id)?.lifeId === 2);
  for (let shot = 0; shot < 9 && hostSim.participants.get(guest.id).alive; shot++) {
    putHostOnGunLine(-400);
    assert.equal(hostSim.action('fire'), true);
    for (let step = 0; step < 2; step++) hostSim.step(.05);
  }
  host.sendWorld(hostSim.getSnapshot());
  await until(() => guestSim.localParticipant.alive === false);
  assert.equal(hostSim.localParticipant.kills, 1); assert.equal(guestSim.localParticipant.deaths, 1);
  const beforeRespawn = actions.length;
  assert.equal(guest.sendAction('respawn'), true);
  await until(() => actions.length > beforeRespawn);
  assert.equal(actions.at(-1).accepted, false, 'a peer cannot bypass the host respawn cooldown');
  for (let step = 0; step < 82; step++) hostSim.step(.05);
  await delay(210);
  assert.equal(guest.sendAction('respawn'), true);
  await until(() => guestSim.player.lifeId === 2);
  assert.equal(guestSim.localParticipant.alive, true); assert.equal(guestSim.player.aircraft, 'camel');
  assert.equal(guestSim.localParticipant.kills, 1); assert.equal(guestSim.localParticipant.deaths, 1);
  assert.equal(guest.sendPose(guestSim.player), true);
  await until(() => host.samplePlayers().some(p => p.id === guest.id && p.lifeId === 2));
  hostSim.setRemotePlayers(host.samplePlayers());
  assert.equal(hostSim.participants.get(guest.id).lifeId, 2);

  hostSim.time = 299.99; hostSim.step(.02); host.sendWorld(hostSim.getSnapshot());
  await until(() => guestSim.round.ended);
  assert.equal(hostSim.status, 'success'); assert.equal(guestSim.status, 'success');
  assert.equal(guestSim.round.remaining, 0); assert.equal(guestSim.scoreboard.length, 2);
  assert.ok(guestSim.scoreboard.every(row => row.kills === 1 && row.deaths === 1));
  assert.deepEqual(errors, [], 'the actual combat snapshots satisfy the relay bounds and life protocol');
});

test('nuclear loadouts are B-2 only, reset readiness, and cannot change through flight packets', async t => {
  const { connect } = await setup(t), host = await connect(), guest = await connect();
  host.send({ type: 'create', name: 'Lead', missionId: 'arena-islands', config: { mode: 'dogfight', mapId: 'islands', durationSeconds: 300 }, aircraft: 'b2', startMode: 'high', payload: 'tsar' });
  const hs = await host.next('session');
  assert.equal(hs.payload, 'tsar'); assert.equal(hs.startMode, 'high');
  guest.send({ type: 'join', code: hs.code, aircraft: 'f16', payload: 'hydrogen' });
  assert.equal((await guest.next('error')).code, 'bad_loadout');
  guest.send({ type: 'join', code: hs.code, aircraft: 'b2', payload: 'hydrogen' });
  const gs = await guest.next('session'); assert.equal(gs.payload, 'hydrogen');
  guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 2 && m.players.every(p => p.ready));
  guest.send({ type: 'loadout', aircraft: 'b2', startMode: 'high', payload: 'atomic' });
  await host.next('roster', m => m.players.some(p => p.id === gs.id && p.payload === 'atomic' && !p.ready));
  guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 2 && m.players.every(p => p.ready));
  host.send({ type: 'start' });
  const start = await host.next('start'); await guest.next('start');
  assert.deepEqual(start.players.map(p => p.payload), ['tsar', 'atomic']);
  guest.send({ type: 'pose', runId: start.runId, seq: 0, player: { ...pose(1, 'b2'), payload: 'tsar' } });
  const position = await host.next('pose'); assert.equal(position.player.payload, 'atomic');
  guest.send({ type: 'action', runId: start.runId, seq: 0, lifeId: 1, action: { name: 'payload', payload: 'tsar', damage: 99999 } });
  const release = await host.next('action');
  assert.deepEqual(release.action, { name: 'payload' }); assert.equal(release.player.payload, 'atomic');
  guest.send({ type: 'loadout', aircraft: 'b2', payload: 'tsar' });
  assert.equal((await guest.next('error')).code, 'loadout_locked');
});
