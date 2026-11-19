/** Empty personal shots use the same floor plan and recharge as aimed combat. */
import { ensureSidearm, getPersonalWeapon, sidearmAim } from './combat.mjs';
import { generateSurface, isWalkable } from './surface.mjs';

const layouts = new WeakMap();
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/** Build once per physical map; NPC movement does not rebuild its wall tracing. */
export function personalFireLayout(surface) {
  if (!surface) return null;
  if (surface.combatLayout) return surface.combatLayout;
  if (layouts.has(surface)) return layouts.get(surface);
  const tile = surface.tileSize || 24, walkable = [];
  for (let y = 0; y < surface.rows; y++) for (let x = 0; x < surface.cols; x++) {
    walkable.push(isWalkable(surface, (x + .5) * tile, (y + .5) * tile, 1) ? 1 : 0);
  }
  const layout = { tile, tileSize: tile, cols: surface.cols, rows: surface.rows,
    width: surface.width, height: surface.height, walkable };
  layouts.set(surface, layout);
  return layout;
}

/** Older crew watches operate a ship gun directly at its security console. */
export function personalFireUsesShipStation(game, surface) {
  const state = game?.state || {}, contract = state.npcContract, incident = contract?.assignment?.complication;
  if (state.boarding?.phase === 'active' || state.exploration) return false;
  if (state.stationView === 'gunnery') return true;
  const sharedGunner = state.multiplayer?.crewRole === 'weapons' && state.multiplayer?.weaponsAllowed !== false;
  const contractGunner = contract?.active && !contract.military &&
    (contract.version === 2 ? incident?.type === 'attack' && incident.started && !incident.resolved : contract.roleId === 'gunner' && contract.phase === 'working');
  if (!sharedGunner && !contractGunner) return false;
  return !!surface?.entities?.some(entity => !entity.hidden && ['security', 'weapons'].includes(entity.data?.stationRole) &&
    Math.hypot(entity.x - state.person.x, entity.y - state.person.y) <= 46);
}

export const PersonalFireRules = {
  /** Exploration, boarding and ship stations retain their existing damage authority. */
  stepPersonalFreeFire(dt, input = {}, suppliedSurface = null) {
    const state = this.state, person = state.person;
    this._personalFireCooldown = Math.max(0, finite(this._personalFireCooldown) - Math.max(0, finite(dt)));
    if (state.mode !== 'person' || state.exploration || state.boarding?.phase === 'active' ||
      person.health <= 0 || person.down || this.medicalRecoveryActive?.() || this.militaryRecoveryStatus?.()?.detained ||
      state.stationView === 'gunnery') return null;
    const location = this.currentBody;
    if (!location) return null;
    let surface = suppliedSurface || this._surfaceForInteraction?.();
    if (!surface || surface.id !== location.id || surface.systemId && surface.systemId !== state.systemId) {
      const key = `${state.systemId}:${location.id}:${location.shipClass || location.classId || ''}`;
      if (this._personalFireSurface?.key !== key) this._personalFireSurface = { key, value: generateSurface(location, state.seed, state.flags) };
      surface = this._personalFireSurface.value;
    }
    if (personalFireUsesShipStation(this, surface)) return null;
    const layout = personalFireLayout(surface);
    if (!layout || !isWalkable(surface, person.x, person.y, 1)) return null;
    ensureSidearm(person);
    const aim = sidearmAim(person, [], input, layout);
    Object.assign(person, { weaponDrawn: true, aimAngle: aim.angle, aimTargetId: null, aimManual: aim.manual });
    if (!input.fire || this._personalFireCooldown > 0 || person.lastShot?.boardingId && person.weaponReadyAt > state.stats.time) return null;
    const weapon = getPersonalWeapon(person), cooldown = weapon.cooldown * (this.characterEffects?.sidearmCooldown || 1);
    const at = state.stats.time, serial = (state.stats.personShots || 0) + 1;
    const shot = { id: `${surface.id}:${this.playerId}:free-shot:${at}:${serial}`, siteId: surface.id, at,
      team: 'player', attackerId: this.playerId, actorName: this._playerName || state.captainName || 'Captain',
      weaponId: weapon.id, angle: aim.angle, from: { ...aim.from }, to: { ...aim.to },
      x: aim.from.x, y: aim.from.y, targetX: aim.to.x, targetY: aim.to.y,
      targetId: null, targetName: null, hit: false, damage: 0, blocked: !!aim.blocked, until: at + weapon.shotDuration };
    this._personalFireCooldown = cooldown;
    Object.assign(person, { weaponReadyAt: at + cooldown, attackUntil: shot.until, lastShot: shot });
    state.stats.personShots = serial;
    this._event('person-shot', shot);
    return shot;
  }
};
