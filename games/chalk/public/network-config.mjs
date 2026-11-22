// The production endpoint is set after the CHALK co-op service is ready.
export const COOP_SERVICE_URL = 'wss://dfe-chalk-coop.onrender.com/ws';

export function coopServerURL(location = globalThis.location) {
  if (!location) return null;
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  }
  return COOP_SERVICE_URL || null;
}
