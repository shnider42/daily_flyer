import { isSquadCommander, roleProfile } from './squad-roles.mjs';

// Plain-language help uses only the current objective and the player's known state.
// It never reads future stages, hidden enemies, or changes simulation behavior.
const LEVELS = new Set(['simple', 'moderate', 'expert']);
const levelOf = value => LEVELS.has(value) ? value : 'simple';
const finitePoint = value => !!value && Number.isFinite(value.x) && Number.isFinite(value.y);
const standing = player => !!player && player.alive && !player.downed;
const cleanText = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const controlName = (bind, action, fallback) => {
  const label = typeof bind === 'function' ? cleanText(bind(action)) : '';
  return label && label !== 'Unbound' ? label : fallback;
};
const holdControl = (bind, touch) => touch ? 'Hold Assist' : `Hold ${controlName(bind, 'interact', 'the Assist control')}`;

export function guidanceDescription(level) {
  if (levelOf(level) === 'simple') return 'Larger text, plain explanations, and a short hands-on introduction. Learn one thing at a time. Combat difficulty is a separate setting.';
  if (level === 'moderate') return 'Readable labels and short tips when you need them. Replay the introduction whenever you want. Combat difficulty is a separate setting.';
  return 'Compact labels and essential alerts. Open the controls or help when needed. Combat difficulty is a separate setting.';
}

export const FIELD_EXPLANATIONS = Object.freeze([
  { term: 'Objective', meaning: 'Your current task. The amber marker shows where to go.' },
  { term: 'Ping', meaning: 'A temporary marker that says “look here.” It does not send the squad anywhere.' },
  { term: 'Move order', meaning: 'Sends computer-controlled squadmates to a location. Only the squad leader can give it.' },
  { term: 'Regroup', meaning: 'As leader, bring the squad back to you. They follow until you give another order.' },
  { term: 'Cover', meaning: 'Solid walls and vehicles can block bullets. Open doors and gaps leave you exposed.' },
  { term: 'Suppression', meaning: 'Nearby gunfire makes aim less steady and slows movement. Get behind cover and give it time to settle.' },
  { term: 'Ammo / reserve', meaning: 'Ammo is loaded in your weapon. Reserve is the ammunition available for your next reloads.' },
  { term: 'Downed', meaning: 'Badly wounded and unable to fight. A squadmate must reach them and help before they die.' },
  { term: 'Smoke', meaning: 'Hides movement by blocking sight. It does not stop bullets.' },
  { term: 'Frag / flash', meaning: 'A frag can injure anyone nearby. A flash briefly blinds nearby people who can see it, including your squad.' },
  { term: 'Radio choice', meaning: 'A decision during the mission. Members can recommend an answer; the leader makes the final choice.' },
].map(Object.freeze));

