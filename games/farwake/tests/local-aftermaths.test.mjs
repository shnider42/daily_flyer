import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { questThread } from '../dist/quest-content.mjs';
import { LOCAL_AFTERMATH_IDS, localCharterSupport, localAftermathTopic } from '../dist/local-campaigns.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const fresh = seed => { const game = new Game(seed); game.state.credits = 1000; game.state.cargo.ore = 30; return game; };
const current = (game, id) => questThread(id).stages[game.state.narrative.quests[id].stage];
const desk = bodyId => ({ systemId: 'hearth', bodyId, entityId: `quest:passage-desk:${bodyId}` });
const completedOriginal = (game, id, choices) => {
  game.state.narrative.quests[id] = { status: 'completed', stage: questThread(id).stages.length, choices, solved: [], rewardQuote: questThread(id).reward, startedAt: 1, finishedAt: 2, targetId: null, huntOutcome: null, shipId: null, evacuated: false, outcome: 'The original report was handed over.' };
};
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
function accept(game, id) {
  go(game, questThread(id).stages[0].at);
  return ok(game.threadAction({ threadId: id, action: 'accept', entityId: questThread(id).stages[0].at.entityId }));
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
  if (!game.state.narrative.quests[id]) accept(game, id);
  while (game.state.narrative.quests[id].status === 'active') {
    if (current(game, id).kind === 'passage-proof' && !game.hasFlag(`thread:${current(game, id).proofFlag}`)) fare(game);
    progress(game, id, choices);
  }
  return game.state.narrative.quests[id];
}
const view = (game, id) => [...game.narrativeBoard().available, ...game.narrativeBoard().active, ...game.narrativeBoard().completed].find(value => value.id === id);

test('aftermaths unlock after the original handover and require a conscious return to the original contact', () => {
  const game = fresh('aftermath-unlocks');
  for (const id of LOCAL_AFTERMATH_IDS) {
    assert.equal(view(game, id), undefined);
    assert.equal(game.threadAction({ threadId: id, action: 'accept' }).code, 'requirements');
    const definition = questThread(id);
    assert.equal(definition.remoteAccept, false);
    assert.ok(definition.stages.every(step => step.at.systemId === 'hearth'));
    assert.ok(definition.stages.length >= 6);
  }
  finish(game, 'cold_chain', { parts: 'replace', agreement: 'care' });
  assert.equal(game.state.narrative.quests.cold_chain_aftercare, undefined, 'completion does not silently accept the follow-up');
  const available = view(game, 'cold_chain_aftercare');
  assert.equal(available.localCampaign.aftermathOf, 'cold_chain'); assert.match(available.text, /clinic agreement/);
  go(game, { systemId: 'hearth', x: 0, y: 0 });
  assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'accept' }).code, 'mode');
  go(game, questThread('cold_chain_aftercare').stages[0].at); game.state.person.x += 200;
  assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'accept' }).code, 'distance');
  go(game, questThread('cold_chain_aftercare').stages[0].at); game.state.person.down = true;
  assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'accept' }).code, 'mode');
  game.state.person.down = false; ok(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'accept' }));
  assert.equal(current(game, 'cold_chain_aftercare').id, 'handover-log');
});

test('the offer, accepted opening and recurring contact topic remember every original decision', () => {
  for (const [original, followup, key, values, contact] of [
    ['cold_chain', 'cold_chain_aftercare', 'agreement', ['care', 'workshop'], 'mara-reed'],
    ['fair_departure', 'departure_aftercare', 'charter', ['care', 'commute', 'courier'], 'len-vale'],
    ['clear_signal', 'signal_aftercare', 'publication', ['open', 'redacted', 'licensed'], 'ada-finch'],
  ]) {
    const openings = new Set(), topics = new Set();
    for (const value of values) {
      const game = fresh(`aftermath-opening-${value}`); completedOriginal(game, original, { [key]: value });
      go(game, questThread(followup).stages[0].at);
      const originalRecord = structuredClone(game.state.narrative.quests[original]), offered = view(game, followup);
      const topic = localAftermathTopic(game, contact); assert.ok(topic?.text); topics.add(topic.text);
      const before = JSON.stringify(game.state), entity = generateSurface(game.currentBody, game.state.seed, game.state.flags).entities.find(entity => entity.id === `quest:${contact}`);
      const conversation = game.conversation(entity, { record: false });
      assert.ok(conversation.topics.some(value => value.id === topic.id)); assert.equal(JSON.stringify(game.state), before);
      const result = accept(game, followup); assert.equal(result.text, offered.text); openings.add(result.text);
      assert.deepEqual(game.state.narrative.quests[original], originalRecord);
    }
    assert.equal(openings.size, values.length); assert.equal(topics.size, values.length);
  }
});

