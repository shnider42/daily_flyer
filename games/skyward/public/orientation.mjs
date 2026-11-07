// Aircraft meshes point along local +Z with +Y up. In this right-handed world,
// cockpit right is local -X. Legacy heading/pitch/roll use Euler YXZ with
// rotation (-pitch, heading, -roll); named pilot inputs have separate signs.
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function isOrientation(q) {
  return !!q && ['x', 'y', 'z', 'w'].every(key => Number.isFinite(q[key]))
    && Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z), Math.abs(q.w)) > 1e-12;
}

export function normalizeOrientation(q) {
  if (!isOrientation(q)) return { x: 0, y: 0, z: 0, w: 1 };
  const scale = Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z), Math.abs(q.w));
  const x = q.x / scale, y = q.y / scale, z = q.z / scale, w = q.w / scale;
  const length = Math.hypot(x, y, z, w);
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}

export function multiplyOrientations(a, b) {
  return normalizeOrientation({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

export function orientationFromEuler(heading = 0, pitch = 0, roll = 0) {
  const x = -finite(pitch) / 2, y = finite(heading) / 2, z = -finite(roll) / 2;
  const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z);
  const s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  return normalizeOrientation({
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  });
}

export function orientationFromPose(pose = {}) {
  return isOrientation(pose?.orientation) ? normalizeOrientation(pose.orientation)
    : orientationFromEuler(pose?.heading, pose?.pitch, pose?.roll);
}

export function basisFromOrientation(orientation) {
  const { x, y, z, w } = normalizeOrientation(orientation);
  return {
    right: { x: -(1 - 2 * (y * y + z * z)), y: -2 * (x * y + z * w), z: -2 * (x * z - y * w) },
    up: { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) },
    forward: { x: 2 * (x * z + y * w), y: 2 * (y * z - x * w), z: 1 - 2 * (x * x + y * y) },
  };
}

export function anglesFromOrientation(orientation) {
  const { right, up, forward } = basisFromOrientation(orientation);
  const pitch = Math.asin(clamp(forward.y, -1, 1));
  if (Math.abs(forward.y) < 1 - 1e-10) {
    return { heading: Math.atan2(forward.x, forward.z), pitch, roll: Math.atan2(right.y, up.y) };
  }
  // Heading and bank share one degree of freedom at the pole. This equivalent
  // YXZ representation keeps old snapshots usable; renderers retain the quat.
  return { heading: Math.atan2(right.z, -right.x), pitch, roll: 0 };
}

export function slerpOrientation(a, b, fraction) {
  const first = normalizeOrientation(a), second = normalizeOrientation(b);
  const t = clamp(finite(fraction), 0, 1);
  let dot = first.x * second.x + first.y * second.y + first.z * second.z + first.w * second.w;
  if (dot < 0) {
    dot = -dot;
    for (const key of ['x', 'y', 'z', 'w']) second[key] = -second[key];
  }
  let wa = 1 - t, wb = t;
  if (dot < 0.9995) {
    const theta = Math.acos(clamp(dot, -1, 1)), denominator = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / denominator;
    wb = Math.sin(t * theta) / denominator;
  }
  return normalizeOrientation({ x: first.x * wa + second.x * wb, y: first.y * wa + second.y * wb,
    z: first.z * wa + second.z * wb, w: first.w * wa + second.w * wb });
}

/** Apply angular rates in radians/second about the aircraft's own axes. */
export function integrateBodyRotation(orientation, rates = {}, dt = 0) {
  const q = normalizeOrientation(orientation), elapsed = Math.max(0, finite(dt));
  const x = -finite(rates.pitch) * elapsed, y = -finite(rates.yaw) * elapsed, z = finite(rates.roll) * elapsed;
  const rotation = Math.hypot(x, y, z);
  if (rotation < 1e-12) return q;
  const scale = Math.sin(rotation / 2) / rotation;
  return multiplyOrientations(q, { x: x * scale, y: y * scale, z: z * scale, w: Math.cos(rotation / 2) });
}

// Short aliases keep rendering/network adapters readable without a new convention.
export const orientationOf = orientationFromPose;
export const basis = basisFromOrientation;
export const deriveEuler = anglesFromOrientation;
export const slerp = slerpOrientation;
