import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from '../vendor/ws/wrapper.mjs';
import { createSkywardServer, PROTOCOL_VERSION } from '../server.mjs';
import { SquadronClient } from '../public/network.mjs';
import {orientationFromEuler,deriveEuler,basis} from '../public/orientation.mjs';

class Peer {
  constructor(url, options) {
    this.socket = new WebSocket(url, options);
    this.messages = []; this.waiters = [];
    this.socket.on('error', () => {});
    this.socket.on('message', data => {
      const msg = JSON.parse(data.toString());
      const index = this.waiters.findIndex(w => w.match(msg));
      if (index >= 0) {
        const waiter = this.waiters.splice(index, 1)[0];
        clearTimeout(waiter.timer); waiter.resolve(msg);
      } else this.messages.push(msg);
    });
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  next(type, predicate = () => true, timeout = 2500) {
    const match = msg => msg.type === type && predicate(msg);
    const index = this.messages.findIndex(match);
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error(`Timed out waiting for ${type}. Queued: ${JSON.stringify(this.messages)}`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }
  async handshake(version = PROTOCOL_VERSION) {
    await this.next('hello');
    this.send({ type: 'hello', version });
    if (version === PROTOCOL_VERSION) await this.next('welcome');
    return this;
  }
  end() { for (const w of this.waiters) clearTimeout(w.timer); this.socket.terminate(); }
}
const pose = (x = 100) => ({ x, y: 600, z: 800, heading: 0.1, pitch: 0.02, roll: 0, speed: 45, throttle: 0.7, aircraft: 'biplane', health: 100 });
async function setup(t, extra = {}) {
  const app = await createSkywardServer({ port: 0, host: '127.0.0.1', missionIds: ['first-flight', 'channel-crossing'], reconnectGraceMs: 450, tickMs: 30, ...extra });
  const peers = [];
  t.after(async () => { peers.forEach(p => p.end()); await app.close(); });
  const connect = async () => {
    const peer = new Peer(`ws://127.0.0.1:${app.port}/ws`);
    peers.push(peer); await peer.handshake(); return peer;
  };
  return { app, connect, peers };
}

// Exercise real sockets at the trust boundaries, rather than mocking the protocol.
test('four-pilot lobby, host authority, sequence ordering, mission relay and authenticated recovery', async t => {
  const { app, connect } = await setup(t);
  const health = await (await fetch(`http://127.0.0.1:${app.port}/health`)).json();
  assert.equal(health.persistence, 'memory');
  const host = await connect();
  host.send({ type: 'create', name: 'Henri', missionId: 'first-flight' });
  const hostSession = await host.next('session');
  assert.match(hostSession.code, /^[A-Z2-9]{6}$/);
  assert.equal(hostSession.isHost, true);
  const guests = [];
  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const guest = await connect();
    guest.send({ type: 'join', code: hostSession.code, name: `Wing ${i + 1}` });
    sessions.push(await guest.next('session')); guests.push(guest);
  }
  const roster = await host.next('roster', m => m.players.length === 4);
  assert.equal(roster.players.filter(p => p.isHost).length, 1);
  assert.ok(roster.players.every(p => !('token' in p) && !('socket' in p)));
  const fifth = await connect();
  fifth.send({ type: 'join', code: hostSession.code, name: 'Fifth' });
  assert.equal((await fifth.next('error')).code, 'room_full');

  guests[0].send({ type: 'start', missionId: 'channel-crossing' });
  assert.equal((await guests[0].next('error')).code, 'host_only');
  host.send({ type: 'start', missionId: 'channel-crossing' });
  assert.equal((await host.next('error')).code, 'not_ready');
  guests.forEach(g => g.send({ type: 'ready', ready: true }));
  await host.next('roster', m => m.players.length === 4 && m.players.every(p => p.ready));
  host.send({ type: 'start', missionId: 'channel-crossing' });
  const starts = await Promise.all([host, ...guests].map(p => p.next('start')));
  assert.ok(starts.every(s => s.missionId === 'channel-crossing' && s.seed === starts[0].seed && s.runId === starts[0].runId));

  guests[0].send({ type: 'pose', seq: 1, playerId: hostSession.id, player: { ...pose(), playerId: hostSession.id, name: 'Spoof' } });
  const relayed = await host.next('pose');
  assert.equal(relayed.playerId, sessions[0].id);
  assert.equal(relayed.player.x, 100);
  assert.equal(relayed.player.name, undefined);
  guests[0].send({ type: 'pose', seq: 1, player: pose(900) });
  assert.equal((await guests[0].next('error')).code, 'stale_sequence');
  guests[0].send({ type: 'world', seq: 2, snapshot: { status: 'success' } });
  assert.equal((await guests[0].next('error')).code, 'host_only');
  const world = { status: 'flying', enemies: [{ id: 'enemy-1', x: 200, y: 500, z: 0, health: 100 }], progress: 0.25, time: 12 };
  host.send({ type: 'world', seq: 3, snapshot: world });
  const worlds = await Promise.all(guests.map(p => p.next('world')));
  assert.ok(worlds.every(w => JSON.stringify(w.snapshot) === JSON.stringify(world)));
  host.send({ type: 'world', seq: 2, snapshot: { progress: 1 } });
  assert.equal((await host.next('error')).code, 'stale_sequence');
  guests[0].send({ type: 'action', action: 'fire', playerId: hostSession.id, player: pose(9999) });
  const shot = await host.next('action');
  assert.equal(shot.playerId, sessions[0].id);
  assert.equal(shot.player.id, sessions[0].id);
  assert.equal(shot.player.playerId, sessions[0].id);
  assert.equal(shot.player.x, 100, 'weapon actions use the stored pose, never a supplied action pose');

  fifth.send({ type: 'join', code: hostSession.code, name: 'Late' });
  assert.equal((await fifth.next('error')).code, 'flight_in_progress');
  const impostor = await connect();
  impostor.send({ type: 'resume', code: hostSession.code, playerId: hostSession.id, token: 'é'.repeat(48) });
  assert.equal((await impostor.next('error')).code, 'resume_denied');
  assert.equal(app.rooms.size, 1, 'malformed tokens do not crash the relay');

  guests[0].socket.terminate();
  await host.next('roster', m => m.players.some(p => p.id === sessions[0].id && !p.connected));
  const reconnected = await connect();
  reconnected.send({ type: 'resume', code: hostSession.code, playerId: sessions[0].id, token: sessions[0].token });
  assert.equal((await reconnected.next('session')).id, sessions[0].id);
  assert.equal((await reconnected.next('start')).runId, starts[0].runId);
  assert.deepEqual((await reconnected.next('world')).snapshot, world);
  reconnected.send({ type: 'pose', seq: 1, player: pose() });
  assert.equal((await reconnected.next('error')).code, 'stale_sequence', 'reconnection cannot reset the sequence guard');

  host.socket.terminate();
  await reconnected.next('pause');
  reconnected.send({ type: 'pose', seq: 4, player: pose() });
  assert.equal((await reconnected.next('error')).code, 'host_reconnecting');
  const recoveredHost = await connect();
  recoveredHost.send({ type: 'resume', code: hostSession.code, playerId: hostSession.id, token: hostSession.token });
  assert.equal((await recoveredHost.next('session')).isHost, true);
  assert.equal((await recoveredHost.next('start')).runId, starts[0].runId);
  await reconnected.next('resume-play');
  const replacement = await connect();
  replacement.send({ type: 'resume', code: hostSession.code, playerId: sessions[0].id, token: sessions[0].token });
  assert.equal((await replacement.next('session')).id, sessions[0].id);
  await reconnected.next('replaced');
  recoveredHost.socket.terminate();
  await replacement.next('pause');
  const end = await replacement.next('end');
  assert.match(end.message, /host could not reconnect/i);
  assert.equal(app.rooms.size, 0);
});

test('protocol, origin, payload limits and invalid flight values are rejected', async t => {
  const { app, connect, peers } = await setup(t);
  const base = `http://127.0.0.1:${app.port}`;
  const staticResponses = await Promise.all(['/', '/network.mjs', '/server.mjs', '/%2e%2e%2fserver.mjs', '/%2e%2e%2fpackage.json'].map(path => fetch(base + path)));
  assert.equal(staticResponses[0].status, 200);
  assert.match(staticResponses[0].headers.get('content-type'), /text\/html/);
  assert.equal(staticResponses[1].status, 200);
  assert.match(staticResponses[1].headers.get('content-type'), /javascript/);
  assert.ok(staticResponses.slice(2).every(response => response.status === 404), 'server sources and encoded parent paths are not public');
  await Promise.all(staticResponses.map(response => response.arrayBuffer()));
  const originSocket = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin: 'https://unrelated.example' });
  originSocket.on('error', () => {});
  const [originError] = await once(originSocket, 'error');
  assert.match(originError.message, /403/);
  const old = new Peer(`ws://127.0.0.1:${app.port}/ws`); peers.push(old);
  await old.handshake(99);
  assert.equal((await old.next('error')).code, 'version_mismatch');
  const host = await connect();
  host.send({ type: 'create', name: 'Test', missionId: 'unknown-mission' });
  assert.equal((await host.next('error')).code, 'bad_mission');
  host.send({ type: 'create', name: '<test>', missionId: 'first-flight' });
  const room = await host.next('session');
  host.send({ type: 'start', missionId: 'first-flight' });
  assert.equal((await host.next('error')).code, 'need_wingmate');
  const guest = await connect();
  guest.send({ type: 'join', code: room.code, name: 'Wing' });
  await guest.next('session'); guest.send({ type: 'ready', ready: true });
  await host.next('roster', m => m.players.length === 2 && m.players.every(p => p.ready));
  host.send({ type: 'start', missionId: 'first-flight' }); await host.next('start');
  guest.send({ type: 'pose', seq: 1, player: pose(1e200) });
  assert.equal((await guest.next('error')).code, 'bad_pose');
  guest.send({ type: 'pose', seq: 2, player: { ...pose(), x: null } });
  assert.equal((await guest.next('error')).code, 'bad_pose');
  host.send({ type: 'world', seq: 1, snapshot: { enemies: Array(513).fill({ x: 0 }) } });
  assert.equal((await host.next('error')).code, 'bad_world');
  const closed = once(guest.socket, 'close');
  guest.socket.send('x'.repeat(70 * 1024));
  assert.equal((await closed)[0], 1009);
});

