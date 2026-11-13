/** Shared physical descriptions for orbital silhouettes and walkable places. */
import {stationTypeFor,planetTypeFor} from './world-types.mjs';

export const PLACE_GEOMETRY_VERSION=1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),plans=new Map();
const disk=(x,y,cx=0,cy=0,r=1)=>(x-cx)**2+(y-cy)**2<=r*r;
const box=(x,y,cx,cy,w,h)=>Math.abs(x-cx)<=w&&Math.abs(y-cy)<=h;
function polygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function regular(sides,phase=-Math.PI/2,radius=.94){return Array.from({length:sides},(_,i)=>[Math.cos(phase+i*Math.PI*2/sides)*radius,Math.sin(phase+i*Math.PI*2/sides)*radius]);}
const polygons={triangle:regular(3),hexagon:regular(6,0),octagon:regular(8,Math.PI/8),pentagon:regular(5),star:Array.from({length:10},(_,i)=>[Math.cos(-Math.PI/2+i*Math.PI/5)*(i%2?.49:.98),Math.sin(-Math.PI/2+i*Math.PI/5)*(i%2?.49:.98)])};
/** These are inhabited volumes, not decorative overlays on a rectangular map. */
export function stationShapeContains(shape,x,y){
 const ax=Math.abs(x),ay=Math.abs(y),r=Math.hypot(x,y);
 if(polygons[shape])return polygon(x,y,polygons[shape]);
 switch(shape){
  case 'circle':return r<=.94;
  case 'ring':return r<=.94&&r>=.49;
  case 'cross':return box(x,y,0,0,.94,.29)||box(x,y,0,0,.29,.94);
  case 'spindle':return (x/.96)**2+(y/(.30+.55*(1-ax)))**2<=1;
  case 'twin':return box(x,y,0,0,.58,.20)||disk(x,y,-.49,0,.45)||disk(x,y,.49,0,.45);
  case 'wheel':return r<=.94&&(r>=.67||ax<.17||ay<.17||r<.31);
  case 'crescent':return disk(x,y,0,0,.96)&&!disk(x,y,.55,-.05,.78);
  case 'horseshoe':return r<=.95&&(r>=.48)&&(x<.22||ay>.43);
  case 'trident':return box(x,y,0,.64,.86,.25)||box(x,y,0,-.06,.20,.81)||box(x,y,-.66,-.03,.20,.75)||box(x,y,.66,-.03,.20,.75);
  case 'ladder':return box(x,y,-.60,0,.23,.94)||box(x,y,.60,0,.23,.94)||box(x,y,0,-.67,.65,.17)||box(x,y,0,0,.65,.17)||box(x,y,0,.67,.65,.17);
  case 'hammer':return box(x,y,0,-.55,.94,.36)||box(x,y,0,.25,.26,.67);
  case 'diamond':return ax+ay<=1.13;
  case 'clover':return disk(x,y,-.39,-.39,.50)||disk(x,y,.39,-.39,.50)||disk(x,y,-.39,.39,.50)||disk(x,y,.39,.39,.50);
  case 'hub':return r<=.48||box(x,y,0,0,.95,.16)||box(x,y,0,0,.16,.95)||disk(x,y,-.72,0,.23)||disk(x,y,.72,0,.23)||disk(x,y,0,-.72,.23)||disk(x,y,0,.72,.23);
  case 'arc':return r<=.94&&r>=.42&&x<.31;
  case 'fork':return box(x,y,-.57,0,.28,.90)||box(x,y,.19,-.64,.65,.25)||box(x,y,.19,.64,.65,.25);
  case 'spine':return box(x,y,0,0,.16,.96)||[-.65,0,.65].some(cy=>box(x,y,0,cy,.89,.20));
  case 'honeycomb':return [[-.43,-.30],[.43,-.30],[0,.46]].some(([cx,cy])=>{const dx=x-cx,dy=y-cy;return polygon(dx,dy,regular(6,0,.53))&&!disk(dx,dy,0,0,.17);});
  case 'stacked':return box(x,y,0,0,.17,.80)||box(x,y,0,-.68,.72,.23)||box(x,y,0,0,.94,.25)||box(x,y,0,.68,.72,.23);
  default:return ax<=.96&&ay<=.96;
 }
}
function connectedMask(mask,cols,rows){
 const seen=new Set(),groups=[];
 for(let n=0;n<mask.length;n++)if(mask[n]&&!seen.has(n)){
  const q=[n];seen.add(n);
  for(let i=0;i<q.length;i++){const k=q[i],x=k%cols,y=Math.floor(k/cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*cols+xx;if(xx>=0&&yy>=0&&xx<cols&&yy<rows&&mask[j]&&!seen.has(j)){seen.add(j);q.push(j);}}}
  groups.push(q);
 }
 groups.sort((a,b)=>b.length-a.length);const keep=new Set(groups[0]||[]);return mask.map((_,i)=>keep.has(i)?1:0);
}
/** Cached immutable tile masks are consumed by both surface.mjs and space-art.mjs. */
export function stationPlan(body={}){
 const type=stationTypeFor(body),legacy=body.id==='kettle',key=`${type.id}:${type.shape}:${type.scale}:${legacy}`;
 if(plans.has(key))return plans.get(key);
 const aspect={spindle:[52,30],twin:[50,36],ladder:[36,48],hammer:[46,40],trident:[46,44],fork:[44,38],spine:[40,52],stacked:[38,50]}[type.shape]||[38,38];
 const scale=Number.isFinite(type.scale)?type.scale:1,even=n=>Math.round(clamp(n,32,72)/2)*2;
 const cols=legacy?38:even(aspect[0]*scale),rows=legacy?38:even(aspect[1]*scale);
 let walkable=Array.from({length:cols*rows},(_,i)=>{const x=i%cols,y=Math.floor(i/cols);return legacy?(x>=3&&x<=34&&y>=3&&y<=34?1:0):stationShapeContains(type.shape,(x-(cols-1)/2)/((cols-6)/2),(y-(rows-1)/2)/((rows-6)/2))?1:0;});
 walkable=connectedMask(walkable,cols,rows);
 const hull=walkable.map((v,i)=>v||[-1,0,1].some(dy=>[-1,0,1].some(dx=>{const x=i%cols+dx,y=Math.floor(i/cols)+dy;return x>=0&&y>=0&&x<cols&&y<rows&&walkable[y*cols+x];}))?1:0);
 let exit={x:4,y:14},spawn={x:6,y:14},collar={x:2,y:14};
 if(!legacy){
  let best=Infinity;
  for(let y=2;y<rows-2;y++)for(let x=2;x<cols-5;x++)if(walkable[y*cols+x]&&!walkable[y*cols+x-1]&&[1,2,3].every(dx=>walkable[y*cols+x+dx])){const score=Math.abs(y-(rows-1)/2)*4+x;if(score<best){best=score;exit={x,y};spawn={x:x+2,y};collar={x:x-1,y};}}
 }
 const floorTiles=walkable.flatMap((v,i)=>v?[Object.freeze({x:i%cols,y:Math.floor(i/cols)})]:[]);
 const plan=Object.freeze({typeId:type.id,shape:type.shape,cols,rows,tileSize:24,sizeClass:type.sizeClass,geometryVersion:PLACE_GEOMETRY_VERSION,layoutVersion:`place-${PLACE_GEOMETRY_VERSION}:${type.id}:${cols}x${rows}`,walkable:Object.freeze(walkable),hull:Object.freeze(hull),floorTiles:Object.freeze(floorTiles),exit:Object.freeze(exit),spawn:Object.freeze(spawn),collar:Object.freeze(collar)});
 plans.set(key,plan);if(plans.size>80)plans.delete(plans.keys().next().value);return plan;
}

