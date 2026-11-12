/** The service ship's company belongs to the hull, not to a player's hired crew. */
import { cabinLayout, isCabinWalkable } from './interior-layouts.mjs';
import { normalizeSpecies } from './species.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const clone=value=>JSON.parse(JSON.stringify(value));
const live=member=>member&&member.health>0&&member.status!=='dead'&&!member.dead;
const navy=contract=>contract?.active&&contract.military?.branchId==='navy'&&contract.navy;
const definitions=[
 ['pilot','Commander Isen','Commanding officer','Bridge','helm',[0,0],[0,0],'Maintaining course','ledger','The ship keeps its watch in every compartment. I have the Helm; follow the current orders and ask the chief if you lose your place.'],
 ['worker','Chief Nara','Chief gunner','Weapons','security',[2,2],[-4,3],'Checking battery crews','scanner','You control four batteries: fore, port, starboard, and aft. Use their buttons or keys 1–4 in the gun view. Each battery has its own firing arc and cooldown; all four share the reactor.'],
 ['signals','Petty Officer Osei','Signals rating','Bridge','helm',[4,-3],[-3,-3],'Checking fleet signals','ledger','A contact report needs a bearing, range, and what you actually saw. A doubtful transponder is a question to answer, not permission to fire.'],
 ['navigator','Ablecrew Lin','Navigation watch','Bridge','navigation',[-3,1],[-4,-3],'Checking the next fix','scanner','I check the plotted course against the last fix. It is easy to be confidently wrong when every display repeats the same bad number.'],
 ['lookout','Crewman Vale','Bridge lookout','Bridge','helm',[-3,3],[4,3],'Keeping the visual watch','scanner','The scope does not see everything. I keep the visual watch while signals checks the identities. Report the empty sectors too.'],
 ['gangway','Ablecrew Pell','Quarterdeck watch','Deck','spawn',[-5,0],[-8,1],'Keeping the gangway clear','ledger','Airlock is forward of the bridge. When we are moored, that is your way ashore. Keep the passage clear for the next watch.'],
 ['runner','Crewman Renn','Duty runner','Deck','spawn',[6,1],[10,1],'Carrying the watch log','packet','Bridge wants the stores return; engineering wants the amended work list. Someone still has to carry the copy that everyone has signed.'],
 ['port-boat','Ablecrew Kade','Port boat crew','Deck','portboom',[2,15],[-2,11],'Checking rescue gear','tool','Harness, tether, seals, then the release. We check them before there is anyone waiting outside for us.'],
 ['starboard-boat','Crewman Jori','Starboard boat crew','Deck','starboardboom',[-2,15],[2,11],'Inspecting the boat cradle','tool','The rescue boat is on its ready checks. A quiet launch drill is how we keep a real recovery from becoming two emergencies.'],
 ['repair-chief','Petty Officer Daro','Damage control lead','Engineering','security',[-6,1],[-6,5],'Inspecting pressure doors','tool','Knowing where the patch kit lives is useful. Knowing which compartment has lost pressure is what gets people home.'],
 ['repair-hand','Crewman Amari','Repair party','Engineering','security',[-3,7],[3,7],'Counting repair stores','crate','The repair lockers are counted at every handover. If you borrow a tool, return it before the next person needs it in the dark.'],
 ['surgeon','Lieutenant Sato','Medical officer','Medical','medical',[-3,-2],[-5,3],'Preparing the treatment bay','medical','We set up the receiving bay before a rescue. Names, injuries, and who needs help first—bring me those details with the survivors.'],
 ['medic','Ablecrew Noor','Medical orderly','Medical','medical',[3,3],[-1,6],'Checking medical supplies','medical','I am checking oxygen and dressings. There is nothing dramatic about a full locker until the moment it is empty.'],
 ['engine-chief','Chief Torren','Engineering watch chief','Engineering','engineering',[-2,-7],[2,-7],'Reading drive temperatures','tool','I compare the trend with the last watch. One warm bearing is a fault to investigate; six alarms at once usually mean someone ignored it.'],
 ['engine-hand','Crewman Ives','Engineering rating','Engineering','engineering',[2,4],[-2,4],'Testing the standby pump','tool','Standby equipment gets tested before it becomes the only equipment. The chief wants the result, not just a tick in the box.'],
 ['cook','Ablecrew Moss','Galley rating','Mess','mess',[-2,-2],[2,-2],'Serving the next watch','cup','Hot food before the watch changes. If you are on duty, leave your bowl here; I will keep your portion covered.'],
 ['stores','Petty Officer Bell','Stores rating','Mess','mess',[4,2],[-4,2],'Checking the stores return','ledger','A carrier lives on manifests as much as fuel. Food, spares, medicine: someone has to notice what is running low.'],
 ['off-watch','Crewman Aster','Relief lookout','Mess','mess',[0,2],[2,3],'Taking a meal break','cup','I relieve the bridge after this. A whole watch with nothing to report still takes a pair of eyes.'],
 ['port-rounds','Ablecrew Wynn','Port accommodation rounds','Deck','portquarters',[4,-7],[4,1],'Making accommodation rounds','ledger','Clear walkways and secured lockers. Nobody enjoys the rounds until a hard turn sends an unsecured bag across the compartment.'],
 ['starboard-rounds','Crewman Leto','Starboard accommodation rounds','Deck','starboardquarters',[-4,-7],[-4,1],'Checking the next watch','packet','The off-watch crew gets time to sleep. Knock for a duty relief; leave the rest alone unless the alarm sounds.']
];
export const NAVY_SHIP_COMPANY=Object.freeze(definitions.map(([id,name,dutyLabel,department,anchor,post,errand,activity,item,greeting])=>Object.freeze({id,name,dutyLabel,department,anchor,post:Object.freeze(post),errand:Object.freeze(errand),activity,item,greeting})));
const layouts=new Map(),plans=new Map();
function layoutFor(classId){if(!layouts.has(classId))layouts.set(classId,cabinLayout(classId));return layouts.get(classId);}
function anchorPoint(layout,id){
 if(layout.stations[id])return layout.stations[id];
 if(id==='spawn')return layout.spawn;
 const room=layout.rooms.find(room=>room.id===id)||layout.rooms.find(room=>id==='mess'&&/MESS|COMMON|GALLEY/.test(room.name));
 return room?{x:(room.x+room.w/2)*layout.tile,y:(room.y+room.h/2)*layout.tile}:layout.spawn;
}
function pointsFor(layout){const points=[];for(let cell=0;cell<layout.walkable.length;cell++)if(layout.walkable[cell]){const point={x:(cell%layout.cols+.5)*layout.tile,y:(Math.floor(cell/layout.cols)+.5)*layout.tile};if(isCabinWalkable(layout,point.x,point.y,7))points.push(point);}return points;}
function choosePoint(layout,target,occupied,all,{pilot=false}={}){
 const controls=[layout.spawn,layout.archive,layout.manifest,...Object.values(layout.stations)];
 let best=null,score=Infinity;
 for(const point of all){
  if(occupied.some(other=>distance(point,other)<24))continue;
  if(!pilot&&controls.some(control=>distance(point,control)<46))continue;
  const value=distance(point,target);if(value<score){best=point;score=value;}
 }
 return best||all[0]||layout.spawn;
}
function route(layout,from,to){
 const tile=layout.tile,index=point=>Math.floor(point.y/tile)*layout.cols+Math.floor(point.x/tile),a=index(from),b=index(to);
 const previous=new Int32Array(layout.walkable.length).fill(-1),queue=[a];previous[a]=a;
 for(let cursor=0;cursor<queue.length&&previous[b]<0;cursor++){
  const cell=queue[cursor],x=cell%layout.cols,y=Math.floor(cell/layout.cols);
  for(const next of [x>0?cell-1:-1,x+1<layout.cols?cell+1:-1,y>0?cell-layout.cols:-1,y+1<layout.rows?cell+layout.cols:-1]){
   if(next<0||previous[next]>=0||!layout.walkable[next])continue;
   const point={x:(next%layout.cols+.5)*tile,y:(Math.floor(next/layout.cols)+.5)*tile};
   if(!isCabinWalkable(layout,point.x,point.y,7)||[layout.spawn,...Object.values(layout.stations)].some(control=>distance(point,control)<25))continue;
   previous[next]=cell;queue.push(next);
  }
 }
 if(previous[b]<0)return[{...from}];
 const result=[];for(let cell=b;;cell=previous[cell]){result.push({x:(cell%layout.cols+.5)*tile,y:(Math.floor(cell/layout.cols)+.5)*tile});if(cell===a)break;}
 return result.reverse();
}
function companyPlan(classId){
 if(plans.has(classId))return plans.get(classId);
 const layout=layoutFor(classId),all=pointsFor(layout),occupied=[],result=new Map();
 for(const definition of NAVY_SHIP_COMPANY){
  const anchor=anchorPoint(layout,definition.anchor),at=offset=>({x:anchor.x+offset[0]*layout.tile,y:anchor.y+offset[1]*layout.tile});
  const home=definition.id==='pilot'?{x:layout.stations.helm.x,y:layout.stations.helm.y}:choosePoint(layout,at(definition.post),occupied,all);
  occupied.push(home);result.set(definition.id,{home,away:null,path:null});
 }
 for(const definition of NAVY_SHIP_COMPANY){
  const plan=result.get(definition.id),anchor=anchorPoint(layout,definition.anchor);
  plan.away=definition.id==='pilot'?plan.home:choosePoint(layout,{x:anchor.x+definition.errand[0]*layout.tile,y:anchor.y+definition.errand[1]*layout.tile},occupied,all);
  occupied.push(plan.away);plan.path=definition.id==='pilot'?[plan.home]:route(layout,plan.home,plan.away);plan.length=(plan.path.length-1)*layout.tile;
 }
 plans.set(classId,result);return result;
}

