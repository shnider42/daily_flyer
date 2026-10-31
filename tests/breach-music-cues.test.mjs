import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game, MISSIONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { MUSIC_CUES, musicScene, chooseCue } from '../daily_flyer/themes/breach_assets/music-cues.mjs';
import { musicThreats } from '../daily_flyer/themes/breach_assets/audio.mjs';

test('all thirteen distinct cues ship valid MIDI headers and local rendered audio', async () => {
  assert.equal(MUSIC_CUES.length,13);assert.equal(new Set(MUSIC_CUES.map(c=>c.id)).size,13);
  const bodies=[];
  for (const cue of MUSIC_CUES) {
    const midi=await readFile(cue.midi); assert.equal(midi.toString('ascii',0,4),'MThd');assert.equal(midi.readUInt16BE(8),1);
    assert.ok((await readFile(cue.url)).length>100000);bodies.push(midi.toString('base64'));
  }
  assert.equal(new Set(bodies).size,13);
});

test('actual mission zones select the palette and keys alone do not mark a final return', () => {
  for(const mission of MISSIONS) {
    const game=new Game({mission:mission.id});const initial=musicScene(game);
    assert.ok(initial.pool.length);
    if(['underworks-13','switchyard-15','glasshouse-17','hollow-19'].includes(mission.id)) {
      game.state.player.key=true; assert.equal(musicScene(game).pool[0],'exit-load',mission.id);
      const other=game.level.zones.find(z=>!['arrival','dock','lift'].includes(z.id));
      Object.assign(game.state.player,{x:(other.x1+other.x2)/2,z:(other.z1+other.z2)/2});
      assert.notEqual(musicScene(game).pool[0],'exit-load',mission.id);
    }
  }
  const game=new Game({mission:'hollow-19'}),zone=game.level.zones.find(z=>z.id==='listening');
  Object.assign(game.state.player,{x:zone.x1+1,z:zone.z1+1});assert.equal(musicScene(game).ambient,'below-the-carrier');
});

test('small pools relax repeat exclusions without selecting an ambient track as combat', () => {
  assert.equal(chooseCue(['dry-contact','iron-wake'],['dry-contact','iron-wake']),'dry-contact');
  assert.equal(chooseCue(['dead-carrier','iron-wake'],['iron-wake']),'iron-wake');
});

test('a crowd cannot hide a visible guardian from the exposure gate', () => {
  const game=new Game();const p=game.state.player;
  game.state.enemies=Array.from({length:4},(_,i)=>({x:p.x+1,z:p.z,health:50,alive:true,active:true,type:'brute',guardian:i===3}));
  game.hasLineOfSight=()=>true;
  assert.deepEqual(musicThreats(game),{pressure:3,guardian:true});
});
