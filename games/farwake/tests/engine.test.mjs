import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, buildGalaxy, distance } from '../dist/engine.mjs';
import { ENCOUNTERS, STORY_CHAPTERS } from '../dist/content.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const frame = (g, input = {}, count = 1) => { for (let i = 0; i < count; i++) g.step(1 / 60, input); };
function atBody(g, id) {
  const body = g.system.bodies.find(b => b.id === id);
  assert.ok(body, `Missing body ${id}`);
  Object.assign(g.state.ship, { x: body.x, y: body.y + body.radius + 80, vx: 0, vy: 0 });
  return body;
}
function land(g, id) { atBody(g, id); return ok(g.dock(id)); }
function paidShift(g, tokenPrefix = '') {
  const job = g.availableJobs().find(j => j.type === 'work' && j.status === 'available');
  assert.ok(job, 'Available work contract'); ok(g.acceptJob(job.id));
  for (let i = 0; i < 3; i++) ok(g.recordActivity('work', { token: `${tokenPrefix}panel-${i}` }));
  ok(g.turnInJob(job.id)); return job.id;
}
function mineOre(g, oreTarget) {
  let attempts = 0;
  while (g.state.stats.oreMined < oreTarget && attempts++ < 90) {
    const rock = g.system.asteroids.filter(a => a.hp > 0).sort((a,b) => distance(a,g.state.ship)-distance(b,g.state.ship))[0];
    assert.ok(rock, 'Available ore');
    Object.assign(g.state.ship, { x:rock.x, y:rock.y, vx:0, vy:0 });
    for (let i = 0; i < 240 && rock.hp > 0; i++) frame(g,{mine:true,brake:true});
  }
  assert.ok(g.state.stats.oreMined >= oreTarget, 'Actual mining must reach the required amount');
}
function route(g, destination, range = g.state.ship.warpRange) {
  const queue = [g.state.systemId], previous = new Map([[g.state.systemId,null]]);
  for (let i = 0; i < queue.length && !previous.has(destination); i++) {
    const a = g.galaxy.find(s => s.id === queue[i]);
    for (const b of g.galaxy) {
      if (!previous.has(b.id) && Math.hypot(a.gx-b.gx,a.gy-b.gy) <= range) { previous.set(b.id,a.id); queue.push(b.id); }
    }
  }
  assert.ok(previous.has(destination), `${destination} reachable`);
  const path = []; for (let id = destination; previous.get(id) !== null; id = previous.get(id)) path.unshift(id);
  return path;
}
function jumpRoute(g,destination) {
  if(g.state.mode==='person') ok(g.launch());
  for(const id of route(g,destination)) {
    if(g.state.pendingEncounter) ok(g.dismissEncounter());
    let quote=g.travelInfo(id);
    if(!quote.ok && quote.code==='fuel') {
      const port=g.system.bodies.find(b=>b.kind==='station')||g.system.bodies[0];
      land(g,port.id);
      if(g.state.credits<g.serviceQuote('refuel').cost) paidShift(g);
      ok(g.service('refuel')); ok(g.launch());
    }
    ok(g.travel(id));
  }
}
function earnFirstDrive(g) {
  land(g,'kettle');
  assert.equal(g.state.completedChapters.length,0,'Docking alone earns no chapter');
  ok(g.recordActivity('talk',{role:'mechanic',token:'iona'}));
  paidShift(g);
  assert.ok(g.hasFlag('first_shift_done'));
  const parcel=g.availableJobs().find(j=>j.type==='delivery');ok(g.acceptJob(parcel.id));
  ok(g.launch());mineOre(g,6);
  const signal=g.system.signals.find(s=>s.story);
  Object.assign(g.state.ship,{x:signal.x,y:signal.y,vx:0,vy:0});
  ok(g.scan(signal.id));assert.ok(g.hasFlag('belt_signal_found'));
  land(g,parcel.targetBody);ok(g.turnInJob(parcel.id));ok(g.launch());land(g,'kettle');
  for(const id of ['thrusters_1','scanner_1','fold_1']) ok(g.buyUpgrade(id));
  assert.ok(g.hasHyperdrive);assert.equal(g.state.ship.warpRange,5);
}

