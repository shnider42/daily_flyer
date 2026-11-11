/** Paid watches aboard a physical, independently piloted working vessel. */
import { SHIP_CLASSES, enemyHullProfile } from './fleet.mjs';
import { cabinLayout, isCabinWalkable } from './interior-layouts.mjs';
import { ensureDamageControl } from './interior-damage.mjs';
import { generateSurface, evaLayout } from './surface.mjs';
import { CREW_WORK_ROLES, crewWorkOffers, createWorkAssignment, crewTaskDefinition, publicCrewTask } from './crew-work.mjs';
import { normalizeSpecies, chooseNpcSpecies, speciesName } from './species.mjs';
import { WORLD_RADIUS } from './system-space.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=value=>{let result=2166136261;for(const char of String(value))result=Math.imul(result^char.charCodeAt(0),16777619);return result>>>0;};
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const inventoryFields=['cargo','upgrades','crew','formerCrew','memorial','boardingHistory','boarding'];
const active=game=>game.state.npcContract?.active===true?game.state.npcContract:null;
const ok=data=>({ok:true,...data});
const fail=(reason,code='unavailable')=>({ok:false,reason,message:reason,code});
const emit=(game,text)=>{if(!game._quietCrewIncident)game._event?.('crew-duty',{text,contractId:game.state.npcContract?.id});};
const port=body=>body&&body.portServices!==false&&body.landable!==false&&!['blackhole','ship','site','derelict'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(body.biome||''));
const employerClass=()=>SHIP_CLASSES.find(ship=>ship.id==='tern'&&ship.berths>=3)||SHIP_CLASSES.find(ship=>ship.id==='hauler')||SHIP_CLASSES.find(ship=>ship.berths>=3);

export const NPC_CREW_ROLES=Object.freeze([
 Object.freeze({id:'gunner',name:'Gunner',stationRole:'weapons',station:'security',reward:210,description:'Work the gun console on a contracted security run. The NPC pilot lines up a real raider; your shots must help disable it.',task:'At the security console, hold FIRE to fire the ship’s guns. Disable the marked raider.'}),
 Object.freeze({id:'firehand',name:'Fire crew',stationRole:'engineering',station:'engineering',reward:170,description:'Join a maintenance shakedown. A known overheating assembly needs hands-on fire suppression in its actual compartment.',task:'Find the marked hot compartment. Suppress its fire and repair the scorched equipment.'}),
 Object.freeze({id:'medic',name:'Ship medic',stationRole:'medical',station:'medical',reward:180,description:'Care for an injured worker during a local service run. Treat the person aboard this ship at its medical station.',task:'Reach the medical station and treat the injured worker until they are stable.'}),
 ...CREW_WORK_ROLES.filter(role=>!['gunner','firehand','medic'].includes(role.id))
]);
const roleFor=id=>NPC_CREW_ROLES.find(role=>role.id===id);

function canHire(game){
 if(active(game))return fail('Finish or return from your current crew contract first.','contract');
 if(game.state.mode!=='person'||game.state.interior||game.state.exploration)return fail('Crew hiring is available on foot at an inhabited port.','mode');
 if(game.state.person.health<=0||game.state.person.down)return fail('Recover before signing on for a watch.','incapacitated');
 const body=game.system.bodies.find(body=>body.id===game.state.locationId);
 if(!port(body))return fail('There is no crew-hiring office at this landing.','location');
 if(game.state.pendingEncounter||game.state.boarding?.phase==='active')return fail('Finish the current conversation or boarding first.','busy');
 if(game.state.livelihoods?.transit)return fail('Finish your passenger journey before taking a watch.','transit');
 return ok({body});
}

export function npcContractOffers(game){
 const check=canHire(game);
 return crewWorkOffers(game).map(({seed,complicationSeed,prepKind,finishKind,...offer})=>({...offer,available:check.ok,reason:check.reason||null,origin:check.body?.name||null,cost:0}));
}

/** Creates the employer inventory without taking ownership of the employee's ship. */
function createNpcContractBase(game,roleId,{id,employeeId=game.playerId||'local',shared=false}={}){
 const check=canHire(game),definition=roleFor(roleId);
 if(!check.ok)return check;if(!definition)return fail('Choose gunner, fire crew, or ship medic.','role');
 const serial=Math.max(0,Math.floor(finite(game.state.npcContractSerial)))+1;
 const contractId=String(id||`crew-watch:${employeeId}:${game.state.seed}:${serial}`);
 const origin={systemId:game.state.systemId,bodyId:check.body.id,name:check.body.name,x:check.body.x,y:check.body.y,radius:check.body.radius};
 const destination=game.system.bodies.filter(body=>port(body)&&body.id!==origin.bodyId&&body.id!=='earth'&&game.portAccess(body).ok).sort((a,b)=>distance(a,origin)-distance(b,origin))[0];
 const heading=destination?Math.atan2(destination.y-origin.y,destination.x-origin.x):Math.atan2(origin.y||1,origin.x||1),lane=hash(contractId),berthAngle=heading+(lane/0xffffffff-.5)*.75;
 const dockPoint={x:origin.x+Math.cos(berthAngle)*(origin.radius+75),y:origin.y+Math.sin(berthAngle)*(origin.radius+75)};
 // A service waypoint outside the port approach gives the pilot a real route.
 // It is a work run, so no distant or undiscovered hull is revealed by hiring.
 let workPoint=destination?{x:destination.x-Math.cos(heading)*(destination.radius+250),y:destination.y-Math.sin(heading)*(destination.radius+250)}:{x:dockPoint.x+Math.cos(heading)*850,y:dockPoint.y+Math.sin(heading)*850};
 if(distance(workPoint,dockPoint)<500)workPoint={x:dockPoint.x+Math.cos(heading)*650,y:dockPoint.y+Math.sin(heading)*650};
 const lateral=(hash(`${contractId}:service`)/0xffffffff-.5)*320;
 workPoint.x-=Math.sin(heading)*lateral;workPoint.y+=Math.cos(heading)*lateral;
 const radius=Math.hypot(workPoint.x,workPoint.y),limit=Math.max(0,finite(game.system.radius,WORLD_RADIUS)-350);
 if(radius>limit){workPoint.x*=limit/radius;workPoint.y*=limit/radius;}
 const shipClass=employerClass(),vesselId=`vessel:${contractId}`;
 const ship={...shipClass.stats,id:vesselId,name:'Local service boat',classId:shipClass.id,berths:shipClass.berths,humanOccupants:1,x:dockPoint.x,y:dockPoint.y,vx:0,vy:0,angle:heading,angularVelocity:0,hull:shipClass.stats.maxHull,shield:shipClass.stats.maxShield,energy:shipClass.stats.maxEnergy,fuel:shipClass.stats.maxFuel,warpRange:0,npcEmployer:true};
 ensureDamageControl(ship);
 const layout=cabinLayout(shipClass.id),medical=layout.stations.medical;
 const bedside=[{x:medical.x+24,y:medical.y},{x:medical.x-24,y:medical.y},{x:medical.x,y:medical.y+24},medical].find(point=>isCabinWalkable(layout,point.x,point.y,6));
 const pilot={id:`${contractId}:pilot`,name:'Captain Vale',species:'human',role:'pilot',x:layout.stations.helm.x,y:layout.stations.helm.y,health:100,maxHealth:100,status:'active',greeting:'I have the helm. Take your assigned station; I’ll bring us back to the hiring port.'};
 const workerPoint=roleId==='medic'?bedside:layout.crewSpawns[1]||layout.crewSpawns[0];
 const worker={id:`${contractId}:worker`,name:'Ira Moss',species:'human',role:'deckhand',x:workerPoint.x,y:workerPoint.y,health:roleId==='medic'?38:100,maxHealth:100,status:roleId==='medic'?'injured':'active',greeting:roleId==='medic'?'The accident left me in rough shape. Please use the medical station to stabilize me.':'A short local watch. The company supplies the tools; we supply the work.'};
 const inventory={cargo:{ore:8,crystal:0},upgrades:{},crew:[pilot,worker],formerCrew:[],memorial:[],boardingHistory:[],boarding:null};
 const contract={version:1,id:contractId,serial,employeeId:String(employeeId),active:true,shared:!!shared,roleId,roleName:definition.name,vesselId,shipName:ship.name,classId:shipClass.id,origin,dockPoint,workPoint,routeName:destination?`${origin.name} → ${destination.name} approach → ${origin.name}`:`${origin.name} local service circuit`,factionId:check.body.faction||game.currentSystem?.faction||'freewake',phase:'boarding',dockedAt:origin.bodyId,clock:0,phaseClock:0,startedAt:finite(game.state.stats?.time),reward:Math.round(definition.reward*(game.characterEffects?.jobRewards||1)),paid:false,aborted:false,incidentStarted:false,work:{done:false,progress:0,fireRemoved:0,damageRepaired:0,healed:0,damage:0,crewId:worker.id,sectionId:null,enemyId:null,lastFire:0,lastDamage:0,lastHealth:worker.health}};
 game.state.npcContractSerial=serial;
 return ok({contract,ship,inventory});
}

