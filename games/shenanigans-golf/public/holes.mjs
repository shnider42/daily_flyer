/** The course is also the collision map. Dimensions are in golf-course metres. */
const P = (x,z,w,d) => ({x,z,w,d});
const Z = (type,x,z,w,d,extra={}) => ({type,x,z,w,d,...extra});
const O = (type,x,z,extra={}) => ({type,x,z,...extra});
const garden = {turf:'#4b8754',sky:'#b9d1d4',accent:'#e5a64b',ground:'#d6c8a1'};
const works = {turf:'#397e6a',sky:'#a3b8c4',accent:'#eab24e',ground:'#8f9285'};
const arcade = {turf:'#316c71',sky:'#243b52',accent:'#ed8e8c',ground:'#364955'};
const strange = {turf:'#497b78',sky:'#3c455f',accent:'#bb9bdb',ground:'#55647c'};
const lunar = {turf:'#788d8c',sky:'#111e37',accent:'#efd48a',ground:'#8e8b92'};
const final = {turf:'#477769',sky:'#382d43',accent:'#f1a06c',ground:'#554c58'};

/** Exact pose shared by server, local simulation, and rendering. */
export function obstaclePose(obstacle,time=0) {
  let {x=0,z=0,angle=0,speed=0,phase=0,travel=0,axis='x'}=obstacle;
  if(obstacle.type==='spinner'||obstacle.type==='windmill') angle+=time*speed+phase;
  if(obstacle.type==='gate') {
    const offset=Math.sin(time*speed+phase)*travel;
    if(axis==='z') z+=offset; else x+=offset;
  }
  return {x,z,angle};
}

