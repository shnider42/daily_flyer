import test from 'node:test';
import assert from 'node:assert/strict';
import { GuidanceSession, normalizeTutorialProgress, guidanceDescription, explainObjective, contextualGuidance, FIELD_EXPLANATIONS } from '../public/guidance.mjs';

const soldier = (changes = {}) => ({ id: 1, x: 100, y: 100, alive: true, downed: false, hp: 100, maxHp: 100, ammo: 30, magSize: 30, reserve: 90, medkits: 1, suppression: 0, reloadTimer: 0, ...changes });
const game = (changes = {}) => ({ status: 'playing', time: 0, role: 'leader', squad: [soldier(), soldier({ id: 2 })], ...changes });
const tutorialAt = (step, role = 'leader') => {
  const session = new GuidanceSession({ version: 1, status: 'active', step });
  session.start({ role });
  return session;
};
const bind = action => ({ moveUp: 'I', moveLeft: 'J', moveDown: 'K', moveRight: 'L', fire: 'Mouse 5', interact: 'Enter', ping: 'Mouse 4', map: 'Tab', regroup: 'U', hold: 'O', radio: 'Comma', reload: 'Backspace', observe: 'Period' })[action];

test('tutorial progress survives reload while completion, dismissal, and skips remain distinct', () => {
  const session = new GuidanceSession();
  assert.deepEqual(session.snapshot(), { version: 1, status: 'new', step: 0 });
  assert.equal(session.start(), true);
  assert.equal(session.complete(), false);
  assert.equal(session.skip(), true);
  const restored = new GuidanceSession(session.snapshot());
  assert.equal(restored.start(), true);
  assert.equal(restored.step, 'aim');
  restored.dismiss();
  assert.equal(new GuidanceSession(restored.snapshot()).start(), false);
  assert.equal(restored.status, 'dismissed');
  restored.replay();
  assert.equal(restored.step, 'move');
  for (let i = 0; i < 5; i++) assert.equal(restored.skip(), true);
  assert.equal(restored.status, 'active');
  assert.equal(restored.skip(), false);
  assert.equal(restored.view().final, true);
  assert.equal(restored.complete(), true);
  assert.equal(restored.status, 'complete');
  assert.equal(restored.view(), null);
  assert.equal(new GuidanceSession(restored.snapshot()).start(), false);
});

test('movement practice counts actual travel and ignores time, downed input, map movement, and soldier switches', () => {
  const session = tutorialAt(0);
  for (let i = 0; i < 100; i++) session.observe({ player: soldier() });
  assert.equal(session.step, 'move');
  session.observe({ player: soldier({ x: 900, downed: true }) });
  session.observe({ player: soldier({ x: 900 }), showMap: true });
  session.observe({ player: soldier({ x: 900 }), canAct: false });
  session.observe({ player: soldier({ x: 1000, id: 2 }) });
  assert.equal(session.step, 'move');
  session.observe({ player: soldier({ x: 1200, id: 2 }) });
  assert.equal(session.step, 'move', 'large correction cannot finish movement practice');
  session.observe({ player: soldier({ x: 1225, id: 2 }) });
  session.observe({ player: soldier({ x: 1249, id: 2 }) });
  assert.equal(session.step, 'aim');
  session.observe({ player: soldier({ x: 1350, id: 2 }) });
  assert.equal(session.step, 'aim', 'a second HUD observation cannot skip the aim step');
});

test('aim practice requires real pointer travel while gameplay accepts input and never requires a shot', () => {
  const session = tutorialAt(1);
  session.record('fire', { accepted: true });
  session.record('aim', { x: 10, y: 10, canAct: false });
  session.record('aim', { x: 500, y: 500, canAct: false });
  assert.equal(session.step, 'aim');
  session.record('aim', { x: 100, y: 100, canAct: true });
  session.record('aim', { x: 100, y: 100, canAct: true });
  session.record('aim', { x: NaN, y: 100, canAct: true });
  session.record('aim', { x: 200, y: 100, canAct: true });
  assert.equal(session.step, 'aim');
  session.record('aim', { x: 245, y: 100, canAct: true });
  assert.equal(session.step, 'ping');
});

