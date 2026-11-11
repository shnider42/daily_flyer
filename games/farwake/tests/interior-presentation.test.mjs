import test from 'node:test';
import assert from 'node:assert/strict';
import { InteriorPresentation, syncDamageMarkers, nearestDamageMarker, nearestDeckInteraction, damageStatus, drawInteriorDamageFloor, drawInteriorDamageAir } from '../dist/interior-presentation.mjs';
import { ensureDamageControl, impactSection, registerShipImpact } from '../dist/interior-damage.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';

const impact=(serial,at,extra={})=>({serial,at,x:348,y:612,strength:1,shieldOnly:false,sectionId:'bridge',hullDamage:20,...extra});
function hull(id='physical-hull',classId='sparrow') {
 const ship={id,classId,hull:100,maxHull:100,energy:20};
 ensureDamageControl(ship);ship.damageControl.clock=100;
 return ship;
}
function addImpact(ship,extra={}) {
 const dc=ship.damageControl;dc.clock+=.1;const hit=impact(++dc.serial,dc.clock,extra);dc.impacts.push(hit);
 return hit;
}
function deck(id='physical-hull',classId='sparrow') {
 const ship=hull(id,classId);
 const surface=generateSurface({id:`ship:${id}`,vesselId:id,kind:'ship',shipClass:ship.classId,name:'Test vessel',crew:[{id:'engineer',name:'Mara',role:'engineer',health:100}],guests:[{id:'guest',name:'Rescued passenger',shipId:id,status:'aboard',health:80}]},'interior-presentation');
 return {ship,surface};
}
const markers=surface=>surface.entities.filter(entity=>entity.type==='damageControl');

class RecordingContext {
 constructor(){this.rects=[];this.stack=[];this.globalAlpha=.7;this.fillStyle='original';}
 save(){this.stack.push({globalAlpha:this.globalAlpha,fillStyle:this.fillStyle});}
 restore(){assert.ok(this.stack.length,'every restore has a matching save');Object.assign(this,this.stack.pop());}
 fillRect(x,y,w,h){this.rects.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha});}
}
function render(surface,damage,options={}) {
 const ctx=new RecordingContext();
 drawInteriorDamageFloor(ctx,surface,damage,options);drawInteriorDamageAir(ctx,surface,damage,options);
 assert.equal(ctx.stack.length,0);assert.equal(ctx.globalAlpha,.7);assert.equal(ctx.fillStyle,'original');
 return ctx.rects;
}

test('impact snapshots deduplicate by serial and retain a short local effect across repeated network frames',()=>{
 const ship=hull(),presentation=new InteriorPresentation();
 assert.deepEqual(presentation.sample(ship,10).fresh,[]);
 const hit=addImpact(ship),before=structuredClone(ship);
 const first=presentation.sample(ship,10.1);
 assert.deepEqual(first.fresh,[hit]);assert.equal(first.hits.length,1);assert.equal(first.hits[0].age,0);
 const repeat=presentation.sample(structuredClone(ship),10.3);
 assert.deepEqual(repeat.fresh,[]);assert.equal(repeat.hits.length,1);
 assert.ok(Math.abs(repeat.hits[0].age-.2)<1e-8,'effect age comes from the render clock, not server time');
 repeat.hits[0].x=-900;
 assert.equal(presentation.sample(ship,10.31).hits[0].x,hit.x,'a rendered copy cannot alter a queued effect');
 const expired=presentation.sample(ship,10.76);
 assert.deepEqual(expired.hits,[]);assert.deepEqual(expired.fresh,[]);assert.deepEqual(expired.shake,{x:0,y:0});assert.equal(expired.flash,0);
 assert.deepEqual(ship,before,'presentation leaves the authoritative snapshot unchanged');
});

test('stale or future snapshot impacts do not replay when their timestamps later enter the freshness window',()=>{
 const ship=hull(),presentation=new InteriorPresentation();presentation.sample(ship,0);
 Object.assign(ship.damageControl,{clock:103,serial:3,impacts:[impact(1,100),impact(2,101),impact(3,103.2)]});
 const stale=presentation.sample(ship,1);
 assert.deepEqual(stale.fresh,[]);assert.deepEqual(stale.hits,[]);
 ship.damageControl.clock=103.3;
 assert.deepEqual(presentation.sample(ship,1.3).fresh,[],'the serial watermark consumes rejected old snapshots too');
 const next=addImpact(ship);
 assert.deepEqual(presentation.sample(ship,1.4).fresh,[next],'a subsequent real hit still appears');
});

