import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, PITCHES, PITCHERS, STEP, pitchPosition } from '../public/engine.mjs';
import { readVisiblePitch } from '../public/pitch-flight.mjs';
import { RoomHub } from '../multiplayer.mjs';

function deliver(type, { seed = 23, hand = 'R', aim = { x: 0, y: 1, z: 0 }, quality = 1 } = {}) {
  const game = new BaseballGame({ seed, humanSides:[0,1], opponentPitcher:hand === 'L' ? 'southpaw' : 'balanced' });
  game._startPitch(type, aim, quality);
  return game.state.pitch;
}

test('aim is the initial line and every pitch finishes at its visibly moved endpoint', () => {
  for(const type of Object.keys(PITCHES)) {
    const pitch=deliver(type), finish=pitchPosition(pitch,pitch.contactAt);
    assert(Math.abs(finish.x-pitch.target.x)<1e-9,type);
    assert(Math.abs(finish.y-pitch.target.y)<1e-9,type);
    assert(Math.hypot(pitch.target.x-pitch.aimTarget.x,pitch.target.y-pitch.aimTarget.y)>.01,type);
    assert.deepEqual(pitch.intendedTarget,{x:0,y:1,z:0});
    assert.deepEqual(pitchPosition(pitch,pitch.releaseAt),pitch.start);
  }
});

test('a splitter drops below the aimed line; aiming higher brings its finish back into the zone', () => {
  const low=deliver('splitter'),high=deliver('splitter',{aim:{x:0,y:1.45,z:0}});
  assert(low.target.y<.5);assert(high.target.y>.75&&high.target.y<1.1);
  const at90=pitchPosition(low,low.releaseAt+low.duration*.9);
  const line90=low.start.y+(low.aimTarget.y-low.start.y)*.9;
  assert(line90-at90.y>.3);
  assert(low.aimTarget.y-low.target.y>.5);
});

test('handedness reverses sideways movement without reversing downward movement', () => {
  const right=deliver('slider'),left=deliver('slider',{hand:'L'});
  assert(right.target.x-right.aimTarget.x<-.3);assert(left.target.x-left.aimTarget.x>.3);
  assert(Math.abs((right.target.y-right.aimTarget.y)-(left.target.y-left.aimTarget.y))<1e-10);
});

test('release quality affects scatter while good releases still have a small margin', () => {
  let good=0,bad=0;
  for(let seed=1;seed<=100;seed++) {
    const a=deliver('fastball',{seed}),b=deliver('fastball',{seed,quality:.1});
    good+=Math.hypot(a.aimTarget.x,a.aimTarget.y-1);
    bad+=Math.hypot(b.aimTarget.x,b.aimTarget.y-1);
  }
  assert(good>0);assert(bad>good*10);
});

test('CPU waits for visible flight instead of choosing a swing in the windup', () => {
  const game=new BaseballGame({seed:12});game.state.battingSide=1;
  game._startPitch('slider',{x:.2,y:1.1,z:0},1);
  assert.equal(game.state.pitch.aiSwing,null);assert.equal(game.state.pitch.aiRead.samples.length,0);
  for(let i=0;i<40;i++)game.update(STEP);
  assert.equal(game.state.phase,'windup');assert.equal(game.state.pitch.aiSwing,null);
  while(!game.state.pitch.aiRead.committed&&game.state.phase!=='result')game.update(STEP);
  assert(game.state.pitch.aiRead.committed);
  assert(game.state.pitch.aiRead.samples.every(sample=>sample.time>game.state.pitch.releaseAt));
});

function reading(seed, previousSpeed=null) {
  const game=new BaseballGame({seed,difficulty:'club'}),s=game.state;
  s.battingSide=1;s.phase='pitch';s.time=.7;s.hitterReads[1]=previousSpeed;
  s.pitch={aiRead:{samples:[{time:.59,x:0,y:1,z:6.2},{time:.645,x:0,y:1,z:5.1}],nextAt:.7,committed:false},aiSwing:null};
  Object.assign(s.ball,{x:0,y:1,z:4,visible:true});
  return game;
}