/** Omitted offer IDs retain the three original watches for older clients. */
export function createNpcContract(game,roleId,options={}){
 if(!options.offerId&&['gunner','firehand','medic'].includes(roleId))return createNpcContractBase(game,roleId,options);
 const check=canHire(game);if(!check.ok)return check;
 const offers=crewWorkOffers(game),offer=options.offerId?offers.find(value=>value.offerId===options.offerId&&value.roleId===roleId):offers.find(value=>value.roleId===roleId);
 if(!offer)return fail('That work order is no longer posted. Check the crew board again.','offer');
 const result=createNpcContractBase(game,roleId,options);if(!result.ok)return result;
 const {contract,ship,inventory}=result,destination=game.system.bodies.find(body=>body.id===offer.destinationId);
 contract.version=2;contract.assignment=createWorkAssignment(offer,contract.id);contract.roleName=offer.name;contract.reward=offer.reward;
 contract.shipName=ship.name=({freight:'Common Carrier',fragile:'Gentle Arrival',passage:'Evening Shuttle',medical:'Clinic Runner',maintenance:'Worklight',survey:'Sounding Bell',construction:'Frame Tender',hullwork:'Patchwork Tender',escort:'Registered Courier'})[offer.familyId]||'Local service boat';
 contract.routeName=offer.routeName;contract.destination=destination?{systemId:game.state.systemId,bodyId:destination.id,name:destination.name,x:destination.x,y:destination.y,radius:destination.radius}:null;
 if(destination){const heading=Math.atan2(destination.y-contract.origin.y,destination.x-contract.origin.x);contract.workPoint={x:destination.x-Math.cos(heading)*(destination.radius+75),y:destination.y-Math.sin(heading)*(destination.radius+75)};}
 const worker=inventory.crew.find(crew=>crew.id===contract.work.crewId);
 worker.name=['Ira Moss','Dev Renn','Mina Hart','Sol Anwar','Tess Orin','Pax Bell'][hash(`${offer.seed}:worker`)%6];
 inventory.crew[0].name='Captain '+['Vale','Hosk','Maren','Rill','Sable','Venn'][hash(`${offer.seed}:pilot`)%6];
 // The posted watch creates these people once. Their identity is stored with
 // the physical vessel, independent of its pilot, employer, or next room view.
 for(const member of inventory.crew){
  member.species=chooseNpcSpecies(game.state.seed,member.id,{...check.body,systemId:game.state.systemId});
  if(member.species!=='human')member.name=(member.role==='pilot'?'Captain ':'')+speciesName(member.species,game.state.seed,member.id);
 }
 contract.assignment.workerName=worker.name;contract.assignment.pilotName=inventory.crew[0].name;
 worker.health=100;worker.status='active';worker.role=offer.familyId==='passage'?'passenger':'deckhand';worker.greeting=offer.familyId==='passage'?'I’m your passenger for this run. A quiet berth and a safe arrival will do.':'I’ll keep the ordinary deck checks moving while you handle the posted work order.';
 if(offer.familyId==='hullwork'){const damage=ensureDamageControl(ship),section=damage.sections.find(value=>value.id==='engineering')||damage.sections.at(-1);if(section)section.damage=Math.max(section.damage,18);}
 contract.work.lastHealth=100;contract.work.stagesDone=0;contract.work.routeVisited=false;contract.work.shots=0;
 inventory.crew[0].greeting='Finish the departure check and I’ll take us out. The work order is posted at your station.';
 return result;
}

function transition(game,contract,phase,text){contract.phase=phase;contract.phaseClock=0;if(text)emit(game,text);}
function targetEnemy(game,contract){return game.system.enemies.find(enemy=>enemy.id===contract.work.enemyId)||game._record?.().spawned?.find(enemy=>enemy.id===contract.work.enemyId)||null;}

function startIncident(game,contract){
 if(contract.incidentStarted)return;
 contract.incidentStarted=true;
 const ship=game.state.ship,work=contract.work;
 if(contract.roleId==='gunner'){
  const id=`${contract.id}:interdictor`,angle=ship.angle;
  const enemy={id,name:'Marked interdiction skiff',faction:'cinder',...enemyHullProfile('kestrel'),x:ship.x+Math.cos(angle)*390,y:ship.y+Math.sin(angle)*390,vx:0,vy:0,angle:angle+Math.PI,hp:60,maxHp:60,speed:28,damage:3,reward:0,active:true,cooldown:4,boardingCooldown:100000,professionJobId:contract.id,professionContributors:{},crewContractId:contract.id};
  game._record().spawned.push(enemy);game.system.enemies.push(enemy);work.enemyId=id;
  emit(game,'Pilot: the contracted interdiction target is ahead. Take the security console and hold FIRE. I’ll keep its hull in the firing arc.');
 }else if(contract.roleId==='firehand'){
  const damage=ensureDamageControl(ship),section=damage.sections.find(section=>section.id==='engineering')||damage.sections.at(-1);
  work.sectionId=section.id;section.fire=62;section.damage=Math.max(section.damage,32);work.lastFire=section.fire;work.lastDamage=section.damage;
  const hullLoss=Math.min(ship.hull-1,ship.maxHull*.06);ship.hull-=Math.max(0,hullLoss);
  damage.impacts.push({serial:++damage.serial,at:damage.clock,x:section.x,y:section.y,strength:.16,shieldOnly:false,sectionId:section.id,hullDamage:hullLoss});damage.impacts=damage.impacts.slice(-6);
  emit(game,`Pilot: the overheating assembly has ignited in ${section.name}. Suppress the fire, then repair the compartment. Supplies are aboard.`);
 }else{
  const patient=game.state.crew.find(crew=>crew.id===work.crewId);
  if(patient)patient.greeting='Please use the medical station to stabilize me. The ship’s instruments show my actual condition.';
  emit(game,'Pilot: Ira is ready for treatment. Use the medical station until the injured worker is stable. Their condition is visible on this deck.');
 }
 updateCabin(game);
}

