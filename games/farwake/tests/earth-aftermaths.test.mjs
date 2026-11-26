import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { STORY_CHAPTERS } from '../dist/content.mjs';
import { EARTH_CAMPAIGN, EARTH_CAMPAIGN_ID } from '../dist/earth-campaign-content.mjs';
import { EARTH_EVIDENCE } from '../dist/earth-investigation.mjs';
import { earthStageTarget } from '../dist/earth-campaign-rules.mjs';
import { questThread } from '../dist/quest-content.mjs';
import { generateSurface } from '../dist/surface.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const record = (game, id = EARTH_CAMPAIGN_ID) => game.state.narrative.quests[id];
const stepFor = (game, id) => questThread(id).stages[record(game, id).stage];
function fresh(seed = 'earth-aftermath') {
  const game = new Game(seed);
  game.state.credits = 5000; game.state.cargo.ore = 40;
  game.state.upgrades.fold_1 = 1; game.state.upgrades.fold_2 = 1; game.state.upgrades.fold_3 = 1;
  game.state.ship.warpRange = 15; game.state.ship.fuel = game.state.ship.maxFuel;
  game.state.completedChapters = STORY_CHAPTERS.map(chapter => chapter.id);
  for (const flag of ['vault_recovered', 'homeward_signal', 'threshold_answered', 'earth_reached', 'council_decision_made']) game._flag(flag);
  return game;
}
function reach(game, target) {
  game._persistRuntime(); Object.assign(game.state, { mode: 'ship', systemId: target.systemId, locationId: null, interior: null, exploration: null, pendingEncounter: null });
  game.state.ship.hull = game.state.ship.maxHull; game.state.ship.destroyed = false;
  game._loadSystem(target.systemId);
  if (!target.bodyId) { Object.assign(game.state.ship, { x: target.x, y: target.y, energy: game.state.ship.maxEnergy, vx: 0, vy: 0 }); return; }
  const body = game.system.bodies.find(body => body.id === target.bodyId); assert.ok(body, target.bodyId);
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 }); ok(game.dock(body.id));
  const surface = generateSurface(body, game.state.seed, game.state.flags), entity = surface.entities.find(entity => entity.id === target.entityId);
  assert.ok(entity, target.entityId); Object.assign(game.state.person, { x: entity.x, y: entity.y });
}
function act(game, id, action = 'advance', extra = {}) {
  return game.threadAction({ threadId: id, action, entityId: stepFor(game, id).at.entityId, ...extra });
}
function reachStep(game, id) { const step = stepFor(game, id); reach(game, earthStageTarget(game, step, record(game, id))); game.syncNarrativeWorld(); return step; }
function disable(game, enemy) {
  Object.assign(game.state.ship, { x: enemy.x - 150, y: enemy.y, angle: 0, vx: 0, vy: 0 });
  for (let i = 0; i < 25 && enemy.hp > 0 && !enemy.disabled; i++) { game._shotTimer = 0; game.state.ship.energy = game.state.ship.maxEnergy; ok(game.fireWeapons()); game._updateBullets(.25, [game]); }
  assert.ok(enemy.disabled || enemy.hp <= 0);
}
function defend(game, id) {
  const step = stepFor(game, id); ok(act(game, id, 'beginDefense'));
  for (let tick = 0; tick < Math.ceil(step.duration * 10) + 4; tick++) {
    for (const enemy of game.system.enemies.filter(enemy => enemy.campaignKey === record(game, id).earth.key && !enemy.disabled)) disable(game, enemy);
    Object.assign(game.state.ship, earthStageTarget(game, step, record(game, id))); game.stepNarrativeWorld(.1, [game]);
  }
  assert.equal(game.earthCampaignStatus(id).status, 'ready'); ok(act(game, id));
}
function finishThread(game, id, choices = {}) {
  if (!record(game, id) || record(game, id).status === 'completed') { reach(game, questThread(id).stages[0].at); ok(game.threadAction({ threadId: id, action: 'accept', entityId: questThread(id).stages[0].at.entityId })); }
  while (record(game, id).status === 'active') {
    const step = reachStep(game, id);
    if (step.kind === 'earth-defense') { defend(game, id); continue; }
    if (step.kind === 'choice') ok(act(game, id, 'choose', { choiceId: choices[step.id] || step.options[0].id }));
    else if (step.kind === 'puzzle') ok(act(game, id, 'solve', { solution: step.puzzle.solution }));
    else ok(act(game, id));
  }
}
function finale(account = 'public', allegiance = 'rogue', seed = 'earth-final-decisions') {
  const game = fresh(seed); ok(game.threadAction({ threadId: EARTH_CAMPAIGN_ID, action: 'accept' }));
  // A late checkpoint: the full preceding physical investigation is covered by
  // earth-campaign.test. These cases exercise the decisions and their aftermath.
  record(game).stage = EARTH_CAMPAIGN.stages.findIndex(step => step.id === 'earth-account');
  game.state.knownLore.push(...Object.keys(EARTH_EVIDENCE)); game._flag('thread:earth_truth_verified');
  finishThread(game, EARTH_CAMPAIGN_ID, { 'earth-account': account, 'earth-allegiance': allegiance });
  return game;
}

