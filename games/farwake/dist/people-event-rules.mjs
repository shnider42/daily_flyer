/** Optional local scenes share the existing encounter and relationship records.
 * No clock, menu opening or client-provided outcome can reroll a scene. */
import { PEOPLE_ENCOUNTERS } from './people-event-content.mjs';
import { generateSurface } from './surface.mjs';
import { liveInteractionSurface, interactionInRange } from './live-surface.mjs';

const byId = new Map(PEOPLE_ENCOUNTERS.map(event => [event.id, event]));
const hash = value => { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; };
const contactId = entity => entity?.data?.contactId || String(entity?.id || '').replace(/^quest:/, '');
const finite = value => Number.isFinite(value) ? value : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const selected = (game, event) => {
  const group = event?.peopleEvent?.group;
  if (!group) return false;
  const alternatives = PEOPLE_ENCOUNTERS.filter(value => value.peopleEvent.group === group);
  return alternatives[hash(`${game.state.seed}:${group}:people-v1`) % alternatives.length]?.id === event.id;
};

/** Resolve a real present speaker, including the same short walking-NPC grace
 * as other authoritative interactions. The other participant may be elsewhere
 * in this port; each scene is told through their actual notes and replies. */
export function peopleEventSource(game, event, requestedEntityId) {
  const state = game.state;
  if (!event?.peopleEvent || !selected(game, event) || state.mode !== 'person' || state.interior || state.exploration || state.boarding?.phase === 'active' || state.person?.down || !(state.person?.health > 0)) return null;
  if (event.conditions.systemId !== state.systemId || event.conditions.locationId !== state.locationId || state.openingMission?.status === 'active') return null;
  const body = game.currentBody;
  if (!body || body.id !== state.locationId) return null;
  const key = `${state.seed}:${state.systemId}:${body.id}:${state.flags?.length || 0}`;
  if (game._peopleEventSurface?.key !== key) game._peopleEventSurface = { key, surface: generateSurface(body, state.seed, state.flags || []) };
  const surface = liveInteractionSurface(game, game._peopleEventSurface.surface);
  const participants = event.peopleEvent.participants.map(id => `quest:${id}`);
  if (requestedEntityId && !participants.includes(requestedEntityId)) return null;
  const entity = surface.entities.find(person => participants.includes(person.id) && (!requestedEntityId || person.id === requestedEntityId) && person.type === 'npc' && !person.hidden && !person.data?.automated && person.life?.activity !== 'sleeping' && interactionInRange(game, surface, person, 46));
  return entity ? { sourceType: 'person', sourceId: entity.id, entityId: entity.id } : null;
}

export function peopleEventAvailable(game, event, source = null) {
  return !!event?.peopleEvent && !game.state.encounterHistory?.includes(event.id) && !!peopleEventSource(game, event, source?.entityId || (source?.sourceType === 'person' ? source.sourceId : null));
}

export function peopleEventSourceAvailable(game, pending) {
  const event = byId.get(pending?.id);
  if (!event) return true;
  return !!pending.entityId && !!peopleEventSource(game, event, pending.entityId);
}

/** One optional action in a normal nearby NPC conversation, never a notice. */
export function peopleEventFor(game, entity) {
  const id = contactId(entity);
  const event = PEOPLE_ENCOUNTERS.find(value => value.peopleEvent.participants.includes(id) && peopleEventAvailable(game, value, { entityId: entity.id }));
  return event ? { id: event.id, title: event.title } : null;
}

/** Call once after ordinary encounter effects, before adding encounterHistory.
 * Trust and memories stay in the captain's existing People record. */
export function recordPeopleEvent(game, encounter, choice) {
  const event = byId.get(encounter?.id), canonical = event?.choices.find(value => value.id === choice?.id);
  if (!canonical || game.state.encounterHistory?.includes(event.id)) return false;
  const state = game.state.narrative || game.initializeNarrative?.();
  if (!state) return false;
  state.relations ||= {}; state.met ||= [];
  const speakerId = String(game.state.pendingEncounter?.entityId || '').replace(/^quest:/, '');
  if (event.peopleEvent.participants.includes(speakerId) && !state.met.includes(speakerId)) state.met.push(speakerId);
  const at = Math.round(Math.max(0, finite(game.state.stats?.time)));
  for (const id of event.peopleEvent.participants) {
    const relation = state.relations[id] ||= { trust: 0, memories: [] };
    const text = (canonical.peopleReactions?.[id] || canonical.result).slice(0, 300);
    // These scenes are once-only; the remembered sentence also makes the hook
    // idempotent if a durable command is retried before its history is applied.
    if (relation.memories.some(memory => memory.text === text)) continue;
    relation.trust = clamp(finite(relation.trust) + finite(canonical.peopleTrust?.[id]), -20, 20);
    relation.memories.push({ text, at }); relation.memories = relation.memories.slice(-6);
  }
  return true;
}

export function peopleEventResponse(game, entity) {
  const id = contactId(entity), history = game.state.encounterHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const event = byId.get(history[i]);
    if (!event?.peopleEvent.participants.includes(id)) continue;
    const choice = event.choices.find(value => game.state.flags?.includes(`${event.id}:${value.id}`));
    if (!choice) continue;
    return { context: 'local-choice', incidentId: event.id, greeting: choice.peopleReactions?.[id] || choice.result,
      rumor: 'That decision is in your voyage log. We can still talk about the work in front of us.', updateLabel: `About ${event.title.toLowerCase()}` };
  }
  return null;
}
