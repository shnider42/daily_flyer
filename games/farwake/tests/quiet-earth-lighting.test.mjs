import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMED_SYSTEMS } from '../dist/content.mjs';
import { explorationLocation, createSiteState } from '../dist/exploration.mjs';
import { generateSurface, drawSurface, drawSurfaceMap } from '../dist/surface.mjs';
import { storySurfaceView } from '../dist/expedition-story-rules.mjs';
import { clearSidearmSight, sidearmAim } from '../dist/combat.mjs';
import { quietEarthLightState, projectQuietEarthLighting, quietEarthLightingSource } from '../dist/quiet-earth-lighting.mjs';
import { isFoggedSite, createSiteVisibility, canSeeConcealedActor, visibleSitePresentation, visibleSiteCombatEvent } from '../dist/site-visibility.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const body = NAMED_SYSTEMS.flatMap(system => system.bodies).find(item => item.id === 'morrow');
function fixture() {
  const location = explorationLocation(body, 'relay-nine', 'relay-lamplight'), surface = generateSurface(location, 'relay-lamplight');
  const state = createSiteState(location.site);
  const person = { id: 'local', ...point(48, 73), health: 100, maxHealth: 100, facing: 'right',
    ownedWeapons: ['pulse-sidearm', 'union-longwatch'], weapon: 'union-longwatch' };
  return { location, surface, state, person };
}
function settle(state, choices, records = []) {
  Object.assign(state.choices, choices);
  state.story.readRecords = [...new Set([...state.story.readRecords, ...records])];
  state.story.revision++;
}
class RecordingContext {
  constructor(width = 1008, height = 768) { this.canvas = { width, height }; this.rects = []; this.globalAlpha = 1; this.fillStyle = ''; }
  save() {} restore() {} translate() {} rotate() {} scale() {} clearRect() {} strokeRect() {} setLineDash() {} drawImage() {} setTransform() {}
  fillRect(x, y, w, h) { this.rects.push([this.fillStyle, this.globalAlpha, x, y, w, h]); }
  fillText() { throw new Error('Labels belong on the crisp overlay'); }
  measureText(text) { return { width: String(text).length * 6 }; }
}

test('each Relay circuit extends sight only into its powered section, and solid geometry still occludes it', () => {
  const { surface, state } = fixture(), observer = point(55, 73), distantRecord = point(70, 73);
  assert.equal(isFoggedSite(surface), true);
  const dark = storySurfaceView(surface, state);
  assert.equal(createSiteVisibility(dark, observer).canSeePoint(distantRecord), false);
  assert.equal(createSiteVisibility(dark, observer).range, 230);
  settle(state, { 'check-in': 'begin', 'intake-lights': 'restore' });
  const first = storySurfaceView(surface, state), firstView = createSiteVisibility(first, observer);
  assert.equal(first.quietEarthLighting.key, '100');
  assert.equal(firstView.canSeePoint(distantRecord), true);
  assert.equal(firstView.canSeePoint(point(90, 73)), false, 'Power does not reveal the whole long hall.');
  assert.equal(firstView.visible[69 * surface.cols + 65], 1, 'A ceiling strip on the first opaque boundary remains visible beyond the lamp radius.');
  assert.equal(firstView.visible[68 * surface.cols + 65], 0, 'Illumination never propagates into a second wall layer.');
  assert.equal(firstView.canSeePoint(point(65, 69)), false, 'The terrain-only wall edge does not become an aimable point through cover.');
  const east = point(119, 73), breakerApproach = point(119, 58);
  assert.equal(clearSidearmSight(first.combatLayout, east, breakerApproach), true);
  assert.equal(createSiteVisibility(first, east).canSeePoint(breakerApproach), false, 'The next unpowered circuit stays dark even along a clear ray.');
  settle(state, { breaker: 'restore' }, ['voices']);
  const second = storySurfaceView(surface, state);
  assert.equal(second.quietEarthLighting.key, '110');
  assert.equal(createSiteVisibility(second, east).canSeePoint(breakerApproach), true);
  const west = point(12, 46), upperApproach = point(12, 32);
  assert.equal(clearSidearmSight(second.combatLayout, west, upperApproach), true);
  assert.equal(createSiteVisibility(second, west).canSeePoint(upperApproach), false);
  settle(state, { 'upper-lights': 'restore' }, ['service']);
  const third = storySurfaceView(surface, state);
  assert.equal(third.quietEarthLighting.key, '111');
  assert.equal(createSiteVisibility(third, west).canSeePoint(upperApproach), true);
  assert.equal(createSiteVisibility(third, point(48, 73)).canSeePoint(point(48, 46)), false, 'An illuminated hall across a physical wall remains concealed.');
  assert.ok(state.monsters.every(actor => actor.hidden && actor.quietEarthDormant), 'Restoring every light never reveals or activates a dormant contact.');
  assert.equal(isFoggedSite({ ...surface, id: 'morrow:site:hut', key: 'morrow:site:hut', siteId: 'hut' }), false);
});