test('browser client speaks the real protocol and interpolates short angular paths', async t => {
  const { app } = await setup(t, { reconnectGraceMs: 4000 });
  const url = `ws://127.0.0.1:${app.port}/ws`;
  let hostStarted, guestStarted, action;
  const worlds = [];
  const host = new SquadronClient({ url, onStart: s => { hostStarted = s; }, onAction: a => { action = a; } });
  const guest = new SquadronClient({ url, onStart: s => { guestStarted = s; }, onWorld: world => worlds.push(world) });
  t.after(() => { host.leave(); guest.leave(); });
  async function until(predicate) {
    const deadline = Date.now() + 2500;
    while (!predicate() && Date.now() < deadline) await delay(15);
    assert.ok(predicate(), 'condition settled before deadline');
  }
  assert.equal(await host.create('Host', 'first-flight'), true);
  assert.equal(await guest.join(host.code, 'Wing'), true);
  guest.ready(true); await until(() => host.roster.length === 2 && host.roster.every(p => p.ready));
  assert.equal(host.start('first-flight'), true);
  await until(() => hostStarted && guestStarted);
  assert.deepEqual(hostStarted, guestStarted);
  assert.equal(guest.sendPose(pose()), true);
  assert.equal(guest.sendPose(pose(101)), false, 'render-loop updates are limited to 15 Hz');
  await until(() => host.samplePlayers().length === 1);
  guest.sendAction('fire'); await until(() => action);
  assert.equal(action.playerId, guest.id);
  assert.equal(action.player.id, guest.id);
  assert.equal(guest.sendAction({ name: 'missile', targetId: 'enemy-1', playerId: host.id }), true, 'a discrete weapon command is not dropped while the gun is held');
  await until(() => action.action?.name === 'missile');
  assert.deepEqual(action.action, { name: 'missile', targetId: 'enemy-1' }, 'action metadata is bounded and identity cannot be supplied');
  assert.equal(action.player.id, guest.id);
  host.sendWorld({ status: 'flying', progress: 0.9 });
  host.sendWorld({ status: 'success', progress: 1, teamPaused: false });
  await until(() => worlds.some(world => world.status === 'success'));
  assert.equal(worlds.at(-1).progress, 1, 'the final throttled snapshot flushes without another render-loop call');
  await until(() => Number.isFinite(host.latency));

  // A sequence crossing +/- pi must interpolate through the nearby angle.
  const stamp = Date.now();
  host._clockOffset = 0;
  host._histories.set(guest.id, [
    { at: stamp - 200, seq: 5, player: { ...pose(0), heading: Math.PI - 0.1 } },
    { at: stamp, seq: 6, player: { ...pose(20), heading: -Math.PI + 0.1 } }
  ]);
  const sample = host.samplePlayers()[0];
  assert.ok(Math.abs(Math.abs(sample.heading) - Math.PI) < 0.03);
  assert.ok(sample.x >= 9 && sample.x <= 12);
});

