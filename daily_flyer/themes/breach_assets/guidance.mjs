import { WEAPONS } from './core.mjs';

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
  if (/shutter path occupied|doorway occupied|clear the doorway/i.test(text)) return 'Movement interrupts the doorway sensor.';
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
    arrival: 'Find a way into the facility', practice: 'Explore the training gallery', power: 'Trace the silent machinery',
    cutter: 'Explore the working machinery', insulator: 'Follow the conduits',
    phase: 'Explore beyond the live conduits', relays: 'Trace the disconnected circuits',
    guardian: 'Read the guardian’s movements', key: 'Search the chamber', arc: 'Explore the equipment bay', weapon: 'Explore the equipment bay',
    return: 'Find your route back', extraction: 'Reach extraction', extract: 'Reach extraction',
  };
  return { title: titles[objective?.stage] || 'Explore the facility', detail: '', stage: objective?.stage };
}

export function briefingForGuidance(mission, guidance) {
  if (guidance === 'simple') return { text: mission.briefing, steps: mission.steps, subtitle: mission.subtitle };
  const subtitles = {
    'blacksite-07': 'The first breach', 'relay-09': 'A silent communications ring',
    'crosslink-11': 'A divided relay complex', 'underworks-13': 'An entire world beneath the breach',
    'hollow-19': 'The recording answers first.', 'switchyard-15': 'Signals across the freight yard', 'glasshouse-17': 'Life behind the glass',
  };
  const briefs = {
    'blacksite-07': 'Emergency lights mark an abandoned research facility. Get inside, read its machinery, and find a way out.',
    'relay-09': 'A silent communications ring surrounds a sealed vault. Its disconnected circuitry runs through rooms that are no longer empty.',
    'crosslink-11': 'The compact relay complex has lost its signal. Explore its two wings and find a way to call for extraction.',
    'underworks-13': 'An entire facility stretches beneath the arrival lift. Explore connected sectors, remember the barriers you pass, and find a route back.',
    'switchyard-15': 'The freight yard is divided by heavy shutters and numbered circuits. Read its signals, choose when to open a route, and watch what moves on the other side.',
    'hollow-19': 'The listening complex was sealed years ago. A transmission continues from its empty wards. Follow the cables, read what the staff left behind, and find your way back.',
    'glasshouse-17': 'Light filters through a silent research conservatory. Broken sightlines divide its galleries; follow the machinery through the growth and find a way back.',
  };
  return {
    text: briefs[mission.id] || 'Explore the facility and find a way out.',
    subtitle: subtitles[mission.id] || 'Explore the facility',
    steps: guidance === 'expert' ? [] : ['Read the machinery around you', 'Remember the routes you discover', 'Find your way to extraction'],
  };
}