test('900 deterministic systems are connected with first and final drive ranges',()=>{
  for(const seed of ['farwake','captain-2','phoenix','solstice','a','quiet-7']) {
    const a=buildGalaxy(seed),b=buildGalaxy(seed);
    assert.equal(a.length,900);assert.deepEqual(a,b);assert.equal(new Set(a.map(s=>s.id)).size,900);
    const g=new Game(seed);
    for(const range of [5,15]) for(const destination of ['sol','witness','sector-0','sector-287']) assert.ok(route(g,destination,range).length>0);
    const reachable=new Set(['hearth']);const queue=['hearth'];
    for(let i=0;i<queue.length;i++){const from=a.find(s=>s.id===queue[i]);for(const to of a)if(!reachable.has(to.id)&&Math.hypot(from.gx-to.gx,from.gy-to.gy)<=5){reachable.add(to.id);queue.push(to.id);}}
    assert.equal(reachable.size,900,`No isolated stars for ${seed}`);
  }
  assert.notDeepEqual(buildGalaxy('a'),buildGalaxy('b'));
});

test('dock, departure, jobs, upgrades and services enforce person/ship mode and proximity',()=>{
  const g=new Game('gates');assert.equal(g.interact().id,'kettle');
  assert.equal(g.buyUpgrade('thrusters_1').code,'mode');assert.equal(g.service('refuel').code,'mode');assert.equal(g.acceptJob('fake').code,'mode');
  assert.equal(g.travel('vesper').code,'hyperdrive');
  assert.equal(g.dock('morrow').code,'distance');
  ok(g.dock('kettle'));assert.equal(g.state.mode,'person');assert.equal(g.currentBody.id,'kettle');
  assert.equal(g.travel('vesper').code,'mode');assert.equal(g.scan('anything').code,'mode');
  assert.equal(g.dock('kettle').code,'mode');ok(g.launch());assert.equal(g.state.locationId,null);
});

test('contracts count unique work, require their destination, and never pay twice',()=>{
  const g=new Game('contracts');land(g,'kettle');
  const work=g.availableJobs().find(j=>j.type==='work');ok(g.acceptJob(work.id));
  const before=g.state.credits;
  assert.equal(g.acceptJob(work.id).code,'duplicate');
  for(let i=0;i<8;i++)g.recordActivity('work',{token:'same-panel'});
  assert.equal(g.state.missions.find(m=>m.id===work.id).progress,1);assert.equal(g.turnInJob(work.id).ok,false);
  g.recordActivity('work',{token:'second'});g.recordActivity('work',{token:'third'});
  ok(g.launch());assert.equal(g.turnInJob(work.id).code,'mode');land(g,'morrow');assert.equal(g.turnInJob(work.id).code,'location');
  ok(g.launch());land(g,'kettle');ok(g.turnInJob(work.id));assert.equal(g.state.credits,before+work.reward);
  const paid=g.state.credits;assert.equal(g.turnInJob(work.id).ok,false);assert.equal(g.state.credits,paid);
  const r=Game.fromSave(g.serialize());assert.equal(r.turnInJob(work.id).ok,false);assert.equal(r.state.credits,paid);
});

test('board epoch allows a completed station to offer new work and UI-scoped tokens remain detectable',()=>{
  const g=new Game('repeat-work');land(g,'kettle');const firstId=paidShift(g);
  g.state.stats.jobs=4; // Advance only the board fixture; mechanics below use public methods.
  const job=g.availableJobs().find(j=>j.type==='work');assert.notEqual(job.id,firstId);ok(g.acceptJob(job.id));
  const token=`panel-0:${job.id}`;
  const r=g.recordActivity('work',{token});assert.equal(r.first,true);
  assert.ok(g.state.activityTokens.some(t=>t.endsWith(':work:'+token)));
  assert.equal(g.recordActivity('work',{token}).first,false);
  for(const i of [1,2])ok(g.recordActivity('work',{token:`panel-${i}`}));
  ok(g.turnInJob(job.id));
});

