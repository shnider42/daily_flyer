import { orientationOf, basis } from './orientation.mjs';

// These weapon values are deliberately scaled for a browser game. The shared
// mount frame keeps the sight, exterior barrels and authoritative shots aligned.
export const GUNSHIP_SEATS = Object.freeze(['25mm', '40mm', '105mm']);
export const GUNSHIP_AIM_LIMITS = Object.freeze({ yawMin: -0.6, yawMax: 0.6, pitchMin: -0.6, pitchMax: 0.55 });
export const GUNSHIP_INPUT_TIMEOUT = 0.35;
export const GUNSHIP_BASE_ELEVATION = -0.43;

export const GUNSHIP_STATIONS = Object.freeze([
  { id: '25mm', label: '25 mm · rapid cannon', shortLabel: '25 MM', key: '1', role: 'Rapid fire',
    mount: { x: 1.7, y: 0.1, z: 2.8 }, barrelLength: 1.4, fov: 62, zoomFov: 28,
    ammo: 1200, rate: 12, damage: 9, radius: 18, speed: 1200, gravity: 9, range: 3800 },
  { id: '40mm', label: '40 mm · medium cannon', shortLabel: '40 MM', key: '2', role: 'Controlled bursts',
    mount: { x: 1.7, y: 0.1, z: -0.8 }, barrelLength: 2, fov: 56, zoomFov: 22,
    ammo: 120, rate: 2.4, damage: 65, radius: 58, speed: 1050, gravity: 9, range: 4200 },
  { id: '105mm', label: '105 mm · heavy cannon', shortLabel: '105 MM', key: '3', role: 'Heavy blast',
    mount: { x: 1.7, y: 0.1, z: -5 }, barrelLength: 2.8, fov: 50, zoomFov: 17,
    ammo: 32, rate: 0.36, damage: 220, radius: 125, speed: 900, gravity: 9, range: 4600 },
].map(station => Object.freeze({ ...station, mount: Object.freeze(station.mount) })));

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function getGunshipStation(id = '25mm') {
  return GUNSHIP_STATIONS.find(station => station.id === id) || GUNSHIP_STATIONS[0];
}

/** Validate a complete local input and strip everything beyond the crew controls. */
export function clampCrewInput(input) {
  if (!input || !GUNSHIP_SEATS.includes(input.seat) || !Number.isFinite(input.yaw)
    || !Number.isFinite(input.pitch) || typeof input.fire !== 'boolean') return null;
  return { seat: input.seat, yaw: clamp(input.yaw, GUNSHIP_AIM_LIMITS.yawMin, GUNSHIP_AIM_LIMITS.yawMax),
    pitch: clamp(input.pitch, GUNSHIP_AIM_LIMITS.pitchMin, GUNSHIP_AIM_LIMITS.pitchMax), fire: input.fire };
}

export function createGunshipCrewState() {
  return { seat: '25mm', yaw: 0, pitch: 0, fire: false, gunnerId: null,
    stations: Object.fromEntries(GUNSHIP_STATIONS.map(station => [station.id, { ammo: station.ammo, cooldown: 0, shots: 0 }])) };
}

/**
 * Aircraft +X is port, +Y is up and +Z is forward. Positive sight yaw moves
 * toward the nose (screen right from a port window); positive pitch raises it.
 * All vectors follow the plane quaternion, even through vertical/inverted flight.
 */
export function gunshipStationPose(plane = {}, seat = '25mm', aim = {}, groundOffset = 0) {
  const station = getGunshipStation(seat), axes = basis(orientationOf(plane));
  const yaw = clamp(finite(aim.yaw), GUNSHIP_AIM_LIMITS.yawMin, GUNSHIP_AIM_LIMITS.yawMax);
  const elevation = GUNSHIP_BASE_ELEVATION + clamp(finite(aim.pitch), GUNSHIP_AIM_LIMITS.pitchMin, GUNSHIP_AIM_LIMITS.pitchMax);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
  const localDirection = { x: ce * cy, y: se, z: ce * sy };
  const localUp = { x: -se * cy, y: ce, z: -se * sy };
  const rotate = point => ({
    x: -axes.right.x * point.x + axes.up.x * point.y + axes.forward.x * point.z,
    y: -axes.right.y * point.x + axes.up.y * point.y + axes.forward.y * point.z,
    z: -axes.right.z * point.x + axes.up.z * point.y + axes.forward.z * point.z,
  });
  const point = offset => {
    const rotated = rotate(offset);
    return { x: finite(plane.x) + rotated.x, y: finite(plane.y) - finite(groundOffset) + rotated.y, z: finite(plane.z) + rotated.z };
  };
  const direction = rotate(localDirection), up = rotate(localUp);
  const mount = point(station.mount);
  const origin = { x: mount.x + direction.x * station.barrelLength,
    y: mount.y + direction.y * station.barrelLength, z: mount.z + direction.z * station.barrelLength };
  // A close optical station at the window; the small eye/muzzle separation
  // retains a readable first-person interior without a chase-camera offset.
  const eye = point({ x: station.mount.x - 0.25, y: station.mount.y + 0.5, z: station.mount.z });
  const target = { x: eye.x + direction.x * 100, y: eye.y + direction.y * 100, z: eye.z + direction.z * 100 };
  return { station, mount, origin, eye, position: eye, target, direction, up,
    fov: aim.zoom ? station.zoomFov : station.fov, yaw, pitch: elevation - GUNSHIP_BASE_ELEVATION };
}
