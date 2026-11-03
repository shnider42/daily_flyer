// Shared polyline routing for irregular streets. Distances are metres along an edge.
const lengthCache=new WeakMap();
export function edgeLength(edge){if(!lengthCache.has(edge)){let n=0;for(let i=1;i<edge.points.length;i++)n+=Math.hypot(edge.points[i].x-edge.points[i-1].x,edge.points[i].z-edge.points[i-1].z);lengthCache.set(edge,n);}return lengthCache.get(edge);}
export function roadFrame(edge,d,reverse=false,lane=4.4){
 const total=edgeLength(edge);let q=Math.max(0,Math.min(total,reverse?total-d:d)),a=edge.points[0],b=edge.points[1];
 for(let i=1;i<edge.points.length;i++){a=edge.points[i-1];b=edge.points[i];const len=Math.hypot(b.x-a.x,b.z-a.z);if(q<=len||i===edge.points.length-1){const t=Math.min(1,q/(len||1)),sign=reverse?-1:1,ux=(b.x-a.x)/(len||1)*sign,uz=(b.z-a.z)/(len||1)*sign;return{x:a.x+(b.x-a.x)*t-uz*lane,z:a.z+(b.z-a.z)*t+ux*lane,a:Math.atan2(ux,uz),ux,uz};}q-=len;}
}
export function closestRoute(p,roads,lane=0){let best=null;for(const edge of roads){let along=0;for(let i=1;i<edge.points.length;i++){const a=edge.points[i-1],b=edge.points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(len*len))),x=a.x+dx*t,z=a.z+dz*t,distance=Math.hypot(p.x-x,p.z-z);if(!best||distance<best.distance)best={edge,d:along+t*len,x,z,a:Math.atan2(dx,dz),distance};along+=len;}}if(lane&&best){const f=roadFrame(best.edge,best.d,false,lane);return{...best,...f};}return best;}
export function nextRoad(city,edge,reverse,target=null,rnd=()=>.5){
 const node=reverse?edge.from:edge.to,options=city.roads.filter(e=>e!==edge&&(e.from===node||e.to===node));if(!options.length)return{edge,reverse:!reverse};
 if(!target){const chosen=options[Math.floor(rnd()*options.length)%options.length];return{edge:chosen,reverse:chosen.to===node};}
 // Dijkstra from the destination edge's endpoints; bridge is a real graph bottleneck.
 const near=closestRoute(target,city.roads),cost=new Map(Object.keys(city.nodes).map(id=>[id,Infinity]));cost.set(near.edge.from,near.d);cost.set(near.edge.to,edgeLength(near.edge)-near.d);const todo=new Set(Object.keys(city.nodes));
 while(todo.size){let n=null;for(const id of todo)if(n===null||cost.get(id)<cost.get(n))n=id;todo.delete(n);for(const e of city.roads){const other=e.from===n?e.to:e.to===n?e.from:null;if(other&&cost.get(n)+edgeLength(e)<cost.get(other))cost.set(other,cost.get(n)+edgeLength(e));}}
 options.sort((a,b)=>edgeLength(a)+cost.get(a.from===node?a.to:a.from)-(edgeLength(b)+cost.get(b.from===node?b.to:b.from)));const chosen=options[0];return{edge:chosen,reverse:chosen.to===node};
}
export function attachRoute(c,city){const route=closestRoute(c,city.roads);const reverse=Math.cos(c.a-route.a)<0;return c.route={edge:route.edge,reverse,d:reverse?edgeLength(route.edge)-route.d:route.d};}
export function advanceRoute(c,city,travel,target=null,rnd=()=>.5){
 const r=c.route||attachRoute(c,city);if(r.turn){const q=r.turn;q.u=Math.min(1,q.u+travel/q.length);const u=q.u,v=1-u;const p={};for(const k of['x','z'])p[k]=v*v*v*q.start[k]+3*v*v*u*q.p1[k]+3*v*u*u*q.p2[k]+u*u*u*q.end[k];const dx=3*v*v*(q.p1.x-q.start.x)+6*v*u*(q.p2.x-q.p1.x)+3*u*u*(q.end.x-q.p2.x),dz=3*v*v*(q.p1.z-q.start.z)+6*v*u*(q.p2.z-q.p1.z)+3*u*u*(q.end.z-q.p2.z);p.a=Math.atan2(dx,dz);if(u>=1){r.edge=q.next.edge;r.reverse=q.next.reverse;r.d=12;r.turn=null;}return p;}
 r.d+=travel;const len=edgeLength(r.edge);if(r.d>=len-12){const next=nextRoad(city,r.edge,r.reverse,target,rnd),start=roadFrame(r.edge,len-12,r.reverse),end=roadFrame(next.edge,12,next.reverse);r.d=len-12;r.turn={start,end,p1:{x:start.x+start.ux*12,z:start.z+start.uz*12},p2:{x:end.x-end.ux*12,z:end.z-end.uz*12},u:0,length:Math.max(12,Math.hypot(end.x-start.x,end.z-start.z)*1.2),next};return start;}return roadFrame(r.edge,r.d,r.reverse);
}
