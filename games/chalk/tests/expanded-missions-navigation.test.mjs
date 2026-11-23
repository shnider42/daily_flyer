import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, createGame, findPath, step } from '../public/sim.mjs';
import { explainObjective } from '../public/guidance.mjs';

// Exercise actual movement and mission transitions. Combat is disabled so a
// route, arrival, interaction, or escort regression cannot hide behind a death.
test('the four added standalone operations finish under a human leader without teleporting or skipping stages', () => {
  const routes = new Set();
  for (let mission = 6; mission < MISSIONS.length; mission++) {
    const state = createGame({ mission, seed: 17, role: 'leader', difficulty: 'story' });
    state.enemies = []; state.maxEnemies = 0;
    assert.equal(state.mission.category, 'side');
    assert.match(state.mission.time, /FICTIONAL/i);
    routes.add(state.stages.map(stage => stage.kind).join('>'));
    const reached = new Set();
    for (let frame = 0; frame < 30 * 720 && state.status === 'playing'; frame++) {
      const actor = state.squad.find(soldier => soldier.id === state.playerId), objective = state.objective;
      if (!reached.has(state.stageIndex)) {
        reached.add(state.stageIndex);
        assert.ok(explainObjective(objective).length > 20, `${state.mission.title}: the current task has Simple guidance`);
      }
      const input = { interact: true, ...(objective.lookAt ? { aimX: objective.lookAt.x, aimY: objective.lookAt.y } : {}) };
      if (Math.hypot(actor.x - objective.x, actor.y - objective.y) > 22) {
        const next = findPath(state, actor, objective)[0];
        if (next) {
          const dx = next.x - actor.x, dy = next.y - actor.y, length = Math.hypot(dx, dy);
          if (length > 0) { input.moveX = dx / length; input.moveY = dy / length; }
        }
      }
      step(state, input, 1 / 30);
    }
    const positions = [...state.squad, ...state.survivors].filter(actor => actor.alive).map(actor => `${actor.name}@${Math.round(actor.x)},${Math.round(actor.y)}`).join('; ');
    assert.equal(state.status, 'won', `${state.mission.title}: stage ${state.stageIndex} ${state.objective.title}; ${state.objective.detail}; ${positions}`);
    assert.equal(reached.size, state.stages.length, `${state.mission.title}: every authored stage ran`);
    assert.equal(state.stats.objectives, state.stages.length);
    assert.equal(state.squad.filter(actor => actor.alive && !actor.downed).length, 4);
  }
  assert.equal(routes.size, MISSIONS.length - 6, 'each added operation uses a different sequence of player tasks');
});
