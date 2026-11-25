/** SUNCOAST co-op: one city clock, independent bodies, one shared story. */
import * as Sim from './sim.mjs';
import {WORLD, LOCATIONS, VEHICLE_TYPES, isLand} from './world.mjs';
import {MISSIONS} from './content.mjs';

const R=Sim.coopRules;
const COLORS=['#71d9c6','#edbc6b','#afacfa','#ee9bad'];
const PERSONAL=['player','wanted','phase','outcome','job','stats','notification','notifications','_fire','_copSpawn','_water','_lastSwimNote','_lastDoor'];
const SHARED=['time','dayTime','vehicles','npcs','police','bullets','effects','progress','mission','_rng','_checkpoint'];
const clone=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const members=w=>Object.values(w.players);
const live=w=>members(w).filter(m=>m.connected);
const seatCount=car=>car.type==='motorcycle'?1:car.type==='sport'?2:4;
const cleanName=name=>String(name||'Crew member').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24)||'Crew member';
const goodId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
const ok=()=>({ok:true});
const fail=error=>({ok:false,error});

function view(w,m,{story=true}={}){
 const g={...w.game};for(const key of PERSONAL)g[key]=m[key];
 g.dialogue=m.dialogue||(story&&m.id===w.hostId&&m.phase==='playing'?w.storyDialogue:null);
 g._coop=true;g._connected=m.connected;g._coopCounter=w.counter;g._id=w.counter.value;
 return g;
}
function rememberPersonal(m,g){for(const key of PERSONAL)m[key]=g[key];}
function rememberShared(w,g){for(const key of SHARED)w.game[key]=g[key];w.game._id=w.counter.value;}
function identifyDialogue(w,d){if(d&&!d.id)d.id=`dialogue-${++w.counter.value}`;return d;}
function tell(w,m,text,kind='info'){
 const g=view(w,m,{story:false});R.note(g,text,kind);rememberPersonal(m,g);w.game._id=w.counter.value;
}
function tellAll(w,text,kind='info',except=null){for(const m of members(w))if(m.id!==except)tell(w,m,text,kind);}

// Call an ordinary game rule against the selected actor. Arrays remain shared,
// while health, heat, services and recovery belong to the selected person.
function run(w,m,operation,{story=true,consumeStory=false}={}){
 const g=view(w,m,{story}),beforeDialogue=g.dialogue,oldStory=w.storyDialogue;
 const completed=new Set(w.game.progress.completed),oldStep=w.game.mission?.id+':'+w.game.mission?.step;
 const result=operation(g);
 rememberPersonal(m,g);rememberShared(w,g);
 if(g.dialogue?._kind==='service')m.dialogue=identifyDialogue(w,g.dialogue);
 else if(g.dialogue){w.storyDialogue=identifyDialogue(w,g.dialogue);if(beforeDialogue?._kind==='service')m.dialogue=null;}
 else{
  if(beforeDialogue?._kind==='service')m.dialogue=null;
  if(consumeStory&&beforeDialogue===oldStory)w.storyDialogue=null;
 }
 for(const missionId of w.game.progress.completed){
  if(completed.has(missionId))continue;
  const mission=MISSIONS.find(x=>x.id===missionId);
  for(const other of members(w)){
   if(other!==m){other.player.cash+=mission?.reward||0;tell(w,other,`${mission?.title||'Story job'} complete · $${mission?.reward||0} paid to each crew member.`,'complete');}
   if(missionId==='first_favor')other.player.hasPistol=true;
  }
  w.storyDialogue=null;
 }
 if(oldStep!==w.game.mission?.id+':'+w.game.mission?.step&&w.game.mission){
  const title=MISSIONS.find(x=>x.id===w.game.mission.id)?.title;
  for(const other of members(w))if(other!==m)tell(w,other,`${title||'Crew story'}: objective updated.`,'mission');
 }
 w.revision++;
 return result;
}

