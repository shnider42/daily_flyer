/**
 * Local route-file helpers. Imported geometry is never promoted to a verified
 * route, even when the input file claims otherwise. Coordinates use [lng, lat].
 */
export const IMPORT_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxPoints: 20_000,
  maxSegmentMeters: 2_000,
});

export const IMPORT_NOTICE = 'Imported route: geometry and access have not been checked. Compare it with an official map before using route alerts.';

function readableText(value, fallback, limit = 100) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/<[^>]*>/g, '').replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, limit) : fallback;
}

function checkText(text) {
  if (typeof text !== 'string') throw new Error('Choose a text GPX or JSON route file.');
  // The quick character check prevents allocating a larger encoded copy first.
  if (text.length > IMPORT_LIMITS.maxBytes || new TextEncoder().encode(text).length > IMPORT_LIMITS.maxBytes) {
    throw new Error('This route file is too large. The limit is 2 MB.');
  }
  if (!text.trim()) throw new Error('The route file is empty.');
}

function metersBetween(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLng = (b[0] - a[0]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

/** Validate, copy, and remove consecutive duplicate coordinates. */
export function validateCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('A route needs at least two different coordinates.');
  }
  if (coordinates.length > IMPORT_LIMITS.maxPoints) {
    throw new Error('This route has too many points. The limit is 20,000.');
  }
  const clean = [];
  for (let i = 0; i < coordinates.length; i++) {
    const point = coordinates[i];
    if (!Array.isArray(point) || point.length < 2 || point.length > 3 ||
        typeof point[0] !== 'number' || typeof point[1] !== 'number' ||
        !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
        Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90 ||
        (point.length === 3 && (typeof point[2] !== 'number' || !Number.isFinite(point[2])))) {
      throw new Error(`Point ${i + 1} must contain valid longitude and latitude numbers.`);
    }
    const next = [point[0], point[1]];
    const previous = clean[clean.length - 1];
    if (previous) {
      const gap = metersBetween(previous, next);
      if (gap > IMPORT_LIMITS.maxSegmentMeters) {
        throw new Error(`There is a gap of more than 2 km before point ${i + 1}. Export one continuous hiking track with more detail.`);
      }
      if (next[0] === previous[0] && next[1] === previous[1]) continue;
    }
    clean.push(next);
  }
  if (clean.length < 2) throw new Error('A route needs at least two different coordinates.');
  return clean;
}

function importId(coordinates, name) {
  // Stable local ID lets the UI recognize repeated imports. Not a security hash.
  const text = name + '|' + JSON.stringify(coordinates);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `import-${(hash >>> 0).toString(16)}`;
}

function makeRoute(coordinates, metadata, options = {}) {
  const clean = validateCoordinates(coordinates);
  const name = readableText(options.name, null) || readableText(metadata.name, 'Imported hike');
  const description = readableText(metadata.description, 'A route imported on this device.', 500);
  return {
    id: importId(clean, name),
    name,
    description,
    coordinates: clean,
    validation: 'imported',
    mapUncertaintyM: 25,
    source: { title: metadata.sourceTitle, url: null },
    waypoints: [],
    notice: IMPORT_NOTICE,
  };
}

function childrenNamed(node, name) {
  return Array.from(node.children || []).filter(child => child.localName === name);
}

function childText(node, name) {
  return childrenNamed(node, name)[0]?.textContent || '';
}

/**
 * Read one GPX route or one track containing exactly one segment. Multiple
 * segments are rejected rather than drawing a false connecting trail.
 * DOMParser is provided by the browser; no network requests are performed.
 */
