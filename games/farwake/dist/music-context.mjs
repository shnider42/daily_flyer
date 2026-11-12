/**
 * Read-only bridge between the simulation and the score. Enemy counts, planned
 * incidents and atmosphere names are deliberately not danger signals. A music
 * cue must follow something the captain has actually encountered.
 */
import { isFoggedSite, canSeeConcealedActor } from './site-visibility.mjs';
import { clearSidearmSight } from './combat.mjs';
const list = value => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const text = value => typeof value === 'string' ? value : '';
const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y)
  ? { x: value.x, y: value.y } : null;
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
const same = (a, b) => a != null && b != null && String(a) === String(b);
const UTILITY_DIALOGS = new Set([
  'settings', 'flight-menu', 'help', 'combat-help', 'map', 'galaxy', 'journal',
  'ship', 'save', 'passport', 'privacy', 'privacy-data', 'online', 'connect',
  'connecting', 'connection-error', 'new', 'captain', 'captain-setup',
  'test-gate', 'test-menu', 'test-controls', 'home', 'bunk', 'damage-overview',
  'damage-section', 'crew-departure'
]);
const SOCIAL_SITE_KINDS = new Set(['social', 'market', 'clinic']);
const SOCIAL_PEOPLE = new Set(['npc', 'mechanic', 'merchant', 'bartender', 'settler', 'contact']);

// An explicit hull target takes precedence over its owner's identity: that
// captain may be ashore, or serving aboard a completely different vessel.
function targetsOccupied(value, captainId, vesselId) {
  return vesselId != null && (value?.targetVesselId != null
    ? same(value.targetVesselId, vesselId) : same(value?.targetId, captainId));
}

/** Presentation facts also used for crew snapshots that omit exterior actors. */
export function occupiedVesselThreats(world, hull, captainId) {
  const vesselId = hull?.id ?? null, position = point(hull);
  const pursuit = vesselId != null && list(world?.enemies).some(enemy =>
    enemy?.active === true && finite(enemy.hp) > 0 && !enemy.disabled && !enemy.trainingTarget &&
    !enemy.capturedBy && !enemy.promotedVesselId && !enemy.canonicalVesselId &&
    targetsOccupied(enemy, captainId, vesselId) && distance(position, point(enemy)) <= 1100);
  const incoming = vesselId != null && list(world?.bullets).some(bullet =>
    finite(bullet?.ttl) > 0 && !same(bullet.ownerId ?? bullet.owner, captainId) &&
    targetsOccupied(bullet, captainId, vesselId) &&
    distance(position, point(bullet)) <= Math.max(180, finite(hull?.radius) + 120));
  return { vesselId, pursuit, incoming };
}

function planetTags(body, site) {
  const biome = text(body?.biome).toLowerCase(), tags = [biome];
  if (/arid|desert|dune/.test(biome)) tags.push('desert');
  if (/temperate|verdant|earth/.test(biome)) tags.push('temperate');
  if (/forest|jungle/.test(biome)) tags.push('forest');
  if (/ice|froz|snow|glaci/.test(biome)) tags.push('ice');
  if (/ocean|water|coast/.test(biome)) tags.push('ocean', 'water');
  if (/volcan|lava|ash/.test(biome)) tags.push('volcanic', 'stone');
  if (/barren|rock|dust/.test(biome)) tags.push('barren', 'stone');
  if (/industrial/.test(biome)) tags.push('industrial');
  if (/ruin/.test(biome)) tags.push('ruin');
  if (body?.homeworldOf) tags.push('alien', 'homeworld', text(body.homeworldOf));
  if (site?.atmosphere === 'choral') tags.push('alien', 'choral');
  return tags.filter(Boolean);
}

function revealedTerror(state, site, observedCue, surface) {
  // Future content supplies this only after presenting the actual reveal. A
  // location merely carrying a "terror" tag does not grant permission.
  if (observedCue?.tag === 'terror' && observedCue.revealed === true && text(observedCue.id)) {
    return `authored:${text(observedCue.id)}`;
  }
  const active = state.exploration;
  if (isFoggedSite(surface)) {
    const monster = list(active?.encounter?.monsters).find(actor => actor.species === 'bellwether' && actor.health > 0 &&
      canSeeConcealedActor(surface.combatLayout, state.person, actor));
    return monster ? `bellwether:${active.encounter.id}:${active.encounter.attemptSerial || 0}` : null;
  }
  if (active?.bodyId !== 'lilt' || site?.id !== 'submerged-stage' || !text(active.key)) return null;
  // This one authored place earns a brief unsettling treatment only after the
  // captain reads a reveal. Entering it, or any other theatre, is insufficient.
  // Use one key for both records so reading the second cannot retrigger it.
  const prefix = `${state.systemId}:${state.locationId}:explore:record:${active.key}:`;
  const inspected = list(state.activityTokens).some(token => token === prefix + 'script' || token === prefix + 'tickets');
  return inspected ? `submerged-stage:${active.key}` : null;
}

