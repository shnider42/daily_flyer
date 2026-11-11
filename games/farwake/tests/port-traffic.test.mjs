import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_CLASSES } from '../dist/fleet.mjs';
import { NAMED_SYSTEMS } from '../dist/content.mjs';
import { FRONTIER_SYSTEMS } from '../dist/galaxy-expansion.mjs';
import { PORT_KINDS, MILITARY_PORT_FACTIONS, TRAFFIC_ACQUISITION_RARITY, portProfile, trafficHullWeights, chooseTrafficHull, canHullUsePort } from '../dist/port-traffic.mjs';

const profile=kind=>({id:kind,kind,...PORT_KINDS[kind]});
const samples=(kind,count=20000)=>{
 const port=profile(kind),counts=Object.fromEntries(SHIP_CLASSES.map(hull=>[hull.id,0]));
 for(let index=0;index<count;index++)counts[chooseTrafficHull('port-distribution',`ship:${index}`,port)]++;
 return Object.fromEntries(Object.entries(counts).map(([id,value])=>[id,value/count]));
};

test('every obtainable hull has a contextual traffic route, with closed immutable weighted tables',()=>{
 const covered=new Set();
 for(const kind of Object.keys(PORT_KINDS)){
  const port=profile(kind),rows=trafficHullWeights(port);
  assert.ok(Object.isFrozen(rows));assert.ok(rows.length>0);
  assert.equal(new Set(rows.map(row=>row.classId)).size,rows.length);
  for(const row of rows){
   assert.ok(Object.isFrozen(row));assert.ok(Number.isFinite(row.weight)&&row.weight>0);
   assert.ok(typeof row.role==='string'&&row.role.length>0);
   assert.ok(canHullUsePort(row.classId,port));covered.add(row.classId);
  }
 }
 assert.deepEqual([...covered].sort(),SHIP_CLASSES.map(hull=>hull.id).sort(),'A new player hull needs a deliberate traffic home.');
 for(const kind of ['constructor','__proto__','made-up',undefined]){
  assert.deepEqual(trafficHullWeights({kind,maxShipLength:9999}),[]);
  assert.equal(chooseTrafficHull('seed','id',{kind,maxShipLength:9999}),null);
 }
 assert.equal(canHullUsePort('not-a-hull',profile('hub')),false);
 assert.equal(canHullUsePort('capital',null),false);
});

test('major terminals favor working transports while capital ships remain exceptional',()=>{
 const observed=samples('hub',40000);
 assert.ok(observed.hauler>.47&&observed.hauler<.53,'Working passenger transports are the main arrival.');
 assert.ok(observed.tern>.16&&observed.tern<.21);
 assert.ok(observed.sparrow+observed.kestrel+observed.mule>.08&&observed.sparrow+observed.kestrel+observed.mule<.14,'Personal craft still visit the major terminal.');
 const substantial=SHIP_CLASSES.filter(hull=>hull.stats.renderLength>=90).reduce((sum,hull)=>sum+observed[hull.id],0);
 assert.ok(substantial>.65,'Most arrivals are physically bigger than the starter ships and local shuttle.');
 assert.ok(observed.capital>.001&&observed.capital<.005,'A carrier is possible but does not become the ordinary bus.');
 for(const hull of SHIP_CLASSES)assert.ok(observed[hull.id]>0,`${hull.id} can be encountered without being unlocked.`);
});

test('military bases favor serious escorts and patrols with visible civilian support traffic',()=>{
 const observed=samples('military');
 assert.ok(observed.marten+observed.bulwark+observed.frigate>.75);
 assert.ok(observed.marten>.3&&observed.bulwark>.25&&observed.frigate>.12);
 assert.ok(observed.mender>.04&&observed.mender<.08);
 assert.ok(observed.capital>.01&&observed.capital<.03);
 assert.ok(observed.hauler+observed.tern+observed.quill>.04,'Supplies and personnel still arrive at a base.');
 assert.ok(observed.capital<observed.bulwark/10,'The largest commissioned hull still feels scarce.');
});

test('small fields have no over-sized arrivals and research/industrial ports have different working fleets',()=>{
 const small=samples('outpost');
 for(const hull of SHIP_CLASSES){
  assert.equal(canHullUsePort(hull.id,profile('outpost')),hull.stats.renderLength<=90);
  if(hull.stats.renderLength>90)assert.equal(small[hull.id],0);
 }
 assert.ok(small.sparrow+small.kestrel+small.mule>.78);
 const research=samples('research');assert.ok(research.petrel>.3);assert.ok(research.kestrel>.23);
 assert.equal(research.capital+research.cairn+research.atlas+research.bulwark,0);
 const industry=samples('industrial');assert.ok(industry.mule+industry.hauler+industry.atlas+industry.cairn>.82);
 assert.ok(industry.capital<.003);assert.ok(industry.atlas>.13&&industry.cairn>.15);
});

