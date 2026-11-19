/** Authored expedition gates, shared decisions, and bounded local combat. */
import { clearSidearmSight, sidearmAim } from './combat.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';
import { applyQuietEarthConsequences, quietEarthStatus } from './quiet-earth-rules.mjs';

const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const clone = value => JSON.parse(JSON.stringify(value));
const alive = actor => actor && actor.health > 0 && actor.status !== 'dead' && !actor.quietEarthDormant;
const list = value => Array.isArray(value) ? value : [];
const safeIds = values => [...new Set(list(values).filter(id => typeof id === 'string' && id.length > 0 && id.length <= 160))].slice(0, 256);
const chosenOption = (state, choice) => choice.puzzle && state.choices?.[choice.id] === 'complete' ? choice.puzzle : choice.options?.find(option => option.id === state.choices?.[choice.id]);

export function normalizeStoryState(site, saved = {}) {
  if (!site?.expedition) return null;
  const prior = saved && typeof saved === 'object' ? saved : {}, puzzles = {};
  for (const choice of site.choices || []) if (choice.puzzle) {
    const solution = list(choice.puzzle.solution), candidate = list(prior.puzzles?.[choice.id]);
    let length = 0;
    while (length < Math.min(candidate.length, solution.length - 1) && candidate[length] === solution[length]) length++;
    puzzles[choice.id] = candidate.slice(0, length);
  }
  return { version: 1, revision: Math.max(0, Math.min(1e12, Math.floor(finite(prior.revision)))), readRecords: safeIds(prior.readRecords).filter(id => site.records.some(record => record.id === id)), puzzles };
}

export function bumpStoryRevision(state) { if (state.story) state.story.revision = Math.min(1e12, (state.story.revision || 0) + 1); }

/** Existing authored encounters keep their original hostility rules. */
export function expeditionHostileTo(monster, actorId) {
  if (!alive(monster) || monster.pacified) return false;
  if (!monster.expeditionActor) return true;
  return monster.hostileToPlayer !== false || list(monster.aggressors).includes(String(actorId || 'local'));
}

const opposed = (one, two) => one !== two && alive(two) && !two.pacified && list(one.hostileTo).includes(two.factionId || two.team);
export function storyThreats(state) {
  return list(state.monsters).filter(monster => alive(monster) && !monster.pacified &&
    (!monster.expeditionActor || monster.hostileToPlayer !== false || list(monster.aggressors).length || state.monsters.some(other => opposed(monster, other))));
}

export function storyGate(state, site, gate = {}) {
  const read = new Set(state.story?.readRecords || []);
  for (const id of list(gate.requireRecords)) if (!read.has(id)) {
    const record = site.records.find(item => item.id === id);
    return { ok: false, reason: `Read ${record?.name || 'the required evidence'} first.`, nextTargetId: `${site.key}:record:${id}` };
  }
  for (const [id, expected] of Object.entries(gate.requireChoices || {})) {
    const choice = site.choices.find(item => item.id === id), value = state.choices?.[id];
    if (expected === true ? !value : Array.isArray(expected) ? !expected.includes(value) : value !== expected) {
      return { ok: false, reason: `Complete ${choice?.name || 'the preceding task'} first.`, nextTargetId: `${site.key}:choice:${id}` };
    }
  }
  if (gate.requireClear && storyThreats(state).length) return { ok: false, reason: 'End the immediate fighting or reach a ceasefire before doing this.', nextTargetId: null };
  return { ok: true };
}

export function inspectStoryRecord(state, site, id) {
  const record = site.records.find(item => item.id === id);
  if (!record) return { ok: false, reason: 'That record does not belong to this place.' };
  const gate = storyGate(state, site, record); if (!gate.ok) return gate;
  state.story ||= normalizeStoryState(site);
  if (!state.story.readRecords.includes(id)) { state.story.readRecords.push(id); bumpStoryRevision(state); }
  return { ok: true, title: record.name, text: record.text, evidenceId: id, story: storyStatus(state, site) };
}

