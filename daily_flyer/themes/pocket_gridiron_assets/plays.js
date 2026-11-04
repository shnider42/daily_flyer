import {SYSTEM_PLAYS} from './offensive-systems.js?v=30';
import {SYSTEM_DEFENSE,FRONTS} from './defensive-systems.js?v=30';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const BASE_PLAYS=[
 {id:'dive',name:'Inside run',kind:'run',hint:'Follow the blocks'},
 {id:'sweep',name:'Wide sweep',kind:'run',hint:'Find the right edge'},
 {id:'slants',name:'Quick slants',kind:'pass',hint:'Fast & underneath'},
 {id:'verts',name:'Go routes',kind:'pass',hint:'Stretch the field'},
 {id:'counter',name:'Counter left',kind:'run',hint:'Follow the pulling guard'},
 {id:'curls',name:'Curl hooks',kind:'pass',hint:'Wait for the comeback'},
 {id:'flood',name:'Boot flood',kind:'pass',hint:'Roll right · three levels'},
 {id:'mesh',name:'Mesh cross',kind:'pass',hint:'Cross underneath man coverage'},
 {id:'smash',name:'Smash corners',kind:'pass',hint:'Short hooks · deep corner'},
 {id:'power',name:'Power lead',kind:'run',hint:'Strong-side lead block'},
 {id:'stretch',name:'Stretch left',kind:'run',hint:'Press the edge, then cut up'},
 {id:'keeper',name:'QB keeper',kind:'run',hint:'QB keeps behind the back'},
 {id:'levels',name:'Levels',kind:'pass',hint:'Three depths across the middle'},
 {id:'postwheel',name:'Post / wheel',kind:'pass',hint:'Deep post with an outside wheel'},
 {id:'spot',name:'Spot triangle',kind:'pass',hint:'Corner, flat and short sit'},
 {id:'draw',name:'Delayed draw',kind:'run',hint:'Show pass · hand off late'}
];
const BASE_DEFENSE=[
 {id:'zone',name:'Zone',hint:'Balanced underneath'},
 {id:'man',name:'Man cover',hint:'Stay with your receiver'},
 {id:'blitz',name:'Blitz',hint:'Pressure the pocket'},
 {id:'cover2',name:'Cover 2',hint:'Two deep · guard the flats'},
 {id:'cover3',name:'Cover 3',hint:'Three deep · concede short'},
 {id:'commit',name:'Run commit',hint:'Crowd the line · risky deep'},
 {id:'press',name:'Press man',hint:'Jam the release · risk the deep ball'},
 {id:'robber',name:'Robber',hint:'Man outside · lurk underneath'},
 {id:'prevent',name:'Prevent',hint:'Protect deep · concede the run'}
];

