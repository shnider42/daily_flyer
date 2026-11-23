import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaults, normalizePreferences, renderDensity } from '../public/settings.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('defaults respect system motion and optional touch detection without sharing campaign data', () => {
  const first = createDefaults({ reducedMotion: true, touchControls: false });
  const second = createDefaults();
  assert.equal(first.reducedMotion, true); assert.equal(first.touchControls, false);
  assert.equal(second.graphicsQuality, 'balanced'); assert.equal(second.renderScale, 'auto');
  assert.equal(second.frameLimit, 60); assert.equal(second.aimLine, true);
  assert.equal(Object.hasOwn(second, 'touchControls'), false);
  first.completed.cordon = true;
  assert.deepEqual(second.completed, {});
});

test('saved and form settings normalize numeric strings, clamp ranges, and reject unknown keys', () => {
  const settings = normalizePreferences({
    role: 'member', difficulty: 'veteran', guidance: 'expert', graphicsQuality: 'high',
    renderScale: '0.75', frameLimit: '120', cameraZoom: 8, cameraLookahead: -5,
    crosshairStyle: 'ring', crosshairScale: .1, aimColor: 'teal',
    masterVolume: '0.4', effectsVolume: -1, ambienceVolume: 4, hudScale: 9,
    hudDetail: 'compact', sound: false, showFPS: true, autoReload: false,
    touchControls: false, callsign: '  Red\n Fox  ', debugGodMode: true,
  });
  assert.equal(settings.renderScale, .75); assert.equal(settings.frameLimit, 120);
  assert.equal(settings.cameraZoom, 1.4); assert.equal(settings.cameraLookahead, 0);
  assert.equal(settings.crosshairScale, .75); assert.equal(settings.masterVolume, .4);
  assert.equal(settings.effectsVolume, 0); assert.equal(settings.ambienceVolume, 1);
  assert.equal(settings.hudScale, 1.3); assert.equal(settings.callsign, 'Red Fox');
  assert.equal(settings.touchControls, false); assert.equal(settings.autoReload, false);
  assert.equal(Object.hasOwn(settings, 'debugGodMode'), false);
});

test('malformed storage restores validated defaults without treating strings as boolean toggles', () => {
  const defaults = createDefaults({ reducedMotion: true });
  const result = normalizePreferences({
    role: 'commander', guidance: 'maximum', renderScale: 20, frameLimit: 10000,
    sound: 'false', reducedMotion: null, aimLine: 0, cameraZoom: NaN,
    masterVolume: Infinity, hudScale: {}, touchControls: 'false', completed: [],
  }, defaults);
  assert.deepEqual(result, normalizePreferences({}, defaults));
  assert.deepEqual(normalizePreferences(null), normalizePreferences([]));
  assert.deepEqual(normalizePreferences({}, { cameraZoom: -100, sound: 'yes' }).cameraZoom, .8);
  assert.equal(normalizePreferences({}, { sound: 'yes' }).sound, true);
});

test('valid saved mission results survive normalization and malformed records cannot count as wins', () => {
  const completed = JSON.parse('{"cordon":{"time":412,"squad":4,"civilianHarm":0,"role":"leader","extra":"ignored"},"first-crash":true,"night-relief":{"time":-1,"squad":4,"civilianHarm":0,"role":"member"},"__proto__":{"polluted":true},"constructor":true}');
  const result = normalizePreferences({ completed });
  assert.deepEqual(result.completed, { cordon: {time:412,squad:4,civilianHarm:0,role:'leader'}, 'first-crash': true });
  result.completed.cordon.time = 99;
  assert.equal(completed.cordon.time, 412);
  assert.equal({}.polluted, undefined);
});

test('existing desktop preferences gain independent mobile defaults without overwriting either device setup', () => {
  const old = { cameraZoom: 1.3, hudScale: 1.2, hudDetail: 'standard', completed: { cordon: true } };
  const migrated = normalizePreferences(old);
  assert.equal(migrated.mobileCameraZoom, .75); assert.equal(migrated.mobileHudScale, .85); assert.equal(migrated.mobileHudDetail, 'compact');
  assert.equal(migrated.cameraZoom, 1.3); assert.equal(migrated.hudScale, 1.2); assert.equal(migrated.hudDetail, 'standard');
  assert.deepEqual(migrated.completed, { cordon: true });
  const customized = normalizePreferences({ ...migrated, mobileCameraZoom: '0.6', mobileHudScale: '1.1', mobileHudDetail: 'standard' });
  assert.equal(customized.mobileCameraZoom, .6); assert.equal(customized.mobileHudScale, 1.1); assert.equal(customized.mobileHudDetail, 'standard');
  assert.equal(customized.cameraZoom, 1.3); assert.equal(customized.hudScale, 1.2);
  const bounded = normalizePreferences({ mobileCameraZoom: 0, mobileHudScale: 5, mobileHudDetail: 'hidden' });
  assert.equal(bounded.mobileCameraZoom, .6); assert.equal(bounded.mobileHudScale, 1.15); assert.equal(bounded.mobileHudDetail, 'compact');
});

test('automatic rendering observes pixel budgets and quality DPR caps at desktop and mobile sizes', () => {
  for (const [quality, pixels, maxDpr] of [['performance',1_600_000,1],['balanced',2_073_600,1.5],['high',5_300_000,2]]) {
    const density = renderDensity(2560, 1440, 2, 'auto', quality);
    assert.ok(2560 * 1440 * density ** 2 <= pixels + .001);
    assert.ok(density <= maxDpr);
    near(renderDensity(390, 844, 3, 'auto', quality), maxDpr);
  }
  near(renderDensity(2560,1440,1,'auto','balanced'),.75);
  near(renderDensity(2560,1440,2,'auto','performance'),Math.sqrt(1_600_000/(2560*1440)));
  assert.equal(renderDensity(7680,4320,3,'auto','performance'),.5);
});

test('explicit resolution scales capped native DPR independently of effects quality', () => {
  for (const quality of ['performance', 'balanced', 'high']) {
    near(renderDensity(2560,1440,1,.75,quality),.75);
    near(renderDensity(2560,1440,2,'0.75',quality),1.5);
    near(renderDensity(2560,1440,3,1,quality),2);
    near(renderDensity(2560,1440,.5,.75,quality),.5);
  }
  assert.ok(Number.isFinite(renderDensity(NaN,0,Infinity,'invalid','unknown')));
});
