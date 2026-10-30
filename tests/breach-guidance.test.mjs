import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MISSIONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { interactionForGuidance, objectiveForGuidance, briefingForGuidance, noticeForGuidance, markerLabelForGuidance, markerCueForGuidance, visibleEquipment, hostileToPlayer, automaticFireAllowed } from '../daily_flyer/themes/breach_assets/guidance.mjs';
import { resolveTouchPreset, joystickVector } from '../daily_flyer/themes/breach_assets/touch-controls.mjs';

test('blocked machinery teaches in Simple, hints in Moderate, and stays silent in Expert', () => {
  const barriers = [
    { text: 'Industrial cutter required', label: 'LOCKED', canUse: false },
    { text: 'Conduit insulator required', label: 'LOCKED', canUse: false },
    { text: 'Phase module required', label: 'LOCKED', canUse: false },
    { text: 'Airlock offline — restore power', label: 'OFFLINE', canUse: false },
    { text: 'Security gate — access key required', label: 'LOCKED', canUse: false },
    { text: 'Vault locked — activate both relay consoles', label: 'LOCKED', canUse: false },
  ];
  for (const barrier of barriers) {
    assert.equal(interactionForGuidance(barrier, 'simple'), barrier);
    const hint = interactionForGuidance(barrier, 'moderate');
    assert.equal(hint.canUse, false);
    assert.doesNotMatch(hint.text, /required|cutter|insulator|module|activate|restore|need/i);
    assert.equal(interactionForGuidance(barrier, 'expert'), null);
    const failedUse = { type: 'message', text: barrier.text };
    assert.equal(noticeForGuidance(failedUse, 'expert', barrier), null);
    assert.equal(noticeForGuidance(failedUse, 'moderate', barrier), hint.text);
  }
});

test('valid interactions remain discoverable in all guidance tiers', () => {
  for (const label of ['OPEN', 'CUT', 'CROSS', 'PHASE', 'EQUIP', 'REST', 'TRAVEL']) {
    const action = { text: 'An available action', label, canUse: true };
    for (const guidance of ['simple', 'moderate', 'expert']) assert.equal(interactionForGuidance(action, guidance), action);
  }
});

test('successful actions report what happened without leaking the next prerequisite', () => {
  const progression = { type: 'message', text: 'Central power restored. Find the industrial cutter in the western foundry.' };
  assert.equal(noticeForGuidance(progression, 'simple'), progression.text);
  for (const guidance of ['moderate', 'expert']) {
    assert.equal(noticeForGuidance(progression, guidance), null);
    assert.equal(noticeForGuidance({ type: 'power' }, guidance), 'Power online.');
    assert.equal(noticeForGuidance({ type: 'pickup', item: 'key', text: 'Security key recovered. Reach the extraction gate.' }, guidance), 'Security key recovered');
    assert.equal(noticeForGuidance({ type: 'upgrade', upgrade: 'phase' }, guidance), 'Phase module acquired.');
    assert.equal(noticeForGuidance({ type: 'message', text: 'Find the scattergun in the generator room.' }, guidance), null);
  }
  assert.equal(noticeForGuidance({ type: 'provoked' }, 'expert'), null);
  assert.equal(noticeForGuidance({ type: 'provoked' }, 'simple'), 'Security turns hostile.');
});

test('Expert briefings, objectives, maps and equipment do not reveal unacquired upgrade requirements', () => {
  const game = new Game({ mission: 'underworks-13' });
  assert.equal(objectiveForGuidance(game.getObjective(), 'expert'), null);
  const briefing = briefingForGuidance(MISSIONS.find(m => m.id === 'underworks-13'), 'expert');
  assert.equal(briefing.steps.length, 0);
  assert.doesNotMatch(briefing.text, /cutter|insulator|phase module|guardian|relays/i);
  const info = game.getMapInfo();
  assert.equal(visibleEquipment(info.upgrades, 'expert').length, 0);
  assert.equal(visibleEquipment(info.upgrades, 'simple').length, 3);
  for (const marker of info.markers.filter(m => m.locked || m.type === 'upgrade')) {
    const detail = `${markerLabelForGuidance(marker, 'expert')} ${markerCueForGuidance(marker, 'expert')}`;
    assert.doesNotMatch(detail, /required|needs|cutter|insulator|phase module|acquire/i);
  }
  const owned = [{ id: 'cutter', name: 'Industrial cutter', owned: true }, { id: 'phase', name: 'Phase module', owned: false }];
  assert.deepEqual(visibleEquipment(owned, 'expert').map(item => item.id), ['cutter']);
});

test('guidance presentation does not alter progression or difficulty', () => {
  const game = new Game({ mission: 'underworks-13', difficulty: 'hard' });
  const before = JSON.stringify(game.serialize());
  for (const guidance of ['simple', 'moderate', 'expert']) {
    objectiveForGuidance(game.getObjective(), guidance);
    interactionForGuidance(game.getInteractionInfo(), guidance);
    game.getMapInfo().markers.forEach(marker => { markerLabelForGuidance(marker, guidance); markerCueForGuidance(marker, guidance); });
  }
  assert.equal(JSON.stringify(game.serialize()), before);
  assert.equal(game.options.difficulty, 'hard');
});

