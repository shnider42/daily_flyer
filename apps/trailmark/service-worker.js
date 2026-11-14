/* Trailmark only saves an offline pack after an explicit request in the app. */
const VERSION = '0.1.0';
const CACHE_NAME = `trailmark-v${VERSION}`;
const STAGING_NAME = `${CACHE_NAME}-staging`;
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', SCOPE_URL).href;
const MARKER_URL = new URL(`.trailmark-offline-${VERSION}.json`, SCOPE_URL).href;
const FILES = [
  'index.html',
  'style.css',
  'app.mjs',
  'map.mjs',
  'navigation.mjs',
  'progress.mjs',
  'imports.mjs',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'data/area.json',
  'data/LICENSE-OSM.txt',
];
const ASSETS = FILES.map(file => ({ file, url: new URL(file, SCOPE_URL).href }));
const ASSET_URLS = new Set(ASSETS.map(asset => asset.url));
let saveInProgress = null;
let readyCachePromise = null;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  // Keep older packs until this version has been saved and checked completely.
  event.waitUntil(self.clients.claim());
});

async function validateResponse(response, file) {
  if (!response || response.status !== 200 || !response.ok || response.type === 'opaque' ||
      response.type === 'opaqueredirect' || response.redirected) {
    throw new Error(`Could not save ${file}: a complete local file was not returned.`);
  }
  const contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (file.endsWith('.png')) {
    if (contentType !== 'image/png') throw new Error(`Could not save ${file}: unexpected file type.`);
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || png.some((byte, index) => bytes[index] !== byte)) {
      throw new Error(`Could not save ${file}: the image is incomplete.`);
    }
    return;
  }
  const text = await response.clone().text();
  if (!text.trim()) throw new Error(`Could not save ${file}: the file is empty.`);
  if (file.endsWith('.html')) {
    if (contentType !== 'text/html' || !/<html\b/i.test(text)) throw new Error(`Could not save ${file}: unexpected page content.`);
    return;
  }
  // A server may return an HTML login/error page with status 200.
  if (contentType === 'text/html' || /^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) {
    throw new Error(`Could not save ${file}: a webpage was returned instead of the file.`);
  }
  if (file.endsWith('.mjs') && !['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'].includes(contentType)) {
    throw new Error(`Could not save ${file}: JavaScript was not served correctly.`);
  }
  if (file.endsWith('.css') && contentType !== 'text/css') throw new Error(`Could not save ${file}: CSS was not served correctly.`);
  if (file.endsWith('.svg') && (contentType !== 'image/svg+xml' || !/<svg\b/i.test(text))) {
    throw new Error(`Could not save ${file}: unexpected image content.`);
  }
  if (file.endsWith('.json') || file.endsWith('.webmanifest')) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    } catch {
      throw new Error(`Could not save ${file}: the map or app information is invalid.`);
    }
  }
}

async function inspectPack({ validateBodies = false } = {}) {
  const names = await caches.keys();
  if (!names.includes(CACHE_NAME)) return null;
  const cache = await caches.open(CACHE_NAME);
  const markerResponse = await cache.match(MARKER_URL);
  if (!markerResponse) return null;
  let marker;
  try { marker = await markerResponse.json(); } catch { return null; }
  if (marker.version !== VERSION || marker.count !== ASSETS.length ||
      !Array.isArray(marker.files) || marker.files.join('\n') !== FILES.join('\n')) return null;
  for (const asset of ASSETS) {
    const response = await cache.match(asset.url);
    if (!response || !response.ok || response.status !== 200) return null;
    if (validateBodies) {
      try { await validateResponse(response, asset.file); } catch { return null; }
    }
  }
  return { cache, marker };
}

function completeCache() {
  if (!readyCachePromise) readyCachePromise = inspectPack();
  return readyCachePromise;
}

async function savePack() {
  await caches.delete(STAGING_NAME);
  const stage = await caches.open(STAGING_NAME);
  try {
    // Populate a separate cache first. A failed download leaves an existing
    // complete pack usable and never receives an offline-ready marker.
    for (const asset of ASSETS) {
      const response = await fetch(new Request(asset.url, { cache: 'no-store', credentials: 'same-origin' }));
      await validateResponse(response, asset.file);
      await stage.put(asset.url, response);
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(MARKER_URL);
    readyCachePromise = null;
    for (const asset of ASSETS) {
      const response = await stage.match(asset.url);
      if (!response) throw new Error('The downloaded pack was removed before it could be saved. Try again.');
      await cache.put(asset.url, response);
    }
    const completedAt = new Date().toISOString();
    await cache.put(MARKER_URL, new Response(JSON.stringify({
      version: VERSION, count: ASSETS.length, files: FILES, completedAt,
    }), { headers: { 'content-type': 'application/json' } }));
    const saved = await inspectPack({ validateBodies: true });
    if (!saved) {
      await cache.delete(MARKER_URL);
      throw new Error('The browser could not keep every offline file. Free some storage and try again.');
    }
    readyCachePromise = Promise.resolve(saved);
    // Never remove caches belonging to another app. Old Trailmark versions are
    // removed only after this replacement has passed its complete-file check.
    for (const name of await caches.keys()) {
      if (/^trailmark-v\d+\.\d+\.\d+(?:-staging)?$/.test(name) && name !== CACHE_NAME && name !== STAGING_NAME) {
        await caches.delete(name);
      }
    }
    return { ok: true, ready: true, version: VERSION, count: ASSETS.length, requiredCount: ASSETS.length, completedAt };
  } finally {
    await caches.delete(STAGING_NAME);
  }
}

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type !== 'CACHE_OFFLINE' && type !== 'CHECK_OFFLINE') return;
  const reply = result => {
    if (event.ports?.[0]) event.ports[0].postMessage(result);
    else if (event.source?.postMessage) event.source.postMessage({ type: `${type}_RESULT`, ...result });
  };
  const work = (async () => {
    try {
      if (type === 'CHECK_OFFLINE') {
        const saved = await inspectPack({ validateBodies: true });
        readyCachePromise = Promise.resolve(saved);
        reply({ ok: true, ready: Boolean(saved), version: VERSION, count: saved ? ASSETS.length : 0,
          requiredCount: ASSETS.length, completedAt: saved?.marker.completedAt || null });
        return;
      }
      if (!saveInProgress) saveInProgress = savePack().finally(() => { saveInProgress = null; });
      reply(await saveInProgress);
    } catch (error) {
      readyCachePromise = null;
      reply({ ok: false, ready: false, version: VERSION, count: 0, requiredCount: ASSETS.length,
        error: error instanceof Error ? error.message : 'The offline pack could not be saved. Please reconnect and try again.' });
    }
  })();
  event.waitUntil(work);
});

async function navigationResponse(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) return response;
    const saved = await completeCache();
    const fallback = saved && await saved.cache.match(INDEX_URL);
    return fallback || response;
  } catch {
    const saved = await completeCache();
    const fallback = saved && await saved.cache.match(INDEX_URL);
    if (fallback) return fallback;
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trailmark — connect to load</title><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1>Connect to load Trailmark</h1><p>A complete offline copy is not available on this device. Reconnect, open the app, and choose Save for offline before your hike.</p><button onclick="location.reload()">Try again</button></body></html>', {
      status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (!ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const saved = await completeCache();
    const cached = saved && await saved.cache.match(request);
    return cached || fetch(request);
  })());
});
