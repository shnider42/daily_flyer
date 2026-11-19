/** Shared, deterministic progression for the first Quiet Earth corridor. */
import { isQuietEarth, QUIET_EARTH_BEATS } from './quiet-earth-content.mjs';

const list = value => Array.isArray(value) ? value : [];
const live = actor => actor && Number.isFinite(actor.health) && actor.health > 0 && actor.status !== 'dead';
const livingParticipant = actor => actor?.person && Number.isFinite(actor.person.x) && Number.isFinite(actor.person.y)
  && Number.isFinite(actor.person.health) && actor.person.health > 0 && !actor.person.down && !actor.protected;
const owns = (object, key) => Object.hasOwn(object || {}, key);
const accepted = (actual, expected) => expected === true ? !!actual : Array.isArray(expected) ? expected.includes(actual) : actual === expected;
const beatIds = new Set(QUIET_EARTH_BEATS.map(beat => beat.id));

/** Cue receipts never contain a mission stage, actor health, or invented targets. */
export function normalizeQuietEarthState(site, saved = {}) {
  if (!isQuietEarth(site)) return null;
  const prior = saved && typeof saved === 'object' ? saved : {};
  return {
    version: 1,
    cues: [...new Set(list(prior.cues).filter(id => typeof id === 'string' && beatIds.has(id)))].slice(0, QUIET_EARTH_BEATS.length),
    ambushAnnounced: prior.ambushAnnounced === true,
    escapeAnnounced: prior.escapeAnnounced === true
  };
}

// Only an authored option with its preceding evidence and choices can advance
// the encounter. A stale or malformed save cannot wake it by storing a phase.
function progression(state, site) {
  const read = new Set(list(state.story?.readRecords)), choices = {};
  for (const choice of list(site.choices)) {
    const value = state.choices?.[choice.id];
    if (!choice.options?.some(option => option.id === value)) continue;
    if (list(choice.requireRecords).some(id => !read.has(id))) continue;
    if (Object.entries(choice.requireChoices || {}).some(([id, expected]) => !owns(choices, id) || !accepted(choices[id], expected))) continue;
    const option = choice.options.find(item => item.id === value);
    if (list(option.requireRecords).some(id => !read.has(id))) continue;
    if (Object.entries(option.requireChoices || {}).some(([id, expected]) => !owns(choices, id) || !accepted(choices[id], expected))) continue;
    choices[choice.id] = value;
  }
  return {
    choices, read,
    started: choices['check-in'] === 'begin',
    triggered: choices.receiver === 'copy',
    completed: choices.receiver === 'copy' && choices.evacuate === 'seal'
  };
}

/** Rebuild atmosphere/combat flags from settled choices without restoring health. */
export function applyQuietEarthConsequences(state, site) {
  if (!state || !isQuietEarth(site)) return;
  state.quietEarth ||= normalizeQuietEarthState(site);
  const phase = progression(state, site), active = phase.triggered && !phase.completed;
  if (!phase.triggered) state.quietEarth.ambushAnnounced = false;
  if (!phase.completed) state.quietEarth.escapeAnnounced = false;
  for (const monster of list(state.monsters)) {
    if (!monster.quietEarthDormant && !monster.quietEarthActor) continue;
    const waking = active && monster.quietEarthDormant === true;
    monster.quietEarthActor = true;
    monster.quietEarthDormant = !active;
    monster.hidden = !active;
    monster.revealed = active;
    monster.pacified = !active;
    monster.hostileToPlayer = active;
    monster.hostile = active && live(monster);
    monster.team = active ? 'hostile' : 'neutral';
    if (!active || !live(monster)) {
      monster.alert = false; monster.windup = 0; monster.moving = false; monster.targetId = null;
      if (!active) monster.aggressors = [];
    } else if (waking) monster.alert = true;
  }
  state.cleared = !active || !list(state.monsters).some(monster => monster.quietEarthActor && live(monster));
}

function bump(state) {
  if (state.story) state.story.revision = Math.min(1e12, (Number.isFinite(state.story.revision) ? state.story.revision : 0) + 1);
}

