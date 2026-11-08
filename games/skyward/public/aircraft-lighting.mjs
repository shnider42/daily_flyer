import * as THREE from './vendor/three.module.js';

// A small local sky/ground reflection source makes rounded paint, metal rims
// and glossy canopy glazing read as different surfaces. Three prefilters this
// once for material roughness; no cube camera or per-frame reflection pass.
export function makeSkyReflection({ top, horizon, ground, sun, sunDirection, night = false }) {
  const width = 256, height = 128, data = new Uint8Array(width * height * 4);
  const sky = new THREE.Color(top), haze = new THREE.Color(horizon), earth = new THREE.Color(ground), light = new THREE.Color(sun);
  const direction = new THREE.Vector3(sunDirection.x, sunDirection.y, sunDirection.z).normalize(), color = new THREE.Color();
  for (let y = 0; y < height; y++) {
    const latitude = ((y + .5) / height - .5) * Math.PI, up = Math.sin(latitude), radius = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const azimuth = ((x + .5) / width - .5) * Math.PI * 2, dx = Math.cos(azimuth) * radius, dz = Math.sin(azimuth) * radius;
      if (up >= 0) color.copy(haze).lerp(sky, Math.pow(up, .55));
      else color.copy(haze).lerp(earth, Math.min(1, -up * 4 + .24));
      const facing = Math.max(0, dx * direction.x + up * direction.y + dz * direction.z);
      const highlight = Math.pow(facing, 75) * (night ? .025 : .32);
      color.multiplyScalar(night ? .32 : .57);
      color.r += light.r * highlight; color.g += light.g * highlight; color.b += light.b * highlight;
      color.convertLinearToSRGB();
      const i = (y * width + x) * 4;
      data[i] = Math.min(255, Math.round(color.r * 255)); data[i + 1] = Math.min(255, Math.round(color.g * 255)); data[i + 2] = Math.min(255, Math.round(color.b * 255)); data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'aircraft-sky-reflections'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
