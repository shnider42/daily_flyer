// Presentation only: guidance never changes access rules, combat, or rewards.
export const GUIDANCE_DESCRIPTIONS = {
  simple: 'Clear explanations, a route hint, and a tutorial as you play.',
  moderate: 'Read the machinery. Short sensory hints, with no route to follow.',
  expert: 'Learn from the world. Action prompts appear only when you can use something.',
};

const barrierCues = {
  cutter: 'Welded braces seal this passage.',
  insulator: 'Current arcs across the conduit.',
  phase: 'The surface shimmers out of alignment.',
  power: 'The indicator panel is dark.',
  relays: 'Two circuit traces meet at the sealed lock.',
  key: 'A narrow reader socket blinks beside the gate.',
  guardian: 'Movement stirs beyond the containment seal.',
};

export function blockedCue(info) {
  const text = info?.text || '';
  if (/cutter/i.test(text)) return barrierCues.cutter;
  if (/insulator/i.test(text)) return barrierCues.insulator;
  if (/phase/i.test(text)) return barrierCues.phase;
  if (/other end|partner/i.test(text)) return 'One end of the transit link is lit.';
  if (/power|offline/i.test(text)) return barrierCues.power;
  if (/relay|uplink/i.test(text)) return barrierCues.relays;
  if (/key/i.test(text)) return barrierCues.key;
  if (info?.label === 'THREAT') return 'There is movement nearby.';
  return 'The mechanism does not respond.';
}

export function interactionForGuidance(info, guidance) {
  if (!info || guidance === 'simple' || info.canUse) return info;
  if (guidance === 'expert') return null;
  return { ...info, text: blockedCue(info), label: 'OBSERVE' };
}

export function objectiveForGuidance(objective, guidance) {
  if (guidance === 'simple') return objective;
  if (guidance === 'expert') return null;
  const titles = {
    arrival: 'Find a way into the facility', power: 'Trace the silent machinery',
    cutter: 'Explore the working machinery', insulator: 'Follow the conduits',
    phase: 'Explore beyond the live conduits', relays: 'Trace the disconnected circuits',
    guardian: 'Read the guardian’s movements', key: 'Search the chamber',
    return: 'Return to the arrival lift', extraction: 'Reach extraction',
  };
  return { title: titles[objective?.stage] || 'Explore the facility', detail: '', stage: objective?.stage };
}

export function briefingForGuidance(mission, guidance) {
  if (guidance === 'simple') return { text: mission.briefing, steps: mission.steps };
  const briefs = {
    'blacksite-07': 'Emergency lights mark an abandoned research facility. Get inside, read its machinery, and find a way out.',
    'relay-09': 'A silent communications ring surrounds a sealed vault. Its disconnected circuitry runs through rooms that are no longer empty.',
    'crosslink-11': 'The compact relay complex has lost its signal. Explore its two wings and find a way to call for extraction.',
    'underworks-13': 'An entire facility stretches beneath the arrival lift. Explore connected sectors, remember the barriers you pass, and find a route back.',
  };
  return {
    text: briefs[mission.id] || 'Explore the facility and find a way out.',
    steps: guidance === 'expert' ? [] : ['Read the machinery around you', 'Remember the routes you discover', 'Find your way to extraction'],
  };
}

export function noticeForGuidance(event, guidance, interaction = null) {
  const eligible = ['message', 'pickup', 'checkpoint', 'secret', 'upgrade', 'refuge', 'transit-activated', 'transit', 'reward'];
  if (event.type === 'provoked') return guidance === 'expert' ? null : 'Security turns hostile.';
  if (guidance === 'simple') return eligible.includes(event.type) ? event.text || null : null;
  // Generic message events often repeat a successful event with a next-step spoiler.
  // Only explicit resource feedback and observed blocked cues pass this boundary.
  if (event.type === 'message') {
    if (/^No shells\./.test(event.text || '')) return 'No shells.';
    if (/^Cell empty\./.test(event.text || '')) return 'Cell empty.';
    if (/^Emergency cell:/.test(event.text || '')) return 'Emergency cell recharged.';
    if (guidance === 'moderate' && interaction && !interaction.canUse && event.text === interaction.text) return blockedCue(interaction);
    return null;
  }
  if (event.type === 'pickup') return (event.text || '').split('. ')[0] || null;
  if (event.type === 'upgrade') return ({ cutter: 'Industrial cutter acquired.', insulator: 'Conduit insulator acquired.', phase: 'Phase module acquired.' })[event.upgrade] || 'Equipment acquired.';
  if (event.type === 'power') return 'Power online.';
  if (event.type === 'relay') return 'Relay online.';
  if (event.type === 'checkpoint') return 'Checkpoint saved.';
  if (event.type === 'refuge') return 'Refuge secured. Supplies restored.';
  if (event.type === 'transit-activated') return 'Transit station active.';
  if (event.type === 'transit') return 'Transit complete.';
  if (event.type === 'secret') return 'Hidden cache discovered.';
  if (event.type === 'reward') return (event.text || '').split('. ')[0] || null;
  return null;
}

