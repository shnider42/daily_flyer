import { RateLimit, normaliseRealmCode, validRealmCode, verifySecret } from './protocol.mjs';

export const PRIVACY_EXPORT_VERSION = 1;
export const REQUEST_RATE_IDLE_MS = 10 * 60 * 1000;
const own = (value, key) => !!value && Object.hasOwn(value, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const entries = value => value instanceof Map ? [...value] : object(value) ? Object.entries(value) : [];
const get = (value, key) => value instanceof Map ? value.get(key) : own(value, key) ? value[key] : undefined;
const credentialKeys = new Set(['token', 'tokenhash', 'accesstoken', 'refreshtoken', 'idtoken', 'bearertoken', 'password', 'passwordhash', 'encryptedpassword', 'secret', 'secrethash', 'apikey', 'servicekey', 'servicerolekey', 'serverkey', 'keyhash', 'privatekey', 'signingkey', 'authorization', 'cookie', 'cookies', 'sessioncookie', 'sessiontoken', 'recoverycode', 'recoverytoken', 'credential', 'credentials']);
const credentialField = key => credentialKeys.has(String(key).replace(/[^a-z0-9]/gi, '').toLowerCase());

/** Preserve a person's own game records without copying credential material or
 * another human's actor details embedded in a shared boarding encounter. */
function safeCopy(value, captainId) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => safeCopy(item, captainId));
  if (value.human === true && (value.captainId || value.id) !== captainId) {
    return { human: true, captainId: value.captainId || value.id, detailsExcluded: 'Another captain’s actor details.' };
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => !credentialField(key) && !['__proto__', 'prototype', 'constructor'].includes(key)).map(([key, item]) => [key, safeCopy(item, captainId)]));
}
function pick(value, fields, captainId) {
  return Object.fromEntries(fields.filter(key => own(value, key)).map(key => [key, safeCopy(value[key], captainId)]));
}

/** A client-controlled request ID or text field could accidentally contain the
 * passport itself. Suppress known credential values wherever they occur in the
 * already scoped report, without changing the source record. */
function redactCredentialValues(value, values) {
  const credentials = [...new Set(values.filter(item => typeof item === 'string' && item.length >= 32))].sort((a, b) => b.length - a.length);
  function visit(item) {
    if (typeof item === 'string') return credentials.reduce((text, credential) => text.split(credential).join('[credential omitted]'), item);
    if (Array.isArray(item)) return item.map(visit);
    if (!object(item)) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => !credentials.some(credential => key.includes(credential))).map(([key, child]) => [key, visit(child)]));
  }
  return visit(value);
}

const CAPTAIN_FIELDS = ['id', 'name', 'createdAt', 'lastSeen', 'home', 'cameraPreferences', 'cameraRevision', 'ownedVesselId', 'aboard', 'crewRole', 'returnVesselId', 'portVesselId', 'boardingTeam', 'combatAtDisconnect'];
const GAME_FIELDS = ['version', 'seed', 'startMode', 'mode', 'systemId', 'locationId', 'credits', 'character', 'characterLocked', 'captainName', 'cargo', 'rep', 'flags', 'upgrades', 'visited', 'discovered', 'missions', 'completedJobs', 'abandonedJobs', 'journal', 'encounterHistory', 'crew', 'formerCrew', 'memorial', 'fleet', 'boardingHistory', 'knownLore', 'completedChapters', 'pendingEncounter', 'stats', 'ship', 'person', 'rng', 'encounterPolicyVersion', 'nextEncounterAt', 'lastBodyId', 'jobSerial', 'activityTokens', 'lastSaveAt', 'interior', 'storyActions', 'livelihoods', 'narrative', 'professions', 'npcContract', 'npcContractSerial', 'npcContractHistory', 'cosmicWarning', 'parkedShip', 'passenger', 'passengerSerial', 'passengerCompleted', 'passengerHistory', 'transitSerial', 'earthChoice', 'alliance', 'returnVesselId', 'multiplayer'];
const SHARED_GAME_FIELDS = ['worlds', 'explorationRecords', 'worldDirector', 'cameraPreferences', 'cameraRevision', 'boarding', 'exploration'];

/** Network-address counters are not a visitor log. Expired entries are removed
 * on access and during server maintenance, with a hard bound on memory. */
