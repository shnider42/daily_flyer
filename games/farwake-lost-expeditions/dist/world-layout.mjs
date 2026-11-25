/** Shared physical layout. Metres, with north toward negative Z. */
export const PLAYER_RADIUS = 0.24;
export const ROOMS = Object.freeze({
  approach: { minX:-7, maxX:7, minZ:6, maxZ:21, spawn:[0,14], yaw:0, label:'STATION ENTRANCE', outdoor:true },
  airlock: { minX:-2.6, maxX:2.6, minZ:1, maxZ:6, spawn:[0,3.6], yaw:0, label:'AIRLOCK' },
  junction: { minX:-3.5, maxX:3.5, minZ:-7, maxZ:1, spawn:[0,-2.5], yaw:0, label:'SERVICE JUNCTION' },
  survey: { minX:-11.5, maxX:-3.5, minZ:-6, maxZ:0, spawn:[-7,-3], yaw:Math.PI/2, label:'SURVEY ROOM' },
  service: { minX:3.5, maxX:11.5, minZ:-6, maxZ:0, spawn:[7,-3], yaw:-Math.PI/2, label:'SERVICE BAY' },
  shaft: { minX:-3.5, maxX:3.5, minZ:-17, maxZ:-7, spawn:[0,-11.2], yaw:0, label:'LISTENING SHAFT' },
  lower: { minX:-3.5, maxX:3.5, minZ:-25, maxZ:-17, spawn:[0,-20.3], yaw:0, label:'LOWER LANDING' },
  beacon: { minX:-13, maxX:-7, minZ:11, maxZ:17, spawn:[-9.6,14], yaw:Math.PI/2, label:'SURFACE BEACON', outdoor:true }
});

export const PORTALS = Object.freeze([
  { a:'approach', b:'airlock', axis:'z', at:6, center:0, width:2.4 },
  { a:'airlock', b:'junction', axis:'z', at:1, center:0, width:2.4 },
  { a:'junction', b:'survey', axis:'x', at:-3.5, center:-3, width:2.5 },
  { a:'junction', b:'service', axis:'x', at:3.5, center:-3, width:2.5 },
  { a:'junction', b:'shaft', axis:'z', at:-7, center:0, width:2.4 },
  { a:'shaft', b:'lower', axis:'z', at:-17, center:0, width:2.4 },
  { a:'approach', b:'beacon', axis:'x', at:-7, center:14, width:3.2 }
]);

/** Only props tall enough to obstruct walking; wall-mounted evidence stays clear. */
export const OBSTACLES = Object.freeze([
  { scene:'approach', minX:1.7,maxX:2.7,minZ:7.7,maxZ:8.5 },
  { scene:'survey', minX:-10.8,maxX:-9.5,minZ:-4.9,maxZ:-1.0 },
  { scene:'service', minX:9.7,maxX:10.8,minZ:-5.1,maxZ:-.9 },
  { scene:'shaft', minX:-.45,maxX:.15,minZ:-13.15,maxZ:-12.65 },
  { scene:'shaft', minX:-2.9,maxX:-1.7,minZ:-14.9,maxZ:-12.8 },
  { scene:'shaft', minX:1.8,maxX:2.8,minZ:-14.8,maxZ:-13.5 },
  { scene:'lower', minX:-1.3,maxX:1.3,minZ:-24.1,maxZ:-22.9 },
  { scene:'beacon', minX:-12.4,maxX:-11.2,minZ:12.7,maxZ:15.3 }
]);

/** Decorative terrain must not enter any playable space, including underground rooms. */
export function placeTerrainRock(angle,distance,radius) {
  const margin=radius+1.5;
  let x=Math.cos(angle)*distance,z=Math.sin(angle)*distance;
  const overlaps=()=>Object.values(ROOMS).some(r=>x>r.minX-margin&&x<r.maxX+margin&&z>r.minZ-margin&&z<r.maxZ+margin);
  while(overlaps()){distance+=2;x=Math.cos(angle)*distance;z=Math.sin(angle)*distance;}
  return {x,z};
}

export function portalBetween(from,to) {
  return PORTALS.find(p=>(p.a===from&&p.b===to)||(p.a===to&&p.b===from))||null;
}

export function canTraverse(from,to,state) {
  if(!portalBetween(from,to))return false;
  if(from==='junction'&&to==='shaft')return Boolean(state.flags?.inspectionPowered);
  if(from==='shaft'&&to==='lower')return Boolean(state.receiverMode);
  return true;
}

export function sceneAt(x,z,preferred=null) {
  const contains=r=>x>=r.minX-1e-7&&x<=r.maxX+1e-7&&z>=r.minZ-1e-7&&z<=r.maxZ+1e-7;
  if(preferred&&ROOMS[preferred]&&contains(ROOMS[preferred]))return preferred;
  return Object.keys(ROOMS).find(id=>contains(ROOMS[id]))||null;
}