function updateCabin(game){
 const contract=active(game);if(!contract)return;
 if(game.state.ship.id===contract.vesselId&&game.state.boarding?.phase!=='active')game._damageCrewPositions=game.state.crew.filter(crew=>Number.isFinite(crew.x)&&Number.isFinite(crew.y)).map(crew=>({crewId:crew.id,x:crew.x,y:crew.y}));
 if(game.state.interior?.kind!=='ship')return;
 Object.assign(game.state.interior.location,{id:`ship:${contract.vesselId}`,vesselId:contract.vesselId,name:`${contract.shipName} · hired crew`,vesselName:contract.shipName,ownership:'crew',ownerName:'Local service cooperative',shipClass:game.state.ship.classId,classId:game.state.ship.classId,crew:clone(game.state.crew),npcContractId:contract.id});
}

function observeWork(game,contract){
 const work=contract.work;
 if(!contract.incidentStarted||work.done)return;
 if(contract.roleId==='gunner'){
  const enemy=targetEnemy(game,contract);
  work.damage=Math.max(finite(work.damage),finite(enemy?.professionContributors?.[contract.employeeId]));
  work.targetHull=enemy?Math.max(0,finite(enemy.hp)):finite(work.targetHull,60);work.targetMaxHull=finite(enemy?.maxHp,60);
  if(work.damage>0&&!work.hitAnnounced){work.hitAnnounced=true;emit(game,`Gunner: confirmed hit. Your ship’s guns have dealt ${Math.floor(work.damage)} hull damage to the marked skiff.`);}
  if(enemy){const stored=game._record().spawned.find(value=>value.id===enemy.id);if(stored&&stored!==enemy)Object.assign(stored,{professionContributors:clone(enemy.professionContributors||{}),hp:enemy.hp,disabled:!!enemy.disabled});}
  const disabled=enemy?.disabled||enemy?.hp<=0||game._record().defeated.includes(work.enemyId);
  work.targetDisabled=!!disabled;work.progress=clamp(work.damage/36,0,1);work.done=!!(disabled&&work.damage>=12);
 }else if(contract.roleId==='firehand'){
  const section=ensureDamageControl(game.state.ship).sections.find(section=>section.id===work.sectionId);if(!section)return;
  // Natural fuel exhaustion is < .02 per simulation step and earns no wages.
  const suppressed=work.lastFire-section.fire,repaired=work.lastDamage-section.damage;
  if(suppressed>1)work.fireRemoved+=suppressed;if(repaired>1)work.damageRepaired+=repaired;
  work.lastFire=section.fire;work.lastDamage=section.damage;
  work.progress=(clamp(work.fireRemoved/50,0,1)+clamp(work.damageRepaired/25,0,1))/2;
  work.done=section.fire<=.1&&section.damage<=2&&work.fireRemoved>=20&&work.damageRepaired>=25;
 }else{
  const patient=game.state.crew.find(crew=>crew.id===work.crewId);
  if(patient){work.healed+=Math.max(0,patient.health-work.lastHealth);work.lastHealth=patient.health;work.progress=clamp(work.healed/52,0,1);work.done=patient.health>=90&&patient.status!=='dead'&&work.healed>=40;}
  if(!patient||patient.health<=0||patient.status==='dead'){contract.aborted=true;contract.failure='The patient did not survive.';transition(game,contract,'returning','Pilot: the patient did not survive. We are returning to port.');return;}
 }
 if(work.done){work.progress=1;transition(game,contract,'returning',contract.roleId==='gunner'?'Pilot: the marked skiff is disabled. Your confirmed ship-gun hits completed the watch. Returning to port for wages.':'Pilot: your assigned work is complete. Returning to the hiring port; wages are ready once we dock.');}
}

const modern=contract=>contract?.version===2&&contract.assignment?.version===2;
const taskFor=contract=>contract.assignment?.tasks?.find(task=>!task.done);
const workersFor=game=>game._npcWorkers||game._damageHumans||[game];
const employeeFor=(game,contract)=>workersFor(game).find(worker=>String(worker.playerId)===contract.employeeId)||(!game._sharedWorld?game:null);
function modernComms(game,contract,text){
 const comms=contract.assignment.comms;comms.push({at:Math.round(contract.clock),text});contract.assignment.comms=comms.slice(-5);emit(game,text);
}

export function npcEvaLocation(contract,ship){return{id:`eva:${contract.vesselId}`,vesselId:contract.vesselId,name:`${contract.shipName} · hull walk`,kind:'eva',biome:'eva',classId:ship.classId,shipClass:ship.classId,npcContractId:contract.id,ownership:'crew',ownerName:'Local service cooperative',crew:[]};}
function onEva(game,contract,worker,playerId){
 const location=worker.state.interior?.location;
 return String(playerId)===contract.employeeId&&worker.state.mode==='person'&&worker.state.interior?.kind==='eva'&&location?.vesselId===contract.vesselId&&location?.npcContractId===contract.id&&(!game._sharedWorld||game.netVesselId===contract.vesselId&&workersFor(game).includes(worker));
}
function retractEva(game,contract,worker,{emergency=false}={}){
 if(!worker)return;
 const layout=cabinLayout(game.state.ship.classId),eva=contract.assignment.eva;
 worker.state.mode='person';worker.state.locationId=`ship:${contract.vesselId}`;
 worker.state.interior={kind:'ship',liveVessel:true,location:{id:`ship:${contract.vesselId}`,vesselId:contract.vesselId,vesselName:contract.shipName,name:`${contract.shipName} · hired crew`,kind:'ship',biome:'ship',classId:game.state.ship.classId,shipClass:game.state.ship.classId,npcContractId:contract.id,ownership:'crew',ownerName:'Local service cooperative',crew:clone(game.state.crew)}};
 Object.assign(worker.state.person,layout.spawn,{vx:0,vy:0,moving:false,weaponDrawn:false});
 eva.active=false;eva.workerId=null;if(emergency){eva.emergency=true;worker.state.person.health=Math.max(1,worker.state.person.health-18);modernComms(game,contract,'Pilot: tether retracted. The suit reserve ran low; recover inside before another attempt.');}
}

function startModernComplication(game,contract){
 const complication=contract.assignment.complication;if(!complication.type||complication.started)return;
 complication.started=true;const originalRole=contract.roleId;
 // Reuse the physical incident actors and damage rules from the older watch,
 // but only when this work order's rare complication actually comes due.
 contract.roleId=({attack:'gunner',fire:'firehand',illness:'medic'})[complication.type];
 const quiet=game._quietCrewIncident;game._quietCrewIncident=true;
 try{contract.incidentStarted=false;startIncident(game,contract);}finally{contract.roleId=originalRole;game._quietCrewIncident=quiet;}
 if(complication.type==='illness'){
  const patient=game.state.crew.find(crew=>crew.id===contract.work.crewId);
  if(patient){patient.health=Math.min(patient.health,38);patient.status='injured';contract.work.lastHealth=patient.health;contract.work.healed=0;}
 }
 const messages={attack:'Pilot: an interdiction skiff is closing. Security station—bring its guns offline.',fire:'Pilot: a coolant fault has started a compartment fire. Suppress it, then repair the assembly.',illness:`Pilot: ${contract.assignment.workerName||'The deckhand'} has collapsed. Reach the medical station and stabilize them.`};
 modernComms(game,contract,messages[complication.type]);
}

