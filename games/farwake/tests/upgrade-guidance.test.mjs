import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {UPGRADES} from '../dist/content.mjs';
import {foldDrivePlan,upgradeChecklist} from '../dist/upgrade-guidance.mjs';

const ok=result=>{assert.equal(result.ok,true,result.reason);return result;};
function dock(game,id='kettle'){
 const body=game.system.bodies.find(item=>item.id===id);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});
 ok(game.dock(id));
}
function paidShift(game){
 const job=game.availableJobs().find(item=>item.type==='work'&&item.status==='available');
 ok(game.acceptJob(job.id));
 for(let n=0;n<3;n++)ok(game.recordActivity('work',{token:`guide-panel-${n}`}));
 ok(game.turnInJob(job.id));
}
function calibrated(game){game.state.flags.push('first_shift_done','mined_six_ore','belt_signal_scanned','belt_signal_found');}

test('upgrade checklist exposes all unmet gates together and cannot spend or mark progress',()=>{
 const game=new Game('guide-every-gate');dock(game);game.state.credits=20;game.state.cargo.ore=1;
 const before=JSON.stringify({state:game.state,system:game.system});
 const checklist=upgradeChecklist(game,'fold_1');
 assert.equal(checklist.ready,false);assert.equal(checklist.eligible,game.upgradeInfo('fold_1').ok);
 assert.deepEqual(checklist.requirements.filter(row=>!row.complete).map(row=>row.id),['thrusters_1','scanner_1','story','credits','ore']);
 assert.match(checklist.requirements.find(row=>row.id==='credits').detail,/need 300 more/);
 assert.match(checklist.requirements.find(row=>row.id==='ore').detail,/need 7 more/);
 assert.equal(foldDrivePlan(game).nextStep.id,'meet-iona');
 assert.equal(JSON.stringify({state:game.state,system:game.system}),before);
});

test('the route follows a real paid job, real mining, and the actual beacon scan',()=>{
 const game=new Game('guide-real-route');dock(game);
 assert.equal(foldDrivePlan(game).nextStep.id,'meet-iona');
 ok(game.recordActivity('talk',{role:'mechanic',token:'iona'}));
 assert.equal(foldDrivePlan(game).nextStep.id,'first-job');
 paidShift(game);
 assert.equal(foldDrivePlan(game).nextStep.id,'mine-six');
 assert.ok(game.hasFlag('first_shift_done'));
 ok(game.launch());
 const signal=game.system.signals.find(item=>item.id==='hearth:story:tinbell');
 Object.assign(game.state.ship,{x:signal.x,y:signal.y});
 assert.equal(game.scan(signal.id).code,'story','Holding chapter reward ore does not replace mining it.');
 while(!game.hasFlag('mined_six_ore')){
  const rock=game.system.asteroids.find(item=>item.hp>0&&item.ore>0);assert.ok(rock);
  Object.assign(game.state.ship,{x:rock.x,y:rock.y,vx:0,vy:0});
  for(let n=0;n<500&&rock.hp>0;n++)game.step(1/60,{mine:true,brake:true});
 }
 assert.equal(foldDrivePlan(game).nextStep.id,'beacon');
 Object.assign(game.state.ship,{x:signal.x,y:signal.y,energy:game.state.ship.maxEnergy});
 ok(game.scan(signal.id));
 assert.ok(game.hasFlag('belt_signal_found'));
 const plan=foldDrivePlan(game);
 assert.ok(plan.steps.find(step=>step.id==='calibration').complete);
 assert.equal(plan.nextStep.id,'port');assert.equal(plan.nextStep.upgradeId,'thrusters_1');
 dock(game);
 assert.equal(foldDrivePlan(game).nextStep.id,'thrusters_1');
 ok(game.buyUpgrade('thrusters_1'));
 assert.deepEqual(foldDrivePlan(game).remainingCost,{credits:415,ore:10});
 assert.equal(foldDrivePlan(game).nextStep.id,'scanner_1');
 ok(game.buyUpgrade('scanner_1'));
 assert.deepEqual(foldDrivePlan(game).remainingCost,{credits:320,ore:8});
 assert.equal(foldDrivePlan(game).nextStep.id,'credits');
 assert.equal(foldDrivePlan(game).nextStep.upgradeId,'fold_1');
});

test('spending mined ore preserves the lesson but remaining purchase ore stays separate',()=>{
 const game=new Game('guide-spent-ore');dock(game);calibrated(game);
 game.state.stats.oreMined=9;game.state.cargo.ore=0;game.state.credits=1000;
 const plan=foldDrivePlan(game);
 assert.equal(plan.steps.find(step=>step.id==='mine-six').complete,true);
 assert.equal(plan.nextStep.id,'ore');assert.equal(plan.nextStep.upgradeId,'thrusters_1');
 assert.match(plan.nextStep.title,/2 more/);
 assert.deepEqual(plan.remainingCost,{credits:500,ore:12});
});

