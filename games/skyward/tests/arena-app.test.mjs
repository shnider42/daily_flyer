import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from './helpers/app-fixture.mjs';
import {FlightSimulation} from '../public/sim.mjs';
import {createArenaMission} from '../public/arena.mjs';
import {scoreboardMarkup,chooseSpectator,formatKD,formatRoundTime} from '../public/multiplayer-ui.mjs';

function begin(app,{mode='dogfight',lives=3,host=true,missionId='arena-canyon'}={}){
  const team=app.team,players=[{id:'lead',name:'Flight lead',aircraft:'f16',startMode:'airborne',connected:true,ready:true},{id:'wing',name:'Canvas pilot',aircraft:'camel',startMode:'airborne',connected:true,ready:true}];
  const config={mode,mapId:'canyon',durationSeconds:300,lives};
  Object.assign(team,{code:'ABC234',id:host?'lead':'wing',hostId:'lead',isHost:host,connected:true,mode,config,role:'pilot',roomState:'flying',missionId,roster:players});
  const start={missionId,mode,config,players,hostId:'lead',runId:'run-one',seed:1,role:'pilot'};
  team.callbacks.onStart(start);
  return start;
}

test('host death keeps the actual mission frame loop running and follows a surviving pilot',async t=>{
  const {app,document,frame}=await appFixture(t);begin(app,{mode:'squadron',missionId:'first-light',lives:1});
  assert.equal(app.sim.player.aircraft,'f16');assert.equal(app.sim.participants.get('wing').aircraft,'camel');
  const source=app.sim.player;source.health=0;source.crashed=true;frame(120);
  assert.equal(app.screen,'flight');assert.equal(app.sim.status,'flying');assert.equal(app.team.connected,true);
  assert.equal(app.sim.localParticipant.deaths,1);assert.equal(app.sim.localParticipant.livesRemaining,0);
  assert.equal(document.getElementById('spectator-panel').hidden,false);assert.equal(document.getElementById('respawn-button').hidden,true);
  assert.equal(app.renderer.lastRender.options.playerId,'wing');assert.equal(app.renderer.lastRender.options.player.aircraft,'camel');
  assert.equal(app.sim.player,source,'spectator camera must not replace authoritative local aircraft');assert.equal(app.controls.active,false);
  const before=app.sim.time;document.getElementById('pause-button').onclick();frame(120);
  assert.ok(app.sim.time>before,'opening settings while spectating cannot stop the host world');
  assert.equal(app.team.worlds.at(-1).teamPaused,false);
});

test('dogfight host can respawn, keeps score, and does not pause the round from the menu',async t=>{
  const {app,document,frame}=await appFixture(t);begin(app);
  document.getElementById('pause-button').onclick();const before=app.sim.time;frame(120);
  assert.ok(app.sim.time>before);assert.equal(app.team.worlds.at(-1).teamPaused,false);
  document.getElementById('resume-button').onclick();app.sim.player.health=0;app.sim.player.crashed=true;frame(120);
  const oldLife=app.sim.player.lifeId;assert.equal(app.sim.localParticipant.deaths,1);
  assert.equal(document.getElementById('respawn-button').disabled,true);
  app.sim.time=app.sim.localParticipant.respawnAt+.1;frame(120);
  assert.equal(document.getElementById('respawn-button').disabled,false);document.getElementById('respawn-button').onclick();frame(120);
  assert.equal(app.sim.player.lifeId,oldLife+1);assert.equal(app.sim.localParticipant.deaths,1);
  assert.equal(app.controls.active,true);assert.equal(document.getElementById('spectator-panel').hidden,true);
  assert.equal(app.controls.throttleValue,app.sim.player.throttle);
  assert.equal(app.team.worlds.at(-1).participants.find(p=>p.id==='lead').lifeId,2);
});

test('guest reports a crash, waits for authoritative respawn, and snaps camera to the new life',async t=>{
  const {app,document,frame}=await appFixture(t),start=begin(app,{host:false});
  const host=new FlightSimulation(createArenaMission(start.config,'f16'),{playerId:'lead'});host.configureMultiplayer({...start,playerId:'lead'});
  app.team.callbacks.onWorld(host.getSnapshot());app.sim.player.health=0;app.sim.player.crashed=true;frame(120);
  assert.equal(app.screen,'flight');assert.equal(app.team.actions.at(-1).name,'crash');assert.equal(app.team.actions.at(-1).lifeId,1);
  const guest=host.participants.get('wing');host._damageParticipant(guest,10000,'lead','test projectile');
  app.team.callbacks.onWorld(host.getSnapshot());assert.equal(app.sim.localParticipant.alive,false);
  host.time=guest.respawnAt+.1;app.team.callbacks.onWorld(host.getSnapshot());frame(120);
  document.getElementById('respawn-button').onclick();assert.equal(app.team.actions.at(-1).name,'respawn');assert.equal(app.sim.player.lifeId,1);
  host.requestRespawn('wing');app.team.callbacks.onWorld(host.getSnapshot());frame(120);
  assert.equal(app.sim.player.lifeId,2);assert.equal(app.sim.localParticipant.deaths,1);assert.equal(!!app.sim.player.crashed,false);
  assert.equal(app.controls.active,true);assert.equal(app.renderer.lastRender.options.playerId,undefined);
});

test('round expiry shows final K/D and returns the same squadron to its configurable room',async t=>{
  const {app,document,frame}=await appFixture(t);begin(app);
  app.sim.localParticipant.kills=2;app.sim.localParticipant.deaths=1;frame(300000);
  assert.equal(app.screen,'debrief');assert.equal(app.sim.round.ended,true);
  assert.equal(document.getElementById('debrief-scoreboard').hidden,false);
  assert.match(document.getElementById('debrief-scoreboard').innerHTML,/2\.00/);
  assert.match(document.getElementById('retry-mission').textContent,/with squadron/);
  document.getElementById('debrief-room').onclick();assert.equal(app.team.lobbyRequested,true);
  app.team.roomState='lobby';app.team.callbacks.onLobby({});
  assert.equal(app.screen,'squadron');assert.equal(app.sim,null);assert.equal(app.team.code,'ABC234');
  assert.equal(document.getElementById('room-aircraft').disabled,false);
});

test('scoreboard and spectator selection handle zero deaths, disconnected aircraft and escaped callsigns',()=>{
  assert.equal(formatKD(0,0),'—');assert.equal(formatKD(5,2),'2.50');assert.equal(formatRoundTime(59.1),'1:00');
  const players=[{id:'one',name:'<img onerror=1>',aircraft:'f16',kills:3,deaths:0,alive:false},{id:'two',name:'Wing',aircraft:'camel',kills:1,deaths:2,alive:true,connected:true,health:90},{id:'three',name:'Gone',aircraft:'b17',kills:2,deaths:1,connected:false,health:100}];
  const html=scoreboardMarkup(players,'one');assert.ok(!html.includes('<img'));assert.match(html,/&lt;img onerror=1&gt;/);assert.match(html,/0\.50/);
  assert.equal(chooseSpectator(players,'one',null).id,'two');assert.equal(chooseSpectator(players,'one','two',1).id,'two');
  assert.equal(chooseSpectator(players,'two',null),null);
});