/** Run only on the solo simulation or the server's canonical vessel actor. */
export function initializeNavyCrew(game,contract,inventory=game.state){
 if(!navy(contract)||!Array.isArray(inventory?.crew))return false;
 if(game.state.boarding?.phase==='active'||game._navyCrewInCombat===true)return false;
 const current=inventory.crew,plan=companyPlan(contract.classId||'leviathan'),remembered=new Set(contract.navy.companyIds||[]);
 let changed=false;
 for(const definition of NAVY_SHIP_COMPANY){
  const id=`${contract.id}:${['pilot','worker'].includes(definition.id)?definition.id:`sailor:${definition.id}`}`;
  let member=current.find(member=>member.id===id);
  // A missing established member may be in the casualty record. Migration
  // never manufactures a replacement for a person who was already recorded.
  if(!member&&remembered.has(id))continue;
  if(!member){member={id,health:100,maxHealth:100,status:'active'};current.push(member);changed=true;}
  if(!member.serviceCrew){
   const dead=member.status==='dead'||member.health<=0;
   Object.assign(member,{name:definition.name,role:definition.id==='pilot'?'pilot':'sailor',species:normalizeSpecies(member.species),serviceCrew:true,serviceId:definition.id,dutyLabel:definition.dutyLabel,department:definition.department,
    color:({Bridge:'#9bafbd',Weapons:'#8ba7b5',Deck:'#7ea8ac',Engineering:'#a3b9a3',Medical:'#a4c5ba',Mess:'#c4b698'})[definition.department],
    serviceWatch:{direction:1,distance:0,hold:definition.id==='pilot'?0:5+hash(id)%24},...plan.get(definition.id).home});
   if(dead){member.health=0;member.status='dead';}
   changed=true;
  }
  member.dutyLabel=definition.dutyLabel;member.department=definition.department;
  if(!member.serviceWatch)member.serviceWatch={direction:1,distance:0,hold:8};
  member.activity=member.activity||definition.activity;member.greeting=member.greeting||definition.greeting;
  member.life=member.life||{activity:definition.id==='off-watch'?'eating':'working',label:member.activity,item:definition.item};
  member.moving=!!member.moving;member.facing=member.facing||'down';remembered.add(id);
 }
 contract.navy.companyVersion=1;contract.navy.companyIds=[...remembered];
 return changed;
}
function contextGreeting(definition,contract,member){
 if(definition.id==='worker')return definition.greeting;
 if(contract.phase==='returning'||contract.phase==='docked')return definition.department==='Medical'?'Keep the receiving bay ready until every person is accounted for. We close the casualty log after the last one is ashore.':definition.department==='Engineering'?'We still have the arrival checks to finish. A completed mission does not stop the machinery from needing its next watch.':definition.department==='Mess'?'I will get the next meal on while you finish the debrief. There will be another watch after this one.':'We are closing the watch log and preparing the handover. Report what happened accurately; a quiet duty is still service.';
 if(contract.navy.spawned&&contract.work?.targets?.some(target=>!target.neutralized))return definition.department==='Medical'?'Receiving bay ready. Give us names and injuries as soon as you have them.':definition.department==='Engineering'?'We are checking pressure and power after each impact. Report smoke or a pressure loss by compartment.':definition.department==='Weapons'?'Stay with the ordered targets. Check your battery arc and call if a contact crosses the beam.':'Action stations. Keep the passage clear and follow the current orders.';
 if(member.life?.activity==='eating')return 'A few minutes for food, then I relieve the next watch. You learn to appreciate an uneventful shift.';
 return definition.greeting;
}
export function stepNavyCrew(game,contract,delta){
 if(!navy(contract)||game.state.ship?.id!==contract.vesselId)return;
 initializeNavyCrew(game,contract);
 const crew=game.state.crew,plan=companyPlan(contract.classId||'leviathan'),dt=Math.max(0,Math.min(1,finite(delta)));
 const combat=game.state.boarding?.phase==='active'||game._navyCrewInCombat===true;
 for(const member of crew){
  if(!member.serviceCrew||!live(member))continue;
  const definition=NAVY_SHIP_COMPANY.find(value=>value.id===member.serviceId),trip=plan.get(member.serviceId);if(!definition||!trip)continue;
  if(combat){member.moving=false;continue;}
  const watch=member.serviceWatch,old={x:member.x,y:member.y};member.moving=false;
  if(member.serviceId!=='pilot'&&trip.length>0){
   if(watch.hold>0)watch.hold=Math.max(0,watch.hold-dt);
   else{
    watch.distance=Math.min(trip.length,Math.max(0,finite(watch.distance))+(22+hash(member.id)%9)*dt);
    const traveled=watch.direction===-1?trip.length-watch.distance:watch.distance,index=Math.min(trip.path.length-2,Math.floor(traveled/24)),part=(traveled-index*24)/24;
    const from=trip.path[index],to=trip.path[index+1];member.x=from.x+(to.x-from.x)*part;member.y=from.y+(to.y-from.y)*part;
    member.moving=distance(member,old)>.01;
    if(member.moving)member.facing=Math.abs(member.x-old.x)>Math.abs(member.y-old.y)?member.x>old.x?'right':'left':member.y>old.y?'down':'up';
    if(watch.distance>=trip.length){watch.direction=watch.direction===-1?1:-1;watch.distance=0;watch.hold=12+hash(`${member.id}:${watch.direction}`)%23;}
   }
  }
  member.activity=member.moving?definition.item==='packet'?'Carrying the duty dispatch':`Making ${definition.department.toLowerCase()} rounds`:definition.activity;
  member.life={activity:member.moving?'walking':definition.id==='off-watch'?'eating':'working',label:member.activity,item:definition.item,carrying:member.moving?definition.item:null};
  member.greeting=contextGreeting(definition,contract,member);
 }
 // The same authoritative coordinates feed both damage and presentation.
 if(!combat)game._damageCrewPositions=crew.filter(live).map(member=>({crewId:member.id,x:member.x,y:member.y}));
}

