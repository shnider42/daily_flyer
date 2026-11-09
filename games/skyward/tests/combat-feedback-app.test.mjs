import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app-fixture.mjs';
import {FlightSimulation} from '../public/sim.mjs';
import {createArenaMission} from '../public/arena.mjs';
import {getMission} from '../public/campaign.mjs';

function begin(app,{guest=false,crew=false}={}){
  const mode=crew?'crew':'dogfight',missionId=crew?'gunship-nightwatch':'arena-canyon';
  const players=[{id:'lead',name:'Lead',aircraft:crew?'ac130':'f16',startMode:'airborne',connected:true,ready:true,role:'pilot'},
    {id:'wing',name:'Wing',aircraft:crew?'ac130':'f16',startMode:'airborne',connected:true,ready:true,role:crew?'gunner':'pilot'}];
  const config={mode,mapId:'canyon',durationSeconds:300,lives:3},role=crew&&guest?'gunner':'pilot';
  Object.assign(app.team,{code:'ABC234',id:guest?'wing':'lead',hostId:'lead',isHost:!guest,connected:true,mode,config,role,roomState:'flying',missionId,roster:players});
  const start={missionId,mode,config,players,hostId:'lead',runId:'feedback-run',seed:1,role};
  app.team.callbacks.onStart(start);return start;
}

test('actual host UI signals only its own damage once and keeps the flight controls active',async t=>{
  const {app,document,frame}=await appFixture(t);begin(app);frame(17);
  const sim=app.sim;sim.time=5;
  sim._damageParticipant(sim.participants.get('wing'),10,'lead','gun',sim.player);frame(120);
  assert.equal(document.getElementById('damage-notice').hidden,true);
  assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,0);
  sim._damageParticipant(sim.localParticipant,25,'wing','bullet',{x:sim.player.x-80,y:sim.player.y,z:sim.player.z});frame(120);
  assert.equal(document.getElementById('damage-notice').hidden,false);
  assert.equal(document.getElementById('damage-title').textContent,'AIRFRAME HIT');
  assert.match(document.getElementById('damage-detail').textContent,/FROM RIGHT.*AIRFRAME/);
  assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,1);
  assert.equal(app.audio.cues.filter(c=>c.kind==='damage').length,0,'shared event captions cannot replay the damage cue');
  assert.ok(Object.values(app.renderer.lastRender.options.combatKick).some(n=>Math.abs(n)>0));
  assert.equal(app.controls.active,true);assert.equal(app.screen,'flight');
  frame(120);assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,1);
});

test('actual guest UI handles addressed damage snapshots and clears feedback on respawn',async t=>{
  const {app,document,frame}=await appFixture(t),start=begin(app,{guest:true});
  const host=new FlightSimulation(createArenaMission(start.config,'f16'),{playerId:'lead'});
  host.configureMultiplayer({...start,playerId:'lead'});host.time=5;
  app.team.callbacks.onWorld(host.getSnapshot());frame(17);
  host._damageParticipant(host.localParticipant,12,'wing','gun');app.team.callbacks.onWorld(host.getSnapshot());frame(17);
  assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,0);
  const guest=host.participants.get('wing');host._damageParticipant(guest,20,'lead','missile',host.player);
  const snapshot=host.getSnapshot();app.team.callbacks.onWorld(snapshot);frame(17);
  assert.equal(document.getElementById('damage-title').textContent,'MISSILE HIT');
  assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,1);
  app.team.callbacks.onWorld(snapshot);frame(17);assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,1);
  host._damageParticipant(guest,10000,'lead','missile',host.player);app.team.callbacks.onWorld(host.getSnapshot());frame(17);
  assert.equal(document.getElementById('damage-title').textContent,'AIRCRAFT DESTROYED');
  assert.equal(app.audio.active,true,'destruction must remain audible during the spectator transition');
  host.time=guest.respawnAt+.1;host.requestRespawn('wing');app.team.callbacks.onWorld(host.getSnapshot());frame(17);
  assert.equal(document.getElementById('damage-notice').hidden,true);
  assert.ok(Object.values(app.renderer.lastRender.options.combatKick).every(n=>n===0));
});

test('AC130 gunner receives shared-aircraft damage despite having a different room identity',async t=>{
  const {app,document,frame}=await appFixture(t);begin(app,{guest:true,crew:true});
  const host=new FlightSimulation(getMission('gunship-nightwatch'),{playerId:'lead'});
  host.time=1;host._damagePlayer(18,'flak',{x:host.player.x+50,y:host.player.y,z:host.player.z});
  app.team.callbacks.onWorld(host.getSnapshot());frame(17);
  assert.equal(app.team.id,'wing');assert.equal(app.sim.player.id,'lead');
  assert.equal(document.getElementById('damage-title').textContent,'FLAK HIT');
  assert.equal(app.audio.cues.filter(c=>c.kind==='hit').length,1);
  assert.equal(app.renderer.lastRender.options.camera,'gunner');
});

test('fatal solo damage shows and animates destruction before debrief without advancing ended physics',async t=>{
  const {app,document,frame}=await appFixture(t);
  app.startMission(getMission('first-light'));
  const sim=app.sim;assert.ok(sim);
  sim._damagePlayer(10000,'missile',{x:sim.player.x-20,y:sim.player.y,z:sim.player.z});frame(17);
  assert.equal(sim.status,'failed');assert.equal(app.screen,'flight');
  assert.equal(document.getElementById('damage-title').textContent,'AIRCRAFT DESTROYED');
  assert.equal(app.audio.active,true);assert.equal(app.controls.active,false);
  const endedTime=sim.time;frame(600);assert.equal(app.screen,'flight');assert.equal(sim.time,endedTime);
  frame(700);assert.equal(app.screen,'debrief');assert.equal(sim.time,endedTime);
});
