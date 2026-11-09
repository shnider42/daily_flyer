import { LEVELS, getLevel } from './levels.mjs';

export const VERSION = '0.1.1';
export const SAVE_KEY = 'low-water-progress-v1';
export const SETTINGS_KEY = 'low-water-settings-v1';
export const DEFAULT_SETTINGS = Object.freeze({
  guidance: 'moderate', controls: 'auto', stickSize: 88, buttonSize: 100, sensitivity: 1,
  verticalSensitivity: 1, invertY: false, leftHanded: false, fov: 76,
  brightness: 1.12, motion: false, sound: true, volume: .55,
  captions: true, graphics: 'auto'
});

export function freshState(chapter = 0) {
  const state = {
    version: 1, chapter: Math.min(4, Math.max(0, chapter)), unlocked: chapter,
    health: 100, stamina: 100, elapsed: 0, deaths: 0, completed: false,
    breakers: { crane: true, exit: false }, powerRouted: false,
    intakeClosed: false, bypassOpen: false, waterDrained: false,
    gantryPosition: 0, toolAccessible: false, bridgeAligned: false, tool: false,
    dampers: [1, 1, 1], coreStable: false, evacReady: false,
    notes: [], visited: [], flashlight: true, cooldown: 0, enemies: []
  };
  if (chapter > 0) { state.breakers = { crane: false, exit: true }; state.powerRouted = true; }
  if (chapter > 1) { state.intakeClosed = true; state.bypassOpen = true; state.waterDrained = true; }
  if (chapter > 2) { state.tool = true; state.toolAccessible = true; state.bridgeAligned = true; state.gantryPosition = 2; }
  if (chapter > 3) { state.dampers = [2, 1, 3]; state.coreStable = true; }
  enterLevel(state, chapter);
  return state;
}

export function enterLevel(state, chapter) {
  const level = getLevel(chapter);
  state.chapter = chapter;
  state.unlocked = Math.max(state.unlocked || 0, chapter);
  state.player = { ...level.spawn, pitch: 0, vy: 0 };
  state.health = Math.max(75, state.health);
  state.stamina = 100;
  state.cooldown = 0;
  state.enemies = (level.enemies || []).map(e => ({ ...e, originX: e.x, originZ: e.z, alive: true, stunned: 0, attackCooldown: 0, alert: 0, y: e.y || 0 }));
  return state;
}

export function serializable(state) {
  const copy = JSON.parse(JSON.stringify(state));
  copy.player.vy = 0;
  copy.enemies.forEach(e => { delete e.path; delete e.pathTime; });
  return copy;
}

export function restoreState(value) {
  if (!value || value.version !== 1 || !Number.isInteger(value.chapter) || value.chapter < 0 || value.chapter >= LEVELS.length) return null;
  const base = freshState(value.chapter);
  Object.assign(base, value);
  base.breakers = { crane: !!value.breakers?.crane, exit: !!value.breakers?.exit };
  base.dampers = Array.isArray(value.dampers) && value.dampers.length === 3 ? value.dampers.map(v => Math.min(3, Math.max(1, Number(v) || 1))) : [1, 1, 1];
  base.health = Math.min(100, Math.max(1, Number(base.health) || 100));
  base.stamina = 100;
  base.notes = Array.isArray(value.notes) ? value.notes.filter(v => typeof v === 'string') : [];
  base.visited = Array.isArray(value.visited) ? value.visited : [];
  base.unlocked = Math.max(base.chapter, Math.min(4, Number(base.unlocked) || 0));
  for (const k of ['x', 'z', 'y', 'yaw', 'pitch']) if (!Number.isFinite(base.player?.[k])) base.player = { ...getLevel(base.chapter).spawn, pitch: 0, vy: 0 };
  base.player.vy = 0;
  if (!Array.isArray(base.enemies)) base.enemies = [];
  return base;
}

