// Authoritative private-room simulation. Rendering snapshots are deliberately
// separate from Game's browser-local save format and are never accepted as input.
import { updateTraversal } from './shadow.mjs';
import { Game, WEAPONS } from './core.mjs';
import { updateTomorrowSociety } from './tomorrow-society.mjs';
import { updateTomorrowPlayerTraversal, updateTomorrowHazards, restoreTomorrowHazards } from './tomorrow-hazards.mjs';

const TAU = Math.PI * 2;
const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const axis = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
const PERSONAL_EVENTS = new Set(['shot', 'hit', 'kill', 'hurt', 'pickup', 'death', 'downed', 'revive']);
export const COOP_PLAYER_IDS = Object.freeze(['p1', 'p2', 'p3', 'p4']);
export const FRIENDLY_FIRE_SCALE = .5;

export class CoopGame extends Game {
  constructor(options = {}) {
    const players = options.players ?? ['p1', 'p2'];
    if (!Array.isArray(players) || players.length < 1 || players.length > 4 || new Set(players).size !== players.length || players.some(id => !COOP_PLAYER_IDS.includes(id))) {
      throw new TypeError('Co-op players must be one to four distinct p1–p4 IDs.');
    }
    super({ mission: 'crosslink-11', ...options, players: [...players] });
  }

  _reset() {
    super._reset();
    this._playerIds = [...this.options.players];
    // Extra operators increase the expedition's health budget, not its attack
    // speed. Warning windows and combat difficulty remain independently tuned.
    this.state.partyScale = this.level.tomorrow ? 1 + .30 * (this._playerIds.length - 1) : 1;
    if (this.state.partyScale !== 1) for (const enemy of this.state.enemies) {
      enemy.health = Math.round(enemy.health * this.state.partyScale);
      enemy.maxHealth = Math.round(enemy.maxHealth * this.state.partyScale);
    }
    this._activePlayerId = null;
    this._playerRuntime = Object.create(null);
    this._distanceFields = new Map();
    const template = this.state.player;
    this.state.players = {};
    const variants = this.level.coopSpawnVariants;
    const variantIndex = Array.isArray(variants) && variants.length ? this._runSeed % variants.length : -1;
    const spawns = variantIndex >= 0 ? variants[variantIndex] : this.level.coopSpawns;
    for (const [index, id] of this._playerIds.entries()) {
      const anchor = spawns?.[index] || this.level.spawn;
      const occupied = Object.values(this.state.players);
      const spawn = this._clearCircle(anchor.x, anchor.z, .22) && occupied.every(p => distance(anchor, p) >= .7)
        ? anchor : this._spawnNear(anchor, occupied);
      this.state.players[id] = {
        ...copy(template), ...spawn, id, alive: true, moving: false,
        hasShotgun: !this.level.shadow && !this.level.tomorrow, ammo: { pistol: 40, shells: this.level.shadow || this.level.tomorrow ? 0 : 8, cells: 0, slugs: 0, grenades: 0 },
        tutorial: { moved: false, fired: false, interacted: false, weaponSwitched: false },
      };
      this._playerRuntime[id] = { shotCooldown: 0, reserveTimer: 0, messageCooldown: 0, friendlyWarningAt: -10, aimAssist: this.options.aimAssist !== false, spawn: copy(spawn) };
    }
    this.state.mode = 'coop';
    this.state.levelId = this.level.id;
    this.state.missionId = this.level.missionId;
    this.state.tick = 0;
    this.state.friendlyFire = typeof this.options.friendlyFire === 'boolean' ? this.options.friendlyFire : this.level.friendlyFire === true;
    this.state.friendlyHits = 0;
    this.state.spawnVariant = variantIndex;
    this._restoreAliases();
  }