function observeModernComplication(game,contract){
 const c=contract.assignment.complication,work=contract.work;if(!c.started||c.resolved)return;
 if(c.type==='attack'){
  const enemy=targetEnemy(game,contract);work.damage=Math.max(finite(work.damage),finite(enemy?.professionContributors?.[contract.employeeId]));
  work.targetHull=enemy?Math.max(0,finite(enemy.hp)):finite(work.targetHull,60);work.targetMaxHull=finite(enemy?.maxHp,60);work.targetDisabled=!!(enemy?.disabled||enemy?.hp<=0||game._record().defeated.includes(work.enemyId));
  const stored=game._record().spawned.find(value=>value.id===work.enemyId);if(stored&&enemy&&stored!==enemy)Object.assign(stored,{hp:enemy.hp,disabled:!!enemy.disabled,professionContributors:clone(enemy.professionContributors||{})});
  c.resolved=work.targetDisabled&&work.damage>=12;
 }else if(c.type==='fire'){
  const section=ensureDamageControl(game.state.ship).sections.find(value=>value.id===work.sectionId);if(!section)return;
  const suppressed=work.lastFire-section.fire,repaired=work.lastDamage-section.damage;
  if(suppressed>1)work.fireRemoved+=suppressed;if(repaired>1)work.damageRepaired+=repaired;
  work.lastFire=section.fire;work.lastDamage=section.damage;c.resolved=section.fire<=.1&&section.damage<=2&&work.fireRemoved>=20&&work.damageRepaired>=25;
 }else{
  const patient=game.state.crew.find(crew=>crew.id===work.crewId);
  if(!patient||patient.health<=0||patient.status==='dead'){if(!contract.emergency){contract.emergency=true;contract.aborted=true;contract.failure='The patient did not survive.';transition(game,contract,'returning','Pilot: we have lost the patient. Returning to port.');}return;}
  work.healed+=Math.max(0,patient.health-work.lastHealth);work.lastHealth=patient.health;c.resolved=patient.health>=90&&work.healed>=40;
 }
 if(c.resolved)modernComms(game,contract,'Pilot: the immediate danger is clear. Continue the work order when you’re ready.');
}

function observeModernWork(game,contract){
 observeModernComplication(game,contract);
 const a=contract.assignment,done=a.tasks.filter(task=>task.done).length;
 contract.work.stagesDone=done;contract.work.routeVisited=a.visitedDestination;
 contract.work.progress=Math.min(.95,done/a.tasks.length*.8+(a.visitedDestination ? .2 : 0));
 if(done===a.tasks.length&&a.visitedDestination&&a.complication.resolved&&!a.eva.active&&!contract.aborted&&contract.phase==='working'){
  a.delivered=true;contract.work.done=true;contract.work.progress=1;
  transition(game,contract,'returning');modernComms(game,contract,`Pilot: ${a.familyId==='hullwork'?'fitting secure':'handover signed'}. Heading home to ${contract.origin.name}; wages on arrival.`);
 }
}

function stepModernContract(game,contract,dt,input){
 const a=contract.assignment;contract.clock+=dt;contract.phaseClock+=dt;
 if(game.state.ship.hull<=0){contract.phase='failed';contract.dockedAt=null;contract.failure='The employer’s ship was lost.';return;}
 const pilot=game.state.crew.find(crew=>crew.id===`${contract.id}:pilot`);
 if(pilot&&pilot.health<=0&&!contract.emergency){contract.emergency=true;contract.aborted=true;contract.failure='The captain was lost. Emergency navigation is returning the ship.';if(a.eva.active)retractEva(game,contract,employeeFor(game,contract));transition(game,contract,'returning',contract.failure);}
 if(a.eva.active){
  const worker=employeeFor(game,contract);
  if(worker&&onEva(game,contract,worker,contract.employeeId)){
   a.eva.oxygen=Math.max(0,a.eva.oxygen-dt);
   if(a.eva.oxygen<=30&&!a.eva.warned){a.eva.warned=true;modernComms(game,contract,'Pilot: thirty seconds of suit reserve. Finish the fitting or return to the airlock.');}
   if(a.eva.oxygen<=0)retractEva(game,contract,worker,{emergency:true});
  }else if(worker){a.eva.active=false;a.eva.workerId=null;}
 }else a.eva.oxygen=Math.min(a.eva.maxOxygen,a.eva.oxygen+dt*8);
 if(contract.phase==='boarding'){
  if(!a.departureBrief){a.departureBrief=true;modernComms(game,contract,`Pilot: ${a.cargo} for ${a.destinationName}. Complete the departure check at your marked station.`);}
  if(a.tasks[0].done&&contract.phaseClock>=2){contract.dockedAt=null;transition(game,contract,'outbound');modernComms(game,contract,`Pilot: check received. Casting off for ${a.destinationName}.`);}
 }
 if(contract.phase==='outbound'){
  if(!a.cruiseBrief&&contract.phaseClock>=7){a.cruiseBrief=true;modernComms(game,contract,'Pilot: holding the local route. You can watch the passage or check the work order.');}
  if(a.complication.type&&!a.complication.started&&contract.phaseClock>=8&&distance(game.state.ship,contract.dockPoint)>250)startModernComplication(game,contract);
  // An actual threat briefly stops the run at its real position. The ship
  // keeps its inertia and faces the attacking contact through the pilot input.
  if(a.complication.started&&!a.complication.resolved&&a.complication.type==='attack'){a.interruptedLeg=true;transition(game,contract,'working');}
  if(distance(game.state.ship,contract.workPoint)<55&&Math.hypot(game.state.ship.vx,game.state.ship.vy)<28){
   a.visitedDestination=true;contract.work.routeVisited=true;transition(game,contract,'working');
   if(a.complication.type&&!a.complication.started)startModernComplication(game,contract);
   modernComms(game,contract,a.familyId==='hullwork'?'Pilot: holding position. Suit is ready; use the entry airlock for the exterior fitting.':`Pilot: alongside ${a.destinationName}. Finish the receiving check at your station.`);
  }
 }
 if(contract.phase==='working'){
  observeModernWork(game,contract);
  if(a.interruptedLeg&&a.complication.resolved&&!a.visitedDestination){a.interruptedLeg=false;transition(game,contract,'outbound');modernComms(game,contract,'Pilot: resuming the delivery route.');}
  if(contract.phase==='working'&&contract.phaseClock>=420){contract.aborted=true;if(a.eva.active)retractEva(game,contract,employeeFor(game,contract));transition(game,contract,'returning','Pilot: the receiving window has closed. Returning with the work recorded so far.');}
 }else observeModernComplication(game,contract);
 if(contract.phase==='returning'&&distance(game.state.ship,contract.dockPoint)<45&&Math.hypot(game.state.ship.vx,game.state.ship.vy)<18){
  contract.dockedAt=contract.origin.bodyId;Object.assign(game.state.ship,{vx:0,vy:0,angularVelocity:0});transition(game,contract,'docked');modernComms(game,contract,`Pilot: moored at ${contract.origin.name}. Collect your wages and step ashore.`);
 }
 if(input.fire&&!game._sharedWorld&&a.complication.started&&!a.complication.resolved&&a.complication.type==='attack')performNpcContractWork(game,'fire');
 updateCabin(game);
}

