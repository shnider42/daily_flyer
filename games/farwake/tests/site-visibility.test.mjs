import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMED_SYSTEMS } from '../dist/content.mjs';
import { explorationLocation, createSiteState } from '../dist/exploration.mjs';
import { generateSurface, drawSurface, drawSurfaceMap } from '../dist/surface.mjs';
import { clearSidearmSight, sidearmAim } from '../dist/combat.mjs';
import { isCabinWalkable } from '../dist/interior-layouts.mjs';
import { createSiteVisibility, canSeeSitePoint, canSeeConcealedActor, visibleSiteHostiles, visibleSitePresentation, visibleSiteCombatEvent, isFoggedSite } from '../dist/site-visibility.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { CombatPresentation } from '../dist/combat-presentation.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const body = NAMED_SYSTEMS.flatMap(system => system.bodies).find(body => body.id === 'tinbell');
function fixture() {
  const location = explorationLocation(body, 'hollow', 'tinbell-visibility'), surface = generateSurface(location, 'tinbell-visibility');
  const encounter = createSiteState(location.site), boss = encounter.monsters.find(actor => actor.species === 'bellwether');
  Object.assign(boss, { revealed: true, hidden: false, alert: true });
  const person = { id: 'local', ...point(19, 7), facing: 'right', health: 100, maxHealth: 100, weapon: 'breach-rifle', ownedWeapons: ['pulse-sidearm', 'breach-rifle'] };
  return { location, surface, encounter, boss, person };
}
class RecordingContext {
  constructor(width = 1008, height = 768) { this.canvas = { width, height }; this.rects = []; this.globalAlpha = 1; this.fillStyle = ''; }
  save() {} restore() {} translate() {} rotate() {} scale() {} clearRect() {} strokeRect() {} setLineDash() {} drawImage() {}
  fillRect(x, y, w, h) { this.rects.push([this.fillStyle, this.globalAlpha, x, y, w, h]); }
  fillText() { throw new Error('Labels must remain on their crisp overlay'); }
  measureText(text) { return { width: String(text).length * 6 }; }
}

test('Tinbell uses actual local LOS: a globally revealed boss behind a stalagmite cannot be aimed at or counted', () => {
  const { surface, boss, person } = fixture(), before = JSON.stringify({ surface, boss, person });
  assert.ok(Math.hypot(boss.x - person.x, boss.y - person.y) < 230);
  assert.equal(isCabinWalkable(surface.combatLayout, person.x, person.y), true);
  assert.equal(clearSidearmSight(surface.combatLayout, person, boss), false, 'real generated solid, not just distance, occludes this contact');
  assert.equal(canSeeSitePoint(surface.combatLayout, person, boss), false);
  assert.equal(canSeeConcealedActor(surface.combatLayout, person, boss), false);
  assert.deepEqual(visibleSiteHostiles(surface, person, [boss]), []);
  assert.equal(sidearmAim(person, [boss], {}, surface.combatLayout).target, null);
  assert.equal(sidearmAim(person, [boss], { aiming: true, aimX: 1, aimY: 0 }, surface.combatLayout).target, null);
  assert.equal(JSON.stringify({ surface, boss, person }), before, 'visibility never changes alert, position, or the collision map');
  const clear = { ...person, ...point(27, 11) };
  assert.equal(canSeeConcealedActor(surface.combatLayout, clear, boss), true);
  assert.equal(sidearmAim(clear, [boss], {}, surface.combatLayout).targetId, boss.id);
  assert.equal(visibleSiteHostiles(surface, clear, [boss]).length, 1);
  assert.equal(canSeeConcealedActor(surface.combatLayout, clear, { ...boss, revealed: false, hidden: true }), false);
});

test('sight range, opaque corners and cached masks agree while explored terrain belongs only to its observer', () => {
  const layout = { tile: 24, tileSize: 24, cols: 25, rows: 25, walkable: Array(625).fill(1) }, observer = point(12, 12);
  assert.equal(canSeeSitePoint(layout, observer, { x: observer.x + 230, y: observer.y }), true);
  assert.equal(canSeeSitePoint(layout, observer, { x: observer.x + 230.01, y: observer.y }), false);
  const corner = { ...layout, walkable: [...layout.walkable] };
  corner.walkable[12 * corner.cols + 13] = 0;
  assert.equal(canSeeSitePoint(corner, observer, point(13, 13)), false, 'a diagonal touching an opaque corner does not acquire a concealed actor');
  const { surface, person, boss } = fixture(), seen = { ...person, ...point(27, 11) };
  const a = createSiteVisibility(surface, seen, { observerId: 'a' });
  const sameCell = createSiteVisibility(surface, { ...seen, x: seen.x + 1 }, { observerId: 'a' });
  assert.equal(a.visible, sameCell.visible, 'tile FOV is reused inside a player cell');
  const index = Math.floor(boss.y / 24) * surface.cols + Math.floor(boss.x / 24);
  assert.equal(a.explored[index], 1);
  const away = createSiteVisibility(surface, person, { observerId: 'a' });
  assert.equal(away.canSeeActor(boss), false); assert.equal(away.explored[index], 1, 'memory keeps terrain but cannot keep a live enemy visible');
  const newcomer = createSiteVisibility(surface, person, { observerId: 'b' });
  assert.equal(newcomer.explored[index], 0, 'another captain never inherits this explorer’s map memory');
  assert.equal(createSiteVisibility({ ...surface, id: 'other:site:hollow', parentId: 'other' }, person), null);
  assert.equal(isFoggedSite({ id: 'tinbell:site:hut', parentId: 'tinbell', siteId: 'hut' }), false);
});

