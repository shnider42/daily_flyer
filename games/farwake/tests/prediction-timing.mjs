import { FarwakeNetwork } from '../dist/network.mjs';
import { advanceShip, getShipClass } from '../dist/fleet.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angularDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const epoch = 1700000000000;
const coast = { thrust: 0, strafe: 0, turn: 0, flightAssist: false };

export function maneuver(t) {
  if (t < .253) return coast;
  if (t < 1.417) return { ...coast, thrust: 1 };
  if (t < 2.683) return { ...coast, thrust: 1, turn: .8 };
  if (t < 3.537) return { ...coast, strafe: -.8, turn: -.5 };
  if (t < 4.721) return { ...coast, thrust: .8, turn: .35 };
  if (t < 5.283) return { ...coast, brake: true };
  if (t < 6.367) return { ...coast, thrust: 1, turn: -.6 };
  return { ...coast, strafe: .7, turn: .5 };
}

/** Real transport/prediction methods under a deterministic event clock; no timers or sockets. */
export function timingScenario({ fps = 60, rtt = 120, jitter = 24, seconds = 8, inputAt = () => coast, moving = true } = {}) {
  let time = 0, serial = 0, appliedSeq = 0, lastTickAt = 0;
  let ship = { ...getShipClass('sparrow').stats, classId: 'sparrow', x: -800, y: 0, vx: moving ? 200 : 0, vy: 0, angle: 0, angularVelocity: 0, energy: 100 };
  let input = inputAt(0), rendered = null;
  const frames = [], corrections = [], queue = [], network = new FarwakeNetwork({ url: 'http://test', storage: null, autoReconnect: false, now: () => time, wallNow: () => epoch + time });
  const schedule = (at, priority, run) => queue.push({ at, priority, run, id: serial++ });
  const latency = (i, up) => rtt / 2 + jitter * [.2, -.75, .55, -.15, .95, -.45, .4, -.95][(i + (up ? 0 : 3)) % 8];
  const snapshot = tick => ({ tick, serverTime: epoch + time, simulatedAt: epoch + lastTickAt, ack: appliedSeq, state: { seed: 'timing', mode: 'ship', systemId: 'test', ship: { ...ship } }, room: { id: 'system:test', kind: 'system' }, world: {}, remoteShips: [], players: [], events: [] });
  network.connected = true;
  network._send = packet => { if (packet.type === 'input') schedule(time + latency(packet.seq, true), 0, () => { if (packet.seq > appliedSeq) { appliedSeq = packet.seq; input = packet.input; } }); return true; };
  network._snapshot(snapshot(0), true);
  for (let n = 1; n <= fps * seconds; n++) schedule(n * 1000 / fps, 10, () => {
    const controls = inputAt(time / 1000); network.setInput(controls, 1 / fps);
    const pose = network.predictShip(1 / fps, controls), truth = advanceShip(ship, (time - lastTickAt) / 1000, input);
    if (rendered && time >= 1000) {
      const uninterrupted = advanceShip(rendered, 1 / fps, controls);
      frames.push({ error: distance(pose, truth), correction: distance(pose, uninterrupted), angularCorrection: angularDistance(pose.angle, uninterrupted.angle) });
    }
    rendered = pose;
  });
  for (let n = 1; n <= seconds * 20; n++) schedule(n * 50, 20, () => network._sendInput());
  for (let n = 1; n <= seconds * 30; n++) schedule(n * 1000 / 30, 5, () => {
    ship = advanceShip(ship, 1 / 30, input); lastTickAt = time;
    if (n % 3 === 0) { const packet = snapshot(n); schedule(time + latency(n / 3, false), 0, () => {
      let continued = { ...network.predictedShip };
      for (const frame of network.inputFrames(network.predictedAt, time)) continued = advanceShip(continued, frame.dt, frame.input);
      const decay = Math.exp(-(time - network.visualAt) / 1000 * 14), before = { x: continued.x + network.visualOffset.x * decay, y: continued.y + network.visualOffset.y * decay, angle: continued.angle + network.visualOffset.angle * decay };
      network._snapshot(packet);
      if (time >= 1000) corrections.push({ position: distance(before, network.renderedShip), angle: angularDistance(before.angle, network.renderedShip.angle) });
    }); }
  });
  while (queue.length) {
    queue.sort((a, b) => Math.round((a.at - b.at) * 1e6) || a.priority - b.priority || a.id - b.id);
    const event = queue.shift(); time = event.at; if (time > seconds * 1000) break; event.run();
  }
  const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  return {
    authorityErrorRms: rms(frames.map(f => f.error)), frameCorrectionRms: rms(frames.map(f => f.correction)),
    maxFrameCorrection: Math.max(...frames.map(f => f.correction)), maxAngularFrameCorrection: Math.max(...frames.map(f => f.angularCorrection)),
    maxPositionDiscontinuity: Math.max(...corrections.map(f => f.position)), maxAngleDiscontinuity: Math.max(...corrections.map(f => f.angle))
  };
}
