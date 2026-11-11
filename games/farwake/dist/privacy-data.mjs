/** Read-only, explicitly scoped data reports. Recovery credentials are never report data. */
export const PRIVACY_FORMAT_VERSION = 1;
export const BROWSER_DATA_KEYS = Object.freeze({
  voyage: 'dfe.farwake.save.v1',
  settings: 'dfe.farwake.settings.v1',
  guidance: 'dfe.farwake.action-guide.v1',
  passports: 'farwake.multiplayer.passport.v1',
  cameraPrefix: 'dfe.farwake.camera-pending.v1:'
});
export const DEVICE_SETTING_FIELDS = Object.freeze([
  'guidance', 'controlScale', 'textScale', 'shipZoom', 'personZoom',
  'immersiveHud', 'translucentHud', 'compactTips', 'sound', 'music',
  'musicVolume', 'musicPresence', 'musicSettingsVersion',
  'reduceMotion', 'leftHanded', 'flightAssist', 'showPerformance'
]);
const numericSettings = new Set(['controlScale', 'textScale', 'shipZoom', 'personZoom', 'worldZoom', 'musicVolume', 'musicSettingsVersion']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const credentialNames = new Set([
  'token', 'tokenhash', 'accesstoken', 'refreshtoken', 'idtoken', 'bearertoken',
  'password', 'passwordhash', 'encryptedpassword', 'secret', 'secrethash',
  'apikey', 'servicekey', 'servicerolekey', 'serverkey', 'keyhash',
  'authorization', 'cookie', 'cookies', 'sessioncookie', 'sessiontoken',
  'privatekey', 'signingkey', 'recoverycode', 'recoverytoken', 'credential', 'credentials'
]);
const credentialField = key => credentialNames.has(String(key).replace(/[^a-z0-9]/gi, '').toLowerCase());

/** Copy only supported primitive preferences, never arbitrary imported properties. */
export function pickDeviceSettings(value, { includeLegacy = false } = {}) {
  if (!record(value)) return {};
  const result = {};
  for (const key of [...DEVICE_SETTING_FIELDS, ...(includeLegacy ? ['worldZoom'] : [])]) {
    if (!own(value, key)) continue;
    if (key === 'guidance') {
      if (['simple', 'moderate', 'expert'].includes(value[key])) result[key] = value[key];
    } else if (key === 'musicPresence') {
      if (['quiet', 'balanced', 'frequent'].includes(value[key])) result[key] = value[key];
    } else if (numericSettings.has(key)) {
      if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = value[key];
    } else if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  return result;
}

/** The transport needs exactly these three fields. Do not forward imported extras. */
export function normalizePassport(value) {
  if (!record(value)) return null;
  const realmCode = typeof value.realmCode === 'string' ? value.realmCode.trim().toUpperCase() : '';
  const captainId = typeof value.captainId === 'string' ? value.captainId : '';
  const token = typeof value.token === 'string' ? value.token : '';
  if (!/^[A-Z0-9]{6,12}$/.test(realmCode) || !/^[a-zA-Z0-9_-]{1,128}$/.test(captainId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(token)) return null;
  return { realmCode, captainId, token };
}

function readObject(storage, key, label) {
  if (!storage || typeof storage.getItem !== 'function') throw new Error('Browser storage is unavailable. No browser data report was created.');
  let raw;
  try { raw = storage.getItem(key); } catch { throw new Error('Farwake could not read browser storage. No browser data report was created.'); }
  if (raw === null || raw === undefined) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(`The stored ${label} could not be read. No browser data report was created; the stored data has not been changed.`); }
  if (!record(value)) throw new Error(`The stored ${label} has an unrecognized format. No browser data report was created; the stored data has not been changed.`);
  return value;
}

/** This list stays in memory; the UI renders identifiers only, never passport objects. */
export function availableCaptains(storage, currentPassport = null) {
  const stored = readObject(storage, BROWSER_DATA_KEYS.passports, 'captain passports') || {};
  const choices = new Map();
  for (const [key, value] of Object.entries(stored)) {
    if (key === 'lastRealm') continue;
    const passport = normalizePassport(value);
    if (passport) choices.set(`${passport.realmCode}:${passport.captainId}`, { passport, current: false });
  }
  const current = normalizePassport(currentPassport);
  if (current) choices.set(`${current.realmCode}:${current.captainId}`, { passport: current, current: true });
  return [...choices.entries()].map(([id, value]) => ({ id, ...value }));
}

function knownCredentials(passports) {
  const values = [];
  for (const item of Object.values(passports || {})) {
    if (!record(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (credentialField(key) && typeof value === 'string' && value) values.push(value);
    }
  }
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}

function redact(value, secrets, counts) {
  if (typeof value === 'string') {
    let result = value;
    for (const secret of secrets) {
      if (!result.includes(secret)) continue;
      counts.credentialValues++;
      result = result.split(secret).join('[credential omitted]');
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(item => redact(item, secrets, counts));
  if (!record(value)) return value;
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (credentialField(key) || secrets.some(secret => key.includes(secret))) { counts.credentialFields++; continue; }
    // Use own data properties so imported __proto__ entries cannot change prototypes.
    Object.defineProperty(result, key, { value: redact(item, secrets, counts), enumerable: true, writable: true, configurable: true });
  }
  return result;
}

/** No writes, gameplay calls, network requests, or reads of unrelated storage values. */
export function collectBrowserData(storage, { now = () => new Date() } = {}) {
  const voyage = readObject(storage, BROWSER_DATA_KEYS.voyage, 'solo voyage');
  const settings = readObject(storage, BROWSER_DATA_KEYS.settings, 'device settings');
  const guidance = readObject(storage, BROWSER_DATA_KEYS.guidance, 'action-tip progress');
  const passports = readObject(storage, BROWSER_DATA_KEYS.passports, 'captain passports');
  const secrets = knownCredentials(passports);
  const counts = { credentialFields: 0, credentialValues: 0, unrecognizedSettingsFields: 0 };
  const safeSettings = settings ? pickDeviceSettings(settings, { includeLegacy: true }) : null;
  if (settings) counts.unrecognizedSettingsFields = Object.keys(settings).filter(key => !own(safeSettings, key)).length;
  const savedCaptains = [];
  for (const [key, value] of Object.entries(passports || {})) {
    if (key === 'lastRealm' || !record(value)) continue;
    // Preserve readable identifiers even if a damaged credential cannot authenticate.
    savedCaptains.push({
      realmCode: typeof value.realmCode === 'string' ? value.realmCode : key,
      captainId: typeof value.captainId === 'string' ? value.captainId : null,
      lastUsedOnThisBrowser: passports.lastRealm === key,
      recoveryCredentialStored: typeof value.token === 'string' && value.token.length > 0
    });
    counts.credentialFields += Object.keys(value).filter(credentialField).length;
  }
  const pendingCameraChanges = [];
  let keys;
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(key => typeof key === 'string' && key.startsWith(BROWSER_DATA_KEYS.cameraPrefix)).sort();
  } catch { throw new Error('Farwake could not list its pending camera settings. No browser data report was created.'); }
  for (const key of keys) {
    const value = readObject(storage, key, 'pending camera settings');
    pendingCameraChanges.push({ storageKey: key, data: value });
  }
  const data = redact({
    soloVoyage: voyage,
    deviceSettings: safeSettings,
    actionTipProfiles: guidance,
    savedCaptains,
    pendingCameraChanges
  }, secrets, counts);
  return {
    format: 'farwake-browser-data',
    formatVersion: PRIVACY_FORMAT_VERSION,
    generatedAt: new Date(now()).toISOString(),
    scope: {
      kind: 'this-browser',
      deviceWide: true,
      description: 'Farwake records saved in this browser profile. They can include more than one player or captain.',
      includesServerData: false,
      voyageState: 'Most recently saved solo voyage; unsaved gameplay is not included.'
    },
    data,
    manifest: {
      included: ['Saved solo voyage', 'Recognized device preferences', 'Locally saved action-tip profiles', 'Saved captain identifiers without credentials', 'Pending camera changes'],
      absentData: Object.entries(data).filter(([, value]) => value === null || Array.isArray(value) && value.length === 0).map(([key]) => key),
      excluded: ['Private captain credentials and credential hashes', 'Unrecognized device-settings fields', 'Unrelated browser storage', 'Shared-galaxy server records', 'Hosting and database provider logs, backups, and support correspondence'],
      omissions: counts,
      recovery: 'This is an inspection report, not a recovery passport. Use the existing save or captain-passport backup to restore play.'
    }
  };
}

function containsCredentials(value, token) {
  if (typeof value === 'string') return !!token && value.includes(token);
  if (Array.isArray(value)) return value.some(item => containsCredentials(item, token));
  if (!record(value)) return false;
  return Object.entries(value).some(([key, item]) => credentialField(key) || !!token && key.includes(token) || containsCredentials(item, token));
}

/** Retrieves one existing captain's report without joining or changing a galaxy. */
export async function requestCaptainData({ serverURL, passport, fetchImpl = globalThis.fetch?.bind(globalThis), signal } = {}) {
  const credential = normalizePassport(passport);
  if (!credential) throw new Error('Choose a valid saved captain. A galaxy invitation alone cannot export captain data.');
  if (typeof fetchImpl !== 'function') throw new Error('This browser cannot request the server report. Browser data can still be downloaded separately.');
  let endpoint;
  try {
    const url = new URL(serverURL);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
    endpoint = new URL('/api/privacy/export', url).href;
  } catch { throw new Error('The galaxy server address is not valid for a private data request.'); }
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      body: JSON.stringify({ passport: credential }), ...(signal ? { signal } : {})
    });
  } catch {
    throw new Error('The captain’s server report could not be retrieved. No server data report was downloaded. You can retry or download browser data separately.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('This saved passport could not verify access to that captain. No server data report was downloaded.');
    if (response.status === 429) throw new Error('Please wait a moment before requesting another server report. No report was downloaded.');
    throw new Error('The captain’s server report is unavailable. No server data report was downloaded. You can retry or download browser data separately.');
  }
  let body;
  try { body = await response.json(); } catch { throw new Error('The server returned an unreadable report. No server data report was downloaded.'); }
  const report = body?.export;
  if (body?.ok !== true || !record(report) || report.scope?.kind !== 'farwake-shared-captain' || report.scope?.realmCode !== credential.realmCode || report.scope?.captainId !== credential.captainId) {
    throw new Error('The server did not confirm a report for the selected captain. No server data report was downloaded.');
  }
  if (containsCredentials(report, credential.token)) throw new Error('The report failed its credential safety check and was not downloaded. Please contact the operator.');
  return report;
}
