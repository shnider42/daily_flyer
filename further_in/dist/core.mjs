// FURTHER IN — deterministic simulation; rendering, input and sound are adapters.
export const VERSION='0.2.0';
export const CELL=2.4;
// IDs are persistent save identities. The original final floor deliberately stays 3.
export const LEVEL_ORDER=Object.freeze([1,2,4,5,6,3]);
export const validLevel=level=>Number.isInteger(level)&&LEVEL_ORDER.includes(level);
export const floorNumber=level=>LEVEL_ORDER.indexOf(level)+1;
export const nextLevel=level=>validLevel(level)?LEVEL_ORDER[LEVEL_ORDER.indexOf(level)+1]??null:null;
export const TITLES=['','The same way out','The lights are still on','Somewhere beautiful','The water remembers','The quiet shift','Last service'];
export const PATTERN=[1,2,3,1];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function rng(seed){let a=seed>>>0;const random=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};random.getState=()=>a>>>0;random.setState=value=>{a=value>>>0;};return random;}
const p=(x,z)=>({x:(x+.5)*CELL,z:(z+.5)*CELL});
export function grid(w,h){return Array.from({length:h},()=>Array(w).fill(1));}
function rect(g,x,z,w,h){for(let j=z;j<z+h;j++)for(let i=x;i<x+w;i++)if(j>0&&j<g.length-1&&i>0&&i<g[0].length-1)g[j][i]=0;}
function line(g,a,b){rect(g,Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0])+1,Math.abs(a[1]-b[1])+1);}

const sign=(x,z,text,yaw=0)=>({...p(x,z),kind:'sign',text,yaw});
const control=(x,z,id,label,controlType)=>({...p(x,z),kind:'control',id,label,controlType,active:false});
const refuge=(x,z,index,radius=2.6)=>({...p(x,z),index,radius});
function setGate(s,open){
  for(const cell of s.gate||[])s.map[cell.z][cell.x]=open?0:1;
  const exit=s.items.find(item=>item.kind==='exit');
  if(exit)exit.locked=!open;
  s.revision++;
}

// A quiet landing after the yellow rooms. The route is visible before it is usable.
function drainage(s){
  const g=grid(23,29);
  rect(g,10,3,3,24);rect(g,8,22,7,5);rect(g,8,2,7,4);
  rect(g,3,17,4,5);line(g,[6,19],[11,19]);
  rect(g,16,17,4,5);line(g,[12,19],[16,19]);
  rect(g,3,8,5,5);line(g,[7,10],[11,10]);
  s.map=g;s.player={...p(11,25),yaw:0,pitch:0};s.doors=[];
  s.gate=[10,11,12].map(x=>({x,z:6}));
  s.puzzle={kind:'drain',progress:0,water:1,solved:false};
  s.waterAreas=[{...p(11,14),width:CELL*2.8,depth:CELL*14}];
  s.items=[
    {...p(9,24),kind:'note',text:'DRAINAGE / NIGHT PROCEDURE\n\nReturn line 02. Sump 01. Overflow 03.\nWait for each wheel to catch before opening the next.\n\nIf the water returns to the line, start again.\nThe northern door opens only when the channel is empty.'},
    control(4,19,1,'SUMP 01','valve'),control(18,19,2,'RETURN 02','valve'),control(5,9,3,'OVERFLOW 03','valve'),
    {...p(11,3),kind:'exit',label:'Open service door',locked:true},
  ];
  s.props=[
    sign(11,22,'DRAINAGE\nNORTH ACCESS'),sign(4,18,'SUMP\n01'),sign(18,18,'RETURN\n02'),sign(5,8,'OVERFLOW\n03'),
    {...p(13,24),kind:'bench'},{...p(9,26),kind:'cabinet'},
  ];
  setGate(s,false);
}

