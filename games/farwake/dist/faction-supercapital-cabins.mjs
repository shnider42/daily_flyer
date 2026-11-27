/** Bounded, connected working decks for the five original supercapital hulls. */
import {FACTION_SUPERCAPITAL_HULLS,SUPERCAPITAL_OUTLINES} from './faction-supercapital-content.mjs';

const inside=(x,y,points)=>{let found=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)found=!found;}return found;};
const colors={bridge:'#9bb6c6',navigation:'#a4b6c9',security:'#c6a18e',engineering:'#c3aa83',medical:'#9cbdac',common:'#b8bf9a',archive:'#b5adc8',hangar:'#a4b6b0',brig:'#aaa6b2',cargo:'#bda98a',quarters:'#abaec6'};
const sizes={bastion:132,commonwealth:140,dominion:128,palimpsest:116,crucible:144};
const plans={
 bastion:'An armored command spine links a forward plot and recovery hangar to paired battery control rooms, a hospital, a secured holding deck, four twelve-berth quarters and the broad aft reactor citadel.',
 commonwealth:'A continuous service avenue joins the assembly hall, hospital and recovery hangar. Four twelve-berth quarters occupy the inhabited shoulders; a secured holding deck and repair departments open off the same route.',
 dominion:'Staggered cargo bastions and convoy offices connect to a protected flight spine. Four twelve-berth quarters share the aft citadel with engineering; a secured holding deck sits near convoy security.',
 palimpsest:'Two archive drums connect along an instrument passage. Four twelve-berth quarters, research rooms, a hospital and a secured holding deck remain reachable from the central recovery hangar.',
 crucible:'Long tractor and cutter arms meet behind an open recovery cradle. The inhabited stern contains four twelve-berth quarters, a forge, a hospital and a secured holding deck linked to recovery control.'
};
function sums(mask,cols,rows){const width=cols+1,out=new Int32Array(width*(rows+1));for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)out[(y+1)*width+x+1]=mask[y*cols+x]+out[y*width+x+1]+out[(y+1)*width+x]-out[y*width+x];return out;}
const total=(table,cols,x,y,w,h)=>{const stride=cols+1;return table[(y+h)*stride+x+w]-table[y*stride+x+w]-table[(y+h)*stride+x]+table[y*stride+x];};