function freshMember(w,id,name){
 const base=Sim.createGame(),p={...base.player};
 const used=new Set(members(w).map(m=>m.color)),color=COLORS.find(c=>!used.has(c))||COLORS[0];
 const host=w.players[w.hostId],offset=members(w).length*24;
 if(host?.phase==='playing'){
  if(host.player.interior){p.interior=host.player.interior;p.x=clamp(host.player.x+offset,40,600);p.y=clamp(host.player.y+20,40,420);}
  else{
   const anchor=host.player;
   Object.assign(p,R.safePoint(anchor.x+offset,anchor.y+40,10,true,w.game.progress.unlocked));
  }
 }
 Object.assign(p,{id,name:cleanName(name),color,seat:null,vehicleId:null,lastVehicleId:null,hasPistol:w.game.progress.completed.includes('first_favor'),invulnerable:6});
 const m={id,name:p.name,color,connected:true,dialogue:null,lastPing:-999,controlResetUntil:0};
 for(const key of PERSONAL)m[key]=clone(base[key]??null);
 m.player=p;m.notifications=[];m.notification='';m.job=null;m._fire=0;m.phase='playing';m.outcome=null;
 m.wanted.lastX=p.x;m.wanted.lastY=p.y;
 return m;
}

/** A crew checkpoint is deliberately a different format from a solo save. */
export function createCoopGame({hostId,name='Crew leader',save=null}={}){
 if(!goodId(hostId))throw new Error('A valid crew identity is required.');
 const base=Sim.createGame();
 const w={version:1,game:base,players:Object.create(null),hostId,storyDialogue:null,pings:[],counter:{value:base._id},revision:0};
 w.players[hostId]=freshMember(w,hostId,name);
 if(save!==null)restoreCheckpoint(w,save);
 tell(w,w.players[hostId],'Your crew shares this city and story. Invite up to three friends. Your solo story is separate.');
 return w;
}

export function addCoopPlayer(w,{id,name='Crew member'}={}){
 if(!goodId(id))return fail('Invalid crew identity.');
 if(w.players[id])return fail('That crew member is already here.');
 if(members(w).length>=4)return fail('This crew already has four players.');
 w.players[id]=freshMember(w,id,name);
 tell(w,w.players[id],`You joined ${w.players[w.hostId]?.name||'the crew'}. Follow the gold objective; the crew leader handles story choices.`);
 tellAll(w,`${w.players[id].name} joined the crew.`,'info',id);w.revision++;
 return ok();
}

function dismount(w,m,{position=true,promote=true}={}){
 const p=m.player,car=w.game.vehicles.find(v=>v.id===p.vehicleId);
 if(!car){p.vehicleId=null;p.seat=null;return;}
 const wasDriver=car.driverId===m.id;
 car.passengerIds=(car.passengerIds||[]).filter(id=>id!==m.id);
 if(wasDriver){car.driverId=null;car.speed=0;car.driver=false;}
 p.lastVehicleId=car.id;p.vehicleId=null;p.seat=null;p.interior=null;
 if(position){
  // Impound moves the vehicle to the station; innocent passengers stay where
  // they were when it was seized, instead of teleporting with the car.
  const origin=car.impounded?p:car,side={x:origin.x+Math.cos(car.angle+Math.PI/2)*38,y:origin.y+Math.sin(car.angle+Math.PI/2)*38};
  Object.assign(p,car.type==='boat'&&!car.impounded?side:R.safePoint(side.x,side.y,10));p.invulnerable=Math.max(p.invulnerable||0,2);
 }
 if(wasDriver&&promote&&car.hp>0&&!car.impounded){
  const next=(car.passengerIds||[]).map(id=>w.players[id]).find(a=>a?.connected&&a.phase==='playing');
  if(next){car.driverId=next.id;car.driver=true;car.passengerIds=car.passengerIds.filter(id=>id!==next.id);next.player.seat='driver';next.controlResetUntil=w.game.time+.35;tell(w,next,'The driver stepped out. You are driving now; the vehicle is stopped.');}
 }
}