test('late evidence is earned at its physical source and the final decisions cannot precede it', () => {
  const game = fresh('late-evidence-guard'); ok(game.threadAction({ threadId: EARTH_CAMPAIGN_ID, action: 'accept' }));
  assert.equal(game.earthAftermathStatus().truthKnown, false); assert.deepEqual(game.earthAftermathStatus().nextThreads, []);
  record(game).stage = EARTH_CAMPAIGN.stages.findIndex(step => step.id === 'sirius-baseline');
  assert.equal(act(game, EARTH_CAMPAIGN_ID).code, 'mode'); assert.ok(!game.state.knownLore.includes('earth-deep-observation'));
  reachStep(game, EARTH_CAMPAIGN_ID); game.state.person.x += 300;
  assert.equal(act(game, EARTH_CAMPAIGN_ID).code, 'distance'); assert.ok(!game.state.knownLore.includes('earth-deep-observation'));
  reachStep(game, EARTH_CAMPAIGN_ID); ok(act(game, EARTH_CAMPAIGN_ID)); assert.ok(game.state.knownLore.includes('earth-deep-observation'));
  record(game).stage = EARTH_CAMPAIGN.stages.findIndex(step => step.id === 'earth-account'); reachStep(game, EARTH_CAMPAIGN_ID);
  const credits = game.state.credits;
  assert.equal(act(game, EARTH_CAMPAIGN_ID, 'choose', { choiceId: 'false-return' }).code, 'evidence');
  assert.equal(record(game).choices['earth-account'], undefined); assert.equal(game.state.credits, credits);
  const restored = Game.fromSave(game.save()); assert.ok(restored.state.knownLore.includes('earth-deep-observation')); assert.equal(restored.earthAftermathStatus().truthKnown, false);
});

test('all account and allegiance combinations preserve the same truth and permit departure and continued work', () => {
  for (const account of ['public', 'sanitized', 'false-return', 'custody']) for (const allegiance of ['concord', 'freewake', 'meridian', 'lantern', 'cinder', 'rogue', 'reservoir']) {
    const game = finale(account, allegiance, `decision-${account}-${allegiance}`), status = game.earthAftermathStatus(), known = [...game.state.knownLore];
    assert.equal(status.truthKnown, true); assert.equal(status.account.id, account); assert.equal(status.allegiance.id, allegiance);
    assert.equal(status.completed, true); assert.equal(status.continuing, true); assert.ok(!game.state.person.down);
    assert.ok(status.nextThreads.some(thread => thread.id.startsWith('earth_service_'))); assert.ok(status.nextThreads.some(thread => !thread.id.startsWith('earth_service_')));
    const credits = game.state.credits; assert.equal(game.threadAction({ threadId: EARTH_CAMPAIGN_ID, action: 'advance' }).code, 'duplicate'); assert.equal(game.state.credits, credits);
    ok(game.launch()); game.state.ship.fuel = game.state.ship.maxFuel; ok(game.travel('alpha-centauri'));
    const restored = Game.fromSave(game.save()); assert.equal(restored.state.systemId, 'alpha-centauri'); assert.deepEqual(restored.state.knownLore, known);
    assert.equal(restored.earthAftermathStatus().account.id, account); assert.equal(restored.earthAftermathStatus().allegiance.id, allegiance);
  }
});

test('each continuing allegiance requires actual work before granting a bounded service or scanner benefit', () => {
  const ports = { concord: ['sol', 'threshold', 'earth-sol', 'repair', .75], freewake: ['brindle', 'weighhouse', 'earth-tess', 'rest', .7], meridian: ['meridian', 'ledger', 'earth-ryn', 'repair', .75], cinder: ['cinder', 'patchwork', 'ferryman', 'repair', .75], rogue: ['hearth', 'kettle', 'earth-vale', 'repair', .8], reservoir: ['sol', 'earth', 'earth-hale', 'repair', .6] };
  for (const allegiance of ['concord', 'freewake', 'meridian', 'lantern', 'cinder', 'rogue', 'reservoir']) {
    const game = finale('public', allegiance, `service-${allegiance}`), id = `earth_service_${allegiance}`;
    assert.equal(game.earthAftermathStatus().agreements.length, 0);
    finishThread(game, id); const saved = Game.fromSave(game.save());
    assert.equal(record(saved, id).status, 'completed');
    if (allegiance === 'lantern') { assert.equal(saved.narrativeScanCost({ id: 'ordinary' }), 4); assert.equal(saved.narrativeScanCost({ id: 'story', story: true }), 8); }
    else {
      const [systemId, bodyId, contact, action, multiplier] = ports[allegiance]; reach(saved, { systemId, bodyId, entityId: `quest:${contact}` });
      assert.equal(saved.narrativeServiceBenefit(action).multiplier, multiplier);
      reach(saved, { systemId: 'hearth', bodyId: 'morrow', entityId: 'quest:earth-ines' }); assert.equal(saved.narrativeServiceBenefit(action), null);
    }
  }
});