for (const agreement of ['care', 'workshop']) for (const support of ['rota', 'spares']) {
  test(`${agreement} agreement followed by ${support} earns bounded total service rates only after a physical handover`, () => {
    let game = fresh(`aftermath-clinic-${agreement}-${support}`); completedOriginal(game, 'cold_chain', { agreement });
    const original = structuredClone(game.state.narrative.quests.cold_chain); accept(game, 'cold_chain_aftercare');
    until(game, 'cold_chain_aftercare', 'support'); go(game, current(game, 'cold_chain_aftercare').at);
    const before = { credits: game.state.credits, ore: game.state.cargo.ore };
    progress(game, 'cold_chain_aftercare', { support });
    assert.equal(game.state.credits, before.credits - (support === 'rota' ? 45 : 0)); assert.equal(game.state.cargo.ore, before.ore - (support === 'spares' ? 3 : 0));
    assert.match(localAftermathTopic(game, 'mara-reed').text, support === 'rota' ? /hand over|handover time is funded/i : /paid for in parts/);
    go(game, questThread('cold_chain_aftercare').stages[0].at);
    assert.equal(game.narrativeServiceBenefit('rest')?.multiplier ?? 1, agreement === 'care' ? .75 : 1);
    assert.equal(game.narrativeServiceBenefit('repair')?.multiplier ?? 1, agreement === 'workshop' ? .85 : 1);
    const unfinished = structuredClone(game.state.narrative.quests.cold_chain_aftercare);
    game = Game.fromSave(game.save()); assert.deepEqual(game.state.narrative.quests.cold_chain_aftercare, unfinished);
    const reward = unfinished.rewardQuote, credits = game.state.credits; finish(game, 'cold_chain_aftercare');
    assert.equal(game.state.credits, credits + reward);
    assert.equal(game.narrativeServiceBenefit('rest')?.multiplier ?? 1, support === 'rota' ? .65 : agreement === 'care' ? .75 : 1);
    assert.equal(game.narrativeServiceBenefit('repair')?.multiplier ?? 1, support === 'spares' ? .78 : agreement === 'workshop' ? .85 : 1);
    const action = support === 'rota' ? 'rest' : 'repair'; game.state.person.health = 40; game.state.ship.hull -= 30;
    const quote = game.serviceQuote(action), paid = game.state.credits; assert.match(quote.support, /total/);
    ok(game.service(action)); assert.equal(game.state.credits, paid - quote.cost);
    assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'advance', entityId: 'quest:mara-reed' }).code, 'duplicate');
    assert.equal(game.state.credits, paid - quote.cost);
    const caseTarget = questThread('cold_chain_aftercare').stages.find(step => step.id === 'check-handover').at; go(game, caseTarget);
    const text = ok(game.inspectQuestObject(caseTarget.entityId)).object.text;
    assert.match(text, support === 'rota' ? /35%.*total/ : /22%.*total/);
    assert.deepEqual(game.state.narrative.quests.cold_chain, original);
    game = Game.fromSave(game.save()); assert.equal(game.state.narrative.quests.cold_chain_aftercare.status, 'completed');
    go(game, desk('kettle')); assert.equal(game.narrativeServiceBenefit(action), null);
  });
}