export function inspectStoryChoice(state, site, id) {
  const choice = site.choices.find(item => item.id === id);
  if (!choice) return { ok: false, reason: 'No task is available at this object.' };
  const common = storyGate(state, site, choice), current = state.story?.puzzles?.[id] || [], selected = chosenOption(state, choice);
  const options = choice.options.map(option => {
    const gate = common.ok ? storyGate(state, site, option) : common;
    return { ...clone(option), disabled: !!state.choices[id] || !gate.ok, reason: state.choices[id] ? 'This task is already settled.' : gate.reason || '' };
  });
  const progress = choice.puzzle && !state.choices[id] ? ` Sequence: ${current.length} of ${choice.puzzle.solution.length} steps accepted.` : '';
  return { ok: true, title: choice.name, text: `${choice.text}${common.ok ? '' : ` ${common.reason}`}${progress}`,
    choice: { ...clone(choice), options }, chosen: state.choices[id] || null, resolutionText: selected?.text || null,
    progress: current.length, story: storyStatus(state, site) };
}

/** Effects are reconstructed from known, settled author choices on every load. */
export function applyStoryConsequences(state, site) {
  if (!site?.expedition) return;
  let allPeaceful = false;
  const pacified = new Set(), provoked = new Set();
  for (const choice of site.choices || []) {
    const effect = chosenOption(state, choice)?.effects;
    if (!effect) continue;
    allPeaceful ||= effect.pacify === true;
    for (const faction of list(effect.pacifyFactions)) pacified.add(faction);
    for (const faction of list(effect.provokeFactions)) provoked.add(faction);
  }
  for (const monster of state.monsters || []) {
    if (allPeaceful || pacified.has(monster.factionId)) {
      monster.pacified = true; monster.alert = false; monster.windup = 0; monster.moving = false; monster.targetId = null;
    } else if (provoked.has(monster.factionId)) monster.hostileToPlayer = true;
  }
  if (site.quietEarth) applyQuietEarthConsequences(state, site);
  state.cleared = storyThreats(state).length === 0;
}

export function claimStoryChoice(state, site, choiceId, optionId) {
  const choice = site.choices.find(item => item.id === choiceId), option = choice?.options.find(item => item.id === optionId);
  if (!choice || !option) return { ok: false, reason: 'Choose an authored action at this object.' };
  if (state.choices[choiceId]) return { ok: false, reason: 'That task has already been settled here.', chosen: state.choices[choiceId] };
  for (const gate of [choice, option]) { const access = storyGate(state, site, gate); if (!access.ok) return access; }
  state.story ||= normalizeStoryState(site);
  let settlement = option;
  if (choice.puzzle) {
    const puzzle = choice.puzzle, progress = state.story.puzzles[choiceId] ||= [];
    if (puzzle.solution[progress.length] !== optionId) {
      state.story.puzzles[choiceId] = [];
      bumpStoryRevision(state);
      return { ok: true, completed: false, wrong: true, text: puzzle.wrongText || 'The sequence resets. Check the field evidence and try again.', choiceId, optionId, progress: 0 };
    }
    progress.push(optionId);
    bumpStoryRevision(state);
    if (progress.length < puzzle.solution.length) return { ok: true, completed: false, text: option.text || `Step ${progress.length} accepted. Continue the sequence.`, choiceId, optionId, progress: progress.length };
    settlement = puzzle; state.choices[choiceId] = 'complete'; state.story.puzzles[choiceId] = [];
  } else { state.choices[choiceId] = optionId; bumpStoryRevision(state); }
  applyStoryConsequences(state, site);
  return { ok: true, completed: true, ...settlement.reward, ...(settlement.effects?.rep ? { rep: clone(settlement.effects.rep) } : {}), effects: clone(settlement.effects || {}), text: settlement.text,
    choiceId, optionId: state.choices[choiceId], story: storyStatus(state, site) };
}

