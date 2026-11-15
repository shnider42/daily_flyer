import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { questThread } from '../dist/quest-content.mjs';
import { LOCAL_CAMPAIGN_IDS } from '../dist/local-campaigns.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const fresh = seed => { const game = new Game(seed || 'local-campaigns'); game.state.credits = 1000; game.state.cargo.ore = 30; return game; };
const current = (game, id) => questThread(id).stages[game.state.narrative.quests[id].stage];
const accepted = (game, id) => ok(game.threadAction({ threadId: id, action: 'accept' }));
const desk = bodyId => ({ systemId: 'hearth', bodyId, entityId: `quest:passage-desk:${bodyId}` });

function go(game, target) {
  if (game.state.exploration) game._returnFromSite(false);
  game._persistRuntime();
  Object.assign(game.state, { mode: 'ship', interior: null, locationId: null, exploration: null, systemId: target.systemId });
  game._loadSystem(target.systemId);
  if (!target.bodyId) { Object.assign(game.state.ship, { x: target.x || 0, y: target.y || 0, vx: 0, vy: 0 }); return; }
  const body = game.system.bodies.find(value => value.id === target.bodyId); assert.ok(body, target.bodyId);
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 }); ok(game.dock(body.id));
  let surface = generateSurface(body, game.state.seed, game.state.flags);
  if (target.siteId) {
    const entrance = surface.entities.find(entity => entity.type === 'siteEntrance' && entity.data.siteId === target.siteId); assert.ok(entrance, target.siteId);
    Object.assign(game.state.person, { x: entrance.x, y: entrance.y }); ok(game.enterSite(target.siteId));
    surface = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  }
  if (target.entityId) { const entity = surface.entities.find(value => value.id === target.entityId); assert.ok(entity, target.entityId); Object.assign(game.state.person, { x: entity.x, y: entity.y }); }
}
function progress(game, id, choices = {}) {
  const step = current(game, id), view = game.narrativeBoard().active.find(value => value.id === id);
  go(game, step.kind === 'ship-scan' ? view.target : step.at);
  return ok(game.threadAction({ threadId: id, action: step.kind === 'choice' ? 'choose' : step.kind === 'puzzle' ? 'solve' : 'advance',
    entityId: step.at.entityId, choiceId: choices[step.id] || step.options?.[0].id, solution: step.puzzle?.solution }));
}
function until(game, id, stageId, choices = {}) { while (current(game, id).id !== stageId) progress(game, id, choices); }
function fare(game) {
  go(game, desk('kettle')); const offer = game.passengerOffers()[0]; assert.ok(offer);
  ok(game.acceptPassenger(offer.id, offer.sourceEntityId)); go(game, desk(offer.targetBody));
  return { offer, result: ok(game.deliverPassenger(offer.targetEntityId)) };
}
function finish(game, id, choices = {}) {
  if (!game.state.narrative.quests[id]) accepted(game, id);
  while (game.state.narrative.quests[id].status === 'active') {
    if (current(game, id).kind === 'passage-proof') fare(game);
    progress(game, id, choices);
  }
  return game.state.narrative.quests[id];
}

test('three early campaigns are visible without previous jobs, upgrades or automatic acceptance', () => {
  const game = new Game('early-campaigns'); assert.equal(game.hasHyperdrive, false);
  const available = game.narrativeBoard().available;
  for (const id of LOCAL_CAMPAIGN_IDS) {
    const view = available.find(value => value.id === id); assert.ok(view, id);
    assert.equal(view.actions[0].available, true); assert.ok(view.localCampaign.total >= 7);
    assert.equal(game.state.narrative.quests[id], undefined);
    assert.ok(questThread(id).stages.every(step => step.at.systemId === 'hearth'));
    assert.match(view.localCampaign.scope, /no fold drive/);
  }
  game.state.person.down = true; assert.equal(game.threadAction({ threadId: 'cold_chain', action: 'accept' }).code, 'mode');
});

