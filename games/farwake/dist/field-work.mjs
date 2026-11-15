/** Personal field qualifications over physical, shared expedition objects. */
import { fieldSites, fieldObjectPosition, inspectFieldObject, performFieldObject } from './floodworks.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const time = game => Math.max(0, finite(game.state.stats?.time) ? game.state.stats.time : 0);
const fail = (reason, code = 'field-work') => ({ ok: false, reason, code });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const locations = Object.freeze({
  'floodworks-6': { systemId: 'brindle', bodyId: 'orchard', name: 'Floodworks 6', bodyName: 'Orchard Nine' },
  'condenser-annex': { systemId: 'meridian', bodyId: 'serein', name: 'Condenser annex', bodyName: 'Serein' },
  'archive-annex': { systemId: 'vesper', bodyId: 'lilt', name: 'Archive annex', bodyName: 'Lilt' }
});
export const FIELD_WORK_HOME = Object.freeze({ systemId: 'brindle', bodyId: 'orchard', siteId: 'floodworks-6', entityId: 'orchard:site:floodworks-6', label: 'Floodworks 6 · Orchard Nine' });
export const FIELD_TOOLS = Object.freeze([
  Object.freeze({ id: 'field_cutter', key: 'cutter', name: 'Field cutter', objectId: 'workshop-cutter', description: 'Open marked service panels and cut an isolated access route.' }),
  Object.freeze({ id: 'power_bridge', key: 'powerBridge', name: 'Portable power bridge', objectId: 'workshop-bridge', description: 'Reconnect marked service buses and restore a safe route.' })
]);
export const FIELD_CAREERS = Object.freeze([
  Object.freeze({ id: 'engineering', name: 'Field engineering', deskId: 'workshop-cutter', ranks: ['Apprentice', 'Field technician', 'Systems technician', 'Commissioning specialist'] }),
  Object.freeze({ id: 'rescue', name: 'Field rescue', deskId: 'entry-aid', ranks: ['Volunteer', 'Field responder', 'Rescue technician', 'Relief specialist'] })
]);
const step = (id, label, siteId, objectId, action, kinds, detail = '') => ({ id, label, siteId, objectId, action, kinds: Array.isArray(kinds) ? kinds : [kinds], detail });
const toolStep = (toolId, label) => ({ id: `tool:${toolId}`, label, siteId: 'floodworks-6', objectId: FIELD_TOOLS.find(tool => tool.id === toolId).objectId, action: 'claim', kinds: ['tool'], toolId });
const casualtySteps = (siteId, id, name) => [
  step(`assess:${id}`, `Check ${name}’s condition`, siteId, `casualty-${id}`, 'inspect', 'inspect', 'Reach the person and read their condition before giving care.'),
  step(`care:${id}`, `Give ${name} field care`, siteId, `casualty-${id}`, 'stabilize', ['stabilize', 'aftercare'], 'Stabilize an injured person, or provide follow-up care if another crew has already brought them to safety.'),
  step(`receive:${id}`, `Account for ${name} at the entry aid point`, siteId, `casualty-${id}`, 'handover', ['rescue', 'aftercare'], 'Escort the person to the entry aid point and record their arrival. A later responder records only their own follow-up care.')
];
export const FIELD_ASSIGNMENTS = Object.freeze([
  {
    id: 'engineering-safe-access', careerId: 'engineering', title: 'Make the service passage safe', reward: 145, qualification: 'Field technician', requires: null,
    summary: 'Inspect the damaged passage, collect your own cutter, open the service panel, and inspect the isolated pump controls.',
    steps: [step('inspect-panel', 'Inspect the damaged service panel', 'floodworks-6', 'service-panel', 'inspect', 'inspect'), toolStep('field_cutter', 'Collect your field cutter from the workshop'), step('cut-panel', 'Cut a safe service opening', 'floodworks-6', 'service-panel', 'cut', 'cut'), step('inspect-pump', 'Inspect the isolated pump controls', 'floodworks-6', 'pump-terminal', 'inspect', 'inspect')]
  },
  {
    id: 'engineering-condenser', careerId: 'engineering', title: 'Restore the Serein condenser annex', reward: 225, qualification: 'Systems technician', requires: 'engineering-safe-access',
    summary: 'Take the workshop’s portable bridge to Serein. Open the service route, restore the condenser supply, and read its maintenance record.',
    steps: [toolStep('power_bridge', 'Collect your portable power bridge'), step('inspect-feed', 'Inspect the condenser service feed', 'condenser-annex', 'service-panel', 'inspect', 'inspect'), step('open-feed', 'Open the condenser service route', 'condenser-annex', 'service-panel', 'cut', 'cut'), step('restore-feed', 'Bridge the condenser supply', 'condenser-annex', 'pump-terminal', 'bridge', 'power'), step('read-log', 'Read the restored maintenance record', 'condenser-annex', 'archive-terminal', 'read', 'archive')]
  },
  {
    id: 'engineering-commission', careerId: 'engineering', title: 'Sign off the Floodworks machinery', reward: 290, qualification: 'Commissioning specialist', requires: 'engineering-condenser',
    summary: 'Work both release controls during the safe pressure cycle, verify the return shortcut, and recover the machine’s archive.',
    steps: [step('release-port', 'Release or verify the port coupling', 'floodworks-6', 'release-port', 'release', 'release'), step('release-starboard', 'Release or verify the starboard coupling', 'floodworks-6', 'release-starboard', 'release', 'release'), step('verify-route', 'Open or verify the return shortcut', 'floodworks-6', 'shortcut-lever', 'open', 'shortcut'), step('recover-archive', 'Read the machinery archive', 'floodworks-6', 'archive-terminal', 'read', 'archive')]
  },
  {
    id: 'rescue-mara', careerId: 'rescue', title: 'Bring Mara to the aid point', reward: 150, qualification: 'Field responder', requires: null,
    summary: 'Find Mara, assess and stabilize her, then accompany her to the aid point. If she is already safe, provide and record a follow-up check.',
    steps: casualtySteps('floodworks-6', 'mara', 'Mara')
  },
  {
    id: 'rescue-ivo', careerId: 'rescue', title: 'Clear Ivo’s way out', reward: 220, qualification: 'Rescue technician', requires: 'rescue-mara',
    summary: 'Check Ivo, verify the machinery’s safe return passage, give field care, and account for him at the entry aid point.',
    steps: [casualtySteps('floodworks-6', 'ivo', 'Ivo')[0], step('safe-return', 'Verify the return shortcut', 'floodworks-6', 'shortcut-lever', 'open', 'shortcut'), ...casualtySteps('floodworks-6', 'ivo', 'Ivo').slice(1)]
  },
  {
    id: 'rescue-archive', careerId: 'rescue', title: 'Relief at the Lilt archive annex', reward: 275, qualification: 'Relief specialist', requires: 'rescue-ivo',
    summary: 'Restore the annex’s safe supply, assess the stranded archivist, and accompany Lin to the local entry aid point. This is a ground rescue, with no ship transport required.',
    steps: [toolStep('power_bridge', 'Collect your portable power bridge'), step('inspect-supply', 'Inspect the archive supply', 'archive-annex', 'pump-terminal', 'inspect', 'inspect'), step('restore-supply', 'Restore the archive supply', 'archive-annex', 'pump-terminal', 'bridge', 'power'), ...casualtySteps('archive-annex', 'lin', 'Lin')]
  }
].map(value => Object.freeze({ ...value, steps: Object.freeze(value.steps.map(item => Object.freeze(item))) })));