test('alarm evidence, proximity and support costs cannot be skipped or spent twice', () => {
  const game = fresh('aftermath-clinic-guards'); completedOriginal(game, 'cold_chain', { agreement: 'care' }); accept(game, 'cold_chain_aftercare');
  assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'advance', entityId: 'quest:clinic-case' }).ok, false);
  until(game, 'cold_chain_aftercare', 'alarm-test'); const alarm = current(game, 'cold_chain_aftercare'); go(game, alarm.at);
  assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'solve', entityId: alarm.at.entityId, solution: ['monitor', 'simulate', 'supply', 'acknowledge'] }).code, 'puzzle');
  assert.deepEqual(game.state.narrative.quests.cold_chain_aftercare.solved, []); progress(game, 'cold_chain_aftercare');
  go(game, current(game, 'cold_chain_aftercare').at); game.state.credits = 44; game.state.cargo.ore = 2;
  const before = JSON.stringify(game.state.narrative);
  for (const choiceId of ['rota', 'spares']) assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'choose', choiceId, entityId: 'quest:mara-reed' }).code, 'cost');
  assert.equal(JSON.stringify(game.state.narrative), before); assert.equal(game.state.credits, 44); assert.equal(game.state.cargo.ore, 2);
  game.state.credits = 45; progress(game, 'cold_chain_aftercare', { support: 'rota' }); assert.equal(game.state.credits, 0);
  assert.equal(game.threadAction({ threadId: 'cold_chain_aftercare', action: 'choose', choiceId: 'rota', entityId: 'quest:mara-reed' }).code, 'action');
  assert.equal(game.state.credits, 0);
});

for (const [charter, type, originalBonus] of [['care', 'patient', 10], ['commute', 'commuter', 6], ['courier', 'courier', 8]]) for (const reserve of ['shared', 'clear']) {
  test(`${charter} charter with ${reserve} follow-up carries its excluded passenger and changes only approved fare supplements`, () => {
    let game = fresh(`aftermath-fare-${charter}-${reserve}`); completedOriginal(game, 'fair_departure', { charter }); accept(game, 'departure_aftercare');
    until(game, 'departure_aftercare', 'reserve'); const credits = game.state.credits;
    progress(game, 'departure_aftercare', { reserve }); assert.equal(game.state.credits, credits - (reserve === 'shared' ? 30 : 0));
    assert.match(localAftermathTopic(game, 'len-vale').text, /reserved booking/);
    go(game, desk('kettle')); const offer = game.passengerOffers()[0];
    assert.equal(offer.targetBody, 'morrow'); assert.equal(offer.aftermathId, 'departure_aftercare');
    assert.equal(offer.name, charter === 'care' ? 'Tamsin Roe' : 'Eda Moss'); assert.equal(offer.type, charter === 'care' ? 'commuter' : 'patient');
    assert.equal(offer.charterBonus, undefined, 'approval cannot subsidize its own trial early');
    ok(game.acceptPassenger(offer.id, offer.sourceEntityId)); const quoted = game.state.narrative.passenger.fare;
    game = Game.fromSave(game.save()); assert.equal(game.state.narrative.passenger.aftermathId, 'departure_aftercare');
    assert.equal(game.state.narrative.passenger.fare, quoted); assert.match(game.state.narrative.passenger.text, /reserved test booking/);
    go(game, desk('morrow')); assert.equal(ok(game.deliverPassenger(offer.targetEntityId)).paid, offer.fare + offer.bonus);
    assert.equal(game.hasFlag('thread:departure_aftercare_trial_complete'), true);
    assert.match(localAftermathTopic(game, 'len-vale').text, /reached Morrow/);
    assert.equal(localCharterSupport(game, 'hearth', type).bonus, originalBonus);
    const reward = game.state.narrative.quests.departure_aftercare.rewardQuote, beforeApproval = game.state.credits;
    finish(game, 'departure_aftercare'); assert.equal(game.state.credits, beforeApproval + reward);
    for (const candidate of ['patient', 'commuter', 'courier']) {
      const expected = candidate === type ? originalBonus + (reserve === 'clear' ? 2 : 0) : reserve === 'shared' ? 4 : 0;
      assert.equal(localCharterSupport(game, 'hearth', candidate)?.bonus || 0, expected);
    }
    assert.equal(localCharterSupport(game, 'brindle', type), null); assert.equal(localCharterSupport(game, 'hearth', 'unknown'), null);
    go(game, desk('kettle'));
    for (const candidate of ['patient', 'commuter', 'courier']) {
      let next;
      for (let serial = 0; serial < 100; serial++) { game.state.narrative.passengerSerial = serial; next = game.passengerOffers()[0]; if (next.type === candidate) break; }
      assert.equal(next.type, candidate); assert.equal(next.aftermathId, undefined);
      assert.equal(next.charterBonus || 0, localCharterSupport(game, 'hearth', candidate)?.bonus || 0);
    }
    assert.equal(game.threadAction({ threadId: 'departure_aftercare', action: 'advance', entityId: 'quest:len-vale' }).code, 'duplicate');
    assert.deepEqual(game.state.narrative.quests.fair_departure.choices, { charter });
  });
}

