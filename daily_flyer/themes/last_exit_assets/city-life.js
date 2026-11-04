import {groundHeight} from './terrain.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ENCOUNTERS=[
 {id:'parcel',title:'THE WRONG ADDRESS',item:'record parcel',from:'cafe',to:'books',offer:'Rosa: This record parcel came to the wrong shop. Take it to Common Ground across the river?',thanks:'Marek: Finally! The morning listening party is saved.'},
 {id:'tools',title:'BORROWED TOOLS',item:'tool case',from:'books',to:'garage',offer:'Marek: Dee left a tool case here. River Works Garage could use it back.',thanks:'Dee: Just in time. Let me tune up your car in return.'},
 {id:'coffee',title:'EARLY SHIFT',item:'coffee box',from:'garage',to:'cafe',offer:'Dee: Bring these empty coffee flasks back to Rosa. The night shift owes her one.',thanks:'Rosa: Another long night at the garage? Coffee is on the house.'}
];
export function resetCityLife(g){g.interior=null;g.voiceEvents=[];g.voiceSerial=0;g.voiceSpeakerSerial=0;g.nextVoiceAt=0;g.cityLife=g.city.id==='boston'?{completed:0,nextAt:20,box:null,encounter:null,variant:Math.floor(g.rnd()*ENCOUNTERS.length),visited:new Set()}:null;}
export function vocalize(g,p,mood='alarm'){
 if(g.elapsed<(p.nextVoiceAt||0)||g.elapsed<(g.nextVoiceAt||0)||distance(p,g.actor)>40)return false;
 p.nextVoiceAt=g.elapsed+7;g.nextVoiceAt=g.elapsed+1.3;
 p.voiceId??=++g.voiceSpeakerSerial;g.voiceEvents.push({x:p.x,z:p.z,speakerId:p.voiceId,time:g.elapsed,serial:++g.voiceSerial,mood,voice:Math.floor((Math.abs(p.x*7+p.z*13))%5)});g.voiceEvents=g.voiceEvents.slice(-8);return true;
}
export function cityLifeInfo(g){
 if(!g.onFoot||!g.cityLife||g.job.id!=='free'||g.person.stun>0)return null;
 if(g.interior){const p=g.interior.place,o=g.interior.origin,q={x:g.person.x-o.x,z:g.person.z-o.z};if(q.z<-2.6)return{type:'leave',label:'Back outside',place:p};if(distance(q,{x:0,z:1.1})<2.5)return{type:'talk',label:`Talk to ${p.person}`,place:p};return null;}
 if(g.cityLife.box&&distance(g.person,g.cityLife.box)<2&&g.canSee(g.person,g.cityLife.box))return {type:'box',label:'Inspect box',box:g.cityLife.box};
 const candidates=(g.city.places||[]).map(p=>({type:'enter',label:`Enter ${p.kind==='cafe'?'coffee shop':p.kind==='books'?'bookshop':'garage'}`,place:p,d:distance(g.person,p.entrance)})).filter(x=>x.d<3.8&&g.canSee(g.person,x.place.entrance)&&Math.abs((g.person.y??groundHeight(g.person.x,g.person.z,g.city.id))-groundHeight(x.place.entrance.x,x.place.entrance.z,g.city.id))<1.5);
 if(candidates.length)return candidates.sort((a,b)=>a.d-b.d)[0];
 const npc=g.pedestrians.filter(p=>!p.networkPlayer&&!p.stun&&p.reaction!=='flee'&&distance(g.person,p)<2.7&&g.canSee(g.person,p)).sort((a,b)=>distance(g.person,a)-distance(g.person,b))[0];
 return npc?{type:'rumor',label:'Talk',person:npc}:null;
}
export function interactCityLife(g){const info=cityLifeInfo(g);if(!info)return false;
 if(info.type==='box'){const def=ENCOUNTERS.find(d=>d.id===info.box.id),destination=g.city.places.find(p=>p.id===def.to);g.cityLife.encounter={id:def.id,stage:'carrying'};g.cityLife.box=null;g.waypoint={...destination.entrance,placeId:destination.id,label:`Deliver ${def.item} · ${destination.name}`};g.say(`FOUND BOX · ${def.item}. The label says ${destination.name}. Destination marked.`);return true;}
 if(info.type==='enter'){
  if(g.heat||g.reports.length){g.say('The door stays shut while police are looking for you. Lose the heat first.');return true;}
  g.voiceEvents=[];const p=info.place,origin={x:p.x,z:p.z,y:groundHeight(p.x,p.z,'boston')+.2};g.interior={place:p,origin,outside:{...g.person},speaker:{x:origin.x,z:origin.z+3.65,y:origin.y}};g.cityLife.visited.add(p.id);if(g.waypoint?.placeId===p.id)g.waypoint=null;g.person={...g.person,x:origin.x,z:origin.z-3.6,y:origin.y,a:0,speed:0,vx:0,vz:0,knockVX:0,knockVZ:0};g.walkHeading=0;g.say(p.name+' · Walk to the counter to talk. The door is behind you.');return true;
 }
 if(info.type==='leave'){leaveInterior(g);return true;}
 if(info.type==='rumor'){
  const p=info.person;vocalize(g,p,'chat');p.reaction='watch';p.reactionTime=3;p.escapeFrom={x:g.person.x,z:g.person.z};
  const rumors=['Local: Rosa opens early at North End Coffee. Look for the warm doorway.','Local: Common Ground sells records as well as books. Across the river, near the Common.','Local: Dee at River Works always has a small job going.','Local: Nobody gets across this river without using that bridge.'];g.say(rumors[Math.floor(Math.abs(p.x+p.z))%rumors.length]);return true;
 }
 const life=g.cityLife,p=info.place;vocalize(g,g.interior.speaker,'chat');
 if(life.encounter){const e=life.encounter,def=ENCOUNTERS.find(d=>d.id===e.id);
  if(e.stage==='carrying'&&def.to===p.id){life.completed++;life.nextAt=g.elapsed+45;life.encounter=null;g.waypoint=null;
   if(def.id==='tools'){g.car.engineDamage=Math.max(0,g.car.engineDamage-45);g.car.wheelDamage=Math.max(0,g.car.wheelDamage-35);}
   g.say(def.thanks+' · Favor '+life.completed+' complete.');return true;
  }
  g.say(`${p.person}: Bring the ${def.item} to ${g.city.places.find(p=>p.id===def.to).name}.`);return true;
 }
 if(life.completed&&g.elapsed<life.nextAt){g.say(`${p.person}: Take a breather. There will be another favor soon.`);return true;}
 // Each business can offer its own encounter; visiting in any order remains useful.
 const def=ENCOUNTERS.find(e=>e.from===p.id),destination=g.city.places.find(p=>p.id===def.to);
 life.box=null;life.encounter={id:def.id,stage:'carrying'};g.waypoint={...destination.entrance,placeId:destination.id,label:`Deliver ${def.item} · ${destination.name}`};g.say(def.offer+' · Box collected; destination marked.');return true;
}
export function leaveInterior(g){if(!g.interior)return;const p=g.interior.place,old=g.interior.outside;g.person={...old,x:p.entrance.x,z:p.entrance.z,y:groundHeight(p.entrance.x,p.entrance.z,'boston'),speed:0,vx:0,vz:0};g.interior=null;g.voiceEvents=[];g.walkHeading=g.person.a;g.say('Back on the street.');}
export function stepInterior(g,dt,input){const o=g.interior.origin,p=g.person,before={x:p.x,z:p.z};let x=clamp(input.moveX||0,-1,1),z=clamp(input.moveY||0,-1,1),l=Math.max(1,Math.hypot(x,z)),speed=input.run?4.1:2.8;x/=l;z/=l;
 // Fixed camera faces north: screen-right is world -X, as in the street controls.
 p.x=clamp(p.x-x*speed*dt,o.x-4.45,o.x+4.45);p.z=clamp(p.z+z*speed*dt,o.z-4.5,o.z+4.7);
 const q={x:p.x-o.x,z:p.z-o.z};for(const b of[{x:0,z:2.5,w:5.8,d:1.1},{x:-3.3,z:-.1,w:1.1,d:1.3},{x:3.3,z:-.1,w:1.1,d:1.3}])if(Math.abs(q.x-b.x)<b.w/2+.35&&Math.abs(q.z-b.z)<b.d/2+.35){p.x=before.x;p.z=before.z;break;}
 p.y=o.y;p.speed=distance(before,p)/dt;p.vx=(p.x-before.x)/dt;p.vz=(p.z-before.z)/dt;if(p.speed>.05){p.a=Math.atan2(p.vx,p.vz);p.walk+=p.speed*dt*3;}
 g.elapsed+=dt;g.messageTime=Math.max(0,g.messageTime-dt);
}
export function encounterLabel(g){const e=g.cityLife?.encounter;if(!e)return '';const d=ENCOUNTERS.find(d=>d.id===e.id);return `${d.title} · Carrying ${d.item}`;}
// Three different dressed rooms share predictable walkable bounds and one fixed cutaway camera.
export function drawInterior(m,inside){const {place:p,origin:o}=inside;const saved=m.transform;m.transform={x:o.x,y:o.y,z:o.z,c:1,s:0};const cafe=p.id==='cafe',books=p.id==='books',wall=cafe?'#b08c6e':books?'#8d9b7d':'#8b9793';
 m.box(0,-.28,0,10,.28,10,'#4e5c55');m.surface([-5,.01,-5],[5,.01,-5],[5,.01,5],[-5,.01,5],cafe?2:14,4,4,cafe?'#d4b891':'#b6ad94');
 m.box(0,0,5,10,3.5,.22,wall);m.box(-5,0,0,.22,1.1,10,wall);m.box(5,0,0,.22,1.1,10,wall);
 m.box(0,0,2.5,5.8,1.05,1.1,cafe?'#8d6348':books?'#546d5e':'#6c7876');m.box(0,1.05,2.5,6,.14,1.25,'#c4b497');
 for(const x of[-3.3,3.3]){m.box(x,0,-.1,1.1,.75,1.3,'#705e49');m.box(x,.75,-.1,1.2,.12,1.4,'#bda17a');}
 if(books){for(const xx of[-3.5,3.5]){m.box(xx,0,4.55,2.3,2.8,.5,'#6b5a42');for(let y=.4;y<2.8;y+=.9)for(let i=0;i<5;i++)m.box(xx-.9+i*.42,y,4.2,.29,.5,.25,['#9d624c','#617f79','#b59f60','#a9a88d'][i%4]);}}
 else if(cafe){m.box(-2.8,1.8,4.7,2.8,1,.1,'#304b43');for(let i=0;i<4;i++)m.box(-2.8,2.55-i*.17,4.62,2-i*.15,.035,.02,'#c5c4a5');m.box(3,1.65,4.6,2.5,.12,.55,'#765a40');for(let i=0;i<5;i++)m.box(2.1+i*.4,1.78,4.6,.2,.24,.22,'#d9c8a5');m.disc(3,2.6,4.75,.3,'#d4bd92',12);
  for(const x of[-3.3,3.3])for(const z of[-1.2,1]){m.box(x,0,z,.6,.46,.55,'#61796b');m.box(x,.46,z+.24,.6,.6,.08,'#6d8370');}m.box(2.5,.02,-3.2,1.5,.03,1.2,'#b58d64');m.box(-1.5,1.2,2.5,.7,.65,.5,'#aab6a7');for(const x of[.6,1.3,2])m.box(x,1.2,2.5,.18,.23,.18,'#e0d0aa');}
 else{for(let i=0;i<5;i++){m.box(-3.5+i*1.7,1.3,4.8,.9,.08,.18,'#c0a66e');m.tube([-3.5+i*1.7,1.3,4.7],[-3.5+i*1.7,2,4.7],.05,'#b0b8ac',4);}m.box(3.4,0,3.8,1.1,1.25,.8,'#8a4d3f');}
 m.box(0,.02,-4.5,2,.03,.8,'#ad9e6d');m.surface([-1.5,1.8,4.86],[1.5,1.8,4.86],[1.5,3,4.86],[-1.5,3,4.86],books?12:cafe?10:11,1,1,'#fff2d2');m.transform=saved;return m;
}
export function tickCityLife(g){const life=g.cityLife;if(!life||g.job.id!=='free'||g.interior||life.encounter)return;if(!life.box&&g.elapsed>=life.nextAt){const def=ENCOUNTERS[(life.variant+life.completed)%ENCOUNTERS.length],place=g.city.places.find(p=>p.id===def.from);if(place)life.box={...place.entrance,id:def.id,announced:false};}if(life.box&&!life.box.announced&&distance(life.box,g.actor)<20){g.say('STREET FIND · Someone left a labeled box by the doorway. Get out to inspect it.');life.box.announced=true;}}
export function drawCityDetails(m,game,time){
 for(const p of game.city.places||[]){if(distance(p.entrance,game.actor)>70)continue;const e=p.entrance,y=groundHeight(e.x,e.z,'boston');m.disc(e.x,y+.03,e.z,.65,'#c7a46b',12);m.transform={x:e.x,y,z:e.z,c:Math.cos(p.a),s:Math.sin(p.a)};m.box(0,.04,-.65,1.6,.04,.8,'#d1b074');m.transform=null;}
 const box=game.cityLife?.box;if(box&&distance(box,game.actor)<70){const y=groundHeight(box.x,box.z,'boston');m.box(box.x,y,box.z,.65,.45,.5,'#ae885b');m.box(box.x,y+.45,box.z,.11,.01,.51,'#d4bd89');m.box(box.x+.1,y+.46,box.z,.18,.01,.18,'#ddd3af');m.tri([box.x-.14,y+1.8,box.z],[box.x+.14,y+1.8,box.z],[box.x,y+1.55,box.z],'#f0ca80');}
 // Falling leaves and a few warm window lights are bounded local details, not physical objects.
 if(game.city.id==='boston'){const a=game.actor;for(let i=0;i<8;i++){const x=Math.floor(a.x/30)*30+Math.sin(i*7.1)*19,z=Math.floor(a.z/30)*30+Math.cos(i*3.8)*19,y=groundHeight(x,z,'boston')+((i*.47-time*.18)%3+3)%3;m.tri([x-.09,y,z],[x+.09,y-.03,z],[x,y,z+.16],i%2?'#bd874a':'#a96742');}}
}