export class RequestRateLimits {
  constructor({ idleMs = REQUEST_RATE_IDLE_MS, maxEntries = 5000, now = () => Date.now() } = {}) { this.idleMs = idleMs; this.maxEntries = maxEntries; this.now = now; this.entries = new Map(); }
  prune(at = this.now()) { for (const [key, value] of this.entries) if (at - value.lastSeen >= this.idleMs) this.entries.delete(key); }
  take(address, purpose = 'realm') {
    const at = this.now(); this.prune(at);
    let entry = this.entries.get(address);
    if (!entry) {
      while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      entry = { lastSeen: at, realm: new RateLimit(2, 40), privacy: new RateLimit(.1, 3) };
      entry.realm.at = entry.privacy.at = at;
      this.entries.set(address, entry);
    }
    entry.lastSeen = at;
    return entry[purpose === 'privacy' ? 'privacy' : 'realm'].take(at);
  }
}

/** The passport is proof of control, not an email lookup or a target user ID. */
export function validExportPassport(value) {
  return object(value) && typeof value.realmCode === 'string' && validRealmCode(normaliseRealmCode(value.realmCode)) &&
    typeof value.captainId === 'string' && /^captain_[a-f0-9]{24}$/.test(value.captainId) &&
    typeof value.token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(value.token);
}
export function authenticateExport(source, passport) {
  if (!validExportPassport(passport) || normaliseRealmCode(passport.realmCode) !== (source?.id || source?.realmId)) return null;
  const captain = get(source.captains, passport.captainId);
  return captain?.id === passport.captainId && verifySecret(passport.token, captain.tokenHash) ? captain : null;
}

function gameData(captain) {
  const state = captain.game?.state || captain.game || {}, id = captain.id;
  const game = pick(state, GAME_FIELDS, id);
  if (own(state, 'boarding')) game.boarding = state.boarding ? pick(state.boarding, ['id', 'kind', 'phase', 'vesselId', 'originVesselId', 'targetId', 'leaderId', 'systemId', 'time', 'combatTime', 'outcome'], id) : null;
  if (own(state, 'exploration')) game.exploration = state.exploration ? pick(state.exploration, ['key', 'bodyId', 'siteId', 'returnPosition'], id) : null;
  const unrecognizedFields = Object.keys(state).filter(key => !GAME_FIELDS.includes(key) && !SHARED_GAME_FIELDS.includes(key));
  return { game, unrecognizedFields };
}

function sharedSources(source) {
  // A live room's record is the current version of its saved world record.
  // Do not call _captureRoom(), _persistRuntime(), document() or snapshotFor().
  const worlds = Object.fromEntries(entries(source.worlds));
  if (source.rooms instanceof Map) for (const [id, room] of source.rooms) worlds[id] = { record: room.record, enemies: room.runtime?.enemies || [] };
  return { director: source.director || {}, worlds, sites: source.sites || {} };
}

/** Export only exact identity links and values keyed by this captain. Paths
 * supply game context without copying the surrounding multi-player record. */
function identityLinks(value, captainId, ownVesselIds) {
  const keyedRecords = [], references = [];
  function visit(item, path) {
    if (item === captainId || typeof item === 'string' && ownVesselIds.has(item)) { references.push({ path, value: item }); return; }
    if (Array.isArray(item)) { item.forEach((child, index) => visit(child, [...path, index])); return; }
    if (!object(item)) return;
    for (const [key, child] of Object.entries(item)) {
      if (credentialField(key) || key === 'actor') continue;
      const next = [...path, key];
      if (key === captainId) keyedRecords.push({ path: next, value: safeCopy(child, captainId) });
      else visit(child, next);
    }
  }
  visit(value, []);
  return { keyedRecords, references };
}