function definition(hull){
 const cols=sizes[hull.id],rows=Math.round(cols*hull.stats.renderLength/hull.stats.renderWidth),points=SUPERCAPITAL_OUTLINES[hull.id];
 const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
 const outline=points.map(([x,y])=>({x:2+(y-minY)/(maxY-minY)*(cols-4),y:2+(maxX-x)/(maxX-minX)*(rows-4)}));
 const mask=Array.from({length:cols*rows},(_,i)=>Number(inside(i%cols+.5,Math.floor(i/cols)+.5,outline)));
 const safe=mask.map((value,i)=>value&&[-cols-1,-cols,-cols+1,-1,1,cols-1,cols,cols+1].every(offset=>mask[i+offset])?1:0),safeSums=sums(safe,cols,rows),occupied=new Uint8Array(mask.length),rooms=[];
 const center=room=>[room.x+Math.floor(room.w/2),room.y+Math.floor(room.h/2)];
 function place(id,name,u,v,w,h,color){
  const blocked=sums(occupied,cols,rows),desiredX=u*cols-w/2,desiredY=v*rows-h/2;let best=null;
  for(let y=3;y<rows-h-3;y++)for(let x=3;x<cols-w-3;x++){
   const score=(x-desiredX)**2+(y-desiredY)**2;if(best&&score>=best.score)continue;
   if(total(safeSums,cols,x,y,w,h)!==w*h||total(blocked,cols,x-1,y-1,w+2,h+2))continue;
   best={x,y,score};
  }
  if(!best)throw new Error(`No connected room position for ${hull.id}:${id}`);
  const room={id,name,x:best.x,y:best.y,w,h,color};rooms.push(room);
  for(let y=room.y;y<room.y+h;y++)for(let x=room.x;x<room.x+w;x++)occupied[y*cols+x]=1;
  return room;
 }
 const fork=hull.id==='crucible',offset=hull.id==='dominion'?.035:hull.id==='palimpsest'?-.025:0;
 const bridge=place('bridge',fork?'RECOVERY COMMAND':'FLAG COMMAND',.5+offset,fork?.59:.18,20,22,colors.bridge);
 const navigation=place('navigation',hull.id==='palimpsest'?'LONG-BASELINE OBSERVATORY':'FLEET CHART ROOM',fork?.24:.5-offset,fork?.29:.34,18,24,colors.navigation);
 const security=place('security','FLEET SECURITY',fork?.76:.5+offset,fork?.29:.49,18,22,colors.security);
 const hangar=place('hangar','RECOVERY HANGAR',.5,fork?.7:.63,24,28,colors.hangar);
 const medical=place('medical','FLEET HOSPITAL',.28,fork?.65:.56,20,26,colors.medical);
 const common=place('common',hull.faction==='freewake'?'ASSEMBLY HALL':'COMMON DECK',.72,fork?.65:.56,20,24,colors.common);
 const archive=place('archive',hull.id==='palimpsest'?'PROTECTED RECORD STACKS':'RECORDS & WATCH OFFICE',fork?.24:.73,fork?.46:.38,18,24,colors.archive);
 const cargo=place('cargo',hull.id==='crucible'?'FORGE STORES':'EXPEDITION STORES',fork?.76:.27,fork?.46:.38,20,26,colors.cargo);
 const brig=place('brig','SECURED HOLDING DECK',.28,.73,18,22,colors.brig);
 const engineering=place('engineering',hull.id==='crucible'?'FOUNDRY REACTOR':'REACTOR CONTROL',.72,.73,18,24,colors.engineering);
 const quarters=[[.24,.85],[.43,.91],[.61,.91],[.8,.85]].map(([u,v],i)=>place(`quarters-${i+1}`,`QUARTERS / ${String(i*12+1).padStart(2,'0')}–${(i+1)*12}`,u,v,24,24,colors.quarters));
 const bunks=quarters.flatMap(room=>[8,14,20].flatMap(y=>[3,8,13,18].map(x=>[room.x+x,room.y+y])));
 const fixtures=[
  {kind:'console',x:bridge.x+3,y:bridge.y+3,w:bridge.w-6,h:2,color:'#789eaf',solid:true},
  {kind:'window',x:bridge.x+3,y:bridge.y+2,w:bridge.w-6,h:1,solid:false},
  {kind:'commandtable',x:navigation.x+3,y:navigation.y+3,w:5,h:4,color:'#8aa9a4',solid:true},
  {kind:'armory',x:security.x+3,y:security.y+3,w:security.w-6,h:2,color:'#a3a5a6',solid:true},
  {kind:'engine',x:engineering.x+3,y:engineering.y+3,w:3,h:engineering.h-6,color:'#658f9c',solid:true},
  {kind:'bed',x:medical.x+3,y:medical.y+3,w:2,h:5,color:'#95c4b2',solid:true},
  {kind:'bed',x:medical.x+7,y:medical.y+3,w:2,h:5,color:'#95c4b2',solid:true},
  {kind:'table',x:common.x+3,y:common.y+3,w:common.w-6,h:2,color:'#b29c7d',solid:true},
  {kind:'books',x:archive.x+3,y:archive.y+3,w:2,h:archive.h-6,color:'#a0a09d',solid:true},
  {kind:'cargo',x:cargo.x+3,y:cargo.y+3,w:5,h:5,color:'#a79c86',solid:true},
  {kind:'equipment',x:hangar.x+3,y:hangar.y+3,w:4,h:5,color:'#8aa2a1',solid:true},
  {kind:'bed',x:brig.x+3,y:brig.y+3,w:1,h:4,color:'#a8a4b5',solid:true}
 ];
 const allSolid=[...fixtures.filter(f=>f.solid),...bunks.flatMap(([x,y])=>[{x,y:y-4,w:1,h:3},{x:x+1,y:y-4,w:1,h:1}])];
 const travel=safe.slice();for(const f of allSolid)for(let y=f.y-1;y<f.y+f.h+1;y++)for(let x=f.x-1;x<f.x+f.w+1;x++)travel[y*cols+x]=0;
 const spawn=center(hangar),start=spawn[1]*cols+spawn[0],parent=new Int32Array(mask.length).fill(-1),queue=[start];parent[start]=start;
 for(let i=0;i<queue.length;i++){const n=queue[i],x=n%cols;for(const next of [n-cols,n+cols,...(x?[n-1]:[]),...(x<cols-1?[n+1]:[])])if(next>=0&&next<travel.length&&travel[next]&&parent[next]===-1){parent[next]=n;queue.push(next);}}
 const passageMask=new Uint8Array(mask.length);
 for(const room of rooms){const p=center(room);let n=p[1]*cols+p[0];if(parent[n]===-1){let score=Infinity;for(let y=room.y+2;y<room.y+room.h-2;y++)for(let x=room.x+2;x<room.x+room.w-2;x++){const candidate=y*cols+x,gap=(x-p[0])**2+(y-p[1])**2;if(parent[candidate]!==-1&&gap<score){n=candidate;score=gap;}}}if(parent[n]===-1)throw new Error(`Disconnected supercapital room ${hull.id}:${room.id}`);while(n!==start){const x=n%cols,y=Math.floor(n/cols);for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if(mask[yy*cols+xx])passageMask[yy*cols+xx]=1;n=parent[n];}}
 const corridors=[];for(let y=0;y<rows;y++){let startX=-1;for(let x=0;x<=cols;x++){const filled=x<cols&&passageMask[y*cols+x];if(filled&&startX<0)startX=x;if(!filled&&startX>=0){corridors.push({x:startX,y,w:x-startX,h:1});startX=-1;}}}
 return {name:hull.name,cols,rows,berths:48,plan:plans[hull.id],rooms,corridors,doors:[],fixtures,bunks,
  stations:{helm:center(bridge),navigation:center(navigation),security:center(security),engineering:center(engineering),medical:center(medical)},
  spawn,archive:center(archive),manifest:[spawn[0]+5,spawn[1]],breaches:[[hangar.x+3,spawn[1]],[hangar.x+hangar.w-4,spawn[1]]],
  combatSpawns:[[spawn[0]-3,spawn[1]+3],[spawn[0]+3,spawn[1]+3],[spawn[0]-3,spawn[1]-3],[spawn[0]+3,spawn[1]-3]],
  crewSpawns:bunks.map(point=>[...point])};
}

export const SUPERCAPITAL_CABIN_DEFINITIONS=Object.fromEntries(FACTION_SUPERCAPITAL_HULLS.map(hull=>[hull.id,definition(hull)]));
