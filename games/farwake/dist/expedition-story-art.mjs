/** Small, cached pixel silhouettes for the expedition catalogue. */
import {pixelRect as pixel,pixelLine,pixelRing} from './pixel-art.mjs';

const PROP_KINDS=new Set(['story-trail-marker','story-gate','story-sandbags','story-wreckage','story-tent','story-mushroom','story-nest','story-dish','coral']);
export const EXPEDITION_WILDLIFE=Object.freeze(['reedstalker','mire-spitter','shardling','sporeback','glassmaw','ember-mite','prism-sentinel','sentry-drone']);
const wildlife=new Set(EXPEDITION_WILDLIFE),propCache=new Map(),creatureCache=new Map();
export function expeditionFactionColor(factionId){return({freewake:'#9ac8a7',meridian:'#a6b9e0',cinder:'#d5a17a',concord:'#c7c8b4',lantern:'#cdb3dc'}[factionId]||'#9dbbb5');}
function paintCached(ctx,cache,key,width,height,anchorX,anchorY,x,y,paint){
 let sprite=cache.get(key);
 if(!sprite){
  const owner=ctx.canvas?.ownerDocument||(typeof document==='undefined'?null:document),canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):owner?.createElement('canvas');
  if(canvas){canvas.width=width;canvas.height=height;const target=canvas.getContext('2d');target.imageSmoothingEnabled=false;target.translate(anchorX,anchorY);paint(target);sprite=canvas;if(cache.size>=192)cache.delete(cache.keys().next().value);cache.set(key,sprite);}
 }
 if(sprite)ctx.drawImage(sprite,Math.round(x-anchorX),Math.round(y-anchorY));
 else{ctx.save();ctx.translate(Math.round(x),Math.round(y));paint(ctx);ctx.restore();}
}

