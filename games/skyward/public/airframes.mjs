// Bounds of SKYWARD's actual generated aircraft meshes, in their +Z-forward,
// +Y-up model frame. These are game-art envelopes, not operational dimensions.
// Keeping these small data records separate avoids loading Three.js in physics.
export const AIRFRAME_BOUNDS = Object.freeze({
  avro504: { min: [-5.485, -1.67, -4.497], max: [5.485, 1.565, 4.48] },
  camel: { min: [-4.265, -1.58, -2.931], max: [4.265, 1.395, 2.92] },
  spitfire: { min: [-5.61, -1.83, -4.629], max: [5.61, 1.93, 4.59] },
  b17: { min: [-15.81, -2.59, -11.41], max: [15.81, 4.018, 11.293] },
  c47: { min: [-14.48, -2.64, -9.76], max: [14.48, 3.453, 9.84] },
  ac130: { min: [-20.22, -3.52, -14.9], max: [20.22, 8.086, 14.9] },
  hellcat: { min: [-6.53, -2.19, -5.2], max: [6.53, 2.544, 5.04] },
  f4: { min: [-5.857, -1.85, -11.34], max: [5.857, 3.19, 9.6] },
  harrier: { min: [-3.853, -1.71, -7.1], max: [3.853, 2.16, 7.1] },
  a10: { min: [-8.771, -1.89, -8.13], max: [8.771, 2.423, 8.13] },
  f15: { min: [-6.501, -1.88, -11.46], max: [6.501, 3.647, 9.72] },
  f16: { min: [-5.206, -1.79, -9.27], max: [5.206, 3.17, 7.53] },
  f22: { min: [-6.8, -1.83, -10.95], max: [6.8, 3.095, 9.45] },
  b2: { min: [-26.064, -1.92, -10.45], max: [26.064, 1.683, 10.45] },
  b767: { min: [-24.12, -3, -27], max: [24.12, 12.185, 27] },
  p38: { min: [-7.91, -2.13, -5.74], max: [7.91, 1.912, 5.065] },
  mig21: { min: [-3.579, -1.79, -9.09], max: [3.579, 3.41, 7.36] },
  // The Tomcat model's unswept wings are its widest configuration.
  f14: { min: [-9.803, -2.06, -10.78], max: [9.803, 3.63, 10.08] },
  f18: { min: [-6.014, -2.05, -9.75], max: [6.014, 3.165, 8.87] },
  sr71: { min: [-9.557, -2.42, -15.13], max: [9.557, 3.773, 16.44] },
});

export function modeledAirframeBounds(aircraft) {
  return AIRFRAME_BOUNDS[typeof aircraft === 'string' ? aircraft : aircraft?.id || aircraft?.aircraft] || AIRFRAME_BOUNDS.avro504;
}