  start() {
    const arriving = this.state.status === 'ready';
    super.start();
    if (!arriving) return;
    if (this.state.friendlyFire) this._events.push({ type: 'message', text: 'Friendly fire is live. Operator numbers identify your team; keep firing lanes clear.' });
    if (this.state.spawnVariant >= 0) {
      const players = Object.values(this.state.players);
      const split = players.some(p => distance(p, players[0]) > 12);
      this._events.push({ type: 'message', text: split ? 'Arrival scattered the team. Follow your operator markers to the common hall; each starting route is open.' : 'You arrived together. Other arrivals may scatter the team across different entrances.' });
    }
    if (this.level.tomorrow) for (const id of this._playerIds) {
      this._events.push({ type: 'message', playerId: id, arrival: true,
        text: `${id.toUpperCase()} · ${this.getZone(id)}. Follow signs to the exchange. Friendly fire is ${this.state.friendlyFire ? 'on' : 'off'}.` });
    }
  }

  _weaponTargets() {
    const enemies = super._weaponTargets();
    if (!this.state.friendlyFire) return enemies;
    // Allies are physical shot targets, but never enter the enemy list or
    // automatic aiming/threat selection. Downed bodies do not block a shot.
    return [...enemies, ...Object.values(this.state.players).filter(p => p !== this.state.player && p.alive && !p.jump)];
  }

  _damageWeaponTarget(target, amount, weapon, source = 'player', impact = null) {
    if (target?.id && this.state.players[target.id] === target) {
      const sourceId = source?.playerId || this.state.player.id;
      this._friendlyDamage(target, amount, sourceId, impact || this.state.players[sourceId], weapon);
      return;
    }
    return super._damageWeaponTarget(target, amount, weapon, source, impact);
  }

  _friendlyDamage(target, amount, sourceId, origin, weapon) {
    if (!this.state.friendlyFire || !target?.alive || target.id === sourceId || !this.state.players[sourceId] || !(amount > 0)) return;
    this._hurtTarget(target, amount * FRIENDLY_FIRE_SCALE, { x: origin.x, z: origin.z, friendlyFire: true, playerId: sourceId });
    this.state.friendlyHits++;
    this._events.push({ type: 'friendly-fire', playerId: sourceId, sourceId, targetId: target.id, weapon, x: target.x, z: target.z });
    const runtime = this._playerRuntime[sourceId];
    if (runtime && this.state.time - runtime.friendlyWarningAt >= 1.2) {
      runtime.friendlyWarningAt = this.state.time;
      this._events.push({ type: 'message', playerId: sourceId, text: `Friendly fire — operator ${target.id.slice(1)} is in your firing lane.` });
    }
  }

  _explodeGrenade(shot) {
    super._explodeGrenade(shot);
    if (!this.state.friendlyFire) return;
    const spec = WEAPONS.grenade;
    for (const target of Object.values(this.state.players)) {
      const d = distance(shot, target);
      if (target.id === shot.ownerId || !target.alive || target.jump || d >= spec.blastRadius || !this.hasLineOfSight(shot.x, shot.z, target.x, target.z)) continue;
      this._friendlyDamage(target, spec.damage * (1 - .7 * d / spec.blastRadius), shot.ownerId, shot, 'grenade');
    }
  }

  _restoreAliases() {
    this.state.player = this.state.players[this._playerIds[0]];
    this.state.tutorial = this.state.player.tutorial;
    this._activePlayerId = null;
  }

  _player(id) { return Object.hasOwn(this.state.players, id) ? this.state.players[id] : null; }

  _withPlayer(id, action) {
    const player = this._player(id);
    if (!player) return undefined;
    const runtime = this._playerRuntime[id];
    const previous = {
      player: this.state.player, tutorial: this.state.tutorial, id: this._activePlayerId,
      shotCooldown: this._shotCooldown, reserveTimer: this._reserveTimer,
      messageCooldown: this._messageCooldown, aimAssist: this.options.aimAssist,
    };
    this.state.player = player; this.state.tutorial = player.tutorial; this._activePlayerId = id;
    this._shotCooldown = runtime.shotCooldown; this._reserveTimer = runtime.reserveTimer;
    this._messageCooldown = runtime.messageCooldown; this.options.aimAssist = runtime.aimAssist;
    const firstEvent = this._events.length;
    try { return action(player, runtime); }
    finally {
      runtime.shotCooldown = this._shotCooldown; runtime.reserveTimer = this._reserveTimer;
      runtime.messageCooldown = this._messageCooldown;
      for (let i = firstEvent; i < this._events.length; i++) {
        const event = this._events[i];
        if (PERSONAL_EVENTS.has(event.type) && !event.playerId) event.playerId = id;
      }
      this.state.player = previous.player; this.state.tutorial = previous.tutorial; this._activePlayerId = previous.id;
      this._shotCooldown = previous.shotCooldown; this._reserveTimer = previous.reserveTimer;
      this._messageCooldown = previous.messageCooldown; this.options.aimAssist = previous.aimAssist;
    }
  }

