const TEAM_COUNTS = { hockey: 32, soccer: 16 };
export function validateCatalogue(sport, data) {
  const expected = TEAM_COUNTS[sport];
  if (
    !expected ||
    !Array.isArray(data?.teams) ||
    data.teams.length !== expected
  )
    throw new Error("Incomplete team catalogue");
  if (new Set(data.teams.map((team) => team.id)).size !== expected)
    throw new Error("Duplicate team IDs");
  for (const team of data.teams) {
    if (
      !Array.isArray(team.players) ||
      team.players.length !== (sport === "hockey" ? 6 : 11)
    )
      throw new Error("Incomplete playable lineup");
  }
  return data;
}
// DFE can serve the versioned API. Static hosts use the same verified snapshot.
// A bad or unavailable provider never overwrites the working fallback data.
export async function loadCatalogue(
  sport,
  { apiBase = null, snapshotBase = "data/", fetcher = fetch } = {},
) {
  const urls = [
    ...(apiBase ? [`${apiBase}/${sport}/teams`] : []),
    `${snapshotBase}teams-${sport}.json`,
  ];
  let lastError;
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(url, {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Catalogue unavailable (${response.status})`);
      return validateCatalogue(sport, await response.json());
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}