export function planetSurfaceDimensions(body={}){
 const type=planetTypeFor(body),scale=body.id==='morrow'?1:clamp(Number(type.surfaceScale)||1,.7,1.65),cols=Math.round(108*scale),rows=Math.round(80*scale);
 return{cols,rows,scale,sizeClass:type.sizeClass,typeId:type.id,geometryVersion:PLACE_GEOMETRY_VERSION,layoutVersion:`place-${PLACE_GEOMETRY_VERSION}:${type.id}:${cols}x${rows}`};
}

/** One terrain vocabulary shapes both the orbital view and the regional ground. */
export function planetTerrainSample(terrain,x,y,seed=0){
 const o=(seed%997)/97,s=Math.sin,c=Math.cos,base=s(x*17+o)+c(y*13-o)*.6+s(x*31+y*23+o)*.25;
 let value;
 switch(terrain){
  case 'steppe':value=s(x*9+o)*.3+c(y*19+x*3)*.22;break;
  case 'terminator':value=x*2+c(y*11+o)*.28;break;
  case 'continental':value=s(x*6+o)+c(y*5-o)*.9;break;
  case 'rainforest':value=base*.7+s(x*47-y*34)*.35;break;
  case 'spores':value=s(x*33+o)*c(y*29-o)+.32;break;
  case 'wetlands':value=s(x*23+o)*c(y*25+o)*1.4-.2;break;
  case 'dunes':value=s(x*38+y*14+o+Math.sin(y*8))*.9;break;
  case 'saltflats':value=Math.abs(s(x*12+o)*c(y*10-o))*1.5-.7;break;
  case 'mesas':value=Math.round((s(x*18+o)+c(y*15))*1.5)/1.5;break;
  case 'obsidian':value=Math.abs(s(x*27+y*20+o))+.4*c(y*33-x*11)-.6;break;
  case 'lavafields':value=Math.abs(s(x*19+o)+c(y*22-o))-.8;break;
  case 'ashlands':value=base*.3+c((x+y)*55+o)*.3;break;
  case 'icefields':value=s(x*7+o)*.4+c(y*9)*.6;break;
  case 'tundra':value=base*.45+.35*c(y*30+o);break;
  case 'frozen-ocean':value=Math.abs(s(x*22+y*8+o)*c(y*31))*1.8-.8;break;
  case 'islands':value=s(x*26+o)*c(y*23-o)*1.6-.42;break;
  case 'reefs':value=Math.abs(s(x*22+o)+c(y*19))-.9;break;
  case 'stormcoast':value=s(x*10+y*6+o)*.6+c(y*27-x*10)*.45-.35;break;
  case 'factory':value=(Math.sin(x*65)>0?.5:-.5)+(Math.cos(y*55)>0?.5:-.5);break;
  case 'city':value=Math.max(Math.abs(s(x*80)),Math.abs(s(y*80)))*1.4-.5;break;
  case 'ruins':value=base*.45+(Math.sin(x*46)>0?.3:-.3);break;
  case 'craters':value=Math.cos(Math.hypot((x+.3)*14,(y-.2)*14)+o)*.6+Math.sin(Math.hypot((x-.4)*21,(y+.3)*21))*.5;break;
  case 'red-rock':value=s(x*26+o)+c(y*11-x*7)*.4;break;
  case 'crystals':value=Math.abs(s(x*37+o)*c(y*39-o))*2-.7;break;
  default:value=base;
 }
 return clamp((value+1.5)/3,0,1);
}