/** Called once per physical ship tick, before the ordinary inertia simulation. */
export function stepNpcContract(game,delta,input={}){
 const contract=active(game);if(!contract||game.state.ship.id!==contract.vesselId)return;
 const dt=clamp(finite(delta),0,.1);if(!dt)return;
 if(modern(contract))return stepModernContract(game,contract,dt,input);
 contract.clock+=dt;contract.phaseClock+=dt;
 if(game.state.ship.hull<=0){contract.phase='failed';contract.dockedAt=null;contract.failure='The employer’s ship was lost.';return;}
 const pilot=game.state.crew.find(crew=>crew.id===`${contract.id}:pilot`);
 if(pilot&&pilot.health<=0&&!contract.emergency){contract.emergency=true;contract.aborted=true;contract.failure='The NPC captain was lost. Emergency navigation is returning the ship.';transition(game,contract,'returning',contract.failure);}
 if(contract.phase==='boarding'&&contract.phaseClock>=5){contract.dockedAt=null;transition(game,contract,'outbound','Pilot: casting off. I have the helm; find your duty station.');}
 if(contract.phase==='outbound'&&distance(game.state.ship,contract.workPoint)<55&&Math.hypot(game.state.ship.vx,game.state.ship.vy)<28){transition(game,contract,'working');startIncident(game,contract);}
 if(contract.phase==='working'){
  observeWork(game,contract);
  if(contract.phase==='working'&&contract.phaseClock>=180){contract.aborted=true;transition(game,contract,'returning','Pilot: the watch is out of time. Returning to port; pay covers only the work you completed.');}
 }
 if(contract.phase==='returning'&&distance(game.state.ship,contract.dockPoint)<45&&Math.hypot(game.state.ship.vx,game.state.ship.vy)<18){
  contract.dockedAt=contract.origin.bodyId;game.state.ship.vx=0;game.state.ship.vy=0;game.state.ship.angularVelocity=0;
  transition(game,contract,'docked',`Moored at ${contract.origin.name}. Open Crew duty to collect your wages and go ashore.`);
 }
 // Solo input uses the same weapon command as the server crew action. The
 // shared authority supplies the actual employee, never an actor proxy input.
 if(input.fire&&!game._sharedWorld&&contract.roleId==='gunner'&&contract.phase==='working')performNpcContractWork(game,'fire');
 updateCabin(game);
}

/** Ordinary flight inputs: heading and velocity always retain their inertia. */
export function npcContractPilot(game){
 const contract=active(game);if(!contract||game.state.ship.id!==contract.vesselId)return null;
 const ship=game.state.ship,still={thrust:0,turn:0,strafe:0,brake:1,flightAssist:true,fire:false,mine:false};
 if(['boarding','docked','failed'].includes(contract.phase))return still;
 let target=contract.phase==='returning'?contract.dockPoint:contract.workPoint,desiredHeading;
 if(contract.phase==='working'){
  const enemy=(contract.roleId==='gunner'||modern(contract)&&contract.assignment.complication.type==='attack')&&targetEnemy(game,contract);
  if(!enemy||enemy.disabled||enemy.hp<=0)return still;
  desiredHeading=Math.atan2(enemy.y-ship.y,enemy.x-ship.x);
  // The NPC keeps the gunner's target in the bow arc without firing for them.
  const error=angleDelta(desiredHeading,ship.angle);
  return{...still,turn:clamp(error*2.5-finite(ship.angularVelocity)*1.1,-1,1)};
 }
 const dx=target.x-ship.x,dy=target.y-ship.y,range=Math.hypot(dx,dy),speed=Math.hypot(ship.vx,ship.vy);
 desiredHeading=Math.atan2(dy,dx);
 const error=angleDelta(desiredHeading,ship.angle),desiredSpeed=Math.min(145,Math.max(0,(range-12)*.75));
 const direction=range?{x:dx/range,y:dy/range}:{x:0,y:0};
 const forwardSpeed=ship.vx*direction.x+ship.vy*direction.y;
 const brake=range<32||speed>desiredSpeed+10||Math.abs(error)>1.15?1:0;
 return{thrust:!brake&&Math.abs(error)<.6&&forwardSpeed<desiredSpeed?clamp((desiredSpeed-forwardSpeed)/60,.12,1):0,turn:clamp(error*2.5-finite(ship.angularVelocity)*1.1,-1,1),strafe:0,brake,boost:false,flightAssist:true,fire:false,mine:false};
}

function workerAccess(game,contract,worker,playerId,station){
 if(String(playerId)!==contract.employeeId)return fail('This watch belongs to another hired worker.','permission');
 if(worker.state.person.health<=0||worker.state.person.down)return fail('You are incapacitated. Recover before using the station.','incapacitated');
 // A shared captain's saved ship is their personal hull, including while
 // visiting an employer. The authority's actual occupant list is canonical.
 const authoritativeAboard=game._sharedWorld&&game.netVesselId===contract.vesselId&&game._damageHumans?.includes(worker);
 const location=worker.state.interior?.location,aboard=worker.state.interior?.kind==='ship'&&(authoritativeAboard||location?.vesselId===contract.vesselId||worker.state.ship.id===contract.vesselId);
 if(!aboard)return fail('You must be on the employer’s actual ship.','vessel');
 if(station){const point=cabinLayout(game.state.ship.classId).stations[station];if(!point||distance(worker.state.person,point)>56)return fail(`Move to the ${station==='security'?'security / gun':station} station on this deck.`,'distance');}
 return ok({});
}

function modernTaskReady(game,contract,task){
 const a=contract.assignment,index=a.tasks.indexOf(task);
 if(!task||task.done)return fail('That part of the work order is already recorded.','completed');
 if(['returning','docked','failed'].includes(contract.phase))return fail('The work order has closed for this run.','phase');
 if(index>0&&(!a.tasks[0].done||!a.visitedDestination||contract.phase!=='working'||distance(game.state.ship,contract.workPoint)>90||Math.hypot(game.state.ship.vx,game.state.ship.vy)>35))return fail('The pilot must reach the actual receiving point before this part of the job.','route');
 if(a.complication.started&&!a.complication.resolved)return fail('Deal with the immediate danger before resuming routine work.','incident');
 return ok({});
}