test('abandoning and reaccepting a partial maintenance contract preserves work without reopening paid panels',()=>{
  const g=new Game('resume-contract');land(g,'kettle');
  const job=g.availableJobs().find(j=>j.type==='work');ok(g.acceptJob(job.id));
  const token=i=>`kettle:panel-${i}:${job.id}`;
  assert.equal(ok(g.recordActivity('work',{token:token(0),kind:'repair'})).first,true);
  assert.equal(g.state.missions.find(m=>m.id===job.id).progress,1);
  ok(g.abandonJob(job.id));assert.equal(g.state.missions.some(m=>m.id===job.id),false);
  const restored=Game.fromSave(g.serialize());ok(restored.acceptJob(job.id));
  assert.equal(restored.state.missions.find(m=>m.id===job.id).progress,1);
  assert.equal(ok(restored.recordActivity('work',{token:token(0),kind:'repair'})).first,false);
  for(const i of [1,2])assert.equal(ok(restored.recordActivity('work',{token:token(i),kind:'repair'})).first,true);
  assert.equal(restored.state.missions.find(m=>m.id===job.id).progress,3);
  assert.equal(restored.state.missions.find(m=>m.id===job.id).status,'ready');
  const credits=restored.state.credits;ok(restored.turnInJob(job.id));assert.equal(restored.state.credits,credits+job.reward);
  assert.equal(restored.turnInJob(job.id).ok,false);assert.equal(restored.state.credits,credits+job.reward);
});

test('mining, partial deposits, defeated hostiles and salvage survive saving',()=>{
  const g=new Game('persistent-world');const rock=g.system.asteroids[0];
  Object.assign(g.state.ship,{x:rock.x,y:rock.y,vx:0,vy:0});frame(g,{mine:true},10);
  assert.ok(rock.hp>0&&rock.hp<rock.maxHp);
  const partial=Game.fromSave(g.serialize());assert.equal(partial.system.asteroids[0].hp,rock.hp);
  frame(g,{mine:true},180);assert.equal(rock.hp,0);assert.ok(g.state.cargo.ore>0);
  const id=rock.id,ore=g.state.cargo.ore;
  const restored=Game.fromSave(g.serialize());assert.equal(restored.system.asteroids.find(a=>a.id===id).hp,0);assert.equal(restored.state.cargo.ore,ore);
  const e=g.system.enemies[0];Object.assign(e,{x:100,y:200,hp:16,speed:0,cooldown:999,active:true});
  Object.assign(g.state.ship,{x:0,y:200,vx:0,vy:0,angle:0});frame(g,{fire:true,brake:true},30);
  assert.equal(g.state.stats.kills,1);assert.ok(!g.system.enemies.some(x=>x.id===e.id));
  const afterKill=Game.fromSave(g.serialize());assert.ok(!afterKill.system.enemies.some(x=>x.id===e.id));
  const loot=afterKill.system.pickups.find(p=>p.id===e.id+':wreck');assert.ok(loot);
  Object.assign(afterKill.state.ship,{x:loot.x,y:loot.y});const credit=afterKill.state.credits;ok(afterKill.salvage(loot.id));assert.ok(afterKill.state.credits>credit);
  const credit2=afterKill.state.credits;assert.equal(afterKill.salvage(loot.id).ok,false);assert.equal(afterKill.state.credits,credit2);
  assert.ok(!Game.fromSave(afterKill.serialize()).system.pickups.some(p=>p.id===loot.id));
});