function syncSeats(w){
 for(const car of w.game.vehicles){
  if(car.driverId&&!w.players[car.driverId]){car.driverId=null;car.driver=false;car.speed=0;}
  car.passengerIds=(car.passengerIds||[]).filter(id=>w.players[id]?.player.vehicleId===car.id);
 }
 for(const m of members(w)){
  if(m.phase!=='playing')m.dialogue=null;
  const p=m.player;if(!p.vehicleId){p.seat=null;continue;}
  const car=w.game.vehicles.find(v=>v.id===p.vehicleId);
  if(!car||car.hp<=0||car.impounded||m.phase!=='playing'){dismount(w,m,{promote:car?.hp>0&&!car?.impounded});continue;}
  if(car.driverId!==m.id&&!(car.passengerIds||[]).includes(m.id)){dismount(w,m);continue;}
  p.seat=car.driverId===m.id?'driver':'passenger';p.x=car.x;p.y=car.y;p.angle=car.angle;p.interior=null;p.swimming=false;
 }
 for(const car of w.game.vehicles){
  if(car.driverId&&w.players[car.driverId]?.player.vehicleId!==car.id){car.driverId=null;car.driver=false;car.speed=0;}
  if(car.driverId)car.driver=true;
 }
}

export function removeCoopPlayer(w,id){
 const m=w.players[id];if(!m)return false;
 dismount(w,m);delete w.players[id];
 w.game.police=w.game.police.filter(c=>c.targetId!==id);
 w.pings=w.pings.filter(p=>p.playerId!==id);
 if(w.hostId===id)w.hostId=live(w)[0]?.id||members(w)[0]?.id||null;
 tellAll(w,`${m.name} left the crew.`);w.revision++;return true;
}
export function setCoopHost(w,id){
 if(!w.players[id])return false;
 if(w.hostId!==id){w.hostId=id;tellAll(w,`${w.players[id].name} is now the crew leader. Story choices stay with the crew.`);w.revision++;}
 return true;
}
export function setCoopConnected(w,id,connected){
 const m=w.players[id];if(!m)return false;
 const next=!!connected;if(m.connected===next)return true;m.connected=next;
 if(!next){dismount(w,m);m.dialogue=null;tellAll(w,`${m.name} lost connection. Their place is reserved briefly.`,'info',id);}
 else{m.player.invulnerable=Math.max(m.player.invulnerable||0,4);m.controlResetUntil=w.game.time+.3;tellAll(w,`${m.name} reconnected.`,'info',id);}
 w.revision++;return true;
}

function interact(w,m){
 const g=view(w,m),p=m.player;
 if(m.phase!=='playing'||g.dialogue)return fail('Finish the current conversation first.');
 const current=Sim.getVehicle(g);
 if(current){
  if(Math.abs(current.speed)>30)return fail('Brake first. The vehicle must be moving slowly before you get out.');
  dismount(w,m);w.revision++;return ok();
 }
 const prompt=Sim.getPrompt(g);
 if(prompt?.kind==='vehicle'){
  const car=R.nearestVehicle(g);if(!car)return fail('No vehicle is close enough.');
  const passengers=car.passengerIds||[];
  if(car.driverId){
   if(passengers.length+1>=seatCount(car))return fail('This vehicle is full. Choose another car or ask someone to get out.');
   if(Math.abs(car.speed)>35)return fail('Ask the driver to stop before you get in.');
   car.passengerIds=[...passengers,m.id];Object.assign(p,{vehicleId:car.id,lastVehicleId:car.id,seat:'passenger',x:car.x,y:car.y,angle:car.angle,interior:null});
   tell(w,m,`${w.players[car.driverId]?.name||'Your teammate'} is driving. Use gets you out after they stop.`);w.revision++;return ok();
  }
  const entered=run(w,m,x=>Sim.interact(x));
  if(entered&&p.vehicleId===car.id){car.driverId=m.id;car.passengerIds=[];p.seat='driver';syncSeats(w);return ok();}
  return fail('You could not enter that vehicle.');
 }
 if(prompt?.kind==='mission'&&w.storyDialogue)return fail('The crew leader is finishing the current story conversation.');
 const used=run(w,m,x=>Sim.interact(x));syncSeats(w);
 return used?ok():fail('Move closer to a door, vehicle, or person to use it.');
}

