// Arcade fire model: cosmetic damage alone never ignites a vehicle.
export function igniteVehicle(c,fuse=12){if(c.exploded||c.fire>0)return false;c.fire=.001;c.fireFuse=fuse;c.burnTime=0;return true;}
export function stepVehicleFire(c,dt){
 if(c.exploded){c.burnTime=Math.max(0,(c.burnTime||0)-dt);return false;}
 if(!(c.fire>0))return false;c.fire+=dt;c.engineDamage=Math.min(100,(c.engineDamage||0)+dt*2.5);
 if(c.fire<(c.fireFuse||12))return false;
 c.exploded=true;c.fire=0;c.burnTime=8;c.engineDamage=100;c.damage=100;c.wheelDamage=75;c.panelDamage={front:100,rear:100,left:100,right:100};c.speed=0;c.sirens=false;c.occupied=false;c.explosionSerial=(c.explosionSerial||0)+1;return true;
}
export function canObserve(observer,subject,buildings,visible,range=55){
 if(observer.exploded||observer.stun>0||observer.knockdown>0||observer.life<=0||observer.police&&observer.engineDamage>=100)return false;
 const dx=subject.x-observer.x,dz=subject.z-observer.z,d=Math.hypot(dx,dz);if(d>range)return false;
 const facing=dx*Math.sin(observer.a||0)+dz*Math.cos(observer.a||0);if(d>8&&facing/d<-.12)return false;
 return visible(observer,subject,buildings);
}