test('interpolated monster poses obey both current authority and current local fog', () => {
  const { surface, person, boss } = fixture(), nearby = { ...boss, ...point(19, 10) };
  assert.equal(canSeeConcealedActor(surface.combatLayout, person, nearby), true);
  assert.deepEqual(visibleSitePresentation(surface, person, [boss], [nearby]), [], 'an old visible pose cannot linger when the current contact is behind the rock');
  assert.deepEqual(visibleSitePresentation(surface, person, [nearby], [boss]), [], 'a current reveal cannot paint an interpolated pose through rock');
  assert.deepEqual(visibleSitePresentation(surface, person, [{ ...nearby, hidden: true, revealed: false }], [nearby]), [], 'a reset dormant attempt immediately hides stale visible interpolation');
  assert.equal(visibleSitePresentation(surface, person, [nearby], [nearby])[0], nearby);
});

test('hidden contact produces exactly the same pixels, crisp labels, health bars and reticle as no contact', () => {
  const { surface, person, boss, encounter } = fixture(), before = JSON.stringify({ surface, person, boss, encounter });
  const forgedAim = { target: boss, targetId: boss.id, angle: 0, manual: false, from: person, to: boss };
  const effect = { kind: 'hit', siteId: encounter.id, to: boss, targetId: boss.id, targetName: boss.name, actorName: 'Ally', damage: 72, age: .1, progress: .2 };
  const render = monsters => {
    const ctx = new RecordingContext(), labels = [];
    drawSurface(ctx, surface, { person, cameraX: 0, cameraY: 0, width: 1008, height: 768, labels,
      exploration: { ...encounter, monsters }, combat: { active: true, aim: forgedAim }, combatEffects: [effect], time: 3, combatTime: 3 });
    return { rects: ctx.rects, labels };
  };
  assert.deepEqual(render([boss]), render([]), 'even an already-received aim or damage effect cannot reveal a hidden contact');
  const hidden = render([boss]);
  assert.ok(hidden.rects.some(rect => rect[0] === '#030910' && rect[1] === 1), 'unexplored tiles are opaque, not a faint vignette');
  assert.ok(!hidden.labels.some(label => /Bellwether|ASSIST|−72/.test(label.text)));
  assert.equal(JSON.stringify({ surface, person, boss, encounter }), before);
  const visiblePerson = { ...person, ...point(27, 11) }, ctx = new RecordingContext(), labels = [];
  drawSurface(ctx, surface, { person: visiblePerson, cameraX: 0, cameraY: 0, width: 1008, height: 768, exploration: encounter, labels });
  assert.ok(labels.some(label => label.kind === 'hostile' && label.text === 'The Bellwether'));
  assert.ok(ctx.rects.some(rect => rect[0] === '#e79a7b' && rect[4] === 44), 'the boss health bar is drawn only after local sight');
});

test('the walking map conceals undiscovered contacts and places while preserving the entrance', () => {
  const { surface, encounter, person, boss } = fixture();
  const map = drawSurfaceMap(new RecordingContext(360, 280), surface, { person, exploration: encounter });
  assert.ok(map.markers.some(marker => marker.kind === 'exit'));
  assert.ok(!map.markers.some(marker => marker.kind === 'hostile' || marker.kind === 'cache'));
  const visiblePerson = { ...person, ...point(27, 11) }, visible = drawSurfaceMap(new RecordingContext(360, 280), surface, { person: visiblePerson, exploration: encounter });
  assert.ok(visible.markers.some(marker => marker.id === boss.id));
  const hiddenAgain = drawSurfaceMap(new RecordingContext(360, 280), surface, { person, exploration: encounter });
  assert.ok(!hiddenAgain.markers.some(marker => marker.id === boss.id), 'global alert and terrain memory cannot retain a moving hostile marker');
  const ordinary = { ...surface, id: 'other:site:hollow', parentId: 'other' };
  const oldMap = drawSurfaceMap(new RecordingContext(360, 280), ordinary, { person, exploration: encounter });
  assert.ok(oldMap.markers.some(marker => marker.id === boss.id), 'other caves preserve their existing map behavior');
});