function boundaryRails(platforms) {
  // A small exact rectangular arrangement removes rails inside overlapping platforms.
  const xs=[...new Set(platforms.flatMap(p=>[p.x-p.w/2,p.x+p.w/2]))].sort((a,b)=>a-b);
  const zs=[...new Set(platforms.flatMap(p=>[p.z-p.d/2,p.z+p.d/2]))].sort((a,b)=>a-b);
  const inside=(x,z)=>platforms.some(p=>Math.abs(x-p.x)<p.w/2+1e-7&&Math.abs(z-p.z)<p.d/2+1e-7);
  const filled=(i,j)=>i>=0&&j>=0&&i<xs.length-1&&j<zs.length-1&&inside((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2);
  const rails=[];
  for(let i=0;i<xs.length-1;i++) for(let j=0;j<zs.length-1;j++) {
    if(!filled(i,j))continue;
    if(!filled(i-1,j))rails.push({ax:xs[i],az:zs[j],bx:xs[i],bz:zs[j+1]});
    if(!filled(i+1,j))rails.push({ax:xs[i+1],az:zs[j],bx:xs[i+1],bz:zs[j+1]});
    if(!filled(i,j-1))rails.push({ax:xs[i],az:zs[j],bx:xs[i+1],bz:zs[j]});
    if(!filled(i,j+1))rails.push({ax:xs[i],az:zs[j+1],bx:xs[i+1],bz:zs[j+1]});
  }
  return rails;
}
function hole(id,name,par,blurb,tip,platforms,tee,cup,options={}) {
  const palette=options.palette||(id<=4?garden:id<=8?works:id<=12?arcade:id<=15?strange:final);
  return {
    id,name,par,blurb,tip,
    chapter:id<=4?'A perfectly normal golf course':id<=8?'Maintenance is aware':id<=12?'Permit pending':id<=15?'Beyond our remit':'Management has left',
    bounds:{minX:Math.min(...platforms.map(p=>p.x-p.w/2)),maxX:Math.max(...platforms.map(p=>p.x+p.w/2)),minZ:Math.min(...platforms.map(p=>p.z-p.d/2)),maxZ:Math.max(...platforms.map(p=>p.z+p.d/2))},
    platforms,tee,cup:{r:.48,...cup},rails:boundaryRails(platforms),obstacles:[],zones:[],palette,
    scenery:id<=4?'garden':id<=8?'workshop':id<=12?'arcade':id<=15?'strange':'volcano',waypoints:[],...options,
    obstacles:(options.obstacles||[]).map((o,i)=>({id:`h${id}-o${i}`,height:o.type==='bumper'?.6:.8,...o})),
    zones:(options.zones||[]).map((z,i)=>({id:`h${id}-z${i}`,...z})),
  };
}

export const HOLES = [
  hole(1,'A Nice Little Putt',2,'A ball. A flag. Absolutely nothing suspicious.','Aim at the flag. A gentle putt goes further than you think.',[P(0,0,7,22)],{x:0,z:8},{x:0,z:-8}),
  hole(2,'The Flower Bed',3,'The landscaping committee would appreciate a wide berth.','Bank off a rail or go around the flower bed.',[P(0,0,13,26)],{x:-3,z:10},{x:3,z:-10},{obstacles:[O('block',0,0,{w:4.2,d:5.2})],zones:[Z('sand',4.8,0,2.4,7)],waypoints:[{x:-4,z:-5},{x:3,z:-10}]}),
  hole(3,'The Garden Path',3,'The scenic route is, unfortunately, the only route.','Take the bend in two shots. The outside rail can help.',[P(-4,1,6,24),P(1,-8,16,6)],{x:-4,z:10},{x:7,z:-8},{waypoints:[{x:-4,z:-8},{x:7,z:-8}]}),
  hole(4,'Sprinkler Incident',3,'It was only supposed to water the lawn.','The pale strip pushes your ball sideways. Avoid the puddle.',[P(0,0,13,28)],{x:0,z:11},{x:0,z:-11},{zones:[Z('wind',0,1,13,7,{angle:Math.PI/2,strength:1.65}),Z('water',-3.5,-4,3.6,4.5)],obstacles:[O('post',4,-5,{r:.75})],waypoints:[{x:1,z:-6},{x:0,z:-11}]}),
  hole(5,'Windmill Warranty',3,'Moving parts are not covered by the warranty.','Watch a full sweep, then putt through the gap.',[P(0,0,10,30)],{x:0,z:12},{x:0,z:-12},{obstacles:[O('windmill',0,0,{w:7.2,d:.6,speed:.82,phase:.3})],waypoints:[{x:3.3,z:-4},{x:0,z:-12}]}),
  hole(6,'Shortcut Pending',3,'The bridge passed inspection. The ramp did not.','Take the right bridge or use the ramp to jump the pond.',[P(0,0,16,30)],{x:-4,z:12},{x:-3,z:-12},{zones:[Z('water',-2.5,0,10,5),Z('ramp',-3,4.2,4.3,3,{angle:0,strength:5.8,height:.65})],waypoints:[{x:5.2,z:5},{x:5.2,z:-5},{x:-3,z:-12}]}),
  hole(7,'Factory Settings',4,'A golf course designed by the shipping department.','Thread the loading bays. A controlled bank beats brute force.',[P(0,0,15,34)],{x:-4,z:14},{x:4,z:-14},{obstacles:[O('block',-3.3,5,{w:8,d:1.2}),O('block',3.3,-5,{w:8,d:1.2})],waypoints:[{x:3.6,z:8},{x:3.6,z:1},{x:-3.6,z:-1},{x:-3.6,z:-8},{x:4,z:-14}]}),
  hole(8,'Belt and Braces',3,'Please keep arms, legs, and golf balls inside the machinery.','Yellow belts add speed in the direction of their arrows.',[P(0,0,14,32)],{x:-3.5,z:13},{x:3.5,z:-13},{zones:[Z('conveyor',-3.5,2,4,16,{angle:0,strength:2.2}),Z('conveyor',3.5,-2,4,16,{angle:Math.PI,strength:1.6})],obstacles:[O('block',0,0,{w:1.2,d:12})],waypoints:[{x:-3.5,z:-9},{x:3.5,z:-13}]}),
  hole(9,'Pinball Etiquette',3,'A polite game of golf with extremely impolite bumpers.','Bumpers kick the ball away. A clean outside line is safer.',[P(0,0,17,32)],{x:0,z:13},{x:0,z:-13},{obstacles:[O('bumper',0,4,{r:1.2}),O('bumper',-3.8,-2,{r:1.2}),O('bumper',3.8,-2,{r:1.2}),O('bumper',0,-7,{r:1})],zones:[Z('ice',0,0,17,18)],waypoints:[{x:6.5,z:-8},{x:0,z:-13}]}),
  hole(10,'Rush Hour',4,'The crossing guards have chosen violence.','Time a gap in each moving barrier. The centre is rarely safe.',[P(0,0,14,36)],{x:0,z:15},{x:0,z:-15},{obstacles:[O('gate',0,6,{w:5.8,d:1,speed:1.0,travel:3.7,axis:'x'}),O('gate',0,-2,{w:5.8,d:1,speed:1.25,travel:3.7,phase:1.6,axis:'x'}),O('gate',0,-9,{w:5.8,d:1,speed:.83,travel:3.7,phase:3.1,axis:'x'})],waypoints:[{x:4.7,z:3},{x:-4.7,z:-5},{x:4.7,z:-12},{x:0,z:-15}]}),
  hole(11,'Portal Maintenance',3,'The short walk to the next green is no longer Euclidean.','Roll into the glowing portal. It carries your speed to the other island.',[P(-5,7,9,14),P(5,-9,9,14)],{x:-5,z:12},{x:5,z:-14},{zones:[Z('portal',-5,2,3,3,{to:{x:5,z:-5},angle:0})],obstacles:[O('post',5,-10,{r:1})],waypoints:[{x:-5,z:2},{x:7.4,z:-11},{x:5,z:-14}]}),
  hole(12,'Wrong Way River',4,'The canal now has a complaints department.','Cross the narrow bridge. Blue ice slides; yellow arrows push.',[P(-5,1,7,30),P(5,-1,7,30),P(0,1,5,5)],{x:-5,z:13},{x:5,z:-13},{zones:[Z('conveyor',0,1,5,5,{angle:-Math.PI/2,strength:1.8}),Z('ice',5,-6,7,15),Z('water',-5,-7,7,3)],waypoints:[{x:-5,z:1},{x:5,z:1},{x:5,z:-13}]}),
  hole(13,'Moonlighting',3,'Same game. Significantly less planet.','Low gravity makes ramps carry further. The bridge is still there.',[P(0,8,14,12),P(0,-9,14,14),P(5,0,4,7)],{x:-3,z:12},{x:-2,z:-13},{palette:lunar,scenery:'moon',gravity:5.6,zones:[Z('ramp',-3,4.5,4,3,{angle:0,strength:4.4,height:.6}),Z('ice',0,-7,14,7)],obstacles:[O('post',2,-10,{r:1.1})],waypoints:[{x:5,z:6},{x:5,z:-5},{x:-2,z:-6},{x:-2,z:-13}]}),
  hole(14,'Weather Advisory',4,'A light breeze, according to the person who sold us this land.','Crosswinds change between lanes. Leave a little room for drift.',[P(0,0,19,38)],{x:-5,z:16},{x:4,z:-16},{scenery:'storm',zones:[Z('wind',0,9,19,7,{angle:Math.PI/2,strength:3}),Z('wind',0,-1,19,7,{angle:-Math.PI/2,strength:2.6}),Z('ice',0,-10,19,9)],obstacles:[O('block',0,4,{w:6,d:1.2}),O('post',-3,-10,{r:1.3}),O('post',5,-8,{r:1})],waypoints:[{x:6,z:3},{x:1,z:-6},{x:4,z:-16}]}),
  hole(15,'Reactor Inspection',4,'Those are regulation miniature black holes.','Purple fields pull toward their centre. Give them some space.',[P(0,0,20,38)],{x:-5,z:16},{x:5,z:-16},{scenery:'reactor',zones:[Z('magnet',-3,4,7,8,{strength:5.2}),Z('magnet',4,-6,8,8,{strength:4.6}),Z('boost',-7,-2,3,8,{angle:0,strength:10})],obstacles:[O('spinner',0,-1,{w:9,d:.65,speed:-1.2}),O('post',-3,4,{r:.9}),O('post',4,-6,{r:.9})],waypoints:[{x:7,z:6},{x:7,z:-2},{x:-2,z:-11},{x:5,z:-16}]}),
  hole(16,'The Floor Is Lava',4,'This was not on the original planning application.','The orange patches cost a stroke. Keep your landing zone clear.',[P(-5,8,9,18),P(0,1,19,7),P(5,-8,9,18)],{x:-5,z:14},{x:5,z:-14},{scenery:'volcano',zones:[Z('lava',-5,5,3,4),Z('lava',5,-4,3.4,4),Z('ramp',-5,9,4,2.6,{angle:0,strength:5.7,height:.6})],obstacles:[O('spinner',0,1,{w:5.2,d:.7,speed:.9})],waypoints:[{x:-7.7,z:1},{x:7.7,z:1},{x:7.7,z:-8},{x:5,z:-14}]}),
  hole(17,'Everything, Everywhere',4,'We found the switches. We pressed all of them.','Use the portal, then pick a route through the pinball machinery.',[P(-6,10,10,14),P(3,-7,19,23)],{x:-6,z:14},{x:4,z:-15},{scenery:'reactor',zones:[Z('conveyor',-6,9,4,8,{angle:0,strength:2.2}),Z('portal',-6,5,3,3,{to:{x:-3,z:1}}),Z('ice',3,-5,19,7),Z('magnet',7,-5,5,5,{strength:3.8}),Z('lava',3,-10,5,2.5)],obstacles:[O('bumper',0,-2,{r:1.05}),O('bumper',5,-3,{r:1}),O('spinner',1,-7,{w:6,d:.6,speed:1.15})],waypoints:[{x:-6,z:5},{x:-3,z:-10},{x:4,z:-15}]}),
  hole(18,'The Last Reasonable Putt',5,'Just one more hole, said a person who should not be trusted.','The outside route is safe. The central launch is a glorious bad idea.',[P(0,0,23,44)],{x:0,z:19},{x:0,z:-19},{scenery:'finale',zones:[Z('lava',0,-1,11,18),Z('ramp',0,10,5,4,{angle:0,strength:7.4,height:.8}),Z('boost',0,14,5,4,{angle:0,strength:13}),Z('conveyor',-8,-1,3.5,16,{angle:0,strength:2.1}),Z('ice',0,-15,23,8),Z('portal',8,3,2.4,2.4,{to:{x:7,z:-13}})],obstacles:[O('windmill',-8,5,{w:5,d:.55,speed:.95}),O('gate',0,-16,{w:4,d:.7,speed:1.1,travel:5.5,axis:'x'}),O('bumper',-4,-13,{r:1}),O('bumper',4,-13,{r:1})],waypoints:[{x:8,z:10},{x:8,z:3},{x:7,z:-15},{x:0,z:-19}]}),
];

export const COURSE_PAR = HOLES.reduce((sum,h)=>sum+h.par,0);
