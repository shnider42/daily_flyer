// Every map uses the same height field for roads, tyres, walking and camera clearance.
export const SPEED_BUMPS=[{x:0,z:166,w:20,d:2.4,h:.22},{x:72,z:43,w:20,d:2.4,h:.19},{x:-144,z:-45,w:20,d:2.4,h:.2}];
export const BAYCREST_BUMPS=[{x:144,z:166,w:20,d:2.4,h:.18},{x:-144,z:43,w:20,d:2.4,h:.16}];
export const speedBumps=id=>id==='baycrest'?BAYCREST_BUMPS:SPEED_BUMPS;
const roads=[-216,-144,-72,0,72,144,216],limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const BAY_HEIGHTS=[
 [4,8,12,14,4,4,1],
 [18,18,26,20,4,4,1],
 [18,18,34,34,20,6,1],
 [8,18,34,34,22,6,6],
 [4,20,20,16,6,6,6],
 [4,20,20,12,6,6,2],
 [1,4,5,4,2,2,1]
];
// Flat intersections, rounded crests, and long grades rather than a continuous sine wave.
function grade(t){const u=limit((t-.12)/.76,0,1),r=.12;if(u<r)return u*u/(2*r*(1-r));if(u>1-r)return 1-(1-u)**2/(2*r*(1-r));return(u-r/2)/(1-r);}
export function baycrestHeight(x,z){
 const gx=limit((x+216)/72,0,6),gz=limit((z+216)/72,0,6),ix=Math.min(5,Math.floor(gx)),iz=Math.min(5,Math.floor(gz)),u=grade(gx-ix),v=grade(gz-iz),a=BAY_HEIGHTS[iz][ix]*(1-u)+BAY_HEIGHTS[iz][ix+1]*u,b=BAY_HEIGHTS[iz+1][ix]*(1-u)+BAY_HEIGHTS[iz+1][ix+1]*u;
 return a*(1-v)+b*v;
}
export function hillHeight(x,z,mapId='meridian'){return mapId==='baycrest'?baycrestHeight(x,z):12*Math.exp(-(((x+72)/132)**2+((z+108)/76)**2))+4.5*Math.exp(-(((x-110)/92)**2+((z+27)/115)**2));}
export function terrainHeight(x,z,mapId='meridian'){let y=hillHeight(x,z,mapId);for(const b of speedBumps(mapId)){const u=Math.abs(x-b.x)/(b.w/2),v=Math.abs(z-b.z)/(b.d/2);if(u<1&&v<1)y+=b.h*Math.cos(v*Math.PI/2)**2*Math.min(1,(1-u)*5);}return y;}
export function pavementHeight(x,z,mapId='meridian'){const diagonal=mapId!=='baycrest'&&x>=-152&&x<=8&&z>=64&&z<=224&&Math.abs(z-x-216)<11.3;return !diagonal&&roads.every(r=>Math.abs(x-r)>11.5)&&roads.every(r=>Math.abs(z-r)>11.5)&&Math.abs(x)<204.5&&Math.abs(z)<204.5?.16:0;}
export function groundHeight(x,z,mapId='meridian'){return terrainHeight(x,z,mapId)+pavementHeight(x,z,mapId);}
export function walkHeight(x,z,city){let raised=0;for(const s of city.walkSurfaces||[])if(Math.abs(x-s.x)<=s.w/2&&Math.abs(z-s.z)<=s.d/2)raised=Math.max(raised,s.height+.18);return terrainHeight(x,z,city.id)+(raised||pavementHeight(x,z,city.id));}
export function vehicleSurface(c){const si=Math.sin(c.a),co=Math.cos(c.a),front=groundHeight(c.x+si*1.6,c.z+co*1.6,c.mapId),rear=groundHeight(c.x-si*1.6,c.z-co*1.6,c.mapId),right=groundHeight(c.x+co*.9,c.z-si*.9,c.mapId),left=groundHeight(c.x-co*.9,c.z+si*.9,c.mapId);return{y:(front+rear+right+left)/4,pitch:Math.atan2(front-rear,3.2),roll:Math.atan2(right-left,1.8)};}
export function settleVehicle(c,dt,speed=c.speed||0){
 const surface=vehicleSurface(c);if(!Number.isFinite(c.y)){c.y=surface.y;c.verticalSpeed=0;c.pitch=surface.pitch;c.roll=surface.roll;}
 const clearance=c.y-surface.y;if(clearance>.16){c.verticalSpeed-=9.81*dt;}else c.verticalSpeed+=((surface.y-c.y)*160-c.verticalSpeed*17)*dt;
 c.y+=c.verticalSpeed*dt;if(c.y<surface.y-.055){c.y=surface.y-.055;c.verticalSpeed=Math.max(0,c.verticalSpeed*.1);}
 const blend=1-Math.exp(-dt*12);c.pitch+=(surface.pitch-c.pitch)*blend;c.roll+=(surface.roll-c.roll)*blend;c.airborne=c.y>surface.y+.2;return surface;
}