function performModernWork(game,contract,action,{worker=game,playerId=worker.playerId||game.playerId||'local',sectionId,taskId,solution}={}){
 const a=contract.assignment;
 if(action==='exitEva'){
  if(!onEva(game,contract,worker,playerId)||!a.eva.active)return fail('You are not on this ship’s tethered hull walk.','vessel');
  const point=evaLayout(game.state.ship.classId).spawn;
  if(distance(worker.state.person,point)>56)return fail('Return to the marked exterior airlock.','distance');
  retractEva(game,contract,worker);observeModernWork(game,contract);updateCabin(game);return ok({text:'Back inside. Suit reserve is recharging.',perspective:'ship-deck'});
 }
 if(action==='enterEva'){
  const task=taskFor(contract),access=workerAccess(game,contract,worker,playerId,null);if(!access.ok)return access;
  if(task?.kind!=='eva')return fail('This work order does not need an exterior repair now.','task');
  const ready=modernTaskReady(game,contract,task);if(!ready.ok)return ready;
  if(distance(worker.state.person,cabinLayout(game.state.ship.classId).spawn)>56)return fail('Reach the ship’s entry airlock to put on the tethered suit.','distance');
  if(a.eva.oxygen<45)return fail('Let the suit reserve recharge inside before another hull walk.','oxygen');
  a.eva.active=true;a.eva.workerId=String(playerId);a.eva.trips++;a.eva.warned=false;
  worker.state.mode='person';worker.state.locationId=`eva:${contract.vesselId}`;worker.state.interior={kind:'eva',location:npcEvaLocation(contract,game.state.ship)};
  Object.assign(worker.state.person,evaLayout(game.state.ship.classId).spawn,{vx:0,vy:0,moving:false,weaponDrawn:false});
  modernComms(game,contract,'Pilot: tether secure. Follow the hull markings to the fitting, then return through this airlock.');
  return ok({text:'Tether secure. Follow the marked hull panel.',perspective:'eva'});
 }
 if(action==='task'){
  const task=taskFor(contract);
  if(!task||task.id!==taskId)return fail('Use the current task named in this work order.','task');
  const ready=modernTaskReady(game,contract,task);if(!ready.ok)return ready;
  const definition=crewTaskDefinition(contract,task);
  if(definition.station==='eva'){
   if(!onEva(game,contract,worker,playerId)||!a.eva.active||a.eva.oxygen<=0||worker.state.person.health<=0||worker.state.person.down)return fail('Use the assigned tethered suit to reach the exterior fitting.','eva');
   if(distance(worker.state.person,evaLayout(game.state.ship.classId).repair)>56)return fail('Reach the marked exterior fitting before working.','distance');
  }else{const access=workerAccess(game,contract,worker,playerId,definition.station);if(!access.ok)return access;}
  if(!Array.isArray(solution)||solution.length!==definition.solution.length||!solution.every((value,index)=>typeof value==='string'&&value.length<=40&&value===definition.solution[index]))return fail('Those settings do not match the work-order clues. Check them and try again.','solution');
  task.done=true;task.completedAt=contract.clock;
  if(task.kind==='triage'||task.kind==='comfort'){const patient=game.state.crew.find(crew=>crew.id===contract.work.crewId);if(patient){patient.health=Math.min(100,patient.health+8);patient.greeting='Thanks for checking. The rest of the trip feels less daunting.';}}
  if(task.kind==='eva'){
   const section=ensureDamageControl(game.state.ship).sections.find(value=>value.id==='engineering')||ensureDamageControl(game.state.ship).sections.at(-1);
   if(section)section.damage=Math.max(0,section.damage-18);
   modernComms(game,contract,'Pilot: fitting checks green. Come back through the airlock before we get under way.');
  }else modernComms(game,contract,task===a.tasks[0]?'Pilot: departure check signed. I have the helm.':'Pilot: receiving check signed. Good work.');
  observeModernWork(game,contract);updateCabin(game);
  return ok({text:task.kind==='eva'?'Fitting secured. Return to the airlock.':`${definition.title} recorded.`,taskId:task.id,done:contract.work.done});
 }
 const c=a.complication,expected={fire:'attack',heal:'illness',suppress:'fire',repair:'fire',patch:'fire'}[action];
 if(!c.started||c.resolved||expected!==c.type)return fail('That tool is not needed for the current work order.','role');
 if(!['outbound','working'].includes(contract.phase))return fail('The working watch has ended.','phase');
 const access=workerAccess(game,contract,worker,playerId,action==='fire'?'security':action==='heal'?'medical':null);if(!access.ok)return access;
 let result;
 if(action==='fire'){result=game.fireWeapons(playerId);if(result.ok){contract.work.shots=finite(contract.work.shots)+1;contract.work.lastShotAt=contract.clock;}}
 else if(action==='heal')result=game.medicalFromStation([worker]);
 else{
  if(sectionId&&sectionId!==contract.work.sectionId)return fail('Use the marked damaged compartment.','target');
  const original={person:game.state.person,mode:game.state.mode,interior:game.state.interior};game.state.person=worker.state.person;game.state.mode='person';game.state.interior=worker.state.interior;
  try{result=game.damageControl(contract.work.sectionId,action);}finally{Object.assign(game.state,original);}
 }
 if(result.ok){observeModernWork(game,contract);updateCabin(game);}return result;
}

/** Actor is the employer vessel; worker is the real player aboard it. */
export function performNpcContractWork(game,action,{worker=game,playerId=worker.playerId||game.playerId||'local',sectionId,taskId,solution}={}){
 const contract=active(game),definition=contract&&roleFor(contract.roleId);
 if(!contract||game.state.ship.id!==contract.vesselId)return fail('You are not aboard an active paid crew watch.','contract');
 if(modern(contract))return performModernWork(game,contract,action,{worker,playerId,sectionId,taskId,solution});
 const expected={fire:'gunner',heal:'medic',suppress:'firehand',repair:'firehand',patch:'firehand'}[action];
 if(!expected||expected!==contract.roleId)return fail('Use the tools for your assigned crew role.','role');
 if(contract.phase!=='working')return fail('The pilot will announce when the assigned work begins.','phase');
 const access=workerAccess(game,contract,worker,playerId,action==='fire'?definition.station:action==='heal'?'medical':null);if(!access.ok)return access;
 let result;
 if(action==='fire'){
  result=game.fireWeapons(playerId);
  if(result.ok){
   contract.work.shots=finite(contract.work.shots)+1;contract.work.lastShotAt=contract.clock;
   if(!contract.work.shotAnnounced){contract.work.shotAnnounced=true;emit(game,'Ship guns firing. These are the employer’s exterior pulse guns; hold FIRE while the NPC pilot keeps the marked target ahead. Confirmed hits appear in Crew duty.');}
  }
 }
 else if(action==='heal')result=game.medicalFromStation([worker]);
 else{
  if(sectionId&&sectionId!==contract.work.sectionId)return fail('Use the marked compartment for this assignment.','target');
  // Existing damage-control validation uses the actual worker position and
  // the employer's consumables, even when the server actor is in ship mode.
  const original={person:game.state.person,mode:game.state.mode,interior:game.state.interior};
  game.state.person=worker.state.person;game.state.mode='person';game.state.interior=worker.state.interior;
  try{result=game.damageControl(contract.work.sectionId,action);}finally{Object.assign(game.state,original);}
 }
 if(result.ok){observeWork(game,contract);updateCabin(game);}
 return result;
}

export function requestNpcContractReturn(game){
 const contract=active(game);if(!contract)return fail('There is no active crew watch.','contract');
 if(contract.phase==='docked')return ok({text:'The ship is moored. Collect the recorded pay and go ashore.'});
 if(contract.phase==='failed')return fail('The employer’s ship needs emergency recovery.','destroyed');
 if(modern(contract)&&contract.assignment.eva.active)retractEva(game,contract,employeeFor(game,contract));
 contract.aborted=!contract.work.done;
 if(contract.phase==='boarding'){contract.dockedAt=contract.origin.bodyId;transition(game,contract,'docked','The watch was cancelled before departure. No wages are due.');}
 else transition(game,contract,'returning','Pilot: understood. Returning to our hiring port. Pay is based on the work you completed.');
 return ok({text:'The NPC pilot is returning to port.',contract});
}