// The generator is both an audible and a visible clock. Side rooms are always safe.
function records(s){
  const g=grid(25,33);
  rect(g,11,2,3,28);rect(g,9,1,7,4);
  for(const [x,z,cx,cz]of[[5,26,9,27],[5,18,9,20],[15,10,15,12],[5,4,9,6]]){
    rect(g,x,z,5,5);line(g,[cx,cz],[12,cz]);
  }
  s.map=g;s.player={...p(7,28),yaw:0,pitch:0};s.doors=[];
  s.gate=[9,10,11,12,13,14,15].map(x=>({x,z:4}));
  s.puzzle={kind:'quiet',hum:true,warning:false,cycle:0,awareness:0,breakers:0,solved:false,warned:false};
  s.quietHall={minX:CELL*11,maxX:CELL*14,minZ:CELL*4,maxZ:CELL*30};
  s.refuges=[refuge(7,28,0,3.5),refuge(7,20,1,3.5),refuge(17,12,2,3.5),refuge(7,6,3,3.5)];
  s.checkpoint={...s.player};s.checkpointIndex=0;
  s.items=[
    {...p(6,27),kind:'note',text:'NIGHT SHIFT / RECORDS\n\nThe generator runs for seven seconds, then rests for four.\nGreen lamps: move. Amber: it is about to stop.\nWhen the lamps go dark, stop walking or step into a lit office.\n\nBoth branch breakers must be latched. Either order.\nSomeone still listens in the corridor.'},
    control(6,19,1,'WEST BREAKER','breaker'),control(18,11,2,'EAST BREAKER','breaker'),
    {...p(12,2),kind:'exit',label:'Open records exit',locked:true},
  ];
  s.props=[sign(8,26,'RECORDS\nQUIET HOURS'),sign(7,18,'WEST BRANCH'),sign(17,10,'EAST BRANCH'),sign(7,4,'PLEASE WAIT HERE')];
  for(const [x,z]of[[5,29],[9,29],[5,21],[9,21],[15,13],[19,13],[5,7],[9,7]])s.props.push({...p(x,z),kind:'cabinet'});
  for(const room of s.refuges)s.props.push({...room,z:room.z+1.25,kind:'bench'});
  setGate(s,false);
}

// A short, intermittent crossing. Light pools have the same bounds as the simulation.
function servicePassage(s){
  const g=grid(19,41);
  rect(g,8,2,3,37);rect(g,7,1,5,5);
  for(const [x,z,cx,cz]of[[4,32,7,34],[11,22,11,24],[4,12,7,14],[11,3,11,5]]){
    rect(g,x,z,4,5);line(g,[cx,cz],[9,cz]);
  }
  s.map=g;s.player={...p(9,37),yaw:0,pitch:0};s.doors=[];
  s.puzzle={kind:'inspection',cleared:0,solved:false};
  s.refuges=[refuge(9,37,0,1.5),refuge(6,34,1),refuge(12,24,2),refuge(6,14,3),refuge(12,5,4)];
  s.checkpoint={...s.player};s.checkpointIndex=0;s.exposure=0;
  s.inspections=[29,19,9].map((z,index)=>({
    ...p(9,z),width:CELL*3,depth:CELL*1.4,period:[9,10.5,8.5][index],offset:[0,3.2,5.1][index],
    onDuration:3.8,active:false,warning:false,passed:false,index,
  }));
  s.items=[
    {...p(8,36),kind:'note',text:'LAST SERVICE\n\nWait behind the painted line while the inspection lamps are lit.\nAmber means the next inspection is about to begin.\nCross when the light goes out. The side alcoves are not inspected.\n\nIf they send you back, the waiting area will remember you.'},
    {...p(9,2),kind:'exit',label:'Take the last service',locked:true},
  ];
  s.props=[sign(9,35,'LAST SERVICE\nWAIT BEHIND THE LINE'),sign(9,26,'INSPECTION 02'),sign(9,16,'INSPECTION 03'),sign(9,4,'ONE PASSENGER')];
  for(const r of s.refuges.slice(1))s.props.push({...r,z:r.z+1.25,kind:'bench'});
  updateInspectionLights(s);
}

