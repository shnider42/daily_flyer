// Public server address only. Captain secrets remain in each player's passport.
const host = globalThis.location?.hostname || '';
const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
export const SERVER_URL = globalThis.FARWAKE_SERVER_URL || (local ? globalThis.location.origin : 'https://dfe-farwake-universe.onrender.com');