export function pointWalkable(x,z,scene,state,radius=PLAYER_RADIUS) {
  const r=ROOMS[scene];if(!r)return false;
  if(x<r.minX-1e-6||x>r.maxX+1e-6||z<r.minZ-1e-6||z>r.maxZ+1e-6)return false;
  let inside=x>=r.minX+radius&&x<=r.maxX-radius&&z>=r.minZ+radius&&z<=r.maxZ-radius;
  if(!inside){
    inside=PORTALS.some(p=>{
      const other=p.a===scene?p.b:p.b===scene?p.a:null;
      if(!other||!canTraverse(scene,other,state))return false;
      const along=p.axis==='x'?z:x,across=p.axis==='x'?x:z;
      return Math.abs(across-p.at)<=radius+1e-7&&Math.abs(along-p.center)<=p.width/2-radius;
    });
  }
  if(!inside)return false;
  return !OBSTACLES.some(o=>o.scene===scene&&x>o.minX-radius&&x<o.maxX+radius&&z>o.minZ-radius&&z<o.maxZ+radius);
}

function candidate(x,z,previous,state) {
  const next=sceneAt(x,z,previous);
  if(!next||!pointWalkable(x,z,next,state))return null;
  if(next!==previous&&!canTraverse(previous,next,state))return null;
  return next;
}

/** Substepping and axis sliding prevent tunnelling through walls at low frame rates. */
export function movePlayer(position,delta,scene,state) {
  let {x,z}=position,current=scene;
  const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/.10));
  for(let i=0;i<steps;i++){
    const nx=x+delta.x/steps,nz=z+delta.z/steps;
    let next=candidate(nx,nz,current,state);
    if(next){x=nx;z=nz;current=next;continue;}
    next=candidate(nx,z,current,state);if(next){x=nx;current=next;}
    next=candidate(x,nz,current,state);if(next){z=nz;current=next;}
  }
  return {x,z,scene:current,blocked:Math.hypot(x-position.x,z-position.z)<Math.hypot(delta.x,delta.z)*.25};
}

const gridSize=.4;
const cellKey=(x,z)=>`${x},${z}`;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Small A* navigation grid, restricted to this room and the chosen adjacent room. */
export function findWalkPath(start,target,scene,state) {
  const destination=sceneAt(target.x,target.z,scene);
  if(!destination||destination!==scene&&!canTraverse(scene,destination,state))return null;
  const allowed=new Set([scene,destination]);
  const valid=(x,z)=>{const id=sceneAt(x,z);return allowed.has(id)&&pointWalkable(x,z,id,state);};
  const snap=(point,nearStart=false)=>{
    let best=null,bestDistance=Infinity;
    const cx=Math.round(point.x/gridSize),cz=Math.round(point.z/gridSize);
    for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++){
      const ix=cx+ox,iz=cz+oz,x=ix*gridSize,z=iz*gridSize,d=Math.hypot(x-point.x,z-point.z);
      if(d>=bestDistance||!valid(x,z))continue;
      if(nearStart){const moved=movePlayer(start,{x:x-start.x,z:z-start.z},scene,state);if(Math.hypot(moved.x-x,moved.z-z)>.05)continue;}
      best={ix,iz,x,z};bestDistance=d;
    }
    return bestDistance<=.9?best:null;
  };
  const first=snap(start,true),last=snap(target);if(!first||!last)return null;
  const key=cellKey(first.ix,first.iz),endKey=cellKey(last.ix,last.iz);
  const nodes=new Map([[key,{...first,g:0,f:distance(first,last),parent:null}]]),open=new Set([key]);
  let found=null,iterations=0;
  while(open.size&&iterations++<8000){
    let selected=null,lowest=Infinity;
    for(const k of open){const n=nodes.get(k);if(n.f<lowest){lowest=n.f;selected=k;}}
    const n=nodes.get(selected);open.delete(selected);
    if(selected===endKey){found=n;break;}
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const ix=n.ix+dx,iz=n.iz+dz,x=ix*gridSize,z=iz*gridSize,nk=cellKey(ix,iz);
      if(!valid(x,z))continue;
      const currentScene=sceneAt(n.x,n.z),m=movePlayer(n,{x:x-n.x,z:z-n.z},currentScene,state);
      if(Math.hypot(m.x-x,m.z-z)>.02)continue;
      const g=n.g+gridSize,old=nodes.get(nk);
      if(old&&old.g<=g)continue;
      nodes.set(nk,{ix,iz,x,z,g,f:g+Math.abs(x-last.x)+Math.abs(z-last.z),parent:selected});open.add(nk);
    }
  }
  if(!found)return null;
  const path=[];
  for(let n=found;n;n=n.parent?nodes.get(n.parent):null)path.unshift({x:n.x,z:n.z});
  // Keep corners, discard the many collinear grid samples.
  const compact=[];
  for(let i=0;i<path.length;i++){
    const a=path[i-1],b=path[i],c=path[i+1];
    if(a&&c&&Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))<1e-6)continue;
    compact.push(b);
  }
  if(pointWalkable(target.x,target.z,destination,state)){
    const end=compact.at(-1),m=movePlayer(end,{x:target.x-end.x,z:target.z-end.z},destination,state);
    if(Math.hypot(m.x-target.x,m.z-target.z)<.02)compact.push({x:target.x,z:target.z});
  }
  return compact;
}
