/** The public app starts empty. Personal records arrive only through local use or an explicit local import. */
export function createSeedWorkspace() {
  return {
    schemaVersion: 1, revision: 0, updatedAt: new Date().toISOString(),
    tasks: [], projects: [],
    settings: {theme: 'dark', density: 'comfortable', welcomeDismissed: false, lastBackupAt: null, lastReviewAt: null}
  };
}