test('ping and squad teaching advance only after the correct accepted actions', () => {
  const session = tutorialAt(2);
  session.record('ping');
  session.record('ping', { accepted: false });
  session.record('order', { accepted: true, order: 'move' });
  assert.equal(session.step, 'ping');
  session.record('ping', { accepted: true });
  assert.equal(session.step, 'map');
  session.skip();
  session.record('order', { accepted: false, order: 'follow' });
  session.record('order', { accepted: true, order: 'move' });
  session.record('order', { accepted: true, order: 'ready' });
  assert.equal(session.step, 'squad');
  session.record('order', { accepted: true, order: 'follow' });
  assert.equal(session.step, 'objective');
  const member = tutorialAt(4, 'member');
  member.record('order', { accepted: true, order: 'follow' });
  assert.equal(member.step, 'squad');
  member.record('order', { accepted: true, order: 'ready' });
  assert.equal(member.step, 'objective');
});

test('map practice requires opening and closing the real map; back resets evidence', () => {
  const session = tutorialAt(3);
  session.record('map', { accepted: true });
  session.observe({ player: soldier(), showMap: false });
  assert.equal(session.step, 'map');
  session.observe({ player: soldier(), showMap: true, canAct: false });
  assert.equal(session.step, 'map');
  session.observe({ player: soldier(), showMap: false, canAct: false });
  assert.equal(session.step, 'map');
  session.observe({ player: soldier(), showMap: false, canAct: true });
  assert.equal(session.step, 'squad');
  session.back();
  session.observe({ player: soldier(), showMap: false });
  assert.equal(session.step, 'map');
  session.back(); session.back(); session.back();
  assert.equal(session.step, 'move');
  assert.equal(session.back(), false);
});

test('saved progress is bounded and copied without retaining unknown fields', () => {
  for (const malformed of [null, [], 'complete', { version: 2, status: 'complete' }, { version: 1, status: 'anything', step: Infinity }]) {
    assert.deepEqual(normalizeTutorialProgress(malformed), { version: 1, status: 'new', step: 0 });
  }
  const saved = { version: 1, status: 'active', step: 2, player: 'ignored' };
  const session = new GuidanceSession(saved);
  session.start(); session.skip();
  assert.equal(saved.step, 2);
  const copied = session.snapshot(); copied.step = 0;
  assert.equal(session.step, 'map');
  assert.deepEqual(normalizeTutorialProgress({ version: 1, status: 'complete', step: 1 }), { version: 1, status: 'complete', step: 5 });
});

test('tutorial copy follows rebound controls, current objective, and member authority', () => {
  const session = tutorialAt(0);
  assert.match(session.view({ bind }).task, /I · J · K · L/);
  session.skip();
  assert.match(session.view({ bind }).task, /Mouse 5/);
  assert.match(session.view({ bind }).body, /solid walls/);
  session.skip();
  assert.match(session.view({ bind }).task, /Mouse 4/);
  session.skip();
  assert.match(session.view({ bind }).task, /Tab/);
  session.skip();
  assert.match(session.view({ bind }).task, /U/);
  const member = tutorialAt(4, 'member');
  assert.match(member.view({ bind }).body, /Hale leads/);
  assert.doesNotMatch(member.view({ bind }).task, /send|order the squad/i);
  session.skip();
  assert.match(session.view({ bind, objective: { kind: 'repair' } }).body, /Hold Enter/);
});

test('all mission kinds receive short actual-mechanics help without reading hidden stages', () => {
  const task = { kind: 'recon', get stages() { throw Error('future stages read'); }, get enemies() { throw Error('hidden enemies read'); } };
  assert.match(explainObjective(task, { bind }), /Hold Enter/);
  assert.match(explainObjective(task, { bind }), /clear view/);
  assert.match(explainObjective({ kind: 'convoy' }), /vehicles wait/i);
  assert.match(explainObjective({ kind: 'extract' }), /every living squadmate/i);
  assert.match(explainObjective({ kind: 'rally' }, { role: 'member' }), /Stay near Hale/);
  for (const kind of ['rally', 'hold', 'recon', 'rescue', 'interact', 'deliver', 'convoy', 'barricade', 'repair', 'escort', 'extract']) {
    const simple = explainObjective({ kind }, { guidance: 'simple', bind });
    const moderate = explainObjective({ kind }, { guidance: 'moderate', bind });
    assert.ok(simple.length > moderate.length, kind);
    assert.ok(simple.length < 280, kind);
  }
  assert.equal(explainObjective({ kind: 'extract', detail: 'Squad 3/4' }, { guidance: 'expert' }), 'Squad 3/4');
  for (const level of ['simple', 'moderate', 'expert']) assert.match(guidanceDescription(level), /Combat difficulty is a separate setting/);
});