export function parseGpx(text, options = {}) {
  checkText(text);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
    throw new Error('GPX files containing document types or entity declarations are not supported.');
  }
  if (typeof DOMParser === 'undefined') throw new Error('GPX import needs a browser with XML parsing support.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (Array.from(doc.getElementsByTagName('*')).some(node => node.localName === 'parsererror')) {
    throw new Error('This GPX file is not valid XML.');
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx') throw new Error('This file does not contain a GPX document.');
  const tracks = childrenNamed(root, 'trk');
  const routes = childrenNamed(root, 'rte');
  if (tracks.length + routes.length !== 1) {
    throw new Error('Import one continuous track or route at a time. Files with multiple tracks or routes are not joined.');
  }
  const parent = tracks[0] || routes[0];
  let points;
  if (tracks.length) {
    const segments = childrenNamed(parent, 'trkseg');
    if (segments.length !== 1) {
      throw new Error('This GPX track must have exactly one segment. Separate segments may have gaps and are not joined.');
    }
    points = childrenNamed(segments[0], 'trkpt');
  } else {
    points = childrenNamed(parent, 'rtept');
  }
  if (points.length > IMPORT_LIMITS.maxPoints) throw new Error('This route has too many points. The limit is 20,000.');
  const coordinates = points.map((point, i) => {
    const lat = point.getAttribute('lat');
    const lon = point.getAttribute('lon');
    // Number('') and Number(null) are 0, so reject missing/empty values first.
    if (lat === null || lon === null || !lat.trim() || !lon.trim()) {
      throw new Error(`Point ${i + 1} is missing latitude or longitude.`);
    }
    // Restrict GPX numbers to decimal notation, including scientific notation.
    const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    if (!decimal.test(lat.trim()) || !decimal.test(lon.trim())) {
      throw new Error(`Point ${i + 1} has an invalid latitude or longitude.`);
    }
    return [Number(lon), Number(lat)];
  });
  return makeRoute(coordinates, {
    name: childText(parent, 'name') || childText(childrenNamed(root, 'metadata')[0] || root, 'name'),
    description: childText(parent, 'desc'),
    sourceTitle: 'Your GPX file',
  }, options);
}

/** Accept a route object or a GeoJSON Feature with one LineString geometry. */
export function parseRouteJson(text, options = {}) {
  checkText(text);
  let input;
  try { input = JSON.parse(text); } catch { throw new Error('This route file is not valid JSON.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Import one route object or a GeoJSON LineString feature.');
  }
  let coordinates;
  let metadata;
  if (input.type === 'Feature') {
    if (input.geometry?.type !== 'LineString') {
      throw new Error('The GeoJSON feature must contain a single LineString. Separate lines are not joined.');
    }
    coordinates = input.geometry.coordinates;
    metadata = input.properties && typeof input.properties === 'object' && !Array.isArray(input.properties) ? input.properties : {};
  } else if (!input.type || input.type === 'LineString') {
    coordinates = input.coordinates;
    metadata = input;
  } else {
    throw new Error('Import one route or LineString feature. Collections and separate lines are not joined.');
  }
  return makeRoute(coordinates, {
    name: metadata.name,
    description: metadata.description,
    sourceTitle: 'Your JSON file',
  }, options);
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));
}

/**
 * Export recorded points as GPX. A breakBefore flag or a large time/position
 * gap creates a new trkseg, preserving missing observations instead of drawing
 * a straight shortcut. Imported routes deliberately reject such multi-segments.
 */
export function exportTrackGpx(points, name = 'Trailmark hike') {
  if (!Array.isArray(points) || points.length === 0) throw new Error('There are no recorded positions to export.');
  if (points.length > IMPORT_LIMITS.maxPoints) throw new Error('This track has more than 20,000 positions.');
  const title = readableText(name, 'Trailmark hike');
  const segments = [];
  let segment = [];
  let previous;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point || typeof point !== 'object') throw new Error(`Recorded position ${i + 1} is invalid.`);
    const coordinate = Array.isArray(point.coordinate) ? point.coordinate : [point.longitude, point.latitude];
    if (coordinate.length < 2 || typeof coordinate[0] !== 'number' || typeof coordinate[1] !== 'number' ||
        !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) {
      throw new Error(`Recorded position ${i + 1} is invalid.`);
    }
    const date = point.timestamp == null ? null : new Date(point.timestamp);
    if (date && !Number.isFinite(date.getTime())) throw new Error(`Recorded position ${i + 1} has an invalid time.`);
    const timestamp = date ? date.getTime() : null;
    if (previous && (point.breakBefore || metersBetween(previous.coordinate, coordinate) > IMPORT_LIMITS.maxSegmentMeters ||
        (timestamp !== null && previous.timestamp !== null && (timestamp - previous.timestamp > 60_000 || timestamp <= previous.timestamp)))) {
      segments.push(segment);
      segment = [];
    }
    segment.push(`      <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">${date ? `<time>${date.toISOString()}</time>` : ''}</trkpt>`);
    previous = { coordinate, timestamp };
  }
  if (segment.length) segments.push(segment);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trailmark" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${escapeXml(title)}</name><desc>Recorded device positions; accuracy and route access are not verified.</desc></metadata>\n  <trk>\n    <name>${escapeXml(title)}</name>\n${segments.map(rows => `    <trkseg>\n${rows.join('\n')}\n    </trkseg>`).join('\n')}\n  </trk>\n</gpx>\n`;
}
