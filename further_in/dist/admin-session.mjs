// A session gate keeps playtest controls out of the normal player journey.
const ADMIN_KEY = 'further-in-admin-v1';
const ACTION_LEVEL = Object.freeze({pattern: 1, chase: 2, hole: 2, ghost: 3});

export function isAdminUnlocked(storage) {
  try { return storage?.getItem(ADMIN_KEY) === 'unlocked'; }
  catch { return false; }
}

export function unlockAdmin(code, storage) {
  if (String(code).trim() !== '4321') return false;
  try {
    storage?.setItem(ADMIN_KEY, 'unlocked');
    return isAdminUnlocked(storage);
  } catch { return false; }
}

export function lockAdmin(storage) {
  try {
    storage?.setItem(ADMIN_KEY, 'locked');
    storage?.removeItem('further-in-test-progress');
  } catch {}
}

export function getTestingLaunch(search, storage) {
  if (!isAdminUnlocked(storage)) return null;
  const params = new URLSearchParams(search);
  const rawLevel = params.get('level');
  if (!['1', '2', '3'].includes(rawLevel)) return null;
  const level = Number(rawLevel);
  const requestedAction = params.get('action');
  return {
    level,
    action: ACTION_LEVEL[requestedAction] === level ? requestedAction : null,
    telemetry: params.get('telemetry') === '1'
  };
}

export function buildTestUrl(level, action = '', telemetry = false) {
  if (![1, 2, 3].includes(level)) throw new RangeError('Unknown floor');
  if (action && ACTION_LEVEL[action] !== level) throw new RangeError('Shortcut does not belong to this floor');
  const params = new URLSearchParams({test: '1', level: String(level)});
  if (action) params.set('action', action);
  if (telemetry) params.set('telemetry', '1');
  return './?' + params.toString();
}

export function progressStore(testing, normalStorage, sessionStorage) {
  const storage = testing ? sessionStorage : normalStorage;
  const key = testing ? 'further-in-test-progress' : 'further-in-progress';
  return {
    read() {
      try {
        const value = JSON.parse(storage?.getItem(key) ?? 'null');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch { return {}; }
    },
    save(value) {
      try { storage?.setItem(key, JSON.stringify(value)); } catch {}
    }
  };
}