test('a shared scream is captioned generically behind walls; hidden hits and down messages never leak into the score or effects', () => {
  const { surface, location, encounter, person, boss } = fixture();
  const options = { surface, observer: person, actors: [boss], captainId: 'local' };
  const reveal = { type: 'monster-revealed', id: encounter.id + ':reveal:1', siteId: encounter.id, actorId: boss.id, monsterId: boss.id, actorName: boss.name, x: boss.x, y: boss.y };
  const caption = visibleSiteCombatEvent(reveal, options);
  assert.equal(caption.text, 'A scream tears through the cavern.'); assert.equal(caption.actorName, ''); assert.equal(caption.visuallyRevealed, false);
  const hit = { type: 'person-hit', id: 'hit', siteId: encounter.id, attackerId: 'local', targetId: boss.id, targetName: boss.name, damage: 72, x: boss.x, y: boss.y };
  assert.equal(visibleSiteCombatEvent(hit, options), null);
  assert.equal(visibleSiteCombatEvent({ ...hit, type: 'boarder-down', text: 'The Bellwether is down' }, options), null);
  assert.equal(visibleSiteCombatEvent(reveal, { ...options, surface: { id: 'morrow', kind: 'planet' } }), null, 'a delayed event cannot play after leaving the site');
  const injury = visibleSiteCombatEvent({ ...hit, attackerId: boss.id, actorName: boss.name, targetId: 'local', targetName: 'Captain', ...person, text: 'The Bellwether attacks' }, options);
  assert.equal(injury.actorName, 'Unseen movement'); assert.equal(injury.text, undefined, 'actual local damage remains readable without revealing its source');
  const game = { state: { mode: 'person', systemId: 'hearth', locationId: surface.id, person, exploration: { bodyId: 'tinbell', siteId: 'hollow', encounter } }, currentBody: location, playerId: 'local' };
  const hiddenContext = musicContext({ game, surface, playing: true });
  assert.equal(hiddenContext.terror, false); assert.equal(hiddenContext.combat, false); assert.equal(hiddenContext.tension, false);
  assert.equal(classifyMusicEvent(hit, hiddenContext), null);
  assert.equal(classifyMusicEvent(injury, hiddenContext), 'combat', 'taking a real blow is observed combat');
  const visiblePerson = { ...person, ...point(27, 11) };
  const seen = visibleSiteCombatEvent(reveal, { ...options, observer: visiblePerson });
  assert.match(seen.text, /The Bellwether/); assert.equal(seen.visuallyRevealed, true);
  game.state.person = visiblePerson;
  const seenContext = musicContext({ game, surface, playing: true });
  assert.equal(seenContext.terror, true); assert.match(seenContext.terrorKey, /bellwether/);
  assert.equal(classifyMusicEvent(hit, seenContext), 'combat');
});

test('live reveal IDs deduplicate once per attempt and retained hits cannot borrow coordinates from a different site', () => {
  const presentation = new CombatPresentation(), event = { type: 'monster-revealed', id: 'tinbell:site:hollow:reveal:1', siteId: 'tinbell:site:hollow' };
  assert.equal(presentation.claim(event, 1), true); assert.equal(presentation.claim(event, 8), false);
  assert.equal(presentation.claim({ ...event, id: 'tinbell:site:hollow:reveal:2' }, 9), true);
  assert.deepEqual(presentation.sample(10), [], 'the cue gate never synthesizes an encounter or replays snapshot state');
  assert.equal(presentation.push({ type: 'person-hit', id: 'hit-a', siteId: 'a', targetId: 'same-id', x: 10, y: 20 }, 1), true);
  assert.equal(presentation.push({ type: 'person-hit', id: 'hit-b', siteId: 'b', targetId: 'same-id' }, 1.1), false);
  assert.equal(presentation.sample(1.2)[0].siteId, 'a');
});

test('the charge tell is fixed under reduced motion and stops at the boss footprint’s first physical wall', () => {
  const { surface, encounter, boss, person } = fixture();
  Object.assign(boss, { phase: 'windup', windup: .8, aimAngle: Math.PI, moving: true });
  const observer = { ...person, ...point(27, 11) };
  const render = combatTime => {
    const ctx = new RecordingContext(); drawSurface(ctx, surface, { person: observer, width: 1008, height: 768, cameraX: 0, cameraY: 0,
      exploration: encounter, labels: [], time: 0, combatTime, reduceMotion: true }); return ctx.rects;
  };
  assert.deepEqual(render(1), render(2.7), 'reduced motion freezes walking bob while preserving the legible warning');
  let length = 0; for (let d = 3; d <= boss.lungeRange; d += 3) { if (!isCabinWalkable(surface.combatLayout, boss.x - d, boss.y, boss.radius)) break; length = d; }
  assert.ok(length < boss.lungeRange, 'the actual nearby stalagmite stops this charge');
  const lane = render(1).filter(rect => rect[0] === '#72554b');
  assert.ok(lane.length > 0); assert.ok(lane.every(rect => rect[2] >= boss.x - length - 1), 'no warning pixels project beyond the physical stopping point');
});
