import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {ReplayTape,replayFrame,replayKind} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
import {PGIMusic,SCORE_CUES} from '../../daily_flyer/themes/pocket_gridiron_assets/music.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
function game(){const g=new Game(buildTeam('NE',data),buildTeam('NYJ',data),'pro',seededRandom(9));g.beginDrive(0,25);g.choose('dive');g.snap();g.events=[];return g;}
function history(g,tape){for(let i=0;i<80;i++){g.carrier.y=30+i*.3;tape.observe(g,.05,[]);}}
test('touchdown replay freezes recorded action without changing simulation, score, clock or RNG',()=>{const g=game(),t=new ReplayTape();history(g,t);g.carrier.y=100;g.finish('touchdown',100);t.observe(g,.05,g.events);assert.equal(t.clips[0].kind,'TOUCHDOWN');assert.equal(t.start(g),true);let rolls=0;g.rng=()=>{rolls++;return .3;};const before=JSON.stringify({...g,rng:null});for(let i=0;i<400&&t.active;i++){t.view();t.advance(.05);}assert.equal(t.active,null);assert.equal(JSON.stringify({...g,rng:null}),before);assert.equal(rolls,0);});
test('interception is recorded but the return remains live; world coordinates survive the flip',()=>{const g=game(),t=new ReplayTape();history(g,t);const d=g.defenders[4];d.x=12;d.y=48;g.startTurnover(d,'interception');t.observe(g,.05,g.events);assert.equal(t.clips.length,1);assert.equal(t.start(g),false);const f=t.history.at(-1);assert.equal(f.ball.x,12);assert.equal(f.ball.y,48);g.finish('tackle',g.carrier.y);t.observe(g,.05,g.events.splice(0).filter(e=>e.type==='result'));assert.equal(t.start(g),true);assert.equal(t.view().anchor,0);});
test('fumble, interception and touchdown markers queue separately and skip never changes game state',()=>{const g=game(),t=new ReplayTape();history(g,t);g.startFumble(g.defenders[0]);t.observe(g,.05,g.events.splice(0));assert.equal(t.start(g),false);g.recoverFumble(g.defenders[4]);t.observe(g,.05,g.events.splice(0));g.carrier.y=100;g.finish('touchdown',100);t.observe(g,.05,g.events.splice(0));assert.deepEqual(t.clips.map(c=>c.kind),['FUMBLE','TOUCHDOWN']);assert.equal(t.start(g),true);const score=[...g.scores],clock=g.clock;t.skip();assert.equal(t.active.clip.kind,'TOUCHDOWN');t.skipAll();assert.equal(t.active,null);assert.deepEqual(g.scores,score);assert.equal(g.clock,clock);});
test('end-zone interceptions produce a replay marker even when the return is a touchback',()=>{const g=game();g.defenders[4].y=102;g.startTurnover(g.defenders[4],'interception');assert.ok(g.events.some(e=>replayKind(e)==='INTERCEPTION'));assert.equal(g.phase,'dead');});
test('scoring is published once after penalties; wiped-out touchdowns cannot trigger music or a TD replay',()=>{const g=game();g.beginDrive(1,25);g.choose('zone');g.snap(1);g.events=[];g.flag('holding',1,g.players[5]);g.finish('touchdown',100);assert.equal(g.phase,'penalty');assert.ok(g.events.every(e=>!e.scorePoints));g.resolvePenalty(true);assert.ok(g.events.every(e=>!e.scorePoints));const h=game();h.flag('offside',1,h.defenders[0]);h.finish('touchdown',100);h.resolvePenalty(false);const e=h.events.find(e=>e.scorePoints);assert.equal(e.scoreTeam,0);assert.equal(e.scoreAbbr,'NE');assert.equal(e.scorePoints,6);h.publishResult('SAME RESULT','');assert.equal(h.events.filter(e=>e.scorePoints).length,1);});
test('field goals and safeties use the actual scoring team and do not create touchdown replays',()=>{const g=game();g.finish('fieldgoal',70);assert.equal(g.events.at(-1).scoreAbbr,'NE');assert.equal(replayKind(g.events.at(-1)),null);g.beginDrive(0,1);g.choose('dive');g.snap();g.finish('tackle',-1);assert.equal(g.events.at(-1).scoreAbbr,'NYJ');assert.equal(g.events.at(-1).scorePoints,2);});
test('replay history is bounded, detached from live players, and waits through penalty decisions',()=>{const g=game(),t=new ReplayTape();for(let i=0;i<1000;i++)t.observe(g,.05,[]);assert.ok(t.history.length<=242);const f=replayFrame(g,0),x=f.people[0].x;g.players[0].x=52;assert.equal(f.people[0].x,x);t.observe(g,.05,[{type:'ball',text:'FUMBLE!'}]);g.phase='penalty';assert.equal(t.start(g),false);g.phase='dead';g.paused=true;assert.equal(t.start(g),false);g.paused=false;assert.equal(t.start(g),true);});
const manifest=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/music/manifest.json',import.meta.url)));
function context(){const c={currentTime:0,state:'running',sources:[],decodeAudioData:async()=>({duration:55}),createGain:()=>({gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}},connect(){},disconnect(){}}),createBufferSource(){const s={connect(){},disconnect(){},start(at,offset){this.started={at,offset};},stop(){this.stopped=true;}};c.sources.push(s);return s;}};return c;}
function player(fetcher=async url=>({ok:true,json:async()=>manifest,arrayBuffer:async()=>new ArrayBuffer(8)})){const p=new PGIMusic({fetcher}),c=context();p.catalog=manifest.tracks;p.attach(c,{},{});return [p,c];}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Green Bay comparison previews switch cleanly, obey mute and leave actual scores on the current cue',async()=>{
 const [p]=player();p.update({background:false});
 p.previewScore('gb63');await settle();const first=p.scorer;
 assert.equal(first.track.id,'lambeau-long-drop-63');
 p.previewScore('gb112');await settle();assert.equal(first.stopped,true);
 assert.equal(p.scorer.track.id,'lambeau-long-drop-112');
 p.previewScore('missing');assert.equal(p.scorer.track.id,'lambeau-long-drop-112');
 p.score('GB');await settle();assert.equal(p.scorer.track.id,'green-bay-bomb-intro');
 assert.ok(p.cache.size<=3);assert.equal(p.active,null);
 p.configure({scoring:false});p.previewScore('gb63');await settle();assert.equal(p.scorer,null);
});
test('Green Bay scores use the approved bomb intro as either team, while opponents retain their own cue',async()=>{
 for(const packers of [0,1]){
  const teams=packers===0?['GB','BUF']:['BUF','GB'];
  const g=new Game(...teams.map(t=>buildTeam(t,data)),'pro',seededRandom(9));
  const urls=[],[p]=player(async url=>{urls.push(String(url));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};});
  p.update({background:false});p.warmScores(teams);await settle();
  assert.ok(urls.some(url=>new URL(url).pathname.endsWith('/music/green-bay-bomb-intro.mp3')));
  for(const team of [packers,1-packers]){
   g.beginDrive(team,95);assert.equal(g.choose(g.userOffense?'dive':g.defensePlays[0].id),true);assert.equal(g.snap(team),true);g.events=[];g.finish('touchdown',100);
   const event=g.events.find(e=>e.scorePoints===6);assert.ok(event);
   p.score(event.scoreAbbr);await settle();
   assert.equal(p.scorer.track.id,team===packers?'green-bay-bomb-intro':'pgi-score');
   assert.equal(p.active,null);
   p.scorer.source.onended();assert.equal(p.scorer,null);
  }
  p.configure({scoring:false});p.score('GB');await settle();assert.equal(p.scorer,null);
 }
});
test('soundtrack restores three arcade favorites and reserves three orchestral themes for postgame',()=>{assert.equal(manifest.tracks.length,6);for(const family of ['arcade','film'])assert.equal(manifest.tracks.filter(t=>t.family===family).length,3);assert.equal(SCORE_CUES.NE.id,'for-boston');assert.equal(SCORE_CUES.NYJ.id,'notre-dame-victory');assert.equal(SCORE_CUES.default.id,'pgi-score');for(const t of manifest.tracks)assert.ok(fs.statSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/'+t.src,import.meta.url)).size>100000);});
test('music rotates across tracks and family selection; pause resumes from its previous offset',async()=>{const [p,c]=player();p.update();await settle();const first=p.active.track.id;c.currentTime=12;p.update({blocked:true});assert.equal(p.active,null);assert.equal(p.resumeAt,12);p.update({blocked:false});await settle();assert.equal(p.active.track.id,first);assert.equal(p.active.source.started.offset,12);p.next();await settle();assert.notEqual(p.active.track.id,first);p.configure({family:'film'});p.update();await settle();assert.equal(p.active.track.family,'film');});
test('a late soundtrack download cannot start after mute, pause or a newer selection',async()=>{let resolve;const [p,c]=player(()=>new Promise(r=>{resolve=r;}));p.update();p.configure({enabled:false});resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await settle();assert.equal(c.sources.length,0);assert.equal(p.active,null);});
test('scoring music ducks the song, maps both teams, and is independently disabled',async()=>{const [p,c]=player();p.update();await settle();p.score('NYJ');await settle();assert.equal(p.scorer.track.id,'notre-dame-victory');const song=p.active;p.scorer.source.onended();assert.equal(p.scorer,null);assert.equal(p.active,song);p.configure({enabled:false,scoring:true});p.score('NE');await settle();assert.equal(p.scorer.track.id,'for-boston');p.configure({enabled:false,scoring:false});p.score('BUF');assert.equal(p.scorer,null);});
test('late scoring audio is canceled on pause and cannot celebrate during a later play',async()=>{let release;const [p,c]=player(()=>new Promise(r=>{release=r;}));p.score('NE');p.update({blocked:true});release({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await settle();assert.equal(c.sources.length,0);p.update({blocked:false});p.halt();});
test('decoded background audio cache stays bounded while all six tracks can be selected',async()=>{const [p]=player();for(const t of manifest.tracks)await p.prepare(t);assert.equal(p.cache.size,2);for(const cue of Object.values(SCORE_CUES))await p.prepare(cue);assert.equal(p.cache.size,5);});

test('broadcast-only playback keeps scoring independent and resumes the show at its offset',async()=>{
 const [p,c]=player();p.update({background:true});await settle();const track=p.active.track.id;c.currentTime=8;
 p.update({background:false});assert.equal(p.active,null);assert.equal(p.resumeAt,8);
 p.score('NE');await settle();assert.equal(p.scorer.track.id,'for-boston');assert.equal(p.active,null);
 p.scorer.source.onended();p.update({background:false});await settle();assert.equal(p.active,null);
 p.update({background:true});await settle();assert.equal(p.active.track.id,track);assert.equal(p.active.source.started.offset,8);
});
test('downloads cannot leak menu music onto the field, and the next live play cancels a scoring cue',async()=>{
 let release;const [p,c]=player(()=>new Promise(r=>{release=r;}));p.update({background:true});p.update({background:false});release({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await settle();assert.equal(c.sources.length,0);
 p.cache.set('for-boston',{duration:30});p.score('NE');await settle();assert.ok(p.scorer);p.update({background:false,scoreAllowed:false,live:true});assert.equal(p.scorer,null);assert.equal(p.active,null);
 p.score('NE');p.update({background:false,scoreAllowed:false,live:true});await settle();assert.equal(p.scorer,null);
});

test('a discarded audio context releases voices and late loads before speaker recovery',async()=>{
 const [p,c]=player();p.update();await settle();assert.ok(p.active);const selected=p.active.track.id;
 p.releaseContext();assert.equal(p.active,null);assert.equal(p.voices.size,0);assert.equal(p.context,null);assert.equal(p.selected.id,selected);
 const fresh=context();p.attach(fresh,{},{});p.update();await settle();assert.equal(p.active.track.id,selected);assert.equal(fresh.sources.length,1);
});

test('automatic music follows menu, pregame, halftime and final highlights, with no orchestral menu spill',async()=>{
 const [p,c]=player();
 for(const [scene,expected] of [['menu','saturday-voltage'],['pregame','fourth-and-thunder'],['halftime','neon-end-zone'],['postgame','sunday-in-gold']]){
  p.update({scene});await settle();assert.equal(p.active.track.id,expected);
  const family=scene==='postgame'?'film':'arcade';
  for(let i=0;i<4;i++){assert.equal(p.active.track.family,family);p.active.source.onended();p.update({scene});await settle();}
 }
 p.update({scene:'menu'});await settle();assert.equal(p.active.track.id,'saturday-voltage');
});
test('a show transition discards an in-flight arcade download and starts its film score from the opening',async()=>{
 const pending=new Map();const [p,c]=player(url=>new Promise(resolve=>pending.set(String(url),resolve)));
 const release=id=>{const key=[...pending.keys()].find(k=>k.includes(id));assert.ok(key,id);pending.get(key)({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});};
 p.update({scene:'pregame'});p.update({scene:'postgame'});
 release('fourth-and-thunder');await settle();assert.equal(p.active,null);
 release('sunday-in-gold');await settle();assert.equal(p.active.track.id,'sunday-in-gold');assert.equal(p.active.offset,0);
});
test('scene changes preserve mute and explicit collection choices, and clear final-play scoring music',async()=>{
 const [p]=player();p.update({scene:'pregame'});await settle();p.score('NYJ');await settle();assert.ok(p.scorer);
 p.update({scene:'postgame'});await settle();assert.equal(p.scorer,null);assert.equal(p.active.track.family,'film');
 p.configure({enabled:false});p.update({scene:'menu'});await settle();assert.equal(p.active,null);
 p.configure({family:'arcade'});p.update({scene:'postgame'});await settle();assert.equal(p.active.track.family,'arcade');
 p.configure({family:'all'});p.update();await settle();assert.equal(p.active.track.family,'film');
 assert.equal(p.list({browse:true}).length,6);assert.equal(p.list().length,3);
});