export function interact(state, id) {
  const result = { changed: false, message: '', sound: 'switch', checkpoint: false };
  switch (id) {
    case 'crane-breaker':
      if (state.powerRouted) return { ...result, message: 'Freight supply is stable. Leave this circuit isolated.' };
      state.breakers.crane = !state.breakers.crane;
      result.message = state.breakers.crane ? 'GANTRY STANDBY · 2 units online. Auxiliary load: 3 / 3.' : 'GANTRY ISOLATED · 2 units available. The freight circuit can now take the load.';
      result.changed = true;
      break;
    case 'exit-breaker':
      if (state.powerRouted) return { ...result, message: 'Freight gate energized. Follow the amber service line.' };
      if (state.breakers.crane) return { ...result, message: 'OVERLOAD INTERLOCK · Gate needs 2 units. Isolate the gantry circuit first.', sound: 'error' };
      state.breakers.exit = true;
      state.powerRouted = true;
      result.message = 'FREIGHT SUPPLY RESTORED · Somewhere below, a motor starts turning.';
      result.changed = result.checkpoint = true;
      result.sound = 'door';
      break;
    case 'intake-valve':
      if (state.waterDrained) return { ...result, message: 'The intake is isolated. The lower crossing is clear.' };
      state.intakeClosed = !state.intakeClosed;
      result.message = state.intakeClosed ? 'INTAKE CLOSED · Water is no longer entering the basin.' : 'INTAKE OPEN · Water enters the basin again.';
      result.changed = true; result.sound = 'valve';
      break;
    case 'bypass-valve':
      if (state.waterDrained) return { ...result, message: 'Bypass locked open. The lower crossing is clear.' };
      state.bypassOpen = !state.bypassOpen;
      result.message = state.bypassOpen ? 'BYPASS OPEN · Discharge line connected.' : 'BYPASS CLOSED · Discharge stopped.';
      result.changed = true; result.sound = 'valve';
      break;
    case 'gantry-control':
    case 'gantry-recall':
    case 'gantry-control-return':
      state.gantryPosition = (state.gantryPosition + 1) % 3;
      if (state.gantryPosition === 1) state.toolAccessible = true;
      state.bridgeAligned = state.gantryPosition === 2 && state.tool;
      result.message = [
        'GANTRY · Parked at centre. Select the tool bay or east maintenance deck.',
        'GANTRY · Tool bay connected. The service shutter is released.',
        state.tool ? 'GANTRY · East deck connected. Bridge locks engaged.' : 'GANTRY · East deck selected. Retrieve the arc driver from the tool bay before proceeding.'
      ][state.gantryPosition];
      result.changed = true; result.checkpoint = state.bridgeAligned; result.sound = 'door';
      break;
    case 'arc-tool':
      if (state.tool) return { ...result, message: 'Arc driver equipped. A short pulse interrupts nearby machinery and stuns a threat.' };
      if (!state.toolAccessible) return { ...result, message: 'Tool bay isolated. Route the gantry to the tool bay first.', sound: 'error' };
      state.tool = true;
      state.bridgeAligned = state.gantryPosition === 2;
      result.changed = result.checkpoint = true;
      result.sound = 'pickup';
      result.message = 'ARC DRIVER ACQUIRED · Aim and pulse to stun. It recharges automatically. Keep moving while it recovers.';
      break;
    case 'damper-a': case 'damper-b': case 'damper-c': {
      if (state.coreStable) return { ...result, message: 'All dampers are synchronized. The emergency stair is released.' };
      const index = ['damper-a','damper-b','damper-c'].indexOf(id);
      state.dampers[index] = state.dampers[index] % 3 + 1;
      state.coreStable = state.dampers.every((v,i) => v === [2,1,3][i]);
      result.message = `DAMPER ${['A','B','C'][index]} · Position ${state.dampers[index]} / 3. Match the marks on its observation plate.`;
      result.changed = true;
      if (state.coreStable) { result.message = 'RESONANCE FALLING · The chamber settles. The emergency stair unlocks.'; result.checkpoint = true; result.sound = 'success'; }
      break;
    }
    case 'emergency-seal':
      if (state.evacReady) return { ...result, message: 'Isolation shutter sealed. Reach the evacuation lift.' };
      state.evacReady = true;
      result.changed = result.checkpoint = true;
      result.message = 'INTAKE SEALED · Evacuation lift released. It is time to leave.';
      result.sound = 'door';
      break;
    case 'exit': {
      const level = getLevel(state.chapter);
      if (!state[level.exit.requires]) return { ...result, message: level.exit.lockedText || 'The route is still isolated. Check the local controls.', sound: 'error' };
      if (state.chapter === LEVELS.length - 1) { state.completed = true; result.complete = true; result.message = 'Bellwether Station falls silent.'; }
      else result.nextChapter = state.chapter + 1;
      result.changed = result.checkpoint = true;
      result.sound = 'door';
      break;
    }
    default: {
      const note = getLevel(state.chapter).notes?.find(n => n.id === id);
      if (note) {
        if (!state.notes.includes(id)) { state.notes.push(id); result.changed = true; }
        result.note = note; result.message = note.title; result.sound = 'pickup';
      } else result.message = 'No response.';
    }
  }
  if (state.intakeClosed && state.bypassOpen && !state.waterDrained) {
    state.waterDrained = true;
    result.message = 'BASIN DRAINING · The water drops, revealing the maintenance crossing. The knocking does not stop.';
    result.checkpoint = result.changed = true;
    result.sound = 'success';
  }
  return result;
}