function operateControl(s,t){
  if(t.active){s.events.push({type:'caption',text:'It is already latched.'});return true;}
  if(s.level===4){
    const order=[2,1,3];
    if(t.id!==order[s.puzzle.progress]){
      s.puzzle.progress=0;
      for(const item of s.items)if(item.kind==='control')item.active=false;
      s.events.push({type:'valve'},{type:'caption',text:'The pipes knock. The water returns to the line.'});
    }else{
      t.active=true;s.puzzle.progress++;s.events.push({type:'valve'});
      if(s.puzzle.progress===order.length){
        s.puzzle.solved=true;setGate(s,true);
        s.disturbance={...p(11,10),until:s.time+4.5};
        s.events.push({type:'drain'},{type:'caption',text:'Water runs beneath the floor. The northern lock releases.'},{type:'checkpoint'});
      }else s.events.push({type:'caption',text:'The wheel catches. The water drops below another mark.'},{type:'checkpoint'});
    }
    s.revision++;return true;
  }
  if(s.level===5){
    t.active=true;s.puzzle.breakers++;s.events.push({type:'latch'},{type:'checkpoint'});
    if(s.puzzle.breakers===2){s.puzzle.solved=true;setGate(s,true);s.events.push({type:'caption',text:'The far lock clicks. Both branches are live.'});}
    else s.events.push({type:'caption',text:'One branch is live. The other side is still dark.'});
    s.revision++;return true;
  }
  return false;
}