test('remote aircraft interpolate through vertical flight without an Euler-axis detour', () => {
  const client=new SquadronClient({url:'ws://unused'}),stamp=Date.now();
  client.roster=[{id:'wing',connected:true,name:'Wing'}];
  const first=orientationFromEuler(0,Math.PI/2-.2,0),last=orientationFromEuler(0,Math.PI/2+.2,0);
  client._histories.set('wing',[
    {at:stamp-200,player:{...pose(),...deriveEuler(first)}},
    {at:stamp,player:{...pose(),...deriveEuler(last)}}
  ]);
  const sample=client.samplePlayers()[0],axes=basis(sample.orientation);
  assert.ok(axes.forward.y>.999,'the interpolated nose passes directly through vertical');
  assert.ok(Math.abs(axes.forward.x)<1e-8,'a loop does not acquire a sideways yaw from Euler branch changes');
  assert.ok(axes.right.x<-.999,'the wings keep their physical orientation through the pole');
  assert.equal(sample.extrapolated,false);
});

test('remote rotation prediction stays on the same body arc and stops after the extrapolation budget', () => {
  const client=new SquadronClient({url:'ws://unused'}),stamp=Date.now();
  client.roster=[{id:'wing',connected:true,name:'Wing'}];
  client._histories.set('wing',[
    {at:stamp-500,player:{...pose(),...deriveEuler(orientationFromEuler(0,Math.PI/2-.2,0))}},
    {at:stamp-400,player:{...pose(),...deriveEuler(orientationFromEuler(0,Math.PI/2+.2,0))}}
  ]);
  const predicted=client.samplePlayers()[0],axes=basis(predicted.orientation);
  const expected=basis(orientationFromEuler(0,Math.PI/2+.5,0));
  for(const axis of ['forward','up','right'])for(const component of ['x','y','z'])assert.ok(Math.abs(axes[axis][component]-expected[axis][component])<1e-8);
  assert.equal(predicted.extrapolated,true);
  client._clockOffset=10000;
  assert.deepEqual(client.samplePlayers()[0].orientation,predicted.orientation,'a stale connection cannot continue tumbling the plane');
});
