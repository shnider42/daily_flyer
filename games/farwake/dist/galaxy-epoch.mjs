/** The compact chart starts a fresh WIP save generation; old voyages stay unused. */
export const GALAXY_EPOCH = 'compact-v1';
export const GALAXY_SAVE_STORAGE_KEY = 'dfe.farwake.save.compact.v1';
export const GALAXY_PASSPORT_STORAGE_KEY = 'farwake.multiplayer.passport.compact.v1';
export const NEW_GALAXY_REQUIRED = 'new-galaxy-required';

export class GalaxyEpochError extends Error {
  constructor(kind = 'save') {
    super(kind === 'realm'
      ? 'This shared galaxy uses a different map. Create a new shared galaxy and share its new invitation code.'
      : 'This save uses a different galaxy map. Start a new solo voyage on the 26-system chart.');
    this.name = 'GalaxyEpochError';
    this.code = NEW_GALAXY_REQUIRED;
  }
}

/** Check before restoration so old coordinates and missions never enter the new chart. */
export function requireCurrentGalaxy(value, kind = 'save') {
  if (value?.galaxyEpoch !== GALAXY_EPOCH) throw new GalaxyEpochError(kind);
}