test('full holds leave spill salvage and extraction upgrades change mining rate',()=>{
  const base=new Game('mining-rate'),up=new Game('mining-rate');
  up.state.upgrades.miner_1=1;up._updateStats();
  for(const g of [base,up]){const a=g.system.asteroids[0];Object.assign(g.state.ship,{x:a.x,y:a.y,vx:0,vy:0});frame(g,{mine:true},10);}
  const loss1=base.system.asteroids[0].maxHp-base.system.asteroids[0].hp,loss2=up.system.asteroids[0].maxHp-up.system.asteroids[0].hp;
  assert.ok(Math.abs(loss2/loss1-1.6)<0.001);
  const g=new Game('spill'),a=g.system.asteroids[0];a.ore=3;a.crystal=1;g.state.cargo.ore=g.state.ship.cargoCap-1;Object.assign(g.state.ship,{x:a.x,y:a.y,vx:0,vy:0});frame(g,{mine:true},180);
  assert.equal(g.cargoUsed,g.state.ship.cargoCap);const spill=g.system.pickups.find(p=>p.id===a.id+':spill');assert.ok(spill);assert.equal(spill.ore+spill.crystal,3);
  assert.equal(g.salvage(spill.id).code,'cargo');assert.equal(g.cargoUsed,g.state.ship.cargoCap);
});

test('first drive prerequisites and story gate cannot be bought around; range tiers are 5,9,15',()=>{
  const g=new Game('upgrades');land(g,'kettle');g.state.credits=5000;g.state.cargo.ore=200;
  assert.equal(g.buyUpgrade('fold_1').code,'prerequisite');
  ok(g.buyUpgrade('thrusters_1'));ok(g.buyUpgrade('scanner_1'));
  assert.equal(g.buyUpgrade('fold_1').code,'story');g.state.flags.push('belt_signal_found');
  const cr=g.state.credits;ok(g.buyUpgrade('fold_1'));assert.equal(g.state.credits,cr-320);assert.equal(g.state.ship.warpRange,5);
  assert.equal(g.buyUpgrade('fold_1').code,'owned');ok(g.buyUpgrade('fold_2'));assert.equal(g.state.ship.warpRange,9);ok(g.buyUpgrade('fold_3'));assert.equal(g.state.ship.warpRange,15);
  const saved=Game.fromSave(g.serialize());assert.equal(saved.state.ship.warpRange,15);
  g.state.credits=0;g.state.cargo.ore=0;assert.equal(g.buyUpgrade('hull_1').code,'cost');assert.equal(g.state.credits,0);assert.equal(g.state.cargo.ore,0);
});

test('credit and fuel costs, service recovery and commodity sales cannot duplicate value',()=>{
  const g=new Game('economy');land(g,'kettle');g.state.credits=0;g.state.ship.fuel=0;g.state.ship.hull=20;
  assert.equal(g.service('refuel').ok,false);assert.equal(g.state.credits,0);ok(g.service('emergency'));assert.equal(g.state.ship.fuel,12);assert.ok(g.state.ship.hull>=50);
  const rep=g.state.rep.freewake;assert.equal(g.service('emergency').ok,false);assert.equal(g.state.rep.freewake,rep);
  g.state.cargo.ore=6;g.state.cargo.crystal=2;const value=g.serviceQuote('sell').value;ok(g.service('sell'));assert.equal(g.state.credits,value);assert.equal(g.cargoUsed,0);
  assert.equal(g.service('sell').ok,false);assert.equal(g.state.credits,value);
  g.state.ship.hull=25;g.state.credits=200;const q=g.serviceQuote('repair');ok(g.service('repair'));assert.equal(g.state.credits,200-q.cost);assert.equal(g.state.ship.hull,g.state.ship.maxHull);
  assert.equal(g.service('repair').ok,false);assert.equal(g.state.credits,200-q.cost);
  g.state.ship.fuel=0;assert.equal(g.conditionsMet({fuel:1}),false);
});

