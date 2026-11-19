import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { getGunneryView } from '../dist/gunnery-view.mjs';
import { getPersonalWeapon, sidearmAim } from '../dist/combat.mjs';
import { personalFireLayout, personalFireUsesShipStation } from '../dist/personal-fire.mjs';
import { visibleSiteHostiles, isFoggedSite } from '../dist/site-visibility.mjs';
import { expeditionHostileTo, storyStatus } from '../dist/expedition-story-rules.mjs';
import { inputVector } from '../dist/input.mjs';

const source = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declarations = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration = name => {
  const index = declarations.findIndex(match => match[1] === name); assert.ok(index >= 0, name);
  return source.slice(declarations[index].index, declarations[index + 1]?.index ?? source.length);
};
const code = ['personalAimAvailable', 'pointerAimAvailable', 'personCombat', 'personHostiles', 'personAimTargets', 'armedOnFoot', 'sidearmDelay', 'updateCombatHUD', 'chooseGuidancePrompt'].map(declaration).join('\n');
function classes() {
  const values = new Set();
  return { contains: key => values.has(key), toggle(key, force) { const present = force ?? !values.has(key); if (present) values.add(key); else values.delete(key); return present; } };
}
function fixture(game) {
  const elements = new Map(), body = { classList: classes() };
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', innerHTML: '', classList: classes(), setAttribute() {}, querySelector: query => element(`${id}:${query}`) });
    return elements.get(id);
  };
  const context = vm.createContext({ game, surface: game.state.exploration ? game._expeditionSurface() : generateSurface(game.currentBody, game.state.seed, game.state.flags),
    getGunneryView, personalFireUsesShipStation, getPersonalWeapon, visibleSiteHostiles, isFoggedSite, expeditionHostileTo, storyStatus,
    settings: { guidance: 'simple' }, touchLayout: true, activeMilitaryCareer: () => null, nearby: () => null,
    playing: true, network: null, onlineSnapshot: null, elapsed: 1, localShotAt: -Infinity, combatPreview: null, combatFeed: [], labelLayoutDirty: false,
    document: { body }, $: element, esc: value => String(value ?? ''), updateBatteryControls() {},
    hudText(target, value) { const changed = target.textContent !== value; target.textContent = value; return changed; },
    hudHTML(target, value) { const changed = target.innerHTML !== value; target.innerHTML = value; return changed; }
  });
  vm.runInContext(code, context);
  return { context, element, body };
}
function landed() {
  const game = new Game('app-free-fire', { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  assert.equal(game.dock(body.id).ok, true); game.drainEvents();
  return game;
}

test('ordinary port and cabin weapon HUDs remain usable with no boarding or expedition object', () => {
  const cabin = new Game('app-free-fire-cabin'); assert.equal(cabin.enterCabin().ok, true);
  for (const game of [landed(), cabin]) {
    const { context, element, body } = fixture(game);
    assert.equal(context.personalAimAvailable(), true); assert.equal(context.armedOnFoot(), true);
    context.combatPreview = sidearmAim(game.state.person, context.personAimTargets(), {}, personalFireLayout(context.surface));
    assert.doesNotThrow(() => context.updateCombatHUD());
    assert.equal(element('combatPanel').hidden, false); assert.equal(element('weaponState').textContent, 'READY');
    assert.equal(body.classList.contains('combat-active'), true, 'The existing touch CSS keeps AIM and FIRE visible here too.');
  }
});

test('desktop and touch can aim and fire in the quiet corridor without a target or a control-mode change', () => {
  const game = landed(), outside = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  const entry = outside.entities.find(value => value.type === 'siteEntrance' && value.data.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entry.x, y: entry.y }); assert.equal(game.enterSite('relay-nine').ok, true); game.drainEvents();
  const { context, element, body } = fixture(game);
  assert.equal(context.pointerAimAvailable(), true); assert.equal(context.personAimTargets().length, 0);
  const desktop = inputVector({ mode: 'person', combat: context.pointerAimAvailable(), keys: new Set(['KeyW', 'ArrowRight', 'Space']) });
  assert.equal(desktop.y, -1); assert.equal(desktop.x, 0); assert.equal(desktop.aimX, 1); assert.equal(desktop.aiming, true); assert.equal(desktop.fire, true);
  game.stepExploration(.1, desktop); assert.ok(game.drainEvents().some(value => value.type === 'person-shot' && !value.hit));
  const touch = inputVector({ mode: 'person', combat: context.pointerAimAvailable(), move: { x: -1, y: 0 }, aim: { x: 0, y: -1 } });
  assert.equal(touch.x, -1); assert.equal(touch.y, 0); assert.equal(touch.aimY, -1); assert.equal(touch.aiming, true); assert.equal(touch.fire, true);
  context.updateCombatHUD(); assert.equal(element('combatPanel').hidden, false); assert.equal(body.classList.contains('combat-active'), true);
  game.state.exploration.encounter.monsters = [];
  assert.equal(context.pointerAimAvailable(), true, 'A cleared or truly empty corridor keeps precisely the same controls.');
});

test('the quiet corridor coach follows the current action and only gives escape guidance after the real trigger', () => {
  const game = landed(), outside = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  const entry = outside.entities.find(value => value.type === 'siteEntrance' && value.data.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entry.x, y: entry.y }); assert.equal(game.enterSite('relay-nine').ok, true); game.drainEvents();
  const { context } = fixture(game), site = game.state.interior.location.site, encounter = game.state.exploration.encounter;
  const unrelated = { id: 'walk', title: 'Learn to walk', body: 'Try the WALK stick.', successAction: 'person-move', completed: false };
  const before = storyStatus(encounter, site), quiet = context.chooseGuidancePrompt({ combat: { active: false } }, unrelated, { target: null });
  assert.equal(before.phase, 'quiet'); assert.equal(before.threats, 0); assert.equal(context.personAimTargets().length, 0);
  assert.ok(encounter.monsters.every(value => value.quietEarthDormant && value.hidden));
  assert.equal(quiet.title, before.pendingSummary); assert.equal(quiet.compactBody, before.objective);
  assert.equal(quiet.controlTarget, 'stick'); assert.equal(quiet.highlight, false);
  assert.doesNotMatch(`${quiet.title} ${quiet.body} ${quiet.compactBody}`, /escape|ambush|enemy|enemies|shoot|seal|return to the entry/i);
  assert.equal(context.chooseGuidancePrompt({}, unrelated, { target: { id: before.nextTargetId } }).controlTarget, 'contextButton');
  const action = (type, id, command, option) => {
    const entity = game._expeditionSurface().entities.find(value => value.type === type && (value.data.choiceId === id || value.data.recordId === id));
    assert.ok(entity); Object.assign(game.state.person, { x: entity.x, y: entity.y });
    const reply = game.siteAction(entity.id, command, option); assert.equal(reply.ok, true, reply.reason);
  };
  action('siteChoice', 'check-in', 'choose', 'begin');
  action('siteRecord', 'voices', 'inspect');
  action('siteChoice', 'breaker', 'choose', 'restore');
  action('siteRecord', 'service', 'inspect');
  const ready = context.chooseGuidancePrompt({}, unrelated, { target: null });
  assert.equal(storyStatus(encounter, site).phase, 'quiet');
  assert.doesNotMatch(`${ready.title} ${ready.body}`, /escape|ambush|enemy|enemies|shoot|seal|return to the entry/i);
  action('siteChoice', 'receiver', 'choose', 'copy'); game.stepExploration(.01, {});
  assert.ok(game.drainEvents().some(value => value.type === 'quiet-earth-beat' && value.beatId === 'ambush'));
  assert.equal(storyStatus(encounter, site).phase, 'escape');
  const escape = context.chooseGuidancePrompt({ combat: { active: true } }, unrelated, { target: null });
  assert.equal(escape.title, 'Return to the entry');
  assert.match(escape.compactBody, /Green lights/); assert.match(escape.compactBody, /Shoot to make space/); assert.match(escape.compactBody, /entry door control/);
  assert.ok(escape.compactBody.length < 100, 'The live escape instruction fits the compact touch coach.');
  context.settings.guidance = 'expert'; assert.equal(context.chooseGuidancePrompt({}, unrelated), null);
});
