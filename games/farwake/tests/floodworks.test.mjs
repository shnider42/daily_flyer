import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NAMED_SYSTEMS} from '../dist/content.mjs';
import {explorationSites,explorationLocation,createSiteState,stepSiteEncounter,resetSiteBoss} from '../dist/exploration.mjs';
import {generateSurface,isWalkable,drawSurface,drawSurfaceMap} from '../dist/surface.mjs';
import {fieldSites,fieldObjectPosition,inspectFieldObject,performFieldObject,fieldSurfaceView,FOREMAN_TIMING} from '../dist/floodworks.mjs';

const point=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
const body=id=>NAMED_SYSTEMS.flatMap(system=>system.bodies.map(value=>({...value,systemId:system.id}))).find(value=>value.id===id);
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function fixture(bodyId='orchard',siteId='floodworks-6'){
 const location=explorationLocation(body(bodyId),siteId,'field-test'),site=location.site,state=createSiteState(site),actor={id:'crew-one',name:'One',person:{...point(5,43),health:100,maxHealth:100,down:false},input:{}},tools=new Set();
 const f={location,site,state,actor,tools};f.surface=()=>generateSurface({...location,field:state.field},'field-test');Object.assign(actor.person,f.surface().spawn);return f;
}
function path(surface,from,to){
 const cell=p=>Math.floor(p.y/24)*surface.cols+Math.floor(p.x/24),start=cell(from),goal=cell(to),parent=new Map([[start,null]]),queue=[start];
 for(let i=0;i<queue.length&&!parent.has(goal);i++){const n=queue[i],x=n%surface.cols,y=Math.floor(n/surface.cols);for(const[xx,yy]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const next=yy*surface.cols+xx,p=point(xx,yy);if(xx<0||yy<0||xx>=surface.cols||yy>=surface.rows||parent.has(next)||!isWalkable(surface,p.x,p.y,6))continue;parent.set(next,n);queue.push(next);}}
 if(!parent.has(goal))return null;const points=[];for(let next=goal;next!==start;next=parent.get(next))points.push(point(next%surface.cols,Math.floor(next/surface.cols)));return points.reverse();
}
const object=(f,id)=>fieldObjectPosition(f.state,f.site,id);
function at(f,id){const target=object(f,id);assert.ok(path(f.surface(),f.actor.person,target),`reachable ${id}`);Object.assign(f.actor.person,target);return target;}
function act(f,id,action,actor=f.actor){const result=performFieldObject(f.state,f.site,id,action,{actorId:actor.id,person:actor.person,tools:f.tools});if(result.grantTool)f.tools.add(result.grantTool);return result;}
function openApproach(f){at(f,'workshop-cutter');ok(act(f,'workshop-cutter','claim'));at(f,'workshop-bridge');ok(act(f,'workshop-bridge','claim'));at(f,'service-panel');ok(act(f,'service-panel','cut'));at(f,'pump-terminal');ok(act(f,'pump-terminal','bridge'));}
function step(f,count=1,actors=[f.actor],dt=1/30){let events=[];const surface=f.surface();for(let i=0;i<count;i++)events.push(...stepSiteEncounter(f.state,actors,dt,surface));return events;}
function waitFor(f,phase){for(let i=0;i<400&&f.state.field.foreman.phase!==phase;i++)step(f);assert.equal(f.state.field.foreman.phase,phase);}
function stopForeman(f){
 Object.assign(f.actor.person,point(27,33));waitFor(f,'recovery');ok(act(f,'release-port','release'));
 Object.assign(f.actor.person,point(45,48));step(f,110);waitFor(f,'recovery');ok(act(f,'release-starboard','release'));
}