test('cold storage repair requires its actual sites, committed resources, a passed test and verification', () => {
  const game = fresh('cold-chain-guards'); accepted(game, 'cold_chain');
  assert.equal(game.threadAction({ threadId: 'cold_chain', action: 'advance', entityId: 'quest:clinic-case' }).code, 'mode');
  const target = current(game, 'cold_chain').at; go(game, target); game.state.person.x += 200;
  assert.equal(game.threadAction({ threadId: 'cold_chain', action: 'advance', entityId: target.entityId }).code, 'distance');
  progress(game, 'cold_chain'); progress(game, 'cold_chain');
  assert.equal(current(game, 'cold_chain').id, 'parts'); go(game, current(game, 'cold_chain').at);
  game.state.cargo.ore = 3; game.state.credits = 54;
  for (const choiceId of ['rebuild', 'replace']) assert.equal(game.threadAction({ threadId: 'cold_chain', action: 'choose', choiceId, entityId: 'quest:mara-reed' }).code, 'cost');
  assert.equal(current(game, 'cold_chain').id, 'parts'); assert.deepEqual(game.state.narrative.quests.cold_chain.choices, {});
  game.state.cargo.ore = 4; progress(game, 'cold_chain', { parts: 'rebuild' }); assert.equal(game.state.cargo.ore, 0);
  const testStep = current(game, 'cold_chain'); go(game, testStep.at);
  assert.equal(game.threadAction({ threadId: 'cold_chain', action: 'solve', entityId: testStep.at.entityId, solution: ['reconnect', 'fit', 'test', 'isolate'] }).code, 'puzzle');
  assert.equal(game.hasFlag('thread:cold_chain_regulator_tested'), false);
  progress(game, 'cold_chain'); assert.equal(game.hasFlag('thread:cold_chain_regulator_tested'), true);
  assert.equal(game.hasFlag('thread:cold_chain_verified'), false); progress(game, 'cold_chain'); assert.equal(game.hasFlag('thread:cold_chain_verified'), true);
  progress(game, 'cold_chain', { agreement: 'care' });
  game.state.person.health = 40; const before = game.serviceQuote('rest').cost;
  assert.equal(game.serviceQuote('rest').support, undefined, 'agreement is not earned before handover');
  const reward = game.state.narrative.quests.cold_chain.rewardQuote, credits = game.state.credits; progress(game, 'cold_chain');
  assert.equal(game.state.credits, credits + reward); assert.match(game.serviceQuote('rest').support, /25%/); assert.ok(game.serviceQuote('rest').cost < before);
  const quote = game.serviceQuote('rest'); const paid = game.state.credits; ok(game.service('rest')); assert.equal(game.state.credits, paid - quote.cost);
  assert.equal(game.service('rest').code, 'full');
  assert.equal(game.threadAction({ threadId: 'cold_chain', action: 'advance', entityId: 'quest:mara-reed' }).code, 'duplicate');
  go(game, desk('kettle')); game.state.person.health = 40; assert.equal(game.serviceQuote('rest').cost, before); assert.equal(game.serviceQuote('rest').support, undefined);
});

test('alternative repair and support choices spend the quoted money and change a different real service', () => {
  const game = fresh('cold-chain-workshop'), credits = game.state.credits;
  const record = finish(game, 'cold_chain', { parts: 'replace', agreement: 'workshop' });
  assert.equal(game.state.cargo.ore, 30); assert.equal(game.state.credits, credits - 55 + record.rewardQuote);
  game.state.ship.hull -= 50; const quote = game.serviceQuote('repair'); assert.match(quote.support, /15%/);
  game.state.person.health = 50; assert.equal(game.serviceQuote('rest').support, undefined);
  const paid = game.state.credits; ok(game.service('repair')); assert.equal(game.state.credits, paid - quote.cost); assert.equal(game.state.ship.hull, game.state.ship.maxHull);
  const restored = Game.fromSave(game.save()); assert.deepEqual(restored.state.narrative.quests.cold_chain, record);
  assert.match(restored.narrativeBoard().completed.find(value => value.id === 'cold_chain').localCampaign.consequence, /15%/);
});

test('old fares and invented receipts cannot satisfy the new passenger trial; an actual completed Hearth fare can', () => {
  let game = fresh('departure-trial'); fare(game); assert.equal(game.state.narrative.passengerCompleted, 1);
  accepted(game, 'fair_departure'); until(game, 'fair_departure', 'trial', { charter: 'commute' });
  go(game, current(game, 'fair_departure').at);
  assert.equal(game.threadAction({ threadId: 'fair_departure', action: 'advance', entityId: 'quest:len-vale', solution: ['receipt'] }).code, 'requirements');
  assert.equal(game.hasFlag('thread:fair_departure_trial_complete'), false);
  const { offer } = fare(game); assert.equal(offer.charterBonus, undefined, 'trial itself keeps the regular quote');
  assert.equal(game.hasFlag('thread:fair_departure_trial_complete'), true);
  game = Game.fromSave(game.save()); progress(game, 'fair_departure'); progress(game, 'fair_departure');
  assert.equal(game.state.narrative.quests.fair_departure.status, 'completed');
  assert.equal(game.threadAction({ threadId: 'fair_departure', action: 'advance', entityId: 'quest:len-vale' }).code, 'duplicate');
});