function updateRefuge(s){
  for(const r of s.refuges||[]){
    if(distance(s.player,r)<r.radius&&r.index>s.checkpointIndex){
      s.checkpointIndex=r.index;s.checkpoint={x:r.x,z:r.z,yaw:0,pitch:0};
      s.events.push({type:'safe'},{type:'checkpoint'});
    }
  }
}
function returnToRefuge(s,text){
  if(s.transition)return;
  s.transition={kind:'reset',time:0,duration:.7};
  s.events.push({type:'attention'},{type:'caption',text});
}
function updateInspectionLights(s){
  for(const light of s.inspections){
    const phase=(s.time+light.offset)%light.period;
    light.active=phase<light.onDuration;
    light.warning=phase>=light.period-.8;
  }
}
function updateNewFloors(s,dt){
  if(s.level===4){
    const wanted=1-s.puzzle.progress/3;
    s.puzzle.water+=(wanted-s.puzzle.water)*Math.min(1,dt*.8);
    return;
  }
  if(s.level!==5&&s.level!==6)return;
  updateRefuge(s);
  if(s.level===5){
    const q=s.puzzle,previous=q.hum;q.cycle=s.time%11;q.hum=q.cycle<7;q.warning=q.cycle>=5.5&&q.cycle<7;
    if(q.hum!==previous)s.events.push({type:q.hum?'generator-on':'generator-off'},{type:'caption',text:q.hum?'[The generator turns over. The corridor lamps come on.]':'[The generator stops. The corridor lamps go dark.]'});
    const p=s.player,h=s.quietHall,inHall=p.x>h.minX&&p.x<h.maxX&&p.z>h.minZ&&p.z<h.maxZ;
    if(!q.hum&&inHall&&s.moving>.2&&s.settle<=0)q.awareness=Math.min(1,q.awareness+dt*(s.run?.7:.47));
    else q.awareness=Math.max(0,q.awareness-dt*.58);
    if(q.awareness>.32&&!q.warned){q.warned=true;s.events.push({type:'attention'},{type:'caption',text:'[A chair scrapes behind the wall. Your steps are too loud.]'});}
    if(q.awareness<.08)q.warned=false;
    if(q.awareness>=1)returnToRefuge(s,'The lights return. You are back in the waiting room. The breakers are still latched.');
    return;
  }
  updateInspectionLights(s);
  let lit=false;
  for(const light of s.inspections){
    const inside=Math.abs(s.player.x-light.x)<light.width/2&&Math.abs(s.player.z-light.z)<light.depth/2;
    if(inside&&light.active)lit=true;
    if(!light.passed&&s.player.z<light.z-light.depth/2-.2){
      light.passed=true;s.puzzle.cleared++;s.events.push({type:'safe'},{type:'checkpoint'});
    }
  }
  s.exposure=lit&&s.settle<=0?s.exposure+dt:Math.max(0,s.exposure-dt*2);
  if(s.exposure>.6)returnToRefuge(s,'[The inspection bell.] You are back at the last waiting alcove.');
  if(s.puzzle.cleared===3&&!s.puzzle.solved){
    s.puzzle.solved=true;s.items.find(item=>item.kind==='exit').locked=false;s.revision++;
    s.events.push({type:'latch'},{type:'caption',text:'The waiting light at the far door goes out. Everything is quiet.'},{type:'checkpoint'});
  }
}
export function openAt(g,x,z,r=.24){for(const dx of [-r,r])for(const dz of [-r,r]){const col=Math.floor((x+dx)/CELL),row=Math.floor((z+dz)/CELL);if(g[row]?.[col]!==0)return false;}return true;}
export function pathBetween(g,start,end){const sx=Math.floor(start.x/CELL),sz=Math.floor(start.z/CELL),ex=Math.floor(end.x/CELL),ez=Math.floor(end.z/CELL);if(g[sz]?.[sx]!==0||g[ez]?.[ex]!==0)return[];const key=(x,z)=>z*g[0].length+x;const q=[[sx,sz]],prev=new Map([[key(sx,sz),null]]);for(let i=0;i<q.length;i++){const[x,z]=q[i];if(x===ex&&z===ez){const out=[];let k=key(x,z);while(k!==null){out.push(p(k%g[0].length,Math.floor(k/g[0].length)));k=prev.get(k);}return out.reverse();}for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(g[nz]?.[nx]===0&&!prev.has(k)){prev.set(k,key(x,z));q.push([nx,nz]);}}}return[];}
function levelOne(s){const g=grid(23,25);rect(g,9,18,5,5);rect(g,11,6,1,15);rect(g,4,6,15,1);rect(g,11,2,1,5);rect(g,7,10,5,1);s.map=g;s.player={...p(11,21),yaw:0,pitch:0};s.doors=[{...p(4,6),id:1,yaw:Math.PI/2},{...p(11,2),id:2,yaw:0},{...p(18,6),id:3,yaw:-Math.PI/2}];s.items=[{...p(9,20),kind:'note',text:'One knock. Then two. Then three. Then one again.\nThat was how she let me know it was her.'}];s.props=[{...p(10,19),kind:'chair'},{...p(12,20),kind:'cabinet'}];}
function levelTwo(s){const g=grid(31,31);for(let z=2;z<29;z+=6)for(let x=2;x<29;x+=6){rect(g,x,z,4,4);if(x<26)rect(g,x+4,z+1,3,1);if(z<26)rect(g,x+1,z+4,1,3);} // Every room connected; partitions preserve a legible escape route.
for(let i=0;i<18;i++){const x=2+Math.floor(s.random()*5)*6,z=2+Math.floor(s.random()*5)*6;g[z+1][x+1]=1;}
s.map=g;s.player={...p(3,27),yaw:0,pitch:0};s.doors=[];const candidates=[p(3,3),p(27,3),p(27,15),p(15,3),p(27,27)];s.hole=candidates[Math.floor(s.random()*candidates.length)];for(const pt of [s.player,s.hole,...candidates])s.map[Math.floor(pt.z/CELL)][Math.floor(pt.x/CELL)]=0;s.items=[{...p(4,26),kind:'tool',text:'FIELD RESONATOR\nHold toward the disturbance. Allow it to cool.'}];s.props=[{...p(4,27),kind:'cabinet'}];s.chaseAt=45+s.random()*25;s.explored=0;s.chasing=false;s.entity=null;s.tool=false;s.pathClock=0;s.stunCount=0;}
function garden(s){const g=grid(19,21);rect(g,2,2,15,17);s.map=g;s.player={...p(9,16),yaw:0,pitch:0};s.doors=[];s.items=[];s.props=[];s.phase='garden';s.phaseTime=0;}
function darkRoom(s){const g=grid(23,25),r=s.random;rect(g,10,19,3,4);let spine=9+Math.floor(r()*5),junction=5+Math.floor(r()*6);line(g,[11,20],[spine,20]);line(g,[spine,20],[spine,junction]);let left=3+Math.floor(r()*3),right=17+Math.floor(r()*3);line(g,[left,junction],[right,junction]);const front=2+Math.floor(r()*2);line(g,[spine,junction],[spine,front]);if(r()>.5)rect(g,spine-1,junction+3,3,3);s.map=g;s.player={...p(11,21),yaw:0,pitch:0};s.doors=[{...p(left,junction),id:1,yaw:Math.PI/2},{...p(right,junction),id:2,yaw:-Math.PI/2},...(r()>.27?[{...p(spine,front),id:3,yaw:0}]:[])];s.items=s.choices===2?[{...p(spine,junction+2),kind:'note',text:'Every time I ran, it followed.\nEvery time I looked away, it came closer.\nWhen I was still, so was it.'}]:[];s.props=[{...p(11,22),kind:'closedDoor'}];s.phase='doors';s.phaseTime=0;s.roomVariant=Math.floor(r()*3);s.closedDoorTimer=1.5;}
export function finalHall(s){const g=grid(7,150);rect(g,2,1,3,148);s.map=g;s.player={...p(3,120),yaw:0,pitch:0};s.doors=[];s.items=[];s.props=[];s.transition=null;s.phase='ghost';s.phaseTime=0;s.moving=0;s.entity={...p(3,126),stunned:0};s.stare=0;s.chargeDistance=0;s.recentCharge=0;s.events.push({type:'ghost'});s.revision++;}
export function createGame(level=1,seed=Date.now()){if(!validLevel(level))throw new RangeError('Unknown floor');const s={level,seed:seed>>>0,random:rng(seed),status:'playing',phase:'explore',time:0,phaseTime:0,revision:1,events:[],loops:0,pattern:0,choices:0,ghostDoor:7,flash:0,glimpse:false,glimpseUntil:0,nextNoise:28,transition:null,tool:false,cooldown:0,stunCount:0,stamina:1,medal:false,moving:0,run:false,step:0,hasNote:false,settle:0};s.ghostDoor=7+Math.floor(s.random()*3);if(level===1)levelOne(s);if(level===2)levelTwo(s);if(level===3)garden(s);if(level===4)drainage(s);if(level===5)records(s);if(level===6)servicePassage(s);return s;}
export function target(s){if(s.status!=='playing'||s.transition||s.phase==='garden'||s.phase==='blackout'||s.phase==='ghost')return null;const opts=[...s.doors.map(d=>({...d,kind:'door'})),...s.items];if(s.level===2&&s.chasing)opts.push({...s.hole,kind:'hole'});return opts.filter(o=>{const d=distance(o,s.player);return d<2.7&&lineOfSight(s.map,s.player,o)&&(d<.9||Math.cos(Math.atan2(o.x-s.player.x,s.player.z-o.z)-s.player.yaw)>.35);}).sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0]||null;}
export function interact(s){const t=target(s);if(!t)return false;if(t.kind==='note'){s.hasNote=true;s.events.push({type:'note',text:t.text});return true;}if(t.kind==='tool'){s.tool=true;s.items=s.items.filter(i=>i.kind!=='tool');s.events.push({type:'pickup',text:t.text});s.revision++;return true;}if(t.kind==='control')return operateControl(s,t);if(t.kind==='exit'){if(t.locked){s.events.push({type:'caption',text:'The lock has not released.'});return true;}s.transition={time:0,duration:1.2,kind:'level',level:nextLevel(s.level)};s.events.push({type:'transit'});return true;}if(t.kind==='hole'){s.transition={time:0,duration:1.2,kind:'level',level:nextLevel(s.level)};s.events.push({type:'fall'});return true;}if(t.kind==='door'){s.transition={time:0,duration:.65,kind:s.level===1?'loop':'door',door:t.id};s.events.push({type:'door'});return true;}return false;}
export function beginChase(s){if(s.level!==2||s.chasing||s.status!=='playing')return;s.chasing=true;const free=[];for(let z=1;z<s.map.length-1;z++)for(let x=1;x<s.map[0].length-1;x++)if(s.map[z][x]===0){const pt=p(x,z),d=distance(pt,s.player);if(d>15&&d<23)free.push(pt);}let pos=free[Math.floor(s.random()*free.length)]||p(3,3);s.entity={...pos,stunned:1.8};s.path=[];s.events.push({type:'screech'});s.revision++;}
export function pulse(s){if(!s.tool||s.status!=='playing'||s.cooldown>0||s.transition)return false;s.cooldown=9;s.flash=.22;s.events.push({type:'pulse'});if(s.entity){const d=distance(s.entity,s.player),angle=Math.atan2(s.entity.x-s.player.x,s.player.z-s.entity.z);const faces=Math.cos(angle-s.player.yaw)>.65;const visible=lineOfSight(s.map,s.player,s.entity);if(s.level===2&&d<15&&faces&&visible){s.stunCount++;s.entity.stunned=Math.max(.55,2.9-s.stunCount*.65);s.events.push({type:'caption',text:s.stunCount>1?'It recovered faster this time.':'It stopped. Only for a moment.'});}else if(s.phase==='ghost'){s.stunCount++;s.events.push({type:'caption',text:'It does not even flinch.'});}}return true;}
export function lineOfSight(g,a,b){const n=Math.ceil(distance(a,b)*3);for(let i=1;i<n;i++){const f=i/n;if(!openAt(g,a.x+(b.x-a.x)*f,a.z+(b.z-a.z)*f,.05))return false;}return true;}
function move(s,dx,dz){const p=s.player;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));for(let i=0;i<steps;i++){if(openAt(s.map,p.x+dx/steps,p.z))p.x+=dx/steps;if(openAt(s.map,p.x,p.z+dz/steps))p.z+=dz/steps;}}
function lose(s,medal=false){s.medal=medal;s.status='lost';s.events.push({type:medal?'medal':'caught'});}
export function update(s,input={},rawDt=1/60){if(s.status!=='playing')return;const dt=clamp(rawDt,0,.05);s.time+=dt;s.phaseTime+=dt;s.settle=Math.max(0,s.settle-dt);s.cooldown=Math.max(0,s.cooldown-dt);s.flash=Math.max(0,s.flash-dt);s.closedDoorTimer=Math.max(0,(s.closedDoorTimer||0)-dt);if(s.transition){s.transition.time+=dt;if(s.transition.time>=s.transition.duration){const t=s.transition;s.transition=null;if(t.kind==='level'){s.status='next';s.nextLevel=t.level;}else if(t.kind==='reset'){s.player={...s.checkpoint};s.moving=0;s.exposure=0;s.stamina=1;s.settle=2;if(s.puzzle.kind==='quiet'){s.puzzle.awareness=0;s.puzzle.warned=false;}s.events.push({type:'checkpoint'});}else if(t.kind==='loop'){s.loops++;if(t.door===PATTERN[s.pattern])s.pattern++;else s.pattern=t.door===PATTERN[0]?1:0;if(s.pattern===PATTERN.length){s.status='next';s.nextLevel=2;}else{levelOne(s);s.revision++;s.events.push({type:'caption',text:s.pattern?'The rhythm almost feels familiar.':'That chair. This is the same room.'});}}else{s.choices++;s.events.push({type:'door-close'});if(s.choices>=s.ghostDoor)finalHall(s);else{darkRoom(s);s.revision++;s.events.push({type:'room',count:s.choices});}}}return;}
if(s.phase==='garden'&&s.phaseTime>4.8){s.phase='blackout';s.phaseTime=0;s.events.push({type:'cut'});return;}if(s.phase==='blackout'){if(s.phaseTime>2){darkRoom(s);s.revision++;s.events.push({type:'caption',text:'The warmth is gone.'});}return;}
const p=s.player;p.yaw+=(input.turn||0)*dt*2;p.pitch=clamp(p.pitch,-.8,.8);let forward=clamp(input.forward||0,-1,1),side=clamp(input.side||0,-1,1),mag=Math.hypot(forward,side);if(mag>1){forward/=mag;side/=mag;}s.run=!!input.run&&s.stamina>.03&&mag>.15;if(s.run)s.stamina=Math.max(0,s.stamina-dt*.09);else s.stamina=Math.min(1,s.stamina+dt*.12);const speed=s.run?4.8:2.8;const dx=(Math.sin(p.yaw)*forward+Math.cos(p.yaw)*side)*speed*dt,dz=(-Math.cos(p.yaw)*forward+Math.sin(p.yaw)*side)*speed*dt;const before={x:p.x,z:p.z};move(s,dx,dz);s.moving=distance(before,p)/Math.max(dt,.001);s.step+=s.moving*dt;
updateNewFloors(s,dt);
if(s.level===1){if(s.time>s.nextNoise){s.nextNoise=s.time+31+s.random()*26;s.events.push({type:'distant'});}if(!s.glimpse&&s.time>26&&p.z>CELL*10&&p.z<CELL*18&&Math.abs(Math.sin(p.yaw))<.2&&Math.cos(p.yaw)>.9){s.glimpse=true;s.glimpseUntil=s.time+.38;s.events.push({type:'glimpse'});}}
if(s.level===2){s.explored+=distance(before,p);if(!s.chasing&&(s.time>s.chaseAt&&s.explored>16||s.time>95))beginChase(s);if(s.chasing&&distance(p,s.hole)<.9){s.transition={time:0,duration:1.2,kind:'level',level:nextLevel(s.level)};s.events.push({type:'fall'});}if(s.entity){const e=s.entity;if(e.stunned>0)e.stunned-=dt;else{s.pathClock-=dt;if(s.pathClock<=0){s.path=pathBetween(s.map,e,p);s.pathClock=.5;}const node=s.path?.[1]||p;let d=distance(e,node);const speed=3.15+Math.min(1.35,s.stunCount*.28);if(d>0){e.x+=(node.x-e.x)/d*Math.min(d,speed*dt);e.z+=(node.z-e.z)/d*Math.min(d,speed*dt);}if(distance(e,p)<.82&&!s.transition)lose(s);}}}
if(s.phase==='ghost'){const e=s.entity,d=distance(e,p),bearing=Math.atan2(e.x-p.x,p.z-e.z),looking=Math.cos(bearing-p.yaw)>.94&&Math.abs(p.pitch)<.42;const still=s.moving<.075&&mag<.08;const toward=((p.x-before.x)*(e.x-before.x)+(p.z-before.z)*(e.z-before.z))/Math.max(d,.01);if(toward>.001&&s.run){s.chargeDistance+=toward;s.recentCharge=.45;}else s.recentCharge=Math.max(0,s.recentCharge-dt);if(d<.9){lose(s,s.chargeDistance>1.2&&s.recentCharge>0);return;}if(looking&&still){s.stare+=dt;if(s.stare>4.5){s.status='won';s.events.push({type:'release'});}}else{s.stare=Math.max(0,s.stare-dt*2);const speed=(s.phaseTime<1.8?1.4:5.6)+Math.min(s.phaseTime*.09,2.4)+s.stunCount*.3;const step=Math.min(d,speed*dt);if(d>0){e.x+=(p.x-e.x)/d*step;e.z+=(p.z-e.z)/d*step;}if(distance(e,p)<.9){lose(s,s.chargeDistance>1.2&&s.recentCharge>0);return;}}if(p.z<18*CELL){ // The corridor grows without changing relative distance.
const delta=90*CELL;p.z+=delta;e.z+=delta;}
}}
export function developerAction(s,action){
  if(action==='chase')beginChase(s);
  if(action==='hole'&&s.level===2){
    beginChase(s);
    const near=[[0,1.8],[0,-1.8],[1.8,0],[-1.8,0],[0,0]].map(([x,z])=>({x:s.hole.x+x,z:s.hole.z+z})).find(pt=>openAt(s.map,pt.x,pt.z));
    s.transition=null;s.player={...s.player,...near,yaw:Math.atan2(s.hole.x-near.x,near.z-s.hole.z),pitch:0};
    if(s.entity)s.entity.stunned=Math.max(s.entity.stunned,2.5);
  }
  if(action==='ghost'&&s.level===3)finalHall(s);
  if(action==='pattern'&&s.level===1){s.transition=null;s.pattern=3;s.player={...s.player,...p(5,6),yaw:-Math.PI/2};}
  if(action==='drain'&&s.level===4){
    s.transition=null;s.puzzle.progress=3;s.puzzle.water=0;s.puzzle.solved=true;
    for(const item of s.items)if(item.kind==='control')item.active=true;
    setGate(s,true);s.player={...s.player,...p(11,4),yaw:0,pitch:0};
  }
  if(action==='breakers'&&s.level===5){
    s.transition=null;s.puzzle.breakers=2;s.puzzle.solved=true;
    for(const item of s.items)if(item.kind==='control')item.active=true;
    setGate(s,true);const r=s.refuges.at(-1);
    s.player={x:r.x,z:r.z,yaw:Math.PI/2,pitch:0};s.checkpoint={...s.player};s.checkpointIndex=r.index;s.settle=2;
  }
  if(action==='transit'&&s.level===6){
    s.transition=null;for(const light of s.inspections)light.passed=true;
    s.puzzle.cleared=3;s.puzzle.solved=true;s.items.find(item=>item.kind==='exit').locked=false;
    const r=s.refuges.at(-1);s.player={x:r.x,z:r.z,yaw:-Math.PI/2,pitch:0};s.checkpoint={...s.player};s.checkpointIndex=r.index;s.settle=2;
  }
  s.revision++;
}