/** A compact objective suitable for the field HUD, notebook, and local map. */
export function storyStatus(state, site) {
  if (!site?.expedition || !state) return null;
  if (site.quietEarth) return quietEarthStatus(state, site);
  const choices = site.choices || [], records = site.records || [], read = state.story?.readRecords || [];
  const completed = site.completionChoiceId ? !!state.choices?.[site.completionChoiceId] : choices.length ? choices.every(choice => !!state.choices?.[choice.id]) : records.every(record => read.includes(record.id));
  const outcomes = choices.map(choice => ({ choice, selected: chosenOption(state, choice) })).filter(item => item.selected);
  const notes = outcomes.map(item => item.selected.effects?.aftermath).filter(value => typeof value === 'string');
  const next = choices.find(choice => !state.choices?.[choice.id]);
  let nextTargetId = next ? `${site.key}:choice:${next.id}` : null, pendingSummary = next?.name || '';
  if (next) {
    const gate = storyGate(state, site, next);
    if (!gate.ok) { pendingSummary = gate.reason; nextTargetId = gate.nextTargetId; }
    else if (next.puzzle) pendingSummary = `${next.name}: ${(state.story?.puzzles?.[next.id] || []).length} / ${next.puzzle.solution.length} sequence steps.`;
  } else if (!completed) {
    const record = records.find(item => !read.includes(item.id));
    if (record) { nextTargetId = `${site.key}:record:${record.id}`; pendingSummary = `Read ${record.name}.`; }
  }
  return { archetypeId: site.archetypeId, title: site.name, objective: completed ? notes.at(-1) || 'This place remembers your completed work.' : site.objective || pendingSummary,
    completed, nextTargetId: completed ? null : nextTargetId, pendingSummary: completed ? 'The outcome is recorded. You can leave or look around.' : pendingSummary,
    aftermath: notes.join(' '), aftermathNotes: notes, readCount: records.filter(record => read.includes(record.id)).length,
    evidenceCount: records.length, completedTasks: outcomes.length, taskCount: choices.length, threats: storyThreats(state).length };
}

const storyViewCache = new WeakMap();
/** View-only aftermath. Unchanged animation frames reuse their entity view. */
export function storySurfaceView(surface, state) {
  const site = surface?.site; if (!site?.expedition || !state) return surface;
  const revision = `${state.story?.revision || 0}:${Object.keys(state.choices || {}).length}:${state.collected?.length || 0}`;
  const cached = storyViewCache.get(surface);
  if (cached?.revision === revision) {
    // Authority samples ambient routes on its base map. Keep the projection's
    // people at those live positions without allocating another entity array.
    // A client already animating the projected map keeps its own sampled poses.
    if (surface === cached.source) for (const { source, projected } of cached.people) {
      projected.x = source.x; projected.y = source.y; projected.facing = source.facing;
      projected.moving = !projected.hidden && source.moving; projected.life = source.life;
    }
    return cached.view;
  }
  const read = new Set(state.story?.readRecords || []), claimed = new Set(state.collected || []);
  const people = [];
  let evacuated = false, treated = false;
  for (const choice of site.choices || []) { const effects = chosenOption(state, choice)?.effects; evacuated ||= effects?.evacuateResidents === true; treated ||= effects?.treatResidents === true; }
  const view = { ...surface, expeditionStatus: storyStatus(state, site), entities: surface.entities.map(entity => {
    const done = entity.type === 'siteRecord' ? read.has(entity.data.recordId) : entity.type === 'siteChoice' ? !!state.choices?.[entity.data.choiceId] : entity.type === 'siteCache' ? claimed.has(entity.data.cacheId) : false;
    if (entity.type === 'npc' && entity.data?.siteId === site.id) {
      const projected = { ...entity, ...(evacuated && entity.data?.evacuable !== false ? { hidden: true, moving: false } : {}), ...(treated ? { health: entity.maxHealth || 100, text: entity.data?.treatedText || 'Treatment is complete. The relief team can take it from here.' } : {}), data: { ...entity.data, expeditionTreated: treated, expeditionEvacuated: evacuated } };
      people.push({ source: entity, projected }); return projected;
    }
    return done ? { ...entity, completed: true, data: { ...entity.data, completed: true, expeditionDone: true } } : entity;
  }) };
  const entry = { revision, view, source: surface, people }; storyViewCache.set(surface, entry); storyViewCache.set(view, entry); return view;
}

