import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game, MISSIONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { MUSIC_CUES, MISSION_SCORE, musicScene } from '../daily_flyer/themes/breach_assets/music-cues.mjs';
import { musicThreats } from '../daily_flyer/themes/breach_assets/audio.mjs';

test('all sixteen distinct cues ship valid MIDI headers and local rendered audio', async () => {
  assert.equal(MUSIC_CUES.length,16);assert.equal(new Set(MUSIC_CUES.map(c=>c.id)).size,16);
  const bodies=[];
  for (const cue of MUSIC_CUES) {
    const midi=await readFile(cue.midi); assert.equal(midi.toString('ascii',0,4),'MThd');assert.equal(midi.readUInt16BE(8),1);
    assert.ok((await readFile(cue.url)).length>100000);bodies.push(midi.toString('base64'));
  }
  assert.equal(new Set(bodies).size,16);
});

test('every map and authored region has a fixed rotation of at least two shipped cues',()=>{
  const ids=new Set(MUSIC_CUES.map(c=>c.id));
  for(const mission of MISSIONS){
    const game=new Game({mission:mission.id}),score=MISSION_SCORE[mission.id],zones=new Set(game.level.zones.map(z=>z.id||z.name));
    assert.ok(ids.has(score.opening));
    for(const profile of [score.rotation,...Object.values(score.sections),...Object.values(score.bosses)]){
      assert.ok(profile.cues.length>=2);assert.equal(new Set(profile.cues).size,profile.cues.length);assert.ok(profile.cues.every(id=>ids.has(id)));
    }
    for(const zone of [...Object.keys(score.sections),...Object.keys(score.bosses),...Object.keys(score.quietBeats)])assert.ok(zones.has(zone),zone);
    assert.ok(Object.keys(score.quietBeats).length<=2);assert.ok(Object.values(score.quietBeats).every(seconds=>seconds<=10));
    // Includes corridors between named districts, not just hand-picked score triggers.
    for(let z=0;z<game.level.height;z++)for(let x=0;x<game.level.width;x++)if(game.level.grid[z][x]!=='#'){
      Object.assign(game.state.player,{x:x+.5,z:z+.5});const scene=musicScene(game);assert.ok(scene.rotation?.cues.length>=2);assert.notEqual(scene.silence,true);
    }
  }
});
test('every mission has an opening, while only Relay and Hollow arrivals have a brief hush',()=>{
  for(const m of MISSIONS){const scene=musicScene(new Game({mission:m.id}));assert.ok(scene.opening);assert.equal(!!scene.quietBeat,['relay-09','hollow-19'].includes(m.id));}
});
test('return routes are scored after the key even when no enemies remain',()=>{
  for(const mission of MISSIONS){
    const game=new Game({mission:mission.id}),score=MISSION_SCORE[mission.id],z=game.level.zones.find(z=>(z.id||z.name)===score.returnZone);
    Object.assign(game.state.player,{x:z.x1+.5,z:z.z1+.5});assert.notEqual(musicScene(game).rotation.key,'return');
    game.state.player.key=true;game.state.enemies=[];assert.equal(musicScene(game).rotation.cues[0],'exit-load');assert.equal(musicScene(game).quietBeat,null);
  }
});

test('a crowd cannot hide a visible guardian from the exposure gate', () => {
  const game=new Game();const p=game.state.player;
  game.state.enemies=Array.from({length:4},(_,i)=>({x:p.x+1,z:p.z,health:50,alive:true,active:true,type:'brute',guardian:i===3}));
  game.hasLineOfSight=()=>true;
  assert.deepEqual(musicThreats(game),{pressure:3,guardian:true});
});

test('Shadow platforming and laboratories are scored; a cleared boss arena returns to the mission rotation',()=>{
 const g=new Game({mission:'beneath-the-shadow'});g.start();assert.equal(musicScene(g).opening,'shadow-running');
 const visit=id=>{const z=g.level.zones.find(z=>z.id===id);Object.assign(g.state.player,{x:z.x1+.5,z:z.z1+.5});return musicScene(g);};
 for(const id of ['null','gantry']){assert.ok(visit(id).rotation);assert.equal(visit(id).quietBeat,null);}
 assert.equal(visit('chapel').quietBeat.seconds,10);assert.equal(visit('lantern').rotation.cues[0],'lanterns-below');assert.equal(visit('hydra').boss.cues[0],'sever-the-echo');
 for(const e of g.state.enemies.filter(e=>e.bossGroup==='hydra'))e.alive=false;assert.equal(visit('hydra').boss,null);assert.ok(visit('hydra').rotation);
});
