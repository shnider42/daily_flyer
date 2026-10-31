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

test('every authored section names an actual mission zone and a shipped cue',()=>{
  const ids=new Set(MUSIC_CUES.map(c=>c.id));
  for(const mission of MISSIONS){
    const game=new Game({mission:mission.id}),score=MISSION_SCORE[mission.id];
    assert.ok(score);if(score.opening)assert.ok(ids.has(score.opening));
    const zones=new Set(game.level.zones.map(z=>z.id || z.name));
    for(const [zone,section] of Object.entries(score.sections)){assert.ok(zones.has(zone),zone);assert.ok(ids.has(section.cue));}
    for(const zone of score.quiet)assert.ok(zones.has(zone),zone);
  }
});
test('openings are fixed by mission, with three deliberately silent arrivals',()=>{
  const opening=Object.fromEntries(MISSIONS.map(m=>[m.id,musicScene(new Game({mission:m.id})).opening]));
  assert.deepEqual(opening,{'blacksite-07':'iron-wake','relay-09':null,'crosslink-11':'dry-contact','underworks-13':'spare-air','switchyard-15':'counterweight','glasshouse-17':null,'hollow-19':null,'beneath-the-shadow':'shadow-running'});
});
test('return music requires the key and actual return sector; Glasshouse power earns its first theme',()=>{
  for(const mission of ['underworks-13','switchyard-15','glasshouse-17','hollow-19']){
    const game=new Game({mission});assert.notEqual(musicScene(game).section?.cue,'exit-load');
    game.state.player.key=true;assert.equal(musicScene(game).section.cue,'exit-load');assert.equal(musicScene(game).section.danger,true);
  }
  const game=new Game({mission:'glasshouse-17'}),zone=game.level.zones.find(z=>z.id==='atrium');
  Object.assign(game.state.player,{x:zone.x1+1,z:zone.z1+1});assert.equal(musicScene(game).section,null);
  game.state.power=true;assert.equal(musicScene(game).section.cue,'root-pressure');
});

test('a crowd cannot hide a visible guardian from the exposure gate', () => {
  const game=new Game();const p=game.state.player;
  game.state.enemies=Array.from({length:4},(_,i)=>({x:p.x+1,z:p.z,health:50,alive:true,active:true,type:'brute',guardian:i===3}));
  game.hasLineOfSight=()=>true;
  assert.deepEqual(musicThreats(game),{pressure:3,guardian:true});
});

test('Shadow has fast arrival and boss cues, quiet traversal and cleared arenas',()=>{
 const g=new Game({mission:'beneath-the-shadow'});g.start();assert.equal(musicScene(g).opening,'shadow-running');
 const visit=id=>{const z=g.level.zones.find(z=>z.id===id);Object.assign(g.state.player,{x:z.x1+1,z:z.z1+1});return musicScene(g);};
 for(const id of ['null','gantry','chapel'])assert.equal(visit(id).silence,true);
 assert.equal(visit('lantern').section.cue,'lanterns-below');assert.equal(visit('hydra').section.cue,'sever-the-echo');
 for(const e of g.state.enemies.filter(e=>e.bossGroup==='hydra'))e.alive=false;assert.equal(visit('hydra').silence,true);
});
