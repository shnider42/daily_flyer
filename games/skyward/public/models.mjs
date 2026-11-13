import * as THREE from './vendor/three.module.js';
import { orientationOf } from './orientation.mjs';
import { buildClassicAircraft } from './aircraft-classic.mjs';
import { buildModernAircraft } from './aircraft-modern.mjs';
import { buildGunshipAircraft } from './aircraft-gunship.mjs';
import { buildAirlinerAircraft } from './aircraft-airliner.mjs';
import { batchAircraft, aircraftGeometryStats } from './model-batching.mjs';
import { disposeModelMaterials } from './model-parts.mjs';

const prototypes = new Map();
const classicKinds = new Set(['avro504', 'camel', 'spitfire', 'hellcat', 'bf109', 'b17', 'c47', 'he111']);
const defaults = {
  avro504: ['#b4763e', '#ddc898', '#b25739'], camel: ['#69745a', '#9a9b73', '#bf6b42'],
  spitfire: ['#607769', '#798673', '#b5b697'], hellcat: ['#365b70', '#486e80', '#b3c5bf'],
  bf109: ['#68776a', '#879081', '#d3cba5'], he111: ['#617064', '#7f8876', '#b4b8a8'],
  b17: ['#7a8b75', '#96a28a', '#9caa90'], c47: ['#78826c', '#8f9984', '#ebe4c5'],
  f4: ['#89958c', '#a4aea2', '#657a73'], harrier: ['#687c80', '#849593', '#b0bbb0'],
  a10: ['#889489', '#a8b2a1', '#677e73'], f15: ['#9aa9ae', '#b3bec0', '#748d94'],
  f16: ['#879a9f', '#aebbbd', '#617b86'], f22: ['#87959c', '#b7bfc1', '#637982'],
  b2: ['#485961', '#60707a', '#40515b'], mig21: ['#99a6a7', '#b3bfbc', '#687e76'],
  ac130: ['#556773', '#647581', '#87968f'],
  b767: ['#e3e4df', '#b7c2c7', '#214c67'],
};

export function aircraftKind(profile) {
  const value = String(typeof profile === 'string' ? profile : (profile?.model || profile?.id || profile?.name || 'avro504')).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/b767|boeing767|airliner|passenger/.test(value)) return 'b767';
  if (/ac130|gunship|spooky/.test(value)) return 'ac130';
  if (/b2|spirit/.test(value)) return 'b2';
  if (/a10|thunderbolt|warthog/.test(value)) return 'a10';
  if (/f22|raptor/.test(value)) return 'f22';
  if (/f16|falcon/.test(value)) return 'f16';
  if (/f15|eagle/.test(value)) return 'f15';
  if (/harrier/.test(value)) return 'harrier';
  if (/mig/.test(value)) return 'mig21';
  if (/f4|phantom|jet/.test(value)) return 'f4';
  if (/he111|heinkel|junkers|ju88/.test(value)) return 'he111';
  if (/b17|bomber|lancaster/.test(value)) return 'b17';
  if (/c47|dakota|transport/.test(value)) return 'c47';
  if (/bf109|messerschmitt/.test(value)) return 'bf109';
  if (/spitfire/.test(value)) return 'spitfire';
  if (/hellcat|corsair|zero|wildcat|pacific/.test(value)) return 'hellcat';
  if (/camel|fokker|albatros|armed/.test(value)) return 'camel';
  return 'avro504';
}

export function makeAircraft(profile = 'avro504', faction = 'player') {
  const kind = aircraftKind(profile), enemy = faction === 'enemy', p = typeof profile === 'object' ? profile : {};
  const colors = defaults[kind];
  // Keep camouflage consistent with the airframe. Faction still controls
  // recognition markings; it no longer paints every opposing jet brown.
  const palette = { body: p.color || colors[0], wing: colors[1], accent: p.accent || colors[2], enemy };
  const detail = !enemy, key = JSON.stringify([kind, palette, detail]);
  if (!prototypes.has(key)) {
    const group = new THREE.Group();
    const data = { kind, propellers: [], exhausts: [], gear: null, fixedGear: false, span: 10, length: 8, detail };
    if (kind === 'b767') buildAirlinerAircraft(group, palette, data);
    else if (kind === 'ac130') buildGunshipAircraft(group, palette, data);
    else if (classicKinds.has(kind)) buildClassicAircraft(group, kind, palette, data);
    else buildModernAircraft(group, kind, palette, data);
    data.propellers.forEach((part, i) => part.name = 'prop-' + i);
    data.exhausts.forEach((part, i) => part.name = 'exhaust-' + i);
    batchAircraft(group);
    group.updateMatrixWorld(true);
    const gearBounds = data.gear ? new THREE.Box3().setFromObject(data.gear) : null;
    const groundOffset = gearBounds && !gearBounds.isEmpty() ? 3 + gearBounds.min.y : 1.3;
    group.userData = {
      kind, span: data.span, length: data.length, fixedGear: data.fixedGear, groundOffset,
      detail, modelRevision: 2, geometryStats: aircraftGeometryStats(group),
    };
    prototypes.set(key, group);
  }
  const result = prototypes.get(key).clone(true);
  result.userData = { ...result.userData, propellers: [], exhausts: [], gear: null };
  result.traverse(part => {
    if (part.name.startsWith('prop-') && part.isGroup) result.userData.propellers.push(part);
    if (part.name.startsWith('exhaust-')) result.userData.exhausts.push(part);
    if (part.name === 'gear') result.userData.gear = part;
  });
  return result;
}

export function animateAircraft(plane, pose, dt, time = 0) {
  if (!plane) return;
  const data = plane.userData, throttle = Number.isFinite(pose?.throttle) ? pose.throttle : .65, engine = pose?.engine !== false;
  for (const prop of data.propellers || []) {
    prop.rotation.z += (engine ? 26 + throttle * 78 : 0) * dt;
    const disc = prop.getObjectByName('prop-disc'); if (disc) disc.visible = engine;
  }
  if (data.gear) data.gear.visible = data.fixedGear || pose?.gear !== false;
  for (const exhaust of data.exhausts || []) {
    exhaust.visible = engine && throttle > (exhaust.userData.minThrottle ?? .16);
    exhaust.scale.set(1, Math.max(.2, throttle * (.85 + Math.sin(time * 37) * .06)), 1);
  }
}

export function setAircraftPose(plane, pose) {
  plane.position.set(pose.x || 0, pose.y || 0, pose.z || 0);
  const q = orientationOf(pose); plane.quaternion.set(q.x, q.y, q.z, q.w);
}

export function disposeModelCache() {
  const geometries = new Set();
  for (const group of prototypes.values()) group.traverse(part => { if (part.geometry) geometries.add(part.geometry); });
  for (const geometry of geometries) geometry.dispose();
  prototypes.clear(); disposeModelMaterials();
}