for (const [charter, type, bonus, contribution] of [['care', 'patient', 10, 35], ['commute', 'commuter', 6, 15], ['courier', 'courier', 8, 0]]) {
  test(`${charter} charter affects only its actual fare type and preserves accepted quotes across reload`, () => {
    let game = fresh(`charter-${charter}`); finish(game, 'fair_departure', { charter }); go(game, desk('kettle'));
    assert.equal(game.state.narrative.quests.fair_departure.choices.charter, charter);
    let offer;
    for (let serial = 0; serial < 60; serial++) { game.state.narrative.passengerSerial = serial; offer = game.passengerOffers()[0]; if (offer.type === type) break; }
    assert.equal(offer.type, type); assert.equal(offer.charterBonus, bonus); assert.match(offer.support, new RegExp(`\\+${bonus} cr`));
    const record = game.state.narrative.quests.fair_departure; record.status = 'active'; record.stage = questThread('fair_departure').stages.length - 1;
    const ordinary = game.passengerOffers()[0]; assert.equal(offer.fare, ordinary.fare + bonus);
    record.status = 'completed'; record.stage = questThread('fair_departure').stages.length;
    ok(game.acceptPassenger(offer.id, offer.sourceEntityId)); const fixedQuote = game.state.narrative.passenger.fare;
    game.state.rep.freewake = 90; game = Game.fromSave(game.save()); assert.equal(game.state.narrative.passenger.fare, fixedQuote); assert.equal(game.state.narrative.passenger.charterBonus, bonus); assert.equal(game.state.narrative.passenger.support,offer.support);
    go(game, desk(offer.targetBody)); assert.equal(ok(game.deliverPassenger(offer.targetEntityId)).paid, fixedQuote + offer.bonus);
    go(game, { systemId: 'brindle', bodyId: 'weighhouse', entityId: 'quest:passage-desk:weighhouse' }); assert.equal(game.passengerOffers()[0]?.charterBonus, undefined);
    assert.equal(questThread('fair_departure').stages.find(step => step.id === 'charter').options.find(option => option.id === charter).cost.credits || 0, contribution);
  });
}

test('flight reference needs the correct system, position, helm mode and real reactor charge', () => {
  const game = fresh('signal-flight'); accepted(game, 'clear_signal'); until(game, 'clear_signal', 'flight-reference');
  assert.equal(game.threadAction({ threadId: 'clear_signal', action: 'advance' }).code, 'location');
  const target = game.narrativeBoard().active.find(value => value.id === 'clear_signal').target;
  go(game, { ...target, x: target.x + 600 }); assert.equal(game.threadAction({ threadId: 'clear_signal', action: 'advance' }).code, 'distance');
  go(game, target); game.state.ship.energy = 7; assert.equal(game.threadAction({ threadId: 'clear_signal', action: 'advance' }).code, 'energy');
  game.state.ship.energy = 8; ok(game.threadAction({ threadId: 'clear_signal', action: 'advance' })); assert.equal(game.state.ship.energy, 0);
  assert.equal(current(game, 'clear_signal').id, 'calibration');
  assert.equal(game.threadAction({ threadId: 'clear_signal', action: 'advance' }).code, 'action', 'a duplicate reading cannot spend charge again or skip calibration');
});

for (const publication of ['open', 'redacted', 'licensed']) {
  test(`${publication} reporting outcome persists and earned calibration reduces only ordinary scans`, () => {
    let game = fresh(`report-${publication}`); const initialCredits = game.state.credits;
    finish(game, 'clear_signal', { publication });
    const record = game.state.narrative.quests.clear_signal;
    assert.equal(record.choices.publication, publication);
    assert.equal(game.state.credits, initialCredits + record.rewardQuote + (publication === 'licensed' ? 30 : publication === 'redacted' ? -25 : 0));
    assert.equal(game.narrativeScanCost({ kind: 'survey' }), 6);
    assert.equal(game.narrativeScanCost({ story: true }), 8); assert.equal(game.narrativeScanCost({ earthCampaign: true }), 8);
    game = Game.fromSave(game.save()); assert.equal(game.narrativeScanCost({ kind: 'survey' }), 6);
    assert.deepEqual(game.state.narrative.quests.clear_signal.choices, { publication });
    go(game, { systemId: 'hearth', x: 600, y: 600 });
    const signal = { id: 'ordinary-calibration-test', name: 'Test survey', kind: 'survey', x: 600, y: 600, radius: 15, resolved: false, scanned: false };
    game.system.signals.push(signal); game.state.ship.energy = 5;
    assert.equal(game.scan(signal.id).code, 'energy'); assert.equal(signal.scanned, false);
    game.state.ship.energy = 6; ok(game.scan(signal.id)); assert.equal(game.state.ship.energy, 0); assert.equal(signal.scanned, true);
    const credits = game.state.credits; assert.equal(game.threadAction({ threadId: 'clear_signal', action: 'choose', choiceId: publication }).code, 'duplicate'); assert.equal(game.state.credits, credits);
  });
}

test('campaign save normalization preserves unfinished choices and does not invent completed benefits', () => {
  let game = fresh('campaign-reload'); accepted(game, 'cold_chain'); until(game, 'cold_chain', 'bench-test', { parts: 'replace' });
  const credits = game.state.credits, record = structuredClone(game.state.narrative.quests.cold_chain);
  game = Game.fromSave(game.save()); assert.deepEqual(game.state.narrative.quests.cold_chain, record); assert.equal(game.state.credits, credits);
  assert.equal(game.narrativeServiceBenefit('rest'), null); assert.equal(game.narrativeScanCost({ kind: 'survey' }), 8);
  finish(game, 'cold_chain', { agreement: 'care' }); assert.equal(game.state.credits, credits + record.rewardQuote, 'restoration does not charge for parts twice');
});