test('encounter costs and authored choices are one-shot and conditional consequences persist',()=>{
  const g=new Game('choices');land(g,'morrow');
  const event=ENCOUNTERS.find(e=>e.id==='water_line');assert.ok(event);ok(g.triggerEncounter(event.id));
  const costly=event.choices.find(c=>(c.effects?.ore||0)<0 || (c.conditions?.ore||0)>0);
  assert.ok(costly);g.state.cargo.ore=0;assert.equal(g.choiceAvailable(event.id,costly.id),false);assert.equal(g.applyChoice(event.id,costly.id).ok,false);
  g.state.cargo.ore=10;ok(g.applyChoice(event.id,costly.id));const snapshot=g.serialize();
  assert.equal(g.applyChoice(event.id,costly.id).ok,false);assert.equal(g.triggerEncounter(event.id).ok,false);
  const reloaded=Game.fromSave(snapshot);assert.ok(reloaded.state.encounterHistory.includes(event.id));assert.equal(reloaded.triggerEncounter(event.id).ok,false);
  assert.ok(reloaded.hasFlag('water_repaired')||reloaded.hasFlag('water_supplied'));
});

test('cabin and derelict sessions restore the exact ship position and velocity after reload',()=>{
  const g=new Game('interior');Object.assign(g.state.ship,{x:520,y:-700,vx:37.25,vy:-41.5,angle:1.75});
  const expected=Object.fromEntries(['x','y','vx','vy','angle'].map(k=>[k,g.state.ship[k]]));
  ok(g.enterCabin());assert.equal(g.state.mode,'person');assert.equal(g.currentBody.kind,'ship');
  assert.equal(g.buyUpgrade('hull_1').code,'mode');assert.equal(g.service('repair').code,'mode');assert.equal(g.recruitCrew('engineer').code,'mode');assert.equal(g.acceptJob('anything').code,'mode');
  const resumed=Game.fromSave(g.serialize());assert.equal(resumed.currentBody.kind,'ship');ok(resumed.exitCabin());
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,resumed.state.ship[k]])),expected);assert.equal(resumed.state.locationId,null);
  const signal=resumed.system.signals.find(s=>s.kind==='derelict');Object.assign(resumed.state.ship,{x:signal.x,y:signal.y,vx:-2,vy:9});
  ok(resumed.boardDerelict(signal.id));assert.equal(resumed.currentBody.kind,'derelict');assert.equal(resumed.service('refuel').code,'mode');
  const again=Game.fromSave(resumed.serialize());ok(again.launch());assert.equal(again.state.ship.x,signal.x);assert.equal(again.state.ship.y,signal.y);assert.equal(again.state.ship.vx,-2);assert.equal(again.state.ship.vy,9);
});

test('crew recruit once in person and bonuses survive saves',()=>{
  const g=new Game('crew');assert.equal(g.recruitCrew('engineer').code,'mode');land(g,'kettle');g.state.credits=600;
  for(const [role,cost] of [['engineer',160],['navigator',140],['medic',150]]){const before=g.state.credits;ok(g.recruitCrew(role,{id:role,name:'Crew '+role,cost}));assert.equal(g.state.credits,before-cost);assert.equal(g.recruitCrew(role).code,'duplicate');}
  const saved=Game.fromSave(g.serialize());assert.equal(saved.state.crew.length,3);assert.equal(saved.state.ship.maxHull,110);assert.equal(saved.state.ship.scanRange,280);assert.equal(saved.state.ship.maxEnergy,110);
});

test('flight assist toggles inertia, braking works, energy and hull stay bounded',()=>{
  const assisted=new Game('flight'),unassisted=new Game('flight');
  for(const g of [assisted,unassisted])Object.assign(g.state.ship,{x:1000,y:1000,vx:100,vy:0});
  frame(assisted,{},60);frame(unassisted,{flightAssist:false},60);
  assert.ok(unassisted.state.ship.vx>assisted.state.ship.vx*3);const speed=unassisted.state.ship.vx;frame(unassisted,{brake:true},60);assert.ok(unassisted.state.ship.vx<speed*.02);
  frame(assisted,{x:1,y:1,boost:true,fire:true},1200);assert.ok(Number.isFinite(assisted.state.ship.x));assert.ok(assisted.state.ship.energy>=0);assert.ok(assisted.state.ship.hull>0);
});