const assignment = id => FIELD_ASSIGNMENTS.find(value => value.id === id);
const career = id => FIELD_CAREERS.find(value => value.id === id);
const allowedKinds = new Set(['inspect', 'cut', 'power', 'archive', 'release', 'shortcut', 'stabilize', 'escort-start', 'rescue', 'aftercare', 'tool']);
const allowedActions = new Set(['inspect', 'claim', 'cut', 'bridge', 'read', 'release', 'open', 'stabilize', 'escort', 'handover']);
const knownObjects = new Set(['workshop-cutter', 'workshop-bridge', 'service-panel', 'pump-terminal', 'archive-panel', 'archive-terminal', 'release-port', 'release-starboard', 'shortcut-lever', 'casualty-mara', 'casualty-ivo', 'casualty-lin', 'entry-aid']);
const receiptKey = receipt => `${receipt.siteId}:${receipt.objectId}:${receipt.action}:${receipt.kind}`;
function validReceipt(raw) {
  if (!raw || !Object.hasOwn(locations, raw.siteId) || !knownObjects.has(raw.objectId) || !allowedKinds.has(raw.kind) || !allowedActions.has(raw.action)) return null;
  const value = { siteId: raw.siteId, objectId: raw.objectId, action: raw.action, kind: raw.kind, at: finite(raw.at) ? Math.max(0, raw.at) : 0 };
  return { ...value, id: receiptKey(value) };
}
/** Called on load; status uses the same pure projection without writing to state. */
export function normalizeFieldWork(raw) {
  raw = object(raw);
  const receipts = {};
  for (const candidate of Object.values(object(raw.contributions)).slice(-192)) { const value = validReceipt(candidate); if (value) receipts[value.id] = value; }
  const completed = {};
  for (const definition of FIELD_ASSIGNMENTS) {
    const saved = object(raw.completed)[definition.id];
    if (saved && typeof saved === 'object') completed[definition.id] = { assignmentId: definition.id, careerId: definition.careerId, paid: definition.reward, at: finite(saved.at) ? Math.max(0, saved.at) : 0 };
  }
  const active = assignment(raw.active?.assignmentId);
  return { version: 1, tools: { cutter: raw.tools?.cutter === true, powerBridge: raw.tools?.powerBridge === true }, contributions: receipts, completed,
    active: active && !completed[active.id] ? { assignmentId: active.id, startedAt: finite(raw.active.startedAt) ? Math.max(0, raw.active.startedAt) : 0 } : null };
}
const personal = game => normalizeFieldWork(game.state.fieldWork);
const ownedTools = state => FIELD_TOOLS.filter(tool => state.tools[tool.key]).map(tool => tool.id);
const actor = game => String(game.state.multiplayer?.captainId || game.playerId || 'local');
function fieldContext(game, { living = true } = {}) {
  const state = game.state, active = state.exploration, location = state.interior?.location;
  if (state.mode !== 'person' || state.interior?.kind !== 'site' || !active || !location?.site) return fail('Visit a field workshop or aid point inside an expedition site.', 'location');
  if (living && (!finite(state.person?.health) || state.person.health <= 0 || state.person.down || !finite(state.person.x) || !finite(state.person.y))) return fail('You must be conscious and on your feet to do field work.', 'incapacitated');
  const body = game.system?.bodies?.find(value => value.id === active.bodyId), site = body && fieldSites(body).find(value => value.id === active.siteId);
  if (!site || location.site.id !== site.id || !active.encounter || locations[site.id]?.systemId !== state.systemId || locations[site.id]?.bodyId !== body.id) return fail('This place has no registered field assignment.', 'location');
  return { ok: true, site: { ...site, key: `${body.id}:site:${site.id}`, bodyId: body.id }, encounter: active.encounter, active, body };
}
function atObject(game, context, objectId) {
  if (!context.ok) return context;
  const position = fieldObjectPosition(context.encounter, context.site, objectId);
  if (!position || !finite(position.x) || !finite(position.y)) return fail('That field object is unavailable here.', 'target');
  if (distance(game.state.person, position) > 46) return fail(`Move closer to ${position.name || 'the marked field object'}.`, 'distance');
  const layout = game._expeditionSurface?.()?.combatLayout, person = game.state.person;
  if (!layout?.walkable || !isCabinWalkable(layout, person.x, person.y, 6)) return fail('Reach the object from a safe, open part of the site.', 'blocked');
  // A cutting seam can occupy the endpoint wall tile. Every intervening tile
  // must still be open, so a nearby console cannot be used through a partition.
  const tile = layout.tile || 24, targetX = Math.floor(position.x / tile), targetY = Math.floor(position.y / tile), count = Math.max(1, Math.ceil(distance(person, position) / 3));
  for (let i = 1; i < count; i++) {
    const x = person.x + (position.x - person.x) * i / count, y = person.y + (position.y - person.y) * i / count;
    if (Math.floor(x / tile) === targetX && Math.floor(y / tile) === targetY) continue;
    if (!isCabinWalkable(layout, x, y, 1)) return fail('Reach this object from its open approach; a wall blocks your access.', 'blocked');
  }
  return { ok: true, position };
}
function targetFor(game, siteId, objectId, label) {
  const place = locations[siteId];
  if (!place) return null;
  const here = game.state.systemId === place.systemId && game.state.exploration?.siteId === siteId && game.state.exploration?.bodyId === place.bodyId;
  return { systemId: place.systemId, bodyId: place.bodyId, siteId, ...(here ? { entityId: `${place.bodyId}:site:${siteId}:field:${objectId}`, fieldObjectId: objectId } : { entityId: `${place.bodyId}:site:${siteId}` }), label: label || `${place.name} · ${place.bodyName}` };
}
function proofFor(state, item) {
  if (item.toolId) return state.tools[FIELD_TOOLS.find(tool => tool.id === item.toolId).key] === true;
  return Object.values(state.contributions).some(value => value.siteId === item.siteId && value.objectId === item.objectId && value.action === item.action && item.kinds.includes(value.kind));
}
function nextStep(game, definition, state) {
  const item = definition.steps.find(value => !proofFor(state, value));
  if (!item) return null;
  let objectId = item.action === 'handover' ? 'entry-aid' : item.objectId, label = item.label, detail = item.detail;
  if (item.action === 'handover' && game.state.exploration?.siteId === item.siteId) {
    const id = item.objectId.replace('casualty-', ''), survivor = game.state.exploration.encounter.field?.survivors?.[id];
    if (survivor && survivor.status !== 'safe') { objectId = item.objectId; label = `Escort ${id[0].toUpperCase() + id.slice(1)} to the entry aid point`; detail = 'Ask them to follow, then walk with them to the marked aid point. Return there to record the arrival.'; }
  }
  return { ...item, label, detail, target: targetFor(game, item.siteId, objectId, label) };
}
function assignmentView(game, definition, state, context) {
  const complete = !!state.completed[definition.id], active = state.active?.assignmentId === definition.id, prerequisite = definition.requires && !state.completed[definition.requires];
  const steps = definition.steps.map(item => ({ id: item.id, label: item.label, done: proofFor(state, item) })), next = nextStep(game, definition, state), deskId = career(definition.careerId).deskId;
  const desk = atObject(game, context, deskId);
  let reason = complete ? 'This assignment has already been paid.' : prerequisite ? `Complete ${assignment(definition.requires).title} first.` : state.active && !active ? 'Finish or return your current field assignment first.' : !desk.ok ? desk.reason : null;
  return { id: definition.id, careerId: definition.careerId, title: definition.title, summary: definition.summary, reward: definition.reward, qualification: definition.qualification,
    status: complete ? 'completed' : active ? (next ? 'active' : 'debrief') : prerequisite ? 'locked' : 'available', steps, next,
    target: next?.target || targetFor(game, context.ok ? context.site.id : definition.steps[0].siteId, deskId, 'Report your completed field work'),
    action: { action: active ? 'settle' : 'begin', assignmentId: definition.id, label: active ? `File completion · ${definition.reward} CR` : `Take assignment · ${definition.title}`, available: !reason && (!active || !next), reason: reason || (active && next ? 'Complete your own field tasks before filing the assignment.' : null) } };
}
function objectView(game, context, objectId, state) {
  if (!context.ok) return { ok: false, id: objectId, name: 'Field object', text: context.reason, actions: [] };
  // Presentation cannot advance a shared machine or normalize its saved state in place.
  const value = inspectFieldObject(clone(context.encounter), context.site, objectId, { actorId: actor(game), person: clone(game.state.person), tools: ownedTools(state) });
  if (!value?.ok) return { ...value, id: objectId, actions: [] };
  const check = atObject(game, context, objectId);
  return { ...value, target: targetFor(game, context.site.id, objectId, value.name), actions: (value.actions || []).map(item => ({ action: item.id, objectId, label: item.label,
    available: check.ok && item.enabled !== false, reason: !check.ok ? check.reason : item.reason || null })) };
}