/** Authority calls this once per site tick, before personal fire or pursuit. */
export function stepQuietEarthEncounter(state, actors, dt, surface, event) {
  const site = surface?.site;
  if (!state || !isQuietEarth(site) || !Number.isFinite(dt) || dt <= 0 || typeof event !== 'function') return;
  const participants = list(actors).filter(livingParticipant);
  if (!participants.length) return;
  applyQuietEarthConsequences(state, site);
  const phase = progression(state, site), progress = state.quietEarth;
  if (phase.completed) {
    if (!progress.escapeAnnounced) {
      progress.escapeAnnounced = true; bump(state);
      event('quiet-earth-beat', { id: `${state.id}:quiet-earth:escaped`, beatId: 'escaped', phase: 'complete', sfx: 'dock',
        text: 'The inner door seals. You made it out. The recovered signal is safe; the surface exit is beside you.' });
    }
    return;
  }
  if (phase.triggered) {
    if (!progress.ambushAnnounced) {
      progress.ambushAnnounced = true; bump(state);
      event('quiet-earth-beat', { id: `${state.id}:quiet-earth:ambush`, beatId: 'ambush', phase: 'escape', sfx: 'bulkhead',
        text: 'The receiver answered something inside the walls. GET BACK TO THE ENTRY. Follow the green lights. You do not have to kill them.' });
    }
    return;
  }
  if (!phase.started) return;
  for (const beat of QUIET_EARTH_BEATS) {
    if (progress.cues.includes(beat.id)) continue;
    if (!participants.some(actor => Math.hypot(actor.person.x - beat.x, actor.person.y - beat.y) <= beat.radius)) continue;
    progress.cues.push(beat.id); bump(state);
    event('quiet-earth-beat', { id: `${state.id}:quiet-earth:${beat.id}`, beatId: beat.id, phase: 'quiet', harmless: true,
      x: beat.x, y: beat.y, text: beat.text, sfx: beat.sfx });
  }
}

/** Read-only, short instructions shared by the HUD, local chart and notebook. */
export function quietEarthStatus(state, site) {
  if (!state || !isQuietEarth(site)) return null;
  const progress = progression(state, site), choices = list(site.choices), records = list(site.records);
  const completed = progress.completed, escaping = progress.triggered && !completed;
  let next = choices.find(choice => !owns(progress.choices, choice.id));
  let nextTargetId = next ? `${site.key}:choice:${next.id}` : null;
  let objective = next?.objective || (next ? `Follow the gold marker to ${next.name}.` : site.objective);
  let pendingSummary = next?.name || '';
  if (next) {
    const missing = list(next.requireRecords).find(id => !progress.read.has(id));
    if (missing) {
      const record = records.find(item => item.id === missing);
      nextTargetId = `${site.key}:record:${missing}`;
      objective = record?.objective || `Follow the gold marker. Read ${record?.name || 'the marked record'} on the way.`;
      pendingSummary = record?.name || 'Read the marked record.';
    }
  }
  if (escaping) {
    nextTargetId = `${site.key}:choice:evacuate`;
    objective = 'Get back to the entry. Follow the green lights. You do not have to kill them.';
    pendingSummary = 'At the entry console, seal the inner door. The surface exit is beside it.';
  } else if (completed) {
    nextTargetId = null;
    objective = 'You made it out. The relay is sealed and the recovered signal is safe.';
    pendingSummary = 'Leave through the surface exit beside the entry console.';
  }
  return { archetypeId: site.archetypeId, title: site.name, phase: completed ? 'complete' : escaping ? 'escape' : 'quiet',
    objective, pendingSummary, nextTargetId, completed,
    aftermath: completed ? objective : '', aftermathNotes: completed ? [objective] : [],
    readCount: records.filter(record => progress.read.has(record.id)).length, evidenceCount: records.length,
    completedTasks: Object.keys(progress.choices).length, taskCount: choices.length,
    threats: escaping ? list(state.monsters).filter(monster => monster.quietEarthActor && live(monster)).length : 0 };
}