/**
 * `now` is the audio/director clock in seconds, not the simulation clock.
 * `perceivedThreat` is supplied by an already visible reticle/contact and means
 * tension, not combat. `observedCue` is an explicitly revealed narrative beat.
 * The caller may pass the exact occupied `deckHull` for a shared/NPC vessel.
 */
export function musicContext({
  game, playing = false, dialogKind = null, dialogOpen = false, surface = null,
  network = null, deckHull = null, now = 0, hidden = false,
  perceivedThreat = false, observedCue = null, dialogueActive = false
} = {}) {
  const state = game?.state || {}, mode = state.mode || 'ship', interior = state.interior;
  const body = game?.currentBody || interior?.location || null, site = body?.site || null;
  const parentId = site ? state.exploration?.bodyId || body?.parentId || site.bodyId : body?.id;
  const parentBody = site ? list(game?.system?.bodies).find(value => same(value.id, parentId)) || body : body;
  const captainId = network?.passport?.captainId || state.multiplayer?.captainId || game?.playerId || 'local';
  const onVessel = mode === 'ship' || ['ship', 'enemy', 'eva'].includes(interior?.kind);
  const occupiedHull = onVessel ? (deckHull ||
    (interior?.kind === 'enemy' ? game?.currentDamageHull?.() : state.ship)) : null;
  const vesselId = occupiedHull?.id || (onVessel ? state.multiplayer?.aboardVesselId : null);
  const shipPosition = point(occupiedHull), personPosition = point(state.person);
  const boardingId = mode === 'person' ? state.boarding?.id || null : null;
  const siteId = mode === 'person' ? state.exploration?.siteId || site?.id || null : null;
  const siteKey = mode === 'person' ? state.exploration?.encounter?.id || site?.key || null : null;
  const locationId = text(state.locationId) || text(body?.id);
  const contextKey = `${text(state.systemId)}|${siteId || locationId || ''}|${vesselId || ''}`;
  const visible = !!playing && !hidden;
  const paused = !!hidden || !!playing && !!dialogOpen && !network;
  const menuOpen = !!dialogOpen;
  const dialogue = !!dialogueActive || !!dialogOpen && !UTILITY_DIALOGS.has(dialogKind);

  // Ship damage uses the occupied vessel's own clock. Off-duty damage to a
  // parked personal ship must not change the music while the captain is ashore.
  const damage = occupiedHull?.damageControl;
  const recentImpact = list(damage?.impacts).some(impact =>
    Number.isFinite(impact?.at) && Number.isFinite(damage?.clock) &&
    damage.clock >= impact.at && damage.clock - impact.at <= 1.1 &&
    (finite(impact.strength) > 0 || finite(impact.hullDamage) > 0));
  const alarm = list(damage?.sections).some(section => finite(section?.fire) > .1 || finite(section?.breach) > .1);

  // Active pursuit must name this occupied hull. Nearby unrelated enemies and
  // future mission contacts do not qualify. Deck crew receive only these two
  // observed facts when their snapshot deliberately omits exterior actors.
  const localSpaceThreat = occupiedVesselThreats(game?.system, occupiedHull, captainId);
  const crewSpaceThreat = same(state.musicThreat?.vesselId, vesselId) ? state.musicThreat : null;
  const incoming = onVessel && (localSpaceThreat.incoming || crewSpaceThreat?.incoming === true);
  const pursuit = onVessel && (localSpaceThreat.pursuit || crewSpaceThreat?.pursuit === true);
  const layout = surface?.combatLayout;
  const groundPursuit = mode === 'person' && !onVessel && !!layout?.walkable &&
    list(state.exploration?.encounter?.monsters).some(actor =>
      finite(actor?.health) > 0 && actor.alert === true && actor.attackKind !== 'none' && !actor.stationary &&
      same(actor.targetId, captainId) && distance(personPosition, point(actor)) <= 360 &&
      canSeeConcealedActor(layout, state.person, actor) && clearSidearmSight(layout, state.person, actor));

  const contract = state.npcContract?.active ? state.npcContract : null;
  const aboardContract = !!contract && onVessel && same(contract.vesselId, vesselId);
  const complication = contract?.version === 2 ? contract.assignment?.complication : null;
  const activeComplication = aboardContract && complication?.started === true && complication.resolved !== true;
  const legacyIncident = aboardContract && contract.version !== 2 && contract.incidentStarted === true && !contract.work?.done;
  const announcedAttack = activeComplication && complication.type === 'attack' || legacyIncident && contract.roleId === 'gunner';
  const medicalEmergency = activeComplication && complication.type === 'illness';
  const eva = contract?.assignment?.eva;
  const lowSuitAir = aboardContract && interior?.kind === 'eva' && eva?.active === true && eva.warned === true && finite(eva.oxygen, Infinity) <= 30;
  const boarding = mode === 'person' && ['ship', 'enemy'].includes(interior?.kind) && state.boarding?.phase === 'active';
  const observedThreat = visible && !!(recentImpact || incoming || pursuit || groundPursuit || announcedAttack || boarding);
  const emergency = visible && !!(alarm || medicalEmergency || lowSuitAir || aboardContract && contract.emergency === true);
  const tension = visible && !!(perceivedThreat || onVessel && state.cosmicWarning || observedCue?.revealed === true && observedCue.tag === 'tension');

  const peopleNearby = mode === 'person' && list(surface?.entities).some(entity =>
    !entity?.hidden && entity?.life?.activity !== 'sleeping' &&
    (SOCIAL_PEOPLE.has(entity?.type) || entity?.data?.socialOnly === true) &&
    distance(personPosition, point(entity)) < 170);
  const social = mode === 'person' && (SOCIAL_SITE_KINDS.has(site?.kind) ||
    !interior && body?.kind === 'station' || !interior && peopleNearby);
  const scene = !playing ? 'menu' : observedCue?.tag === 'discovery' && observedCue.revealed === true ? 'discovery' : social ? 'social' : 'exploration';
  const culture = text(site?.culture) || text(body?.culture) || text(body?.faction) || text(game?.currentSystem?.faction) || 'frontier';
  const locationKind = text(site?.style) || text(site?.kind) || (onVessel ? 'ship' : text(body?.kind)) || 'space';
  const environment = mode === 'person' && !onVessel
    ? site?.kind === 'cave' || body?.biome === 'cave' ? 'cave'
      : ['planet', 'moon', 'asteroid'].includes(parentBody?.kind) ? 'planet' : null : null;
  const paletteKey = `${culture}:${text(state.systemId) || 'hearth'}:${text(parentId)}:${locationKind}`;
  const tags = [...new Set([
    scene, onVessel ? 'flight' : 'surface', onVessel ? 'ship' : 'ground',
    locationKind, culture, text(parentBody?.culture), text(site?.atmosphere), environment,
    ...planetTags(parentBody, site), pursuit || groundPursuit ? 'pursuit' : null,
    occupiedHull?.maxHull >= 700 ? 'capital' : null, emergency ? 'emergency' : null,
    aboardContract && contract.navy ? 'navy' : null, boarding ? 'boarding' : null,
    site?.military ? 'infantry' : null,
    social ? 'settlement' : 'solitude',
    ['conservatory', 'farm', 'park'].includes(locationKind) ? 'garden' : null,
    ['market', 'tavern', 'restaurant', 'farm'].includes(locationKind) ? 'whimsical' : null,
    ['clinic', 'sanctum', 'church', 'vault'].includes(locationKind) ? 'reflective' : null
  ].filter(Boolean))];
  const terrorKey = visible ? revealedTerror(state, site, observedCue, surface) : null;
  const concealedActors = isFoggedSite(surface) ? list(state.exploration?.encounter?.monsters).filter(actor => actor.concealed) : [];
  const concealedActorIds = concealedActors.map(actor => actor.id), visibleActorIds = concealedActors.filter(actor => canSeeConcealedActor(surface.combatLayout, state.person, actor)).map(actor => actor.id);
  const silence = !!hidden || visible && observedCue?.tag === 'silence' && observedCue.revealed === true;
  const scope = {
    captainId: String(captainId), vesselId: vesselId == null ? null : String(vesselId),
    mode, boardingId, siteId, siteKey, systemId: state.systemId || null,
    contextKey, shipPosition, personPosition
  };
  return {
    scene, paletteKey, culture, environment, biome: text(parentBody?.biome), bodyId: parentId || null, locationKind, locationId, contextKey, tags,
    playing: !!playing, hidden: !!hidden, now: finite(now), menuOpen, dialogue, paused,
    observedThreat, combat: observedThreat, pursuit: visible && !!(pursuit || groundPursuit), tension, emergency,
    terror: !!terrorKey, terrorKey, silence,
    safeNow: visible && !observedThreat && !tension && !emergency && !terrorKey,
    intensity: observedThreat ? .78 : emergency ? .62 : tension ? .32 : 0,
    concealedActorIds, visibleActorIds, scope, ...scope
  };
}