export const EXPEDITION_COMBAT_PROFILES = Object.freeze({
  'fast-melee': Object.freeze({ health: 48, speed: 104, damage: 9, range: 25, armor: 0, attackKind: 'melee', fireDelay: .85, windupDuration: .38 }),
  spitter: Object.freeze({ health: 68, speed: 47, damage: 12, range: 200, armor: 0, attackKind: 'ranged', fireDelay: 2.2, windupDuration: .85, preferredRange: 140 }),
  sentinel: Object.freeze({ health: 170, speed: 23, damage: 20, range: 175, armor: 10, attackKind: 'ranged', fireDelay: 2.65, windupDuration: 1.1, preferredRange: 125 }),
  'pack-stalker': Object.freeze({ health: 64, speed: 78, damage: 11, range: 25, armor: 1, attackKind: 'melee', fireDelay: 1.25, windupDuration: .45 }),
  raider: Object.freeze({ health: 84, speed: 61, damage: 10, range: 210, armor: 2, attackKind: 'ranged', fireDelay: 1.35, windupDuration: .5, preferredRange: 145 }),
  'faction-rifle': Object.freeze({ health: 100, speed: 60, damage: 10, range: 220, armor: 3, attackKind: 'ranged', fireDelay: 1.45, windupDuration: .6, preferredRange: 155 }),
  'faction-support': Object.freeze({ health: 128, speed: 42, damage: 16, range: 250, armor: 5, attackKind: 'ranged', fireDelay: 1.9, windupDuration: .85, preferredRange: 175 })
});

export function storyMonsterTemplate(site, index) {
  const authored = site.hostiles?.[index]; if (!authored) return null;
  const combatProfile = Object.hasOwn(EXPEDITION_COMBAT_PROFILES, authored.combatProfile) ? authored.combatProfile : 'fast-melee';
  const profile = EXPEDITION_COMBAT_PROFILES[combatProfile], armed = ['raider', 'faction-rifle', 'faction-support'].includes(combatProfile);
  return { ...authored, ...profile, id: `${site.key}:actor:${authored.id}`, combatProfile, expeditionActor: true,
    maxHealth: profile.health, hostileToPlayer: authored.hostileToPlayer !== false, hostileTo: safeIds(authored.hostileTo).slice(0, 8),
    team: authored.hostileToPlayer === false ? 'neutral' : 'hostile', hostile: authored.hostileToPlayer !== false,
    ...(armed ? { weapon: 'field-carbine', ownedWeapons: ['pulse-sidearm', 'field-carbine'], weaponDrawn: true } : {}),
    cooldown: .6 + index * .17, windup: 0, alert: false, facing: index % 2 ? 'left' : 'right',
    formationIndex: index, originX: authored.x, originY: authored.y, aggressors: [], pacified: false, targetId: null, moving: false };
}

export function restoreStoryMonster(base, raw = {}) {
  return { ...base, aggressors: safeIds(raw.aggressors), alert: raw.alert === true, aimAngle: finite(raw.aimAngle),
    cooldown: clamp(finite(raw.cooldown, base.cooldown), 0, 4), windup: 0, flankSide: raw.flankSide === -1 ? -1 : 1 };
}

export function recordStoryAggression(state, target, actorId) {
  if (!target?.expeditionActor || target.pacified) return;
  const id = String(actorId || 'local');
  for (const unit of state.monsters) if (unit === target || target.factionId && unit.factionId === target.factionId) {
    unit.aggressors = safeIds([...(unit.aggressors || []), id]); unit.alert = true;
  }
}

