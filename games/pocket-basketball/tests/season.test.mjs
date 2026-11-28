import test from 'node:test';
import assert from 'node:assert/strict';
import {createCup, advanceCup, cupMatch, validCup, LocalStore} from '../public/season.js';

test('three wins progress through a unique eight-team bracket and preserve previous save', () => {
  let cup = createCup('boston-college', {seed: 47});
  assert.equal(new Set(cup.rounds[0].matches.flatMap(m => [m.home,m.away])).size, 8);
  for (let i = 0; i < 3; i++) {
    assert.equal(validCup(cup), true); assert.equal(cup.round, i);
    const before = JSON.stringify(cup), m = cupMatch(cup), opponent = m.home === cup.teamId ? m.away : m.home;
    const next = advanceCup(cup, {homeId: cup.teamId, awayId: opponent, score: [32,29]});
    assert.equal(JSON.stringify(cup), before);
    assert.equal(next.rounds[i].matches.filter(m => !m.simulated).length, 1);
    cup = next;
  }
  assert.equal(cup.completed, true); assert.equal(cup.champion, 'boston-college'); assert.equal(cupMatch(cup), null);
  assert.equal(validCup(cup), true);
});
test('loss stops advancement, tied and unrelated results are rejected', () => {
  const cup = createCup('duke', {seed: 3}), m = cupMatch(cup);
  assert.throws(() => advanceCup(cup, {homeId:m.home,awayId:m.away,score:[10,10]}));
  assert.throws(() => advanceCup(cup, {homeId:'ucla',awayId:'duke',score:[20,10]}));
  const lost = advanceCup(cup, {homeId:m.home,awayId:m.away,score:[10,20]});
  assert.equal(lost.eliminated, true); assert.equal(lost.rounds.length, 1);
  assert.throws(() => advanceCup(lost, {homeId:m.home,awayId:m.away,score:[21,20]}));
});
test('corrupt saves do not become resumable tournament state', () => {
  assert.equal(validCup(null), false); assert.equal(validCup({version:1,teamId:'duke'}), false);
  const cup = createCup('duke'); cup.rounds[0].matches[0].away = 'missing'; assert.equal(validCup(cup), false);
  const store = new LocalStore({getItem(){return '{bad json';},setItem(){throw new Error('blocked');}});
  assert.deepEqual(store.read('settings', {}), {}); assert.equal(store.write('cup', cup), false);
});
