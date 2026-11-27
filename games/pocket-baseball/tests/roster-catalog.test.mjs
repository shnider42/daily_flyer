import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_ROSTERS, DELIVERIES, resolveTeamId, getRoster, getLineup, getBatter, getPitcher } from '../public/rosters.mjs';

test('team selection follows the match options while old matches retain their original clubs', () => {
  assert.equal(getRoster(0).id, 'harbor');
  assert.equal(getRoster(1).id, 'foundry');
  assert.equal(getRoster(0, { team:'backyard' }).id, 'backyard');
  assert.equal(getRoster(1, { options:{ opponentTeam:'backyard' } }).id, 'backyard');
  assert.equal(resolveTeamId('backyard-kids'), 'backyard');
  for (const invalid of ['__proto__','constructor',null,42,{}]) {
    assert.equal(resolveTeamId(invalid,'foundry'), 'foundry');
    assert.equal(getRoster(1,{opponentTeam:invalid}).id, 'foundry');
  }
});

test('each selectable team has a complete diamond, unique people and a full bullpen', () => {
  const allIds = new Set();
  const profiles = ['balanced','power','movement','knuckle','heat104','southpaw','sidearm','finesse'].sort();
  for (const team of TEAM_ROSTERS) {
    assert.deepEqual(team.lineup.map(p => p.position).sort(), ['1B','2B','3B','C','CF','DH','LF','RF','SS']);
    assert.deepEqual(team.pitchers.map(p => p.profileId).sort(),profiles);
    const people = [...team.lineup,...team.bench,...team.pitchers];
    assert.equal(new Set(people.map(p => p.name)).size,people.length);
    assert.equal(new Set(people.map(p => p.number)).size,people.length);
    for (const player of people) {
      assert.ok(!allIds.has(player.id)); allIds.add(player.id);
      for (const rating of ['arm','accuracy','fielding']) assert.ok(player[rating] >= 0 && player[rating] <= 1, `${player.name}: ${rating}`);
      assert.ok(player.speed > 0);
      assert.match(player.appearance.skin,/^#[a-f\d]{6}$/i);
      assert.ok(player.appearance.height > 0 && player.appearance.build > 0);
      if (player.profileId) assert.ok(DELIVERIES[player.delivery]);
      assert.ok(Object.isFrozen(player.appearance));
    }
  }
});

test('substituting a Backyard reserve keeps the slot and its new identity across roster reads', () => {
  const team = getRoster(0,{team:'backyard'}), starter = team.lineup[0], reserve = team.bench[0];
  const state = {options:{team:'backyard'},battingSide:0,batterIndex:[0,0],lineupChanges:[{[starter.id]:reserve.id},{}]};
  const batter = getBatter(state);
  assert.equal(batter.name,reserve.name);
  assert.equal(batter.position,'CF');
  assert.equal(batter.appearance,reserve.appearance);
  assert.equal(batter.replaces,starter.id);
  assert.equal(getLineup(state,0).length,9);
  assert.equal(team.lineup[0].name,'Pete Wheeler');
});

test('selected Backyard bullpen rejects a stale club pitcher and selects the requested profile', () => {
  const state = {options:{opponentTeam:'backyard',opponentPitcher:'movement'},battingSide:0,pitching:[{}, {activeId:'foundry-balanced'}]};
  assert.equal(getPitcher(state).name,'Angela Delvecchio');
  state.pitching[1].activeId = 'backyard-kenny-kawaguchi';
  const kenny = getPitcher(state);
  assert.equal(kenny.name,'Kenny Kawaguchi');
  assert.equal(kenny.appearance.wheelchair,true);
  assert.equal(kenny.delivery,'seated');
  assert.ok(DELIVERIES.seated.start.y < DELIVERIES.compact.start.y);
});

test('the classic card ratings stay visible while running and throwing keep distinct strengths', () => {
  const roster = getRoster(0,{team:'backyard'});
  const byName = name => [...roster.lineup,...roster.bench,...roster.pitchers].find(p => p.name === name);
  const pablo = byName('Pablo Sanchez'), pete = byName('Pete Wheeler'), mikey = byName('Mikey Thomas'), ernie = byName('Ernie Steele');
  assert.deepEqual(pablo.classicRatings,{batting:4,running:4,pitching:3,fielding:4,scale:4});
  assert.ok(pete.speed > mikey.speed + 1.5);
  assert.ok(mikey.arm > ernie.arm + .5);
  assert.ok(ernie.accuracy > mikey.accuracy);
  assert.ok(ernie.fielding > mikey.fielding);
  assert.ok(byName('Angela Delvecchio').arm < .3);
  assert.ok(TEAM_ROSTERS.slice(0,2).every(team => team.lineup.some(p => p.position === 'LF' && p.arm < .4)));
});

test('Backyard pitching cards affect actual pitch scatter, fatigue and bullpen endurance', async () => {
  const { BaseballGame } = await import('../public/engine.mjs');
  function throwPitch(team, profile, pitchCount = 0) {
    const game = new BaseballGame({seed:412,opponentTeam:team,opponentPitcher:profile,humanSides:[0,1]});
    game.state.pitching[1].pitchCounts[game.activePitcher.playerId] = pitchCount;
    assert.equal(game.command({type:'pitch',side:1,pitchType:'fastball',quality:.55,aim:{x:0,y:0}}),true);
    return game;
  }
  const kenny = throwPitch('backyard','balanced'), ordinary = throwPitch('foundry','balanced');
  const scatter = game => Math.hypot(game.state.pitch.aimTarget.x-game.state.pitch.intendedTarget.x,
    game.state.pitch.aimTarget.y-game.state.pitch.intendedTarget.y);
  assert.ok(scatter(kenny) < scatter(ordinary));
  const kennyLate = throwPitch('backyard','balanced',60), ordinaryLate = throwPitch('foundry','balanced',60);
  assert.ok(kennyLate.state.pitch.execution.fatigue < ordinaryLate.state.pitch.execution.fatigue);
  assert.ok(kennyLate.getBullpen(1).find(p => p.active).energy > ordinaryLate.getBullpen(1).find(p => p.active).energy);
  const sally = throwPitch('backyard','power',30), powerPitcher = throwPitch('foundry','power',30);
  assert.ok(sally.state.pitch.execution.fatigue > powerPitcher.state.pitch.execution.fatigue);
  const kids = getRoster(1,{opponentTeam:'backyard'});
  const angela = kids.pitchers.find(p => p.name === 'Angela Delvecchio');
  assert.ok(angela.control > 1 && angela.stamina >= 70);
  assert.equal(throwPitch('backyard','heat104').activePitcher.maxMph,104);
});