/** Only named commands are accepted; clients never submit position or money. */
export function coopAction(w,id,action){
 const m=w.players[id];if(!m?.connected)return fail('Your crew member is not connected.');
 if(!action||typeof action!=='object'||Array.isArray(action)||typeof action.type!=='string')return fail('Invalid action.');
 if(m.phase!=='playing'&&action.type!=='recover')return fail('Use Get back out there to recover first.');
 let result;
 switch(action.type){
  case 'interact':return interact(w,m);
  case 'toggleWeapon':
   if(view(w,m).dialogue)return fail('Finish the conversation before changing weapons.');
   result=run(w,m,g=>Sim.toggleWeapon(g));break;
  case 'choose':{
   const d=view(w,m).dialogue;
   if(!d||m.phase!=='playing')return fail('That conversation is no longer active.');
   if(d.id!==action.dialogueId)return fail('That choice is out of date. Use the current conversation.');
   if(!Number.isInteger(action.index)||!d.choices?.[action.index])return fail('Choose one of the available responses.');
   if(d._kind!=='service'&&id!==w.hostId)return fail('The crew leader handles story choices.');
   result=run(w,m,g=>Sim.choose(g,action.index),{consumeStory:true});break;
  }
  case 'startMission':
   if(id!==w.hostId)return fail('Only the crew leader can choose the next story job.');
   if(view(w,m).dialogue)return fail('Finish the conversation first.');
   if(live(w).some(a=>a.wanted.stars||a.wanted.report))return fail('The crew must lose police attention before starting a story job.');
   if(typeof action.missionId!=='string')return fail('Choose a story job.');
   result=run(w,m,g=>Sim.startMission(g,action.missionId));
   if(result)for(const other of members(w))other.job=null;
   break;
  case 'surrender':result=run(w,m,g=>Sim.surrender(g),{story:false});syncSeats(w);break;
  case 'recover':
   if(action.choice&&action.choice!=='continue')return fail('Crew recovery keeps the shared mission in place. Choose Get back out there.');
   if(!['down','busted'].includes(m.phase))return fail('You do not need hospital or arrest recovery.');
   dismount(w,m);result=run(w,m,g=>{g._checkpoint=null;return Sim.recover(g,'continue');},{story:false});syncSeats(w);break;
  case 'ping':{
   if(m.phase!=='playing')return fail('Recover before placing a crew marker.');
   if(w.game.time-m.lastPing<.8)return fail('Wait a moment before placing another crew marker.');
   const interior=action.interior===undefined?m.player.interior:action.interior;
   if(interior!==null&&interior!==m.player.interior)return fail('You can mark the city or your current room.');
   if(!Number.isFinite(action.x)||!Number.isFinite(action.y))return fail('Choose a position on the map.');
   const x=clamp(action.x,20,interior?620:WORLD.width-20),y=clamp(action.y,20,interior?440:WORLD.height-20);
   w.pings=w.pings.filter(p=>p.playerId!==id);w.pings.push({id:`ping-${++w.counter.value}`,playerId:id,name:m.name,color:m.color,x,y,interior,expiresAt:w.game.time+18});
   m.lastPing=w.game.time;w.revision++;return ok();
  }
  default:return fail('That action is not available.');
 }
 return result?ok():fail(m.notification||'That action is not available right now.');
}