const pass=(id,name,hint,group,routes,wait=1.7)=>({id,name,hint,kind:'pass',group,routes,wait});
const run=(id,name,hint,lane,options={})=>({id,name,hint,kind:'run',group:'run',lane,blockLane:lane,...options});
const NEW_PLAYS=[
 run('sweepleft','Sweep left','Handoff left · follow the pulling guard',8,{formation:[26.5,31,7,46,16,23,30],exchange:{release:.16,flight:.08,xTarget:25,yTarget:-5},pull:{slot:6,x:12,y:-1,until:1.2},lead:{slot:4,x:8,until:1.8}}),
 run('tossright','Toss right','Pitch outside · follow the lead block',45,{formation:[26.5,31,7,46,39,23,30],exchange:{release:.18,flight:.36,xTarget:37,yTarget:-6},pull:{slot:6,x:40,y:1,until:1.3},lead:{slot:4,x:45,until:1.8}}),
 run('tossleft','Toss left','Pitch left · plant and turn upfield',8,{formation:[26.5,22,7,46,14,23,30],exchange:{release:.18,flight:.36,xTarget:16,yTarget:-6},pull:{slot:5,x:13,y:1,until:1.3},lead:{slot:4,x:8,until:1.8}}),
 run('jetsweep','Jet sweep','Receiver crosses behind the QB',45,{carrier:2,formation:[26.5,27,20,46,36,23,30],exchange:{runner:2,release:.32,flight:.08,xTarget:27,yTarget:-4},pull:{slot:6,x:39,y:1,until:1.2},lead:{slot:1,x:44,until:1.8}}),
 pass('comeback','Sideline comebacks','Sell deep · come back outside','quick',[[[7,0],[9,15],[4,11]],[[46,0],[44,15],[49,11]],[[36,0],[27,6]]],2.6),
 pass('speedouts','Speed outs','Five-yard cuts toward the sidelines','quick',[[[7,0],[7,5],[2,5]],[[46,0],[46,5],[51,5]],[[36,0],[32,27]]],1.1),
 pass('deepouts','Deep outs','Twelve-yard outs · shallow outlet','deep',[[[7,0],[9,12],[2,12]],[[46,0],[44,12],[51,12]],[[36,0],[36,3],[12,3]]],2.2),
 pass('dagger','Dagger','Seam clears space for the deep dig','deep',[[[7,0],[7,15],[37,15]],[[46,0],[46,6],[44,5]],[[36,0],[29,35]]],2.5),
 pass('drive','Drive cross','Shallow cross beneath a twelve-yard dig','quick',[[[7,0],[7,3],[46,3]],[[46,0],[46,12],[13,12]],[[36,0],[30,32]]]),
 pass('scissors','Scissors','Post and corner cross at different depths','deep',[[[7,0],[9,13],[5,9]],[[46,0],[44,12],[20,35]],[[36,0],[33,8],[50,27]]],2.3),
 pass('doublepost','Double posts','Two staggered posts · short outlet','deep',[[[7,0],[7,10],[29,34]],[[46,0],[46,17],[24,40]],[[36,0],[30,4],[12,4]]],2.5),
 pass('bench','Bench corners','Outside corners with a short flat','deep',[[[7,0],[13,10],[2,23]],[[46,0],[40,12],[51,25]],[[36,0],[49,3]]],2.1),
 pass('whip','Whip returns','Sell inside · pivot back toward the sideline','quick',[[[7,0],[15,4],[5,4]],[[46,0],[38,6],[49,6]],[[36,0],[29,30]]],2.0),
 pass('cornerpost','Corner / post','Double move · needs time to develop','deep',[[[7,0],[9,10],[3,17],[28,39]],[[46,0],[43,13],[51,13]],[[36,0],[31,6],[31,5]]],3.0),
 pass('seamstretch','Seam stretch','Wide fades open the middle seam','deep',[[[7,0],[3,12],[3,43]],[[46,0],[50,12],[50,43]],[[36,0],[28,14],[28,42]]],2.1),
 pass('shallowwheel','Shallow / wheel','Cross underneath · wheel up the right edge','quick',[[[7,0],[9,4],[43,4]],[[46,0],[40,18],[37,42]],[[36,0],[49,3],[49,32]]],1.8),
 run('trapright','Right trap','Left guard pulls into the right gap',31,{pull:{slot:5,x:31,y:-1,until:.9}}),
 run('powerleft','Power left','Right guard leads through the left gap',19,{pull:{slot:6,x:19,y:2,until:.8}}),
 run('qbdraw','QB draw','Show pass · QB follows the back inside',26.5,{carrier:0,delay:.8,lead:{slot:1,x:26.5,until:1.7}}),
 run('iso','Lead isolation','Follow the tight end through the interior',25,{lead:{slot:4,x:25,until:1.5}})
];
// Every call in a package uses exactly the same pre-snap coordinates.
const packaged=(formationId,p)=>({...p,formationId,universal:true});
const fake=(id,name,hint,formationId,routes,lane,wait=2)=>packaged(formationId,{...pass(id,name,hint,'deep',routes,wait),playAction:{lane,duration:.85}});
export const PACKAGE_PLAYS=[
 packaged('singleback',run('sbduo','Duo inside','Adjacent linemen combine · follow the double team',27,{doubleTeam:true})),
 packaged('singleback',run('sbzone','Zone right','Press the right gap · cut behind the block',32)),
 packaged('singleback',pass('sbstick','Stick / flat','Quick sit route with an outside outlet','quick',[[[7,0],[7,30]],[[46,0],[46,5],[50,5]],[[36,0],[31,6]]],1.2)),
 fake('sbpa','PA cross','Fake zone right · cross behind the linebackers','singleback',[[[7,0],[7,10],[41,13]],[[46,0],[46,32]],[[36,0],[46,4]]],32),
 fake('sbpapost','PA post / dig','Same run look · post over a deep dig','singleback',[[[7,0],[7,12],[29,33]],[[46,0],[46,13],[19,13]],[[36,0],[35,5]]],32,2.4),
 packaged('pistol',run('pistolzone','Pistol zone','Deep back presses the inside lane',27,{exchange:{release:.28,flight:.08,xTarget:26.5,yTarget:-7}})),
 packaged('pistol',run('pistoltoss','Pistol toss','Deep back pitches wide right',45,{exchange:{release:.3,flight:.35,xTarget:34,yTarget:-8},lead:{slot:4,x:44,until:1.8}})),
 packaged('pistol',pass('pistolquick','Pistol spacing','Short hooks across the width of the field','quick',[[[7,0],[10,6]],[[46,0],[43,6]],[[36,0],[26,5]]],1.3)),
 fake('pistolpa','Pistol PA seam','Show inside zone · attack the seam','pistol',[[[7,0],[7,9],[2,12]],[[46,0],[46,9],[51,12]],[[36,0],[28,32]]],27,2.2),
 packaged('bunch',run('bunchinside','Bunch inside','Use the tight look to open the interior',25,{exchange:{release:.22,flight:.08,xTarget:25,yTarget:-4}})),
 packaged('bunch',run('bunchtoss','Bunch toss','Three receivers clear the right edge',45,{exchange:{release:.2,flight:.4,xTarget:33,yTarget:-5},lead:{slot:4,x:44,until:1.8}})),
 packaged('bunch',pass('bunchrub','Bunch switch','Cross releases · quick out and shallow cross','quick',[[[36,-1],[42,5],[50,5]],[[43,0],[37,4],[13,4]],[[39,-2],[35,12],[29,30]]],1.4)),
 fake('bunchpa','Bunch PA sail','Fake inside · flood the right side','bunch',[[[36,-1],[40,13],[50,18]],[[43,0],[46,33]],[[39,-2],[49,3]]],25,2.1)
];
NEW_PLAYS.push(...PACKAGE_PLAYS);
const lanes={dive:27,sweep:45,counter:12,power:32,stretch:8,keeper:39,draw:27};
export const PLAYS=[...BASE_PLAYS.map(p=>({...p,group:p.kind==='run'?'run':['verts','flood','smash','postwheel','levels'].includes(p.id)?'deep':'quick',lane:lanes[p.id],blockLane:({sweep:42,counter:14,power:32,stretch:8,keeper:39})[p.id],carrier:p.id==='keeper'?0:1,delay:p.id==='draw'?.85:0,wait:p.id==='curls'?2.3:p.id==='flood'?1.9:1.4,...(p.id==='counter'?{pull:{slot:6,x:13,y:-1,until:1.2}}:p.id==='power'?{pull:{slot:6,x:32,y:2,until:.8}}:{})})),...NEW_PLAYS,...SYSTEM_PLAYS];
const zone=(x,y,drift=0)=>({x,y,drift});
const def=(id,name,hint,group,depths,coverage)=>({id,name,hint,group,depths,coverage});
const NEW_DEFENSE=[
 def('twistleft','Left twist','Line exchanges gaps · run at the vacated edge','pressure',[1.5,1.5,5,5,10,10,19],{rush:[0,1],stunt:[1,0],zones:{2:zone(15,7),3:zone(39,7),4:zone(7,13),5:zone(46,13),6:zone(26.5,24)}}),
 def('twistright','Right twist','Penetrator attacks · partner loops behind','pressure',[1.5,1.5,5,5,10,10,19],{rush:[0,1],stunt:[0,1],zones:{2:zone(15,7),3:zone(39,7),4:zone(7,13),5:zone(46,13),6:zone(26.5,24)}}),
 def('cover4','Quarters','Four deep zones · space underneath','zone',[1.5,1.5,7,17,19,19,21],{rush:[0,1],zones:{2:zone(26.5,8),3:zone(7,24,1),4:zone(20,27,1),5:zone(33,27,1),6:zone(46,24,1)}}),
 def('cover6','Quarter / quarter / half','Split left deep · half-field help right','zone',[1.5,1.5,7,7,19,21,20],{rush:[0,1],zones:{2:zone(16,7),3:zone(39,7),4:zone(7,25,1),5:zone(21,28,1),6:zone(40,28,1)}}),
 def('cover0','Zero blitz','Four rushers · man coverage without deep help','pressure',[1.5,1.5,4,2,4,4,7],{rush:[0,1,3,6],man:{2:4,4:2,5:3}}),
 def('spy','Man / QB spy','Spy the quarterback · three man matchups','man',[1.5,1.5,4,6,5,5,18],{rush:[0,1],man:{2:4,4:2,5:3},spy:3,safety:6}),
 def('bracketleft','Bracket left','Three layers around the left receiver','man',[1.5,1.5,4,7,5,5,17],{rush:[0,1],man:{2:4,4:2,5:3},bracket:{slot:2,under:3,over:6}}),
 def('bracketright','Bracket right','Three layers around the right receiver','man',[1.5,1.5,4,7,5,5,17],{rush:[0,1],man:{2:4,4:2,5:3},bracket:{slot:3,under:3,over:6}}),
 def('firezone','Fire zone','Three rushers · lineman drops into the hook','pressure',[1.5,1.5,2,2,16,16,20],{rush:[0,2,3],zones:{1:zone(26.5,6),4:zone(8,24,1),5:zone(45,24,1),6:zone(26.5,29,1)}}),
 def('edgeleft','Left edge blitz','Corner rushes left · linebacker replaces him','pressure',[1.5,1.5,4,5,2,5,19],{rush:[0,1,4],edge:4,man:{2:4,3:2,5:3},safety:6}),
 def('edgeright','Right edge blitz','Corner rushes right · linebacker replaces him','pressure',[1.5,1.5,4,5,5,2,19],{rush:[0,1,5],edge:5,man:{2:4,3:3,4:2},safety:6})
];
export const DEFENSE=[...BASE_DEFENSE.map(p=>({...p,group:['blitz','commit'].includes(p.id)?'pressure':['man','press','robber'].includes(p.id)?'man':'zone'})),...NEW_DEFENSE,...SYSTEM_DEFENSE];
function waypointRoute(points,p,time,spot){
 let left=Math.max(0,time)*p.speed*(.94+(p.routeRunning||80)*.00075);
 for(let i=1;i<points.length;i++){const [x,y]=points[i-1],[tx,ty]=points[i],n=Math.hypot(tx-x,ty-y);if(left<=n)return {x:x+(tx-x)*left/n,y:Math.min(106,spot+y+(ty-y)*left/n)};left-=n;}
 const [x,y]=points.at(-1);return {x,y:Math.min(106,spot+y)};
}
export function newCoverageTarget(g,d){
 const c=g.format===11&&g.defenseDefinition.fullCoverage?g.defenseDefinition.fullCoverage:g.defenseDefinition.coverage;if(!c)return null;const i=d.slot,s=g.spot;
 if(c.rush.includes(i)){if(c.edge===i&&d.y>s-2)return {x:i===4?g.carrier.x-7:g.carrier.x+7,y:s-3};return g.carrier;}
 const slot=c.man?.[i];if(slot!==undefined){const p=g.players[slot];return {x:p.x+(p.x<26.5?.5:-.5),y:Math.min(107,p.y+.6+g.defenseAI.adapt*.7)};}
 if(c.spy===i||c.spies?.includes(i))return {x:clamp(g.carrier.x,10,43),y:Math.min(107,Math.max(s+3,g.carrier.y+5))};
 if(c.bracket&&(c.bracket.under===i||c.bracket.over===i)){const p=g.players[c.bracket.slot],over=c.bracket.over===i;return {x:clamp(p.x+(p.x<26.5?2:-2),2,51),y:Math.min(107,over?Math.max(s+15,p.y+5):p.y-2)};}
 if(c.safety===i){const p=[...g.players.slice(2,5)].sort((a,b)=>b.y-a.y)[0];return {x:clamp(p.x,13,40),y:Math.min(107,Math.max(s+22,p.y+5))};}
 const z=c.zones?.[i];if(!z)return null;const y=s+z.y+Math.min(g.liveTime*2,10)*z.drift;
 const near=g.players.slice(2,5).filter(p=>Math.abs(p.x-z.x)<8&&Math.abs(p.y-y)<8).sort((a,b)=>Math.hypot(a.x-d.x,a.y-d.y)-Math.hypot(b.x-d.x,b.y-d.y))[0];
 return near?{x:clamp(near.x,z.x-7,z.x+7),y:Math.min(107,near.y+g.defenseAI.adapt)}:{x:z.x,y:Math.min(107,y)};
}
export function playDiagram(id){
 const p=PLAYS.find(p=>p.id===id);if(p){if(p.kind==='run')return `M27 40 L${p.lane} 31 L${p.lane} 16`;return [2,3,4].map(slot=>Array.from({length:22},(_,i)=>{const r=routeFor(p,{slot,speed:7.2,routeRunning:80},i*.25,0);return `${i?'L':'M'}${r.x.toFixed(1)} ${(38-r.y*.75).toFixed(1)}`;}).join(' ')).join(' ');}
 const d=DEFENSE.find(p=>p.id===id);if(!d?.coverage)return null;
 const c=d.fullCoverage||d.coverage,front=FRONTS[d.system];return Array.from({length:d.fullCoverage?11:7},(_,i)=>{const x=front?.x[i]??[23,30,15,39,8,45,26.5][i],y=34-(front?.y[i]??d.depths[i])*.7;if(c.rush.includes(i))return `M${x} ${y} L27 39`;if(c.man?.[i]!==undefined)return `M${x} ${y} L${[26.5,22,7,46,36,23,30,20,26.5,33,30][c.man[i]]} 15`;if(c.zones?.[i])return `M${x} ${y} L${c.zones[i].x} ${34-c.zones[i].y*.7}`;return `M${x-3} ${y} L${x+3} ${y} M${x} ${y-3} L${x} ${y+3}`;}).join(' ');
}
function baseRoute(play,p,time,spot){
  if(play.routes)return waypointRoute(play.routes[p.slot-2],p,Math.max(0,time-(play.releaseDelay?.[p.slot]||0)),spot);
  const depth=time*p.speed*(.94+(p.routeRunning||80)*.00075),slot=p.slot;let x=[0,0,7,46,36][slot],y=spot+Math.min(depth,45);
  if(play.id==='slants'){x=slot===2?Math.min(33,7+depth*.8):slot===3?Math.max(21,46-depth*.8):36-depth*.35;y=spot+Math.min(depth*.7,30);}
  if(play.id==='curls'){
   if(slot===4){x=36-Math.min(depth,22);y=spot+Math.min(depth,6);}
   else{const comeback=Math.max(0,Math.min(4,depth-12));x=slot===2?7+comeback*.7:46-comeback*.7;y=spot+Math.min(depth,12)-comeback;}
  }
  if(play.id==='flood'){
   if(slot===2){x=7+Math.min(34,Math.max(0,depth-5)*1.1);y=spot+Math.min(depth,18);}
   if(slot===3){x=44;y=spot+Math.min(depth,45);}
   if(slot===4){x=35+Math.min(14,depth);y=spot+Math.min(depth*.5,5);}
  }
  if(play.id==='mesh'){
   if(slot===2){x=7+Math.min(39,Math.max(0,depth-4));y=spot+Math.min(depth,4);}
   if(slot===3){x=46-Math.min(39,Math.max(0,depth-6));y=spot+Math.min(depth,6);}
   if(slot===4){x=30;y=spot+Math.min(depth,20);}
  }
  if(play.id==='smash'){
   if(slot===4){x=36+Math.min(14,Math.max(0,depth-10));y=spot+Math.min(depth,26);}
   else{const comeback=Math.max(0,Math.min(1.5,depth-6));y=spot+Math.min(depth,6)-comeback;}
  }
  if(play.id==='levels'){x=slot===2?7+Math.min(depth*1.2,36):slot===3?46-Math.min(depth,28):30;y=spot+Math.min(depth,[0,0,5,12,22][slot]);}
  if(play.id==='postwheel'){if(slot===2){x=7+Math.min(24,Math.max(0,depth-12));y=spot+Math.min(depth,40);}if(slot===4){x=36+Math.min(13,depth);y=spot+Math.max(2,Math.min(35,depth-5));}}
  if(play.id==='spot'){if(slot===2){x=7+Math.min(depth,13);y=spot+Math.min(depth,6);}if(slot===3){x=46;y=spot+Math.min(depth,3);}if(slot===4){x=36+Math.min(13,Math.max(0,depth-7));y=spot+Math.min(depth,22);}}
  if(play.id==='sweep'&&slot===4)x=44;
  return {x:clamp(x,3,50),y:Math.min(106,y)};
 }

// Full-team alignments can shift an eligible receiver. Ease the original route
// out of the actual starting stance instead of jumping to a seven-player origin.
export function routeFor(play,p,time,spot){
 const target=baseRoute(play,p,time,spot);if(!p.routeStart)return target;
 const start=baseRoute(play,p,0,spot),blend=Math.max(0,1-time*p.speed/12);
 return {x:target.x+(p.routeStart.x-start.x)*blend,y:target.y+(spot+p.routeStart.y-start.y)*blend};
}
