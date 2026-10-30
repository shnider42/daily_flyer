// Actual browser touch input against a local export. These checks never create
// a production room or inject gameplay state; paused saves are read as evidence.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createBreachServer } from '../server/breach-server.mjs';

const out = 'breach-switchyard-results';
await mkdir(out, { recursive: true });
const app = createBreachServer();
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--disable-webgl'] });
const context = await browser.newContext({ viewport: { width: 926, height: 428 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const mode = expected => page.waitForFunction(value => document.body.dataset.mode === value, expected);
const touch = (type, points = []) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map(point => ({ radiusX: 12, radiusY: 12, force: 1, ...point })),
});
const point = async selector => {
  const bounds = await page.locator(selector).boundingBox();
  assert.ok(bounds, `${selector} must be visible`);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
};
async function snapshot() {
  await page.locator('#pause').tap();
  await mode('paused');
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('dfe.breach.run.v1')));
  assert.equal(record.game.options.mission, 'switchyard-15');
  await page.locator('#resume').tap();
  await mode('playing');
  return record.game.state;
}
async function hudAmmo() { return Number(await page.locator('#ammo').innerText()); }
async function waitForShots(ammoBefore, count = 1) {
  await page.waitForFunction(({ before, count }) => Number(document.getElementById('ammo').textContent) <= before - count, { before: ammoBefore, count }, { timeout: 6000 });
}
async function checkLayout(name) {
  const layout = await page.evaluate(() => {
    const ids = ['move-zone', 'fire-pad', 'touch-interact', 'map-toggle', 'pause'];
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
      controls: ids.map(id => {
        const element = document.getElementById(id), rect = element.getBoundingClientRect();
        return { id, hidden: element.hidden, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }) };
  });
  assert.equal(layout.overflow, false, `${name}: no horizontal overflow`);
  for (const control of layout.controls.filter(control => !control.hidden)) {
    assert.ok(control.width >= 44 && control.height >= 44, `${name}: ${control.id} retains a useful touch target`);
    assert.ok(control.x >= -1 && control.y >= -1 && control.x + control.width <= layout.width + 1 && control.y + control.height <= layout.height + 1, `${name}: ${control.id} fits on screen`);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  results.push({ check: `${name}: controls fit and retain 44px targets`, passed: true });
}

try {
  await page.goto(`${base}/?mission=switchyard-15`);
  await page.waitForFunction(() => !document.getElementById('start').disabled);
  assert.match(await page.locator('#mission-title').innerText(), /SWITCHYARD/i);
  await page.locator('#open-settings').tap();
  assert.equal(await page.locator('#setting-fire-gesture').inputValue(), 'safe');
  assert.equal(await page.locator('#setting-auto').isChecked(), false);
  await page.locator('#setting-quality').selectOption('low');
  await page.locator('#setting-sound').setChecked(false);
  await page.locator('#done-settings').tap();
  await page.locator('#start').tap();
  await mode('playing');
  assert.match(await page.locator('#weapon-name').innerText(), /PISTOL/);
  let before = await snapshot();

  // The reported problem: a camera drag beginning on the Fire button.
  let fire = await point('#fire-pad');
  await touch('touchStart', [fire]);
  await touch('touchMove', [{ ...fire, x: fire.x - 20 }]);
  await touch('touchMove', [{ ...fire, x: fire.x - 90 }]);
  await page.waitForTimeout(300); // Pausing the thumb must not turn an aim gesture into firing.
  await touch('touchEnd');
  let after = await snapshot();
  assert.equal(after.shots, before.shots, 'a drag starting on Fire must spend no ammunition');
  assert.ok(Math.abs(Math.atan2(Math.sin(after.player.angle - before.player.angle), Math.cos(after.player.angle - before.player.angle))) > .1, 'the same drag must actually pan the camera');
  results.push({ check: 'drag from Fire pans without firing, even after a stationary pause', passed: true });

  // Start on the look surface and cross directly onto the Fire button.
  before = after;
  fire = await point('#fire-pad');
  const look = { x: fire.x - 170, y: Math.max(100, fire.y - 70), id: 1 };
  await touch('touchStart', [look]);
  await touch('touchMove', [{ ...look, x: fire.x, y: fire.y }]);
  await page.waitForTimeout(260);
  await touch('touchEnd');
  after = await snapshot();
  assert.equal(after.shots, before.shots, 'crossing Fire during a look gesture must not shoot');
  results.push({ check: 'look-surface pointer ownership survives crossing Fire', passed: true });

  before = after;
  await page.locator('#fire-pad').tap();
  await waitForShots(before.player.ammo.pistol);
  after = await snapshot();
  assert.equal(after.shots - before.shots, 1, 'one tap must produce exactly one shot');
  assert.equal(before.player.ammo.pistol - after.player.ammo.pistol, 1);
  results.push({ check: 'tap fires exactly one shot on release', passed: true });

  before = after;
  fire = await point('#fire-pad');
  await touch('touchStart', [fire]);
  await waitForShots(before.player.ammo.pistol, 2);
  await touch('touchEnd');
  await page.waitForFunction(() => !document.getElementById('fire-pad').classList.contains('pressed'));
  await page.waitForTimeout(180); // Let the HUD display the final accepted shot.
  const releasedAmmo = await hudAmmo();
  await page.waitForTimeout(550);
  assert.equal(await hudAmmo(), releasedAmmo, 'release must stop firing before any pause clears inputs');
  after = await snapshot();
  assert.ok(after.shots - before.shots >= 2, 'a deliberate stationary hold must fire repeatedly');
  results.push({ check: 'deliberate hold repeats and release stops firing', passed: true });

  before = after;
  fire = await point('#fire-pad');
  await touch('touchStart', [fire]);
  await touch('touchCancel');
  await page.waitForTimeout(300);
  after = await snapshot();
  assert.equal(after.shots, before.shots, 'cancelling pending fire must not emit a tap or arm a hold');
  results.push({ check: 'touch cancellation clears pending fire', passed: true });

  // Two simultaneous touches: the movement pad and an independent look gesture.
  before = after;
  const move = { ...await point('#move-zone'), id: 1 };
  const aim = { x: 650, y: 180, id: 2 };
  await touch('touchStart', [move, aim]);
  await touch('touchMove', [{ ...move, y: move.y - 25 }, { ...aim, x: aim.x + 35 }]);
  await page.waitForTimeout(450);
  await touch('touchEnd');
  after = await snapshot();
  assert.equal(after.shots, before.shots);
  assert.ok(Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z) > .05, 'left thumb still moves while right thumb pans');
  results.push({ check: 'simultaneous movement and aiming remain independent', passed: true });

  await checkLayout('phone-landscape-safe-controls');
  before = after;
  fire = await point('#fire-pad');
  const beforeRotationAmmo = await hudAmmo();
  await touch('touchStart', [fire]);
  await waitForShots(beforeRotationAmmo);
  await page.setViewportSize({ width: 428, height: 926 });
  await touch('touchEnd');
  await page.waitForFunction(() => !document.getElementById('fire-pad').classList.contains('pressed'));
  await page.waitForTimeout(180);
  const rotatedAmmo = await hudAmmo();
  await page.waitForTimeout(550);
  assert.equal(await hudAmmo(), rotatedAmmo, 'rotation must stop an armed hold before any pause clears inputs');
  after = await snapshot();
  results.push({ check: 'rotation stops an armed fire gesture without pausing first', passed: true });
  await checkLayout('phone-portrait-safe-controls');

  before = after;
  await page.locator('#pause').tap();
  await mode('paused');
  await page.reload();
  await page.locator('#continue').tap();
  await mode('playing');
  after = await snapshot();
  assert.equal(after.shots, before.shots, 'Switchyard saves resume without extra firing');
  results.push({ check: 'Switchyard saved run resumes after reload', passed: true });
  assert.deepEqual(errors, []);
  await writeFile(`${out}/results.json`, JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), pageErrors: errors, completed: results,
    ui: await page.locator('body').innerText().catch(() => ''), }, null, 2));
  await page.screenshot({ path: `${out}/failure.png`, timeout: 5000 }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await app.close();
}
