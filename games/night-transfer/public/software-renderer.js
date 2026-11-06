import * as THREE from './vendor/three.module.js';

// Canvas fallback for devices without WebGL. It consumes the original scene graph;
// raycasting, interaction targets, movement and collision retain their 3D geometry.
const MAX_PIXELS = 360_000;
const MAX_WIDTH = 800;
const FRAME_MS = 1000 / 20;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const mix = (a, b, t) => a + (b - a) * t;
const cssColor = rgb => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
const srgb = value => value <= .0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - .055;
const aces = value => clamp((value * (2.51 * value + .03)) / (value * (2.43 * value + .59) + .14));
const planeDistance = (v, plane) => plane === 0 ? v.w + v.x : plane === 1 ? v.w - v.x
  : plane === 2 ? v.w + v.y : plane === 3 ? v.w - v.y : plane === 4 ? v.w + v.z : v.w - v.z;
const outcode = v => (v.x < -v.w ? 1 : 0) | (v.x > v.w ? 2 : 0)
  | (v.y < -v.w ? 4 : 0) | (v.y > v.w ? 8 : 0) | (v.z < -v.w ? 16 : 0) | (v.z > v.w ? 32 : 0);
function interpolate(a, b, t) {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), w: mix(a.w, b.w, t),
    u: mix(a.u, b.u, t), v: mix(a.v, b.v, t), depth: mix(a.depth, b.depth, t) };
}
function clipPolygon(vertices, mask) {
  for (let plane = 0; plane < 6 && vertices.length; plane++) {
    if (!(mask & (1 << plane))) continue;
    const clipped = [];
    let previous = vertices.at(-1), previousDistance = planeDistance(previous, plane);
    for (const current of vertices) {
      const distance = planeDistance(current, plane);
      if ((distance >= 0) !== (previousDistance >= 0)) {
        clipped.push(interpolate(previous, current, previousDistance / (previousDistance - distance)));
      }
      if (distance >= 0) clipped.push(current);
      previous = current; previousDistance = distance;
    }
    vertices = clipped;
  }
  return vertices;
}
function vertex(position, uv, index) {
  return [position.getX(index), position.getY(index), position.getZ(index), uv?.getX(index) || 0, uv?.getY(index) || 0];
}
const midpoint = (a, b) => a.map((value, index) => (value + b[index]) / 2);
function edgeSquared(a, b, scale) {
  return (a[0] - b[0]) ** 2 * scale[0] ** 2 + (a[1] - b[1]) ** 2 * scale[1] ** 2
    + (a[2] - b[2]) ** 2 * scale[2] ** 2;
}

export class SoftwareRenderer {
  constructor({ canvas, alpha = false } = {}) {
    this.domElement = canvas || globalThis.document?.createElement('canvas');
    if (!this.domElement) throw new Error('A canvas is required to display the game.');
    this.context = this.domElement.getContext('2d', { alpha, desynchronized: true }) || this.domElement.getContext('2d');
    if (!this.context) throw new Error('This browser cannot create a Canvas 2D view.');
    this.isSoftwareRenderer = true;
    this.capabilities = { isWebGL2: false, getMaxAnisotropy: () => 1 };
    this.shadowMap = { enabled: false, type: THREE.BasicShadowMap, autoUpdate: true, needsUpdate: false };
    this.outputColorSpace = THREE.SRGBColorSpace;
    this.toneMapping = THREE.NoToneMapping;
    this.toneMappingExposure = 1;
    this.autoClear = true;
    this.info = { render: { frame: 0, calls: 0, triangles: 0, lines: 0, points: 0 } };
    this._width = Math.max(1, this.domElement.width || 1);
    this._height = Math.max(1, this.domElement.height || 1);
    this._pixelRatio = 1;
    this._clearColor = new THREE.Color(0x1b2c2d);
    this._clearAlpha = alpha ? 0 : 1;
    this._lastRender = -Infinity;
    this._disposed = false;
    this._meshCache = new WeakMap();
    this._textureCache = new Map();
    this._viewProjection = new THREE.Matrix4();
    this._localClip = new THREE.Matrix4();
    this._localView = new THREE.Matrix4();
    this._normalMatrix = new THREE.Matrix3();
    this._frustum = new THREE.Frustum();
    this._sphere = new THREE.Sphere();
    this._point = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this.setSize(this._width, this._height, false);
  }