test('acquisition rarity reflects both cost and progression requirements before context is applied',()=>{
 assert.ok(Object.isFrozen(TRAFFIC_ACQUISITION_RARITY));
 assert.equal(TRAFFIC_ACQUISITION_RARITY.sparrow,1);
 assert.equal(TRAFFIC_ACQUISITION_RARITY.kestrel,1);
 assert.ok(TRAFFIC_ACQUISITION_RARITY.mule<1);
 assert.ok(TRAFFIC_ACQUISITION_RARITY.tern>TRAFFIC_ACQUISITION_RARITY.quill);
 assert.ok(TRAFFIC_ACQUISITION_RARITY.marten>TRAFFIC_ACQUISITION_RARITY.bulwark);
 assert.ok(TRAFFIC_ACQUISITION_RARITY.atlas>TRAFFIC_ACQUISITION_RARITY.cairn);
 assert.ok(TRAFFIC_ACQUISITION_RARITY.capital<.06);
});

test('port purpose and capacity preserve existing public locations and expose dedicated faction bases',()=>{
 for(const system of [...NAMED_SYSTEMS,...FRONTIER_SYSTEMS])for(const body of system.bodies){
  const port=portProfile(system,body);
  if(port){assert.ok(Object.isFrozen(port));assert.equal(port.restricted,false,`${body.id} was already a public story location.`);}
 }
 const hearth=NAMED_SYSTEMS.find(system=>system.id==='hearth');
 assert.equal(portProfile(hearth,hearth.bodies[0]).kind,'hub');
 assert.equal(portProfile(hearth,hearth.bodies[1]).kind,'regional');
 assert.equal(portProfile(hearth,hearth.bodies[2]),null);
 const nacre=NAMED_SYSTEMS.find(system=>system.id==='nacre');
 assert.equal(portProfile(nacre,nacre.bodies.find(body=>body.id==='bastion')).restricted,false);
 for(const [id,faction] of Object.entries(MILITARY_PORT_FACTIONS)){
  const port=portProfile({id:'test-system',faction:'freewake'},{id,kind:'station',faction:'unknown'});
  assert.equal(port.kind,'military');assert.equal(port.restricted,true);assert.equal(port.faction,faction);assert.equal(port.maxShipLength,260);
 }
 assert.equal(new Set(Object.values(MILITARY_PORT_FACTIONS)).size,5);
});

test('quarantine, ruins, preflight cultures and unserviced bodies do not gain routine landing traffic',()=>{
 const system={id:'new-system',faction:'concord',gx:60,gy:20,danger:5};
 for(const body of [
  null,{}, {id:'earth',kind:'planet'}, {id:'palimpsest',kind:'moon'}, {id:'stillwater',kind:'planet'},
  {id:'preflight',kind:'planet',techLevel:'preflight'}, {id:'closed',kind:'station',portServices:false},
  {id:'hazard',kind:'blackhole'}, {id:'ship',kind:'ship'}, {id:'site',kind:'site'},
  {id:'bare',kind:'moon',biome:'barren'}, {id:'rock',kind:'asteroid',biome:'rock'},
  {id:'no-pad',kind:'planet',landable:false}
 ])assert.equal(portProfile(system,body),null);
 assert.ok(portProfile(system,{id:'ice-settlement',kind:'moon',biome:'ice'}));
});

test('selection is stable under replay, player progression, unrelated choices and call order',()=>{
 const hub=profile('hub'),ids=[0,1,2,3,4,40,42,164];
 const expected=['hauler','hauler','tern','sparrow','tern','sparrow','tern','hauler'];
 assert.deepEqual(ids.map(i=>chooseTrafficHull('port-tests',`npc:${i}`,hub)),expected);
 assert.deepEqual([...ids].reverse().map(i=>chooseTrafficHull('port-tests',`npc:${i}`,{...hub,playerRank:999,playerShip:'capital',time:100000})).reverse(),expected);
 for(let i=0;i<100;i++)chooseTrafficHull('other-seed',`unrelated:${i}`,profile('military'));
 assert.deepEqual(ids.map(i=>chooseTrafficHull('port-tests',`npc:${i}`,hub)),expected);
 assert.notDeepEqual(ids.map(i=>chooseTrafficHull('different-galaxy',`npc:${i}`,hub)),expected);
 const raw={id:'frontier-test',gx:70,gy:20,danger:5,biome:'forest',faction:'freewake'};
 const body={id:'frontier-test-port',kind:'station'};
 assert.deepEqual(portProfile(raw,body),portProfile({...raw,seed:'elsewhere',time:999,playerRank:900},body));
 for(let i=0;i<1000;i++)assert.equal(portProfile({...raw,id:`public-${i}`},{...body,id:`public-${i}-port`}).restricted,false);
});

test('a narrower operational capacity filters choices without mutating shared tables',()=>{
 const hub=profile('hub'),small={...hub,maxShipLength:70};
 const full=trafficHullWeights(hub),narrow=trafficHullWeights(small);
 assert.deepEqual(narrow.map(row=>row.classId),['sparrow','kestrel','mule']);
 assert.equal(trafficHullWeights(hub),full);
 for(let i=0;i<100;i++)assert.ok(['sparrow','kestrel','mule'].includes(chooseTrafficHull('seed',i,small)));
 assert.deepEqual(trafficHullWeights({...hub,maxShipLength:0}),[]);
 assert.deepEqual(trafficHullWeights({...hub,maxShipLength:NaN}),[]);
 assert.deepEqual(trafficHullWeights({...hub,maxShipLength:Infinity}),[]);
});