function missionActor(w,active){
 const step=R.missionStep(w.game);if(!step)return null;
 if(step.type==='escape'&&active.some(a=>a.wanted.stars||a.wanted.report))return null;
 const l=step.location?R.location(step.location):null;
 const eligible=active.filter(m=>m.phase==='playing'&&!m.dialogue);
 return eligible.find(m=>{
  const p=m.player;
  if(step.type==='go'||step.type==='return')return !p.interior&&distance(p,l.door)<100;
  if(step.type==='enter')return p.interior===step.location;
  if(step.type==='drive'){const car=w.game.vehicles.find(v=>v.id===p.vehicleId);return car&&(step.vehicle?car.type===step.vehicle:!VEHICLE_TYPES[car.type].water)&&(!l||distance(p,l.door)<280);}
  return m.id===w.hostId;
 })||eligible.find(m=>m.id===w.hostId)||eligible[0];
}

/** Each shared system advances once, regardless of connected player count. */
export function stepCoopGame(w,inputsById={},dt=1/30){
 if(!w||!Number.isFinite(dt))return;dt=clamp(dt,0,.05);if(!dt)return;
 const active=live(w);if(!active.length)return;
 w.game.time+=dt;w.game.dayTime=(w.game.dayTime+dt/180)%24;
 const anchor=active[0];
 run(w,anchor,g=>R.tickVehicles(g,dt,{}, {player:false}),{story:false});
 for(const m of active){
  m.player.invulnerable=Math.max(0,(m.player.invulnerable||0)-dt);
  if(m.phase!=='playing')continue;
  const blocked=!!view(w,m).dialogue||w.game.time<m.controlResetUntil;
  const raw=inputsById instanceof Map?inputsById.get(m.id):inputsById[m.id];
  const input=blocked?{brake:true}:raw||{brake:true};
  run(w,m,g=>{
   R.tickFoot(g,input,dt);
   if(g.player.seat!=='passenger')R.tickVehicles(g,dt,input,{ambient:false});
   if(g.phase==='playing')R.tickCombat(g,input,dt,{projectiles:false});
  });
 }
 syncSeats(w);
 run(w,anchor,g=>{g._crewThreats=active.filter(m=>m.phase==='playing');R.tickPeople(g,dt);},{story:false});
 for(const m of active)if(m.phase==='playing')run(w,m,g=>R.tickWanted(g,dt),{story:false});
 // Projectiles are shared, but damage/recovery are written back to the actor
 // actually hit. Player-owned projectiles never test against crew bodies.
 const all=members(w),targets=all.map(m=>view(w,m,{story:false})),g=view(w,anchor,{story:false});
 R.tickCombat(g,{},dt,{fire:false,targets});
 rememberShared(w,g);for(let i=0;i<targets.length;i++)rememberPersonal(all[i],targets[i]);
 syncSeats(w);
 if(!w.storyDialogue){const actor=missionActor(w,active);if(actor)run(w,actor,x=>R.updateMission(x,dt),{story:false});}
 for(const m of active)if(m.phase==='playing'&&!m.dialogue)run(w,m,g=>R.tickJob(g,dt),{story:false});
 for(const effect of w.game.effects)effect.life-=dt;
 w.game.effects=w.game.effects.filter(e=>e.life>0);
 w.pings=w.pings.filter(p=>p.expiresAt>w.game.time);
 w.game._id=w.counter.value;w.revision++;
}

function publicMember(m){return {id:m.id,name:m.name,color:m.color,x:m.player.x,y:m.player.y,angle:m.player.angle,interior:m.player.interior,vehicleId:m.player.vehicleId,seat:m.player.seat,connected:m.connected,hp:m.player.hp,phase:m.phase,wanted:m.wanted.stars,weapon:m.player.weapon,swimming:m.player.swimming};}
function select(source,keys){const out={};for(const key of keys)if(source[key]!==undefined)out[key]=source[key];return out;}
const VEHICLE_PUBLIC=['id','type','name','x','y','angle','speed','hp','color','owned','stolen','driver','traffic','impounded','driverId','passengerIds','cooldown'];
const PERSON_PUBLIC=['id','type','kind','x','y','angle','hp','color','interior','report','panic','speed'];
function rounded(value){
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*1000)/1000:0;
 if(Array.isArray(value))return value.map(rounded);
 if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value))if(v!==undefined)out[k]=rounded(v);return out;}
 return value;
}