test('automatic fire ignores neutral and dead actors while allowing provoked security', () => {
  assert.equal(hostileToPlayer({ alive: true, health: 80, faction: 'security', provoked: false }), false);
  assert.equal(hostileToPlayer({ alive: true, health: 80, faction: 'security', provoked: true }), true);
  assert.equal(hostileToPlayer({ alive: true, health: 40, faction: 'infestation' }), true);
  assert.equal(hostileToPlayer({ alive: false, health: 0, faction: 'security', provoked: true }), false);
});

test('automatic fire will not provoke a neutral sentry standing in front of its target or inside shotgun spread', () => {
  const player = { x: 5, z: 15, angle: 0, weapon: 'pistol' };
  const creature = { x: 5, z: 5, alive: true, health: 50, faction: 'infestation' };
  const sentry = { x: 5, z: 10, alive: true, health: 80, faction: 'security', provoked: false };
  assert.equal(automaticFireAllowed([creature], player), true);
  assert.equal(automaticFireAllowed([creature, sentry], player), false);
  assert.equal(automaticFireAllowed([creature, { ...sentry, provoked: true }], player), true);
  assert.equal(automaticFireAllowed([creature, { ...sentry, x: 6 }], player), true);
  assert.equal(automaticFireAllowed([creature, { ...sentry, x: 5.6 }], { ...player, weapon: 'shotgun' }), false);
  assert.equal(automaticFireAllowed([creature], player, { hasLineOfSight: () => false }), false);
});

test('shotgun protection uses the actual core assist pool even when a farther target redirects its spread', () => {
  const scenario = () => {
    const game = new Game({ mission: 'underworks-13', aimAssist: true, seed: 42 });
    game.start();
    const player = game.state.player;
    Object.assign(player, { x: 40, z: 40, angle: 0, weapon: 'shotgun', hasShotgun: true });
    player.ammo.shells = 10;
    const base = game.state.enemies.find(enemy => enemy.type === 'runner');
    const actor = (id, range, angle, faction) => ({ ...base, id, x: player.x + Math.sin(angle) * range, z: player.z - Math.cos(angle) * range, type: faction === 'security' ? 'sentry' : 'runner', faction, provoked: false, alive: true, health: 120, maxHealth: 120 });
    game.state.enemies = [actor('far-center', 14, 0, 'infestation'), actor('near-right', 10, .08, 'infestation'), actor('neutral-left', 8, -.08, 'security')];
    // An open sightline isolates weapon targeting from the authored map layout.
    game.hasLineOfSight = () => true;
    game._rng = () => .5;
    return game;
  };
  const manual = scenario();
  manual._fire();
  assert.ok(manual.state.enemies[2].health < 120, 'The real assisted shotgun shot hits the left sentry in this regression scenario');
  assert.equal(manual.state.enemies[2].provoked, true);

  const automatic = scenario();
  const allowed = automaticFireAllowed(automatic.state.enemies, automatic.state.player, { aimAssist: true, hasLineOfSight: automatic.hasLineOfSight.bind(automatic) });
  assert.equal(allowed, false, 'A center target beyond shotgun range still determines the assisted aim and must be considered');
  if (allowed) automatic._fire();
  assert.equal(automatic.state.enemies[2].health, 120);
  assert.equal(automatic.state.enemies[2].provoked, false);
});

test('phone defaults are compact in both orientations and manual choices survive resizing', () => {
  for (const [width, height] of [[390, 844], [844, 390], [430, 932], [932, 430]]) {
    assert.equal(resolveTouchPreset(undefined, { coarse: true, width, height }), 'compact');
    assert.equal(resolveTouchPreset('large', { coarse: true, width, height }), 'large');
    assert.equal(resolveTouchPreset('standard', { coarse: true, width, height }), 'standard');
  }
  assert.equal(resolveTouchPreset(undefined, { coarse: false, width: 1440, height: 900 }), 'standard');
  assert.equal(resolveTouchPreset(undefined, { coarse: true, width: 1024, height: 768 }), 'standard');
});

test('all thumb-pad sizes reach full travel, clamp drags outside the pad, and retain a dead zone', () => {
  for (const size of [84, 100, 120, 132, 152]) {
    const bounds = { left: 20, top: 100, width: size, height: size }, cx = 20 + size / 2, cy = 100 + size / 2;
    assert.deepEqual(joystickVector(bounds, cx, cy), { x: 0, y: 0, dx: 0, dy: 0 });
    const forward = joystickVector(bounds, cx, cy - 1000);
    assert.equal(forward.x, 0); assert.equal(forward.y, -1);
    assert.ok(Math.abs(forward.dy + size * .33) < 1e-8);
    const diagonal = joystickVector(bounds, cx + 1000, cy - 1000);
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-8);
    assert.equal(joystickVector(bounds, cx + 1, cy + 1).x, 0);
  }
});
