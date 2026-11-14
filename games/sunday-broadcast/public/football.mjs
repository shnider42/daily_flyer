export const WIDTH = 53.33;
export const TEAMS = [
  { name:'Boston Harbors', abbr:'BOS', color:0x234f79, trim:0xe7ba60, pants:0xc8d1d9, helmet:0x162b41 },
  { name:'Chicago Foundry', abbr:'CHI', color:0xa4472c, trim:0xffc78f, pants:0x202731, helmet:0x913722 }
];
export const PLAYS = [
  { name:'Slants', type:'PASS', detail:'Quick inside cuts', routes:[[[0,5],[11,15],[19,27]],[[0,5],[8,15],[13,28]],[[0,5],[-9,15],[-14,28]],[[0,5],[-11,15],[-18,26]]] },
  { name:'Four Verticals', type:'PASS', detail:'Stretch the safeties', routes:[[[0,10],[1,35]],[[0,10],[-2,35]],[[0,10],[2,35]],[[0,10],[-1,35]]] },
  { name:'Flood Right', type:'PASS', detail:'Three levels to the sideline', routes:[[[0,9],[9,21],[18,28]],[[0,11],[16,16]],[[0,3],[12,5]],[[0,10],[2,32]]] },
  { name:'Inside Zone', type:'RUN', detail:'Read the guard’s block', lane:3 },
  { name:'Sweep Left', type:'RUN', detail:'Get around the edge', lane:-18 },
  { name:'Field Goal', type:'KICK', detail:'Distance affects accuracy' },
  { name:'Punt', type:'KICK', detail:'Trade possession for field position' },
  { name:'Mesh', type:'PASS', detail:'Crossing routes against man', routes:[[[0,4],[24,7],[38,9]],[[0,7],[10,19],[10,28]],[[0,4],[-19,6],[-33,9]],[[0,10],[-12,19],[-14,28]]] },
  { name:'Play Action Boot', type:'PASS', detail:'Sell the handoff, throw behind the rush', fake:true, routes:[[[0,7],[16,14],[34,20]],[[0,9],[17,18],[32,24]],[[0,5],[14,6]],[[0,12],[-3,29]]] },
  { name:'Counter Right', type:'RUN', detail:'Start left, follow the pull right', lane:11, counter:true }
];
export const DEFENSE = [
  { name:'Cover 2', type:'ZONE', detail:'Two deep safeties', rush:4 },
  { name:'Cover 3', type:'ZONE', detail:'Protect against deep routes', rush:3 },
  { name:'Man Free', type:'MAN', detail:'Match receivers across the field', rush:4 },
  { name:'Edge Blitz', type:'BLITZ', detail:'Bring six, leave space underneath', rush:6 },
  { name:'Quarters', type:'ZONE', detail:'Four deep, concede short throws', rush:4 }
];
export const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
export const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const receivers = [-21,-11,10,21];
const AI_PASSES = [0,1,2,7,8];
const AI_RUNS = [3,4,9];
const QB = 5;
const RB = 6;
const LOB_SPEED = 23;
const BULLET_SPEED = 39;
const positions = [
  [-4.4,-.2,'LT',72],[-2.2,-.2,'LG',67],[0,-.2,'C',54],[2.2,-.2,'RG',75],[4.4,-.2,'RT',78],
  [0,-4.5,'QB',12],[-1,-7,'RB',28],...receivers.map((x,i)=>[x,-.6,'WR',[81,16,87,84][i]])
];
const front = [
  [-5,1.6,'DE',94],[-1.8,1.6,'DT',92],[1.8,1.6,'DT',96],[5,1.6,'DE',91],
  [-8,6,'LB',51],[0,5,'LB',55],[8,6,'LB',58],[-21,7,'CB',24],[21,7,'CB',27],[-8,17,'S',31],[8,17,'S',33]
];
const avatar = ([x,dy,role,num],spot,team,i) => ({x,y:spot+dy,origin:x,team,role,num,i,vx:0,vy:0,facing:0,down:false});
function move(p,x,y,speed,dt,response=11){
  const dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy);
  const step=Math.min(speed,d/dt);
  const vx=d>.001?dx/d*step:0,vy=d>.001?dy/d*step:0;
  const blend=Math.min(1,dt*response);
  p.vx+=(vx-p.vx)*blend;
  p.vy+=(vy-p.vy)*blend;
  p.x=clamp(p.x+p.vx*dt,-28.5,28.5);
  p.y=clamp(p.y+p.vy*dt,-10,110);
  if(Math.hypot(p.vx,p.vy)>.4)p.facing=Math.atan2(p.vx,p.vy);
}
function routePoint(points, distance){
  let x=0,y=0;
  for(const [nx,ny] of points){
    const segment=Math.hypot(nx-x,ny-y);
    if(distance<=segment)return [x+(nx-x)*distance/segment,y+(ny-y)*distance/segment];
    distance-=segment;x=nx;y=ny;
  }
  return [x,y];
}
function routeTarget(play,receiver,index,spot,time){
  const [x,y]=routePoint(play.routes[index],Math.max(0,time)*8.6);
  return {x:clamp(receiver.origin+x,-25.7,25.7),y:clamp(spot+y,-8,108)};
}
function direction(input={}){
  const x=Number.isFinite(input?.x)?input.x:0,y=Number.isFinite(input?.y)?input.y:0;
  const length=Math.hypot(x,y);
  return {x:x/Math.max(length,1),y:y/Math.max(length,1),amount:Math.min(length,1),sprint:input?.sprint===true};
}
function steer(p,dir,speed,dt,response){
  move(p,p.x+dir.x*12,p.y+dir.y*12,speed*dir.amount,dt,response);
}
function arrival(qb,receiver,index,play,spot,time,bullet){
  const speed=bullet?BULLET_SPEED:LOB_SPEED;
  let duration=clamp(dist(qb,receiver)/speed,.27,1.9),to;
  for(let i=0;i<3;i++){
    to=routeTarget(play,receiver,index,spot,time+duration-.08);
    duration=clamp(dist(qb,to)/speed,.27,1.9);
  }
  return {to,duration};
}
function coverageAssignment(call,defender,off,spot,ball){
  const i=defender.i;
  const shift=clamp(ball.x*.22,-6,6);
  const depth=clamp((ball.y-spot)*.26,0,7);
  if(call===2||call===3){
    const man={4:1,6:2,7:0,8:3}[i];
    if(man!==undefined){
      const p=off[7+man];
      return {x:p.x*.96,y:Math.min(108,p.y+1.5)};
    }
    if(i===5){
      const p=off[RB];
      return {x:p.x*.85,y:Math.max(spot+2,p.y+1.1)};
    }
    return {x:i===9?shift:shift+10,y:Math.min(108,spot+(i===9?19:10)+depth)};
  }
  const zones=call===1
    ?{3:[12,6],4:[-12,7],5:[-4,9],6:[6,8],7:[-18,19],8:[18,19],9:[0,23],10:[2,10]}
    :call===4
      ?{4:[-13,8],5:[0,8],6:[13,8],7:[-21,17],8:[21,17],9:[-7,21],10:[7,21]}
      :{4:[-10,9],5:[0,10],6:[10,9],7:[-22,5],8:[22,5],9:[-13,20],10:[13,20]};
  const [x,y]=zones[i]||[defender.origin,5];
  return {x:clamp(x+shift,-25,25),y:Math.min(108,spot+y+(y>12?depth:depth*.45))};
}
export class Football {
  constructor({human=0,online=false,openingTeam=0,quarter=120,difficulty='Pro',random=Math.random}={}){
    this.human=human;this.online=online;this.openingTeam=openingTeam;this.length=quarter;this.difficulty=difficulty;this.random=random;
    this.quarter=1;this.clock=quarter;this.score=[0,0];this.stats=TEAMS.map(()=>({yards:0,pass:0,att:0,turnovers:0,first:0}));
    this.highlights=[];this.lastReplay=[];this.message=TEAMS[openingTeam].name+' receive the opening kickoff';
    this.drive(openingTeam,25);
  }
  get offenseHuman(){return this.possession===this.human}
  get offenseControlled(){return this.online||this.offenseHuman}
  get defenseControlled(){return this.online||!this.offenseHuman}
  get player(){return this.offenseHuman?this.carrier:this.def[this.control]}
  drive(team,spot){
    this.possession=team;this.spot=clamp(spot,1,99);this.down=1;this.marker=Math.min(100,this.spot+10);
    this.setup();
  }
  setup(){
    this.state='pre';this.t=0;this.flight=null;this.aiAttempts=this.stats[this.possession].att;
    this.cut=0;this.cutReady=0;this.dive=0;this.diveReady=0;this.playBall=0;this.protection=0;
    this.carrierIndex=QB;this.scrambled=false;this.kickMeter=null;this.clockRunning=false;
    this.play=0;this.cover=0;this.control=5;this.frames=[];this.frameTime=0;
    this.off=positions.map((p,i)=>avatar(p,this.spot,this.possession,i));
    this.def=front.map((p,i)=>({...avatar(p,this.spot,1-this.possession,i),facing:Math.PI}));
    this.ball={x:0,y:this.spot,h:.17};
  }
  get carrier(){return this.off[this.carrierIndex]}
  get playcall(){return PLAYS[this.play]}
  select(i,team=this.human){
    if(this.state!=='pre'||(!this.online&&team!==this.human))return false;
    if(this.possession===team&&Number.isInteger(i)&&PLAYS[i]){this.play=i;return true}
    if(this.possession!==team&&Number.isInteger(i)&&DEFENSE[i]){this.cover=i;return true}
    return false;
  }
  snap(){
    if(this.state!=='pre')return false;
    if(!this.defenseControlled)this.cover=Math.floor(this.random()*DEFENSE.length);
    if(!this.offenseControlled){
      if(this.down===4&&this.spot<60)this.play=6;
      else if(this.down===4&&this.spot<91)this.play=5;
      else {
        const calls=this.random()<(this.marker-this.spot<5?.53:.33)?AI_RUNS:AI_PASSES;
        this.play=calls[Math.floor(this.random()*calls.length)];
      }
    }
    this.state='live';this.message='';this.result=null;this.clockRunning=true;
    if(this.play===5){
      const yards=Math.round(117-this.spot);
      this.kickMeter={value:-1,elapsed:0,window:clamp(.52-(yards-25)*.009,.12,.56)};
    }
    if(this.play===6)this.launchKick(false);
    this.capture();
    return true;
  }
  launchKick(fieldGoal,aim=0){
    const yards=Math.round(117-this.spot);
    const wide=aim*9;
    const short=fieldGoal&&yards>68;
    this.flight={
      kick:true,fg:fieldGoal,short,duration:fieldGoal?1.45:1.8,elapsed:0,
      from:{x:0,y:this.spot-6,h:1},
      to:{x:fieldGoal?wide:2,y:fieldGoal?(short?98:110):Math.min(107,this.spot+44+this.random()*8)}
    };
    this.kickMeter=null;
  }
  get canPass(){
    return this.state==='live'&&!this.flight&&this.carrierIndex===QB&&!this.scrambled&&
      this.playcall.type==='PASS'&&this.carrier.y<=this.spot;
  }
  pass(index,bullet=false,team=this.human,aim={}){
    if(!this.canPass||team!==this.possession||this.t<.12||!Number.isInteger(index)||index<0||index>=4)return false;
    const qb=this.carrier,target=this.off[7+index];
    const {to,duration}=arrival(qb,target,index,this.playcall,this.spot,this.t,bullet);
    const pressure=this.def.some(p=>!p.down&&dist(p,qb)<2.7);
    const placement=direction(aim);
    const motion=Math.hypot(qb.vx,qb.vy);
    const scatter=(pressure?1.7:.25)+motion*.09;
    const error=(this.random()-.5)*scatter;
    this.flight={
      index,bullet,duration,elapsed:0,from:{x:qb.x,y:qb.y,h:1.65},
      to:{x:clamp(to.x+placement.x*1.05+error,-27.1,27.1),y:clamp(to.y+placement.y*1.2+error*.3,-8,109)}
    };
    this.stats[this.possession].att++;
    return true;
  }
  action(team=this.human){
    if(!this.online&&team!==this.human)return false;
    if(this.state==='pre'&&!this.online)return this.snap();
    if(this.state!=='live')return false;
    if(team===this.possession){
      if(!this.kickMeter||this.kickMeter.elapsed<.16)return false;
      this.launchKick(true,this.kickMeter.value*.29/this.kickMeter.window);
      return true;
    }
    if(this.flight?.kick||this.kickMeter||this.t<this.diveReady)return false;
    if(this.flight){
      this.playBall=.50;
      this.diveReady=this.t+.72;
    } else {
      this.dive=.44;
      this.diveReady=this.t+1.15;
    }
    return true;
  }
  skill(team=this.human){
    if((this.state!=='live'&&this.state!=='pre')||(!this.online&&team!==this.human))return false;
    if(team===this.possession){
      if(this.state!=='live'||this.t<this.cutReady||this.flight||
        (this.carrierIndex===QB&&!this.scrambled))return false;
      this.cut=.31;
      this.cutReady=this.t+1.1;
      return true;
    }
    const target=this.flight?.to||this.carrier;
    const candidates=this.def.filter(p=>!p.down&&p.i!==this.control);
    const next=candidates.reduce((best,p)=>!best||dist(p,target)<dist(best,target)?p:best,null);
    if(!next)return false;
    this.control=next.i;
    this.dive=0;this.playBall=0;
    return true;
  }
  capture(){
    this.frames.push({ball:{...this.ball},off:this.off.map(p=>({...p})),def:this.def.map(p=>({...p})),possession:this.possession,spot:this.spot,marker:this.marker,active:this.player?.i,offenseHuman:this.offenseHuman,carrierIndex:this.carrierIndex,control:this.control,phase:this.state,flight:this.flight&&{...this.flight},dive:this.dive,playBall:this.playBall,t:this.t});
    if(this.frames.length>440)this.frames.shift();
  }
  finish(kind,where,detail=''){
    if(this.state!=='live')return;
    if((kind==='rush'||kind==='bounds')&&where<=0)kind='safety';
    if(kind==='rush'||kind==='bounds')where=clamp(where,1,99);
    const team=this.possession,old=this.spot;
    const gain=Math.round(where-old);
    const s=this.stats[team];
    let next={team,spot:where},label=detail,points=0;
    const clockRuns=kind==='rush'&&(where>=this.marker||this.down<4);
    if(kind==='td'){points=7;s.yards+=100-old;label='Touchdown · extra point good';next={team:1-team,spot:25}}
    else if(kind==='safety'){this.score[1-team]+=2;label='Safety · 2 points';next={team:1-team,spot:35}}
    else if(kind==='fg'){points=3;label=detail;next={team:1-team,spot:25}}
    else if(kind==='miss'){next={team:1-team,spot:clamp(107-old,20,99)}}
    else if(kind==='punt'){next={team:1-team,spot:where>=100?20:clamp(100-where,1,99)};label=where>=100?'Punt · touchback':'Punt · downed at the '+Math.round(next.spot)}
    else if(kind==='pick'||kind==='fumble'){s.turnovers++;next={team:1-team,spot:where>=100?20:clamp(100-where,1,99)}}
    else {
      if(kind!=='incomplete')s.yards+=gain;
      if(!label)label=gain===0?'No gain':gain>0?gain+'-yard gain':Math.abs(gain)+'-yard loss';
      if(where>=this.marker){
        s.first++;
        next={team,spot:where};
        label+=' · first down';
      } else if(this.down===4){
        next={team:1-team,spot:clamp(100-where,1,99)};
        label+=' · turnover on downs';
      } else next={team,spot:where,down:this.down+1,marker:this.marker};
    }
    this.score[team]+=points;this.result=next;this.state='dead';this.message=label;
    this.clockRunning=false;
    if(clockRuns)this.clock=Math.max(0,this.clock-(this.clock<18?6:10));
    this.capture();this.lastReplay=this.frames.slice();
    this.highlights.push({label,team,gain,points,quarter:this.quarter,frames:points||kind==='pick'||kind==='fumble'||gain>=15?this.lastReplay:null});
  }
  advance(){
    if(this.state==='summary'){
      if(this.quarter===2){
        const team=1-this.openingTeam;
        this.quarter++;this.clock=this.length;
        this.message=TEAMS[team].name+' receive the second-half kickoff';
        this.drive(team,25);
      }
      return;
    }
    if(this.state!=='dead')return;
    if(this.clock===0){
      if(this.quarter===2||this.quarter===4){this.state='summary';return}
      this.quarter++;this.clock=this.length;
    }
    const n=this.result;
    this.drive(n.team,n.spot);
    if(n.down){this.down=n.down;this.marker=n.marker}
  }
  runningBlocker(defender,runner){
    if(this.t>2.5||runner.y>this.spot+6)return null;
    let closest=null,distance=1.75;
    for(const blocker of this.off){
      if(blocker.i===QB||blocker.i===RB||blocker.y>defender.y+1)continue;
      const gap=dist(blocker,defender);
      if(gap<distance){closest=blocker;distance=gap}
    }
    return closest;
  }
  tick(dt,input={}){
    if(this.state!=='live')return;
    this.t+=dt;
    this.clock=Math.max(0,this.clock-dt);
    this.cut=Math.max(0,this.cut-dt);
    this.dive=Math.max(0,this.dive-dt);
    this.playBall=Math.max(0,this.playBall-dt);
    this.protection=Math.max(0,this.protection-dt);
    if(this.kickMeter){
      const meter=this.kickMeter;
      meter.elapsed+=dt;
      meter.value=-Math.cos(meter.elapsed*3.35);
      if(!this.offenseControlled&&meter.elapsed>=.47){
        const spread=this.difficulty==='Rookie'?1.8:this.difficulty==='All-Pro'?.82:1.24;
        this.launchKick(true,(this.random()-.5)*spread);
      }else if(meter.elapsed>3.45)this.launchKick(true,1);
      this.captureTimed(dt);
      return;
    }
    if(this.flight?.kick){
      this.updateFlight(dt);
      this.captureTimed(dt);
      return;
    }
    const offInput=direction(this.online?input.teams?.[this.possession]:this.offenseHuman?input:undefined);
    const defInput=direction(this.online?input.teams?.[1-this.possession]:!this.offenseHuman?input:undefined);
    const play=this.playcall;
    const run=play.type==='RUN';
    if(run&&this.t>=.47&&this.carrierIndex===QB)this.carrierIndex=RB;
    const c=this.carrier;
    const runner=this.carrierIndex!==QB||this.scrambled;
    if(!this.flight){
      if(runner&&this.offenseControlled){
        const speed=(offInput.sprint?11.1:8.8)*(this.cut>0?.92:1);
        steer(c,offInput,speed,dt,this.cut>0?28:10);
      } else if(runner){
        const path=run&&this.t<2.2?(play.counter&&this.t<.78?-4:play.lane):c.x*.9;
        move(c,path,c.y+14,9.5,dt);
      } else if(!run){
        if(this.offenseControlled&&offInput.amount>0){
          steer(c,offInput,offInput.sprint?8.5:6.7,dt,14);
        }else if(this.t<.74){
          move(c,play.fake&&this.t>.4?2.2:0,this.spot-6.8,5,dt);
        }else move(c,c.x,c.y,0,dt);
        if(c.y>this.spot)this.scrambled=true;
      }
    }
    if(run&&this.carrierIndex===QB){
      move(this.off[RB],play.counter?-2.7:-1,this.spot-4.4,8,dt);
      move(this.off[QB],0,this.spot-4.2,3,dt);
    } else if(run)move(this.off[QB],1,this.spot-3,3,dt);
    for(let i=0;i<4;i++){
      const p=this.off[7+i];
      if(p===c)continue;
      const target=run
        ?{x:clamp(p.origin+(p.origin<0?-1:1)*2,-25.7,25.7),y:Math.min(108,this.spot+5+this.t*2.5)}
        :routeTarget(play,p,i,this.spot,this.t);
      const incoming=this.flight?.index===i&&this.flight.elapsed/this.flight.duration>.57;
      const catchable=incoming&&dist(p,this.flight.to)<5.4;
      if(catchable){
        target.x=clamp(this.flight.to.x,-25.9,25.9);
        target.y=this.flight.to.y;
      }
      move(p,target.x,target.y,9.5,dt,17);
    }
    if(!run){
      const fake=play.fake&&this.t<.70;
      move(this.off[RB],fake?-1:this.t<1?-4:-8,this.spot-(fake?4:2)+Math.max(0,this.t-1)*2,7,dt);
    }
    const call=DEFENSE[this.cover];
    const diff=this.online?1:this.offenseHuman
      ?this.difficulty==='Rookie'?.87:this.difficulty==='All-Pro'?1.11:1
      :this.difficulty==='Rookie'?1.09:this.difficulty==='All-Pro'?.94:1;
    for(const p of this.def){
      if(p.down)continue;
      const user=this.defenseControlled&&p.i===this.control;
      if(user&&(defInput.amount>0||this.dive)){
        if(defInput.amount>0){
          steer(p,defInput,this.dive?14.7:defInput.sprint?11:8.9,dt,this.dive?22:15);
        }else if(dist(p,c)<6){
          move(p,c.x,c.y,14.7,dt,22);
        }else move(p,p.x+Math.sin(p.facing)*10,p.y+Math.cos(p.facing)*10,14.7,dt,22);
        continue;
      }
      const rush=p.i<call.rush;
      const blocker=run?this.runningBlocker(p,c):p.i<4?this.off[p.i]:null;
      const target=this.flight?.to||c;
      const man=this.cover===2||this.cover===3;
      const playsBall=this.flight&&dist(p,target)<(user&&this.playBall?9:man?5:7);
      const pursues=runner&&(!run||this.t>.72&&(p.i<7||c.y>this.spot+2||dist(p,c)<9));
      if(rush||pursues||playsBall){
        const duration=(run?2.15:2.55)+(p.i%3)*.24+(play.fake?.25:0);
        const engaged=blocker&&dist(p,blocker)<2.15&&this.t<duration&&c.y<this.spot+4&&!this.flight;
        const angle=target.x+clamp(target.vx||0,-7,7)*.20+(p.i%3-1)*.8;
        const rushSpeed=(p.i<4?7.3:8.7)*diff;
        move(p,engaged?blocker.x+(p.i<2?-1:1)*.92:angle,engaged?blocker.y+1.08:target.y,
          (engaged?3.0:playsBall?9.1*diff:rushSpeed),dt);
      }else{
        const zone=coverageAssignment(this.cover,p,this.off,this.spot,target);
        move(p,zone.x,zone.y,7.3*diff,dt);
      }
    }
    for(let i=0;i<5;i++){
      const p=this.off[i],d=this.def[i];
      const pull=run&&Math.abs(play.lane)>5;
      const reach=pull?3.3:2.3;
      const shift=run?Math.sign(play.lane)*Math.min(reach,this.t*(pull?2.4:1.1)):0;
      const x=clamp(d.x+shift,positions[i][0]-reach,positions[i][0]+reach);
      const y=run?Math.min(this.spot+4,d.y-.90):Math.max(this.spot-3.4,Math.min(this.spot+1,d.y-1.05));
      move(p,x,y,run?6:5,dt);
    }
    if(!this.offenseControlled&&this.canPass&&this.t>(play.fake?1.82:1.32)&&
      this.stats[this.possession].att===this.aiAttempts){
      const bullet=this.t<2.1;
      const best=this.off.slice(7).map((p,i)=>{
        const {to}=arrival(c,p,i,play,this.spot,this.t,bullet);
        const room=Math.min(...this.def.map(d=>dist(to,d)));
        return {i,score:room+this.random()*1.5+Math.min(10,to.y-this.spot)*.065};
      }).sort((a,b)=>b.score-a.score)[0];
      if(best.score>2.3||this.t>2.33)this.pass(best.i,bullet,this.possession);
    }
    if(this.flight){
      this.updateFlight(dt);
    }else{
      this.ball={x:c.x+.30,y:c.y,h:1.32};
      if(c.y>=100)this.finish('td',100);
      else if(Math.abs(c.x)>WIDTH/2){
        this.finish('bounds',c.y,'Out of bounds · '+Math.round(c.y-this.spot)+' yards');
      }else if(this.t>.54&&this.protection<=0){
        const tackle=this.def.find(p=>!p.down&&dist(p,c)<(p.i===this.control&&this.dive>0?1.85:1.02));
        if(tackle){
          const diving=tackle.i===this.control&&this.dive>0;
          if(this.cut>0&&!diving&&Math.hypot(c.vx,c.vy)>2.8){
            this.cut=0;this.protection=.34;tackle.down=true;tackle.vx=tackle.vy=0;
          }else{
            tackle.down=true;c.down=true;
            const sack=!run&&!this.scrambled&&this.carrierIndex===QB&&c.y<this.spot;
            if(c.y<=0)this.finish('safety',0);
            else if(pFumble(this.random,diving,offInput.sprint))this.finish('fumble',c.y,'Fumble · defense recovers');
            else this.finish('rush',c.y,sack?'Sack · loss of '+Math.max(0,Math.round(this.spot-c.y)):'');
          }
        }
      }
    }
    if(this.state==='live'&&this.t>18)this.finish('rush',c.y,'Play whistled dead');
    this.captureTimed(dt);
  }
  captureTimed(dt){
    if(this.state!=='live')return;
    this.frameTime+=dt;
    if(this.frameTime>=1/24){
      this.frameTime-=1/24;
      this.capture();
    }
  }
  updateFlight(dt){
    const f=this.flight;
    f.elapsed+=dt;
    const t=clamp(f.elapsed/f.duration,0,1);
    this.ball={x:f.from.x+(f.to.x-f.from.x)*t,y:f.from.y+(f.to.y-f.from.y)*t,h:(1-t)*f.from.h+t*(f.fg?5.5:1.1)+Math.sin(Math.PI*t)*(f.kick?13:f.bullet?1.6:4.4)};
    if(t<1)return;
    this.flight=null;
    if(f.kick){
      if(!f.fg){this.finish('punt',f.to.y);return}
      const yards=Math.round(117-this.spot);
      const good=!f.short&&Math.abs(f.to.x)<3.1;
      const label=good?'good':f.short?'short':f.to.x<0?'wide left':'wide right';
      this.finish(good?'fg':'miss',this.spot,yards+'-yard field goal · '+label);
      return;
    }
    const target=this.off[7+f.index];
    const defender=this.def.filter(p=>!p.down).reduce((best,p)=>!best||dist(p,f.to)<dist(best,f.to)?p:best,null);
    const reach=dist(target,f.to);
    const coverage=defender?dist(defender,f.to):Infinity;
    const userPlay=defender?.i===this.control&&this.defenseControlled&&this.playBall>0;
    const inBounds=Math.abs(f.to.x)<WIDTH/2;
    const pickRange=userPlay?2.1:1.35;
    const pickChance=userPlay?(reach>1.8?.83:.48):(reach>2.2?.43:.09);
    if(inBounds&&coverage<pickRange&&this.random()<pickChance){
      this.ball={x:defender.x,y:defender.y,h:1.45};
      this.finish('pick',defender.y,'Intercepted · '+TEAMS[defender.team].abbr+' ball');
    }else if(inBounds&&reach<2.45&&(coverage>(userPlay?2.8:1.45)||this.random()>(userPlay?.78:.48))){
      this.carrierIndex=target.i;
      this.stats[this.possession].pass++;
      this.protection=.23;
      this.ball={x:target.x+.30,y:target.y,h:1.32};
      if(target.y>=100)this.finish('td',100);
    }else this.finish('incomplete',this.spot,coverage<(userPlay?3:1.7)?'Pass broken up':'Incomplete pass');
  }
}
function pFumble(random,dive,sprint){return random()<(dive?.058:sprint?.022:.007)}