test('reconnects, mode changes, another hull and authority resets never replay an existing hit',()=>{
 const transitions=[
  ['reconnect',(presentation)=>presentation.reset()],
  ['leave the deck',(presentation,ship)=>presentation.sample(ship,10.2,{visible:false})],
  ['missing hull snapshot',(presentation)=>presentation.sample(null,10.2)],
  ['board another physical hull',(_presentation,ship)=>{ship.id='other-hull';}],
  ['authority clock rollback',(_presentation,ship)=>{ship.damageControl.clock=20;ship.damageControl.impacts[0].at=20;}],
  ['authority serial rollback',(_presentation,ship)=>{ship.damageControl.serial=0;ship.damageControl.impacts=[];}]
 ];
 for(const [name,transition] of transitions){
  const ship=hull(),presentation=new InteriorPresentation();presentation.sample(ship,10);addImpact(ship);
  assert.equal(presentation.sample(ship,10.1).fresh.length,1,name);
  ship.damageControl.sections[0].fire=40;
  transition(presentation,ship);
  const resumed=presentation.sample(ship,10.3);
  assert.deepEqual(resumed.fresh,[],name);assert.deepEqual(resumed.hits,[],name);assert.deepEqual(resumed.shake,{x:0,y:0},name);
  assert.equal(resumed.alarm,true,`${name}: persistent danger remains visible`);assert.equal(resumed.newEmergency,false,name);
  addImpact(ship);assert.equal(presentation.sample(ship,10.4).fresh.length,1,`${name}: new hits work after resuming`);
 }
});

test('entering an already burning deck reports its hazards without playing a new emergency',()=>{
 const ship=hull(),presentation=new InteriorPresentation();
 Object.assign(ship.damageControl.sections[0],{fire:30,breach:20});
 const entered=presentation.sample(ship,1);
 assert.equal(entered.alarm,true);assert.equal(entered.fireCount,1);assert.equal(entered.breachCount,1);assert.equal(entered.newEmergency,false);
 Object.assign(ship.damageControl.sections[0],{fire:0,breach:0});
 assert.equal(presentation.sample(ship,1.1).alarm,false);
 ship.damageControl.sections[1].fire=20;
 assert.equal(presentation.sample(ship,1.2).newEmergency,true);
 assert.equal(presentation.sample(ship,1.3).newEmergency,false,'one continuing fire does not retrigger the siren');
 ship.damageControl.sections[1].breach=30;
 assert.equal(presentation.sample(ship,1.4).newEmergency,false,'an ongoing emergency remains one alarm');
 ship.damageControl.sections[1].fire=0;
 assert.equal(presentation.sample(ship,1.5).alarm,true,'an open breach keeps the alarm active after suppression');
 ship.damageControl.sections[1].breach=0;
 assert.equal(presentation.sample(ship,1.6).alarm,false);
 assert.equal(damageStatus(ship),'');
 ship.damageControl.sections[0].fire=1;ship.damageControl.sections[1].fire=1;ship.damageControl.sections[1].breach=1;
 assert.equal(damageStatus(ship),'2 fires · 1 breach');
 assert.equal(damageStatus(null),'');
});

test('rapid real impacts keep shake, flash and effect count bounded and expire without a new snapshot',()=>{
 const ship=hull(),presentation=new InteriorPresentation();presentation.sample(ship,20);
 for(let i=0;i<6;i++)addImpact(ship);
 let effects=presentation.sample(ship,20.1);
 assert.equal(effects.hits.length,6);assert.equal(effects.fresh.length,6);
 for(let i=0;i<6;i++)addImpact(ship);
 effects=presentation.sample(ship,20.12);
 assert.equal(effects.hits.length,6,'older active effects yield to the newest six impacts');
 assert.deepEqual(effects.hits.map(hit=>hit.serial),[7,8,9,10,11,12]);
 for(const time of [20.12,20.14,20.2,20.3,20.55,20.7]){
  const frame=presentation.sample(ship,time);
  assert.ok(Math.abs(frame.shake.x)<=3.5&&Math.abs(frame.shake.y)<=3.5);
  assert.ok(frame.flash>=0&&frame.flash<=.055);assert.ok(frame.hits.length<=6);
 }
 assert.deepEqual(presentation.sample(ship,20.78).hits,[]);
});