function modernStatus(game,contract){
 const a=contract.assignment,layout=cabinLayout(contract.classId),task=taskFor(contract),definition=task&&publicCrewTask(contract,task),complication=a.complication;
 const outside=game.state.interior?.kind==='eva'&&game.state.interior.location?.vesselId===contract.vesselId,exterior=evaLayout(contract.classId);
 let ready=task?modernTaskReady(game,contract,task):fail('The assigned work is recorded.','completed'),point=definition?.station==='eva'?outside?exterior.repair:layout.spawn:layout.stations[definition?.station||'engineering'];
 let target={stationRole:definition?.stationRole||roleFor(contract.roleId)?.stationRole,x:point?.x,y:point?.y};
 if(definition?.station==='eva')target={entityId:outside?'eva:repair':`ship:${contract.vesselId}:entry-airlock`,x:point?.x,y:point?.y};
 if(ready.ok&&definition){
  if(definition.station==='eva')ready=outside&&a.eva.active&&a.eva.oxygen>0?distance(game.state.person,exterior.repair)<=56?ok({}):fail('Walk to the marked exterior fitting.','distance'):fail('Reach the entry airlock and suit up.','eva');
  else if(distance(game.state.person,point)>56)ready=fail(`Reach the ${definition.station==='security'?'security':definition.station} station.`, 'distance');
 }
 let taskText=definition?.brief||'The pilot is bringing you back to port.',activeTask=definition?{...definition,ready:ready.ok,reason:ready.reason||null}:null;
 const incident=complication.started&&!complication.resolved;
 if(incident){
  activeTask=null;
  if(complication.type==='attack'){point=layout.stations.security;target={stationRole:'weapons',enemyId:contract.work.enemyId,...point};taskText='Security station: hold FIRE to disable the actual interdiction skiff.';}
  if(complication.type==='illness'){point=layout.stations.medical;target={stationRole:'medical',...point};taskText=`Medical station: stabilize ${a.workerName||'the deckhand'} before resuming the delivery.`;}
  if(complication.type==='fire'){
   const section=game.state.ship.id===contract.vesselId?ensureDamageControl(game.state.ship).sections.find(value=>value.id===contract.work.sectionId):null;
   target={sectionId:contract.work.sectionId,stationRole:'engineering',x:section?.x,y:section?.y};taskText='Reach the marked compartment: suppress the fire, then repair the assembly.';
  }
 }else if(contract.phase==='boarding')taskText='Reach your marked station and complete the departure check.';
 else if(contract.phase==='outbound')taskText=`Pilot flying to ${a.destinationName}. Your next check begins on arrival.`;
 else if(outside&&!task){target={entityId:'eva:airlock',...exterior.spawn};taskText='Fitting secure. Return to the marked airlock.';}
 else if(contract.phase==='returning'){activeTask=null;taskText=contract.work.done?'Work signed off. The pilot is returning for your pay.':'Returning early. Pay covers recorded work only.';}
 else if(contract.phase==='docked'){activeTask=null;taskText='Collect your pay and go ashore.';}
 else if(contract.phase==='failed'){activeTask=null;taskText=contract.failure||'Call for recovery.';}
 const canEnter=!outside&&task?.kind==='eva'&&ready.code==='eva'&&distance(game.state.person,layout.spawn)<=56&&a.eva.oxygen>=45;
 const progress=clamp(finite(contract.work.progress),0,1),earned=contract.emergency?0:contract.work.done?contract.reward:Math.floor(contract.reward*.35*progress);
 const firing=finite(contract.work.shots)>0&&contract.clock-finite(contract.work.lastShotAt)<.8;
 return{version:2,active:true,id:contract.id,roleId:contract.roleId,roleName:contract.roleName,title:a.title,familyId:a.familyId,cargo:a.cargo,stationRole:target.stationRole||definition?.stationRole,phase:contract.phase,task:taskText,taskBrief:taskText,done:contract.work.done,reward:contract.reward,earned,progress,firing,shipName:contract.shipName,origin:clone(contract.origin),routeName:contract.routeName,dockedAt:contract.dockedAt,canFinish:contract.phase==='docked',target,work:clone(contract.work),activeTask,tasks:a.tasks.map(value=>({id:value.id,title:publicCrewTask(contract,value)?.title||'Work recorded',done:!!value.done})),comms:clone(a.comms||[]),complication:incident?{type:complication.type,active:true,title:({attack:'Interdiction alert',fire:'Compartment fire',illness:'Crew member ill'})[complication.type]}:null,eva:a.familyId==='hullwork'?{active:outside&&a.eva.active,oxygen:a.eva.oxygen,maxOxygen:a.eva.maxOxygen,canEnter,canExit:outside&&distance(game.state.person,exterior.spawn)<=56}:null};
}

export function npcContractStatus(game){
 const contract=active(game);if(!contract)return null;
 if(modern(contract))return modernStatus(game,contract);
 const definition=roleFor(contract.roleId),layout=cabinLayout(contract.classId),section=game.state.ship.id===contract.vesselId?ensureDamageControl(game.state.ship).sections.find(value=>value.id===contract.work.sectionId):null;
 const point=section||layout.stations[definition.station],stationRole=definition.stationRole;
 let task=definition.task;
 const firing=contract.roleId==='gunner'&&finite(contract.work.shots)>0&&contract.clock-finite(contract.work.lastShotAt)<.8;
 if(contract.phase==='boarding')task='The NPC captain departs in a few seconds. Find your duty station; your own ship stays parked.';
 else if(contract.phase==='outbound')task='The NPC captain is flying to the service waypoint. Prepare at your station.';
 else if(contract.phase==='working'&&contract.roleId==='gunner')task=`${firing?'Ship guns firing.':contract.work.shots?'Guns ready. Keep holding FIRE at the security console.':definition.task} Confirmed target damage: ${Math.floor(finite(contract.work.damage))} / 36. Target hull: ${Math.ceil(finite(contract.work.targetHull,60))} / ${Math.ceil(finite(contract.work.targetMaxHull,60))}.`;
 else if(contract.phase==='returning')task=contract.work.done?contract.roleId==='gunner'?'Target disabled by your confirmed ship-gun hits. The NPC captain is returning for wages.':'Your duty is complete. The NPC captain is returning to the hiring port.':'Returning early. Wages cover completed work only.';
 else if(contract.phase==='docked')task='The ship is moored. Collect your wages and go ashore.';
 else if(contract.phase==='failed')task=contract.failure||'The ship was lost. Call for recovery.';
 const progress=clamp(finite(contract.work.progress),0,1),earned=contract.emergency?0:contract.work.done?contract.reward:Math.floor(contract.reward*.35*progress);
 return{active:true,id:contract.id,roleId:contract.roleId,roleName:definition.name,stationRole,phase:contract.phase,task,done:contract.work.done,reward:contract.reward,earned,progress,firing,shipName:contract.shipName,origin:clone(contract.origin),routeName:contract.routeName,dockedAt:contract.dockedAt,canFinish:contract.phase==='docked',target:{stationRole,crewId:contract.roleId==='medic'?contract.work.crewId:null,sectionId:contract.work.sectionId,enemyId:contract.work.enemyId,x:point?.x,y:point?.y},work:clone(contract.work)};
}