test('old, unrelated and invented receipts do not satisfy a named booking; its origin cannot remotely deliver it', () => {
  const game = fresh('aftermath-named-proof'); completedOriginal(game, 'fair_departure', { charter: 'care' });
  fare(game); go(game, desk('kettle')); const unrelated = game.passengerOffers()[0]; ok(game.acceptPassenger(unrelated.id, unrelated.sourceEntityId));
  accept(game, 'departure_aftercare'); until(game, 'departure_aftercare', 'trial', { reserve: 'shared' });
  go(game, desk(unrelated.targetBody)); ok(game.deliverPassenger(unrelated.targetEntityId));
  assert.equal(game.hasFlag('thread:departure_aftercare_trial_complete'), false);
  go(game, current(game, 'departure_aftercare').at);
  const denied = game.threadAction({ threadId: 'departure_aftercare', action: 'advance', entityId: 'quest:len-vale', receipt: true, solution: ['Tamsin Roe'] });
  assert.equal(denied.code, 'requirements'); assert.match(denied.reason, /reserved Kettle-to-Morrow/);
  go(game, desk('kettle')); const reserved = game.passengerOffers()[0]; ok(game.acceptPassenger(reserved.id, reserved.sourceEntityId));
  assert.equal(game.deliverPassenger(reserved.targetEntityId).ok, false); assert.equal(game.hasFlag('thread:departure_aftercare_trial_complete'), false);
  go(game, desk('morrow')); ok(game.deliverPassenger(reserved.targetEntityId)); assert.equal(game.hasFlag('thread:departure_aftercare_trial_complete'), true);
  assert.equal(game.deliverPassenger(reserved.targetEntityId).ok, false);
  const restored = Game.fromSave(game.save()); assert.equal(restored.hasFlag('thread:departure_aftercare_trial_complete'), true); finish(restored, 'departure_aftercare');
});

test('a fare accepted before revised charter approval retains its price and original support label across reload', () => {
  let game = fresh('aftermath-existing-quote'); completedOriginal(game, 'fair_departure', { charter: 'care' });
  accept(game, 'departure_aftercare'); until(game, 'departure_aftercare', 'trial', { reserve: 'clear' }); fare(game); progress(game, 'departure_aftercare');
  assert.equal(current(game, 'departure_aftercare').id, 'approval'); go(game, desk('kettle'));
  let offer;
  for (let serial = game.state.narrative.passengerSerial; serial < 100; serial++) { game.state.narrative.passengerSerial = serial; offer = game.passengerOffers()[0]; if (offer.type === 'patient') break; }
  assert.equal(offer.charterBonus, 10); ok(game.acceptPassenger(offer.id, offer.sourceEntityId));
  progress(game, 'departure_aftercare'); assert.equal(localCharterSupport(game, 'hearth', 'patient').bonus, 12);
  game = Game.fromSave(game.save()); const passenger = game.state.narrative.passenger;
  assert.equal(passenger.fare, offer.fare); assert.equal(passenger.charterBonus, 10); assert.equal(passenger.support, offer.support);
  go(game, desk(offer.targetBody)); assert.equal(ok(game.deliverPassenger(offer.targetEntityId)).paid, offer.fare + offer.bonus);
});

