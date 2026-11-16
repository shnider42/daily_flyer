/** The public app starts empty. Personal records arrive only through local use or an explicit local import. */
import {createDefaultAreas} from './model.mjs';

export function createSeedWorkspace() {
  return {
    schemaVersion: 2, revision: 0, updatedAt: new Date().toISOString(),
    tasks: [], projects: [],
    areas: createDefaultAreas(),
    settings: {theme: 'dark', density: 'comfortable', welcomeDismissed: false, lastBackupAt: null, lastReviewAt: null}
  };
}
