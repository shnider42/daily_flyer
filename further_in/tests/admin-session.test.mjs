import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unlockAdmin,isAdminUnlocked,lockAdmin,getTestingLaunch,buildTestUrl,progressStore} from '../dist/admin-session.mjs';
import {LEVEL_ORDER,floorNumber} from '../dist/core.mjs';

function memoryStorage(){
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}

test('admin stays locked until the correct code and locks again on request',()=>{
  const storage=memoryStorage();
  assert.equal(isAdminUnlocked(storage),false);
  for(const wrong of ['', '1234', '43210', undefined])assert.equal(unlockAdmin(wrong,storage),false);
  assert.equal(isAdminUnlocked(storage),false);
  assert.equal(unlockAdmin('4321',storage),true);
  assert.equal(isAdminUnlocked(storage),true);
  lockAdmin(storage);
  assert.equal(isAdminUnlocked(storage),false);
});

test('unavailable browser storage never grants test access',()=>{
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  for(const storage of [undefined,blocked]){
    assert.equal(unlockAdmin('4321',storage),false);
    assert.equal(isAdminUnlocked(storage),false);
    assert.equal(getTestingLaunch('?level=3&action=ghost&telemetry=1',storage),null);
    assert.doesNotThrow(()=>lockAdmin(storage));
  }
});

test('legacy floor links and shortcut links cannot launch tests while locked',()=>{
  const storage=memoryStorage();
  for(const search of ['?level=1','?level=2','?level=3','?level=4','?level=5','?level=6','?test=1&level=3&action=ghost&telemetry=1']){
    assert.equal(getTestingLaunch(search,storage),null);
  }
  unlockAdmin('4321',storage);
  assert.deepEqual(getTestingLaunch('?level=2',storage),{level:2,action:null,telemetry:false});
  lockAdmin(storage);
  assert.equal(getTestingLaunch('?level=2',storage),null);
});

test('an unlocked ordinary game URL still runs as a normal campaign',()=>{
  const storage=memoryStorage();unlockAdmin('4321',storage);
  for(const search of ['', '?test=1', '?action=ghost', '?telemetry=1', '?level=0', '?level=7', '?level=3.0', '?level=03', '?level=-1', '?level=Infinity', '?level=true']){
    assert.equal(getTestingLaunch(search,storage),null);
  }
});

test('each admin shortcut and telemetry option survives a launch link round trip',()=>{
  const storage=memoryStorage();unlockAdmin('4321',storage);
  for(const [level,action] of [[1,''],[2,''],[4,''],[5,''],[6,''],[3,''],[1,'pattern'],[2,'chase'],[2,'hole'],[4,'drain'],[5,'breakers'],[6,'transit'],[3,'ghost']]){
    for(const telemetry of [false,true]){
      const url=buildTestUrl(level,action,telemetry);
      assert.deepEqual(getTestingLaunch(url.slice(2),storage),{level,action:action||null,telemetry});
      assert.ok(!url.includes('4321'));
    }
  }
});

test('mismatched or unrecognized shortcuts are rejected',()=>{
  const storage=memoryStorage();unlockAdmin('4321',storage);
  for(const level of [0,7,-1,1.5,'3',NaN,Infinity])assert.throws(()=>buildTestUrl(level),RangeError);
  assert.throws(()=>buildTestUrl(1,'ghost'),RangeError);
  assert.throws(()=>buildTestUrl(3,'toString'),RangeError);
  assert.throws(()=>buildTestUrl(4,'breakers'),RangeError);
  assert.throws(()=>buildTestUrl(6,'drain'),RangeError);
  assert.deepEqual(getTestingLaunch('?level=1&action=ghost',storage),{level:1,action:null,telemetry:false});
  assert.deepEqual(getTestingLaunch('?level=2&action=unknown&telemetry=true',storage),{level:2,action:null,telemetry:false});
});

test('campaign numbering inserts three floors without changing legacy finale links or saves',()=>{
  const session=memoryStorage(),normal=memoryStorage();unlockAdmin('4321',session);
  assert.deepEqual(LEVEL_ORDER,[1,2,4,5,6,3]);
  assert.deepEqual(LEVEL_ORDER.map(floorNumber),[1,2,3,4,5,6]);
  const legacy={floor:3,tool:true,medal:true};
  normal.setItem('further-in-progress',JSON.stringify(legacy));
  assert.deepEqual(progressStore(false,normal,session).read(),legacy);
  assert.equal(floorNumber(legacy.floor),6);
  assert.deepEqual(getTestingLaunch('?level=3&action=ghost',session),{level:3,action:'ghost',telemetry:false});
  assert.deepEqual(getTestingLaunch('?level=4&action=ghost',session),{level:4,action:null,telemetry:false});
});

test('test progress and medals cannot overwrite normal campaign progress',()=>{
  const normal=memoryStorage(),session=memoryStorage();
  const campaign=progressStore(false,normal,session),testing=progressStore(true,normal,session);
  const original={floor:1,tool:false};campaign.save(original);
  testing.save({floor:3,tool:true,medal:true,completed:true});
  assert.deepEqual(campaign.read(),original);
  assert.equal(testing.read().floor,3);
  assert.equal(normal.getItem('further-in-test-progress'),null);
  assert.equal(session.getItem('further-in-progress'),null);
  unlockAdmin('4321',session);lockAdmin(session);
  assert.deepEqual(testing.read(),{});
  assert.deepEqual(campaign.read(),original);
});

test('blocked or corrupt saves do not break normal gameplay',()=>{
  const corrupt=memoryStorage();corrupt.setItem('further-in-progress','[]');
  assert.deepEqual(progressStore(false,corrupt).read(),{});
  corrupt.setItem('further-in-progress','broken');
  assert.deepEqual(progressStore(false,corrupt).read(),{});
  const absent=progressStore(false,undefined,undefined);
  assert.deepEqual(absent.read(),{});
  assert.doesNotThrow(()=>absent.save({floor:1}));
});

test('public page has no floor selector or spoiler panel; locked admin markup has no test content',async()=>{
  const main=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(main,/id="(?:choose|test-panel|test-description|debug)"|data-level|data-test|Choose a floor|Floor testing|admin\.html/);
  const admin=await readFile(new URL('../dist/admin.html',import.meta.url),'utf8');
  assert.match(admin,/id="admin-panel" hidden[^>]*><\/section>/);
  assert.doesNotMatch(admin,/4321|Final ghost|Somewhere beautiful|Last pattern step|1 → 2 → 3 → 1/);
});