export function noticeForGuidance(event, guidance, interaction = null, { observed = false } = {}) {
  if (event.type === 'containment-routed') return guidance === 'expert' ? null : event.text;
  if (event.type === 'record') return `${event.title} — recorded in the field journal.`;
  const eligible = ['message', 'pickup', 'checkpoint', 'secret', 'upgrade', 'refuge', 'transit-activated', 'transit', 'reward', 'shutter'];
  const encounter = {
    'shield-hit': { simple: 'The front shield reduces damage. Flank the bulwark or wait for its shield to open.', moderate: 'Sparks scatter from the front plate.' },
    heal: { simple: 'The mender is healing another creature. Damage the mender to interrupt its next healing pulse.', moderate: 'A bright beam links the creatures.' },
    'heal-interrupt': { simple: 'Healing interrupted.', moderate: 'The healing beam breaks.' },
  }[event.type];
  if (encounter) return observed && guidance !== 'expert' ? encounter[guidance] || null : null;
  if (event.type === 'provoked') return guidance === 'expert' ? null : 'Security turns hostile.';
  if (guidance === 'simple') return eligible.includes(event.type) ? event.text || null : null;
  // Generic message events often repeat a successful event with a next-step spoiler.
  // Only explicit resource feedback and observed blocked cues pass this boundary.
  if (event.type === 'message') {
    if (/^No shells\./.test(event.text || '')) return 'No shells.';
    if (/^No (arc )?cells\./i.test(event.text || '')) return 'No arc cells.';
    if (/^No (rebound )?slugs\./i.test(event.text || '')) return 'No rebound slugs.';
    if (/^No (thumper )?grenades\./i.test(event.text || '')) return 'No grenades.';
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
  if (event.type === 'shutter') return event.open ? 'Shutter raised.' : 'Shutter lowered.';
  if (event.type === 'secret') return 'Hidden cache discovered.';
  if (event.type === 'reward') return (event.text || '').split('. ')[0] || null;
  return null;
}

export function markerLabelForGuidance(marker, guidance) {
  if (guidance === 'simple') return marker.label;
  if (marker.type === 'upgrade') return marker.active ? marker.label.replace(/^Acquire /i, '') : 'Equipment station';
  if (marker.type === 'shutter' || marker.type === 'shutter-switch') return marker.mark ? `Shutter circuit ${marker.mark}` : 'Shutter control';
  if (marker.type === 'shortcut') return ({ cutter: 'Welded service passage', insulator: 'Energized service passage', phase: 'Shimmering service passage' })[marker.requires] || 'Service passage';
  return ({ grille: 'Welded grille', hazard: 'Energized conduit', phase: 'Shimmering field', gate: 'Airlock', cache: 'Supply cache' })[marker.type] || marker.label;
}

export function markerCueForGuidance(marker, guidance) {
  if (guidance === 'simple') return null;
  if (marker.locked) return guidance === 'expert' ? '' : barrierCues[marker.requires] || 'The mechanism does not respond.';
  if (marker.type === 'upgrade') return marker.active ? 'Equipment acquired' : 'Station discovered';
  if (marker.type === 'transit') return marker.active ? 'Station active' : 'Station discovered';
  if (marker.type === 'refuge') return marker.active ? 'Refuge visited' : 'Refuge discovered';
  if (marker.type === 'shutter' || marker.type === 'shutter-switch') return marker.active ? 'Shutter raised' : 'Shutter lowered';
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
  const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
  // Bank shots and delayed explosions can hit actors beyond the initial aim
  // line. Their trigger remains deliberate, even when automatic fire is on.
  if (weapon.autoFire === false) return false;
  const range = Math.min(16, weapon.range);
  const delta = angle => Math.atan2(Math.sin(angle - player.angle), Math.cos(angle - player.angle));
  const visible = enemies.filter(enemy => hostileToPlayer(enemy)
    && Math.hypot(enemy.x - player.x, enemy.z - player.z) < Math.max(range, weapon.aimAssistRange)
    && hasLineOfSight(player.x, player.z, enemy.x, enemy.z))
    .map(enemy => ({ enemy, distance: Math.hypot(enemy.x - player.x, enemy.z - player.z), angle: Math.atan2(enemy.x - player.x, -(enemy.z - player.z)) }));
  if (!visible.some(target => target.distance < range && Math.abs(delta(target.angle)) < .085)) return false;
  // Triggering automatic fire and choosing assisted aim are different decisions.
  // Use the simulation's weapon metadata, including the shotgun's farther
  // assist pool and the arc caster's strictly limited reach.
  const assisted = aimAssist ? visible.filter(target => target.distance < weapon.aimAssistRange && Math.abs(delta(target.angle)) < .12)
    .sort((a, b) => Math.abs(delta(a.angle)) - Math.abs(delta(b.angle))) : [];
  const aim = assisted?.[0]?.angle ?? player.angle;
  // A creature behind a neutral sentry is not a safe automatic shot. Include
  // the scattergun's entire spread; deliberate manual fire remains available.
  return !enemies.some(enemy => {
    if (!enemy.alive || enemy.health <= 0 || hostileToPlayer(enemy)) return false;
    const dx = enemy.x - player.x, dz = enemy.z - player.z;
    const along = dx * Math.sin(aim) - dz * Math.cos(aim);
    const across = Math.abs(dx * Math.cos(aim) + dz * Math.sin(aim));
    const spread = weapon.pellets > 1 ? Math.tan(.09) * along : 0;
    const radius = enemy.type === 'brute' ? .44 : .32;
    return along > 0 && along < weapon.range
      && across < radius + spread && hasLineOfSight(player.x, player.z, enemy.x, enemy.z);
  });
}