/** Deliberate public projection: no tokens, members, counters or private state. */
export function projectCoopGame(w,id){
 const m=w.players[id];if(!m)return null;
 const g=view(w,m),interior=m.player.interior,near=e=>distance(e,m.player)<1600;
 const projection={version:Sim.VERSION,time:w.game.time,dayTime:w.game.dayTime,player:m.player,wanted:m.wanted,phase:m.phase,outcome:m.outcome,job:m.job,stats:m.stats,
  notification:m.notification,notifications:m.notifications.slice(-12),progress:w.game.progress,mission:w.game.mission,dialogue:g.dialogue,
  vehicles:w.game.vehicles.filter(v=>!v.traffic||v.driverId||(!interior&&near(v))).map(v=>select(v,VEHICLE_PUBLIC)),npcs:w.game.npcs.filter(n=>(n.interior||null)===interior&&near(n)).map(n=>select(n,PERSON_PUBLIC)),police:w.game.police.filter(n=>!interior&&near(n)).map(n=>select(n,PERSON_PUBLIC)),
  bullets:w.game.bullets.filter(b=>(b.interior||null)===interior&&near(b)),effects:w.game.effects.filter(e=>(e.interior||null)===interior&&near(e)),
  crew:members(w).map(publicMember),pings:w.pings,
  coop:{playerId:id,hostId:w.hostId,revision:w.revision,storySpeakerId:w.storyDialogue?w.hostId:null,storyTitle:w.storyDialogue?.title||null,storyText:w.storyDialogue?.text||null}};
 return rounded(projection);
}

export function serializeCoopGame(w){
 const host=w.players[w.hostId]||members(w)[0];if(!host)throw new Error('This crew has no player to save.');
 const g=view(w,host,{story:false});g.dialogue=host.dialogue;
 const game=Sim.serializeGame(g);
 delete game._coop;delete game._connected;delete game._coopCounter;delete game._crewThreats;
 // Resume parked. Fresh guests cannot inherit a disconnected guest's car seat.
 for(const car of game.vehicles){delete car.driverId;delete car.passengerIds;delete car.targetId;if(!car.traffic){car.speed=0;car.driver=false;}}
 game.police=[];game.bullets=[];game.effects=[];game.player.vehicleId=null;game.player.seat=null;
 if(!game.player.interior&&!isLand(game.player.x,game.player.y))Object.assign(game.player,R.outside('docks'));
 return {kind:'suncoast-crew-checkpoint',version:1,game,storyDialogue:clone(w.storyDialogue)};
}