export function markerLabelForGuidance(marker, guidance) {
  if (guidance === 'simple') return marker.label;
  if (marker.type === 'upgrade') return marker.active ? marker.label.replace(/^Acquire /i, '') : 'Equipment station';
  if (marker.type === 'shortcut') return ({ cutter: 'Welded service passage', insulator: 'Energized service passage', phase: 'Shimmering service passage' })[marker.requires] || 'Service passage';
  return ({ grille: 'Welded grille', hazard: 'Energized conduit', phase: 'Shimmering field', gate: 'Airlock', cache: 'Supply cache' })[marker.type] || marker.label;
}

export function markerCueForGuidance(marker, guidance) {
  if (guidance === 'simple') return null;
  if (marker.locked) return guidance === 'expert' ? '' : barrierCues[marker.requires] || 'The mechanism does not respond.';
  if (marker.type === 'upgrade') return marker.active ? 'Equipment acquired' : 'Station discovered';
  if (marker.type === 'transit') return marker.active ? 'Station active' : 'Station discovered';
  if (marker.type === 'refuge') return marker.active ? 'Refuge visited' : 'Refuge discovered';
  if (['grille', 'hazard', 'phase', 'shortcut', 'gate'].includes(marker.type)) return marker.active ? 'Passage open' : guidance === 'expert' ? '' : 'Mechanism within reach';
  if (marker.type === 'guardian') return marker.active ? 'Containment cleared' : 'Movement in containment';
  return marker.active ? 'Visited' : '';
}

export function visibleEquipment(upgrades, guidance) {
  return guidance === 'simple' ? upgrades : upgrades.filter(item => item.owned);
}

export function hostileToPlayer(enemy) {
  return enemy.alive !== false && enemy.health > 0 && (enemy.faction !== 'security' || enemy.provoked === true);
}

export function automaticFireAllowed(enemies, player, { aimAssist = false, hasLineOfSight = () => true } = {}) {
  const range = player.weapon === 'shotgun' ? 13 : 16;
  const delta = angle => Math.atan2(Math.sin(angle - player.angle), Math.cos(angle - player.angle));
  const visible = enemies.filter(enemy => hostileToPlayer(enemy)
    && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 16
    && hasLineOfSight(player.x, player.z, enemy.x, enemy.z))
    .map(enemy => ({ enemy, distance: Math.hypot(enemy.x - player.x, enemy.z - player.z), angle: Math.atan2(enemy.x - player.x, -(enemy.z - player.z)) }));
  if (!visible.some(target => target.distance < range && Math.abs(delta(target.angle)) < .085)) return false;
  // Triggering automatic fire and choosing assisted aim are different decisions.
  // Match Game._fire's full 16-unit/.12-radian assist pool, including a target
  // beyond shotgun range that can redirect the actual pellet spread.
  const assisted = aimAssist ? visible.filter(target => Math.abs(delta(target.angle)) < .12)
    .sort((a, b) => Math.abs(delta(a.angle)) - Math.abs(delta(b.angle))) : [];
  const aim = assisted?.[0]?.angle ?? player.angle;
  // A creature behind a neutral sentry is not a safe automatic shot. Include
  // the scattergun's entire spread; deliberate manual fire remains available.
  return !enemies.some(enemy => {
    if (!enemy.alive || enemy.health <= 0 || hostileToPlayer(enemy)) return false;
    const dx = enemy.x - player.x, dz = enemy.z - player.z;
    const along = dx * Math.sin(aim) - dz * Math.cos(aim);
    const across = Math.abs(dx * Math.cos(aim) + dz * Math.sin(aim));
    const spread = player.weapon === 'shotgun' ? Math.tan(.09) * along : 0;
    return along > 0 && along < (player.weapon === 'shotgun' ? 13 : 23)
      && across < .32 + spread && hasLineOfSight(player.x, player.z, enemy.x, enemy.z);
  });
}
