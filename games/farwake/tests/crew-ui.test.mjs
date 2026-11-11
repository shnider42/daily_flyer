import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { cabinLayout } from '../dist/interior-layouts.mjs';
import { DAMAGE_CONTROL_ACTIONS, interiorDamageSummary } from '../dist/interior-damage.mjs';
import { crewTaskDefinition, CREW_WORK_ROLES } from '../dist/crew-work.mjs';
import { createLivelihoodUI } from '../dist/livelihood-ui.mjs';

// Exercise the shipped handlers; replace only browser presentation and transport.
const source = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declarations = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
function declaration(name) {
  const index = declarations.findIndex(match => match[1] === name);
  assert.ok(index >= 0, `The application declares ${name}.`);
  return source.slice(declarations[index].index, declarations[index + 1]?.index ?? source.length);
}
const appCode = ['markLivelihoodTarget', 'damageSectionText', 'openDamageSection'].map(declaration).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function watch(seed, family) {
  const game = new Game(seed, { openingMission: true });
  const offer = game.npcContractOffers().find(value => value.familyId === family);
  assert.ok(offer);
  ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }));
  return game;
}
function beginIncident(game, type, { duringFlight = false } = {}) {
  const contract = game.state.npcContract, task = crewTaskDefinition(contract);
  assert.equal(contract.assignment.complication.type, type, 'The seeded work order actually contains this incident.');
  Object.assign(game.state.person, cabinLayout(contract.classId).stations[task.station]);
  ok(game.npcContractAction('task', { taskId: task.id, solution: task.solution }));
  for (let i = 0; i < 600 && !contract.assignment.complication.started; i++) {
    // The starter hop normally arrives before the eight-second incident
    // threshold. Advance that clock while the real ship is still in transit
    // to cover the outbound UI state without changing its route or patient.
    if (duringFlight && contract.phase === 'outbound' && distance(game.state.ship, contract.dockPoint) > 275) contract.phaseClock = Math.max(contract.phaseClock, 8);
    game.step(.1, {});
  }
  assert.equal(contract.assignment.complication.started, true);
  return contract;
}
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.value = ''; this.disabled = false; this.textContent = ''; this.innerHTML = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.innerHTML = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  insertAdjacentHTML(_position, value) { this.innerHTML += value; }
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
function dialogFixture() {
  return {
    body: new Element(), opened: false, revision: 0, items: [],
    open(title, kind) { this.title = title; this.kind = kind; this.opened = true; this.revision++; this.items = []; this.body.replaceChildren(); },
    close() { if (this.opened) { this.opened = false; this.kind = null; this.revision++; } },
    html(markup) { this.body.innerHTML = markup; },
    choices(items) { this.items.push(...items.map(item => ({ ...item, disabled: !!item.disabled }))); }
  };
}
function appFixture(game) {
  const dialog = dialogFixture(), calls = [], answers = [], messages = [];
  const surface = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  const context = vm.createContext({
    game, surface, surfaceTarget: null, dialog, distance, DAMAGE_CONTROL_ACTIONS, interiorDamageSummary,
    ensureSurface() {}, currentDamageHull: () => game.state.ship, aboardDamageHull: () => true,
    esc: value => String(value), toast: value => messages.push(value), syncDeckDamage() {},
    audio: { play() {} }, updateHUD() {}, openDamageOverview() {},
    result: result => result.ok,
    async invoke(name, args) {
      calls.push({ name, args: copy(args) });
      // The ordinary shared command requires engineering. The employee-only
      // command delegates to the real work rules for the assigned emergency.
      const answer = name === 'npcContractAction'
        ? game.npcContractAction(args.action, args)
        : { ok: false, code: 'permission', reason: 'Engineering access required.' };
      answers.push(answer); return answer;
    }
  });
  vm.runInContext(appCode, context);
  return { context, dialog, surface, calls, answers, messages };
}
function livelihoodFixture(t, game, invoke) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const dialog = dialogFixture(), calls = [], refreshes = [];
  const ui = createLivelihoodUI({
    getGame: () => game, dialog,
    async invoke(name, args) { calls.push({ name, args: copy(args) }); return invoke ? invoke(name, args) : game.npcContractAction(args.action, args); },
    acceptResult: result => result.ok, refreshWorld: () => refreshes.push(true), markEntity() {},
    openJobs() {}, openShipyard() {}, openProfile() {}, openDamage() {}
  });
  return { ui, dialog, calls, refreshes, choose: label => dialog.items.find(item => item.label === label) };
}

