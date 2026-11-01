// Local integration check for the expanded Shadow expedition. Fixture setup only
// moves authoritative actors: equipment, power, jumps, puzzle actions, and retries
// all go through normal browser controls / room protocol. No production hooks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { createBreachServer } from '../server/breach-server.mjs';
import { SHADOW_WORLD_REVISION, courseStatus } from '../daily_flyer/themes/breach_assets/shadow.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, process.env.BREACH_BROWSER_OUTPUT || 'breach-shadow-results');
await mkdir(out, { recursive: true });
execFileSync(process.env.BREACH_BROWSER_PYTHON || 'python3', ['scripts/build_breach.py'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const app = createBreachServer({ directory: resolve(root, 'dist_breach') });
await new Promise((resolveListen, rejectListen) => {
  app.server.once('error', rejectListen); app.server.listen(0, '127.0.0.1', resolveListen);
});
const base = `http://127.0.0.1:${app.server.address().port}`;
const webgl = process.env.BREACH_BROWSER_WEBGL === '1';
const executablePath = process.env.BREACH_BROWSER_EXECUTABLE || undefined;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}),
  args: webgl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-webgl'] });
const context = await browser.newContext({ viewport: { width: 926, height: 428 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const results = [], errors = [], guestErrors = [];
let expectedFallbackNotices = 0;
let guest, stream, room, run, guestRoom, lastGuestState, guestSeq = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() !== 'error') return;
  // A forced software build probes WebGL whenever a scene is mounted. Only the
  // two exact capability-probe messages are expected; rendering errors still fail.
  if (!webgl && (/^THREE\.WebGLRenderer: Error creating WebGL context\.?$/.test(message.text())
    || /^THREE\.WebGLRenderer: A WebGL context could not be created\. Reason:  disabled by enterprise policy or commandline switch$/.test(message.text()))) {
    expectedFallbackNotices++; return;
  }
  errors.push(message.text());
});
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
async function until(predicate, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await sleep(25); }
  throw new Error(message);
}
const host = () => run.state.players.p1;
const partner = () => run.state.players.p2;
const feature = id => run.state.interactables.find(o => o.id === id);
const send = message => guest.send(JSON.stringify(message));
const mode = expected => page.waitForFunction(value => document.body.dataset.mode === value, expected);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const near = (a, b, tolerance = .12) => Math.hypot(a.x - b.x, a.z - b.z) < tolerance;
function pass(check, extra = {}) { const result = { check, passed: true, ...extra }; results.push(result); console.log(JSON.stringify(result)); }