test('Reduce motion removes camera impulses and flashes while keeping actual danger and fresh impact information',()=>{
 const ship=hull(),moving=new InteriorPresentation(),still=new InteriorPresentation();moving.sample(ship,1);still.sample(ship,1);
 addImpact(ship);ship.damageControl.sections[0].fire=30;
 const normal=moving.sample(ship,1.1),reduced=still.sample(ship,1.1,{motion:false});
 assert.ok(Math.hypot(normal.shake.x,normal.shake.y)>0);assert.ok(normal.flash>0);
 assert.deepEqual(reduced.shake,{x:0,y:0});assert.equal(reduced.flash,0);
 assert.deepEqual(reduced.fresh,normal.fresh);assert.deepEqual(reduced.hits,normal.hits);
 assert.equal(reduced.alarm,true);assert.equal(reduced.fireCount,1);assert.equal(reduced.newEmergency,true);
 const shieldHull=hull('shielded'),shielded=new InteriorPresentation();shielded.sample(shieldHull,1);addImpact(shieldHull,{shieldOnly:true,hullDamage:0});
 const absorbed=shielded.sample(shieldHull,1.1);
 assert.ok(Math.abs(absorbed.shake.x)<=Math.abs(normal.shake.x)*.381);
 assert.ok(Math.abs(absorbed.shake.y)<=Math.abs(normal.shake.y)*.381);assert.equal(absorbed.alarm,false);
});

test('small physical hull hits remain perceptible at the mobile person zoom without increasing maximum shake',()=>{
 const ship=hull(),presentation=new InteriorPresentation();presentation.sample(ship,10);
 addImpact(ship,{strength:.16,hullDamage:2});
 let visibleFrames=0;
 for(let frame=0;frame<12;frame++){
  const effect=presentation.sample(ship,10.1+frame/60);
  // App converts display pixels to world units before the zoomed camera.
  const zoom=.8,displayX=Math.round((effect.shake.x/zoom)*zoom),displayY=Math.round((effect.shake.y/zoom)*zoom);
  if(Math.abs(displayX)+Math.abs(displayY)>0)visibleFrames++;
  assert.ok(Math.abs(effect.shake.x)<=3.5&&Math.abs(effect.shake.y)<=3.5);
 }
 assert.ok(visibleFrames>=4,'a small real impact must survive pixel rounding for more than a single frame');
 assert.deepEqual(presentation.sample(ship,10.2,{motion:false}).shake,{x:0,y:0});
});

test('only actual damaged sections become reachable deck markers, and updates preserve real people and stations',()=>{
 const {ship,surface}=deck('physical-hull','tern'),originalEntities=[...surface.entities];
 assert.ok(originalEntities.some(entity=>entity.type==='crew'));assert.ok(originalEntities.some(entity=>entity.type==='npc'));assert.ok(originalEntities.some(entity=>entity.type==='station'));
 syncDamageMarkers(surface,ship);assert.equal(markers(surface).length,0,'decorative layout breach points are not real emergencies');
 const [burning,leaking,scarred]=ship.damageControl.sections;
 burning.fire=30;leaking.breach=20;scarred.damage=12;
 const snapshot=structuredClone(ship);syncDamageMarkers(surface,ship);
 const visible=markers(surface);assert.equal(visible.length,3);
 for(const section of [burning,leaking,scarred]){
  const marker=visible.find(entity=>entity.data.sectionId===section.id);
  assert.ok(marker);assert.equal(marker.data.shipId,ship.id);assert.equal(marker.x,section.x);assert.equal(marker.y,section.y);
  assert.ok(isWalkable(surface,marker.x,marker.y,6),'damage control remains physically reachable');
 }
 assert.match(visible.find(entity=>entity.data.sectionId===burning.id).name,/^Fire · /);
 const reused=visible[0];burning.fire=0;burning.breach=30;syncDamageMarkers(surface,ship);
 assert.equal(markers(surface).find(entity=>entity.id===reused.id),reused,'a changing hazard retains its marker identity');
 assert.match(reused.name,/^Hull breach · /);assert.equal(reused.data.fire,0);assert.equal(reused.data.breach,30);
 for(const entity of originalEntities)assert.equal(surface.entities.find(item=>item.id===entity.id),entity);
 Object.assign(burning,snapshot.damageControl.sections[0]);assert.deepEqual(ship,snapshot,'marker synchronization never changes hull damage');
});