function propPixels(ctx,kind,w,h,c){
 if(kind==='story-trail-marker'){
  pixel(ctx,'#253e40',w*.28,h*.18,5,h*.81);pixel(ctx,'#8ca496',w*.28,h*.18,2,h*.78);
  pixel(ctx,'#304c4c',w*.14,h*.18,w*.71,13);pixel(ctx,c,w*.15,h*.18+2,w*.67,3);
  pixelLine(ctx,w*.65,h*.18+5,w*.74,h*.18+9,'#dce0b4',2);pixelLine(ctx,w*.74,h*.18+9,w*.65,h*.18+12,'#dce0b4',2);
  pixel(ctx,'#55745e',w*.42,h*.63,w*.4,11);pixel(ctx,'#bdd0ab',w*.45,h*.63+2,w*.31,2);
  pixel(ctx,'#b8c4a4',w*.28-2,h*.12,10,5);pixel(ctx,'#1c3637',w*.2,h-2,w*.3,4);
 }else if(kind==='story-gate'){
  pixel(ctx,'#1b3038',0,h-4,w,8);pixel(ctx,'#667d80',3,8,17,h-10);pixel(ctx,c,5,8,11,h-12);pixel(ctx,'#667d80',w-20,8,17,h-10);pixel(ctx,c,w-16,8,11,h-12);
  pixel(ctx,'#263e45',0,4,w,14);pixel(ctx,'#a5bab0',4,4,w-8,4);pixel(ctx,'#d0cc9e',8,13,9,3);pixel(ctx,'#d0cc9e',w-17,13,9,3);
  for(let yy=24;yy<h-4;yy+=12){pixel(ctx,'#d2b583',6,yy,9,3);pixel(ctx,'#d2b583',w-15,yy,9,3);}pixel(ctx,'#789494',20,h-5,w-40,4);
 }else if(kind==='story-sandbags'){
  pixel(ctx,'#303934',0,5,w,h-3);
  for(let yy=3;yy<h-3;yy+=9)for(let xx=(Math.floor(yy/9)%2)*9;xx<w-4;xx+=18){const ww=Math.min(17,w-xx);pixel(ctx,'#5d6354',xx,yy+2,ww,9);pixel(ctx,c,xx+1,yy,Math.max(2,ww-2),7);pixel(ctx,'#b8b493',xx+3,yy+1,Math.max(2,ww-6),2);}
 }else if(kind==='story-wreckage'){
  pixel(ctx,'#24363b',-4,h*.4,w+8,h*.57);pixel(ctx,'#42565d',0,h*.22,w,h*.7);pixel(ctx,c,5,h*.12,w-10,h*.69);pixel(ctx,'#bec8b7',9,h*.12,w-18,4);
  pixel(ctx,'#41575f',w*.18,h*.16,w*.54,h*.17);pixel(ctx,'#24404c',w*.23,h*.19,w*.42,h*.1);pixel(ctx,'#89b2b6',w*.25,h*.19,w*.35,2);
  pixel(ctx,'#53686b',2,h*.58,w-4,h*.23);for(let xx=13;xx<w-9;xx+=22){pixel(ctx,'#304d54',xx,h*.43,8,h*.44);pixel(ctx,'#bcc2a8',xx,h*.43,2,h*.41);}
  pixel(ctx,'#172f39',w*.65,h*.58,w*.27,h*.27);pixel(ctx,'#bba77b',w*.07,h*.79,w*.25,3);
  pixelLine(ctx,w*.72,h*.05,w*.64,h*.39,'#263b43',4);pixelLine(ctx,w*.64,h*.39,w*.81,h*.56,'#263b43',4);pixel(ctx,'#758a85',w*.81,h*.59,11,5);
 }else if(kind==='story-tent'){
  pixel(ctx,'#293c37',-3,h-4,w+6,9);pixel(ctx,'#596b61',3,h*.31,w-6,h*.67);pixel(ctx,c,6,h*.25,w-12,h*.67);
  for(let i=0;i<5;i++){const inset=i*w*.085;pixel(ctx,i%2?c:'#bcc1a5',inset,h*.3-i*h*.065,w-inset*2,h*.07+2);}
  pixel(ctx,'#76877b',w*.48,0,3,h*.92);pixel(ctx,'#3c574e',w*.35,h*.54,w*.3,h*.42);pixel(ctx,'#b8c3ab',w*.34,h*.51,w*.32,3);
  pixelLine(ctx,3,h*.32,-5,h-1,'#c6bf96');pixelLine(ctx,w-3,h*.32,w+5,h-1,'#c6bf96');
  pixel(ctx,'#708b80',w*.73,h*.38,16,11);pixel(ctx,'#cee0c4',w*.73+6,h*.38+1,3,9);pixel(ctx,'#cee0c4',w*.73+3,h*.38+4,9,3);
 }else if(kind==='story-mushroom'){
  pixel(ctx,'#233c3a',0,h*.69,w,h*.32);
  for(let xx=5;xx<w;xx+=31){const hh=Math.min(h+12,29+(xx%3)*7),yy=h-hh;pixel(ctx,'#6b8881',xx+8,yy+14,7,hh-12);pixel(ctx,'#b8c1a0',xx+10,yy+14,2,hh-13);pixel(ctx,'#48686c',xx-3,yy+6,30,11);pixel(ctx,c,xx,yy,25,13);pixel(ctx,'#c7d5b4',xx+4,yy-3,17,5);pixel(ctx,'#d7d7b7',xx+5,yy+3,4,3);pixel(ctx,'#728a9b',xx+17,yy+6,4,3);}
 }else if(kind==='story-nest'){
  for(const[rx,ry,col]of[[w*.5,h*.38,'#4d5741'],[w*.43,h*.32,'#8a8c63'],[w*.37,h*.25,'#b0ab78']])pixelRing(ctx,w*.5,h*.57,rx,ry,col,{width:3});
  for(const[xx,yy]of[[.31,.43],[.52,.32],[.7,.49],[.46,.66]]){pixel(ctx,'#687d6b',w*xx-7,h*yy-3,15,15);pixel(ctx,c,w*xx-6,h*yy-7,12,18);pixel(ctx,'#d7dfbd',w*xx-4,h*yy-9,7,5);pixel(ctx,'#859b8e',w*xx-3,h*yy-1,3,3);}
 }else if(kind==='story-dish'){
  pixel(ctx,'#2e464b',w*.2,h*.86,w*.6,h*.16);pixel(ctx,'#6d8b8b',w*.42,h*.23,w*.16,h*.69);pixel(ctx,'#bdd1c2',w*.45,h*.34,3,h*.49);
  for(let i=0;i<6;i++){const yy=h*.1+i*h*.06,inset=(5-i)*(w*.055);pixel(ctx,i===0?'#e1dfc2':i<3?c:'#6c9395',inset,yy,w-inset*2,h*.065+1);}
  pixelLine(ctx,w*.5,h*.47,w*.8,-h*.06,'#d2d9bd',3);pixel(ctx,'#82d4c6',w*.79,-h*.08,5,5);pixel(ctx,'#2d4d57',w*.42,h*.46,w*.17,h*.1);
 }else if(kind==='coral'){
  for(const[xx,yy]of[[.2,.2],[.45,0],[.7,.15]]){pixel(ctx,'#416b67',w*xx,h*yy,5,h*(1-yy));pixel(ctx,c,w*xx-7,h*yy-6,19,9);pixel(ctx,'#c2d0b3',w*xx-4,h*yy-8,12,4);}
 }
}

