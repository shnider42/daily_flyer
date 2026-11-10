/** Civilian travel and a shipless origin. The same economy applies to every captain. */
import {SHIP_CLASSES,STARTER_SHIP_IDS} from './fleet.mjs';
import {generateSurface} from './surface.mjs';

const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=value=>JSON.parse(JSON.stringify(value));
export const normalizeStartMode=value=>value==='hardcore'?'hardcore':'regular';
export const isPassengerPort=body=>!!body&&body.landable!==false&&!['blackhole','site','ship','derelict'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome)));
const validBerth=(game,value)=>value&&typeof value.vesselId==='string'&&game.galaxy.some(system=>system.id===value.systemId&&system.bodies.some(body=>body.id===value.bodyId&&isPassengerPort(body)));
const landing=game=>!game.state.interior&&game.system.bodies.find(body=>body.id===game.state.locationId);
const quarantineOpen=game=>game.hasFlag('vault_recovered')&&game.hasFlag('homeward_signal')&&game.hasFlag('threshold_answered');

export const LivelihoodRules={
 initializeLivelihoods(){
  const raw=this.state.livelihoods&&typeof this.state.livelihoods==='object'?this.state.livelihoods:{};
  this.state.startMode=normalizeStartMode(this.state.startMode);
  this.state.livelihoods={version:1,parkedShip:validBerth(this,raw.parkedShip)?{...clone(raw.parkedShip),systemId:raw.parkedShip.systemId,bodyId:raw.parkedShip.bodyId,vesselId:raw.parkedShip.vesselId}:null,
   transitSerial:Math.max(0,Math.floor(finite(raw.transitSerial))),journeys:(Array.isArray(raw.journeys)?raw.journeys:[]).filter(value=>value&&typeof value.id==='string'&&typeof value.fromBody==='string'&&typeof value.toBody==='string').slice(-16).map(value=>({id:value.id.slice(0,180),systemId:String(value.systemId||'').slice(0,100),fromBody:value.fromBody.slice(0,100),toBody:value.toBody.slice(0,100),fare:Math.max(0,Math.floor(finite(value.fare))),at:Math.max(0,finite(value.at))}))};
  // The compatibility ship record is deliberately not a physical vessel. It
  // lets older cargo/stat consumers load a captain who has never owned a hull.
  if(!this.ownsShip&&!this.state.npcContract?.active){
   this.state.fleet.owned=[];
   if(!this.hasActiveVessel&&(this.state.mode!=='person'||(!this.state.interior&&!landing(this)))){
    const body=this.system.bodies.find(body=>body.id===this.state.lastBodyId&&isPassengerPort(body))||this.system.bodies.find(body=>body.id==='morrow')||this.system.bodies.find(isPassengerPort);
    if(body)this._arriveAsPassenger(body,{discovery:false});
   }
  }
  return this.state.livelihoods;
 },
 /** True only if this captain's actual hull is at the current landing. */
 canUseOwnShipHere(){
  if(!this.ownsShip||this.state.npcContract?.active)return false;
  const ship=this.personalShip;
  if(!ship||ship.destroyed||ship.hull<=0)return false;
  const body=landing(this);
  if(body){
   const berth=this.state.livelihoods?.parkedShip;
   if(berth?.vesselId===ship.id&&(berth.systemId!==this.state.systemId||berth.bodyId!==body.id))return false;
   return distance(ship,body)<=body.radius+160;
  }
  return this.state.mode==='ship'||this.state.interior?.kind==='ship';
 },
 ownShipAccess({atPort=false}={}){
  if(this.state.npcContract?.active)return this._fail('Finish your crew contract at the employer’s dock before using your own ship.','contract');
  // The shared authority sets this only inside a role-checked command against
  // the actual borrowed hull. Permission never changes personal ownership.
  if(this._permittedVessel===this.state.ship&&this.hasActiveVessel)return this._ok();
  if(!this.ownsShip)return this._fail('You do not own a ship yet. Local work, paid passage and crew contracts can help you earn one.','no-ship');
  if(atPort&&this.atInhabitedPort&&!this.canUseOwnShipHere()){
   const berth=this.state.livelihoods?.parkedShip,body=this.galaxy.find(system=>system.id===berth?.systemId)?.bodies.find(body=>body.id===berth?.bodyId);
   return this._fail(body?`Your ship is still at ${body.name}. Buy passage back before launching or fitting it.`:'Your ship is not at this landing. Return to its port before launching or fitting it.','ship-location');
  }
  return this._ok();
 },
 /** A used first hull is a cash purchase; collecting space ore is not an entry requirement. */
 usedStarterQuote(id){
  const shipClass=SHIP_CLASSES.find(ship=>ship.id===id&&STARTER_SHIP_IDS.includes(id));
  if(!shipClass)return this._fail('Only the three small starter hulls are sold through the used-ship counter.','target');
  const cost=shipClass.cost,credits=Math.floor(this.state.credits),affordable=credits>=cost;
  return {ok:affordable,shipClass,cost,ore:0,credits,used:true,affordable,...(!affordable?{code:'cost',reason:`This used ${shipClass.name} costs ${cost} cr; you have ${credits} cr.`}:{})};
 },
 /** Called only after a paid purchase has succeeded; this never grants a free hull. */
 claimFirstShip(){
  const ship=this.state.ship,body=landing(this);
  delete ship.unowned;
  if(!this.state.fleet.owned.includes(ship.classId))this.state.fleet.owned.push(ship.classId);
  if(body){
   Object.assign(ship,{x:body.x,y:body.y+body.radius+75,vx:0,vy:0,angle:Math.PI/2,angularVelocity:0});
   this.state.livelihoods.parkedShip={...clone(ship),systemId:this.state.systemId,bodyId:body.id,vesselId:ship.id};
  }
  this._flag('first_ship_owned');
  this._checkChapters();
  return this._ok({ship,body});
 },
 passengerRoutes(){
  if(!this.atInhabitedPort)return [];
  return this.system.bodies.filter(body=>body.id!==this.state.locationId&&isPassengerPort(body)).map(body=>this.passengerQuote(body.id));
 },
 passengerQuote(bodyId){
  const origin=landing(this),body=this.system.bodies.find(body=>body.id===bodyId),credits=Math.floor(this.state.credits);
  if(!this.atInhabitedPort||!origin)return {...this._fail('Buy passenger passage at an inhabited port.','mode'),credits};
  if(!body||!isPassengerPort(body)||body.id===origin.id)return {...this._fail('Choose another inhabited planet or station in this system.','target'),credits};
  const fare=18+Math.ceil(distance(origin,body)/120),base={body,bodyId:body.id,name:body.name,originId:origin.id,originName:origin.name,systemId:this.state.systemId,fare,cost:fare,credits,remaining:Math.max(0,credits-fare),service:'Local passenger ferry'};
  if(this.state.npcContract?.active)return {...this._fail('Finish your signed crew contract before buying passenger passage.','contract'),...base};
  if(this.state.person.health<=0||this.state.person.down)return {...this._fail('You are incapacitated and cannot board passenger transport.','incapacitated'),...base};
  if(this.state.pendingEncounter)return {...this._fail('Finish your conversation before boarding.','encounter'),...base};
  if(body.id==='earth'&&!quarantineOpen(this))return {...this._fail('Earth’s quarantine corridor is closed to you. Passenger ferries require the same landing permission as private ships.','quarantine'),...base};
  if(credits<fare)return {...this._fail(`Passage costs ${fare} cr; you have ${credits} cr. The local contract exchange always has a paid maintenance shift. Make repairs before buying a ticket.`,'cost'),...base};
  return this._ok({...base,available:true});
 },
 takePassengerTransit(bodyId){
  const quote=this.passengerQuote(bodyId);if(!quote.ok)return quote;
  const origin=landing(this),state=this.state.livelihoods,ship=this.personalShip;
  if(this.ownsShip&&distance(ship,origin)<=origin.radius+160){
   state.parkedShip={...clone(ship),systemId:this.state.systemId,bodyId:origin.id,vesselId:ship.id};
   Object.assign(ship,{vx:0,vy:0,angularVelocity:0});
  }
  this.state.credits-=quote.fare;
  const receipt={id:`passage:${this.playerId}:${++state.transitSerial}`,systemId:this.state.systemId,fromBody:origin.id,toBody:quote.body.id,fare:quote.fare,at:this.state.stats.time};
  state.journeys.push(receipt);state.journeys=state.journeys.slice(-16);
  this._arriveAsPassenger(quote.body);
  this.state.stats.passengerTrips=(this.state.stats.passengerTrips||0)+1;
  const text=`Passenger ferry: ${origin.name} → ${quote.body.name}. Fare ${quote.fare} cr paid; ${Math.floor(this.state.credits)} cr remaining.${this.ownsShip?' Your ship remains at its own berth.':''}`;
  this._log('Passenger passage',text,'passage');
  this._event('passenger-arrived',{body:quote.body,receipt:clone(receipt),text});
  return this._ok({body:quote.body,receipt:clone(receipt),fare:quote.fare,credits:this.state.credits,text});
 },
 _arriveAsPassenger(body,{discovery=true}={}){
  const surface=generateSurface(body,this.state.seed,this.state.flags);
  Object.assign(this.state,{mode:'person',locationId:body.id,lastBodyId:body.id,interior:null,exploration:null,boarding:null});
  Object.assign(this.state.person,{...surface.spawn,facing:'up',moving:false,weaponDrawn:false});
  this._flag(`visited_${body.id}`);this._flag(`landed_${body.id}`);this._flag('first_landing');
  if(body.id==='kettle')this._flag('docked_kettle');
  if(body.id==='morrow')this._flag('landed_morrow');
  const visitId=`${this.state.systemId}/${body.id}`;
  if(!this.state.visited.includes(visitId))this.state.visited.push(visitId);
  if(discovery){this._refreshJobs();this._checkChapters();}
  return body;
 },
 recoverOnFoot(message){
  const body=landing(this)||this.system.bodies.find(body=>body.id===this.state.lastBodyId&&isPassengerPort(body))||this.system.bodies.find(isPassengerPort);
  if(!body)return this._fail('No inhabited port is available for recovery.','location');
  this._arriveAsPassenger(body);
  const cost=Math.floor(this.state.credits*.12);this.state.credits-=cost;
  this.state.cargo.ore=Math.floor(this.state.cargo.ore*.5);this.state.cargo.crystal=Math.floor(this.state.cargo.crystal*.5);
  this.state.person.health=Math.max(1,Math.ceil((this.state.person.maxHealth||100)*.6));delete this.state.person.down;
  this.state.stats.rescues++;this._recoveryTimer=8;
  this.narrativeRescue?.();this.professionRescue?.();
  this._log('Port recovery',message||'The local clinic returned you to the settlement. Your ship ownership is unchanged.','log');
  this._event('rescue',{body,cost,text:message||'Recovered at the local clinic.'});
  return this._ok({body,cost});
 }
};