test('survey and bounty contracts count actions in their own system',()=>{
  const g=new Game('local-contracts');land(g,'kettle');const job=g.availableJobs().find(j=>j.type==='survey');ok(g.acceptJob(job.id));
  g.state.mode='ship';g.state.locationId=null;g.state.upgrades.fold_3=1;g._updateStats();ok(g.travel('vesper'));
  g.progressJob('survey',1,{token:'other-star'});assert.equal(g.state.missions[0].progress,0);
  g.state.stats.scans=9;g._refreshJobs();assert.equal(g.state.missions[0].progress,0);
  ok(g.travel('hearth'));g.progressJob('survey',1,{token:'local'});assert.equal(g.state.missions[0].progress,1);g.progressJob('survey',1,{token:'local'});assert.equal(g.state.missions[0].progress,1);
});

test('freight and field samples are person activities with persistent tokens, separate from repair and signal contracts',()=>{
  const g=new Game('distinct-activities');
  for(const type of ['freight','sample'])assert.equal(g.recordActivity(type,{token:'invalid-ship-activity'}).code,'mode');
  land(g,'kettle');
  const work=g.availableJobs().find(j=>j.type==='work'),survey=g.availableJobs().find(j=>j.type==='survey');
  ok(g.acceptJob(work.id));ok(g.acceptJob(survey.id));
  for(const [type,kind] of [['freight','cargo'],['sample','sample']]){
    assert.equal(ok(g.recordActivity(type,{token:type+'-1',kind})).first,true);
    assert.equal(ok(g.recordActivity(type,{token:type+'-1',kind})).first,false);
  }
  ok(g.recordActivity('explore',{token:'local-terminal'}));
  assert.equal(g.state.missions.find(m=>m.id===work.id).progress,0);
  assert.equal(g.state.missions.find(m=>m.id===survey.id).progress,0);
  assert.equal(g.state.stats.work,0);
  const restored=Game.fromSave(g.serialize());
  for(const type of ['freight','sample'])assert.equal(ok(restored.recordActivity(type,{token:type+'-1'})).first,false);
  ok(restored.recordActivity('work',{token:'calibrated-panel',kind:'repair'}));
  assert.equal(restored.state.missions.find(m=>m.id===work.id).progress,1);
  ok(restored.launch());
  const signal=restored.system.signals.find(s=>!s.story);
  Object.assign(restored.state.ship,{x:signal.x,y:signal.y,vx:0,vy:0});ok(restored.scan(signal.id));
  assert.equal(restored.state.missions.find(m=>m.id===survey.id).progress,1);
});

test('Listening freight cannot unlock the archive; a calibrated relay still requires the authored decision',()=>{
  const g=new Game('archive-freight');earnFirstDrive(g);jumpRoute(g,'vesper');land(g,'listening');
  assert.equal(g.state.completedChapters.length,3);
  // The previous freight call omitted repair metadata. It must not satisfy the story gate.
  assert.equal(ok(g.recordActivity('work',{token:'listening:delivery:cargo'})).first,true);
  assert.equal(g.hasFlag('archive_terminal_repaired'),false);
  assert.equal(g.triggerEncounter('listening_archive').ok,false);
  assert.equal(g.storyAction('archive').ok,false);
  const restored=Game.fromSave(g.serialize());
  assert.equal(restored.hasFlag('archive_terminal_repaired'),false);
  assert.equal(restored.triggerEncounter('listening_archive').ok,false);
  ok(restored.recordActivity('work',{token:'listening:relay-0',role:'archive',kind:'repair'}));
  assert.equal(restored.hasFlag('archive_terminal_repaired'),true);
  assert.equal(restored.state.completedChapters.length,3);
  ok(restored.triggerEncounter('listening_archive'));ok(restored.applyChoice('listening_archive','public'));
  assert.equal(restored.state.completedChapters.length,4);
});

