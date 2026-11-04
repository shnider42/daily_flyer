export const WINDOWS = [
  {id:'porch',name:'Front porch',x:-5,z:7,nx:0,nz:1},
  {id:'dining',name:'Dining room',x:5,z:7,nx:0,nz:1},
  {id:'study',name:'Study',x:-5,z:-7,nx:0,nz:-1},
  {id:'kitchen',name:'Kitchen',x:5,z:-7,nx:0,nz:-1},
  {id:'west',name:'West bay',x:-9,z:0,nx:-1,nz:0},
  {id:'east',name:'East bay',x:9,z:0,nx:1,nz:0},
];
// Obstacles are also consumed by the renderer, ballistics, and navigation.
export const OBSTACLES = [
  {x:0,z:-4.6,w:.28,d:4.8,h:3.3,kind:'wall'},
  {x:0,z:4.6,w:.28,d:4.8,h:3.3,kind:'wall'},
  {x:-4.4,z:-1.9,w:3.8,d:.8,h:.95,kind:'sofa'},
  {x:-4.4,z:.2,w:2.1,d:1.1,h:.55,kind:'table'},
  {x:4.8,z:2.1,w:2.5,d:1.4,h:.9,kind:'dining'},
  {x:5,z:-4.4,w:2.7,d:1,h:1.1,kind:'counter'},
];
export const STATIONS = [
  {id:'ammo',x:-7.5,z:4,name:'Ammo cabinet',cost:120,detail:'Refill every owned weapon'},
  {id:'shotgun',x:7.5,z:4.7,name:'Severance shotgun',cost:600,detail:'Close-range crowd control'},
  {id:'carbine',x:7.5,z:-4.9,name:'Counteroffer carbine',cost:1000,detail:'Fast, accurate automatic fire'},
  {id:'health',x:-7.5,z:-4.8,name:'First aid',cost:200,detail:'Restore health to 100'},
];

export const MAPS={
 'everwell-house':{id:'everwell-house',name:'The Last Policyholder',subtitle:'Six windows · one floor',halfX:9,halfZ:7,height:3.6,windows:WINDOWS,obstacles:OBSTACLES,stations:STATIONS,stairs:[]},
 'executive-retreat':{id:'executive-retreat',name:'Executive Retreat',subtitle:'Eight windows · two floors · open atrium',halfX:12,halfZ:11,height:7.2,
 windows:[...[-7,7].flatMap((x,i)=>[{id:'south'+i,name:i?'Reception':'Motor court',x,z:11,nx:0,nz:1},{id:'north'+i,name:i?'Records':'Garden room',x,z:-11,nx:0,nz:-1}]),...[-7,7].flatMap((z,i)=>[{id:'west'+i,name:i?'West lounge':'West archive',x:-12,z,nx:-1,nz:0},{id:'east'+i,name:i?'East lounge':'East archive',x:12,z,nx:1,nz:0}])],
 obstacles:[{x:0,z:-7,w:5,d:1,h:1.1,kind:'counter'},{x:0,z:7,w:4,d:1.2,h:1,kind:'sofa'},{x:-4,z:0,w:1,d:3,h:1,kind:'table'},{x:4,z:0,w:1,d:3,h:1,kind:'table'},{x:0,z:8,w:3,d:1.2,h:.9,y:3.6,kind:'dining'}],
 stairs:[{x:-9,z0:-4,z1:4,w:2.8},{x:9,z0:-4,z1:4,w:2.8}],
 stations:[{...STATIONS[0],x:-10,z:9},{...STATIONS[1],x:10,z:9},{...STATIONS[2],x:10,z:-9},{...STATIONS[3],x:-10,z:-9},{id:'smg',name:'Fine Print SMG',cost:750,x:-7,z:7,y:3.6},{id:'marksman',name:'Final Notice rifle',cost:1400,x:7,z:7,y:3.6},{id:'lmg',name:'Golden Parachute LMG',cost:2000,x:0,z:-9,y:3.6}]}
};
// The original house gets the expanded arsenal too.
STATIONS.push({id:'smg',name:'Fine Print SMG',cost:750,x:-7.5,z:1.9},{id:'marksman',name:'Final Notice rifle',cost:1400,x:7.5,z:2.4},{id:'lmg',name:'Golden Parachute LMG',cost:2000,x:2.4,z:-5.6});
export const mapFor=id=>MAPS[id]||MAPS['everwell-house'];
export function stairAt(map,x,z){return map.stairs.find(s=>Math.abs(x-s.x)<s.w/2&&z>=s.z0&&z<=s.z1);}
export function upperDeck(map,x,z){return Math.abs(x)<map.halfX&&Math.abs(z)<map.halfZ&&map.stairs.length>0&&!stairAt(map,x,z)&&(Math.abs(x)>=5||Math.abs(z)>=5);}
export function floorAt(map,x,z,fromY=0){
 const stair=stairAt(map,x,z);if(stair)return 3.6*(z-stair.z0)/(stair.z1-stair.z0);
 if(fromY>1.8)return upperDeck(map,x,z)?3.6:NaN;
 return 0;
}