for (const publication of ['open', 'redacted', 'licensed']) for (const record of ['consent', 'station']) {
  test(`${publication} report followed by ${record} verification preserves the original publication and earns a checked scan cost`, () => {
    let game = fresh(`aftermath-signal-${publication}-${record}`); completedOriginal(game, 'clear_signal', { publication });
    const original = structuredClone(game.state.narrative.quests.clear_signal), credits = game.state.credits; accept(game, 'signal_aftercare');
    until(game, 'signal_aftercare', 'record'); progress(game, 'signal_aftercare', { record });
    assert.match(localAftermathTopic(game, 'ada-finch').text, record === 'consent' ? /consent register is funded/ : /public station benchmark/);
    assert.equal(game.state.credits, credits - (record === 'consent' ? 20 : 0)); assert.equal(game.narrativeScanCost({ kind: 'survey' }), 6);
    until(game, 'signal_aftercare', 'handover'); assert.equal(game.narrativeScanCost({ kind: 'survey' }), 6);
    game = Game.fromSave(game.save()); const reward = game.state.narrative.quests.signal_aftercare.rewardQuote; progress(game, 'signal_aftercare');
    assert.equal(game.state.credits, credits - (record === 'consent' ? 20 : 0) + reward);
    assert.equal(game.narrativeScanCost({ kind: 'survey' }), 5); assert.equal(game.narrativeScanCost({ story: true }), 8); assert.equal(game.narrativeScanCost({ earthCampaign: true }), 8);
    assert.deepEqual(game.state.narrative.quests.clear_signal, original);
    const recorder = questThread('signal_aftercare').stages.find(step => step.id === 'verification').at; go(game, recorder);
    const text = ok(game.inspectQuestObject(recorder.entityId)).object.text; assert.match(text, record === 'consent' ? /kept separately/ : /without identifying a passenger/); assert.match(text, /Earlier/);
    assert.match(localAftermathTopic(game, 'ada-finch').text, record === 'consent' ? /permission/ : /repeated the station test/);
    go(game, { systemId: 'hearth', x: 600, y: 600 });
    const signal = { id: `aftermath-survey-${publication}-${record}`, name: 'Reference survey', kind: 'survey', x: 600, y: 600, radius: 15, resolved: false, scanned: false };
    game.system.signals.push(signal); game.state.ship.energy = 4; assert.equal(game.scan(signal.id).code, 'energy');
    game.state.ship.energy = 5; ok(game.scan(signal.id)); assert.equal(game.state.ship.energy, 0);
    assert.equal(game.threadAction({ threadId: 'signal_aftercare', action: 'advance' }).code, 'duplicate');
  });
}

test('the new reference requires its own flight position, charge and evidence rather than reusing the original reading', () => {
  const game = fresh('aftermath-reference-guards'); completedOriginal(game, 'clear_signal', { publication: 'licensed' }); accept(game, 'signal_aftercare');
  until(game, 'signal_aftercare', 'independent-reading', { record: 'station' });
  assert.equal(game.threadAction({ threadId: 'signal_aftercare', action: 'advance' }).code, 'location');
  const target = view(game, 'signal_aftercare').target; go(game, { ...target, x: target.x + 600 });
  assert.equal(game.threadAction({ threadId: 'signal_aftercare', action: 'advance' }).code, 'distance');
  go(game, target); game.state.ship.energy = 5;
  assert.equal(game.threadAction({ threadId: 'signal_aftercare', action: 'advance' }).code, 'energy');
  game.state.ship.energy = 6; ok(game.threadAction({ threadId: 'signal_aftercare', action: 'advance' })); assert.equal(game.state.ship.energy, 0);
  assert.equal(game.threadAction({ threadId: 'signal_aftercare', action: 'advance' }).code, 'action');
  const step = current(game, 'signal_aftercare'); go(game, step.at);
  assert.equal(game.threadAction({ threadId: 'signal_aftercare', action: 'solve', entityId: step.at.entityId, solution: ['3', 'names', 'journey'] }).code, 'puzzle');
  assert.equal(game.narrativeScanCost({ kind: 'survey' }), 6); finish(game, 'signal_aftercare');
  assert.equal(game.narrativeScanCost({ kind: 'survey' }), 5);
});