function nearestTarget(unit, actors, state) {
  let target = null, best = Infinity;
  for (const actor of actors) if (actor.person.health > 0 && !actor.person.down && expeditionHostileTo(unit, actor.id)) {
    const distance = Math.hypot(unit.x - actor.person.x, unit.y - actor.person.y);
    if (distance < best) { target = actor; best = distance; }
  }
  for (const other of state.monsters) if (opposed(unit, other)) {
    const distance = Math.hypot(unit.x - other.x, unit.y - other.y);
    if (distance < best) { target = other; best = distance; }
  }
  return target;
}

function hitTarget(state, attacker, target, damage, event, shot) {
  const person = target.person || target;
  const actual = Math.max(1, damage - (!target.person ? finite(person.armor) * .5 : 0)) * (target.person ? clamp(finite(target.damageTakenMultiplier, 1), .4, 2) : 1);
  person.health = Math.max(0, person.health - actual); person.hitUntil = state.time + .24;
  if (!target.person) { person.lastHitBy = attacker.id; person.alert = true; }
  const impact = { ...shot, id: `${shot.id}:hit`, damage: actual, targetId: target.id, targetName: target.name || 'Captain', x: person.x, y: person.y, health: person.health, maxHealth: person.maxHealth || 100 };
  event('person-hit', impact);
  if (person.health <= 0) {
    person.down = true; person.status = 'dead'; person.windup = 0; person.moving = false;
    event(target.person ? 'person-down' : 'boarder-down', { ...impact, id: `${shot.id}:down`, actorId: target.id, text: `${attacker.name} brought down ${target.name || 'a captain'}.` });
  }
}

