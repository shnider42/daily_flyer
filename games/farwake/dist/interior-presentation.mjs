/** Local presentation of persistent, authoritative damage aboard one physical hull. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const empty=()=>({shake:{x:0,y:0},flash:0,hits:[],fresh:[],alarm:false,fireCount:0,breachCount:0,newEmergency:false});

/** Snapshot repeats and entering a damaged ship must not replay its old impacts. */
export class InteriorPresentation {
 constructor(){this.reset();}
 reset(){this.hullId=null;this.serial=0;this.clock=0;this.effects=[];this.alarm=false;}
 sample(hull,time,{visible=true,motion=true}={}){
  const dc=hull?.damageControl;
  if(!visible||!dc){this.reset();return empty();}
  const id=String(hull.id??hull.vesselId??hull.classId??'current'),clock=Math.max(0,Number(dc.clock)||0),serial=Math.max(0,Number(dc.serial)||0);
  const sections=Array.isArray(dc.sections)?dc.sections:[],fireCount=sections.filter(s=>s.fire>.1).length,breachCount=sections.filter(s=>s.breach>.1).length,alarm=fireCount+breachCount>0;
  if(this.hullId!==id||clock+.01<this.clock||serial<this.serial){
   this.hullId=id;this.serial=serial;this.clock=clock;this.effects=[];this.alarm=alarm;
   return{...empty(),alarm,fireCount,breachCount};
  }
  const fresh=(dc.impacts||[]).filter(hit=>hit.serial>this.serial&&clock-hit.at>=-.1&&clock-hit.at<2);
  for(const hit of fresh)this.effects.push({...hit,born:time});
  this.effects=this.effects.filter(hit=>time-hit.born<.65).slice(-6);
  const hits=this.effects.map(hit=>({...hit,age:Math.max(0,time-hit.born)}));
  let x=0,y=0,flash=0;
  if(motion)for(const hit of hits){
   const strength=clamp(hit.strength,0,1)*(hit.shieldOnly?.38:1),fade=Math.max(0,1-hit.age/.42);
   // Small, real hull hits must survive pixel rounding on a phone. Output is
   // in display pixels; the caller removes person zoom before camera sampling.
   const amplitude=strength>0?(hit.shieldOnly?.7+strength*1.6:1.6+strength*3.5)*fade*fade:0;
   x+=Math.sin(hit.serial*2.4+hit.age*61)*amplitude;y+=Math.cos(hit.serial*1.7+hit.age*53)*amplitude;
   flash=Math.max(flash,Math.max(0,1-hit.age/.17)*strength*.055);
  }
  const newEmergency=alarm&&!this.alarm;
  this.serial=Math.max(serial,this.serial,...fresh.map(hit=>hit.serial));this.clock=clock;this.alarm=alarm;
  return{shake:{x:clamp(x,-3.5,3.5),y:clamp(y,-3.5,3.5)},flash,hits,fresh,alarm,fireCount,breachCount,newEmergency};
 }
}

/** These markers exist only for damage already recorded on this particular hull. */
export function syncDamageMarkers(surface,hull){
 if(!surface||surface.kind!=='ship')return;
 if(surface.vesselId&&hull&&(hull.id||hull.vesselId)&&String(surface.vesselId)!==String(hull.id||hull.vesselId)){surface.entities=surface.entities.filter(e=>e.type!=='damageControl');return;}
 const old=new Map(surface.entities.filter(e=>e.type==='damageControl').map(e=>[e.id,e]));
 const markers=[];
 for(const section of hull?.damageControl?.sections||[]){
  if(!(section.fire>.1||section.breach>.1||section.damage>.1))continue;
  const id=`${surface.id}:damage:${section.id}`,fire=section.fire>.1,breach=section.breach>.1;
  const name=`${fire?'Fire':breach?'Hull breach':'Damaged systems'} · ${section.name||section.id}`;
  const entity=old.get(id)||{id,type:'damageControl'};
  Object.assign(entity,{x:section.x,y:section.y,name,role:'Damage control',color:fire?'#e8a365':breach?'#8fcad8':'#d8be83',hidden:false,
   data:{sectionId:section.id,shipId:hull.id,fire:section.fire,breach:section.breach,damage:section.damage,roleLabel:'Damage control'}});
  markers.push(entity);
 }
 surface.entities=surface.entities.filter(e=>e.type!=='damageControl').concat(markers);
}
export function nearestDamageMarker(surface,person,range=72){
 if(!surface||surface.kind!=='ship'||!person)return null;
 return surface.entities.filter(e=>e.type==='damageControl'&&!e.hidden&&Math.hypot(e.x-person.x,e.y-person.y)<=range)
  .sort((a,b)=>Number(b.data.fire>.1)-Number(a.data.fire>.1)||Number(b.data.breach>.1)-Number(a.data.breach>.1)||Math.hypot(a.x-person.x,a.y-person.y)-Math.hypot(b.x-person.x,b.y-person.y))[0]??null;
}
/** A crew console or person within use range must remain reachable beside damage. */
export function nearestDeckInteraction(surface,person,range=43){
 if(!surface||surface.kind!=='ship'||!person)return null;
 const airlock=surface.entities.find(entity=>entity.data?.airlock&&entity.data?.dockedAt&&!entity.hidden&&!entity.disabled&&Math.hypot(entity.x-person.x,entity.y-person.y)<=range);
 if(airlock)return airlock;
 let nearest=null,best=range;
 for(const entity of surface.entities){
  if(entity.hidden||entity.disabled||entity.type==='damageControl')continue;
  const distance=Math.hypot(entity.x-person.x,entity.y-person.y);
  if(distance<=best){nearest=entity;best=distance;}
 }
 return nearest??nearestDamageMarker(surface,person);
}
export function damageStatus(hull){
 const sections=hull?.damageControl?.sections||[],fires=sections.filter(s=>s.fire>.1).length,breaches=sections.filter(s=>s.breach>.1).length;
 return[fires?`${fires} fire${fires===1?'':'s'}`:'',breaches?`${breaches} breach${breaches===1?'':'es'}`:''].filter(Boolean).join(' · ');
}