function eventInScene(event, scope) {
  if (event.systemId != null && scope.systemId != null && !same(event.systemId, scope.systemId)) return false;
  if (event.boardingId != null && !same(event.boardingId, scope.boardingId)) return false;
  if (event.siteId != null && !same(event.siteId, scope.siteId) && !same(event.siteId, scope.siteKey)) return false;
  return true;
}

/**
 * Classifies a freshly drained event; it does not retain or mutate it. The
 * director must deduplicate event IDs. Unscoped system-wide notifications are
 * ignored rather than letting another captain's firefight score this voyage.
 */
export function classifyMusicEvent(event, context = {}) {
  if (!event || context.playing === false || context.hidden) return null;
  const scope = context.scope || context;
  if (!eventInScene(event, scope)) return null;
  const localPerson = same(event.targetId ?? event.playerId ?? event.captainId, scope.captainId);
  const localAttacker = same(event.attackerId ?? event.ownerId ?? event.shooterId, scope.captainId);
  const localVessel = same(event.vesselId ?? event.targetVesselId, scope.vesselId);
  const firedFromHere = scope.vesselId != null && same(event.sourceVesselId, scope.vesselId);
  const currentBoarding = scope.boardingId != null && same(event.boardingId ?? event.boarding?.id, scope.boardingId);
  const positiveDamage = finite(event.damage) > 0;
  // A shared reveal/hit belongs to the other observer until this captain sees
  // it. Taking actual damage remains audible evidence, without enemy identity.
  const unseen = id => list(context.concealedActorIds).includes(id) && !list(context.visibleActorIds).includes(id);
  if (!localPerson && (unseen(event.targetId) || unseen(event.attackerId || event.actorId))) return null;

  switch (event.type) {
    case 'hit':
    case 'damage':
      // A world hit's playerId can identify the owner of a parked ship. Only
      // the occupied hull belongs to the listener's present scene.
      return positiveDamage && (localVessel || firedFromHere ||
        event.vesselId == null && event.targetVesselId == null && scope.vesselId != null && localPerson) ? 'combat' : null;
    case 'person-hit':
      return scope.mode === 'person' && positiveDamage && (localPerson || localAttacker || currentBoarding) ? 'combat' : null;
    case 'person-shot':
      if (scope.mode !== 'person') return null;
      if ((localPerson || same(event.intendedTargetId, scope.captainId)) && event.team === 'hostile') return 'combat';
      if (localAttacker && event.hit === true && event.targetId != null && !event.blocked) return 'combat';
      return currentBoarding && event.team === 'hostile' ? 'combat' : null;
    case 'enemy-shot': {
      // Legacy space events have no recipient ID. They need a locally visible
      // projectile or an explicit matching target; proximity alone is not enough.
      return scope.vesselId != null && (targetsOccupied(event, scope.captainId, scope.vesselId) ||
        event.targetId == null && event.targetVesselId == null && context.observedThreat) ? 'combat' : null;
    }
    case 'shot':
      return localAttacker && event.hit === true && event.targetId != null ? 'combat' : null;
    case 'boarding':
      return currentBoarding && event.boarding?.phase === 'active' ? 'combat' : null;
    case 'person-down':
      return localPerson || localVessel ? 'combat' : null;
    case 'boarding-warning':
      return scope.vesselId != null ? 'tension' : null;
    case 'cosmic-warning':
      return scope.vesselId != null ? 'tension' : null;
    case 'boarding-complete':
      return localVessel || currentBoarding ? 'recovery' : null;
    case 'rescue':
      return event.vesselId == null || localVessel ? 'recovery' : null;
    case 'scan':
    case 'chapter':
      return 'discovery';
    case 'vessel-captured':
      return localVessel ? 'discovery' : null;
    default:
      return null;
  }
}