test('power accepts validated old progress without trusting forged later receipts or modifying the save', () => {
  const { surface } = fixture(), site = surface.site;
  const saved = (choices, readRecords = []) => ({ choices, story: { readRecords } });
  const cases = [
    [saved({ receiver: 'copy', 'upper-lights': 'restore' }, ['voices', 'service']), '000'],
    [saved({ 'check-in': 'begin', breaker: 'restore' }, ['service']), '000'],
    [saved({ 'intake-lights': 'restore' }), '000'],
    [saved({ 'check-in': 'begin', 'intake-lights': 'restore' }), '100'],
    [saved({ 'check-in': 'begin', breaker: 'restore' }, ['voices']), '110'],
    [saved({ 'check-in': 'begin', breaker: 'restore', receiver: 'copy' }, ['voices']), '110'],
    [saved({ 'check-in': 'begin', breaker: 'restore', receiver: 'copy' }, ['voices', 'service']), '111']
  ];
  for (const [state, key] of cases) {
    const before = JSON.stringify(state);
    assert.equal(quietEarthLightState(state, site).key, key);
    assert.equal(quietEarthLightState(state).key, key, 'The conservative raw-save policy agrees with the authored gates.');
    assert.equal(JSON.stringify(state), before, 'Migration never manufactures new choices, grants or cues.');
  }
  assert.deepEqual(quietEarthLightState(cases.at(-1)[0], site).completedChoices, ['intake-lights', 'breaker', 'upper-lights']);
});

test('changing power replaces the visible mask while retaining this captain’s explored terrain and cached geometry', () => {
  const { surface, state } = fixture(), observer = point(55, 73);
  const dark = storySurfaceView(surface, state), before = createSiteVisibility(dark, observer, { observerId: 'one' });
  assert.equal(storySurfaceView(surface, state), dark);
  assert.equal(createSiteVisibility(dark, { ...observer, x: observer.x + 1 }).visible, before.visible);
  settle(state, { 'check-in': 'begin', 'intake-lights': 'restore' });
  const lit = storySurfaceView(surface, state), after = createSiteVisibility(lit, observer, { observerId: 'one' });
  assert.notEqual(after.visible, before.visible);
  assert.equal(after.explored, before.explored);
  assert.equal(lit.combatLayout.walkable, surface.combatLayout.walkable);
  assert.equal(quietEarthLightingSource(lit.combatLayout), surface.combatLayout);
  assert.equal(projectQuietEarthLighting(surface, state), projectQuietEarthLighting(surface, state));
  settle(state, {}, ['voices']);
  assert.equal(storySurfaceView(surface, state).combatLayout, lit.combatLayout, 'Reading evidence does not rebuild fog geometry or discard tile-mask caches.');
  const walked = createSiteVisibility(lit, point(119, 73), { observerId: 'one' });
  assert.equal(walked.knowsPoint(observer), true);
  assert.equal(walked.canSeePoint(observer), false);
  const newcomer = createSiteVisibility(lit, point(119, 73), { observerId: 'two' });
  assert.equal(newcomer.knowsPoint(observer), false);
  assert.equal(newcomer.knowsPoint({ x: -1, y: observer.y }), false);
});