  update(dt, inputsByPlayerId = {}) {
    if (this.state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1);
    const inputs = inputsByPlayerId && typeof inputsByPlayerId === 'object' ? inputsByPlayerId : {};
    this.state.time += dt; this.state.tick++;
    this._pathTimer -= dt;
    for (const id of this._playerIds) {
      const player = this._player(id);
      if (!player.alive) { player.moving = false; continue; }
      const provided = Object.hasOwn(inputs, id) ? inputs[id] : null;
      const input = provided && typeof provided === 'object' ? provided : {};
      if (typeof input.aimAssist === 'boolean') this._playerRuntime[id].aimAssist = input.aimAssist;
      this._withPlayer(id, (p, runtime) => {
        this._shotCooldown = Math.max(0, this._shotCooldown - dt);
        this._messageCooldown = Math.max(0, this._messageCooldown - dt);
        if (Number.isFinite(input.angle)) p.angle = ((input.angle % TAU) + TAU) % TAU;
        const forward = axis(input.forward), strafe = axis(input.strafe);
        const speed = 3.35 * dt / Math.max(1, Math.hypot(forward, strafe));
        const beforeX = p.x, beforeZ = p.z;
        if(!updateTomorrowPlayerTraversal(this,dt)&&!updateTraversal(this,dt))this._move(p, (Math.sin(p.angle) * forward + Math.cos(p.angle) * strafe) * speed,
          (-Math.cos(p.angle) * forward + Math.sin(p.angle) * strafe) * speed);
        if(!p.jump){updateTomorrowPlayerTraversal(this,0);updateTraversal(this,0);}
        p.moving = Math.hypot(p.x - beforeX, p.z - beforeZ) > .0001;
        if (distance(p, runtime.spawn) > .75) p.tutorial.moved = true;
        this._collectPickups();
        if (input.fire === true) {
          const firstEvent = this._events.length;
          super._fire();
          for (const event of this._events.slice(firstEvent)) if (event.type === 'message') event.playerId = id;
        }
        if (p.ammo.pistol === 0) {
          this._reserveTimer += dt;
          if (this._reserveTimer >= 1.7) {
            p.ammo.pistol = 1; this._reserveTimer = 0;
            this._events.push({ type: 'message', playerId: id, text: 'Emergency cell: one pistol round recovered.' });
          }
        } else this._reserveTimer = 0;
      });
    }
    // Players consume independent inputs above; the shared world advances once.
    if (this._pathTimer <= 0) { this._buildTeamDistanceFields(); this._pathTimer = .5; }
    updateTomorrowHazards(this,dt);
    updateTomorrowSociety(this,dt);
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    for (const effect of this.state.effects) effect.life -= dt;
    this.state.effects = this.state.effects.filter(effect => effect.life > 0);
  }

  _collectPickups() {
    const before = new Set(this.state.pickups.filter(item => item.collected).map(item => item.id));
    super._collectPickups();
    // A rack equips the team once. Loose ammunition, armor and health retain
    // the existing collector-only rule, so teammates can allocate supplies.
    for (const item of this.state.pickups) {
      const weapon = WEAPONS[item.type];
      if (!item.collected || before.has(item.id) || !weapon?.ownershipKey) continue;
      for (const player of Object.values(this.state.players)) {
        if (player === this.state.player) continue;
        player[weapon.ownershipKey] = true;
        player.ammo[weapon.ammoKey] = (player.ammo[weapon.ammoKey] || 0) + item.amount;
        this._events.push({ type: 'pickup', playerId: player.id, item: item.type, text: `${weapon.name} added to the team racks.` });
      }
    }
    if (this.state.player.key) for (const player of Object.values(this.state.players)) player.key = true;
  }