/** Returns false for established props so their rendering remains untouched. */
export function drawExpeditionProp(ctx,d){
 if(!PROP_KINDS.has(d.kind))return false;
 const w=Math.max(12,Math.round(d.w)),h=Math.max(12,Math.round(d.h)),c=d.color||'#a4b8a8',key=`${d.kind}:${w}:${h}:${c}`;
 paintCached(ctx,propCache,key,w+32,h+56,16,32,d.x,d.y,target=>propPixels(target,d.kind,w,h,c));return true;
}

function creaturePixels(ctx,species,front,step,hurt,dead,windup,color){
 const c=hurt?'#edd0b5':color||({reedstalker:'#9aac83','mire-spitter':'#93b899',shardling:'#a0c8d2',sporeback:'#c2a6bb',glassmaw:'#bccdb3','ember-mite':'#d99c72','prism-sentinel':'#b0b6e0','sentry-drone':'#8faeb9'}[species]);
 pixel(ctx,'#0d2429',species==='ember-mite'?-14:-24,-2,species==='ember-mite'?28:48,6);
 if(dead){
  if(species==='sentry-drone'){pixel(ctx,'#4b6570',-22,-8,43,8);pixel(ctx,'#8a9e98',-11,-12,20,9);pixelLine(ctx,-22,-11,22,-4,'#a8b6a7',2);}
  else if(species==='prism-sentinel'||species==='shardling'){for(const[x,y,w]of[[-18,-6,9],[-6,-11,13],[10,-7,11]]){pixel(ctx,c,x,y,w,8);pixel(ctx,'#697b95',x+2,y+4,w,3);}}
  else{pixel(ctx,'#4d6055',-21,-7,39,8);pixel(ctx,c,-15,-11,species==='ember-mite'?20:32,8);if(species==='sporeback')pixel(ctx,'#857c98',-20,-14,40,8);if(species==='reedstalker')pixelLine(ctx,-18,-6,-29,-14,c,3);if(species==='glassmaw')pixel(ctx,'#e1d7b4',14,-11,9,5);}
  return;
 }
 if(species==='reedstalker'){
  for(const s of[-1,1]){pixelLine(ctx,s*8,-16,s*14,-7+step*s,'#55765e',4);pixelLine(ctx,s*14,-7+step*s,s*16,2+step*s,c,3);pixelLine(ctx,s*16,2+step*s,s*22,2+step*s,'#d4d3aa',2);}
  pixelLine(ctx,-front*12,-21,-front*28,-31,c,4);pixelLine(ctx,-front*26,-30,-front*33,-29,'#718d72',3);
  pixel(ctx,'#577d73',-14,-29,29,14);pixel(ctx,c,-12,-31,22,11);pixel(ctx,'#c7d3a4',-7,-32,11,3);
  pixel(ctx,'#668c79',front*9-4,-36,8,17);pixel(ctx,c,front*14-6,-40,13,10);pixel(ctx,'#bdcba7',front*18-3,-44,4,9);
  pixel(ctx,'#eff0bc',front*16,-37,3,2);pixelLine(ctx,front*20,-33,front*28,-32,'#d4d3aa',3);
 }else if(species==='mire-spitter'){
  for(const[x,s]of[[-15,-1],[-3,1],[11,-1]]){pixelLine(ctx,x,-7,x-4,2+step*s,'#608474',4);pixel(ctx,'#b7c4a0',x-8,2+step*s,8,2);}
  pixel(ctx,'#497b73',-22,-17,40,17);pixel(ctx,c,-19,-24,34,17);pixel(ctx,'#bed0aa',-14,-27,21,5);
  for(const x of[-14,-5,5]){pixel(ctx,'#c1d5a8',x,-20,8,8);pixel(ctx,'#6d967d',x+2,-18,4,4);}
  pixel(ctx,'#689c86',front*14-6,-21,13,13);pixel(ctx,c,front*22-7,-23,14,8);pixel(ctx,windup?'#e5d091':'#305f63',front*27-4,-23,7,9);pixel(ctx,'#dbdfac',front*16-1,-24,3,2);
 }else if(species==='shardling'){
  for(const s of[-1,1])for(const yy of[-14,-5]){pixelLine(ctx,s*9,yy,s*23,yy+7+step*s,'#6e99ae',3);pixelLine(ctx,s*23,yy+7+step*s,s*28,yy+4+step*s,c,2);}
  pixel(ctx,'#4c7189',-12,-22,24,19);pixel(ctx,c,-10,-27,20,17);
  for(const[x,top]of[[-8,-31],[0,-40],[9,-29]]){pixel(ctx,'#7499b6',x-4,top+7,8,-10-top);pixel(ctx,c,x-2,top,4,-12-top);pixel(ctx,'#e1e7db',x-1,top,1,-17-top);}
  pixel(ctx,'#344f68',-8,-11,17,5);pixel(ctx,'#eddfb4',front*5,-11,4,2);
 }else if(species==='sporeback'){
  for(const s of[-1,1])for(const y of[-10,-3])pixelLine(ctx,s*11,y-5,s*22,y+4+step*s,'#7c9c8c',4);
  pixel(ctx,'#7b9590',-12,-24,24,22);pixel(ctx,'#d1d5b4',-8,-23,4,20);pixel(ctx,'#78968f',-24,-28,48,10);pixel(ctx,c,-20,-35,40,13);pixel(ctx,'#ddc6cb',-12,-40,24,7);
  for(const[x,y]of[[-14,-32],[-3,-36],[10,-30]]){pixel(ctx,'#e4dec0',x,y,6,4);pixel(ctx,'#97829e',x+2,y+1,2,2);}
  pixel(ctx,'#6c8d7e',front*12-5,-13,10,10);pixel(ctx,'#dfdeb0',front*15,-12,3,2);
 }else if(species==='glassmaw'){
  for(let i=0;i<5;i++){const xx=-front*(8+i*5),yy=-7-i%2*3;pixel(ctx,'#698e82',xx-5,yy-6,10,11);pixel(ctx,c,xx-4,yy-8,8,5);pixelLine(ctx,xx,yy+2,xx-front*4,yy+6+step,'#b6c2a1',2);}
  pixel(ctx,'#62877d',-9,-24,27,20);pixel(ctx,c,-7,-29,23,13);pixel(ctx,'#e1dfbd',front*16-4,-25,12,5);pixel(ctx,'#233f48',front*15-6,-19,13,9);
  pixelLine(ctx,front*16,-23,front*28,-32,'#d7e2ca',4);pixelLine(ctx,front*17,-12,front*28,-5,'#d7e2ca',4);pixel(ctx,'#c9b5d5',front*9,-27,3,2);
 }else if(species==='ember-mite'){
  for(const s of[-1,1])for(const y of[-15,-8,-2])pixelLine(ctx,s*6,y,s*17,y+5+step*s,'#c99b73',2);
  pixel(ctx,'#795d62',-8,-22,17,21);pixel(ctx,c,-7,-20,15,16);pixel(ctx,'#e9b784',-4,-25,9,7);pixel(ctx,'#713e49',-5,-14,11,4);pixel(ctx,'#ffcd7f',-3,-12,6,6);
  pixelLine(ctx,-3,-23,-10,-31,'#dfa575',2);pixelLine(ctx,4,-23,11,-31,'#dfa575',2);pixel(ctx,'#ffe3a5',-5,-22,2,2);pixel(ctx,'#ffe3a5',4,-22,2,2);
 }else if(species==='prism-sentinel'){
  const bob=step;pixelRing(ctx,0,-1,16,5,'#7c93b0',{dashed:true});
  for(const[yy,half,col]of[[-45,2,'#dfe1d2'],[-41,6,c],[-35,12,'#a0a9d3'],[-27,17,'#7d91b8'],[-18,11,'#8db5ba'],[-10,5,'#d3e1c6']])pixel(ctx,hurt?'#edd0b5':col,-half,yy+bob,half*2,8);
  pixel(ctx,'#314c73',-7,-30+bob,14,14);pixel(ctx,windup?'#f6cc8c':'#bbf0dc',-3,-27+bob,6,8);pixelLine(ctx,0,-43+bob,0,-9+bob,'#d9e9d2');
  for(const s of[-1,1]){pixel(ctx,'#8a9ac4',s*23-3,-27-bob,6,12);pixel(ctx,'#c7dfca',s*23-1,-25-bob,2,5);}
 }else if(species==='sentry-drone'){
  const bob=step;pixelLine(ctx,-24,-25+bob,24,-25+bob,'#4b6c7a',5);
  for(const s of[-1,1]){pixel(ctx,'#38566a',s*21-9,-31+bob,18,12);pixel(ctx,c,s*21-9,-31+bob,18,3);pixel(ctx,'#132f40',s*21-5,-26+bob,10,4);pixel(ctx,'#a9cbbd',s*21-11,-26+bob,22,1);}
  pixel(ctx,'#506f7f',-12,-35+bob,24,19);pixel(ctx,c,-10,-37+bob,20,12);pixel(ctx,'#bcd0bd',-7,-37+bob,14,3);pixel(ctx,'#223f53',-7,-24+bob,14,10);
  pixel(ctx,windup?'#edbb83':'#a4dbd5',front*4-2,-22+bob,5,4);pixel(ctx,'#b5c6b9',front*11-2,-16+bob,5,10);pixel(ctx,'#688da0',front*11-3,-6+bob,7,3);
 }
}

