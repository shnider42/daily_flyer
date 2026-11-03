// Shared visual and physics surface: the wheels, shoes and city use the same heights.
export const SPEED_BUMPS=[{x:0,z:166,w:20,d:2.4,h:.22},{x:72,z:43,w:20,d:2.4,h:.19},{x:-144,z:-45,w:20,d:2.4,h:.2}];
export function hillHeight(x,z){return 12*Math.exp(-(((x+72)/132)**2+((z+108)/76)**2))+4.5*Math.exp(-(((x-110)/92)**2+((z+27)/115)**2));}
export function terrainHeight(x,z){let y=hillHeight(x,z);for(const b of SPEED_BUMPS){const u=Math.abs(x-b.x)/(b.w/2),v=Math.abs(z-b.z)/(b.d/2);if(u<1&&v<1)y+=b.h*Math.cos(v*Math.PI/2)**2*Math.min(1,(1-u)*5);}return y;}
const roads=[-216,-144,-72,0,72,144,216];
export function pavementHeight(x,z){const diagonal=x>=-152&&x<=8&&z>=64&&z<=224&&Math.abs(z-x-216)<11.3;return !diagonal&&roads.every(r=>Math.abs(x-r)>11.5)&&roads.every(r=>Math.abs(z-r)>11.5)&&Math.abs(x)<204.5&&Math.abs(z)<204.5?.16:0;}
export function groundHeight(x,z){return terrainHeight(x,z)+pavementHeight(x,z);}
export function walkHeight(x,z,city){let raised=0;for(const s of city.walkSurfaces||[])if(Math.abs(x-s.x)<=s.w/2&&Math.abs(z-s.z)<=s.d/2)raised=Math.max(raised,s.height+.18);return terrainHeight(x,z)+(raised||pavementHeight(x,z));}
export function vehicleSurface(c){const si=Math.sin(c.a),co=Math.cos(c.a),front=groundHeight(c.x+si*1.6,c.z+co*1.6),rear=groundHeight(c.x-si*1.6,c.z-co*1.6),right=groundHeight(c.x+co*.9,c.z-si*.9),left=groundHeight(c.x-co*.9,c.z+si*.9);return{y:(front+rear+right+left)/4,pitch:Math.atan2(front-rear,3.2),roll:Math.atan2(right-left,1.8)};}
export function settleVehicle(c,dt,speed=c.speed||0){
 const surface=vehicleSurface(c);if(!Number.isFinite(c.y)){c.y=surface.y;c.verticalSpeed=0;c.pitch=surface.pitch;c.roll=surface.roll;}
 // Damped suspension can leave the surface at a crest; gravity brings it back.
 const clearance=c.y-surface.y;if(clearance>.16){c.verticalSpeed-=9.81*dt;}else c.verticalSpeed+=((surface.y-c.y)*160-c.verticalSpeed*17)*dt;
 c.y+=c.verticalSpeed*dt;if(c.y<surface.y-.055){c.y=surface.y-.055;c.verticalSpeed=Math.max(0,c.verticalSpeed*.1);}
 const blend=1-Math.exp(-dt*12);c.pitch+=(surface.pitch-c.pitch)*blend;c.roll+=(surface.roll-c.roll)*blend;c.airborne=c.y>surface.y+.2;
 return surface;
}