test('the CPU read cannot access destination, pitch identity, hidden execution, or exact arrival', () => {
  const a=reading(5),b=reading(5);
  for(const key of ['target','intendedTarget','type','mph','flutter','execution','contactAt','duration'])
    Object.defineProperty(a.state.pitch,key,{get(){throw new Error(`CPU inspected hidden ${key}`);}});
  a._readCpuPitch();b._readCpuPitch();
  assert.deepEqual(a.state.pitch.aiSwing,b.state.pitch.aiSwing);
  assert.deepEqual(a.state.pitch.aiRead,b.state.pitch.aiRead);
  assert(a.state.pitch.aiRead.committed);
});

test('a committed CPU swing cannot be redirected after the ball breaks', () => {
  for(let seed=1;seed<=15;seed++) {
    const game=reading(seed);game._readCpuPitch();
    if(!game.state.pitch.aiSwing)continue;
    const swing=structuredClone(game.state.pitch.aiSwing);
    game.state.time+=.15;Object.assign(game.state.ball,{x:-.75,y:.25,z:.5});
    game._readCpuPitch();assert.deepEqual(game.state.pitch.aiSwing,swing);return;
  }
  assert.fail('Expected a seeded swing at the visible strike');
});

test('the previous visible speed can make the CPU early on a change of pace', () => {
  for(let seed=1;seed<=15;seed++) {
    const steady=reading(seed,20),offSpeed=reading(seed,29);steady._readCpuPitch();offSpeed._readCpuPitch();
    if(!steady.state.pitch.aiSwing)continue;
    assert(offSpeed.state.pitch.aiSwing.time<steady.state.pitch.aiSwing.time-.05);return;
  }
  assert.fail('Expected a seeded swing');
});

test('CPU pitch selection compensates for typical break without guaranteeing the finish', () => {
  for(const profile of Object.keys(PITCHERS)) {
    let strikes=0;
    for(let seed=1;seed<=80;seed++) {
      const game=new BaseballGame({seed,mode:'practice',opponentPitcher:profile});game._cpuPitch();
      const p=game.state.pitch;if(Math.abs(p.target.x)<.3&&p.target.y>.4&&p.target.y<1.55)strikes++;
      assert(Number.isFinite(p.target.x)&&Number.isFinite(p.target.y));
    }
    assert(strikes>40,`${profile} should deliver hittable practice pitches, got ${strikes}/80`);
  }
});

test('visible flight estimation is reproducible and rejects insufficient observations', () => {
  assert.equal(readVisiblePitch([]),null);
  const samples=[{time:.1,x:0,y:1.1,z:10},{time:.15,x:.01,y:1.05,z:9},{time:.2,x:.02,y:1,z:8}];
  const read=readVisiblePitch(samples);assert(Math.abs(read.arrival-.6)<1e-9);assert(Math.abs(read.x-.1)<1e-9);
});

test('new parks and selected clubs persist through private room creation, join and reconnect', () => {
  const hub=new RoomHub(),host=hub.create({park:'schoolyard',team:'backyard',opponentTeam:'harbor'});
  const guest=hub.join(host.code,{team:'foundry',pitcher:'southpaw'});
  const room=hub.room(host.code);
  assert.equal(room.game.options.team,'backyard');assert.equal(room.game.options.opponentTeam,'foundry');
  assert.equal(room.game.options.park,'schoolyard');assert.equal(room.game.activePitcher.hand,'L');
  const packet=hub.rejoin(host.code,host.token).packet;
  assert.equal(packet.room.options.team,'backyard');assert.equal(packet.snapshot.state.pitching[0].activeId,'backyard-kenny-kawaguchi');
  assert.equal(guest.packet.snapshot.state.options.park,'schoolyard');
});