test('the survey duty marker selects the actual navigation console from the generated deck', () => {
  const game = watch('v2-qa', 'survey'), f = appFixture(game), status = game.npcContractStatus();
  assert.equal(status.target.stationRole, 'scanner');
  const station = f.surface.entities.find(entity => entity.data?.stationRole === 'navigation');
  assert.ok(station);
  f.context.markLivelihoodTarget(status.target, { quiet: true });
  assert.equal(f.context.surfaceTarget, station.id);
  assert.equal(distance(station, status.target), 0, 'The waypoint matches the station validated by the task.');
  assert.deepEqual(f.messages, []);
});

test('a steward can repair the assigned fire through the employee command without engineering access', async () => {
  const game = watch('crew-ui-8', 'passage'), contract = beginIncident(game, 'fire');
  assert.equal(contract.roleId, 'steward');
  assert.equal(CREW_WORK_ROLES.find(role => role.id === contract.roleId).stationRole, 'medical');
  const section = game.state.ship.damageControl.sections.find(value => value.id === contract.work.sectionId);
  Object.assign(game.state.person, { x: section.x, y: section.y });
  const before = section.damage, f = appFixture(game);
  f.context.openDamageSection(section.id);
  const repair = f.dialog.items.find(item => item.label === 'Repair compartment');
  assert.ok(repair); assert.equal(repair.disabled, false);
  await repair.action();
  assert.deepEqual(f.calls, [{ name: 'npcContractAction', args: { sectionId: section.id, action: 'repair' } }]);
  ok(f.answers[0]); assert.ok(section.damage < before, 'The real employer compartment receives the repair.');
  assert.ok(contract.work.damageRepaired >= 25, 'The repair also counts toward the actual emergency.');
  assert.equal(f.dialog.opened, false);
});

test('a medical emergency can be treated from the duty menu before the pilot reaches the destination', async t => {
  const game = watch('crew-check-13', 'freight'), contract = beginIncident(game, 'illness', { duringFlight: true });
  assert.equal(contract.phase, 'outbound');
  assert.equal(contract.roleId, 'cargo', 'Medical assistance is available to the assigned employee regardless of job title.');
  Object.assign(game.state.person, cabinLayout(contract.classId).stations.medical);
  const patient = game.state.crew.find(person => person.id === contract.work.crewId), before = patient.health;
  const f = livelihoodFixture(t, game); f.ui.openDuty();
  const treat = f.choose('Treat the crewmate');
  assert.ok(treat); assert.equal(treat.disabled, false);
  await treat.action();
  assert.deepEqual(f.calls, [{ name: 'npcContractAction', args: { action: 'heal' } }]);
  assert.ok(patient.health > before, 'The enabled button performs actual treatment during flight.');
  assert.equal(contract.phase, 'outbound'); assert.equal(f.dialog.opened, false);
});

test('a delayed task acknowledgement refreshes the world without closing a newer menu', async t => {
  const game = watch('v2-qa', 'freight'), contract = game.state.npcContract, task = crewTaskDefinition(contract);
  Object.assign(game.state.person, cabinLayout(contract.classId).stations[task.station]);
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = livelihoodFixture(t, game, async (_name, args) => { await pending; return game.npcContractAction(args.action, args); });
  f.ui.openTask();
  const fields = descendants(f.dialog.body).filter(node => node.tagName === 'select');
  assert.equal(fields.length, task.solution.length);
  fields.forEach((field, index) => { field.value = task.solution[index]; });
  const action = f.choose('Confirm settings').action(), submitted = f.calls[0];
  assert.equal(submitted.name, 'npcContractAction'); assert.equal(submitted.args.taskId, task.id);
  f.dialog.close(); f.dialog.open('Captain notes', 'journal'); f.dialog.html('Keep this menu open.');
  release(); await action;
  assert.equal(contract.assignment.tasks[0].done, true, 'The server acknowledgement still records the work.');
  assert.equal(f.dialog.opened, true); assert.equal(f.dialog.kind, 'journal');
  assert.equal(f.dialog.body.innerHTML, 'Keep this menu open.'); assert.equal(f.refreshes.length, 1);
});