/** Updates a cached deck without creating an independent client-side crowd. */
export function syncNavyCrewSurface(surface,crew){
 if(surface?.kind!=='ship')return;
 const members=new Map((crew||[]).filter(member=>member.serviceCrew).map(member=>[member.id,member]));
 for(const entity of surface.entities||[]){
  const member=members.get(entity.data?.crewId);if(!member)continue;
  if(Number.isFinite(member.x)&&Number.isFinite(member.y)){entity.x=member.x;entity.y=member.y;}
  entity.hidden=!live(member);entity.moving=!!member.moving;entity.facing=member.facing||'down';entity.life=member.life?clone(member.life):null;
  entity.name=member.name;entity.color=member.color||entity.color;entity.text=member.greeting;
  Object.assign(entity.data,{serviceCrew:true,dutyLabel:member.dutyLabel,department:member.department,roleLabel:member.dutyLabel,greeting:member.greeting,health:member.health,maxHealth:member.maxHealth||100,status:member.status,hurtUntil:member.hurtUntil||member.hitUntil||0});
 }
}

/** Brief nearby exchanges use only the current public duty, never future contacts. */
export function sampleNavyCrewConversation(surface,contract,person,{lastKey=null}={}){
 if(!navy(contract)||surface?.vesselId!==contract.vesselId||!person||person.health<=0)return null;
 if(contract.navy.spawned&&contract.work?.targets?.some(target=>!target.neutralized))return null;
 const window=Math.floor(finite(contract.clock)/30),key=`${contract.id}:${window}`;
 if(key===lastKey||finite(contract.clock)%30<3)return null;
 const layout=layoutFor(contract.classId||'leviathan'),audible=entity=>{const length=distance(entity,person),steps=Math.ceil(length/8);for(let step=1;step<steps;step++)if(!isCabinWalkable(layout,person.x+(entity.x-person.x)*step/steps,person.y+(entity.y-person.y)*step/steps,0))return false;return true;};
 const nearby=(surface.entities||[]).filter(entity=>entity.data?.serviceCrew&&!entity.hidden&&entity.data.health>0&&distance(entity,person)<150&&audible(entity)).sort((a,b)=>distance(a,person)-distance(b,person));
 const speaker=nearby[0];if(!speaker)return null;
 const lines={
  Bridge:['Check that bearing against the visual report.','Last fix agrees. Keeping the next leg under review.','Log the quiet sectors as well.'],
  Weapons:['Battery checks complete. Standing by for orders.','Watch the arc before you hand the contact over.','Keep the reactor reserve in view.'],
  Deck:['Ready gear checked. Passage is clear.','Watch relief is on its way to the bridge.','Tethers and seals checked twice.'],
  Engineering:['Standby pump tested. Readings entered.','No new pressure loss on the last round.','Pass that temperature trend to the next watch.'],
  Medical:['Oxygen checked. Receiving bay ready.','Put the fresh dressings in the forward locker.','Names first, then injuries and treatment.'],
  Mess:['Next watch gets the hot tray.','Leave your bowl; I will keep a portion for you.','Stores return is ready for the duty runner.']
 };
 return{id:key,key,seconds:7,lines:[{speaker:speaker.name,text:(lines[speaker.data.department]||lines.Deck)[window%3]}]};
}