function validateTree(value,depth=0,budget={nodes:0}){
 if(++budget.nodes>50000||depth>18)throw new Error('The crew checkpoint is too complex.');
 if(typeof value==='number'&&!Number.isFinite(value))throw new Error('The crew checkpoint contains invalid numbers.');
 if(typeof value==='string'&&value.length>20000)throw new Error('The crew checkpoint contains an oversized field.');
 if(Array.isArray(value)){if(value.length>600)throw new Error('The crew checkpoint contains too many entities.');for(const x of value)validateTree(x,depth+1,budget);}
 else if(value&&typeof value==='object')for(const [key,x] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid crew checkpoint field.');validateTree(x,depth+1,budget);}
}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finiteRange=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const validInterior=key=>key===null||WORLD.buildings.some(b=>b.enterable&&b.id===key);
function validateCheckpointGame(g){
 const invalid=part=>{throw new Error(`The crew checkpoint has invalid ${part}.`);};
 if(!record(g)||!record(g.player)||!record(g.progress)||!record(g.wanted)||!record(g.stats))invalid('player or story data');
 const p=g.player,progress=g.progress;
 if(!validInterior(p.interior)||!finiteRange(p.x,0,p.interior?640:WORLD.width)||!finiteRange(p.y,0,p.interior?460:WORLD.height)||!Number.isFinite(p.angle))invalid('player pose');
 for(const [key,max] of [['hp',100],['armor',100],['cash',9999999],['ammo',9999],['stamina',100],['invulnerable',60]])if(!finiteRange(p[key],0,max))invalid('player '+key);
 if(!['fists','pistol'].includes(p.weapon)||typeof p.hasPistol!=='boolean')invalid('player equipment');
 if(!['playing','down','busted'].includes(g.phase))invalid('recovery state');
 if(!finiteRange(g.time,0,1e10)||!finiteRange(g.dayTime,0,24)||!Number.isSafeInteger(g._id)||g._id<0||g._id>1e8||!Number.isFinite(g._rng))invalid('city clock or counters');
 if(!Array.isArray(progress.completed)||progress.completed.length>MISSIONS.length||new Set(progress.completed).size!==progress.completed.length||progress.completed.some(id=>!MISSIONS.some(m=>m.id===id)))invalid('completed missions');
 if(!Number.isInteger(progress.unlocked)||progress.unlocked<0||progress.unlocked>2||!record(progress.rep)||!record(progress.flags)||!record(progress.choices))invalid('story progress');
 for(const key of ['community','underworld','truth'])if(!finiteRange(progress.rep[key],-10000,10000))invalid('reputation');
 for(const key of ['deaths','arrests'])if(!Number.isInteger(progress[key])||!finiteRange(progress[key],0,1e7))invalid('story statistics');
 for(const value of Object.values(progress.flags))if(typeof value!=='boolean')invalid('story flags');
 for(const [key,choice] of Object.entries(progress.choices)){
  const split=key.lastIndexOf(':'),mission=MISSIONS.find(m=>m.id===key.slice(0,split)),index=Number(key.slice(split+1)),step=mission?.steps[index];
  if(split<1||!Number.isInteger(index)||step?.type!=='choice'||!step.choices?.some(c=>c.id===choice))invalid('saved story decisions');
 }
 if(g.mission!==null){
  const mission=record(g.mission)&&MISSIONS.find(m=>m.id===g.mission.id);
  if(!mission||!Number.isInteger(g.mission.step)||!mission.steps[g.mission.step]||progress.completed.includes(mission.id)||!finiteRange(g.mission.elapsed,0,1e8))invalid('current mission');
  for(const key of ['applied','dialogueDone'])if(g.mission[key]!==undefined&&typeof g.mission[key]!=='boolean')invalid('mission state');
 }
 if(!Number.isInteger(g.wanted.stars)||!finiteRange(g.wanted.stars,0,6)||!finiteRange(g.wanted.heat,0,240))invalid('police attention');
 for(const key of ['search','report','lastX','lastY','lastSeen','quiet','pending'])if(!Number.isFinite(g.wanted[key]))invalid('police state');
 if(!['clear','reported','pursuit','search'].includes(g.wanted.mode))invalid('police state');
 for(const key of ['distance','vehiclesTaken','jobs','shots'])if(!finiteRange(g.stats[key],0,1e12))invalid('player statistics');
 if(g.job!==null){
  const job=g.job;
  if(!record(job)||!['taxi','courier','boat','race','rescue'].includes(job.type)||!LOCATIONS[job.target]||!['vehicle','pickup','deliver'].includes(job.stage)||!finiteRange(job.reward,0,10000))invalid('paid job');
  if(job.destination&&(!record(job.destination)||!finiteRange(job.destination.x,0,WORLD.width)||!finiteRange(job.destination.y,0,WORLD.height)))invalid('job destination');
  if(job.type==='race'&&(!Array.isArray(job.checkpoints)||job.checkpoints.length!==3||job.checkpoints.some(q=>!record(q)||!finiteRange(q.x,0,WORLD.width)||!finiteRange(q.y,0,WORLD.height))||!Number.isInteger(job.checkpoint)||job.checkpoint<0||job.checkpoint>2||!finiteRange(job.timeLeft,0,110)))invalid('race');
 }
 if(!Array.isArray(g.vehicles)||g.vehicles.length>100||!Array.isArray(g.npcs)||g.npcs.length>150)invalid('city data');
 const ids=new Set();
 for(const entity of [...g.vehicles,...g.npcs]){
  if(!record(entity)||!goodId(entity.id)||ids.has(entity.id))invalid('duplicate or missing entity IDs');ids.add(entity.id);
  if(!finiteRange(entity.x,0,WORLD.width)||!finiteRange(entity.y,0,WORLD.height)||!finiteRange(entity.hp,-1000,10000)||!Number.isFinite(entity.angle))invalid('city entity pose');
 }
 for(const car of g.vehicles){
  if(!Object.hasOwn(VEHICLE_TYPES,car.type)||!Number.isFinite(car.speed)||!finiteRange(car.cooldown,0,60))invalid('vehicle type or motion');
  if(car.traffic&&(!Number.isInteger(car.roadIndex)||!WORLD.roads[car.roadIndex]||![-1,1].includes(car.direction)||!Number.isFinite(car.turnWait)))invalid('traffic route');
 }
 for(const npc of g.npcs){
  for(const key of ['homeX','homeY','walkTime','report','panic'])if(!Number.isFinite(npc[key]))invalid('pedestrian motion');
  if(!validInterior(npc.interior))invalid('pedestrian interior');
 }
}
function restoreCheckpoint(w,save){
 if(!save||save.kind!=='suncoast-crew-checkpoint'||save.version!==1||!save.game)throw new Error('Choose a SUNCOAST crew checkpoint. Solo stories are kept separate.');
 if(JSON.stringify(save).length>240000)throw new Error('The crew checkpoint is too large.');validateTree(save);
 const incoming=clone(save.game);validateCheckpointGame(incoming);
 const g=Sim.restoreGame(incoming),host=w.players[w.hostId];
 // Saved dialogue is reconstructed from trusted authored steps, not executable
 // service actions supplied in an imported JSON file.
 g.dialogue=null;g.police=[];g.bullets=[];g.effects=[];
 g._id=Number.isSafeInteger(g._id)?clamp(g._id,100,1e8):1000;
 g._rng=Number.isFinite(g._rng)?g._rng:372984;
 for(const car of g.vehicles){delete car.driverId;delete car.passengerIds;delete car.targetId;if(!car.traffic){car.speed=0;car.driver=false;}}
 Object.assign(g.player,{id:host.id,name:host.name,color:host.color,vehicleId:null,seat:null,invulnerable:6});
 if(!g.player.interior)Object.assign(g.player,R.safePoint(g.player.x,g.player.y,10,true,g.progress.unlocked));
 w.game=g;w.counter.value=g._id;rememberPersonal(host,g);host.dialogue=null;
 const step=R.missionStep(g);
 if(save.storyDialogue&&g.mission&&step){
  const text=(step.dialogue||[]).map(d=>`${d.speaker}: ${d.text}`).join('\n\n')||step.text||'';
  const decision=g.progress.choices[`${g.mission.id}:${g.mission.step}`];
  const selected=step.choices?.find(c=>c.id===decision);
  w.storyDialogue=identifyDialogue(w,{title:MISSIONS.find(m=>m.id===g.mission.id)?.title||'Crew story',speaker:'BAHÍA LUCERO',
   text:selected?.result||text,choices:step.type==='choice'&&!decision?clone(step.choices||[]):[{label:'Continue',id:'continue'}],
   _kind:step.type==='choice'&&!decision?'choice':'story',_after:'next'});
 }
 w.game._id=w.counter.value;
}