export const FieldWorkRules = {
  initializeFieldWork() { this.state.fieldWork = normalizeFieldWork(this.state.fieldWork); return this.state.fieldWork; },
  fieldWorkStatus(request = null) {
    const state = personal(this), context = fieldContext(this), objectId = typeof request === 'string' ? request : request?.objectId;
    const assignments = FIELD_ASSIGNMENTS.map(definition => assignmentView(this, definition, state, context)), active = assignments.find(value => value.id === state.active?.assignmentId) || null;
    return { version: 1, active, title: active?.title || 'Field work', objective: active?.next?.label || (active ? 'Report at a field workshop or aid point for your pay and qualification.' : context.ok ? 'Choose a posted field assignment or explore the connected routes.' : 'Begin at Floodworks 6 on Orchard Nine, in Brindle.'),
      target: active?.target || { ...FIELD_WORK_HOME }, inFieldSite: context.ok, siteName: context.ok ? context.site.name : null,
      tools: FIELD_TOOLS.map(tool => ({ ...tool, owned: state.tools[tool.key], target: targetFor(this, 'floodworks-6', tool.objectId, tool.name) })), assignments,
      careers: FIELD_CAREERS.map(value => { const rows = assignments.filter(row => row.careerId === value.id), completed = rows.filter(row => row.status === 'completed').length; return { id: value.id, name: value.name, completed, total: rows.length, rank: value.ranks[completed], next: rows.find(row => row.status !== 'completed') || null }; }),
      actions: active ? [active.action, { action: 'cancel', assignmentId: active.id, label: 'Return this assignment without pay', available: atObject(this, context, career(active.careerId).deskId).ok, reason: atObject(this, context, career(active.careerId).deskId).reason || null }] : assignments.filter(value => value.status === 'available').map(value => value.action),
      ...(objectId ? { object: objectView(this, context, objectId, state) } : {}) };
  },
  fieldWorkAction(args = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return fail('Choose a current field action.', 'action');
    const context = fieldContext(this); if (!context.ok) return context;
    if (this.state.pendingEncounter) return fail('Finish your conversation before starting field work.', 'encounter');
    const state = personal(this), action = args.action;
    if (['begin', 'settle', 'cancel'].includes(action)) {
      const definition = assignment(args.assignmentId || state.active?.assignmentId);
      if (!definition) return fail('Choose a posted field assignment.', 'assignment');
      const check = atObject(this, context, career(definition.careerId).deskId); if (!check.ok) return check;
      if (state.completed[definition.id]) return fail('This assignment has already been completed and paid.', 'completed');
      if (action === 'begin') {
        if (state.active) return fail('Finish or return your current field assignment first.', 'active');
        if (definition.requires && !state.completed[definition.requires]) return fail(`Complete ${assignment(definition.requires).title} first.`, 'qualification');
        state.active = { assignmentId: definition.id, startedAt: time(this) }; this.state.fieldWork = state;
        return { ok: true, text: `${definition.title}. Your own earlier field work remains on the record.`, fieldWork: this.fieldWorkStatus() };
      }
      if (state.active?.assignmentId !== definition.id) return fail('That is not your active field assignment.', 'assignment');
      if (action === 'cancel') { state.active = null; this.state.fieldWork = state; return { ok: true, text: 'Assignment returned without pay. Your tools and verified field work remain recorded.', fieldWork: this.fieldWorkStatus() }; }
      if (definition.steps.some(item => !proofFor(state, item))) return fail('Complete your own field tasks before filing the assignment.', 'evidence');
      state.completed[definition.id] = { assignmentId: definition.id, careerId: definition.careerId, paid: definition.reward, at: time(this) }; state.active = null;
      this.state.fieldWork = state; this.state.credits += definition.reward;
      const text = `${definition.title} complete. ${definition.reward} CR paid; ${definition.qualification} qualification recorded.`;
      this._log?.(definition.title, text, 'field-work'); this._event?.('field-work-complete', { assignmentId: definition.id, text, paid: definition.reward });
      return { ok: true, text, paid: definition.reward, qualification: definition.qualification, fieldWork: this.fieldWorkStatus() };
    }
    if (!allowedActions.has(action) || typeof args.objectId !== 'string' || !knownObjects.has(args.objectId)) return fail('Choose an action offered by this field object.', 'action');
    const check = atObject(this, context, args.objectId); if (!check.ok) return check;
    const draft = clone(context.encounter), result = performFieldObject(draft, context.site, args.objectId, action, { actorId: actor(this), person: this.state.person, tools: ownedTools(state) });
    if (!result?.ok) return result || fail('That field action could not be completed.', 'action');
    const evidence = Array.isArray(result.evidence) ? result.evidence : result.evidence ? [result.evidence] : [];
    if (result.grantTool) {
      const tool = FIELD_TOOLS.find(value => value.id === result.grantTool);
      if (!tool || context.site.id !== 'floodworks-6' || args.objectId !== tool.objectId || action !== 'claim') return fail('This workshop cannot issue that tool.', 'tool');
      state.tools[tool.key] = true; evidence.push({ kind: 'tool', objectId: args.objectId, siteId: context.site.id });
    }
    const newEvidenceKinds = [];
    for (const entry of evidence) {
      const receipt = validReceipt({ ...entry, siteId: context.site.id, objectId: entry.objectId || args.objectId, action, at: time(this) });
      if (receipt && !state.contributions[receipt.id]) { state.contributions[receipt.id] = receipt; newEvidenceKinds.push(receipt.kind); }
    }
    const firstArchiveRead = action === 'read' && !context.encounter.field?.archiveRead && draft.field?.archiveRead === true;
    const firstHandover = action === 'handover' && newEvidenceKinds.some(kind => kind === 'rescue' || kind === 'aftercare');
    Object.assign(context.encounter, draft); this.state.fieldWork = state;
    this.state.explorationRecords[context.active.key] = context.encounter;
    if (result.geometryChanged) this._expeditionMap = null;
    // These are facts from a completed physical action, not client-supplied
    // musical commands. Verification taps and replayed receipts stay quiet.
    if (result.geometryChanged || firstArchiveRead || firstHandover) this._event?.('field-work-action', {
      siteId: context.site.id, siteKey: context.active.key, systemId: this.state.systemId,
      captainId: actor(this), objectId: args.objectId, action, fieldKind: context.site.fieldKind,
      geometryChanged: !!result.geometryChanged, foremanStopped: !!draft.field?.foreman?.disabled,
      firstArchiveRead, firstHandover, evidenceKinds: newEvidenceKinds
    });
    return { ...result, fieldWork: this.fieldWorkStatus(args.objectId) };
  }
};
