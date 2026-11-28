import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../public/teams.js';

const players = TEAMS.flatMap(team => team.players);

test('every fictional roster offers different offensive and defensive readers', () => {
  assert.equal(players.length, 128);
  for (const team of TEAMS) {
    for (const key of ['awareness', 'anticipation']) {
      const values = team.players.map(player => player.ratings[key]);
      assert.ok(values.every(value => Number.isInteger(value) && value >= 50 && value <= 99), `${team.id}: valid ${key}`);
      assert.ok(Math.max(...values) - Math.min(...values) >= 20, `${team.id}: meaningful ${key} choices`);
    }
    assert.ok(team.players.some(player => Math.abs(player.ratings.awareness - player.ratings.anticipation) >= 15), `${team.id}: offensive and defensive reads are distinct`);
  }
});

test('slow smart players exist among guards, wings and bigs, including reserves', () => {
  for (const positions of [['PG', 'SG', 'G'], ['SF', 'F'], ['PF', 'C']]) {
    assert.ok(players.some(player => positions.includes(player.position) && player.ratings.speed <= 78 && player.ratings.awareness >= 88), `patient reader among ${positions.join('/')}`);
  }
  assert.ok(TEAMS.some(team => team.players.slice(5).some(player => player.ratings.awareness >= 90)), 'a bench player can have elite awareness');
  assert.ok(players.some(player => player.ratings.speed >= 88 && player.ratings.awareness <= 75), 'physical quickness does not imply sharp reads');
});

test('mental ratings are independent of physical speed across the catalogue', () => {
  const mean = key => players.reduce((sum, player) => sum + player.ratings[key], 0) / players.length;
  const speedMean = mean('speed');
  for (const key of ['awareness', 'anticipation']) {
    const readMean = mean(key);
    let covariance = 0, speedVariance = 0, readVariance = 0;
    for (const player of players) {
      const speed = player.ratings.speed - speedMean, read = player.ratings[key] - readMean;
      covariance += speed * read;
      speedVariance += speed * speed;
      readVariance += read * read;
    }
    const correlation = covariance / Math.sqrt(speedVariance * readVariance);
    assert.ok(Math.abs(correlation) < .3, `${key} should not act as a second speed rating (${correlation})`);
  }
});