/** Explain only the current task. Existing detail carries its exact progress/status. */
export function explainObjective(objective, { guidance = 'simple', bind, role = 'leader', touch = false } = {}) {
  if (!objective) return 'Your next task will appear here.';
  const level = levelOf(guidance), hold = holdControl(bind, touch);
  if (level === 'expert') return cleanText(objective.detail || objective.description);
  const moderate = level === 'moderate';
  if (objective.kind === 'deliver' && objective.actionTarget?.recovery) return moderate
    ? `Recover the dropped item at the amber marker. ${hold} nearby to pick it up.`
    : `The item was dropped. Go to the amber marker and ${hold.replace(/^Hold /, 'hold ')} to pick it up. The marker then shows where to deliver it.`;
  const explanations = {
    rally: moderate ? 'Bring the squad into the amber area.' : 'Move to the amber area and bring the squad with you. The task finishes when enough of you arrive.',
    hold: moderate ? 'Keep the squad in the amber area while the timer runs.' : 'Stay near the amber marker with your squad while the timer runs. Nearby walls can protect you from gunfire.',
    recon: moderate ? `Face the marked approach. ${hold} until observation is complete.` : `Look toward the marked approach where you have a clear view. ${hold} until the progress bar fills. Grenadier binoculars and sniper scopes can also observe.`,
    rescue: moderate ? `Reach the wounded person. ${hold} until treatment finishes.` : `Move close to the wounded person. ${hold} until treatment finishes, then keep them close while you move.`,
    interact: moderate ? `Reach the marker. ${hold} to ${cleanText(objective.interactionLabel)?.toLowerCase() || 'work'}.` : `Go to the amber marker. ${hold} when you are close, and keep holding until the progress bar fills. Use a doorway to enter a house.`,
    deliver: moderate ? `Bring the carrier to the marker. ${hold} nearby to hand the item over.` : `Bring the soldier carrying the item to the amber marker. ${hold} nearby to hand it over. If your co-op partner carries it, they must do this.`,
    convoy: moderate ? 'Stay close to the lead vehicle. The convoy waits for the squad.' : 'Move with the lead vehicle and keep the squad nearby. The vehicles wait when the squad or the people you are escorting fall behind.',
    barricade: moderate ? `Stand beside the obstruction. ${hold} to clear it.` : `Move beside the barrier blocking the vehicles. ${hold} until it is cleared. Keep the other soldiers nearby to protect the person working.`,
    repair: moderate ? `Stand beside the stalled carrier. ${hold} to restart it.` : `Move beside the vehicle that has stopped. ${hold} until it starts again. Keep the squad nearby while you work.`,
    escort: moderate ? 'Bring every living squadmate and escorted person into the amber area.' : 'Lead the people you are protecting to the amber area. Wait for every living squadmate and escorted person to arrive. Help anyone who is down.',
    extract: moderate ? 'Reach the amber area together. Help anyone who is down.' : 'This is the place to leave the area. Bring every living squadmate and escorted person inside the amber area. Help anyone who is down before leaving.',
  };
  let explanation = explanations[objective.kind] || cleanText(objective.description) || 'Move toward the amber marker and follow the current task.';
  if (role === 'member' && level === 'simple' && ['rally', 'convoy', 'escort', 'extract'].includes(objective.kind)) explanation += ' Stay near Hale while he leads.';
  return explanation;
}

const context = (id, title, body, tone = 'info') => ({ id, title, body, tone });

/** One relevant tip at a time. Urgent player state wins over routine teaching. */
export function contextualGuidance({ game, player, assist, objective, guidance = 'simple', bind, observing = false, inside = false, touch = false } = {}) {
  const level = levelOf(guidance);
  if (!game || !player || level === 'expert' || game.status !== 'playing') return null;
  const simple = level === 'simple';
  const hold = holdControl(bind, touch);
  // Disconnected partners keep their soldier reserved while they reconnect.
  const claimed = new Set(game.coop ? (game.multiplayer?.players || []).filter(peer => peer.id !== game.multiplayer?.selfId).map(peer => peer.actorId) : []);
  const switchable = game.squad?.some(soldier => soldier.id !== player.id && standing(soldier) && !claimed.has(soldier.id));
  if (!player.alive || player.downed) return context('downed', player.alive ? 'You need help' : 'This soldier is lost', switchable ? `Click ${game.coop ? 'a free' : 'another'} standing soldier’s card to take control. Your squad can help a wounded soldier.` : player.alive ? 'You cannot move or fire. Your squad must reach you to help.' : 'Your partner can continue the mission.', 'danger');
  const flash = Number.isFinite(player.flashUntil) && player.flashUntil > game.time;
  if (flash) return context('flash', 'Vision is recovering', simple ? 'A flashbang temporarily affected your sight and hearing. Wait for it to clear; it did not directly damage your health.' : 'Sight and hearing recover as the flash wears off.', 'warning');
  if (assist && /revive|rescue/i.test(assist.label || '')) return context('casualty', 'Someone needs help', `${hold} to ${cleanText(assist.detail).replace(/^Hold to /i, '').replace(/[.]$/, '') || 'help the wounded person'}.`, 'warning');
  if (player.hp / Math.max(1, player.maxHp) < .35) return context('health', 'Health is low', simple ? `Get behind solid cover. ${player.medkits > 0 ? `${hold} when the bandage prompt appears to treat yourself.` : 'You have no medical supplies left. Keep the squad close.'}` : `Find cover.${player.medkits > 0 ? ` ${hold} to bandage when prompted.` : ' No medical supplies left.'}`, 'danger');
  if (player.reloadTimer > 0) return context('reload', 'Reloading', simple ? 'Your weapon is being reloaded. You cannot fire until it is ready, so stay behind cover.' : 'Stay behind cover until the weapon is ready.');
  if (player.ammo === 0 && player.reserve > 0) return context('empty', 'Weapon empty', `${controlName(bind, 'reload', 'Reload')} reloads using your reserve ammunition.`, 'warning');
  if (player.ammo === 0 && player.reserve === 0) return context('no-ammo', 'No ammunition left', simple ? 'This soldier has no ammunition to reload. Stay with the squad and let others cover you.' : 'No reserve ammunition. Stay with the squad.', 'warning');
  if (player.suppression > .6) return context('suppression', 'Gunfire is affecting your aim', simple ? 'Nearby shots make your aim less steady and slow your movement. Move behind a solid wall or vehicle and let it settle.' : 'Take cover until your aim settles.', 'warning');
  if (assist) return context('assist', assist.label || 'You can help here', `${hold} to ${cleanText(assist.detail).replace(/^Hold to /i, '').replace(/[.]$/, '') || 'work here'}.`);
  if (observing && roleProfile(player).observationMode === 'scope') return context('observe', 'Using the scope', `Aim and fire through the scope. Stay still for accuracy. ${controlName(bind, 'observe', 'Scope')} lowers it to move normally.`);
  if (observing) return context('observe', 'Using binoculars', simple ? `Move the mouse to look around. ${controlName(bind, 'observe', 'Binoculars')} lowers them so you can fight and move normally.` : `${controlName(bind, 'observe', 'Binoculars')} lowers them to fight and move normally.`);
  if (game.story?.activeDecision) return context('radio', 'A radio decision is waiting', simple ? `${controlName(bind, 'radio', 'Radio')} opens the message and your replies. The mission keeps moving while you read. ${game.role === 'member' ? 'You recommend; the leader decides.' : 'Choose the reply that fits your plan.'}` : `${controlName(bind, 'radio', 'Radio')} opens your replies. The mission keeps moving.`);
  if (simple && inside) return context('cover', 'Inside a building', 'Walls block sight and bullets. Open doorways leave you exposed. The roof lifts so you can see your soldier.');
  // Routine mission teaching stays in the objective panel. Moderate avoids a
  // permanent second copy; Simple receives a short reminder only when necessary.
  if (simple && objective?.interaction) return context('objective', 'Work at the marker', `Move close to the amber marker, then ${hold.replace(/^Hold /, 'hold ')} when the action prompt appears.`);
  return null;
}

