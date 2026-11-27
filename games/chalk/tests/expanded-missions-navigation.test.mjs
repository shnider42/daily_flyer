import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, createGame, step } from '../public/sim.mjs';
import { explainObjective } from '../public/guidance.mjs';
import { navigationInput, missionNavigationTarget, quietMission } from './mission-navigation-helper.mjs';

// Exercise actual movement and mission transitions. Combat is disabled so a
// route, arrival, interaction, or escort regression cannot hide behind a death.
test('the standalone additions retain distinct task sequences', () => {
  const routes = new Set();
  for (let mission = 6; mission < MISSIONS.length; mission++) {
    const state = createGame({ mission, seed: 17 });
    routes.add(state.stages.map(stage => stage.kind).join('>'));
  }
  assert.equal(routes.size, MISSIONS.length - 6, 'each added operation uses a different sequence of player tasks');
});

test('a human following an AI leader keeps that destination during a convoy stage', () => {
  const state = quietMission(createGame({ mission: 2, seed: 63, role: 'member' }));
  state.stageIndex = state.stages.findIndex(stage => stage.kind === 'convoy');
  const leader = state.squad[0], member = state.squad[1];
  assert.equal(missionNavigationTarget(state, member, leader), leader, 'following a person must not silently become following the vehicle');
});

for (let mission = 6; mission < MISSIONS.length; mission++) {
  test(`${MISSIONS[mission].title} finishes through human movement and every authored stage`, () => {
    const state = quietMission(createGame({ mission, seed: 17, role: 'leader', difficulty: 'story' }));
    assert.equal(state.mission.category, 'side');
    assert.match(state.mission.time, /FICTIONAL/i);
    const reached = new Set();
    for (let frame = 0; frame < 30 * 720 && state.status === 'playing'; frame++) {
      const actor = state.squad.find(soldier => soldier.id === state.playerId), objective = state.objective;
      if (!reached.has(state.stageIndex)) {
        reached.add(state.stageIndex);
        assert.ok(explainObjective(objective).length > 20, `${state.mission.title}: the current task has Simple guidance`);
      }
      const input = navigationInput(state, actor, objective);
      step(state, input, 1 / 30);
    }
    const positions = [...state.squad, ...state.survivors].filter(actor => actor.alive).map(actor => `${actor.name}@${Math.round(actor.x)},${Math.round(actor.y)}`).join('; ');
    assert.equal(state.status, 'won', `${state.mission.title}: stage ${state.stageIndex} ${state.objective.title}; ${state.objective.detail}; ${positions}`);
    assert.equal(reached.size, state.stages.length, `${state.mission.title}: every authored stage ran`);
    assert.equal(state.stats.objectives, state.stages.length);
    assert.equal(state.squad.filter(actor => actor.alive && !actor.downed).length, 4);
  });
}