  getContext() { return this.context; }
  getPixelRatio() { return this._pixelRatio; }
  setPixelRatio(value) {
    this._pixelRatio = clamp(Number(value) || 1, .25, 1);
    this.setSize(this._width, this._height, false);
  }
  setSize(width, height, updateStyle = true) {
    this._width = Math.max(1, Math.round(Number(width) || 1));
    this._height = Math.max(1, Math.round(Number(height) || 1));
    const scale = Math.min(this._pixelRatio, MAX_WIDTH / this._width, Math.sqrt(MAX_PIXELS / (this._width * this._height)));
    const pixelWidth = Math.max(1, Math.floor(this._width * scale));
    const pixelHeight = Math.max(1, Math.floor(this._height * scale));
    if (this.domElement.width !== pixelWidth) this.domElement.width = pixelWidth;
    if (this.domElement.height !== pixelHeight) this.domElement.height = pixelHeight;
    if (updateStyle && this.domElement.style) {
      this.domElement.style.width = this._width + 'px'; this.domElement.style.height = this._height + 'px';
    }
    this._lastRender = -Infinity;
  }
  getSize(target = new THREE.Vector2()) { return target.set(this._width, this._height); }
  getDrawingBufferSize(target = new THREE.Vector2()) { return target.set(this.domElement.width, this.domElement.height); }
  setClearColor(color, alpha = 1) { this._clearColor.set(color); this._clearAlpha = clamp(alpha); }
  getClearColor(target = new THREE.Color()) { return target.copy(this._clearColor); }
  setClearAlpha(alpha) { this._clearAlpha = clamp(alpha); }
  getClearAlpha() { return this._clearAlpha; }
  clear() {
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (this._clearAlpha < 1) ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);
    ctx.globalAlpha = this._clearAlpha;
    ctx.fillStyle = this._clearColor.getStyle(THREE.SRGBColorSpace);
    ctx.fillRect(0, 0, this.domElement.width, this.domElement.height); ctx.globalAlpha = 1;
  }
  dispose() { this._disposed = true; this._textureCache.clear(); this._meshCache = new WeakMap(); }

  _faces(mesh) {
    const geometry = mesh.geometry, position = geometry.attributes.position, uv = geometry.attributes.uv;
    if (!position) return [];
    const matrix = mesh.matrixWorld.elements;
    const scale = [Math.hypot(matrix[0], matrix[1], matrix[2]), Math.hypot(matrix[4], matrix[5], matrix[6]), Math.hypot(matrix[8], matrix[9], matrix[10])];
    const signature = [geometry.id, position.version, geometry.index?.version || 0, uv?.version || 0,
      geometry.drawRange.start, geometry.drawRange.count, ...scale.map(value => Math.round(value * 10000))].join(':');
    const previous = this._meshCache.get(mesh);
    if (previous?.signature === signature) return previous.faces;
    const index = geometry.index, normal = geometry.attributes.normal, faces = [];
    const count = index ? index.count : position.count;
    const start = Math.max(0, geometry.drawRange.start || 0), end = Math.min(count, start + geometry.drawRange.count);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const extent = (geometry.boundingSphere?.radius || 1) * Math.max(...scale);
    // Large room surfaces get geometric subdivisions so furniture does not vanish
    // behind one giant painter-sorted floor triangle. Sky domes retain their mesh.
    const maxEdge = material?.side === THREE.BackSide && material?.isMeshBasicMaterial ? Infinity : extent > 24 ? 10 : 2;
    function add(a, b, c, n, materialIndex, depth = 0) {
      const ab = edgeSquared(a, b, scale), bc = edgeSquared(b, c, scale), ca = edgeSquared(c, a, scale);
      const longest = Math.max(ab, bc, ca);
      if (longest > maxEdge * maxEdge && depth < 8) {
        if (ab === longest) { const m = midpoint(a, b); add(a, m, c, n, materialIndex, depth + 1); add(m, b, c, n, materialIndex, depth + 1); }
        else if (bc === longest) { const m = midpoint(b, c); add(a, b, m, n, materialIndex, depth + 1); add(a, m, c, n, materialIndex, depth + 1); }
        else { const m = midpoint(c, a); add(a, b, m, n, materialIndex, depth + 1); add(m, b, c, n, materialIndex, depth + 1); }
      } else faces.push({ a, b, c, normal: n, materialIndex,
        center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3] });
    }
    for (let offset = start; offset + 2 < end; offset += 3) {
      const ai = index ? index.getX(offset) : offset, bi = index ? index.getX(offset + 1) : offset + 1, ci = index ? index.getX(offset + 2) : offset + 2;
      const a = vertex(position, uv, ai), b = vertex(position, uv, bi), c = vertex(position, uv, ci);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = normal ? [normal.getX(ai) + normal.getX(bi) + normal.getX(ci), normal.getY(ai) + normal.getY(bi) + normal.getY(ci), normal.getZ(ai) + normal.getZ(bi) + normal.getZ(ci)]
        : [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...n) || 1; n[0] /= length; n[1] /= length; n[2] /= length;
      const materialIndex = geometry.groups.find(group => offset >= group.start && offset < group.start + group.count)?.materialIndex || 0;
      add(a, b, c, n, materialIndex);
    }
    this._meshCache.set(mesh, { signature, faces });
    return faces;
  }

  _lights(scene, camera) {
    const lights = [];
    scene.traverseVisible(object => {
      if (!object.isLight || !object.layers.test(camera.layers)) return;
      const entry = { color: object.color, intensity: object.intensity, kind: object.type, distance: object.distance || 0 };
      this._point.setFromMatrixPosition(object.matrixWorld);
      if (object.isDirectionalLight || object.isSpotLight) {
        object.target.updateWorldMatrix(true, false); this._target.setFromMatrixPosition(object.target.matrixWorld);
        this._target.subVectors(this._point, this._target).normalize(); entry.direction = this._target.toArray();
      }
      if (object.isHemisphereLight) {
        entry.ground = object.groundColor; entry.direction = this._point.clone().normalize().toArray();
      }
      entry.position = this._point.toArray(); lights.push(entry);
    });
    return lights;
  }

  _shade(material, normal, center, depth, lights, fog) {
    let r = .12, g = .14, b = .15;
    if (material.isMeshBasicMaterial || material.isLineBasicMaterial) r = g = b = 1;
    else for (const light of lights) {
      const color = light.color;
      let amount = 0;
      if (light.kind === 'AmbientLight') amount = light.intensity;
      else if (light.kind === 'HemisphereLight') {
        const t = clamp((normal[0] * light.direction[0] + normal[1] * light.direction[1] + normal[2] * light.direction[2] + 1) / 2);
        const intensity = light.intensity * .6;
        r += mix(light.ground.r, color.r, t) * intensity; g += mix(light.ground.g, color.g, t) * intensity; b += mix(light.ground.b, color.b, t) * intensity;
        continue;
      } else if (light.kind === 'DirectionalLight') {
        amount = Math.max(0, normal[0] * light.direction[0] + normal[1] * light.direction[1] + normal[2] * light.direction[2]) * light.intensity * .55;
      } else if (light.kind === 'PointLight' || light.kind === 'SpotLight') {
        const dx = light.position[0] - center[0], dy = light.position[1] - center[1], dz = light.position[2] - center[2];
        const distance = Math.hypot(dx, dy, dz) || .001;
        if (light.distance && distance >= light.distance) continue;
        const falloff = light.distance ? (1 - (distance / light.distance) ** 4) ** 2 : 1;
        amount = Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / distance) * light.intensity * falloff * .65 / (1 + distance * distance);
      }
      r += color.r * amount; g += color.g * amount; b += color.b * amount;
    }
    const color = material.color || { r: 1, g: 1, b: 1 }, emissive = material.emissive;
    const emission = material.emissiveIntensity ?? 1;
    const values = [color.r * r + (emissive?.r || 0) * emission, color.g * g + (emissive?.g || 0) * emission, color.b * b + (emissive?.b || 0) * emission];
    const exposure = material.toneMapped === false ? 1 : Math.max(.05, this.toneMappingExposure);
    const mapped = material.toneMapped !== false && this.toneMapping !== THREE.NoToneMapping;
    let fogAmount = 0;
    if (fog && material.fog !== false) fogAmount = fog.isFogExp2 ? 1 - Math.exp(-fog.density * fog.density * depth * depth) : clamp((depth - fog.near) / (fog.far - fog.near));
    return values.map((value, index) => {
      value = Math.max(0, value * exposure);
      if (mapped) value = aces(value);
      if (fogAmount) value = mix(value, [fog.color.r, fog.color.g, fog.color.b][index], fogAmount);
      return Math.round(clamp(srgb(value)) * 255);
    });
  }

  _project(v) {
    v.screenX = (v.x / v.w * .5 + .5) * this.domElement.width;
    v.screenY = (.5 - v.y / v.w * .5) * this.domElement.height;
    return v;
  }
  _transform(v, clip, view) {
    const x = v[0], y = v[1], z = v[2];
    return { x: clip[0] * x + clip[4] * y + clip[8] * z + clip[12],
      y: clip[1] * x + clip[5] * y + clip[9] * z + clip[13],
      z: clip[2] * x + clip[6] * y + clip[10] * z + clip[14],
      w: clip[3] * x + clip[7] * y + clip[11] * z + clip[15],
      depth: -(view[2] * x + view[6] * y + view[10] * z + view[14]), u: v[3] || 0, v: v[4] || 0 };
  }

  _mesh(mesh, scene, camera, lights, queue) {
    const geometry = mesh.geometry;
    if (!geometry?.attributes.position) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    if (mesh.frustumCulled && !this._frustum.intersectsSphere(this._sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld))) return;
    this._localClip.multiplyMatrices(this._viewProjection, mesh.matrixWorld);
    this._localView.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    this._normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const clip = this._localClip.elements, view = this._localView.elements, matrix = mesh.matrixWorld.elements, normalMatrix = this._normalMatrix.elements;
    const determinant = mesh.matrixWorld.determinant() < 0 ? -1 : 1;
    for (const face of this._faces(mesh)) {
      const material = scene.overrideMaterial || (Array.isArray(mesh.material) ? mesh.material[face.materialIndex] : mesh.material);
      if (!material || !material.visible || material.colorWrite === false || material.opacity <= .001) continue;
      const a = this._transform(face.a, clip, view), b = this._transform(face.b, clip, view), c = this._transform(face.c, clip, view);
      const ca = outcode(a), cb = outcode(b), cc = outcode(c);
      if (ca & cb & cc) continue;
      const polygon = ca | cb | cc ? clipPolygon([a, b, c], ca | cb | cc) : [a, b, c];
      if (polygon.length < 3 || polygon.some(v => v.w <= .000001)) continue;
      polygon.forEach(v => this._project(v));
      let area = 0, depth = 0;
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length];
        area += p.screenX * q.screenY - q.screenX * p.screenY; depth += p.depth;
      }
      if (Math.abs(area) < .04) continue;
      const front = area * determinant < 0;
      if (material.side === THREE.FrontSide && !front || material.side === THREE.BackSide && front) continue;
      depth /= polygon.length;
      const n = face.normal, sign = front ? 1 : -1;
      const nx = (normalMatrix[0] * n[0] + normalMatrix[3] * n[1] + normalMatrix[6] * n[2]) * sign;
      const ny = (normalMatrix[1] * n[0] + normalMatrix[4] * n[1] + normalMatrix[7] * n[2]) * sign;
      const nz = (normalMatrix[2] * n[0] + normalMatrix[5] * n[1] + normalMatrix[8] * n[2]) * sign;
      const nl = Math.hypot(nx, ny, nz) || 1, p = face.center;
      const center = [matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
        matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
        matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14]];
      const rgb = this._shade(material, [nx / nl, ny / nl, nz / nl], center, depth, lights, scene.fog);
      queue.push({ polygon, material, rgb, depth, order: mesh.renderOrder || 0 });
    }
  }

  _lines(object, scene, camera, lights, queue) {
    const material = scene.overrideMaterial || object.material, position = object.geometry?.attributes.position;
    if (!position || !material?.visible || material.opacity <= .001) return;
    this._localClip.multiplyMatrices(this._viewProjection, object.matrixWorld);
    this._localView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    const clip = this._localClip.elements, view = this._localView.elements, index = object.geometry.index;
    const length = index ? index.count : position.count, step = object.isLineSegments ? 2 : 1;
    for (let i = 0; i + 1 < length; i += step) {
      let a = this._transform(vertex(position, null, index ? index.getX(i) : i), clip, view);
      let b = this._transform(vertex(position, null, index ? index.getX(i + 1) : i + 1), clip, view), rejected = false;
      for (let plane = 0; plane < 6; plane++) {
        const da = planeDistance(a, plane), db = planeDistance(b, plane);
        if (da < 0 && db < 0) { rejected = true; break; }
        if (da < 0) a = interpolate(a, b, da / (da - db));
        else if (db < 0) b = interpolate(a, b, da / (da - db));
      }
      if (rejected || a.w <= 0 || b.w <= 0) continue;
      const depth = (a.depth + b.depth) / 2;
      queue.push({ line: true, polygon: [this._project(a), this._project(b)], material, depth, order: object.renderOrder || 0,
        rgb: this._shade(material, [0, 1, 0], [0, 0, 0], depth, lights, scene.fog) });
    }
  }

  _newCanvas(width, height) {
    const canvas = this.domElement.ownerDocument?.createElement('canvas') || globalThis.document?.createElement('canvas')
      || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null);
    if (canvas) { canvas.width = width; canvas.height = height; }
    return canvas;
  }
  _texture(texture, rgb) {
    const image = texture.image || texture.source?.data;
    if (!image || !(image.width > 0 && image.height > 0)) return null;
    const tint = rgb.map(value => Math.round(value / 16) * 16).map(value => Math.min(value, 255));
    const key = `${texture.id}:${texture.version}:${tint.join(',')}`;
    let cached = this._textureCache.get(key);
    if (cached) { this._textureCache.delete(key); this._textureCache.set(key, cached); return cached; }
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    const canvas = this._newCanvas(width, height), ctx = canvas?.getContext('2d');
    let source = image;
    if (ctx) {
      ctx.drawImage(image, 0, 0, width, height);
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = cssColor(tint); ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(image, 0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over'; source = canvas;
    }
    const repeatX = texture.wrapS === THREE.RepeatWrapping || texture.wrapS === THREE.MirroredRepeatWrapping;
    const repeatY = texture.wrapT === THREE.RepeatWrapping || texture.wrapT === THREE.MirroredRepeatWrapping;
    const repeating = repeatX || repeatY;
    cached = { image: source, width: source.width, height: source.height,
      pattern: repeating ? this.context.createPattern(source, repeatX && repeatY ? 'repeat' : repeatX ? 'repeat-x' : 'repeat-y') : null };
    this._textureCache.set(key, cached);
    if (this._textureCache.size > 64) this._textureCache.delete(this._textureCache.keys().next().value);
    return cached;
  }
  _path(polygon, expand = 0, append = false) {
    const ctx = this.context;
    let cx = 0, cy = 0;
    if (expand) { for (const v of polygon) { cx += v.screenX; cy += v.screenY; } cx /= polygon.length; cy /= polygon.length; }
    if (!append) ctx.beginPath();
    for (let i = 0; i < polygon.length; i++) {
      const v = polygon[i], dx = v.screenX - cx, dy = v.screenY - cy, length = Math.hypot(dx, dy) || 1;
      const x = v.screenX + (expand ? dx / length * expand : 0), y = v.screenY + (expand ? dy / length * expand : 0);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  _paintTexture(a, b, c, texture, source, depth = 0) {
    // Split strongly foreshortened labels into smaller affine patches. Their UVs
    // interpolate in homogeneous space, retaining the original perspective.
    const triangle = [a, b, c];
    if (depth < 3) {
      let split = -1, error = 3;
      for (let i = 0; i < 3; i++) {
        const p = triangle[i], q = triangle[(i + 1) % 3];
        const m = this._project(interpolate(p, q, .5));
        const e = Math.hypot(m.screenX - (p.screenX + q.screenX) / 2, m.screenY - (p.screenY + q.screenY) / 2);
        if (e > error) { error = e; split = i; }
      }
      if (split >= 0) {
        const p = triangle[split], q = triangle[(split + 1) % 3], r = triangle[(split + 2) % 3];
        const m = this._project(interpolate(p, q, .5));
        this._paintTexture(p, m, r, texture, source, depth + 1); this._paintTexture(m, q, r, texture, source, depth + 1); return;
      }
    }
    const matrix = texture.matrix.elements;
    const uv = triangle.map(v => {
      const u = matrix[0] * v.u + matrix[3] * v.v + matrix[6], vv = matrix[1] * v.u + matrix[4] * v.v + matrix[7];
      return [u * source.width, (texture.flipY === false ? vv : 1 - vv) * source.height];
    });
    const du1 = uv[1][0] - uv[0][0], dv1 = uv[1][1] - uv[0][1], du2 = uv[2][0] - uv[0][0], dv2 = uv[2][1] - uv[0][1];
    const determinant = du1 * dv2 - du2 * dv1;
    if (Math.abs(determinant) < 1e-9) return;
    const dx1 = b.screenX - a.screenX, dy1 = b.screenY - a.screenY, dx2 = c.screenX - a.screenX, dy2 = c.screenY - a.screenY;
    const aa = (dx1 * dv2 - dx2 * dv1) / determinant, bb = (dy1 * dv2 - dy2 * dv1) / determinant;
    const cc = (dx2 * du1 - dx1 * du2) / determinant, dd = (dy2 * du1 - dy1 * du2) / determinant;
    const ee = a.screenX - aa * uv[0][0] - cc * uv[0][1], ff = a.screenY - bb * uv[0][0] - dd * uv[0][1];
    const ctx = this.context; ctx.save(); this._path(triangle, .35); ctx.clip(); ctx.transform(aa, bb, cc, dd, ee, ff);
    if (source.pattern) {
      const minX = Math.min(...uv.map(v => v[0])) - 2, minY = Math.min(...uv.map(v => v[1])) - 2;
      const maxX = Math.max(...uv.map(v => v[0])) + 2, maxY = Math.max(...uv.map(v => v[1])) + 2;
      ctx.fillStyle = source.pattern; ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    } else ctx.drawImage(source.image, 0, 0);
    ctx.restore(); this.info.render.calls++;
  }

  render(scene, camera) {
    if (this._disposed || !scene || !camera) return;
    const time = clock();
    if (time - this._lastRender < FRAME_MS - .5) return;
    this._lastRender = time;
    if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
    camera.updateWorldMatrix(true, false); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection);
    const lights = this._lights(scene, camera), queue = [];
    scene.traverseVisible(object => {
      if (!object.layers.test(camera.layers)) return;
      if (object.isMesh) this._mesh(object, scene, camera, lights, queue);
      else if (object.isLine) this._lines(object, scene, camera, lights, queue);
    });
    queue.sort((a, b) => a.order - b.order || b.depth - a.depth);
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (scene.background?.isColor) { ctx.fillStyle = scene.background.getStyle(THREE.SRGBColorSpace); ctx.fillRect(0, 0, this.domElement.width, this.domElement.height); }
    else if (this.autoClear) this.clear();
    ctx.imageSmoothingEnabled = true;
    this.info.render.frame++; this.info.render.calls = this.info.render.triangles = this.info.render.lines = 0;
    let batchStyle = null;
    const flush = () => {
      if (batchStyle === null) return;
      ctx.fill(); this.info.render.calls++; batchStyle = null;
    };
    for (const face of queue) {
      const { polygon, material, rgb } = face;
      const map = material.map;
      // Surface noise is decorative. Re-tinting large repeating images per face
      // is prohibitively expensive in CPU-only browsers; retain the actual mesh,
      // its lighting and material color, and reserve textures for readable signs
      // and transparent detail such as shadows and fences.
      const repeats = map && (map.wrapS !== THREE.ClampToEdgeWrapping || map.wrapT !== THREE.ClampToEdgeWrapping);
      const texture = map && (!repeats || material.transparent) ? map : null;
      if (texture?.matrixAutoUpdate) texture.updateMatrix();
      const source = texture ? this._texture(texture, rgb) : null;
      if (!face.line) this.info.render.triangles += polygon.length - 2;
      if (!face.line && !source && !material.transparent && !material.wireframe
        && (material.opacity ?? 1) >= 1 && material.blending !== THREE.AdditiveBlending) {
        const style = cssColor(rgb.map(value => Math.min(255, Math.round(value / 8) * 8)));
        if (batchStyle !== style) {
          flush(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = style; ctx.beginPath(); batchStyle = style;
        }
        this._path(polygon, .2, true); continue;
      }
      flush();
      ctx.globalAlpha = clamp(material.opacity ?? 1);
      ctx.globalCompositeOperation = material.blending === THREE.AdditiveBlending ? 'lighter' : 'source-over';
      if (face.line) {
        ctx.beginPath(); ctx.moveTo(polygon[0].screenX, polygon[0].screenY); ctx.lineTo(polygon[1].screenX, polygon[1].screenY);
        ctx.strokeStyle = cssColor(rgb); ctx.lineWidth = material.linewidth || 1; ctx.stroke(); this.info.render.lines++; this.info.render.calls++; continue;
      }
      if (!source || !material.transparent) {
        this._path(polygon, material.transparent ? 0 : .2);
        ctx.fillStyle = cssColor(rgb);
        if (material.wireframe) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = material.wireframeLinewidth || 1; ctx.stroke(); }
        else ctx.fill();
        this.info.render.calls++;
      }
      if (source && !material.wireframe) {
        for (let i = 1; i < polygon.length - 1; i++) this._paintTexture(polygon[0], polygon[i], polygon[i + 1], texture, source);
      }
    }
    flush();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.shadowMap.needsUpdate = false;
  }
}