test('all eight chapters are earned through mining, jobs, travel, repairs and actual authored decisions',()=>{
  const g=new Game('full-story');earnFirstDrive(g);assert.equal(g.state.completedChapters.length,2);assert.ok(g.state.credits>=0);assert.ok(g.state.cargo.ore>=0);
  jumpRoute(g,'vesper');assert.equal(g.state.completedChapters.length,3);land(g,'listening');assert.equal(g.state.completedChapters.length,3,'Entering the archive is not a repair or a decision');
  assert.equal(g.triggerEncounter('listening_archive').ok,false);ok(g.recordActivity('work',{token:'relay-archive',role:'archive',kind:'repair'}));
  assert.equal(g.state.completedChapters.length,3,'A repaired machine still requires its conversation');ok(g.triggerEncounter('listening_archive'));ok(g.applyChoice('listening_archive','public'));assert.equal(g.state.completedChapters.length,4);
  jumpRoute(g,'meridian');land(g,'ledger');assert.equal(g.state.completedChapters.length,4,'Arrival does not choose an ally');ok(g.triggerEncounter('ledger_alliance'));ok(g.applyChoice('ledger_alliance','freewake'));assert.equal(g.state.completedChapters.length,5);assert.equal(g.state.alliance,'freewake');
  jumpRoute(g,'witness');land(g,'stillwater');assert.equal(g.state.completedChapters.length,5);ok(g.triggerEncounter('buried_weather'));ok(g.applyChoice('buried_weather','mark'));assert.equal(g.state.completedChapters.length,6);
  jumpRoute(g,'sol');assert.equal(g.state.pendingEncounter?.id,'earth_arrival');assert.equal(g.state.completedChapters.length,6,'Jumping to Sol does not give landing permission');ok(g.applyChoice('earth_arrival','neighbor'));assert.equal(g.state.completedChapters.length,6);land(g,'earth');assert.equal(g.state.completedChapters.length,7);
  ok(g.triggerEncounter('earth_council'));ok(g.applyChoice('earth_council','open'));assert.equal(g.state.completedChapters.length,8);assert.equal(g.chapter,null);assert.ok(g.hasFlag('earth_decision'));assert.ok(g.state.earthChoice);
  assert.deepEqual(g.state.completedChapters,STORY_CHAPTERS.map(c=>c.id));const credits=g.state.credits;
  const restored=Game.fromSave(g.serialize());frame(restored,{},10);assert.equal(restored.state.credits,credits);assert.equal(restored.state.completedChapters.length,8);assert.equal(restored.triggerEncounter('earth_council').ok,false);
});


test('Earth remains quarantined until the Witness approach and arrival decision, with a dismissed hail recoverable',()=>{
  const g=new Game('quarantine');g.state.systemId='sol';g._loadSystem('sol');atBody(g,'earth');
  assert.equal(g.dock('earth').code,'quarantine');assert.equal(g.state.mode,'ship');assert.ok(!g.hasFlag('landed_earth'));
  g.state.flags.push('vault_recovered','homeward_signal');
  assert.equal(g.dock('earth').code,'permission');assert.equal(g.state.pendingEncounter.id,'earth_arrival');
  g.dismissEncounter();assert.equal(g.state.pendingEncounter,null);
  assert.equal(g.dock('earth').code,'permission');assert.equal(g.state.pendingEncounter.id,'earth_arrival');
  ok(g.applyChoice('earth_arrival','neighbor'));ok(g.dock('earth'));assert.ok(g.hasFlag('landed_earth'));
});

test('fast projectiles hit targets crossed between frames',()=>{
  const g=new Game('swept-pulse'),enemy=g.system.enemies[0];
  Object.assign(enemy,{x:50,y:0,hp:16,speed:0,cooldown:999,radius:8});
  Object.assign(g.state.ship,{x:0,y:0,vx:0,vy:0,angle:0});
  g.step(.1,{fire:true,brake:true});assert.equal(g.state.stats.kills,1);
  assert.ok(g._record().defeated.includes(enemy.id));
});