test('Field expeditions preserve Hearth outside the authored Relay Nine upgrade',()=>{
 // 0.35 adds only seeded Relay Nine annexes, cues and optional field records.
 // Direct comparison with the pre-0.35 source in farwake, hearth-preservation and
 // legacy-content preserved outdoor geometry/services, every non-Relay room,
 // and all released Relay walkable tiles/solids/spawn/exit. Only its briefing and
 // embedded catalog change outdoors; Kettle and Tinbell hashes remain unchanged.
 // 0.39 additionally clarifies one Relay record and appends Tinbell’s physical
 // sample. Direct 0.38 comparisons preserve the original geometry and services.
 // The creature pass changes only Relay hostiles in that embedded catalog and
 // interior metadata: clean 0.35 maps match after removing only that exact field.
 // 0.41 was independently compared with read-only 1dc5717 imports in farwake,
 // hearth-preservation and floodworks. Only outdoor data.rumors changes: Kettle visitor-pilot [1],
 // Morrow courier [1] and military-recruiter [2] describe the physical Sol cordon.
 // Exact bodies, entity IDs/order, geometry, services, site catalogs and every
 // interior are unchanged. Update only the two outdoor hashes, retaining all others.
 const expected={"kettle":["4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","95c8dc18fb629037135eabc078918b70926e3e8559c05ffbf41570678f9b7090","4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"],"morrow":["849a59c52285a0c0f4058ccb9a043a119551e9a56f3106d21dbbfe83ad5c1c36","974b3b94f5f326a8f76512894872f4a4edbfd720a8e2a19ebed9fa49aff3eef4","4bf8dfa98a04c627cb482a6ba0e6b153ae01172200970e5805aa02658dc73fee"],"tinbell":["6b7c83bf437997e23766921e4c8cab0af4f4f230fd7438adeec38043332835cf","024de84b793eabd1bd054e25ef48b8ab7e4291ea20e5695f106737e3682efd3b","934e7a7b56d0afefcff893f1046b219d39cea013299730cc6d6d30bdec2d2f28"]};
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 for(const value of NAMED_SYSTEMS.find(system=>system.id==='hearth').bodies){const sites=explorationSites(value,'farwake');assert.deepEqual([digest(sites),digest(generateSurface(value,'farwake')),digest(sites.map(site=>generateSurface(explorationLocation(value,site.id,'farwake'),'farwake')))],expected[value.id]);assert.deepEqual(fieldSites(value),[]);}
 assert.deepEqual(fieldSites({id:'orchard',kind:'planet',systemId:'hearth'}),[]);
});

test('six connected sections open in physical order, with an optional archive and permanent intake shortcut',()=>{
 const f=fixture();assert.equal(f.surface().rooms.length,6);assert.ok(path(f.surface(),f.actor.person,object(f,'workshop-cutter')));assert.equal(path(f.surface(),f.actor.person,object(f,'pump-terminal')),null);
 at(f,'service-panel');assert.equal(act(f,'service-panel','cut').code,'requirements');
 openApproach(f);assert.equal(f.state.field.revision,2);assert.ok(path(f.surface(),f.actor.person,object(f,'release-port')));assert.equal(path(f.surface(),f.actor.person,object(f,'archive-terminal')),null);assert.equal(path(f.surface(),f.actor.person,object(f,'casualty-mara')),null);
 at(f,'archive-panel');ok(act(f,'archive-panel','cut'));at(f,'archive-terminal');ok(act(f,'archive-terminal','read'));
 at(f,'shortcut-lever');ok(act(f,'shortcut-lever','open'));assert.ok(isWalkable(f.surface(),point(22,44).x,point(22,44).y));assert.equal(f.state.field.archiveRead,true);
 stopForeman(f);assert.equal(f.state.field.foreman.disabled,true);assert.equal(f.state.cleared,true);assert.ok(path(f.surface(),f.actor.person,object(f,'casualty-mara')));
 const saved=createSiteState(f.site,JSON.parse(JSON.stringify(f.state)));assert.deepEqual(saved.field,f.state.field);assert.equal(saved.cleared,true);
});