/** Each authored unit has a bounded target pool and reuses the existing route cache. */
export function stepStoryMonster(state, unit, actors, delta, layout, event, walk) {
  if (unit.pacified) { unit.moving = false; unit.windup = 0; return; }
  const dt = clamp(finite(delta), 0, .25), at = state.time, target = nearestTarget(unit, actors, state);
  unit.cooldown = Math.max(0, finite(unit.cooldown) - dt);
  if (!target) {
    unit.moving = false; unit.windup = 0; unit.targetId = null;
    // An unprovoked animal follows a small territory route. Sapient residents
    // use the ordinary NPC-life system, outside this combatant collection.
    if (!unit.factionId && unit.hostileToPlayer === false) {
      const offsets = [[36, 0], [0, 30], [-36, 0], [0, -30]], offset = offsets[(Math.floor(at / 4) + unit.formationIndex) % offsets.length];
      const destination = { x: unit.originX + offset[0], y: unit.originY + offset[1] };
      if (isCabinWalkable(layout, destination.x, destination.y, 6)) walk(unit, destination, dt, layout, at);
    }
    return;
  }
  const person = target.person || target, distance = Math.hypot(person.x - unit.x, person.y - unit.y), visible = clearSidearmSight(layout, unit, person);
  unit.targetId = target.id;
  // Rival squads know a contested checkpoint exists across the map. They
  // approach their authored opposing side even before they have a firing line.
  // Wildlife still needs perception before pursuing a visiting captain.
  if (!unit.alert && target.person && (!visible || distance > (unit.combatProfile === 'sentinel' ? 235 : 330))) { unit.moving = false; return; }
  unit.alert = true;
  if (unit.windup > 0) {
    unit.windup = Math.max(0, unit.windup - dt); unit.moving = false;
    if (unit.windup > 0) return;
    unit.cooldown = unit.fireDelay;
    const id = `${state.id}:story-shot:${++state.shotSerial}`, ranged = unit.attackKind === 'ranged';
    const along = (person.x - unit.x) * Math.cos(unit.aimAngle) + (person.y - unit.y) * Math.sin(unit.aimAngle);
    const cross = Math.abs((person.x - unit.x) * Math.sin(unit.aimAngle) - (person.y - unit.y) * Math.cos(unit.aimAngle));
    const ray = ranged ? sidearmAim({ x: unit.x, y: unit.y, weapon: 'union-longwatch', ownedWeapons: ['union-longwatch'] }, [], { aiming: true, aimX: Math.cos(unit.aimAngle), aimY: Math.sin(unit.aimAngle) }, layout) : null;
    const wallWithinRange = !!ray?.blocked && Math.hypot(ray.to.x - unit.x, ray.to.y - unit.y) <= unit.range;
    const reach = wallWithinRange ? Math.hypot(ray.to.x - unit.x, ray.to.y - unit.y) : unit.range, radius = unit.combatProfile === 'spitter' ? 12 : 9;
    const hit = visible && (ranged ? along > 0 && along <= unit.range && cross <= radius && along - Math.sqrt(Math.max(0, radius * radius - cross * cross)) <= reach : distance <= unit.range + 8);
    const to = hit ? { x: person.x, y: person.y } : wallWithinRange ? ray.to : { x: unit.x + Math.cos(unit.aimAngle) * unit.range, y: unit.y + Math.sin(unit.aimAngle) * unit.range };
    const shot = { id, team: unit.team, factionId: unit.factionId || null, attackerId: unit.id, actorName: unit.name,
      weaponId: unit.combatProfile === 'spitter' ? 'acid-spit' : ranged ? 'raider-rifle' : 'wildlife-claws', angle: unit.aimAngle,
      from: { x: unit.x, y: unit.y }, to, x: unit.x, y: unit.y, targetX: to.x, targetY: to.y,
      targetId: hit ? target.id : null, intendedTargetId: unit.aimTargetId, hit, blocked: !visible || !hit && wallWithinRange, damage: hit ? unit.damage : 0, until: at + .26 };
    unit.lastShot = shot; unit.attackUntil = at + .26;
    if (ranged) event('person-shot', shot);
    if (hit) hitTarget(state, unit, target, unit.damage, event, shot);
    return;
  }
  const mobileShooter = ['spitter', 'raider', 'faction-rifle', 'faction-support'].includes(unit.combatProfile);
  if (mobileShooter && visible && distance < unit.preferredRange * .68 && unit.cooldown > .15) {
    const dx = (unit.x - person.x) / Math.max(1, distance), dy = (unit.y - person.y) / Math.max(1, distance);
    const retreat = { x: unit.x + dx * 62, y: unit.y + dy * 62 };
    if (isCabinWalkable(layout, retreat.x, retreat.y, 6)) { walk(unit, retreat, dt, layout, at); return; }
  }
  if (distance > unit.range || !visible) {
    let approach = person;
    if (unit.combatProfile === 'pack-stalker' && distance > 60 && distance < 280) {
      const side = unit.formationIndex % 2 ? 1 : -1, dx = person.x - unit.x, dy = person.y - unit.y;
      const flank = { x: person.x - dy / Math.max(1, distance) * side * 58, y: person.y + dx / Math.max(1, distance) * side * 58 };
      if (isCabinWalkable(layout, flank.x, flank.y, 6)) approach = flank;
    }
    walk(unit, approach, dt, layout, at); return;
  }
  if (mobileShooter && unit.cooldown > .2 && visible) {
    const side = Math.floor(at / 2 + unit.formationIndex) % 2 ? 1 : -1, dx = person.x - unit.x, dy = person.y - unit.y;
    const sidestep = { x: unit.x - dy / Math.max(1, distance) * side * 28, y: unit.y + dx / Math.max(1, distance) * side * 28 };
    if (isCabinWalkable(layout, sidestep.x, sidestep.y, 6)) { walk(unit, sidestep, dt, layout, at); return; }
  }
  unit.moving = false;
  if (!unit.cooldown && visible) {
    const dx = person.x - unit.x, dy = person.y - unit.y;
    unit.windup = unit.windupDuration; unit.aimAngle = Math.atan2(dy, dx); unit.aimTargetId = target.id; unit.attackUntil = at + unit.windup;
    unit.weaponDrawn = unit.attackKind === 'ranged'; unit.facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down';
  }
}