test('aim, labels, map markers, retained events and music share the same local powered visibility', () => {
  const { surface, state, person, location } = fixture();
  const actor = { ...state.monsters[0], ...point(61, 73), health: 100, hidden: false, revealed: true,
    quietEarthDormant: false, pacified: false, alert: true, targetId: 'local', hostileToPlayer: true };
  state.monsters = [actor];
  const dark = storySurfaceView(surface, state);
  assert.equal(canSeeConcealedActor(dark.combatLayout, person, actor), false);
  assert.equal(sidearmAim(person, [actor], {}, dark.combatLayout).targetId, null);
  assert.equal(sidearmAim(person, [actor], { aiming: true, aimX: 1, aimY: 0 }, dark.combatLayout).targetId, null);
  const hit = { type: 'person-hit', siteId: surface.id, id: 'lit-hit', attackerId: 'local', targetId: actor.id, targetName: actor.name,
    damage: 18, x: actor.x, y: actor.y };
  assert.equal(visibleSiteCombatEvent(hit, { surface: dark, observer: person, actors: [actor] }), null);
  const game = { state: { mode: 'person', systemId: 'hearth', locationId: surface.id, person,
    exploration: { bodyId: 'morrow', siteId: 'relay-nine', encounter: state } }, currentBody: location, playerId: 'local' };
  const darkMusic = musicContext({ game, playing: true, surface: dark });
  assert.equal(darkMusic.observedThreat, false);
  assert.equal(classifyMusicEvent(hit, darkMusic), null);
  const render = () => {
    const ctx = new RecordingContext(), labels = [];
    drawSurface(ctx, surface, { person, cameraX: person.x - 180, cameraY: person.y - 260, width: 1008, height: 768,
      exploration: state, labels, combat: { active: true, aim: { target: actor, targetId: actor.id, from: person, to: actor, angle: 0 } },
      combatEffects: [{ kind: 'hit', siteId: surface.id, targetId: actor.id, to: actor, damage: 18, progress: .1, age: .1 }] });
    return { ctx, labels };
  };
  const hidden = render();
  assert.ok(!hidden.labels.some(label => label.text === actor.name || /−18/.test(label.text)));
  assert.ok(hidden.ctx.rects.some(rect => rect[0] === '#030910' && rect[1] === 1));
  assert.ok(!drawSurfaceMap(new RecordingContext(360, 280), surface, { person, exploration: state }).markers.some(item => item.id === actor.id));
  settle(state, { 'check-in': 'begin', 'intake-lights': 'restore' });
  const lit = storySurfaceView(surface, state);
  assert.equal(sidearmAim(person, [actor], {}, lit.combatLayout).targetId, actor.id);
  assert.equal(visibleSiteCombatEvent(hit, { surface: lit, observer: person, actors: [actor] }), hit);
  assert.ok(render().labels.some(label => label.text === actor.name));
  assert.ok(drawSurfaceMap(new RecordingContext(360, 280), surface, { person, exploration: state }).markers.some(item => item.id === actor.id));
  const lightMusic = musicContext({ game, playing: true, surface: lit });
  assert.equal(lightMusic.observedThreat, true);
  assert.equal(classifyMusicEvent(hit, lightMusic), 'combat');
  assert.equal(canSeeConcealedActor(lit.combatLayout, person, { ...actor, hidden: true, revealed: false }), false);
  assert.deepEqual(visibleSitePresentation(lit, person, [{ ...actor, ...point(61, 46) }], [actor]), [], 'An old visible snapshot pose cannot survive a current position behind the wall.');
});

test('firing into darkness preserves the local shot but never paints an impact or leaks an unseen actor', () => {
  const { surface, state, person } = fixture(), dark = storySurfaceView(surface, state);
  const aim = sidearmAim(person, [], { aiming: true, aimX: 1, aimY: 0 }, dark.combatLayout);
  const shot = { type: 'person-shot', siteId: surface.id, id: 'dark-shot', attackerId: 'local', team: 'player',
    from: aim.from, to: aim.to, targetX: aim.to.x, targetY: aim.to.y, targetId: null, hit: false, damage: 0, blocked: aim.blocked };
  assert.ok(Math.hypot(shot.to.x - person.x, shot.to.y - person.y) > 230);
  const shown = visibleSiteCombatEvent(shot, { surface: dark, observer: person });
  assert.ok(shown); assert.equal(shown.id, shot.id); assert.equal(shown.fogClipped, true);
  assert.equal(shown.blocked, false, 'The fog edge is not a physical bullet impact.');
  assert.ok(createSiteVisibility(dark, person).canSeePoint(shown.to));
  assert.ok(shown.to.x < shot.to.x);
  assert.equal(visibleSiteCombatEvent({ ...shot, attackerId: 'elsewhere' }, { surface: dark, observer: point(10, 20) }), null);
  const hidden = { ...state.monsters[0], ...aim.to, hidden: false, revealed: true };
  assert.equal(visibleSiteCombatEvent({ ...shot, targetId: hidden.id, targetName: hidden.name, hit: true, damage: 18 },
    { surface: dark, observer: person, actors: [hidden] }), null);
});