  _buildTeamDistanceFields() {
    this._distanceFields.clear();
    for (const id of this._playerIds) {
      if (!this._player(id).alive) continue;
      this._withPlayer(id, () => {
        super._buildDistanceField();
        this._distanceFields.set(id, this._distances);
      });
    }
    this._distances = null;
  }

  _updateEnemies(dt) {
    for (const enemy of this.state.enemies) {
      if (!enemy.alive) { enemy.hitTimer = Math.max(0, enemy.hitTimer - dt); enemy.targetId = null; continue; }
      const candidates = this._playerIds.map(id => {
        const player = this._player(id);
        const d = distance(enemy, player);
        const visible = player.alive && (!this.level.exploration || d <= this.level.enemyAwarenessDistance) && this.hasLineOfSight(enemy.x, enemy.z, player.x, player.z);
        const route = this._distanceFields.get(id)?.[Math.floor(enemy.z) * this.level.width + Math.floor(enemy.x)] ?? -1;
        return { id, player, visible, route, distance: d };
      }).filter(candidate => candidate.player.alive);
      // A visible operative takes priority; otherwise pursue the shortest
      // reachable route. An unreachable player never lures enemies into walls.
      candidates.sort((a, b) => Number(b.visible) - Number(a.visible)
        || (a.visible ? a.distance - b.distance : (a.route < 0 ? Infinity : a.route) - (b.route < 0 ? Infinity : b.route))
        || a.distance - b.distance);
      const target = candidates[0];
      if (!target) break;
      enemy.targetId = enemy.alive ? target.id : null;
      this._distances = this._distanceFields.get(target.id) || null;
      this._withPlayer(target.id, () => super._updateEnemy(enemy, dt));
    }
    this._distances = null;
  }

  _updateProjectiles(dt) {
    super._updateProjectiles(dt);
  }

  _hurt(amount, source) {
    const p = this.state.player;
    if (this.state.status !== 'playing' || !p.alive) return;
    const damage = Math.max(1, Math.round(amount * (source.friendlyFire ? 1 : this._difficulty.damage)));
    const absorbed = Math.min(p.armor, Math.ceil(damage * .55));
    p.armor -= absorbed; p.health = Math.max(0, p.health - (damage - absorbed));
    this._events.push({ type: 'hurt', playerId: p.id, damage, x: source.x, z: source.z,
      ...(source.friendlyFire ? { friendlyFire: true, sourceId: source.playerId } : {}) });
    if (p.health > 0) return;
    p.alive = false; p.moving = false; this._pathTimer = 0;
    this._events.push({ type: 'downed', playerId: p.id, text: 'Downed. A teammate can revive you at the next checkpoint.' });
    if (this._playerIds.every(id => !this._player(id).alive)) {
      this.state.status = 'dead';
      this._events.push({ type: 'message', text: this.state.checkpoint ? 'The whole team is down. Retry the team checkpoint.' : 'The whole team is down. Restart the mission.' });
    }
  }

  interact(playerId) {
    const player = this._player(playerId);
    if (!player?.alive || this.state.status !== 'playing') return false;
    return this._withPlayer(playerId, () => {
      const firstEvent = this._events.length;
      const result = super.interact();
      if (!result) for (const event of this._events.slice(firstEvent)) if (event.type === 'message') event.playerId = playerId;
      return result;
    });
  }

  switchWeapon(playerId, weaponId) {
    if (!this._player(playerId)?.alive || this.state.status !== 'playing') return false;
    return this._withPlayer(playerId, () => super.switchWeapon(weaponId)) === true;
  }

  getInteractionInfo(playerId = this._activePlayerId || this._playerIds[0]) {
    if (!this._player(playerId)?.alive) return null;
    return this._withPlayer(playerId, () => super.getInteractionInfo());
  }