/** Pays once only after the same physical employer ship returns to port. */
export function settleNpcContract(game,{interrupted=false,ship=game.state.ship}={}){
 const contract=active(game);if(!contract)return fail('There is no unpaid crew watch.','contract');
 if(contract.paid||(game.state.npcContractHistory||[]).some(entry=>entry.id===contract.id))return fail('This watch has already been settled.','paid');
 if(!interrupted&&(contract.phase!=='docked'||contract.dockedAt!==contract.origin.bodyId||ship.id!==contract.vesselId||ship.hull<=0||distance(ship,contract.dockPoint)>60||game.state.systemId!==contract.origin.systemId))return fail('The NPC ship must physically return and dock before the watch can be paid.','docking');
 interrupted=interrupted||contract.emergency===true;
 const progress=clamp(finite(contract.work.progress),0,1),wages=interrupted?0:contract.work.done?contract.reward:Math.floor(contract.reward*.35*progress);
 game.state.credits+=wages;
 if(game.state.rep&&contract.factionId in game.state.rep)game.state.rep[contract.factionId]=clamp(finite(game.state.rep[contract.factionId])+(contract.work.done&&!interrupted?1:contract.aborted||interrupted?-1:0),-100,100);
 if(contract.work.done&&!interrupted){game.state.stats.jobs++;game._flag?.('first_job');game._flag?.('crew_watch_completed');}
 contract.paid=true;contract.active=false;contract.paidAmount=wages;contract.completedAt=finite(game.state.stats?.time);contract.outcome=interrupted?'interrupted':contract.work.done?'completed':'partial';
 const entry={id:contract.id,roleId:contract.roleId,origin:clone(contract.origin),wages,outcome:contract.outcome,at:contract.completedAt};
 game.state.npcContractHistory=[...(game.state.npcContractHistory||[]),entry].slice(-32);
 const text=interrupted?'The crew watch ended in emergency recovery. No wages were paid.':`${contract.roleName} watch settled: ${wages} credits. ${contract.work.done?'Your assigned work is complete.':'Only completed work was paid.'}`;
 game._log?.('Crew watch',text,'job');emit(game,text);
 return ok({text,wages,contract,origin:clone(contract.origin)});
}

function restorePersonal(game,contract){
 const personal=contract.personal;if(!personal)return;
 game.state.ship=personal.ship;
 for(const field of inventoryFields)game.state[field]=personal[field];
 game.state.mode='person';game.state.systemId=contract.origin.systemId;game.state.locationId=contract.origin.bodyId;game.state.interior=null;game.state.exploration=null;game.state.person.weaponDrawn=false;
 const body=game.system.bodies.find(body=>body.id===contract.origin.bodyId);
 if(body){const surface=generateSurface(body,game.state.seed,game.state.flags);Object.assign(game.state.person,surface.spawn);}
 delete contract.personal;game.state.npcContract=null;
 game._damageHullOverride=null;game._damageCrewPositions=null;game._refreshJobs?.();
}

export const NpcContractRules={
 initializeNpcContracts(){
  this.state.npcContractSerial=Math.max(0,Math.floor(finite(this.state.npcContractSerial)));
  this.state.npcContractHistory=Array.isArray(this.state.npcContractHistory)?this.state.npcContractHistory.slice(-32):[];
  const contract=active(this);
  // Personal inventory is temporarily parked during a solo hired watch. It
  // needs the same legacy fallback as the currently occupied employer hull.
  for(const collection of [this.state.crew,this.state.formerCrew,this.state.memorial,this.state.npcContract?.personal?.crew,this.state.npcContract?.personal?.formerCrew,this.state.npcContract?.personal?.memorial])
   if(Array.isArray(collection))for(const member of collection)if(member&&typeof member==='object')member.species=normalizeSpecies(member.species);
  if(contract&&roleFor(contract.roleId)&&contract.origin&&contract.work){
   contract.clock=Math.max(0,finite(contract.clock));contract.phaseClock=Math.max(0,finite(contract.phaseClock));
   if(contract.personal&&this.state.ship.id===contract.vesselId){this.state.ship.npcEmployer=true;updateCabin(this);}
  }else if(this.state.npcContract){
   const personal=this.state.npcContract.personal;
   if(personal?.ship){this.state.ship=personal.ship;for(const field of inventoryFields)if(personal[field]!==undefined)this.state[field]=personal[field];}
   this.state.npcContract=null;
  }
 },
 npcContractOffers(){return npcContractOffers(this);},
 acceptNpcContract(roleId,options={}){
  if(this._sharedWorld)return fail('The shared galaxy authority must assign the employer’s vessel.','authority');
  const result=createNpcContract(this,roleId,options);if(!result.ok)return result;
  const {contract,ship,inventory}=result;
  contract.personal={ship:this.state.ship,...Object.fromEntries(inventoryFields.map(field=>[field,this.state[field]??(field==='boarding'?null:field==='cargo'?{ore:0,crystal:0}:field==='upgrades'?{}:[])]))};
  this.state.npcContract=contract;this.state.ship=ship;for(const field of inventoryFields)this.state[field]=inventory[field];
  this.state.mode='ship';this.state.interior=null;this.state.locationId=null;this.state.exploration=null;this.state.pendingEncounter=null;
  const location={id:`ship:${ship.id}`,vesselId:ship.id,vesselName:ship.name,name:`${ship.name} · hired crew`,kind:'ship',biome:'ship',shipClass:ship.classId,classId:ship.classId,crew:clone(inventory.crew),ownership:'crew',ownerName:'Local service cooperative',faction:contract.factionId,npcContractId:contract.id};
  this._enterInterior(location,'ship');updateCabin(this);
  emit(this,`Signed on as ${contract.roleName.toLowerCase()}. The NPC captain flies; your work earns up to ${contract.reward} credits on return.`);
  return ok({text:`You board the employer’s ship as ${contract.roleName.toLowerCase()}.`,contract,body:location});
 },
 stepNpcContract(dt,input={}){return stepNpcContract(this,dt,input);},
 npcContractPilot(){return npcContractPilot(this);},
 npcContractStatus(){return npcContractStatus(this);},
 contractStatus(){return npcContractStatus(this);},
 npcContractAction(action,options={}){if(typeof action==='object'){options=action;action=options.action;}return performNpcContractWork(this,action,options);},
 cancelNpcContract(){return requestNpcContractReturn(this);},
 completeNpcContract(){
  if(this._sharedWorld)return fail('Settle this shared watch through the galaxy authority.','authority');
  const contract=active(this),result=settleNpcContract(this);if(result.ok)restorePersonal(this,contract);return result;
 },
 recoverNpcContract(message){
  const contract=active(this);if(!contract||this._sharedWorld)return false;
  settleNpcContract(this,{interrupted:true});restorePersonal(this,contract);
  this.state.person.health=Math.max(35,this.state.person.health||0);this.state.person.down=false;this.state.stats.rescues++;this._recoveryTimer=8;
  this._event?.('rescue',{text:message||'An emergency shuttle brought you back to the hiring port. Your own ship remains where you parked it.'});return true;
 }
};
