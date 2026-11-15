import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT } from '../public/campaign.mjs';
import { ENGINE_LAYER_NAMES, ENGINE_SAMPLE_RATE, engineMix, engineProfile, synthesizeEngineLayers } from '../public/engine-audio.mjs';

test('all flyable airframes have distinct, bounded, seamless engine loops', () => {
  const ids = Object.keys(AIRCRAFT);
  const signatures = new Set();
  for (const id of ids) {
    const layers = synthesizeEngineLayers(id);
    assert.equal(layers.sampleRate, ENGINE_SAMPLE_RATE);
    const digest = [];
    for (const name of ENGINE_LAYER_NAMES) {
      const samples = layers[name];
      let square = 0, largestSlope = 0;
      for (let i = 0; i < samples.length; i++) {
        assert.ok(Number.isFinite(samples[i]) && Math.abs(samples[i]) < .83, id);
        square += samples[i] ** 2;
        if (i > 0) largestSlope = Math.max(largestSlope, Math.abs(samples[i] - samples[i - 1]));
      }
      assert.ok(samples.length / layers.sampleRate > 1.5 && samples.length / layers.sampleRate < 2);
      assert.ok(Math.sqrt(square / samples.length) > .08, id + ' layer must be audible');
      assert.ok(Math.abs(samples[0] - samples.at(-1)) <= largestSlope * 1.005, id + ' loop seam');
      for (const i of [60, 600, 1600, 7000]) digest.push(samples[i].toFixed(4));
    }
    signatures.add(digest.join(','));
  }
  assert.equal(signatures.size, ids.length);
  assert.deepEqual(synthesizeEngineLayers('f14', 8000), synthesizeEngineLayers('f14', 8000));
});

test('throttle, pressure and cabin perspective change the mix without one global jet or prop preset', () => {
  const avro = engineProfile('avro504'), spitty = engineProfile('spitfire'), phantom = engineProfile('f4');
  const gunship = engineProfile('ac130'), widebody = engineProfile('b767');
  assert.equal(gunship.family, 'turboprop');
  assert.ok(avro.sputter > spitty.sputter * 5);
  assert.ok(widebody.spool > phantom.spool * 1.7);
  const idle = engineMix(phantom, { power: .15 }), power = engineMix(phantom, { power: 1, speed: 320 });
  const cockpit = engineMix(phantom, { power: 1, speed: 320, camera: 'cockpit' });
  const damaged = engineMix(phantom, { power: 1, speed: 320, health: .3 });
  assert.ok(power.core.rate > idle.core.rate * 1.8);
  assert.ok(power.air.gain > idle.air.gain * 2);
  assert.ok(cockpit.cutoff < power.cutoff * .4 && cockpit.air.gain < power.air.gain * .6);
  assert.ok(damaged.core.rate < power.core.rate);
  const civil = engineMix(widebody, { power: 1, speed: 320 });
  assert.ok(civil.air.gain < power.air.gain * .75 && civil.rotor.gain > power.rotor.gain * 1.8);
});
