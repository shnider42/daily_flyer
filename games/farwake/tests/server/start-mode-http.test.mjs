import { WORLD_CONTENT_VERSION } from '../../dist/world-content.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startServer} from '../../server/index.mjs';
import {FilePersistence} from '../../server/persistence.mjs';

test('HTTP create and join forward Hardcore while passport resume preserves the original ownership',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'farwake-origin-http-')),persistence=new FilePersistence(directory);
 let server=await startServer({port:0,host:'127.0.0.1',persistence});
 t.after(async()=>{await server.close();await rm(directory,{recursive:true,force:true});});
 async function request(body){const response=await fetch(server.url+'/api/realms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ ...body, worldContentVersion: WORLD_CONTENT_VERSION })}),data=await response.json();assert.equal(response.status,200,data.reason);assert.equal(data.ok,true,data.reason);return data;}
 const first=await request({action:'create',name:'Shipless host',realmName:'Origin test',startMode:'hardcore',starterShip:'mule'}),code=first.passport.realmCode;
 let realm=server.manager.realms.get(code),host=realm.captains.get(first.passport.captainId);
 assert.equal(host.game.state.startMode,'hardcore');assert.equal(host.game.state.mode,'person');assert.equal(host.game.state.locationId,'morrow');assert.equal(host.ownedVesselId,null);assert.equal(host.game.state.credits,180);assert.equal(realm.vessels.size,0);
 const regular=await request({action:'join',realmCode:code,name:'Normal owner',startMode:'regular',starterShip:'kestrel'}),traveler=await request({action:'join',realmCode:code,name:'Shipless guest',startMode:'hardcore'});
 const owner=realm.captains.get(regular.passport.captainId),guest=realm.captains.get(traveler.passport.captainId);
 assert.equal(owner.game.shipClass.id,'kestrel');assert.ok(owner.ownedVesselId);assert.equal(owner.game.state.credits,180);assert.equal(guest.ownedVesselId,null);assert.equal(guest.game.state.startMode,'hardcore');assert.equal(realm.vessels.size,1);
 await realm.flush();await server.close();server=await startServer({port:0,host:'127.0.0.1',persistence});
 await request({action:'resume',passport:first.passport,startMode:'regular',starterShip:'sparrow'});
 realm=server.manager.realms.get(code);host=realm.captains.get(first.passport.captainId);
 assert.equal(host.game.state.startMode,'hardcore');assert.equal(host.ownedVesselId,null);assert.equal(host.game.ownsShip,false);assert.equal(host.game.state.credits,180);assert.equal(realm.vessels.size,1);
});