/** False preserves the original Stoneback, Skitter and Bellwether artwork. */
export function drawExpeditionWildlife(ctx,actor,time=0){
 const species=actor.species;if(!wildlife.has(species))return false;
 const front=actor.facing==='left'?-1:1,moving=actor.reduceMotion!==true&&(actor.moving||Math.hypot(actor.vx||0,actor.vy||0)>2),step=moving?(Math.sin(time*12)>0?1:-1):0,hurt=(actor.hitUntil||actor.hurtUntil||0)>time,dead=actor.health<=0,windup=actor.windup>0||actor.phase==='windup',color=actor.color||'';
 const key=`${species}:${front}:${step}:${Number(hurt)}:${Number(dead)}:${Number(windup)}:${color}`;
 paintCached(ctx,creatureCache,key,96,80,48,64,actor.x,actor.y,target=>creaturePixels(target,species,front,step,hurt,dead,windup,color));
 if(windup&&!dead){pixelRing(ctx,actor.x,actor.y,species==='ember-mite'?19:30,10,'#e0b17f',{dashed:true,phase:Math.floor(time*8)});pixel(ctx,'#f5d49b',actor.x-2,actor.y-52,4,6);pixel(ctx,'#f5d49b',actor.x-1,actor.y-44,2,2);}
 return true;
}

/** Faction opponents remain identifiable without labelling them all enemies. */
export function drawExpeditionFactionKit(ctx,actor){
 if(!actor.expeditionActor||!actor.factionId||actor.health<=0)return;
 const x=Math.round(actor.x),y=Math.round(actor.y),c=expeditionFactionColor(actor.factionId);
 pixel(ctx,c,x-8,y-16,4,4);pixel(ctx,'#d4d9bd',x-7,y-15,2,1);
 if(actor.combatProfile==='faction-support'){pixel(ctx,'#3f5960',x+6,y-19,6,13);pixel(ctx,c,x+7,y-18,4,3);pixel(ctx,'#afbaa6',x+7,y-8,4,2);}
}