const STEP_IDS = Object.freeze(['move', 'aim', 'ping', 'map', 'squad', 'objective']);
const STATUSES = new Set(['new', 'active', 'dismissed', 'complete']);

export function normalizeTutorialProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return { version: 1, status: 'new', step: 0 };
  const status = STATUSES.has(value.status) ? value.status : 'new';
  const step = Number.isInteger(value.step) && value.step >= 0 && value.step < STEP_IDS.length ? value.step : 0;
  return { version: 1, status, step: status === 'complete' ? STEP_IDS.length - 1 : step };
}

/** First-run coaching tracks actions, never a clock or a key that failed to act. */
export class GuidanceSession {
  constructor(saved) {
    this.progress = normalizeTutorialProgress(saved);
    this.role = 'leader'; this.touch = false;
    this._resetEvidence();
  }
  get active() { return this.progress.status === 'active'; }
  get status() { return this.progress.status; }
  get step() { return STEP_IDS[this.progress.step]; }
  snapshot() { return { ...this.progress }; }
  _resetEvidence() { this._position = null; this._pointer = null; this._distance = 0; this._mapOpened = false; }
  start({ role = 'leader', touch = false, replay = false } = {}) {
    if (replay) return this.replay({ role, touch });
    this.role = role === 'member' ? 'member' : 'leader'; this.touch = touch === true;
    this._resetEvidence();
    if (['complete', 'dismissed'].includes(this.status)) return false;
    this.progress.status = 'active'; return true;
  }
  replay({ role = this.role, touch = this.touch } = {}) {
    this.progress = { version: 1, status: 'active', step: 0 };
    this.role = role === 'member' ? 'member' : 'leader'; this.touch = touch === true;
    this._resetEvidence(); return true;
  }
  _advance() {
    if (!this.active || this.progress.step >= STEP_IDS.length - 1) return false;
    this.progress.step++; this._resetEvidence(); return true;
  }
  skip() { return this._advance(); }
  back() {
    if (!this.active || this.progress.step === 0) return false;
    this.progress.step--; this._resetEvidence(); return true;
  }
  dismiss() {
    if (!this.active) return false;
    this.progress.status = 'dismissed'; this._resetEvidence(); return true;
  }
  complete() {
    if (!this.active || this.step !== 'objective') return false;
    this.progress.status = 'complete'; this._resetEvidence(); return true;
  }
  observe({ player, showMap = false, canAct = true } = {}) {
    if (!this.active) return false;
    // Solo soldier switching and co-op role swaps can happen mid-introduction.
    if (typeof player?.role === 'string') this.role = isSquadCommander(player) ? 'leader' : 'member';
    if (this.step === 'map' && standing(player)) {
      if (showMap) this._mapOpened = true;
      else if (this._mapOpened && canAct) return this._advance();
    }
    if (this.step !== 'move' || !standing(player) || !finitePoint(player) || !canAct || showMap) { this._position = null; return false; }
    const previous = this._position;
    this._position = { id: player.id, x: player.x, y: player.y };
    if (!previous || previous.id !== player.id) { this._distance = 0; return false; }
    const distance = Math.hypot(player.x - previous.x, player.y - previous.y);
    // Resets/reconnect corrections and soldier switches are not movement practice.
    if (distance > 160) { this._distance = 0; return false; }
    this._distance += distance;
    return this._distance >= 48 ? this._advance() : false;
  }
  record(action, evidence = {}) {
    if (!this.active) return false;
    if (action === 'aim' && this.step === 'aim') {
      if (!finitePoint(evidence) || evidence.canAct !== true) { this._pointer = null; return false; }
      const previous = this._pointer; this._pointer = { x: evidence.x, y: evidence.y };
      if (!previous) return false;
      this._distance += Math.hypot(evidence.x - previous.x, evidence.y - previous.y);
      return this._distance >= 45 ? this._advance() : false;
    }
    if (action === 'ping' && this.step === 'ping' && evidence.accepted === true) return this._advance();
    if (action === 'order' && this.step === 'squad' && evidence.accepted === true && evidence.order === (this.role === 'leader' ? 'follow' : 'ready')) return this._advance();
    return false;
  }
  view({ bind, objective, guidance = 'simple' } = {}) {
    if (!this.active) return null;
    const key = (action, fallback) => controlName(bind, action, fallback);
    const movement = ['moveUp', 'moveLeft', 'moveDown', 'moveRight'].map(action => key(action, 'movement control')).join(' · ');
    const instructions = {
      move: { title: 'Start with your soldier', body: 'The highlighted soldier is you. Your squad stays nearby and fights alongside you.', task: this.touch ? 'Drag the left thumbstick to move a short distance.' : `Move a short distance with ${movement}.`, focus: 'squad' },
      aim: { title: 'Look before you shoot', body: 'Move the mouse to aim. The aim line stops at solid walls so you can see what blocks your shot.', task: this.touch ? 'Drag the aim stick lightly to turn without firing.' : `Move your pointer around the ground. Hold ${key('fire', 'Fire')} when you need to shoot. No shot is needed for this step.`, focus: 'world' },
      ping: { title: 'Point something out', body: 'A ping leaves a temporary “look here” marker. Your squad keeps its current orders.', task: `Point at the ground and use ${key('ping', 'Ping')} to place a ping.`, focus: 'world' },
      map: { title: 'Find your bearings', body: 'Amber marks your current task. Your ping is a separate marker. The mission keeps moving while the map is open.', task: `Use ${key('map', 'Map')} to open the map, then close it again.`, focus: 'mapToggle' },
      squad: { title: this.role === 'leader' ? 'Bring the squad with you' : 'Work with your leader', body: this.role === 'leader' ? `A move order sends the squad to a location. A ping only points. ${key('hold', 'Hold')} makes the squad stay where it is.` : 'Hale leads the squad while you control another soldier. You can still ping places for your partner.', task: this.role === 'leader' ? `Use ${key('regroup', 'Regroup')} to regroup. The squad will follow you.` : `Use ${key('regroup', 'Ready')} to tell the leader you are ready to move.`, focus: 'orders' },
      objective: { title: 'Follow the current task', body: explainObjective(objective, { guidance, bind, role: this.role, touch: this.touch }), task: 'Read the task in the upper left. Health and ammunition are shown below. You can replay this introduction from Settings.', focus: 'objective' },
    };
    return { id: this.step, index: this.progress.step + 1, total: STEP_IDS.length, ...instructions[this.step], canBack: this.progress.step > 0, final: this.step === 'objective' };
  }
}