test('another physical hull cannot place hazards on a cached deck, and mismatch cleanup leaves its real occupants intact',()=>{
 const {ship,surface}=deck('occupied-hull'),other=hull('different-hull');
 const original=[...surface.entities];ship.damageControl.sections[0].fire=30;syncDamageMarkers(surface,ship);
 assert.equal(markers(surface).length,1);
 other.damageControl.sections[1].breach=50;syncDamageMarkers(surface,other);
 assert.deepEqual(markers(surface),[],'a different hull snapshot must never create a phantom emergency on this deck');
 assert.deepEqual(surface.entities,original);
 syncDamageMarkers(surface,ship);assert.equal(markers(surface).length,1,'the real hull can repopulate its own marker');
});

test('repair and missing-state updates remove only stale damage markers, while nonship locations remain untouched',()=>{
 const {ship,surface}=deck(),original=[...surface.entities];ship.damageControl.sections[0].fire=25;syncDamageMarkers(surface,ship);
 ship.damageControl.sections[0].fire=0;syncDamageMarkers(surface,ship);
 assert.deepEqual(surface.entities,original);
 ship.damageControl.sections[0].breach=25;syncDamageMarkers(surface,ship);assert.equal(markers(surface).length,1);
 syncDamageMarkers(surface,null);assert.deepEqual(surface.entities,original);
 const planet={...surface,kind:'planet',entities:[...original]},before=planet.entities;
 syncDamageMarkers(planet,ship);assert.equal(planet.entities,before);
});

test('nearby damage control prioritizes reachable fire, then breach, then distance within 72 units',()=>{
 const marker=(id,x,y,fire=0,breach=0,extra={})=>({id,type:'damageControl',x,y,data:{fire,breach},...extra});
 const surface={kind:'ship',entities:[marker('scar',1,0),marker('breach',2,0,0,10),marker('fire',72,0,10),marker('out-of-reach',72.01,0,90,90),marker('hidden',0,0,100,100,{hidden:true}),{id:'person',type:'npc',x:0,y:0}]};
 const person={x:0,y:0},order=surface.entities.map(entity=>entity.id);
 assert.equal(nearestDamageMarker(surface,person).id,'fire','fire on the range boundary outranks a closer breach');
 assert.equal(nearestDamageMarker(surface,person,71).id,'breach');
 surface.entities.find(entity=>entity.id==='fire').data.fire=0;
 assert.equal(nearestDamageMarker(surface,person).id,'breach');
 surface.entities.find(entity=>entity.id==='breach').data.breach=0;
 assert.equal(nearestDamageMarker(surface,person).id,'scar','equally severe markers use actual distance');
 assert.deepEqual(surface.entities.map(entity=>entity.id),order,'target selection does not reorder the deck');
 assert.equal(nearestDamageMarker(surface,{x:1000,y:1000}),null);assert.equal(nearestDamageMarker({...surface,kind:'planet'},person),null);assert.equal(nearestDamageMarker(surface,null),null);
});