test('context prioritizes downed state, casualties, health, ammo, and suppression over routine hints', () => {
  const field = game({ story: { activeDecision: { title: 'A choice' } } });
  const tip = changes => contextualGuidance({ game: field, player: soldier(changes), guidance: 'simple', bind, inside: true });
  assert.equal(tip({ downed: true, hp: 0, ammo: 0 }).id, 'downed');
  assert.equal(tip({ hp: 15, ammo: 0 }).id, 'health');
  assert.equal(tip({ reloadTimer: 1, ammo: 0 }).id, 'reload');
  assert.equal(tip({ ammo: 0 }).id, 'empty');
  assert.match(tip({ ammo: 0 }).body, /Backspace/);
  assert.equal(tip({ ammo: 0, reserve: 0 }).id, 'no-ammo');
  assert.equal(tip({ suppression: .8 }).id, 'suppression');
  assert.equal(tip({}).id, 'radio');
  assert.equal(tip({ flashUntil: 2 }).id, 'flash');
  const casualty = contextualGuidance({ game: field, player: soldier({ hp: 15 }), assist: { label: 'Revive', detail: 'Hold to help Ames' }, bind });
  assert.equal(casualty.id, 'casualty');
  assert.equal(casualty.body, 'Hold Enter to help Ames.');
});

test('delivery help follows dropped cargo markers and human carrier responsibility', () => {
  const objective = { kind: 'deliver', actionTarget: { recovery: true } };
  const simple = explainObjective(objective, { bind });
  assert.match(simple, /item was dropped/);
  assert.match(simple, /hold Enter to pick it up/);
  assert.match(simple, /marker then shows where to deliver it/);
  assert.doesNotMatch(simple, /hand it over/);
  assert.match(explainObjective(objective, { bind, guidance: 'moderate' }), /Hold Enter nearby to pick it up/);
  assert.match(explainObjective({ kind: 'deliver' }, { bind }), /partner carries it, they must do this/);
});

test('co-op casualty help offers free standing soldiers and respects reconnect reservations', () => {
  const lost = soldier({ alive: false });
  const field = game({ coop: true, squad: [lost, soldier({ id: 2 }), soldier({ id: 3 }), soldier({ id: 4, downed: true })], multiplayer: { selfId: 'self', players: [{ id: 'self', actorId: 1 }, { id: 'partner', actorId: 2, connected: false }] } });
  assert.match(contextualGuidance({ game: field, player: lost }).body, /free standing soldier’s card/);
  field.squad[2].downed = true;
  assert.doesNotMatch(contextualGuidance({ game: field, player: lost }).body, /card/);
  field.multiplayer.players.pop();
  assert.match(contextualGuidance({ game: field, player: lost }).body, /free standing soldier’s card/);
});

test('expert has no teaching overlay; moderate avoids routine duplicate objective and interior copy', () => {
  for (const guidance of ['expert', 'moderate']) assert.equal(contextualGuidance({ game: game(), player: soldier(), inside: true, objective: { interaction: true }, guidance }), null);
  assert.equal(contextualGuidance({ game: game(), player: soldier({ hp: 1 }), guidance: 'expert' }), null);
  assert.equal(contextualGuidance({ game: game({ status: 'won' }), player: soldier() }), null);
  assert.equal(contextualGuidance({ game: game(), player: soldier(), inside: true }).id, 'cover');
  assert.match(FIELD_EXPLANATIONS.find(entry => entry.term === 'Smoke').meaning, /does not stop bullets/);
  assert.match(FIELD_EXPLANATIONS.find(entry => entry.term === 'Ping').meaning, /does not send the squad/);
});