  getPrompt(playerId = this._activePlayerId || this._playerIds[0]) { return this.getInteractionInfo(playerId)?.text || ''; }
  getObjective(playerId = this._activePlayerId || this._playerIds[0]) { return this._withPlayer(playerId, () => super.getObjective()); }
  getZone(playerId = this._activePlayerId || this._playerIds[0]) { return this._withPlayer(playerId, () => super.getZone()); }

  _spawnNear(anchor, occupied = []) {
    const start = [Math.floor(anchor.x), Math.floor(anchor.z)];
    const queue = [start], seen = new Set([start.join(',')]);
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i], point = { x: x + .5, z: z + .5, angle: anchor.angle || 0 };
      if (this._clearCircle(point.x, point.z, .22) && occupied.every(player => distance(point, player) >= .7)) return point;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        const key = `${nx},${nz}`;
        if (!seen.has(key) && !this._wall(nx + .5, nz + .5)) { seen.add(key); queue.push([nx, nz]); }
      }
    }
    return { x: anchor.x, z: anchor.z, angle: anchor.angle || 0 };
  }

  _saveCheckpoint(text) {
    const anchor = this.state.player;
    this.state.checkpoint = true;
    const occupied = Object.values(this.state.players).filter(player => player.alive);
    for (const id of this._playerIds) {
      const player = this._player(id);
      if (!player.alive) {
        Object.assign(player, this._spawnNear(anchor, occupied));
        player.alive = true; occupied.push(player);
        this._events.push({ type: 'revive', playerId: id, text: 'Revived at the team checkpoint.' });
      }
      player.health = this.level.exploration ? this._maxHealth(player) : Math.max(75, player.health);
      player.armor = Math.max(this.level.exploration ? 50 : 30, player.armor);
      player.ammo.pistol = Math.max(this.level.exploration ? 60 : 24, player.ammo.pistol);
      player.ammo.shells = Math.max(this.level.exploration ? 16 : 6, player.ammo.shells);
      player.ammo.cells = (player.hasArc||player.hasNull) ? Math.max(4, player.ammo.cells || 0) : player.ammo.cells || 0;
      player.ammo.slugs = (player.hasRicochet||player.hasLance) ? Math.max(8, player.ammo.slugs || 0) : player.ammo.slugs || 0;
      player.ammo.grenades = player.hasGrenade ? Math.max(2, player.ammo.grenades || 0) : player.ammo.grenades || 0;
      const runtime = this._playerRuntime[id];
      runtime.shotCooldown = 0; runtime.reserveTimer = 0; runtime.messageCooldown = 0;
    }
    this._shotCooldown = 0; this._reserveTimer = 0; this._messageCooldown = 0;
    this.state.projectiles = []; this.state.effects = []; this.state.shadowHazards = [];
    this._pathTimer = 0; this._distanceFields.clear();
    this._checkpoint = { levelId: this.level.id, state: this.networkSnapshot(), randomState: this._random, serial: this._serial, runtime: copy(this._playerRuntime) };
    this._events.push({ type: 'checkpoint', text: `${text} Team health and ammunition replenished.` });
  }

  restartCheckpoint() {
    if (!this._checkpoint || this._checkpoint.levelId !== this.level.id) return false;
    this.state = copy(this._checkpoint.state); this.state.status = 'playing';
    this._playerRuntime = copy(this._checkpoint.runtime);
    this._random = this._checkpoint.randomState; this._serial = this._checkpoint.serial;
    this._shotCooldown = 0; this._reserveTimer = 0; this._messageCooldown = 0;
    this._pathTimer = 0; this._distances = null; this._distanceFields = new Map();
    this._restoreAliases();
    restoreTomorrowHazards(this);
    this._events = [{ type: 'message', text: 'Team checkpoint restored. All operatives are ready.' }];
    return true;
  }

  networkSnapshot() {
    const { player, tutorial, ...shared } = this.state;
    return copy(shared);
  }

  // A room snapshot must never overwrite the independent solo save slot.
  serialize() { throw new Error('Co-op rooms use networkSnapshot(), not solo saves.'); }
  restore() { return false; }
}