for(const [classId,role] of [['sparrow','navigation'],['kestrel','medical']])test(`${classId}: adjacent scars and active hazards cannot trap the ${role} console behind damage control`,()=>{
 const ship=hull(`console-${classId}`);ship.classId=classId;ensureDamageControl(ship);
 const surface=generateSurface({id:`ship:${ship.id}`,vesselId:ship.id,kind:'ship',shipClass:classId},'station-damage');
 const station=surface.entities.find(entity=>entity.data?.stationRole===role),person={x:station.x,y:station.y};
 // Use a real projected outside hit; this position must occur in normal play.
 const source=Array.from({length:360},(_,i)=>({sourceX:500*Math.cos(i*Math.PI/180),sourceY:500*Math.sin(i*Math.PI/180)}))
  .find(details=>{const {point}=impactSection(ship,details);return Math.hypot(point.x-station.x,point.y-station.y)<29;});
 assert.ok(source,'the test exercises an actual hit close enough to cover the console’s entire use range');
 const hit=registerShipImpact(ship,{...source,hullDamage:1}),section=ship.damageControl.sections.find(section=>section.id===hit.sectionId);
 assert.equal(section.fire,0);assert.equal(section.breach,0);assert.ok(section.damage>0);
 for(const severity of [{fire:0,breach:0},{fire:40,breach:50}]){
  Object.assign(section,severity);syncDamageMarkers(surface,ship);
  const marker=nearestDamageMarker(surface,person);assert.ok(marker);assert.equal(marker.data.sectionId,section.id);
  assert.equal(nearestDeckInteraction(surface,person),station,'the real console remains usable without first buying a repair');
  const disabledStation={...surface,entities:surface.entities.map(entity=>entity===station?{...entity,disabled:true}:entity)};
  const alternate=nearestDeckInteraction(disabledStation,person);
  assert.ok(alternate===marker||alternate.type!=='damageControl'&&Math.hypot(alternate.x-person.x,alternate.y-person.y)<=43,'Another real nearby console may remain usable in a small cabin.');
  const unavailable={...surface,entities:surface.entities.map(entity=>entity.type==='damageControl'?entity:{...entity,disabled:true})};
  assert.equal(nearestDeckInteraction(unavailable,person),marker,'an unusable console does not hide nearby damage control');
 }
 assert.ok(isWalkable(surface,person.x,person.y,6));
});

test('healthy decks and shield absorption render no invented flames, breaches, sparks or alarm lamps',()=>{
 const {ship,surface}=deck();
 assert.deepEqual(render(surface,ship.damageControl),[]);
 assert.deepEqual(render(surface,ship.damageControl,{hits:[impact(1,100,{shieldOnly:true,age:.1})]}),[]);
 assert.deepEqual(render(surface,null),[]);
 ship.damageControl.sections[0].fire=50;ship.damageControl.sections[0].breach=50;
 assert.deepEqual(render({...surface,kind:'planet'},ship.damageControl),[]);
});

test('hazards and fresh sparks draw finite bounded pixel shapes, restore canvas state and stop after repair',()=>{
 const {ship,surface}=deck(),section=ship.damageControl.sections[0];Object.assign(section,{damage:100,fire:100,breach:100});
 const damage=structuredClone(ship.damageControl),before=structuredClone(surface),hit=impact(1,100,{x:section.x,y:section.y,age:.12});
 const rects=render(surface,damage,{time:1e6,hits:[hit]});
 assert.ok(rects.length>20&&rects.length<100,'one local impact has a bounded amount of pixel work');
 assert.ok(rects.some(rect=>rect.color==='#030916'),'the recorded breach has a dark opening');
 assert.ok(rects.some(rect=>rect.color==='#efb35b'),'the recorded fire has visible flames');
 assert.ok(rects.some(rect=>rect.color==='#f5e4b3'),'a penetrating impact has short sparks');
 for(const rect of rects){
  for(const value of [rect.x,rect.y,rect.w,rect.h])assert.ok(Number.isFinite(value)&&Number.isInteger(value),'pixel shapes use finite integer coordinates');
  assert.ok(rect.w>0&&rect.h>0&&rect.w<=56&&rect.h<=56);assert.ok(rect.alpha>=0&&rect.alpha<=1);
 }
 assert.deepEqual(surface,before);assert.deepEqual(ship.damageControl,damage);
 for(const section of ship.damageControl.sections)Object.assign(section,{damage:0,fire:0,breach:0});
 assert.deepEqual(render(surface,ship.damageControl),[],'repaired hazards disappear without becoming decorative leftovers');
});

test('Reduce motion keeps hazard rendering static and viewport culling omits distant damage and sparks',()=>{
 const {ship,surface}=deck(),section=ship.damageControl.sections[0];Object.assign(section,{damage:50,fire:80,breach:50});
 const hits=[impact(1,100,{x:section.x,y:section.y,age:.2})];
 assert.deepEqual(render(surface,ship.damageControl,{time:0,motion:false,hits}),render(surface,ship.damageControl,{time:100,motion:false,hits}));
 section.fire=0;section.breach=0;
 const view={cameraX:surface.width+2000,cameraY:surface.height+2000,width:360,height:260};
 assert.deepEqual(render(surface,ship.damageControl,{time:10,hits,view}),[],'offscreen scorch and transient sparks do not cost draw work');
});