export function objective(state, tier = 'moderate') {
  if (tier === 'expert') return '';
  const simple = tier === 'simple';
  switch (state.chapter) {
    case 0: return state.powerRouted ? 'Take the freight passage to the intake works.' : simple ? (state.breakers.crane ? 'Switch off GANTRY STANDBY in Electrical Services.' : 'Switch on the FREIGHT GATE circuit.') : 'Restore power to the freight gate.';
    case 1: return state.waterDrained ? 'Cross the drained basin to the turbine hall.' : simple ? (!state.intakeClosed ? 'Close the intake valve on the dry service route.' : 'Open the bypass valve to lower the water.') : 'Find a way through the flooded intake works.';
    case 2: return state.bridgeAligned ? 'Cross the connected east deck.' : simple ? (!state.toolAccessible ? 'Set the gantry to TOOL BAY.' : !state.tool ? 'Collect the arc driver from the tool bay.' : 'Set the gantry to EAST DECK.') : 'Reconnect the maintenance route across the turbine hall.';
    case 3: return state.coreStable ? 'Leave through the emergency stair.' : simple ? 'Match each damper to its observation plate: A · II, B · I, C · III.' : 'Quiet the chamber. The test cells hold the calibration marks.';
    case 4: return state.evacReady ? 'Reach the evacuation lift.' : simple ? 'Seal the intake at the emergency console.' : 'Find a safe route out of Bellwether.';
    default: return '';
  }
}

export function objectiveTarget(state) {
  if (state.chapter === 0) return state.powerRouted ? 'exit' : state.breakers.crane ? 'crane-breaker' : 'exit-breaker';
  if (state.chapter === 1) return state.waterDrained ? 'exit' : !state.intakeClosed ? 'intake-valve' : 'bypass-valve';
  if (state.chapter === 2) return state.bridgeAligned ? 'exit' : !state.toolAccessible ? 'gantry-control' : !state.tool ? 'arc-tool' : 'gantry-control';
  if (state.chapter === 3) return state.coreStable ? 'exit' : ['damper-a','damper-b','damper-c'][state.dampers.findIndex((v,i) => v !== [2,1,3][i])];
  return state.evacReady ? 'exit' : 'emergency-seal';
}

export function hint(state, explicit = false) {
  if (explicit) return objective(state, 'simple');
  return [
    'Follow the amber conduit to Electrical Services. The cabinet labels show which machines share the auxiliary supply.',
    'Two blue pipes feed the basin: one brings water in, one lets it out. Both controls are reachable from dry ground.',
    'The gantry panel selects a destination. The tool bay should be your first stop; the east deck leads onward.',
    'Each observation plate has a different number of marks. Match the corresponding damper to those marks.',
    'You have been here before. Follow the red emergency line to the isolation control, then the lift.'
  ][state.chapter];
}
