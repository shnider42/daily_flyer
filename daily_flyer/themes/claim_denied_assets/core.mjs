// Claim Denied: deterministic shared simulation. Coordinates follow the Breach contract.
export const VERSION = '0.2.0';
export const PLAYER_IDS = ['p1','p2','p3','p4'];
export const WEAPONS = {
  smg:{name:'Fine Print',damage:19,mag:40,reserve:240,delay:.065,reload:1.55,range:28,pellets:1,spread:.033},
  marksman:{name:'Final Notice',damage:125,mag:8,reserve:64,delay:.85,reload:2.2,range:65,pellets:1,spread:.003},
  lmg:{name:'Golden Parachute',damage:36,mag:75,reserve:225,delay:.12,reload:3.6,range:48,pellets:1,spread:.027},
  pistol: {name:'Appeal .45',damage:38,mag:12,reserve:96,delay:.28,reload:1.25,range:38,pellets:1,spread:.012},
  shotgun: {name:'Severance',damage:25,mag:6,reserve:42,delay:.8,reload:2,range:22,pellets:7,spread:.085},
  carbine: {name:'Counteroffer',damage:30,mag:28,reserve:168,delay:.105,reload:1.65,range:45,pellets:1,spread:.02},
};
import {WINDOWS,OBSTACLES,STATIONS,MAPS,mapFor,floorAt,upperDeck,stairAt} from './world.mjs';
export {WINDOWS,OBSTACLES,STATIONS,MAPS,mapFor,floorAt,upperDeck} from './world.mjs';
export const WEAPON_ORDER=['pistol','shotgun','carbine','smg','marksman','lmg'];
export const ENEMIES = {
  compliance:{name:'Compliance Officer',health:230,speed:.64,damage:19,board:22,reward:190},
  collector:{name:'Debt Collector',health:130,speed:1,damage:24,board:18,reward:150},
  counsel:{name:'Legal Counsel',health:105,speed:.68,damage:16,board:14,reward:180},
  broker:{name:'Benefits Broker',health:150,speed:.64,damage:10,board:12,reward:220},
  adjuster:{name:'Claims Adjuster',health:85,speed:.72,damage:14,board:15,reward:90},
  runner:{name:'Fast-track VP',health:65,speed:1.55,damage:12,board:11,reward:110},
  auditor:{name:'Senior Auditor',health:200,speed:.58,damage:22,board:26,reward:160},
  chairman:{name:'The Chairman',health:600,speed:.48,damage:30,board:45,reward:400},
};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function canStand(x,z,r=.28,map=mapFor(),y=0) {
 return Math.abs(x)<map.halfX-.22-r&&Math.abs(z)<map.halfZ-.22-r&&!map.obstacles.some(o=>Math.abs((o.y||0)-y)<1&&Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);
}
export function move(actor,dx,dz,map=mapFor()) {
 for(const [x,z] of [[actor.x+dx,actor.z],[null,actor.z+dz]]){
  const nx=x??actor.x,y=floorAt(map,nx,z,actor.y||0);
  if(Number.isFinite(y)&&Math.abs(y-(actor.y||0))<.45&&canStand(nx,z,.28,map,y)){actor.x=nx;actor.z=z;actor.y=y;}
 }
}
export function clearSight(a,b,{bullets=false,y=(a.y||0)+1.45,pitch=0,map=mapFor()}={}) {
 const length=dist(a,b),steps=Math.max(2,Math.ceil(length/.12));
 for(let i=1;i<steps;i++){
  const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,h=bullets?y+Math.tan(pitch)*length*t:(a.y||0)+1.1+((b.y||0)-(a.y||0))*t;
  if(map.obstacles.some(o=>Math.abs(x-o.x)<o.w/2&&Math.abs(z-o.z)<o.d/2&&h>(o.y||0)&&(!bullets||h<(o.y||0)+o.h)))return false;
  if(upperDeck(map,x,z)&&h>3.42&&h<3.65)return false;
  if(map.stairs.length&&h>3.6&&h<4.64&&((Math.abs(Math.abs(x)-5)<.08&&Math.abs(z)<5)||(Math.abs(Math.abs(z)-5)<.08&&Math.abs(x)<5)))return false;
  if(Math.abs(Math.abs(x)-map.halfX)<.19&&Math.abs(z)<map.halfZ+.15||Math.abs(Math.abs(z)-map.halfZ)<.19&&Math.abs(x)<map.halfX+.15){
   const floor=h>3.6&&map.stairs.length?3.6:0;
   if(!bullets||h-floor<.8||h-floor>2.65||!map.windows.some(w=>Math.abs(x-w.x)<(w.nx?.4:1.25)&&Math.abs(z-w.z)<(w.nz?.4:1.25)))return false;
  }
 }
 return true;
}
export function wavePlan(wave,players=1,difficulty='standard') {
  return {count:Math.floor((6+wave*3)*(1+.55*(players-1))),health:1+(wave-1)*.12,
    speed:Math.min(1.8,1+(wave-1)*.035),interval:Math.max(.48,2.4-wave*.12),
    damage:difficulty==='relaxed'?.7:difficulty==='hard'?1.25:1,cap:Math.min(40,12+wave*2+players*2)};
}
function makePlayer(id,i) {
  return {id,y:0,x:-1.4+i*.9,z:2,angle:Math.PI,pitch:0,health:100,down:false,dead:false,bleed:0,
    weapon:'pistol',owned:['pistol'],ammo:{pistol:12},reserve:{pistol:96},credits:300,kills:0,repairs:0,revives:0,
    cooldown:0,reloading:0,damageAt:-100,repairTime:0,repairId:null,repairEarned:0,reviveProgress:0,interactHeld:false,invulnerable:2};
}
export class ClaimGame {
  constructor({players=['p1'],seed=17,difficulty='standard',mission='everwell-house'}={}) {
    this.map=mapFor(mission);this.options={mission:this.map.id,players:[...players].slice(0,4),seed,difficulty};this.seed=seed>>>0;this.events=[];this.serial=0;
    this.state={mapId:this.map.id,projectiles:[],status:'ready',time:0,wave:0,phase:'prep',timer:12,remaining:0,spawnTimer:0,spawned:0,kills:0,
      players:this.options.players.map(makePlayer),windows:this.map.windows.map(w=>({...w,health:120})),enemies:[],message:'Board up. The board is coming.',lastBreach:''};
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  emit(type,data={}){this.events.push({type,...data});}
  drainEvents(){return this.events.splice(0);}
  networkSnapshot(){return structuredClone(this.state);}
  start(){this.state.status='playing';}
  pause(){if(this.state.status==='playing')this.state.status='paused';}
  resume(){if(this.state.status==='paused')this.state.status='playing';}
  restart(){const g=new ClaimGame(this.options);Object.assign(this,g);this.start();}
  restartCheckpoint(){return false;}
  player(id){return this.state.players.find(p=>p.id===id);}
  switchWeapon(id,weapon){const p=this.player(id);if(!p||p.down||p.dead)return;const next=weapon||p.owned[(p.owned.indexOf(p.weapon)+1)%p.owned.length];if(p.owned.includes(next)){p.weapon=next;p.reloading=0;}}
  reload(p){const w=WEAPONS[p.weapon];if(p.reloading<=0&&p.ammo[p.weapon]<w.mag&&p.reserve[p.weapon]>0){p.reloading=w.reload;this.emit('reload',{playerId:p.id});}}
  beginWave(){
    const s=this.state;s.wave++;s.phase='wave';s.spawned=0;s.spawnTimer=.6;s.plan=wavePlan(s.wave,s.players.length,this.options.difficulty);s.remaining=s.plan.count;
    for(const p of s.players)p.repairEarned=0;
    s.message=s.wave%5===0?'Board meeting. The Chairman has arrived.':s.wave===3?'Fast-track VPs: they do not wait in line.':s.wave===4?'Senior Auditors: heavier suits. Heavier hits.':s.wave===6?'Debt Collectors: watch for the charge.':s.wave===7?'Compliance Officers: flank the shields.':s.wave===8?'Legal Counsel: dodge the paperwork.':s.wave===9?'Benefits Brokers: stop their healing aura.':'Your appeal has been received.';
    this.emit('wave',{wave:s.wave,text:s.message});
  }
  spawn(){
    const s=this.state,win=s.windows[Math.floor(this.random()*s.windows.length)];
    const specials=['collector','compliance','counsel','broker'];
    const type=s.wave>=6&&s.spawned%4===2?specials[(s.spawned+s.wave)%4]:s.wave%5===0&&s.spawned===0?'chairman':s.wave>=4&&s.spawned%5===3?'auditor':s.wave>=3&&s.spawned%3===1?'runner':'adjuster';
    const spec=ENEMIES[type],side=(this.random()-.5)*1.2,d=8+this.random()*5;
    s.enemies.push({id:'e'+(++this.serial),type,y:0,ability:0,charge:0,x:win.x+win.nx*d+win.nz*side,z:win.z+win.nz*d+win.nx*side,
      angle:0,health:spec.health*s.plan.health,maxHealth:spec.health*s.plan.health,phase:'approach',windowId:win.id,attack:1,climb:0,hit:0,path:[],pathTimer:0});
    s.spawned++;s.remaining--;
  }
  shoot(p){
    const w=WEAPONS[p.weapon];if(p.cooldown>0||p.reloading>0)return;
    if(p.ammo[p.weapon]<=0){this.reload(p);return;}
    p.ammo[p.weapon]--;p.cooldown=w.delay;this.emit('shot',{playerId:p.id,weapon:p.weapon,x:p.x,z:p.z,angle:p.angle,pitch:p.pitch});
    for(let pellet=0;pellet<w.pellets;pellet++) {
      const angle=p.angle+(this.random()-.5)*w.spread*2,pitch=p.pitch+(this.random()-.5)*w.spread;
      let hit=null,nearest=w.range;
      for(const e of this.state.enemies){
        if(e.health<=0)continue;const d=dist(p,e),delta=wrap(Math.atan2(e.x-p.x,-(e.z-p.z))-angle),width=e.type==='chairman'?.65:e.type==='auditor'?.48:.38;
        const y=(p.y||0)+1.6+Math.tan(pitch)*d,base=e.y||0,top=base+(e.type==='chairman'?2.7:2.1);
        if(d<nearest && Math.abs(Math.sin(delta)*d)<width && Math.cos(delta)>0 && y>base+.12 && y<top && clearSight(p,e,{bullets:true,y:(p.y||0)+1.6,pitch,map:this.map})) {hit={e,head:y>top-.5};nearest=d;}
      }
      if(hit){const e=hit.e;e.health-=w.damage*(e.type==='compliance'&&Math.cos(wrap(Math.atan2(p.x-e.x,-(p.z-e.z))-e.angle))>.35&&!hit.head?.35:1)*(hit.head?1.65:1)*(p.weapon==='shotgun'?Math.max(.3,1-nearest/30):1);e.hit=.12;this.emit('hit',{playerId:p.id,head:hit.head});
        if(e.health<=0){p.kills++;this.state.kills++;p.credits+=ENEMIES[e.type].reward;this.emit('kill',{playerId:p.id,x:e.x,y:e.y||0,z:e.z,type:e.type});}}
    }
  }
  context(id){
    const p=this.player(id);if(!p||p.down||p.dead)return null;
    const mate=this.state.players.find(q=>q.id!==id&&q.down&&!q.dead&&dist(p,q)<1.8&&Math.abs((p.y||0)-(q.y||0))<.7&&clearSight(p,q,{map:this.map}));
    if(mate)return {type:'revive',id:mate.id,text:'Hold to revive teammate',progress:mate.reviveProgress/3};
    const win=this.state.windows.find(w=>dist(p,w)<2.15&&(p.y||0)<.7&&w.health<120);
    if(win)return {type:'repair',id:win.id,text:'Hold to repair '+win.name,progress:p.repairTime/.85};
    const station=this.map.stations.find(s=>dist(p,s)<1.8&&Math.abs((p.y||0)-(s.y||0))<.7&&clearSight(p,s,{map:this.map}));
    if(station){const owned=p.owned.includes(station.id);return {type:'buy',id:station.id,text:owned?'Already equipped':station.name+' · '+station.cost+' credits',cost:station.cost};}
    return null;
  }
  interact(id){const p=this.player(id);if(p&&!p.down&&!p.dead)this.use(p,.1,true);}
  use(p,dt,pressed){
    const c=this.context(p.id);if(!c){p.repairTime=0;p.repairId=null;return;}
    if(c.type==='revive'){const q=this.player(c.id);q.reviveProgress+=dt;q.reviving=true;if(q.reviveProgress>=3){q.health=65;q.down=false;q.bleed=0;q.reviveProgress=0;q.invulnerable=2;p.revives++;p.credits+=100;this.emit('revive',{playerId:q.id});}}
    if(c.type==='repair'){
      if(p.repairId!==c.id){p.repairId=c.id;p.repairTime=0;}p.repairTime+=dt;
      if(p.repairTime>=.85){p.repairTime=0;const w=this.state.windows.find(w=>w.id===c.id);w.health=Math.min(120,w.health+40);p.repairs++;if(p.repairEarned<180){p.credits+=15;p.repairEarned+=15;}this.emit('repair',{windowId:w.id,playerId:p.id});}
    }
    if(c.type==='buy'&&pressed){
      const station=this.map.stations.find(v=>v.id===c.id);if(p.owned.includes(c.id))return;
      if(p.credits<c.cost){this.emit('message',{playerId:p.id,text:'Need '+(c.cost-p.credits)+' more credits.'});return;}
      if(c.id==='health'&&p.health===100){this.emit('message',{playerId:p.id,text:'Already at full health.'});return;}
      p.credits-=c.cost;
      if(c.id==='ammo')for(const id of p.owned){p.ammo[id]=WEAPONS[id].mag;p.reserve[id]=WEAPONS[id].reserve;}
      else if(c.id==='health')p.health=100;
      else{p.owned.push(c.id);p.weapon=c.id;p.ammo[c.id]=WEAPONS[c.id].mag;p.reserve[c.id]=WEAPONS[c.id].reserve;}
      p.reloading=0;this.emit('purchase',{playerId:p.id,text:station.name});
    }
  }
  hurt(p,damage){if(p.invulnerable>0||p.down||p.dead)return;p.health=Math.max(0,p.health-damage);p.damageAt=this.state.time;this.emit('hurt',{playerId:p.id});if(p.health===0){p.down=true;p.bleed=28;p.reviveProgress=0;this.emit('down',{playerId:p.id});}}
  pathTo(e,p){
    // Height-aware grid: stairs connect floors, atrium edges cannot be walked.
    const key=(x,z,y)=>x+','+z+','+Math.round(y*10),sx=Math.round(e.x),sz=Math.round(e.z),sy=floorAt(this.map,sx,sz,e.y||0);
    const start=[sx,sz,Number.isFinite(sy)?sy:(e.y||0)],queue=[start],seen=new Map([[key(...start),null]]);let found=null;
    for(let i=0;i<queue.length&&i<2400;i++){
      const [x,z,y]=queue[i];if(Math.hypot(x-p.x,z-p.z)<1.3&&Math.abs(y-(p.y||0))<.7){found=[x,z,y];break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
       const nx=x+dx,nz=z+dz,ny=floorAt(this.map,nx,nz,y),k=key(nx,nz,ny);
       if(Number.isFinite(ny)&&Math.abs(ny-y)<.51&&!seen.has(k)&&canStand(nx,nz,.32,this.map,ny)){seen.set(k,[x,z,y]);queue.push([nx,nz,ny]);}
      }
    }
    const path=[];while(found){path.unshift({x:found[0],z:found[1],y:found[2]});found=seen.get(key(...found));}return path.slice(1);
  }

  update(dt,inputs={}){
    const s=this.state;if(s.status!=='playing')return;dt=clamp(dt,0,.05);s.time+=dt;
    for(const p of s.players)p.reviving=false;
    for(const p of s.players){
      const input=inputs[p.id]||{};p.cooldown=Math.max(0,p.cooldown-dt);p.invulnerable=Math.max(0,p.invulnerable-dt);
      if(p.dead)continue;
      if(p.down){p.bleed-=dt;if(p.bleed<=0){p.dead=true;p.down=false;}continue;}
      if(Number.isFinite(input.angle))p.angle=wrap(input.angle);if(Number.isFinite(input.pitch))p.pitch=clamp(input.pitch,-.85,.85);
      const f=clamp(Number(input.forward)||0,-1,1),st=clamp(Number(input.strafe)||0,-1,1),norm=Math.max(1,Math.hypot(f,st)),speed=(input.sprint?3.7:2.8)*(p.weapon==='lmg'?.86:1)*dt/norm;
      move(p,(Math.sin(p.angle)*f+Math.cos(p.angle)*st)*speed,(-Math.cos(p.angle)*f+Math.sin(p.angle)*st)*speed,this.map);
      if(p.reloading>0){p.reloading-=dt;if(p.reloading<=0){const n=Math.min(WEAPONS[p.weapon].mag-p.ammo[p.weapon],p.reserve[p.weapon]);p.ammo[p.weapon]+=n;p.reserve[p.weapon]-=n;}}
      if(input.reload)this.reload(p);if(input.fire)this.shoot(p);
      if(input.use)this.use(p,dt,!p.interactHeld);else{p.repairTime=0;p.repairId=null;}p.interactHeld=!!input.use;
      if(s.time-p.damageAt>8)p.health=Math.min(100,p.health+dt*4);
    }
    for(const p of s.players)if(p.down&&!p.reviving)p.reviveProgress=0;
    if(s.players.every(p=>p.down||p.dead)){s.status='dead';this.emit('death',{wave:s.wave});return;}
    if(s.phase==='prep'){s.timer-=dt;if(s.timer<=0)this.beginWave();return;}
    s.spawnTimer-=dt;
    if(s.remaining>0&&s.spawnTimer<=0&&s.enemies.filter(e=>e.health>0).length<s.plan.cap){this.spawn();s.spawnTimer=s.plan.interval;}
    const living=s.players.filter(p=>!p.down&&!p.dead);
    for(const e of s.enemies){
      if(e.health<=0)continue;e.hit=Math.max(0,e.hit-dt);const def=ENEMIES[e.type],w=s.windows.find(w=>w.id===e.windowId);let speed=def.speed*s.plan.speed;
      e.ability=(e.ability||0)-dt;e.charge=Math.max(0,(e.charge||0)-dt);
      if(e.type==='broker')for(const other of s.enemies)if(other!==e&&other.health>0&&dist(e,other)<4&&Math.abs((e.y||0)-(other.y||0))<1)other.health=Math.min(other.maxHealth,other.health+dt*7);
      if(e.phase==='approach'){
        const target={x:w.x+w.nx*.75,z:w.z+w.nz*.75},d=dist(e,target);e.angle=Math.atan2(target.x-e.x,-(target.z-e.z));
        if(d<.15){e.phase='barricade';e.attack=.7;}else{const k=Math.min(d,speed*dt)/d;e.x+=(target.x-e.x)*k;e.z+=(target.z-e.z)*k;}
      }else if(e.phase==='barricade'){
        if(w.health<=0){e.phase='climb';e.climb=0;s.lastBreach=w.name;this.emit('breach',{windowId:w.id,text:w.name+' breached!'});}
        else if((e.attack-=dt)<=0){e.attack=1.3;w.health=Math.max(0,w.health-def.board*(1+s.wave*.025));this.emit('board',{windowId:w.id});}
      }else if(e.phase==='climb'){
        e.climb+=dt/1.5;e.x=w.x+w.nx*(.75-e.climb*2);e.z=w.z+w.nz*(.75-e.climb*2);
        if(e.climb>=1){e.phase='hunt';e.x=w.x-w.nx*1.3;e.z=w.z-w.nz*1.3;}
      }else{
        const p=living.reduce((a,b)=>dist(e,b)<dist(e,a)?b:a,living[0]);if(!p)continue;
        const d=dist(e,p);e.angle=Math.atan2(p.x-e.x,-(p.z-e.z));e.attack-=dt;
        if(e.type==='collector'&&d>1&&d<6&&Math.abs((e.y||0)-(p.y||0))<.7&&clearSight(e,p,{map:this.map})&&e.ability<=0){e.charge=1.1;e.ability=4;this.emit('charge',{x:e.x,z:e.z});}
        if(e.charge>0)speed*=2.7;
        if(e.type==='counsel'&&d>2&&d<13&&clearSight(e,p,{map:this.map})&&e.ability<=0){e.ability=3;const dy=(p.y||0)+1.1-((e.y||0)+1.4),length=Math.hypot(d,dy);s.projectiles.push({id:'b'+(++this.serial),x:e.x,y:(e.y||0)+1.4,z:e.z,vx:(p.x-e.x)/length*6,vy:dy/length*6,vz:(p.z-e.z)/length*6,life:3.5,damage:def.damage*s.plan.damage});}
        if(d<.95&&Math.abs((e.y||0)-(p.y||0))<.7&&clearSight(e,p,{map:this.map})){if(e.attack<=0){this.hurt(p,def.damage*s.plan.damage);e.attack=1.2;}}
        else {
          e.pathTimer-=dt;let target=p;
          if(Math.abs((e.y||0)-(p.y||0))>.6||!clearSight(e,p,{map:this.map})){if(e.pathTimer<=0){e.path=this.pathTo(e,p);e.pathTimer=1.4;}while(e.path.length&&dist(e,e.path[0])<.25)e.path.shift();target=e.path[0]||p;}
          const len=dist(e,target);if(len>.05){const k=Math.min(len,speed*dt)/len;move(e,(target.x-e.x)*k,(target.z-e.z)*k,this.map);}
        }
      }
    }
    for(const b of s.projectiles){b.life-=dt;const next={x:b.x+b.vx*dt,y:b.y+b.vy*dt,z:b.z+b.vz*dt};if(!clearSight(b,next,{bullets:true,y:b.y,pitch:Math.atan2(b.vy,Math.hypot(b.vx,b.vz)),map:this.map}))b.life=0;Object.assign(b,next);for(const p of living)if(dist(b,p)<.4&&b.y>(p.y||0)&&b.y<(p.y||0)+1.8){this.hurt(p,b.damage);b.life=0;break;}}
    s.projectiles=s.projectiles.filter(b=>b.life>0);
    s.enemies=s.enemies.filter(e=>e.health>0);
    if(s.remaining===0&&s.enemies.length===0){
      s.phase='prep';s.timer=22;s.message='Wave cleared. Repair, reload, regroup.';
      for(const [i,p] of s.players.entries()) {p.credits+=150+s.wave*10;p.reserve.pistol=Math.max(p.reserve.pistol,48);if(p.down||p.dead){Object.assign(p,{y:0,x:-1.4+i*.9,z:2,health:100,down:false,dead:false,bleed:0,invulnerable:3});}else p.health=Math.min(100,p.health+25);}
      this.emit('clear',{wave:s.wave});
    }
  }
}