test('tools are issued personally, inspection is read-only, and remote or invented actions cannot change the site',()=>{
 const f=fixture(),before=JSON.stringify(f.state);const inspected=inspectFieldObject(f.state,f.site,'workshop-cutter',{actorId:f.actor.id,tools:f.tools});assert.equal(inspected.ok,true);assert.equal(JSON.stringify(f.state),before);
 assert.equal(act(f,'service-panel','cut').code,'distance');assert.equal(JSON.stringify(f.state),before);
 at(f,'workshop-cutter');assert.equal(act(f,'workshop-cutter','open-everything').code,'action');ok(act(f,'workshop-cutter','claim'));
 const other={id:'crew-two',person:{...f.actor.person,health:100}},result=ok(performFieldObject(f.state,f.site,'workshop-cutter','claim',{actorId:other.id,person:other.person,tools:[]}));assert.equal(result.grantTool,'field_cutter');assert.equal(f.state.field.serviceCut,false);
 at(f,'service-panel');ok(act(f,'service-panel','cut'));const cleared=JSON.stringify(f.state),panel=inspectFieldObject(f.state,f.site,'service-panel',{actorId:f.actor.id,tools:f.tools});assert.match(panel.text,/gallery is open/i);assert.doesNotMatch(panel.text,/blocked|warped/i);assert.equal(JSON.stringify(f.state),cleared);
});

test('Foreman telegraphs one committed sweep, hits each actor once, and can be solved solo through two safe releases',()=>{
 const f=fixture();openApproach(f);Object.assign(f.actor.person,point(34,35));step(f);assert.equal(f.state.field.foreman.phase,'telegraph');assert.equal(f.actor.person.health,100);
 waitFor(f,'sweep');const events=step(f,8,[f.actor],.25);assert.equal(events.filter(event=>event.type==='person-hit').length,1);assert.equal(f.actor.person.health,100-FOREMAN_TIMING.damage);
 Object.assign(f.actor.person,point(27,33));waitFor(f,'recovery');ok(act(f,'release-port','release'));assert.equal(f.state.field.foreman.disabled,false);
 Object.assign(f.actor.person,point(45,48));step(f,110);waitFor(f,'recovery');ok(act(f,'release-starboard','release'));assert.equal(f.state.field.foreman.disabled,true);assert.equal(f.state.field.foreman.phase,'shutdown');
 assert.equal(step(f,240).filter(event=>event.type==='person-hit').length,0);
});

test('one or four participants share one machine clock, and resetting an attempt preserves mechanical progress',()=>{
 const a=fixture(),b=fixture();openApproach(a);openApproach(b);Object.assign(a.actor.person,point(27,33));Object.assign(b.actor.person,point(27,33));
 const group=[b.actor,...[2,3,4].map(id=>({id:`crew-${id}`,person:{...b.actor.person},input:{}}))];step(a,20);step(b,20,group);
 assert.equal(a.state.time,b.state.time);assert.equal(a.state.field.foreman.phase,b.state.field.foreman.phase);assert.equal(a.state.field.foreman.timer,b.state.field.foreman.timer);
 waitFor(a,'recovery');ok(act(a,'release-port','release'));at(a,'shortcut-lever');ok(act(a,'shortcut-lever','open'));const revision=a.state.field.revision;
 assert.equal(resetSiteBoss(a.state),true);assert.equal(a.state.field.foreman.phase,'idle');assert.equal(a.state.field.releases.port,true);assert.equal(a.state.field.shortcutOpen,true);assert.equal(a.state.field.revision,revision);assert.equal(resetSiteBoss(a.state),false);
});