function publishFixture() { app.rooms.publishState(room); }
function parkEnemies() {
  // A distant ordinary floor tile keeps unrelated encounters out of this local
  // UI fixture. No health, AI phase, inventory, or progression is modified.
  for (const enemy of run.state.enemies) Object.assign(enemy, { x: 90.5, z: 25.5 });
  publishFixture();
}
async function placeHost(point) {
  await until(() => !host().jump, 'finish the preceding real jump before placing the next fixture');
  await until(() => room.players.get('p1').input.forward === 0 && room.players.get('p1').input.strafe === 0,
    'released movement reaches the authority');
  Object.assign(host(), { x: point.x, z: point.z });
  publishFixture();
  await until(() => near(lastGuestState?.players.p1 || { x: -1, z: -1 }, point), 'actor placement replicates through the room transport');
  await sleep(180);
}
async function lookAt(point) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const aim = Math.atan2(point.x - host().x, -(point.z - host().z));
    const difference = angleDelta(aim, host().angle);
    if (Math.abs(difference) < .11) return;
    const sign = Math.sign(difference), key = sign > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    try {
      await until(() => sign * angleDelta(aim, host().angle) < .07,
        'normal aim controls turn toward the authored landing', 5000);
    } finally { await page.keyboard.up(key); }
    await sleep(140);
  }
  assert.ok(Math.abs(angleDelta(Math.atan2(point.x - host().x, -(point.z - host().z)), host().angle)) < .2,
    'view faces its target using real input');
}
async function actionReady(label) {
  await until(() => Date.now() - room.players.get('p1').lastActionAt >= 110, 'normal room action guard expires');
  await page.waitForFunction(expected => {
    const button = document.getElementById('touch-interact');
    return !button.hidden && !button.disabled && button.textContent === expected;
  }, label);
}
async function useControl(id, label) {
  await until(() => run._withPlayer('p1', () => run._interactionCandidate()?.id) === id,
    `the existing contextual action selects ${id}`);
  await actionReady(label); await page.locator('#touch-interact').tap();
  await until(() => feature(id).used, `${id} is advanced by touch USE`);
  await until(() => lastGuestState?.interactables.find(o => o.id === id)?.used,
    `${id} is shared with the second operator`);
}
async function jump(id) {
  const object = feature(id);
  await lookAt(object.landing);
  await until(() => run._withPlayer('p1', () => run._interactionCandidate()?.id) === id
    && run.getInteractionInfo('p1')?.canUse, `${id} reaches its genuine launch window`, 15000);
  await actionReady('JUMP'); await page.locator('#touch-interact').tap();
  await until(() => !!host().jump, `${id} starts a real authoritative jump`);
  await until(() => !host().jump && near(host(), object.landing), `${id} lands on its authored platform`);
  await sleep(120);
}
async function collectRack(id, ownershipKey) {
  const rack = run.state.pickups.find(item => item.id === id);
  await placeHost({ x: rack.x, z: rack.z + .9 }); await lookAt(rack);
  assert.equal(rack.collected, false, 'fixture starts outside collection range');
  await page.keyboard.down('w');
  try { await until(() => rack.collected, `${id} is collected by actual movement`, 5000); }
  finally { await page.keyboard.up('w'); }
  await until(() => room.players.get('p1').input.forward === 0, 'weapon pickup movement releases');
  await until(() => host()[ownershipKey] && partner()[ownershipKey]
    && lastGuestState?.players.p2[ownershipKey], `${id} equips both operators through the normal shared rack`);
}
async function gameplayLayout(name) {
  const layout = await page.evaluate(() => {
    const bounds = element => { const r = element.getBoundingClientRect(); return { id: element.id || element.dataset.weapon,
      x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
      touchButtons: [...document.querySelectorAll('#touch-controls button')].map(e => e.id),
      swap: !!document.getElementById('touch-weapon'),
      controls: ['move-zone', 'fire-pad', 'touch-interact', 'pause', 'map-toggle'].map(id => document.getElementById(id))
        .filter(element => element && !element.hidden).map(bounds),
      guns: [...document.querySelectorAll('[data-weapon]')].filter(element => !element.hidden).map(bounds) };
  });
  assert.equal(layout.overflow, false); assert.equal(layout.swap, false);
  assert.deepEqual(layout.touchButtons.sort(), ['fire-pad', 'touch-interact']);
  assert.ok(layout.guns.length >= 3);
  for (const item of [...layout.controls, ...layout.guns]) {
    assert.ok(item.width >= 44 && item.height >= 44, `${name}: ${item.id} has a usable touch target`);
    assert.ok(item.x >= -1 && item.y >= -1 && item.x + item.width <= layout.width + 1
      && item.y + item.height <= layout.height + 1, `${name}: ${item.id} fits the viewport`);
  }
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const gun of layout.guns) for (const control of layout.controls) assert.equal(overlap(gun, control), false,
    `${name}: ${gun.id} does not overlap ${control.id}`);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  return layout;
}

