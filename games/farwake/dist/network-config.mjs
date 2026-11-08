// Public server address only. Captain secrets remain in each player's passport.
export const SERVER_URL = globalThis.FARWAKE_SERVER_URL || globalThis.location?.origin || '';
