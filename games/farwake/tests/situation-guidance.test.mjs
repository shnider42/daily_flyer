import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { situationView, warzoneGuidePrompt, nearbyShipThreat } from '../dist/situation-guidance.mjs';

function army() {
  const game = new Game('plain-army-guidance');
  Object.assign(game.state.professions.careers.military, { enlisted: true, factionId: 'freewake', completed: 12 });
  Object.assign(game.state.militaryCareer, { factionId: 'freewake', branchId: 'army' });
  game.state.rep.freewake = 20;
  return game;
}
function crosswind(game) { game.state.systemId = 'crosswind'; game._loadSystem('crosswind'); game.warzoneArrival(); return game; }

test('twelve Army assignments keep the same side and rank when entering the ongoing war', () => {
  const game = army(), home = situationView(game);
  assert.equal(home.identity, 'Freewake Army · Corporal');
  crosswind(game);
  const before = game.serialize(), front = situationView(game), prompt = warzoneGuidePrompt(game, { touch: true });
  assert.equal(front.identity, home.identity);
  assert.equal(front.detail, 'Enemy: Meridian · Help');
  assert.equal(front.rank.remaining, 4);
  assert.match(prompt.compactBody, /Freewake is on your side.*Meridian is your enemy.*Land on Vey/);
  assert.match(prompt.body, /separate from your assigned Army missions/);
  assert.match(prompt.body, /does not give you a Navy gun station/);
  assert.equal(game.serialize(), before, 'Reading help cannot change service, progress, or allegiance.');
});

test('allied and neutral warships do not suppress ordinary action guidance as threats', () => {
  const game = crosswind(army()), ship = game.state.ship;
  game.system.enemies = [{ hp: 100, warzone: true, faction: 'freewake', x: ship.x + 10, y: ship.y }];
  assert.equal(nearbyShipThreat(game), false);
  game.system.enemies.push({ hp: 100, warzone: true, faction: 'meridian', x: ship.x + 10, y: ship.y });
  assert.equal(nearbyShipThreat(game), true);
  game.state.professions.careers.military.enlisted = false;
  game.state.warzone.side = null;
  assert.equal(nearbyShipThreat(game), false, 'Neutral fleets fighting each other are not declared enemies of this captain.');
});

test('shared passengers and gunners see their ship enemies without losing their personal Army identity', () => {
  const game = crosswind(army()), ship = game.state.ship;
  game.state.mode = 'person';
  game.state.multiplayer = { aboardVesselId: 'borrowed-carrier', crewRole: 'gunner' };
  Object.assign(game.system.warzone, { viewerFaction: 'meridian', hostileFactions: ['freewake'] });
  game.system.enemies = [{ hp: 100, warzone: true, faction: 'freewake', x: ship.x + 10, y: ship.y }];
  const view = situationView(game);
  assert.equal(view.identity, 'Freewake Army · Corporal');
  assert.equal(view.differentShip, true);
  assert.match(view.detail, /Ship: Meridian.*enemy Freewake/);
  assert.equal(nearbyShipThreat(game), true);
  game.system.warzone.hostileFactions.push('meridian');
  const prompt = warzoneGuidePrompt(game);
  assert.equal(prompt.title, 'Both armies are targeting this ship');
  assert.match(prompt.body, /personal ceasefire may not clear another commander/);
});

test('existing both-side hostility is explained without silently changing its record', () => {
  const game = crosswind(army());
  game.state.warzone.hostileFactions.push('freewake');
  const view = situationView(game), prompt = warzoneGuidePrompt(game, { touch: true });
  assert.equal(view.detail, 'Both armies hostile · Help');
  assert.match(prompt.body, /Orsa/);
  assert.match(prompt.body, /rank are still saved/);
  assert.deepEqual(game.state.warzone.hostileFactions, ['freewake']);
});

test('civilian and suspended-service help never claim an allied army', () => {
  const game = crosswind(army());
  game.state.rep.freewake = -25;
  assert.match(situationView(game).identity, /Freewake Army/);
  assert.match(warzoneGuidePrompt(game).title, /suspended/);
  game.state.professions.careers.military.enlisted = false;
  assert.equal(situationView(game).identity, 'Civilian · no side chosen');
  assert.match(warzoneGuidePrompt(game).body, /civilian until you choose a side/);
});


test('a same-faction passenger is told when only the ship has an attack record', () => {
  const game = crosswind(army());
  game.state.mode = 'person';
  game.state.multiplayer = { aboardVesselId: 'other-captains-ship', crewRole: 'guest' };
  Object.assign(game.system.warzone, { viewerFaction: 'freewake', hostileFactions: ['freewake', 'meridian'] });
  assert.equal(situationView(game).differentShip, true);
  assert.equal(warzoneGuidePrompt(game).title, 'Both armies are targeting this ship');
  assert.deepEqual(game.state.warzone.hostileFactions, []);
});