test('public, cover-story and custody follow-ups persist the actual signed account without rewriting private knowledge', () => {
  for (const [account, id, choices] of [['public', 'earth_public_followup', { access: 'desk' }], ['sanitized', 'earth_cover_followup', { reply: 'maintain' }], ['sanitized', 'earth_cover_followup', { reply: 'correct' }], ['custody', 'earth_custody_followup', {}]]) {
    const game = finale(account, 'rogue', `account-${account}-${choices.reply || ''}`), known = [...game.state.knownLore]; finishThread(game, id, choices);
    assert.equal(record(game, id).status, 'completed'); assert.deepEqual(game.state.knownLore, known); assert.ok(game.earthAftermathStatus().agreements.length);
    if (id === 'earth_cover_followup') {
      reach(game, { systemId: 'meridian', bodyId: 'ledger', entityId: 'quest:earth-ledger-contract' });
      const text = ok(game.inspectQuestObject('quest:earth-ledger-contract')).object.text;
      assert.match(text, choices.reply === 'correct' ? /signed correction/ : /second statement/);
      assert.equal(record(game).choices['earth-account'], 'sanitized', 'A correction does not erase the original publication choice.');
    }
  }
});

test('both false-return courses require the real relay battle and Ira’s physical rescue, then record different convoy outcomes', () => {
  for (const route of ['recall', 'continue']) {
    let game = finale('false-return', 'rogue', `convoy-${route}`), id = 'earth_return_followup';
    finishThread(game, id, { route });
    assert.deepEqual(record(game, id).earth.delivered, ['convoy-ira']); assert.equal(game.narrativeBerths(), 0);
    assert.equal(game.system.enemies.filter(enemy => enemy.campaignKey === record(game, id).earth.key).length, 0);
    const credits = game.state.credits; game = Game.fromSave(game.save());
    assert.equal(game.threadAction({ threadId: id, action: 'advance' }).code, 'duplicate'); assert.equal(game.state.credits, credits);
    reach(game, { systemId: 'sol', bodyId: 'threshold', entityId: 'quest:earth-recall-console' });
    const text = ok(game.inspectQuestObject('quest:earth-recall-console')).object.text;
    assert.match(text, route === 'recall' ? /returned to screened berths/ : /two transports lost/);
    assert.equal(game.earthAftermathStatus().continuing, true); assert.ok(game.state.person.health > 0);
  }
});

test('contact affiliation supplies paid repeatable field work, enforces a fresh reading, and supports playable defection', () => {
  let game = finale('custody', 'reservoir', 'contact-continuation'); finishThread(game, 'earth_service_reservoir');
  const id = 'earth_reservoir_watch'; reach(game, questThread(id).stages[0].at); ok(game.threadAction({ threadId: id, action: 'accept', entityId: questThread(id).stages[0].at.entityId }));
  reachStep(game, id); game.state.ship.energy = 7; const before = game.state.credits;
  assert.equal(act(game, id).code, 'energy'); assert.equal(record(game, id).stage, 1); assert.equal(game.state.credits, before);
  game.state.ship.energy = 8; ok(act(game, id)); reachStep(game, id); ok(act(game, id, 'choose', { choiceId: 'share' })); assert.equal(game.state.credits, before + 260);
  assert.equal(game.threadAction({ threadId: id, action: 'accept', entityId: 'quest:earth-hale' }).code, 'cooldown');
  const firstKey = record(game, id).earth.key; game.state.stats.time += 181; game = Game.fromSave(game.save());
  finishThread(game, id, { submission: 'refuse' }); assert.notEqual(record(game, id).earth.key, firstKey);
  assert.equal(record(game).choices['earth-allegiance'], 'reservoir'); assert.equal(game.earthAftermathStatus().allegiance.id, 'rogue');
  assert.equal(game.narrativeServiceBenefit('repair'), null); game.state.stats.time += 181;
  assert.equal(game.threadAction({ threadId: id, action: 'accept', entityId: 'quest:earth-hale' }).code, 'requirements');
  ok(game.launch()); game.state.ship.fuel = game.state.ship.maxFuel; ok(game.travel('alpha-centauri'));
});

test('one captain’s final lie and allegiance do not grant another captain evidence, choices or obligations', () => {
  const a = finale('false-return', 'reservoir', 'independent-endings'), b = fresh('independent-endings');
  a._playerId = 'ending-a'; b._playerId = 'ending-b';
  reach(a, { systemId: 'sol', bodyId: 'earth', entityId: 'quest:earth-hale' }); reach(b, { systemId: 'sol', bodyId: 'earth', entityId: 'quest:earth-hale' });
  b.bindSharedWorld(a.system, a._record(), 'ending-b');
  assert.equal(b.earthAftermathStatus().truthKnown, false); assert.equal(b.earthAftermathStatus().account, null); assert.equal(b.earthAftermathStatus().allegiance, null);
  assert.equal(record(b), undefined); assert.equal(b.threadAction({ threadId: 'earth_service_reservoir', action: 'accept', entityId: 'quest:earth-hale' }).code, 'requirements');
  assert.ok(!b.state.flags.some(flag => flag.includes('earth_account') || flag.includes('earth_allegiance')));
});
