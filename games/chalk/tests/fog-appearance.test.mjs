import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FOG_DENSITY, ORIGINAL_FOG_STYLE, DENSE_FOG_STYLE, fogAppearance, fogDrawStrength } from '../public/fog-appearance.mjs';
import { createDefaults, normalizePreferences } from '../public/settings.mjs';

test('the default reproduces the original two tints, source-over alpha, and day/night/map treatment', () => {
  const style = fogAppearance();
  assert.equal(DEFAULT_FOG_DENSITY, .25);
  assert.deepEqual(style, { ...ORIGINAL_FOG_STYLE, density: .25 });
  assert.equal(style.baseColor, '77,91,83'); assert.equal(style.rememberedColor, '41,55,49');
  assert.equal(style.baseAlpha, .105); assert.equal(style.rememberedAlpha, .085);
  assert.ok(Math.abs(1 - (1 - style.baseAlpha) * (1 - style.rememberedAlpha) - .181075) < 1e-12);
  assert.equal(fogDrawStrength(style), 1);
  assert.equal(fogDrawStrength(style, { map: true }), .8);
  assert.equal(fogDrawStrength(style, { night: true }), .6);
  assert.equal(fogDrawStrength(style, { night: true, map: true }), .6);
});

test('fog density is bounded and progresses from clear overlay through original to dense', () => {
  assert.equal(fogAppearance(0).unseenAlpha, 0);
  assert.equal(fogAppearance(0).rememberedAlpha, 0);
  assert.equal(fogAppearance(1).unseenAlpha, DENSE_FOG_STYLE.unseenAlpha);
  let previous = -1;
  for (let i = 0; i <= 20; i++) {
    const style = fogAppearance(i / 20);
    assert.ok(style.unseenAlpha > previous);
    assert.ok(style.unseenAlpha >= style.rememberedAlpha);
    previous = style.unseenAlpha;
  }
  assert.equal(fogAppearance(-5).density, 0); assert.equal(fogAppearance(9).density, 1);
  assert.equal(fogAppearance(NaN).density, .25);
});

test('old preferences receive original fog, chosen density persists, and loadouts stay independent', () => {
  assert.equal(createDefaults().fogDensity, .25);
  assert.equal(normalizePreferences({ cameraZoom: 1.2 }).fogDensity, .25);
  const saved = normalizePreferences({ fogDensity: '0.8', squadRoles: ['sniper', 'heavy', 'medic', 'support'] });
  assert.equal(normalizePreferences(JSON.parse(JSON.stringify(saved))).fogDensity, .8);
  assert.deepEqual(saved.squadRoles, ['sniper', 'heavy', 'medic', 'support']);
  assert.equal(normalizePreferences({ fogDensity: -1 }).fogDensity, 0);
  assert.equal(normalizePreferences({ fogDensity: 2 }).fogDensity, 1);
  assert.equal(normalizePreferences({ fogDensity: null }).fogDensity, .25);
});