test('actual installation readiness requires port access as well as upgrade eligibility',()=>{
 const game=new Game('guide-readiness');calibrated(game);game.state.credits=2000;game.state.cargo.ore=30;
 game.state.upgrades={thrusters_1:1,scanner_1:1};
 assert.equal(game.upgradeInfo('fold_1').ok,true);
 assert.equal(upgradeChecklist(game,'fold_1').eligible,true);
 assert.equal(upgradeChecklist(game,'fold_1').ready,false);
 assert.equal(game.buyUpgrade('fold_1').code,'mode');
 dock(game);
 for(const upgrade of UPGRADES)assert.equal(upgradeChecklist(game,upgrade.id).ready,game.upgradeInfo(upgrade.id).ok,upgrade.id);
 assert.equal(foldDrivePlan(game).nextStep.id,'install');
 ok(game.buyUpgrade('fold_1'));
 const plan=foldDrivePlan(game);
 assert.equal(plan.installed,true);assert.equal(plan.ready,false);assert.equal(plan.nextStep,null);
 assert.deepEqual(plan.remainingCost,{credits:0,ore:0});
 assert.equal(upgradeChecklist(game,'fold_1').installed,true);
 assert.equal(upgradeChecklist(game,'fold_1').ready,false);
});

test('legacy prerequisite aliases follow the same gate as upgradeInfo',()=>{
 const game=new Game('guide-legacy');dock(game);calibrated(game);
 game.state.upgrades={'Thrusters-1':1,'SCANNER 1':1};game.state.credits=320;game.state.cargo.ore=8;
 const checklist=upgradeChecklist(game,'fold_1');
 assert.equal(checklist.ready,game.upgradeInfo('fold_1').ok);
 assert.ok(checklist.requirements.filter(item=>['thrusters_1','scanner_1'].includes(item.id)).every(item=>item.complete));
 assert.deepEqual(foldDrivePlan(game).remainingCost,{credits:320,ore:8});
 game.state.upgrades.oldHyperdrive=1;game.state.ship.warpRange=6;
 assert.equal(foldDrivePlan(game).installed,true);assert.equal(foldDrivePlan(game).nextStep,null);
});

test('paid work away from Kettle does not prematurely finish the opening chapter',()=>{
 const game=new Game('guide-first-chapter-location');dock(game,'morrow');
 ok(game.recordActivity('talk',{role:'mechanic',token:'local-mechanic'}));paidShift(game);
 assert.equal(game.hasFlag('first_shift_done'),false);
 assert.equal(foldDrivePlan(game).nextStep.id,'first-shift');
 assert.match(foldDrivePlan(game).nextStep.detail,/Kettle Station/);
});

test('shipless, borrowed, duty, and parked-elsewhere views never promise personal installation',()=>{
 const shipless=new Game('guide-no-ship',{startMode:'hardcore'});
 assert.equal(foldDrivePlan(shipless).nextStep.id,'own-ship');
 assert.equal(upgradeChecklist(shipless,'fold_1').ready,false);
 const borrowed=new Game('guide-borrowed');dock(borrowed);calibrated(borrowed);borrowed.state.credits=1000;borrowed.state.cargo.ore=20;
 borrowed.state.multiplayer={serverAuthoritative:true,ownedVesselId:'my-ship',portVesselId:'their-ship',aboardVesselId:null};
 borrowed.state.ship.id='their-ship';borrowed.state.upgrades={thrusters_1:1,scanner_1:1,fold_1:1};borrowed.state.ship.warpRange=5;
 const guestPlan=foldDrivePlan(borrowed);
 assert.equal(guestPlan.installed,false);assert.equal(guestPlan.ready,false);assert.equal(guestPlan.nextStep.id,'return-own-ship');
 assert.deepEqual(guestPlan.remainingCost,{credits:null,ore:null});
 assert.equal(upgradeChecklist(borrowed,'fold_1').installed,false);
 const duty=new Game('guide-duty');duty.state.npcContract={active:true,personal:{ship:{...duty.state.ship},upgrades:{thrusters_1:1},cargo:{ore:4}}};
 assert.equal(foldDrivePlan(duty).nextStep.id,'finish-duty');
 assert.deepEqual(foldDrivePlan(duty).remainingCost,{credits:415,ore:10});
 assert.equal(upgradeChecklist(duty,'fold_1').ready,false);
 const parked=new Game('guide-parked');dock(parked);calibrated(parked);parked.state.upgrades={thrusters_1:1,scanner_1:1};parked.state.credits=320;parked.state.cargo.ore=8;
 ok(parked.takePassengerTransit('morrow'));parked.state.credits=320;
 const plan=foldDrivePlan(parked);
 assert.equal(plan.ready,false);assert.equal(plan.nextStep.id,'return-own-ship');assert.match(plan.nextStep.detail,/Kettle/);
 parked.state.flags=parked.state.flags.filter(flag=>flag!=='mined_six_ore'&&flag!=='belt_signal_found');
 assert.equal(foldDrivePlan(parked).nextStep.id,'return-own-ship','Return to the actual vessel before suggesting mining from the wrong port.');
});

test('a full hold tells the player to make room before sending them mining again',()=>{
 const game=new Game('guide-full-hold');dock(game);game.state.flags.push('first_shift_done');
 game.state.cargo.crystal=game.state.ship.cargoCap;game.state.cargo.ore=0;
 const plan=foldDrivePlan(game,{device:'touch'});
 assert.equal(plan.nextStep.id,'port');assert.equal(plan.nextStep.resumeStep,'mine-six');
 assert.match(plan.nextStep.title,/Make room/);assert.match(plan.steps.find(step=>step.id==='mine-six').detail,/Tools and hold MINE/);
 assert.match(foldDrivePlan(game).steps.find(step=>step.id==='mine-six').detail,/Hold R/);
 assert.match(plan.steps.find(step=>step.id==='beacon').detail,/Investigate/);
 assert.match(foldDrivePlan(game).steps.find(step=>step.id==='beacon').detail,/press F to scan/);
});