export function createPrivacyExport(source, captain, { sourceKind = 'durable-snapshot', version = 0, generatedAt = new Date().toISOString(), credentialValues = [] } = {}) {
  const id = captain.id, realmCode = source.id || source.realmId;
  const vessels = entries(source.vessels).map(([, value]) => value);
  const owned = vessels.filter(vessel => vessel.ownerId === id);
  const ownedIds = new Set(owned.map(vessel => vessel.id));
  if (captain.ownedVesselId) ownedIds.add(captain.ownedVesselId);
  const ownCaptain = pick(captain, CAPTAIN_FIELDS, id), personal = gameData(captain);
  ownCaptain.game = personal.game;
  // These are already bounded to 80 by the authority and prevent duplicate
  // actions after reconnect. Exporting them must not create a new retry record.
  ownCaptain.recentCommands = (captain.recentCommands || []).map(command => pick(command, ['id', 'result'], id));
  const ownedVessels = owned.map(vessel => safeCopy(Object.fromEntries(Object.entries(vessel).filter(([key]) => key !== 'actor')), id));
  const ownedHomes = entries(source.leases).map(([, value]) => value).filter(home => home.ownerId === id).map(home => safeCopy(home, id));
  const sharedRelationships = [];
  for (const vessel of vessels) {
    if (vessel.ownerId === id) continue;
    const bunks = Object.entries(vessel.bunks || {}).filter(([, occupant]) => occupant === id).map(([bunk]) => bunk);
    const roles = ['helmOwner', 'boardingLeaderId'].filter(key => vessel[key] === id);
    const occupation = Object.keys(vessel.occupation || {}).filter(key => vessel.occupation[key] === id);
    const attacks = (vessel.pvp?.attackerIds || []).includes(id);
    const hostileToOwned = (vessel.hostileTo || []).filter(vesselId => ownedIds.has(vesselId));
    const aboard = captain.aboard === vessel.id, grant = get(vessel.grants, id);
    if (!bunks.length && !roles.length && !occupation.length && !attacks && !hostileToOwned.length && !aboard && grant === undefined) continue;
    sharedRelationships.push({ vesselId: vessel.id, vesselName: vessel.name, aboard, ...(grant === undefined ? {} : { grant: safeCopy(grant, id) }), bunks, roles, occupation, boardingAttacker: attacks, hostileToOwnedVessels: hostileToOwned });
  }
  const related = sharedSources(source);
  const sharedContributions = identityLinks(related, id, ownedIds);
  // These links include damage/capture/occupation references in shared vessels,
  // without copying another owner's inventory, grants, or full boarding state.
  const otherVessels = Object.fromEntries(vessels.filter(vessel => vessel.ownerId !== id).map(vessel => [vessel.id, Object.fromEntries(Object.entries(vessel).filter(([key]) => key !== 'actor'))]));
  const vesselLinks = identityLinks({ vessels: otherVessels }, id, ownedIds);
  sharedContributions.keyedRecords.push(...vesselLinks.keyedRecords);
  sharedContributions.references.push(...vesselLinks.references);
  const counts = { ownedVessels: ownedVessels.length, ownedHomes: ownedHomes.length, sharedRelationships: sharedRelationships.length, sharedKeyedRecords: sharedContributions.keyedRecords.length, sharedIdentityReferences: sharedContributions.references.length, recentCommands: ownCaptain.recentCommands.length };
  const report = {
    schemaVersion: PRIVACY_EXPORT_VERSION, generatedAt,
    scope: { kind: 'farwake-shared-captain', realmCode, captainId: id, source: sourceKind, durableVersion: version, isRealmOwner: source.ownerId === id },
    manifest: {
      description: 'Your selected shared captain’s records and their links in shared game state. This is a privacy export, not a passport or a restorable realm backup.',
      included: ['Captain identity, creation and last-seen times, home, settings and gameplay record', 'Retained command retry results', 'Owned vessels and homes', 'Your grants, bunk claims, and control or conflict relationships on other vessels', 'Shared game values keyed by your captain and exact references to your captain or owned vessels'],
      source: sourceKind === 'live-authority' ? 'Current authority memory, which can include changes newer than the last durable save. Exporting does not save, attach, or advance the captain.' : 'The last accepted durable realm snapshot. No game session was opened to read it.',
      counts,
      unrecognizedGameFields: personal.unrecognizedFields,
      exclusions: [
        'Passport tokens, their stored authentication hashes, and server credentials are excluded. Keep a separate passport backup to resume a captain.',
        'Other captains’ private gameplay records and full shared-world records are excluded. Shared relationships can contain public game identifiers.',
        'Indirect mentions inside another captain’s private save are not searched. Contact the operator for a broader review of a specific record.',
        'Hosting, network, security and storage-provider logs or backups are not available through this export. Contact the operator for help with a broader privacy request.',
        'Browser-only solo saves, device settings, tutorial progress, and saved passport references are exported separately on the device that holds them.',
      ],
      retention: 'This request does not create an export history or saved export file on the server. Shared saves currently have no automatic inactivity-deletion schedule.',
      requestRateCounters: 'Process-memory network-address counters expire after ten minutes without a request. Expired entries are pruned on access and once per minute; at most 5,000 entries are retained. They are not written to realm saves.',
      contact: 'chris@holtsnidertech.com',
    },
    captain: ownCaptain, ownedVessels, ownedHomes, sharedRelationships, sharedContributions,
  };
  return redactCredentialValues(report, [captain.tokenHash, ...credentialValues]);
}