try {
  await page.goto(`${base}/?mission=beneath-the-shadow`);
  await page.waitForFunction(() => !document.getElementById('start').disabled);
  await page.locator('[data-difficulty="insane"]').tap();
  await page.locator('#difficulty-choices').scrollIntoViewIfNeeded();
  const choice = await page.locator('[data-difficulty="insane"]').evaluate(button => {
    const r = button.getBoundingClientRect();
    return { text: button.textContent, pressed: button.getAttribute('aria-pressed'),
      x: r.x, y: r.y, width: r.width, height: r.height, viewport: innerWidth,
      clipped: button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1 };
  });
  assert.equal(choice.text, 'Insane in the Membrane'); assert.equal(choice.pressed, 'true');
  assert.equal(choice.clipped, false); assert.ok(choice.x >= 0 && choice.x + choice.width <= choice.viewport);
  await page.screenshot({ path: resolve(out, 'insane-phone-landscape.png') });
  await page.reload(); await page.waitForFunction(() => !document.getElementById('start').disabled);
  assert.equal(await page.locator('[data-difficulty="insane"]').getAttribute('aria-pressed'), 'true');
  pass('Insane in the Membrane fits phone landscape and persists after reload');

  await page.locator('#open-settings').tap();
  await page.locator('#setting-quality').selectOption('low');
  await page.locator('#setting-touch-preset').selectOption('compact');
  await page.locator('#setting-guidance').selectOption('moderate');
  await page.locator('#setting-sound').setChecked(false);
  await page.locator('#setting-auto').setChecked(false);
  if (await page.locator('#setting-tutorial').count()) await page.locator('#setting-tutorial').setChecked(false);
  await page.locator('#done-settings').tap();
  await page.locator('#open-coop').tap();
  await page.locator('#room-name').fill('Shadow QA');
  await page.locator('#room-mission').selectOption('beneath-the-shadow');
  assert.equal(await page.locator('#room-difficulty').inputValue(), 'insane');
  await page.locator('#room-create').tap();
  await page.waitForFunction(() => /^[A-Z0-9]{8}$/.test(document.getElementById('room-id').textContent));
  const roomId = await page.locator('#room-id').innerText();
  guest = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, { headers: { Origin: base } });
  guest.on('message', bytes => {
    const packet = JSON.parse(bytes);
    if (packet.type === 'room') guestRoom = packet.room;
    if (packet.type === 'state') lastGuestState = packet.state;
    if (packet.type === 'error') guestErrors.push(packet);
  });
  await new Promise((resolveOpen, reject) => { guest.once('open', resolveOpen); guest.once('error', reject); });
  send({ type: 'join', protocol: 2, roomId, name: 'Shadow teammate', supportedMissions: ['beneath-the-shadow'], shadowRevision: SHADOW_WORLD_REVISION });
  await until(() => guestRoom?.players.length === 2, 'matching Shadow client joins the real private room');
  send({ type: 'ready', ready: true }); await page.locator('#room-ready').tap();
  stream = setInterval(() => {
    if (guest.readyState === WebSocket.OPEN && guestRoom?.status === 'playing') send({ type: 'input', seq: ++guestSeq, forward: 0, strafe: 0, angle: 0, fire: false });
  }, 33);
  await page.locator('#room-start').tap(); await mode('playing');
  room = app.rooms.rooms.get(roomId); run = room.game;
  assert.equal(run.level.missionId, 'beneath-the-shadow'); assert.equal(run.options.difficulty, 'insane');
  assert.equal(guestRoom.difficulty, 'insane'); assert.equal(guestRoom.shadowRevision, SHADOW_WORLD_REVISION);
  pass('real browser lobby starts a compatible two-player Shadow room on Insane');

  parkEnemies();
  await placeHost(feature('aux-power')); await useControl('aux-power', 'POWER');
  assert.ok(run.state.checkpoint); const firstCheckpoint = { x: host().x, z: host().z };
  await collectRack('rivet-repeater', 'hasRepeater');
  await collectRack('pump-shotgun', 'hasShotgun');
  assert.equal(partner().weapon, 'pistol', 'shared racks do not force the partner to change weapons');
  pass('power and two shared weapon racks are earned through actual UI actions after the initial checkpoint');

  await placeHost(feature('jump-street-0'));
  await jump('jump-street-0'); await useControl('street-feed', 'POWER');
  await jump('jump-street-1'); await jump('jump-street-2'); await useControl('street-bridge', 'RESTORE');
  assert.equal(courseStatus(run, 'street').solved, true);
  assert.ok(['street-feed', 'street-bridge'].every(id => lastGuestState.interactables.find(o => o.id === id)?.used));
  await gameplayLayout('street-restored-phone-landscape');
  pass('touch USE completes the street circuit and three real jumps; solved controls replicate without adding buttons');

  await placeHost(feature('jump-aqueduct-0'));
  await jump('jump-aqueduct-0'); await useControl('aqueduct-flow', 'FLOW');
  await jump('jump-aqueduct-1'); await useControl('aqueduct-latch', 'LATCH');
  await jump('jump-aqueduct-2'); await jump('jump-aqueduct-3'); await useControl('aqueduct-sluice', 'RESTORE');
  assert.equal(courseStatus(run, 'aqueduct').solved, true);
  assert.ok(['aqueduct-flow', 'aqueduct-latch', 'aqueduct-sluice'].every(id => lastGuestState.interactables.find(o => o.id === id)?.used));
  await gameplayLayout('aqueduct-restored-phone-landscape');
  pass('touch USE completes the aqueduct valve, real timed landing, latch, and return sluice for both operators');

  await page.locator('#pause').tap(); await mode('paused'); await page.locator('#checkpoint').tap();
  await until(() => room.status === 'paused' && /Team checkpoint restored/.test(room.pauseReason), 'UI checkpoint retry restores the team checkpoint');
  assert.ok(near(host(), firstCheckpoint));
  for (const actor of [host(), partner()]) assert.ok(actor.hasRepeater && actor.hasShotgun);
  for (const course of ['street', 'aqueduct']) assert.equal(courseStatus(run, course).solved, true);
  send({ type: 'resume' }); await page.locator('#resume').tap(); await mode('playing');
  await until(() => lastGuestState.players.p2.hasRepeater && lastGuestState.players.p2.hasShotgun
    && lastGuestState.interactables.find(o => o.id === 'aqueduct-sluice')?.used,
  'the partner sees equipment and puzzle completion after retry');
  pass('retrying the earlier checkpoint preserves earned weapons and both shared puzzle solutions for both operators');

  parkEnemies();
  const sightings = [];
  for (const [index, [id, kind]] of [['forge-sower', 'cinder'], ['lantern-widow', 'tether'], ['lab-skimmer', 'skimmer'], ['echo-maw', 'maw']].entries()) {
    const enemy = run.state.enemies.find(e => e.id === id), x = 57.5 + index * 2;
    Object.assign(enemy, { x, z: 97.5 });
    await placeHost({ x, z: kind === 'maw' ? 102.5 : 101.5 }); await lookAt(enemy);
    if (kind === 'maw') {
      assert.equal(enemy.revealed, false);
      await page.screenshot({ path: resolve(out, 'lantern-maw-disguised.png') });
      await placeHost({ x, z: 100.5 });
    }
    await until(() => enemy.telegraph?.kind === kind, `${id} shows its genuine AI warning`);
    await until(() => lastGuestState.enemies.find(e => e.id === id)?.telegraph?.kind === kind, `${id} warning replicates`);
    await sleep(80);
    await page.screenshot({ path: resolve(out, `${id}-warning.png`) });
    sightings.push({ id, kind, alive: enemy.alive, revealed: enemy.revealed });
    Object.assign(enemy, { x: 90.5, z: 25.5 }); publishFixture();
  }
  assert.ok(host().alive && partner().alive);
  assert.deepEqual(errors, []); assert.deepEqual(guestErrors, []);
  pass('all four new enemies and their authoritative warnings render and replicate without browser errors', { sightings });
  await gameplayLayout('shadow-controls-phone-landscape');

  await page.locator('#pause').tap(); await mode('paused');
  await page.getByRole('button', { name: 'LEAVE ROOM', exact: true }).tap();
  await until(() => app.rooms.rooms.size === 0, 'the isolated QA room is cleaned up');
  pass('private test room closes cleanly');
  const report = { passed: results.length, renderer: webgl ? 'webgl' : 'software', expectedFallbackNotices, errors, guestErrors, results };
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: results.length, report: resolve(out, 'results.json') }));
} catch (error) {
  const report = { error: String(error), errors, guestErrors, results,
    room: room && { status: room.status, pauseReason: room.pauseReason },
    host: run?.state.players.p1, partner: run?.state.players.p2,
    interaction: run?.getInteractionInfo('p1') };
  await writeFile(resolve(out, 'failure.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: resolve(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  console.error(JSON.stringify(report, null, 2)); throw error;
} finally {
  clearInterval(stream); guest?.terminate(); await browser.close(); await app.close();
}
