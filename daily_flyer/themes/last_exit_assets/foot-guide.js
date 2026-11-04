import {groundHeight} from './terrain.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function placeAvailability(g){
 if(!g.cityLife||g.job.id!=='free')return 'Solo free drive only';
 if(g.heat||g.reports.length)return 'Lose police attention first';
 return '';
}
export function placeDestination(place){return {...place.entrance,placeId:place.id,label:place.name+' · DOOR'};}
export function nearestPlace(g){return (g.city.places||[]).map(place=>({place,d:distance(g.actor,place.entrance)})).sort((a,b)=>a.d-b.d)[0]||null;}
export function directionTo(g,p){
 const a=g.viewYaw??g.actor.a,dx=p.x-g.actor.x,dz=p.z-g.actor.z;
 const angle=Math.atan2(-Math.cos(a)*dx+Math.sin(a)*dz,Math.sin(a)*dx+Math.cos(a)*dz);
 const index=(Math.round(angle/(Math.PI/4))+8)%8;
 return ['↑ Ahead','↗ Ahead-right','→ Right','↘ Behind-right','↓ Behind','↙ Behind-left','← Left','↖ Ahead-left'][index];
}
export function footAction(g,network=false){
 const secondary=g.interior?'Go outside':'Places';
 if(g.person.stun>0)return {label:'Getting up…',detail:'Wait until you are back on your feet.',ready:false,secondary};
 if(g.takeover)return {label:'Taking car…',detail:'Stay beside the door. Move to cancel.',ready:false,secondary};
 const story=network?null:g.lifeInfo();
 if(story){const blocked=story.type==='enter'?placeAvailability(g):'';return {label:blocked?'Door locked':story.label,detail:blocked||story.place?.name||(story.type==='box'?'Labeled delivery box by the door':'Nearby pedestrian'),ready:!blocked,secondary:story.type==='leave'?null:secondary,story};}
 if(g.interior)return {label:`Talk to ${g.interior.place.person}`,detail:'Walk up to the counter to talk.',ready:false,secondary};
 const car=g.interactionInfo();
 if(car){const occupied=network&&car.car.driverId&&car.car.driverId!==network.id;return {label:car.kind==='hijack'?'Take car':'Enter car',detail:occupied?'Another player is driving':car.ready?car.car.name||'Stopped car':car.reason,ready:!!car.ready&&!occupied,secondary,car};}
 const near=nearestPlace(g),selected=(g.city.places||[]).find(p=>p.id===g.waypoint?.placeId),place=selected||near?.place;
 return {label:place?'Find a door':'City map',detail:place?`${place.name} · ${Math.round(distance(g.actor,place.entrance))} m · ${directionTo(g,place.entrance)}`:'Approach a person or a stopped car.',ready:true,explore:true,secondary:null};
}
const voiceText={angry:'Angry shout',alarm:'Startled yell',chat:'Talking'};
export function speakerFor(g,e){return [g.interior?.speaker,...g.pedestrians,...(g.officers||[])].find(p=>p&&p.voiceId===e.speakerId)||e;}
export function soundCue(g,ambient){
 const voice=(g.voiceEvents||[]).filter(e=>g.elapsed-e.time>=0&&g.elapsed-e.time<2.8&&distance(e,g.actor)<35).at(-1);
 if(voice){const p=speakerFor(g,voice);return {label:voiceText[voice.mood]||'Voice',detail:g.interior?g.interior.place.person:`${directionTo(g,p)} · ${Math.round(distance(p,g.actor))} m`,source:p,type:'voice'};}
 const blast=(g.explosions||[]).filter(e=>g.elapsed-e.time>=0&&g.elapsed-e.time<3&&distance(e,g.actor)<130).at(-1);
 if(blast)return {label:'Car explosion',detail:directionTo(g,blast),source:blast,type:'danger'};
 const horn=(g.hornEvents||[]).filter(e=>g.elapsed-e.time>=0&&g.elapsed-e.time<1.8&&distance(e,g.actor)<75).at(-1);
 if(horn)return {label:'Car horn',detail:directionTo(g,horn),source:horn,type:'street'};
 if(ambient&&g.elapsed-ambient.time>=0&&g.elapsed-ambient.time<3)return ambient;
 if(g.onFoot&&g.person.speed>.5)return {label:g.person.speed>4?'Running footsteps':'Footsteps',detail:'Your movement',type:'movement'};
 return null;
}
export function worldMarkers(g){
 const out=[],height=p=>(p.y??groundHeight(p.x,p.z,g.city.id));
 if(g.interior){const o=g.interior.origin,p=g.interior.place;out.push({key:'counter',x:o.x,y:o.y+2.1,z:o.z+3.65,title:p.person,detail:'Talk at the counter',kind:'door'},{key:'exit',x:o.x,y:o.y+.25,z:o.z-4.5,title:'EXIT',detail:'Go outside',kind:'door'});}
 else for(const p of g.city.places||[]){const e=p.entrance,d=distance(g.actor,e);if(d>55||!g.canSee(g.actor,e))continue;out.push({key:p.id,...e,y:height(e)+2.5,title:p.name,detail:`${placeAvailability(g)||'ENTER HERE'} · ${Math.round(d)} m`,kind:placeAvailability(g)?'closed':'door'});}
 const box=g.cityLife?.box;if(!g.interior&&box&&distance(g.actor,box)<18&&g.canSee(g.actor,box))out.push({key:'box',...box,y:height(box)+.8,title:'DELIVERY BOX',detail:'Inspect on foot',kind:'box'});
 const e=(g.voiceEvents||[]).filter(e=>g.elapsed-e.time>=0&&g.elapsed-e.time<1.8&&distance(e,g.actor)<35).at(-1);
 if(e){const p=speakerFor(g,e);if(g.interior||g.canSee(g.actor,p))out.push({key:'speaker',x:p.x,z:p.z,y:height(p)+2.1,title:voiceText[e.mood],detail:'',kind:'voice'});}
 return out;
}
// Normalized CSS coordinates use the exact camera matrix for both renderers.
export function projectMarker(matrix,p){
 if(!matrix)return null;const {x,y,z}=p,w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];if(w<=.2)return null;
 const X=(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w,Y=(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w;
 if(Math.abs(X)>.95||Y<-.8||Y>.86)return null;return {x:(X+1)*50,y:(1-Y)*50};
}
