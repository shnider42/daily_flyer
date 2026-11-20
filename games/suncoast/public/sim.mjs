/** SUNCOAST — browser-independent game rules and persistent story state. */
import { WORLD, LOCATIONS, VEHICLE_TYPES, islandAt, isLand, isSolid, nearestRoad, lineOfSight } from './world.mjs';
import { MISSIONS, CONTACTS } from './content.mjs';

export const VERSION = '0.1.0';
const TAU = Math.PI * 2;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const num = (v,d=0) => Number.isFinite(v) ? v : d;
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const clone = o => JSON.parse(JSON.stringify(o));
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
const typeOf = v => VEHICLE_TYPES[v?.type] || VEHICLE_TYPES.compact;
const rint = (g,n) => Math.floor(random(g)*n);
const allTypes = ['compact','sedan','sport','van','truck','motorcycle'];
const colors = ['#78b6ad','#e1b35b','#c37364','#d5d7c8','#707eab','#3e6066','#ddd3b0','#a1b57c'];
const HEAT = [0,10,30,58,94,138,190];
function random(g) { let t=g._rng+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }
function id(g,p='e') { return p+(++g._id); }
function note(g,text,kind='info') { g.notification=text; g.notifications.push({id:id(g,'n'),text,kind,time:g.time}); if(g.notifications.length>24)g.notifications.shift(); }
function fx(g,type,x,y,extra={}) { if(g.effects.length>100)g.effects.shift();g.effects.push({id:id(g,'f'),type,x,y,life:.55,maxLife:.55,...extra}); }
const location = key => LOCATIONS[key] || WORLD.buildings.find(b=>b.id===key) || LOCATIONS.cafe || Object.values(LOCATIONS)[0];
const outside = key => { const l=location(key); return {x:l.door.x,y:l.door.y+32}; };
function clearWanted(g) { g.wanted={stars:0,heat:0,mode:'clear',reason:'No police attention',search:0,report:0,lastX:g.player.x,lastY:g.player.y,seen:false,lastSeen:-999,quiet:0,restricted:false,pending:0};g.police=[];if(g.vehicles)g.vehicles=g.vehicles.filter(v=>!v.blockade||v.id===g.player.vehicleId); }
function safePoint(x,y,r=16,land=true,maxIsland=2) {
  const valid=(xx,yy)=>!isSolid(xx,yy,r)&&(!land||isLand(xx,yy))&&islandAt(xx,yy)<=maxIsland;
  if(valid(x,y))return {x,y};
  for(let d=24;d<=420;d+=24)for(let a=0;a<TAU;a+=Math.PI/8){const p={x:x+Math.cos(a)*d,y:y+Math.sin(a)*d};if(valid(p.x,p.y))return p;}
  return outside('cafe');
}
function makeVehicle(g,type,x,y,options={}) { const t=VEHICLE_TYPES[type]||VEHICLE_TYPES.compact;return {id:id(g,'v'),type,x,y,angle:Math.PI/2,speed:0,hp:t.health||100,color:t.color||colors[rint(g,colors.length)],owned:false,stolen:false,driver:false,traffic:false,pathIndex:0,cooldown:0,...options}; }
function roadPoint(l,offset=0) { const n=nearestRoad(l.door.x,l.door.y);return safePoint(num(n?.x,l.door.x)+offset,num(n?.y,l.door.y+65),18); }
function spawnWorld(g) {
  for(const spawn of WORLD.vehicleSpawns||[])g.vehicles.push(makeVehicle(g,spawn.type,spawn.x,spawn.y,spawn));
  if(!g.vehicles.length){const q=roadPoint(location('cafe'));g.vehicles.push(makeVehicle(g,'compact',q.x,q.y,{owned:true}));}
  // Road-bound traffic follows each island's connected avenue grid.
  const roads=WORLD.roads.filter(r=>r.island!==undefined&&r.w>80&&r.h>80);
  for(let i=0;i<30&&roads.length;i++){
    const road=roads[rint(g,roads.length)];let x=road.x+road.w/2,y=road.y+road.h/2;
    if(road.axis==='h')x=road.x+70+random(g)*Math.max(1,road.w-140);else y=road.y+70+random(g)*Math.max(1,road.h-140);
    if(!isLand(x,y)||isSolid(x,y,19))continue;
    const type=i%12===0?'police':allTypes[rint(g,allTypes.length)];g.vehicles.push(makeVehicle(g,type,x,y,{driver:true,traffic:true,angle:road.axis==='h'?0:Math.PI/2,speed:48+random(g)*35,roadIndex:WORLD.roads.indexOf(road),direction:random(g)<.5?1:-1,turnWait:0}));
  }
  for(const l of Object.values(LOCATIONS))for(let i=0;i<4;i++){
    const q=safePoint(l.door.x+(i-1.5)*52,l.door.y+38+random(g)*45,8);
    g.npcs.push({id:id(g,'p'),x:q.x,y:q.y,homeX:q.x,homeY:q.y,angle:random(g)*TAU,type:'civilian',hp:50,report:0,panic:0,walkTime:random(g)*5,color:colors[rint(g,colors.length)],interior:null});
  }
}
export function createGame() {
  const p=outside('cafe');
  const g={version:VERSION,time:0,dayTime:16.3,player:{...p,angle:-Math.PI/2,hp:100,armor:0,cash:240,ammo:24,weapon:'fists',vehicleId:null,lastVehicleId:null,interior:null,invulnerable:2,stamina:100,swimming:false},vehicles:[],npcs:[],police:[],bullets:[],effects:[],wanted:{},progress:{completed:[],choices:{},unlocked:0,rep:{community:0,underworld:0,truth:0},flags:{},deaths:0,arrests:0},mission:null,dialogue:null,notification:'',notifications:[],phase:'playing',outcome:null,job:null,stats:{distance:0,vehiclesTaken:0,jobs:0,shots:0},_id:0,_rng:372984,_fire:0,_copSpawn:0,_gate:0,_water:0,_lastSwimNote:-100,_saveTick:0,_checkpoint:null,_lastDoor:null};
  clearWanted(g);spawnWorld(g);
  if(MISSIONS.length)startMission(g,MISSIONS[0].id);
  note(g,'Santa Elena. Home for now. Follow the gold marker to Café Inés.');
  return g;
}
export function getVehicle(g) {return g.vehicles.find(v=>v.id===g.player.vehicleId)||null;}
function missionData(g) {return MISSIONS.find(m=>m.id===g.mission?.id);}
function missionStep(g) {return missionData(g)?.steps[g.mission?.step];}
export function getAvailableMissions(g){return MISSIONS.filter(m=>!g.progress.completed.includes(m.id)&&(m.requires||[]).every(r=>g.progress.completed.includes(r))&&location(m.location).island<=g.progress.unlocked);}
function checkpoint(g){g._checkpoint={x:g.player.x,y:g.player.y,interior:g.player.interior,mission:g.mission?{id:g.mission.id,step:g.mission.step}:null,vehicleId:g.player.vehicleId};}
function storyDialogue(g,s,after='next') {
  const lines=(s.dialogue||[]).map(d=>`${CONTACTS[d.speaker]?.name||d.speaker}: ${d.text}`).join('\n\n');
  g.dialogue={title:missionData(g)?.title||'Bahía Lucero',speaker:CONTACTS[s.dialogue?.[0]?.speaker]?.name||s.dialogue?.[0]?.speaker||'',text:lines||s.text||'',choices:s.type==='choice'?(s.choices||[]):[{label:'Continue',detail:'',id:'continue'}],_kind:s.type==='choice'?'choice':'story',_after:after};
}
function enterStep(g) {
  const m=missionData(g),s=missionStep(g);if(!m||!s){finishMission(g);return;}
  g.mission.elapsed=0;g.mission.applied=true;g.mission.dialogueDone=false;
  if(s.wanted)setWanted(g,s.wanted,'Someone called in your vehicle. Break sight and find cover.');
  if(s.type==='choice'){const kept=g.progress.choices[`${g.mission.id}:${g.mission.step}`];if(kept){note(g,`Earlier decision kept: ${s.choices?.find(c=>c.id===kept)?.label||kept}.`);advance(g);return;}storyDialogue(g,s);}
  note(g,s.text,'mission');
}
function advance(g) {if(!g.mission)return;g.mission.step++;g.mission.elapsed=0;enterStep(g);}
function finishMission(g){
  const m=missionData(g);if(!m){g.mission=null;return;}
  if(!g.progress.completed.includes(m.id)){
    g.progress.completed.push(m.id);g.player.cash+=m.reward||0;let detail='Check your phone for the next job.';
    if(m.unlockIsland&&m.unlockIsland===g.progress.unlocked+1){g.progress.unlocked=m.unlockIsland;detail=`${WORLD.islands[m.unlockIsland]?.name||'New island'} is now open. Checkpoints recognize your clearance.`;}
    if(m.id==='first_favor'){g.progress.flags.hasPistol=true;detail='Tomi returned your sidearm. It stays holstered until you press Q to draw it. Check your phone for the next job.';}
    if(m.id==='the_city_we_keep'){g.progress.flags.storyComplete=true;detail='The city remembers your choices. Free roam, work, and unfinished business remain.';}
    note(g,`${m.title} complete${m.reward?` · $${m.reward}`:''}. ${detail}`, 'complete');
  }
  g.mission=null;g._checkpoint=null;g.dialogue=null;
}
export function startMission(g,key){
  if(g.phase!=='playing')return false;
  const m=MISSIONS.find(m=>m.id===key);if(!m||!getAvailableMissions(g).includes(m))return false;
  if(g.wanted.stars||g.wanted.report){note(g,'Lose the police before starting a new story job.');return false;}
  if(g.mission){note(g,'Finish the current story job first.');return false;}
  g.job=null;g.mission={id:key,step:0,elapsed:0,applied:false};checkpoint(g);enterStep(g);return true;
}
export function choose(g,index){
  const d=g.dialogue;if(!d||!Number.isInteger(index)||!d.choices?.[index])return false;
  const c=d.choices[index];g.dialogue=null;
  if(d._kind==='service'){if(c.action)service(g,c.action);return true;}
  if(d._kind==='story'){if(d._after==='next')advance(g);return true;}
  if(d._kind==='choice'){
    const key=`${g.mission.id}:${g.mission.step}`;
    if(!g.progress.choices[key]){
      g.progress.choices[key]=c.id||String(index);
      for(const [k,n] of Object.entries(c.rep||{}))if(k in g.progress.rep)g.progress.rep[k]+=num(n);
      g.player.cash=Math.max(0,g.player.cash+num(c.cash));if(c.flag)g.progress.flags[c.flag]=true;
      if(c.wanted)setWanted(g,c.wanted,c.result||'A choice has drawn police attention.');
      if(c.result)note(g,c.result,'choice');
      g.dialogue={title:missionData(g)?.title||'Your decision',speaker:'',text:c.result||'Your decision is recorded.',choices:[{id:'continue',label:'Continue',detail:''}],_kind:'story',_after:'next'};
      return true;
    }
    advance(g);return true;
  }
  return true;
}
function completeStep(g,s){
  if(s.dialogue?.length&&!g.mission.dialogueDone){g.mission.dialogueDone=true;storyDialogue(g,s);return;}
  advance(g);
}
function updateMission(g,dt){
  const s=missionStep(g);if(!s||g.dialogue)return;
  g.mission.elapsed+=dt;const p=g.player,l=location(s.location);
  if((s.type==='go'||s.type==='return')&&!p.interior&&dist(p,l.door)<100)completeStep(g,s);
  else if(s.type==='enter'&&p.interior===s.location)completeStep(g,s);
  else if(s.type==='drive'){const v=getVehicle(g);if(v&&(s.vehicle?v.type===s.vehicle:!typeOf(v).water)&&(!s.location||dist(p,l.door)<280))completeStep(g,s);}
  else if(s.type==='escape'&&!g.wanted.stars&&!g.wanted.report)completeStep(g,s);
  else if(s.type==='survive'&&g.mission.elapsed>=(s.duration||20))completeStep(g,s);
}
function nearestVehicle(g){let best=null,d=76;for(const v of g.vehicles){const dd=dist(g.player,v);if(dd<d&&v.hp>0&&!v.impounded){best=v;d=dd;}}return best;}
function nearestDoor(g){let best=null,d=86;for(const l of WORLD.buildings.filter(b=>b.enterable)){const dd=dist(g.player,l.door);if(dd<d){best=l;d=dd;}}return best;}
function serviceOptions(g,key){
 const choices=[];
 if(['home','cafe'].includes(key))choices.push({label:'Rest and save',detail:'Recover health. Keep your story progress.',action:'save'});
 if(['clinic','cafe','home'].includes(key))choices.push({label:'Get treatment',detail:'$30, or free emergency care if you cannot pay.',action:'heal'});
 if(key==='garage'){choices.push({label:'Repair my vehicle',detail:`$${price(g,70)}. Restores its condition.`,action:'repair'},{label:'Respray and change plates',detail:`$${price(g,100)}. Only helps after breaking police sight.`,action:'paint'},{label:'Recover my vehicle',detail:'$40, waived if broke. Returns an owned car outside.',action:'tow'});}
 if(key==='garage')choices.push({label:'Enter a street circuit',detail:'Three checkpoints, 110 seconds. $220 for finishing. No entry fee.',action:'job-race'});
 if(key==='clinic')choices.push({label:'Take a medical transport call',detail:'Pick up a stranded patient and return them here. Pays $140.',action:'job-rescue'});
 if(key==='precinct')choices.push({label:'Collect impounded vehicle',detail:'$40, waived if broke.',action:'tow'});
 if(['market','depot'].includes(key))choices.push({label:'Buy 24 pistol rounds',detail:'$45.',action:'ammo'},{label:'Buy protective vest',detail:'$90. Adds 60 armor.',action:'armor'});
 if(key==='garage'||key==='cafe')choices.push({label:'Take a taxi fare',detail:'A legal ride across an open island. Pays $100.',action:'job-taxi'});
 if(key==='market'||key==='depot')choices.push({label:'Take a courier delivery',detail:'A legal delivery. Pays $120.',action:'job-courier'});
 if(key==='docks'||key==='marina')choices.push({label:'Take a harbor delivery',detail:'Bring a boat. Pays $160.',action:'job-boat'});
 choices.push({label:'Leave the conversation',detail:'Keep exploring.',action:null});return choices;
}
export function getPrompt(g){
 if(g.phase!=='playing'||g.dialogue)return null;
 const p=g.player,v=getVehicle(g);
 if(v)return {text:Math.abs(v.speed)>30?'Slow down to get out':'Get out of vehicle',kind:'exit-vehicle'};
 if(p.interior){
   if(Math.hypot(p.x-320,p.y-420)<78)return {text:`Leave ${location(p.interior).name}`,kind:'exit'};
   if(Math.hypot(p.x-320,p.y-150)<110){const s=missionStep(g);if(s?.type==='interact'&&s.location===p.interior)return {text:s.text,kind:'mission'};return {text:`Talk / services · ${location(p.interior).name}`,kind:'service'};}
   return null;
 }
 const door=nearestDoor(g),vehicle=nearestVehicle(g);
 // Doors win close to their thresholds; cars cannot conceal an entrance.
 if(door&&dist(p,door.door)<55)return {text:`Enter ${door.name}`,kind:'enter'};
 if(vehicle)return {text:`${vehicle.owned?'Drive':'Take'} ${vehicle.name||typeOf(vehicle).name}${vehicle.driver?' · occupied':''}`,kind:'vehicle'};
 if(door)return {text:`Enter ${door.name}`,kind:'enter'};return null;
}
export function interact(g){
 if(g.phase!=='playing'||g.dialogue)return false;
 const p=g.player,v=getVehicle(g),prompt=getPrompt(g);if(!prompt)return false;
 if(v){if(Math.abs(v.speed)>30){note(g,'Brake first. You need to be moving slowly to get out.');return false;}
   p.lastVehicleId=v.id;p.vehicleId=null;v.driver=false;v.traffic=false;const side={x:v.x+Math.cos(v.angle+Math.PI/2)*36,y:v.y+Math.sin(v.angle+Math.PI/2)*36};Object.assign(p,v.type==='boat'?side:safePoint(side.x,side.y,10));p.invulnerable=1;return true;}
 if(p.interior){
   if(prompt.kind==='exit'){const key=p.interior;Object.assign(p,safePoint(outside(key).x,outside(key).y,10));p.interior=null;g._lastDoor=key;return true;}
   if(prompt.kind==='mission'){completeStep(g,missionStep(g));return true;}
   if(prompt.kind==='service'){g.dialogue={title:location(p.interior).name,speaker:'',text:serviceGreeting(g,p.interior),choices:serviceOptions(g,p.interior),_kind:'service'};return true;}
 }
 if(prompt.kind==='enter'){
   const l=nearestDoor(g);if(!l)return false;
   if(g.wanted.seen&&g.wanted.stars>=3){note(g,'Police saw you at the door. Break their line of sight before hiding inside.');return false;}
   p.interior=l.id;p.x=320;p.y=384;p.angle=-Math.PI/2;return true;
 }
 if(prompt.kind==='vehicle'){
   const car=nearestVehicle(g);if(!car)return false;
   if(!car.owned){car.stolen=true;g.stats.vehiclesTaken++;addCrime(g,car.type==='police'?3:1,car.type==='police'?'Police vehicle stolen':'Vehicle theft reported');}
   car.traffic=false;car.blockade=false;car.driver=true;p.vehicleId=car.id;p.lastVehicleId=car.id;p.x=car.x;p.y=car.y;p.angle=car.angle;return true;
 }
 return false;
}
function serviceGreeting(g,key){
 let text='What do you need?';
 if(key==='home')text='A quiet room, a working fan, and a place to begin again.';
 if(key==='cafe')text=g.progress.deaths?'Inés: You scared me. Eat something before you go.':g.progress.arrests?'Inés: Next time call me before the desk sergeant does.':'Inés: ¿Cafecito? Sit for a minute. The city can wait.';
 if(key==='garage')text=g.progress.rep.community>=3?'Tomi: People remember what you did. Friends’ prices for you.':'Tomi: You bend it, I mend it. Try not to make that a business model.';
 if(key==='precinct')text='Desk officer: Your car is in the impound lot. Keep the receipt.';
 if(key==='clinic')text='Medic: You are lucky someone found you. We treat first and sort out the bill afterward.';
 if(key==='garage'&&g.progress.flags.tomi_legitimate)text='Tomi: Rosa sent three more customers. Honest work is still work.';
 if(key==='garage'&&g.progress.flags.tomi_offbook)text='Tomi: The advance cleared. So did a patrol car, twice. I knew what I signed.';
 if(key==='cafe'&&g.progress.flags.community_generator)text+=' The generator is signed back in. Rafael says his lights are fine and his opinions are even better.';
 if(key==='cafe'&&g.progress.flags.voss_generator)text+=' We had power. Now tell me why the depot keeps asking who delivered it.';
 if(key==='cafe'&&g.progress.flags.clinic_favor)text+=' The clinic told me about the fee. People notice those things.';
 if(key==='radio'&&g.progress.rep.truth>=4)text='Nadia: My legal-aid contact will get your fines reduced if this goes badly. You brought evidence we can stand behind.';
 if(key==='club'&&g.progress.rep.underworld>=3)text='Voss: Your deliveries get a thirty-dollar bonus now. Reliable people are worth keeping.';
 if(g.progress.flags.ending_public)text+=' Since the broadcast, the seizures have stopped. Neighbors are organizing the next hearing.';
 else if(g.progress.flags.ending_deal)text+=' The settlement saved these homes. People still wonder what was left out of the deal.';
 else if(g.progress.flags.ending_takeover)text+=' Everyone knows who owns the leverage now. Whether that feels safe depends on whom you ask.';
 return text;
}
function price(g,base){return Math.round(base*(g.progress.rep.community>=3?.7:1));}
function pay(g,amount){if(g.player.cash<amount){note(g,`You need $${amount}. You have $${g.player.cash}.`);return false;}g.player.cash-=amount;return true;}
export function service(g,action){
 if(g.phase!=='playing')return false;
 const p=g.player,key=p.interior||g._lastDoor;
 if(!p.interior&&(!key||dist(p,location(key).door)>130)){note(g,'Visit the business and speak to the person inside.');return false;}
 const allowed={heal:['clinic','cafe','home'],repair:['garage'],paint:['garage'],ammo:['market','depot'],armor:['market','depot'],save:['home','cafe'],tow:['garage','precinct'],'job-taxi':['garage','cafe'],'job-courier':['market','depot'],'job-boat':['docks','marina'],'job-race':['garage'],'job-rescue':['clinic']};
 if(!allowed[action]?.includes(key)){note(g,'Visit the right business and speak to the person inside.');return false;}
 if(action==='heal'){p.cash-=Math.min(p.cash,g.progress.rep.community>=4?15:30);p.hp=100;note(g,'Patched up. Take it easy out there.');}
 if(action==='save'){if(g.wanted.stars){note(g,'You cannot rest while police are searching for you.');return false;}p.hp=100;p.stamina=100;g.dayTime=(g.dayTime+2)%24;note(g,'Rested. Your progress is ready to save.');}
 if(action==='ammo'){if(!pay(g,45))return false;p.ammo+=24;g.progress.flags.hasPistol=true;note(g,'24 rounds added. Q switches between fists and pistol.');}
 if(action==='armor'){if(!pay(g,90))return false;p.armor=60;note(g,'Protective vest equipped.');}
 if(action==='tow'){
   const last=g.vehicles.find(v=>v.id===p.lastVehicleId);const v=(last?.impounded?last:null)||g.vehicles.find(v=>v.owned&&v.impounded)||g.vehicles.find(v=>v.impounded)||(last?.owned?last:null)||g.vehicles.find(v=>v.owned&&v.type!=='boat');if(v){p.cash-=Math.min(p.cash,40);const q=v.type==='boat'?(WORLD.vehicleSpawns.find(s=>s.id===v.id)||WORLD.vehicleSpawns.find(s=>s.type==='boat')):roadPoint(location(key));Object.assign(v,{x:q.x,y:q.y},{hp:typeOf(v).health||100,speed:0,impounded:false,traffic:false,driver:false});p.lastVehicleId=v.id;note(g,v.type==='boat'?'Your boat is back at El Bajo Docks. Recovery fee waived if you were short.':`${v.name||typeOf(v).name} is waiting outside. Recovery fee waived if you were short.`);}else{note(g,'There is no vehicle available to recover.');return false;}
 }
 if(action==='repair'||action==='paint'){
   const last=g.vehicles.find(v=>v.id===p.lastVehicleId);let v=last||g.vehicles.filter(v=>v.owned&&!v.impounded&&!v.traffic&&v.type!=='boat').sort((a,b)=>dist(a,location('garage').door)-dist(b,location('garage').door))[0];
   if(!v||v.impounded||v.type==='boat'||dist(v,location('garage').door)>400){note(g,'Park your vehicle near the garage first.');return false;}
   if(action==='repair'){if(!pay(g,price(g,70)))return false;v.hp=typeOf(v).health||100;note(g,`${v.name||typeOf(v).name} repaired.`);}
   else{if(g.wanted.seen){note(g,'Police can still see you. Break sight first.');return false;}if(!pay(g,price(g,100)))return false;v.color=colors[rint(g,colors.length)];v.stolen=false;if(g.wanted.stars&&g.wanted.stars<4){g.wanted.heat=Math.max(0,g.wanted.heat-38);g.wanted.stars=heatStars(g.wanted.heat);if(!g.wanted.stars)clearWanted(g);}note(g,'Fresh paint, clean plates. Serious charges and island restrictions still stand.');}
 }
 if(action.startsWith('job-'))return startJob(g,action.slice(4));return true;
}
function startJob(g,type){
 if(g.mission){note(g,'Finish your story job before accepting another delivery.');return false;}
 if(g.wanted.stars){note(g,'Lose the police before accepting a fare.');return false;}
 const candidates=Object.values(LOCATIONS).filter(l=>l.island<=g.progress.unlocked&&l.id!==g.player.interior&&!['marina','docks'].includes(l.id));
 const target=type==='boat'?'docks':type==='rescue'?'clinic':type==='race'?'garage':candidates[rint(g,candidates.length)]?.id;
 const destination=type==='boat'?{x:1990,y:1830}:type==='rescue'?{x:1508,y:796}:null;
 const checkpoints=type==='race'?[{x:500,y:800},{x:1510,y:1350},{x:1020,y:2470}]:null;
 g.job={type,target,destination,checkpoints,checkpoint:0,reward:({boat:160,taxi:100,courier:120,race:220,rescue:140})[type]||120,stage:'vehicle',start:g.time,timeLeft:type==='race'?110:null};
 note(g,type==='race'?'Circuit accepted. Find a car. The clock starts when you get in.':type==='rescue'?'Medical transport accepted. Find a car and follow the pickup marker.':`${type==='taxi'?'Fare accepted':'Delivery accepted'}. Get in ${type==='boat'?'a boat':'a vehicle'}, then follow the destination.`);return true;
}
function jobPoint(j){return j.type==='race'?j.checkpoints[j.checkpoint]:j.destination||location(j.target).door;}
function finishJob(g){const j=g.job,bonus=g.progress.rep.underworld>=3&&['courier','taxi','boat'].includes(j.type)?30:0;g.player.cash+=j.reward+bonus;g.stats.jobs++;if(j.type==='rescue')g.progress.rep.community++;note(g,`Job complete · $${j.reward+bonus}. ${j.type==='taxi'?'Passenger arrived safely.':j.type==='rescue'?'The patient is receiving care. Community reputation increased.':j.type==='race'?'Clean finish. Tomi recorded your time.':'Delivery received.'}`,'complete');g.job=null;}
function tickJob(g,dt){
 if(!g.job)return;const j=g.job,v=getVehicle(g);
 if(j.stage==='vehicle'&&v&&(j.type==='boat'?v.type==='boat':v.type!=='boat')){j.stage=j.type==='rescue'?'pickup':'deliver';note(g,j.type==='boat'?'Bring the harbor package to the marked offshore buoy.':j.type==='race'?'The clock is running. Hit all three checkpoints.':j.type==='rescue'?'Collect the patient at the marked pickup point.':`Head to ${location(j.target).name}.`);}
 if(j.stage==='vehicle')return;
 if(j.type==='race'){
  j.timeLeft-=dt;if(j.timeLeft<=0){note(g,'Time ran out. No fee, no lost progress. You can try the circuit again.');g.job=null;return;}
  if(v&&v.type!=='boat'&&dist(g.player,jobPoint(j))<105){j.checkpoint++;if(j.checkpoint>=j.checkpoints.length){finishJob(g);return;}note(g,`Checkpoint ${j.checkpoint} of ${j.checkpoints.length}. Keep going.`);}return;
 }
 if(j.stage==='pickup'&&v&&Math.abs(v.speed)<35&&dist(g.player,jobPoint(j))<110){j.stage='deliver';j.destination=null;note(g,'Patient aboard. Bring them to Harbor Clinic.');return;}
 if(j.stage==='deliver'&&!g.player.interior&&dist(g.player,jobPoint(j))<(j.type==='boat'?95:110)&&!g.wanted.stars&&(j.type!=='rescue'||(v&&Math.abs(v.speed)<35)))finishJob(g);
}
function heatStars(heat){let s=0;for(let i=1;i<=6;i++)if(heat>=HEAT[i])s=i;return s;}
function setWanted(g,stars,reason){g.wanted.stars=Math.max(g.wanted.stars,stars);g.wanted.heat=Math.max(g.wanted.heat,HEAT[stars]);g.wanted.reason=reason;g.wanted.mode='pursuit';g.wanted.lastX=g.player.x;g.wanted.lastY=g.player.y;g.wanted.lastSeen=g.time;g.wanted.quiet=0;g.wanted.report=0;g.wanted.pending=0;note(g,reason,'wanted');}
export function addCrime(g,severity,reason='Crime reported'){
 severity=clamp(Math.round(severity),1,6);
 if(severity===6){setWanted(g,6,reason);return true;}
 if(g.player.interior){if(severity>=2){setWanted(g,severity,reason);return true;}return false;}
 const policeWitness=g.police.some(c=>c.hp>0&&dist(c,g.player)<550&&lineOfSight(c,g.player))||g.vehicles.some(v=>v.type==='police'&&v.traffic&&dist(v,g.player)<420&&lineOfSight(v,g.player));
 const witness=g.npcs.find(n=>n.hp>0&&!n.interior&&dist(n,g.player)<(severity>=2?600:340)&&(severity>=2||lineOfSight(n,g.player)));
 if(policeWitness||g.wanted.seen){g.wanted.heat=Math.min(240,Math.max(HEAT[severity],g.wanted.heat+severity*9));setWanted(g,Math.max(severity,heatStars(g.wanted.heat)),reason);return true;}
 if(witness){const fresh=g.wanted.report<=0;witness.report=3;witness.panic=8;if(fresh)g.wanted.report=3;g.wanted.pending=Math.max(g.wanted.pending||0,severity);g.wanted.reason=reason;g.wanted.mode=g.wanted.stars?'pursuit':'reported';if(fresh)note(g,'A witness is calling the police.','wanted');return true;}
 note(g,'No witness saw you. Keep it that way.');return false;
}
function movePoint(entity,dx,dy,r=10,allowWater=true){
 const x=clamp(entity.x+dx,20,WORLD.width-20),y=clamp(entity.y+dy,20,WORLD.height-20);
 const valid=(xx,yy)=>!isSolid(xx,yy,r)&&(allowWater||isLand(xx,yy));
 let hit=false;if(valid(x,entity.y))entity.x=x;else hit=true;if(valid(entity.x,y))entity.y=y;else hit=true;return hit;
}
function damage(g,amount){if(g.player.invulnerable>0||g.phase!=='playing')return;const absorb=Math.min(g.player.armor,amount*.65);g.player.armor-=absorb;g.player.hp-=amount-absorb;g.player.invulnerable=.12;if(g.player.hp<=0)defeat(g,'down');}
function defeat(g,kind){
 if(g.phase!=='playing')return;
 const p=g.player,cost=Math.min(p.cash,kind==='down'?Math.max(40,Math.round(p.cash*.08)):Math.round(Math.max(70,p.cash*.12)*(g.progress.rep.truth>=4?.65:1)));
 p.cash-=cost;p.hp=Math.max(0,p.hp);g.phase=kind;g.dialogue=null;g.job=null;
 if(kind==='down'){g.progress.deaths++;g.outcome={title:'Still breathing.',text:'A stranger called an ambulance. You wake at Harbor Clinic. Your completed jobs and choices are safe.',cost};}
 else{g.progress.arrests++;p.ammo=0;p.weapon='fists';g.progress.flags.hasPistol=false;const v=getVehicle(g);if(v){p.lastVehicleId=v.id;v.impounded=true;v.driver=false;v.speed=0;Object.assign(v,v.type==='boat'?(WORLD.vehicleSpawns.find(s=>s.id===v.id)||WORLD.vehicleSpawns.find(s=>s.type==='boat')):roadPoint(location('precinct'),-35));v.impounded=true;}g.outcome={title:'Booked. Not finished.',text:'Weapons and ammunition were confiscated. Your vehicle went to impound. Completed story progress stays with you.',cost};}
}
export function surrender(g){if(g.phase==='playing'&&g.wanted.stars){defeat(g,'busted');return true;}return false;}
export function recover(g,choice='continue'){
 if(!['down','busted'].includes(g.phase))return false;
 const kind=g.phase,p=g.player,oldVehicle=getVehicle(g);if(oldVehicle){oldVehicle.speed=0;oldVehicle.driver=false;}
 p.vehicleId=null;p.interior=null;p.hp=100;p.armor=0;p.stamina=100;p.invulnerable=6;g.phase='playing';g.outcome=null;g.bullets=[];g.effects=[];clearWanted(g);g._water=0;
 const cp=g._checkpoint;
 if(choice==='retry'&&cp?.mission){g.mission={id:cp.mission.id,step:cp.mission.step,elapsed:0};p.interior=cp.interior;const vessel=g.vehicles.find(v=>v.id===cp.vehicleId&&v.type==='boat'&&v.hp>0&&!v.impounded&&!isLand(v.x,v.y));if(p.interior){p.x=cp.x;p.y=cp.y;}else if(vessel){p.x=vessel.x;p.y=vessel.y;p.vehicleId=vessel.id;p.lastVehicleId=vessel.id;vessel.driver=true;}else Object.assign(p,safePoint(cp.x,cp.y,10,true,g.progress.unlocked));enterStep(g);note(g,'Back at the job checkpoint. Your hospital bill or fine still counts.');}
 else{Object.assign(p,outside(kind==='busted'?'precinct':'clinic'));if(g.mission){g.mission.step=Math.max(0,g.mission.step);g.mission.elapsed=0;const s=missionStep(g);if(s?.type==='escape')advance(g);else if(s?.type==='choice')storyDialogue(g,s);}note(g,kind==='busted'?'Released. Tomi can recover a car for you. Your job can still be finished.':'You survived. Your current job is still available. Get your bearings before heading back.');}
 // Never strand an injured or released player without a way to move.
 const own=g.vehicles.find(v=>v.owned&&v.type!=='boat');if(own&&own.hp<=0){const q=roadPoint(location(kind==='busted'?'precinct':'clinic'));Object.assign(own,q,{hp:typeOf(own).health||100,speed:0,impounded:false});}
 return true;
}
function tickVehicles(g,dt,input){
 const p=g.player,v=getVehicle(g);
 for(const car of g.vehicles){
  car.cooldown=Math.max(0,(car.cooldown||0)-dt);if(car.hp<=0)continue;const t=typeOf(car);
  if(car===v){
   p.lastVehicleId=car.id;
   let throttle=clamp(num(input.throttle,-num(input.my)), -1,1),steer=clamp(num(input.steer,input.mx||0),-1,1);
   if(input.touch){const mag=Math.hypot(input.mx||0,input.my||0);if(mag>.15){const target=Math.atan2(input.my,input.mx);const d=wrap(target-car.angle);steer=clamp(d*1.7,-1,1);throttle=mag*(Math.abs(d)>1.6?.28:1);}else throttle=0;}
   const accel=t.accel||95,max=t.maxSpeed||240,turn=t.turn||2.5;
   if(input.brake)car.speed*=Math.exp(-dt*5.5);else if(throttle)car.speed+=throttle*accel*dt;else car.speed*=Math.exp(-dt*(t.water?.32:.8));
   car.speed=clamp(car.speed,-max*.32,max);car.angle+=steer*turn*dt*clamp(Math.abs(car.speed)/65,.08,1)*(car.speed<0?-1:1);
   const dx=Math.cos(car.angle)*car.speed*dt,dy=Math.sin(car.angle)*car.speed*dt;
   let hit=false;
   if(t.water){const nx=car.x+dx,ny=car.y+dy;if(!isLand(nx,ny)&&!isSolid(nx,ny,14)){car.x=clamp(nx,20,WORLD.width-20);car.y=clamp(ny,20,WORLD.height-20);}else hit=true;}
   else hit=movePoint(car,dx,dy,Math.max(10,(t.w||24)*.43),false);
   if(hit&&Math.abs(car.speed)>45&&car.cooldown<=0){car.hp-=Math.abs(car.speed)*.055;damage(g,Math.abs(car.speed)*.012);fx(g,'spark',car.x,car.y);car.cooldown=.6;car.speed*=-.24;}
   p.x=car.x;p.y=car.y;p.angle=car.angle;g.stats.distance+=Math.abs(car.speed)*dt;
   if(car.hp<=0){p.vehicleId=null;car.speed=0;car.driver=false;const q=safePoint(car.x+38,car.y,10);Object.assign(p,q);damage(g,24);fx(g,'explosion',car.x,car.y,{life:1.5,maxLife:1.5,r:70});note(g,'Vehicle disabled. Get clear and call for recovery at a garage.');}
  }else if(car.traffic&&!car.impounded){
   const road=WORLD.roads[car.roadIndex];if(!road)continue;car.turnWait=Math.max(0,(car.turnWait||0)-dt);
   const vertical=road.axis==='v',dir=car.direction||1,targetSpeed=70;
   car.angle=vertical?(dir>0?Math.PI/2:-Math.PI/2):(dir>0?0:Math.PI);car.speed+=(targetSpeed-car.speed)*dt;
   const ahead=g.vehicles.some(other=>other!==car&&other.hp>0&&dist(car,other)<65&&Math.cos(Math.atan2(other.y-car.y,other.x-car.x)-car.angle)>.5);
   if(ahead)car.speed*=Math.exp(-dt*5);
   const delta=car.speed*dt*dir;let nx=car.x+(vertical?0:delta),ny=car.y+(vertical?delta:0);
   if(nx<road.x+30||nx>road.x+road.w-30||ny<road.y+30||ny>road.y+road.h-30||isSolid(nx,ny,18)||!isLand(nx,ny)){car.direction=-dir;car.speed=20;}else{car.x=nx;car.y=ny;}
   if(car.turnWait===0){const crossing=WORLD.roads.find(r=>r!==road&&r.island===road.island&&r.axis!==road.axis&&car.x>r.x+15&&car.x<r.x+r.w-15&&car.y>r.y+15&&car.y<r.y+r.h-15);if(crossing&&random(g)<dt*.7){car.roadIndex=WORLD.roads.indexOf(crossing);car.direction=random(g)<.5?-1:1;car.turnWait=3;}}
  }
 }
 if(v){
   for(const other of g.vehicles){if(other===v||other.hp<=0||dist(v,other)>((typeOf(v).h||45)+(typeOf(other).h||45))*.35)continue;const impact=Math.abs(v.speed),a=Math.atan2(v.y-other.y,v.x-other.x),separation=((typeOf(v).h||45)+(typeOf(other).h||45))*.35-dist(v,other)+1;movePoint(v,Math.cos(a)*separation,Math.sin(a)*separation,12,v.type==='boat');if(impact>65&&v.cooldown<=0){other.hp-=impact*.05;v.hp-=impact*.035;v.cooldown=.6;other.traffic=false;fx(g,'spark',v.x,v.y);addCrime(g,1,'Hit-and-run collision reported');}v.speed*=.15;p.x=v.x;p.y=v.y;}
   for(const n of g.npcs){if(n.hp>0&&Math.abs(v.speed)>65&&dist(v,n)<23){n.hp=0;v.speed*=.8;addCrime(g,2,'Pedestrian hit by a vehicle');fx(g,'hit',n.x,n.y);}}
 }
}
function tickFoot(g,input,dt){
 const p=g.player;if(getVehicle(g))return;
 let mx=clamp(num(input.mx),-1,1),my=clamp(num(input.my),-1,1),mag=Math.hypot(mx,my);if(mag>1){mx/=mag;my/=mag;mag=1;}
 p.swimming=!p.interior&&!isLand(p.x,p.y);let speed=p.swimming?68:145;
 if(input.sprint&&p.stamina>1&&!p.swimming){speed=210;p.stamina=Math.max(0,p.stamina-19*dt);}else p.stamina=Math.min(100,p.stamina+13*dt);
 if(mag>.1)p.angle=Math.atan2(my,mx);
 if(p.interior){p.x=clamp(p.x+mx*speed*dt,35,605);p.y=clamp(p.y+my*speed*dt,35,425);}
 else{movePoint(p,mx*speed*dt,my*speed*dt,10,true);g.stats.distance+=mag*speed*dt;}
 if(p.swimming){g._water+=dt;if(g._water>18)damage(g,9*dt);if(g._water>15&&Math.floor(g._water)%5===0&&g.time-g._lastSwimNote>5){note(g,'You are tiring. Swim toward shore or get into a nearby boat.');g._lastSwimNote=g.time;}}
 else g._water=Math.max(0,g._water-10*dt);
}
function tickPeople(g,dt){
 for(const n of g.npcs){if(n.hp<=0)continue;n.report=Math.max(0,(n.report||0)-dt);n.panic=Math.max(0,(n.panic||0)-dt);n.walkTime-=dt;
  if(n.walkTime<=0){n.walkTime=2+random(g)*4;n.angle=random(g)*TAU;}
  if(!g.player.interior&&dist(n,g.player)<200&&(g.wanted.stars>1||g._fire>.1)){n.panic=4;n.angle=Math.atan2(n.y-g.player.y,n.x-g.player.x);}
  if(dist(n,{x:n.homeX,y:n.homeY})>220&&!n.panic)n.angle=Math.atan2(n.homeY-n.y,n.homeX-n.x);
  const speed=n.panic?110:17;if(movePoint(n,Math.cos(n.angle)*speed*dt,Math.sin(n.angle)*speed*dt,7,false))n.angle+=Math.PI*.7;
 }
}
function spawnCop(g,kind='patrol'){
 const p=g.player,w=g.wanted;const count=g.police.filter(c=>c.kind===kind&&c.hp>0).length;
 if(kind==='helicopter'){g.police.push({id:id(g,'c'),x:clamp(w.lastX+500,100,WORLD.width-100),y:clamp(w.lastY-450,100,WORLD.height-100),angle:0,hp:180,kind,speed:180,shoot:1,stuck:0,searchAngle:random(g)*TAU});return;}
 let q=null;for(let i=0;i<24;i++){const a=random(g)*TAU,d=500+random(g)*200;const s={x:clamp(w.lastX+Math.cos(a)*d,50,WORLD.width-50),y:clamp(w.lastY+Math.sin(a)*d,50,WORLD.height-50)};if(isLand(s.x,s.y)&&!isSolid(s.x,s.y,16)&&dist(p,s)>350){q=s;break;}}
 if(!q)return;g.police.push({id:id(g,'c'),...q,angle:0,hp:kind==='tactical'?130:90,kind,speed:kind==='tactical'?138:120,shoot:1+count*.2,stuck:0,searchAngle:random(g)*TAU});
}
function steerCop(c,target,speed,dt){
 const desired=Math.atan2(target.y-c.y,target.x-c.x),before={x:c.x,y:c.y};c.angle=desired;
 if(!movePoint(c,Math.cos(desired)*speed*dt,Math.sin(desired)*speed*dt,12,false))return;
 // Try both sides of a wall. No teleporting through buildings.
 const sign=Math.sin(c.searchAngle||0)>=0?1:-1;
 for(const offset of [Math.PI/3*sign,Math.PI/2*sign,-Math.PI/2*sign,Math.PI]){const a=desired+offset;if(!isSolid(c.x+Math.cos(a)*30,c.y+Math.sin(a)*30,12)&&isLand(c.x+Math.cos(a)*30,c.y+Math.sin(a)*30)){movePoint(c,Math.cos(a)*speed*dt,Math.sin(a)*speed*dt,12,false);c.angle=a;break;}}
 if(dist(before,c)<1)c.stuck=(c.stuck||0)+dt;else c.stuck=0;
}
function spawnRoadblock(g){
 const w=g.wanted,p=g.player;
 for(const sign of [-1,1]){
  const nearest=nearestRoad(w.lastX+sign*430,w.lastY+sign*120),road=nearest?.road;if(!road)continue;
  const q={x:nearest.x,y:nearest.y};if(!isLand(q.x,q.y)||dist(q,p)<300||isSolid(q.x,q.y,22))continue;
  for(const side of [-1,1]){const x=q.x+(road.axis==='h'?0:side*24),y=q.y+(road.axis==='h'?side*24:0);g.vehicles.push(makeVehicle(g,'police',x,y,{blockade:true,angle:road.axis==='h'?Math.PI/2:0,color:'#dde4dc'}));}
 }
 w.blockades=true;note(g,'Roadblocks reported on nearby avenues. Look for side streets.','wanted');
}
function tickWanted(g,dt){
 const w=g.wanted,p=g.player;
 if(w.report>0){w.report-=dt;if(w.report<=0){g.wanted.heat=Math.min(240,g.wanted.heat+(w.pending||1)*13);setWanted(g,Math.max(w.pending||1,heatStars(w.heat)),w.reason);}}
 const current=p.interior?location(p.interior).island:islandAt(p.x,p.y);
 w.restricted=Number.isInteger(current)&&current>g.progress.unlocked;
 if(w.restricted){if(w.stars!==6)setWanted(g,6,`Restricted island: ${WORLD.islands[current]?.name||'checkpoint zone'}. Leave now or face a six-star response.`);w.heat=Math.max(w.heat,HEAT[6]);}
 if(!w.stars)return;
 if(w.stars>=4&&!w.blockades)spawnRoadblock(g);
 w.seen=false;
 for(const c of g.police){if(c.hp<=0)continue;const d=dist(c,p);const heli=c.kind==='helicopter';const sees=!p.interior&&d<(heli?650:450)&&lineOfSight(c,p);if(sees){w.seen=true;w.lastX=p.x;w.lastY=p.y;w.lastSeen=g.time;}
  let target=sees?p:{x:w.lastX+Math.cos(num(c.searchAngle))*Math.min(220,(g.time-w.lastSeen)*18),y:w.lastY+Math.sin(num(c.searchAngle))*Math.min(220,(g.time-w.lastSeen)*18)};
  const speed=heli?180:getVehicle(g)?180+w.stars*18:c.speed;
  if(heli){c.angle=Math.atan2(target.y-c.y,target.x-c.x);if(d>180){c.x+=Math.cos(c.angle)*speed*dt;c.y+=Math.sin(c.angle)*speed*dt;}}
  else if(dist(c,target)>28)steerCop(c,target,speed,dt);
  c.shoot-=dt;
  if(sees&&d<310&&w.stars>=3&&c.shoot<=0&&!heli){c.shoot=1.5-w.stars*.1;const a=Math.atan2(p.y-c.y,p.x-c.x);g.bullets.push({id:id(g,'b'),x:c.x,y:c.y,vx:Math.cos(a)*520,vy:Math.sin(a)*520,life:.8,owner:'police',damage:8+w.stars,interior:null});}
  if(sees&&d<42&&!getVehicle(g)&&w.stars<=2){w.arrest=(w.arrest||0)+dt;if(w.arrest>2.4){defeat(g,'busted');return;}}
 }
 if(!w.seen)w.arrest=Math.max(0,(w.arrest||0)-dt*2);
 if(w.seen){w.mode='pursuit';w.quiet=0;w.search=0;}else if(g.time-w.lastSeen>3){w.mode='search';w.quiet+=dt;w.search=clamp(w.quiet/(7+w.stars*3),0,1);if(!w.restricted&&w.quiet>7+w.stars*3){w.heat=HEAT[w.stars-1];w.stars--;w.quiet=0;note(g,w.stars?'Police search is losing momentum. Keep out of sight.':'You lost them. The streets are yours again.','wanted');if(!w.stars){clearWanted(g);return;}}}
 g._copSpawn-=dt;const desired=Math.min(8,1+w.stars);
 if(g._copSpawn<=0){g._copSpawn=2.8;if(g.police.filter(c=>c.hp>0&&c.kind!=='helicopter').length<desired)spawnCop(g,w.stars>=4?'tactical':'patrol');if(w.stars>=5&&!g.police.some(c=>c.kind==='helicopter'&&c.hp>0))spawnCop(g,'helicopter');}
 g.police=g.police.filter(c=>c.hp>0&&dist(c,p)<1800);
}
function tickCombat(g,input,dt){
 g._fire=Math.max(0,g._fire-dt);const p=g.player;
 if(input.fire&&g._fire<=0&&!getVehicle(g)){
  let target=null;if(Number.isFinite(input.aimX)&&Number.isFinite(input.aimY))target={x:input.aimX,y:input.aimY};else target=g.police.filter(c=>c.hp>0&&lineOfSight(c,p)).sort((a,b)=>dist(p,a)-dist(p,b))[0];
  const a=target?Math.atan2(target.y-p.y,target.x-p.x):p.angle;p.angle=a;
  if(p.weapon==='pistol'&&p.ammo>0){g._fire=.3;p.ammo--;g.stats.shots++;g.bullets.push({id:id(g,'b'),x:p.x+Math.cos(a)*16,y:p.y+Math.sin(a)*16,vx:Math.cos(a)*700,vy:Math.sin(a)*700,life:.8,owner:'player',damage:38,interior:p.interior});fx(g,'muzzle',p.x+Math.cos(a)*18,p.y+Math.sin(a)*18);addCrime(g,2,'Gunfire reported');}
  else{g._fire=.55;fx(g,'punch',p.x+Math.cos(a)*24,p.y+Math.sin(a)*24);const candidates=[...g.police,...g.npcs].filter(n=>n.hp>0&&(n.interior||null)===p.interior&&dist(n,p)<52);for(const n of candidates){n.hp-=22;n.panic=5;addCrime(g,n.kind?3:1,n.kind?'Officer assaulted':'Assault reported');break;}}
 }
 for(const b of g.bullets){b.life-=dt;const nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;if(!b.interior&&isSolid(nx,ny,1)){b.life=0;fx(g,'spark',nx,ny);}b.x=nx;b.y=ny;
  if(b.owner==='police'){if(!p.interior&&dist(b,p)<(getVehicle(g)?25:15)){b.life=0;const v=getVehicle(g);if(v)v.hp-=b.damage;else damage(g,b.damage);}}
  else{for(const n of [...g.police,...g.npcs]){if(n.hp>0&&(n.interior||null)===b.interior&&dist(b,n)<20){n.hp-=b.damage;b.life=0;fx(g,'hit',n.x,n.y);if(n.kind)setWanted(g,Math.min(6,Math.max(3,g.wanted.stars+1)),'Shots fired at police. Response escalating.');break;}}}
 }
 g.bullets=g.bullets.filter(b=>b.life>0);
}
export function step(g,input={},dt=1/60){
 if(!g||g.phase!=='playing'||g.dialogue)return;dt=clamp(num(dt,1/60),0,.05);g.time+=dt;g.dayTime=(g.dayTime+dt/180)%24;g.player.invulnerable=Math.max(0,g.player.invulnerable-dt);
 tickFoot(g,input,dt);tickVehicles(g,dt,input);tickPeople(g,dt);tickCombat(g,input,dt);tickWanted(g,dt);
 if(g.phase==='playing'){updateMission(g,dt);tickJob(g,dt);}
 for(const e of g.effects)e.life-=dt;g.effects=g.effects.filter(e=>e.life>0);
}
export function getObjective(g){
 const s=missionStep(g),m=missionData(g),p=g.player;
 if(s&&m){const l=s.location?location(s.location):null;let x=l?.door.x,y=l?.door.y,inside=false;
  if(s.type==='drive'&&!getVehicle(g)){const required=g.vehicles.filter(v=>v.hp>0&&(s.vehicle?v.type===s.vehicle:!typeOf(v).water)&&!v.traffic&&!v.impounded).sort((a,b)=>dist(p,a)-dist(p,b))[0];if(required){x=required.x;y=required.y;}}
  if(p.interior&&s.location===p.interior&&(s.type==='interact'||s.type==='enter')){x=320;y=150;inside=true;}
  else if(p.interior){x=320;y=420;inside=true;}
  return {title:m.title,text:s.text,hint:s.hint||defaultHint(s,g),x,y,interior:inside,progress:`${Math.min(g.mission.step+1,m.steps.length)} / ${m.steps.length}`,type:s.type};
 }
 if(g.job){
  const j=g.job,l=location(j.target);let q=jobPoint(j),inside=false;
  if(j.stage==='vehicle'){
   const needed=g.vehicles.filter(v=>v.hp>0&&!v.impounded&&!v.traffic&&(j.type==='boat'?v.type==='boat':v.type!=='boat')).sort((a,b)=>dist(p,a)-dist(p,b))[0];
   if(needed)q=needed;
  }
  if(p.interior){q={x:320,y:420};inside=true;}
  return {title:({taxi:'Taxi fare',courier:'Courier delivery',boat:'Harbor delivery',race:'Santa Elena circuit',rescue:'Medical transport'})[j.type],text:p.interior?`Leave ${location(p.interior).name}, then ${j.stage==='vehicle'?`get into ${j.type==='boat'?'a boat':'a road vehicle'}`:'follow the destination marker'}.`:j.stage==='vehicle'?`Get into ${j.type==='boat'?'a boat':'a road vehicle'}.`:j.type==='boat'?'Deliver the package to the offshore buoy.':j.type==='race'?`Drive through checkpoint ${j.checkpoint+1} of ${j.checkpoints.length}.`:j.stage==='pickup'?'Stop beside the patient at the pickup marker.':`Deliver to ${l.name}.`,hint:j.type==='race'?`${Math.ceil(j.timeLeft)} seconds left. Brake before turning.`:j.type==='rescue'?'Stop near the marker so your passenger can get in or out.':'Stay out of trouble. The customer pays when you arrive.',x:q?.x,y:q?.y,interior:inside,progress:j.type==='race'?`${j.checkpoint} / ${j.checkpoints.length}`:undefined};
 }
 return {title:g.progress.flags.storyComplete?'Your city, your choices':'A city full of possibilities',text:getAvailableMissions(g).length?'Open your phone to choose the next story job.':'Explore, earn money, and visit your contacts.',hint:'Phone: Tab · Map: M · Interact: E · Take a legal fare at Café Inés.'};
}
function defaultHint(s,g){
 if(s.type==='enter')return 'Park nearby. Get out, walk to the marked door, and press E.';
 if(s.type==='interact')return 'Inside, walk to the person at the gold marker. Press E to speak.';
 if(s.type==='drive')return 'Walk next to the marked vehicle and press E. W/S accelerate and brake; A/D steer.';
 if(s.type==='escape')return 'Turn corners to break sight. Stay away from patrols while the search cools down.';
 if(s.type==='choice')return 'Choose what matters to you. The city will remember.';
 return 'Follow the gold marker. The map shows the whole route.';
}
export function serializeGame(g){const data=clone(g);data.version=VERSION;data.bullets=[];data.effects=[];return data;}
export function restoreGame(data){
 if(!data||typeof data!=='object'||!data.player||!data.progress)throw new Error('This save is incomplete. Start a new story or restore a backup.');
 if(!String(data.version||'').startsWith('0.'))throw new Error('This save belongs to an unsupported version.');
 const base=createGame(),g={...base,...clone(data)};g.player={...base.player,...g.player};g.stats={...base.stats,...g.stats};g.progress={...base.progress,...g.progress,rep:{...base.progress.rep,...g.progress.rep},flags:{...g.progress.flags}};
 for(const field of ['x','y','hp','cash','ammo','armor','angle'])if(!Number.isFinite(g.player[field]))throw new Error('This save contains invalid player data.');
 g.player.cash=clamp(g.player.cash,0,9999999);g.player.hp=clamp(g.player.hp,0,100);g.player.ammo=clamp(g.player.ammo,0,9999);g.progress.completed=[...new Set((g.progress.completed||[]).filter(id=>MISSIONS.some(m=>m.id===id)))];g.progress.unlocked=clamp(Math.floor(num(g.progress.unlocked)),0,2);
 if(g.player.interior&&!WORLD.buildings.some(b=>b.enterable&&b.id===g.player.interior)){g.player.interior=null;Object.assign(g.player,outside('home'));}
 for(const key of ['vehicles','npcs','police','bullets','effects','notifications'])if(!Array.isArray(g[key]))g[key]=base[key];
 g.vehicles=g.vehicles.filter(v=>VEHICLE_TYPES[v.type]&&Number.isFinite(v.x)&&Number.isFinite(v.y));if(!g.vehicles.length)g.vehicles=base.vehicles;
 if(g.player.vehicleId&&!g.vehicles.some(v=>v.id===g.player.vehicleId))g.player.vehicleId=null;
 g.wanted={...base.wanted,...g.wanted};g.wanted.stars=clamp(Math.floor(num(g.wanted.stars)),0,6);g.wanted.heat=clamp(num(g.wanted.heat),0,240);
 g.bullets=[];g.effects=[];g.time=num(g.time);g._rng=num(g._rng,372984);g._id=num(g._id,1000);
 if(g.mission){const m=missionData(g);if(!m||!Number.isInteger(g.mission.step)||!m.steps[g.mission.step]||g.progress.completed.includes(m.id)){g.mission=null;g.dialogue=null;}}
 if(!['playing','down','busted'].includes(g.phase))g.phase='playing';
 if(!g.player.interior){g.player.x=clamp(g.player.x,20,WORLD.width-20);g.player.y=clamp(g.player.y,20,WORLD.height-20);if(isSolid(g.player.x,g.player.y,10))Object.assign(g.player,safePoint(g.player.x,g.player.y));}
 return g;
}

/** Holstering is explicit; simply walking around never fires a weapon. */
export function toggleWeapon(g){
 if(g.phase!=='playing')return false;
 if(g.player.weapon==='pistol'){g.player.weapon='fists';note(g,'Weapon put away.');return true;}
 if(!g.progress.flags.hasPistol){note(g,'You do not have a sidearm. Visit the market or finish your first job to obtain one.');return false;}
 g.player.weapon='pistol';note(g,'Pistol equipped. Firing can attract witnesses and police.');return true;
}
