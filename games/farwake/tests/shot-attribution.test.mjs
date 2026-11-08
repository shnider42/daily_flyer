import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';

test('a local ship shot event identifies the existing projectile, firing captain and vessel',()=>{
  const game=new Game('local-shot-attribution'),energy=game.state.ship.energy;
  game.drainEvents();assert.equal(game.fireWeapons().ok,true);
  const bullet=game.system.bullets.at(-1),events=game.drainEvents(),shot=events.find(event=>event.type==='shot');
  assert.ok(shot);assert.equal(shot.id,bullet.id);assert.equal(shot.ownerId,bullet.ownerId);assert.equal(shot.shooterId,game.playerId);
  assert.equal(shot.vesselId,game.state.ship.id);assert.equal(shot.vesselId,bullet.vesselId);assert.equal(shot.x,bullet.x);assert.equal(shot.y,bullet.y);
  assert.equal(typeof shot.angle,'number');assert.equal(game.state.ship.energy,energy-3);
  assert.equal(game.fireWeapons().code,'cooldown');assert.equal(game.drainEvents().filter(event=>event.type==='shot').length,0,'a rejected shot cannot produce tutorial credit');
});

test('a shared person-mode gunner is attributed instead of the host captain or the host’s original hull',()=>{
  const host=new Game('crew-shot-attribution');host.bindSharedWorld(host.system,host._record(),'captain-owner');host.netVesselId='canonical-shared-vessel';
  assert.equal(host.enterCabin().ok,true);assert.equal(host.state.mode,'person');host.drainEvents();
  assert.equal(host.fireWeapons('captain-gunner').ok,true);
  const bullet=host.system.bullets.at(-1),shot=host.drainEvents().find(event=>event.type==='shot');
  assert.equal(shot.id,bullet.id);assert.equal(shot.ownerId,'captain-gunner');assert.equal(shot.shooterId,'captain-gunner');
  assert.notEqual(shot.shooterId,host.playerId,'another crewmate firing does not become the owner’s local action');
  assert.equal(shot.vesselId,'canonical-shared-vessel');assert.equal(shot.vesselId,bullet.vesselId);assert.notEqual(shot.vesselId,host.state.ship.id);
});

for(const shared of[false,true])test(`${shared?'shared owner':'solo captain'} mining and salvage events retain local credit and stable target identifiers`,()=>{
  const game=new Game('resource-attribution-'+shared);
  if(shared){game.bindSharedWorld(game.system,game._record(),'captain-resource-owner');game.netVesselId='canonical-resource-vessel';}
  const expectedOwner=shared?'captain-resource-owner':'local',expectedVessel=shared?'canonical-resource-vessel':game.state.ship.id;
  const rock=game.system.asteroids[0];game.system.asteroids=[rock];Object.assign(rock,{hp:.01,ore:2,crystal:1});Object.assign(game.state.ship,{x:rock.x,y:rock.y});game.drainEvents();
  game._mine(1/30);
  const mined=game.drainEvents().find(event=>event.type==='mined');
  assert.ok(mined);assert.equal(mined.ownerId,expectedOwner);assert.equal(mined.vesselId,expectedVessel);assert.equal(mined.targetId,rock.id);
  assert.equal(mined.id,`mined:${game.state.systemId}:${rock.id}`);assert.equal(mined.ore,2);assert.equal(mined.crystal,1);
  game._mine(1/30);assert.equal(game.drainEvents().filter(event=>event.type==='mined').length,0,'an exhausted target cannot be credited twice');
  const item={id:'credited-pickup',x:rock.x+3,y:rock.y,ore:1,crystal:0,credits:7};game.system.pickups.push(item);
  assert.equal(game.salvage(item.id).ok,true);
  const salvage=game.drainEvents().find(event=>event.type==='salvage');
  assert.ok(salvage);assert.equal(salvage.ownerId,expectedOwner);assert.equal(salvage.vesselId,expectedVessel);assert.equal(salvage.pickupId,item.id);
  assert.equal(salvage.id,`salvage:${game.state.systemId}:${item.id}`);
  assert.equal(game.salvage(item.id).code,'target');assert.equal(game.drainEvents().filter(event=>event.type==='salvage').length,0,'repeating a collection command cannot create another event');
});