test('a survivor walks a real route to aid, survives restore, and handover distinguishes rescue from later follow-up care',()=>{
 const f=fixture();openApproach(f);at(f,'shortcut-lever');ok(act(f,'shortcut-lever','open'));stopForeman(f);at(f,'casualty-mara');assert.equal(act(f,'casualty-mara','escort').code,'requirements');ok(act(f,'casualty-mara','stabilize'));ok(act(f,'casualty-mara','escort'));
 const survivor=f.state.field.survivors.mara,start={x:survivor.x,y:survivor.y},route=path(f.surface(),survivor,object(f,'entry-aid'));assert.ok(route&&route.length>20);
 for(const p of route){Object.assign(f.actor.person,p);for(let i=0;i<30&&survivor.status!=='safe'&&Math.hypot(survivor.x-p.x,survivor.y-p.y)>32;i++)step(f);if(survivor.status==='safe')break;}
 Object.assign(f.actor.person,object(f,'entry-aid'));for(let i=0;i<240&&survivor.status!=='safe';i++)step(f);
 assert.equal(survivor.status,'safe');assert.ok(Math.hypot(survivor.x-start.x,survivor.y-start.y)>100);assert.ok(survivor.escorts.includes(f.actor.id));
 const handover=ok(act(f,'entry-aid','handover'));assert.ok(handover.evidence.some(item=>item.kind==='rescue'&&item.survivorId==='mara'));
 const restored=createSiteState(f.site,f.state);assert.equal(restored.field.survivors.mara.status,'safe');assert.equal(restored.field.survivors.mara.id,'mara');assert.equal(restored.field.survivors.mara.name,'Mara Venn');assert.ok(fieldSurfaceView(f.surface(),restored).entities.some(item=>item.data.survivorId==='mara'));
 const guest={id:'late-crew',person:{...survivor,health:100,down:false}};const aftercare=ok(performFieldObject(f.state,f.site,'casualty-mara','stabilize',{actorId:guest.id,person:guest.person,tools:[]}));assert.equal(aftercare.evidence.kind,'aftercare');Object.assign(guest.person,object(f,'entry-aid'));
 const check=ok(performFieldObject(f.state,f.site,'entry-aid','handover',{actorId:guest.id,person:guest.person,tools:[]}));assert.ok(check.evidence.some(item=>item.kind==='aftercare'));assert.ok(!check.evidence.some(item=>item.kind==='rescue'));
});

test('an absent escort cannot move a survivor or claim a rescue, and live positions drive the interaction view',()=>{
 const f=fixture();openApproach(f);at(f,'archive-panel');ok(act(f,'archive-panel','cut'));at(f,'casualty-ivo');ok(act(f,'casualty-ivo','stabilize'));ok(act(f,'casualty-ivo','escort'));const survivor=f.state.field.survivors.ivo,position={x:survivor.x,y:survivor.y};
 step(f,20,[]);assert.equal(survivor.status,'stabilized');assert.equal(survivor.escortId,null);assert.deepEqual({x:survivor.x,y:survivor.y},position);assert.deepEqual(survivor.escorts,[]);
 const surface=f.surface(),before=JSON.stringify(surface);survivor.x-=24;const view=fieldSurfaceView(surface,f.state),entity=view.entities.find(item=>item.data.fieldObjectId==='casualty-ivo');assert.equal(entity.x,survivor.x);assert.equal(JSON.stringify(surface),before);
});

test('Serein and Lilt annexes use the same earned tools with distinct blocked routes and preserved outcomes',()=>{
 for(const [bodyId,siteId]of[['serein','condenser-annex'],['lilt','archive-annex']]){
  const f=fixture(bodyId,siteId);f.tools.add('field_cutter');f.tools.add('power_bridge');assert.equal(path(f.surface(),f.actor.person,object(f,'archive-terminal')),null);
  if(bodyId==='serein'){at(f,'service-panel');ok(act(f,'service-panel','cut'));}
  at(f,'pump-terminal');ok(act(f,'pump-terminal','bridge'));at(f,'archive-terminal');ok(act(f,'archive-terminal','read'));assert.equal(createSiteState(f.site,f.state).field.archiveRead,true);assert.equal(f.state.field.foreman,null);
 }
});

test('field rendering shows machine and route states without mutating simulation or the cached surface',()=>{
 const f=fixture();openApproach(f);Object.assign(f.actor.person,point(27,33));step(f);const surface=f.surface(),before=JSON.stringify({surface,state:f.state});
 const ctx={canvas:{width:640,height:480},save(){},restore(){},fillRect(){},fillText(){},translate(){},scale(){},setLineDash(){},strokeRect(){},measureText(text){return{width:String(text).length*6};}},labels=[];
 drawSurface(ctx,surface,{width:640,height:480,zoom:1,person:f.actor.person,exploration:f.state,combatTime:f.state.time,labels});drawSurfaceMap(ctx,surface,{person:f.actor.person,exploration:f.state});
 assert.equal(JSON.stringify({surface,state:f.state}),before);assert.ok(labels.some(label=>label.text.includes('FOREMAN')));
});