const box=(ctx,color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
const nearby=(section,view)=>!view||section.x>=view.cameraX-75&&section.x<=view.cameraX+view.width+75&&section.y>=view.cameraY-85&&section.y<=view.cameraY+view.height+75;

/** Draw in deck/world coordinates, underneath people and furniture. */
export function drawInteriorDamageFloor(ctx,surface,damage,{time=0,motion=true,view=null}={}){
 if(surface.kind!=='ship'||!damage)return;
 ctx.save();
 for(const section of damage.sections||[]){
  if(!nearby(section,view))continue;
  const x=section.x,y=section.y,wear=clamp(section.damage,0,100),fire=clamp(section.fire,0,100),breach=clamp(section.breach,0,100);
  if(wear>0){
   const size=6+Math.floor(wear*.15);ctx.globalAlpha=.28+wear*.003;
   box(ctx,'#10151c',x-size,y-size*.55,size*2,size*1.1);box(ctx,'#0a1119',x-3,y-size,8,size*2);
   ctx.globalAlpha=1;box(ctx,'#927655',x-size+2,y+4,Math.max(3,size-2),2);box(ctx,'#273442',x+3,y-5,size-2,3);
   if(wear>35){box(ctx,'#09121b',x-13,y-12,2,9);box(ctx,'#09121b',x-20,y-14,9,2);box(ctx,'#b28b60',x+13,y+7,7,2);}
  }
  if(fire>.1){ctx.globalAlpha=.12+(motion?.025*Math.sin(time*2.2):0);box(ctx,'#f0a15b',x-28,y-20,56,40);ctx.globalAlpha=1;}
  if(breach>.1){
   const size=7+Math.floor(breach*.07);
   box(ctx,'#a2acac',x-size-3,y-size+1,size*2+5,size*2-1);box(ctx,'#536d7f',x-size+1,y-size-3,size*2-1,size*2+5);
   box(ctx,'#030916',x-size,y-size,size*2,size*2);box(ctx,'#102131',x-size+3,y-size+2,4,3);
   box(ctx,'#d3e1e0',x+size-5,y-size+3,2,2);box(ctx,'#91b3c5',x-size+4,y+size-5,1,1);
   for(let i=0;i<4;i++){const offset=(motion?time*14:8)+i*13,travel=offset%42,side=i%2?-1:1;ctx.globalAlpha=.25+.3*(travel/42);box(ctx,'#b3dce1',x+side*(48-travel),y+(i-1.5)*5,5,1);}
   ctx.globalAlpha=1;
  }
 }
 ctx.restore();
}

/** Pixel flames, smoke and sparks, above the physical actors; no blurred overlay. */
export function drawInteriorDamageAir(ctx,surface,damage,{time=0,motion=true,hits=[],view=null}={}){
 if(surface.kind!=='ship'||!damage)return;
 ctx.save();
 for(const section of damage.sections||[]){
  if(!nearby(section,view))continue;
  const x=section.x,y=section.y,fire=clamp(section.fire,0,100);
  if(fire>.1){
   const phase=motion?Math.floor(time*6+section.x)%4:1,count=fire>45?3:2;
   for(let i=0;i<count;i++){
    const xx=x+(i-(count-1)/2)*9,tip=10+(phase+i*3)%8+fire*.08;
    box(ctx,'#a54d3a',xx-6,y-6,13,8);box(ctx,'#db733c',xx-5,y-tip,10,tip+3);box(ctx,'#efb35b',xx-3,y-tip+5,6,tip-4);box(ctx,'#ffe4a0',xx-1,y-6,3,8);
   }
   for(let i=0;i<3;i++){const age=((motion?time*.55:0)+i*.33)%1;ctx.globalAlpha=.16*(1-age);const size=9+age*13;box(ctx,'#a0a19a',x-6+Math.sin(i*4)*9+age*7,y-20-age*35,size,size);}
   ctx.globalAlpha=1;
  }
 }
 for(const hit of hits){
  if(!nearby(hit,view)||hit.shieldOnly)continue;
  const age=clamp(hit.age,0,.65),fade=Math.max(0,1-age/.55),radius=motion?age*55:6;
  ctx.globalAlpha=fade*.85;
  for(let i=0;i<7;i++){const angle=i*.897+hit.serial;box(ctx,i%3?'#dfaf70':'#f5e4b3',hit.x+Math.cos(angle)*radius,hit.y+Math.sin(angle)*radius,2,2);}
  ctx.globalAlpha=1;
 }
 if((damage.sections||[]).some(s=>s.fire>.1||s.breach>.1)){
  const glow=motion?.6+.12*Math.sin(time*2):.6;ctx.globalAlpha=glow;
  for(const room of surface.rooms||[]){box(ctx,'#da8d58',(room.x+1)*24,(room.y+1)*24,8,2);box(ctx,'#da8d58',(room.x+room.w-2)*24,(room.y+room.h-1)*24,8,2);}
 }
 ctx.restore();
}
