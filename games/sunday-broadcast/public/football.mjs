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
  { name:'Punt', type:'KICK', detail:'Trade possession for field position' }
];
export const DEFENSE = [
  { name:'Cover 2', type:'ZONE', detail:'Two deep safeties', rush:4 },
  { name:'Cover 3', type:'ZONE', detail:'Protect against deep routes', rush:3 },
  { name:'Man Free', type:'MAN', detail:'Match receivers across the field', rush:4 },
  { name:'Edge Blitz', type:'BLITZ', detail:'Bring six, leave space underneath', rush:6 }
];
export const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
export const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const receivers = [-21,-11,10,21];
const positions = [
  [-4.4,-.2,'LG',67],[-2.2,-.2,'LT',72],[0,-.2,'C',54],[2.2,-.2,'RG',75],[4.4,-.2,'RT',78],
  [0,-4.5,'QB',12],[-1,-7,'RB',28],...receivers.map((x,i)=>[x,-.6,'WR',[81,16,87,84][i]])
];
const front = [
  [-5,1.6,'DE',94],[-1.8,1.6,'DT',92],[1.8,1.6,'DT',96],[5,1.6,'DE',91],
  [-8,6,'LB',51],[0,5,'LB',55],[8,6,'LB',58],[-21,7,'CB',24],[21,7,'CB',27],[-8,17,'S',31],[8,17,'S',33]
];
const avatar = ([x,dy,role,num],spot,team,i) => ({x,y:spot+dy,origin:x,team,role,num,i,vx:0,vy:0,facing:0,down:false});
function move(p,x,y,speed,dt){
  const dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy);
  const step=Math.min(speed,d/dt);
  const vx=d>.001?dx/d*step:0,vy=d>.001?dy/d*step:0;
  const blend=Math.min(1,dt*11);
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
  return [x,y+Math.min(distance,8)];
}
export class Football {
  constructor({human=0,quarter=120,difficulty='Pro',random=Math.random}={}){
    this.human=human;this.length=quarter;this.difficulty=difficulty;this.random=random;
    this.quarter=1;this.clock=quarter;this.score=[0,0];this.stats=TEAMS.map(()=>({yards:0,pass:0,att:0,turnovers:0,first:0}));
    this.highlights=[];this.lastReplay=[];this.message='Boston receives the opening kickoff';
    this.drive(0,25);
  }
  get offenseHuman(){return this.possession===this.human}
  get player(){return this.offenseHuman?this.carrier:this.def[this.control]}
  drive(team,spot){
    this.possession=team;this.spot=clamp(spot,1,99);this.down=1;this.marker=Math.min(100,this.spot+10);
    this.setup();
  }
  setup(){
    this.state='pre';this.t=0;this.flight=null;this.aiAttempts=this.stats[this.possession].att;this.cut=0;this.dive=0;this.diveReady=0;this.protection=0;this.carrierIndex=5;
    this.play=0;this.cover=0;this.control=5;this.frames=[];this.frameTime=0;
    this.off=positions.map((p,i)=>avatar(p,this.spot,this.possession,i));
    this.def=front.map((p,i)=>({...avatar(p,this.spot,1-this.possession,i),facing:Math.PI}));
    this.ball={x:0,y:this.spot,h:.17};
  }
  get carrier(){return this.off[this.carrierIndex]}
  get playcall(){return PLAYS[this.play]}
  select(i){
    if(this.state!=='pre')return;
    if(this.offenseHuman&&PLAYS[i])this.play=i;
    if(!this.offenseHuman&&DEFENSE[i])this.cover=i;
  }
  snap(){
    if(this.state!=='pre')return;
    if(this.offenseHuman)this.cover=Math.floor(this.random()*DEFENSE.length);
    else {
      if(this.down===4&&this.spot<61)this.play=6;
      else if(this.down===4&&this.spot<87)this.play=5;
      else this.play=this.random()<.36?3+Math.floor(this.random()*2):Math.floor(this.random()*3);
    }
    this.state='live';this.message='';this.result=null;
    this.capture();
    if(this.playcall.type==='KICK'){
      const fg=this.play===5;
      this.flight={kick:true,fg,duration:fg?1.45:1.8,elapsed:0,from:{x:0,y:this.spot-6,h:1},to:{x:fg?(this.random()-.5)*9:2,y:fg?110:Math.min(107,this.spot+43+this.random()*10)}};
    }
  }
  get canPass(){
    return this.state==='live'&&!this.flight&&this.carrierIndex===5&&this.playcall.type==='PASS'&&this.carrier.y<=this.spot;
  }
  pass(index,bullet=false){
    if(!this.canPass||this.t<.12||!Number.isInteger(index)||index<0||index>=4)return false;
    const qb=this.carrier,target=this.off[7+index],d=dist(qb,target);
    const duration=clamp(d/(bullet?37:23),.34,1.6);
    const [rx,ry]=routePoint(this.playcall.routes[index],(this.t+duration)*8.7);
    const pressure=this.def.some(p=>dist(p,qb)<3);
    const error=(this.random()-.5)*(pressure?3.8:1.0);
    this.flight={index,bullet,duration,elapsed:0,from:{x:qb.x,y:qb.y,h:1.6},to:{x:clamp(target.origin+rx+error,-26.5,26.5),y:clamp(this.spot+ry,0,108)}};
    this.stats[this.possession].att++;
    return true;
  }
  action(){
    if(this.state==='pre'){this.snap();return}
    if(this.state==='live'&&!this.offenseHuman&&this.t>=this.diveReady){
      this.dive=.44;
      this.diveReady=this.t+1.15;
    }
  }
  skill(){
    if(this.state!=='live'&&this.state!=='pre')return;
    if(this.offenseHuman){if(this.state==='live'&&this.cut<=0)this.cut=.64;return}
    const candidates=this.def.map((p,i)=>({i,d:dist(p,this.flight?.to||this.carrier)})).sort((a,b)=>a.d-b.d);
    this.control=candidates.find(p=>p.i!==this.control&&!this.def[p.i].down)?.i??this.control;
  }
  capture(){
    this.frames.push({ball:{...this.ball},off:this.off.map(p=>({...p})),def:this.def.map(p=>({...p})),possession:this.possession,spot:this.spot,marker:this.marker,active:this.player?.i,offenseHuman:this.offenseHuman,t:this.t});
    if(this.frames.length>440)this.frames.shift();
  }
  finish(kind,where,detail=''){
    if(this.state!=='live')return;
    if(kind==='rush'&&where<=0)kind='safety';
    if(kind==='rush')where=clamp(where,1,99);
    const team=this.possession,old=this.spot;
    const gain=Math.round(where-old);
    const s=this.stats[team];
    let next={team,spot:where},label=detail,points=0;
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
    this.clock=Math.max(0,this.clock-Math.min(7,kind==='incomplete'?0:4));
    this.capture();this.lastReplay=this.frames.slice();
    this.highlights.push({label,team,gain,points,quarter:this.quarter,frames:points||kind==='pick'||kind==='fumble'||gain>=15?this.lastReplay:null});
  }
  advance(){
    if(this.state==='summary'){
      if(this.quarter===2){this.quarter++;this.clock=this.length;this.message='Chicago receives the second-half kickoff';this.drive(1,25)}
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
  tick(dt,input={}){
    if(this.state!=='live')return;
    this.t+=dt;this.clock=Math.max(0,this.clock-dt);
    this.cut=Math.max(0,this.cut-dt);this.dive=Math.max(0,this.dive-dt);this.protection=Math.max(0,this.protection-dt);
    if(this.flight?.kick){this.updateFlight(dt);return}
    const run=this.playcall.type==='RUN';
    if(run&&this.t>=.48&&this.carrierIndex===5)this.carrierIndex=6;
    const c=this.carrier;
    const mx=input.x||0,my=input.y||0;
    const isRunner=this.carrierIndex!==5||c.y>this.spot;
    const speed=isRunner?(input.sprint?11.1:8.6):6.1;
    if(this.offenseHuman&&(!run||this.carrierIndex!==5))move(c,c.x+mx*12,c.y+my*12,speed,dt);
    else if(!this.offenseHuman&&isRunner)move(c,run&&this.t<2.1?this.playcall.lane:c.x*.87,c.y+13,9.1,dt);
    else if(!this.offenseHuman&&!run)move(c,0,this.spot-6,4.5,dt);
    if(run&&this.carrierIndex===5)move(this.off[6],-1,this.spot-4,7.5,dt);
    if(run&&this.carrierIndex!==5)move(this.off[5],1,this.spot-3,3,dt);
    for(let i=0;i<4;i++){
      const p=this.off[7+i];
      if(p===c)continue;
      const [rx,ry]=run?[p.origin*.18,8+this.t*3]:routePoint(this.playcall.routes[i],this.t*8.7);
      move(p,clamp(p.origin+rx,-26.5,26.5),Math.min(108,this.spot+ry),9.5,dt);
    }
    if(!run)move(this.off[6],this.t<1?-4:-8,this.spot-2+Math.max(0,this.t-1)*2,6,dt);
    const call=DEFENSE[this.cover];
    const diff=this.difficulty==='Rookie'?.85:this.difficulty==='All-Pro'?1.11:1;
    for(let i=0;i<this.def.length;i++){
      const p=this.def[i];
      if(p.down)continue;
      if(!this.offenseHuman&&i===this.control&&(mx||my||this.dive)){
        const hasDirection=Boolean(mx||my);
        const target=this.flight?.to||c;
        const assist=this.dive&&dist(p,target)<6;
        const dx=hasDirection?mx:Math.sin(p.facing),dy=hasDirection?my:Math.cos(p.facing);
        move(p,!hasDirection&&assist?target.x:p.x+dx*10,!hasDirection&&assist?target.y:p.y+dy*10,this.dive?15:input.sprint?11:8.6,dt);
        continue;
      }
      const blocker=i<5?this.off[i]:null;
      const rush=i<call.rush;
      const chase=run||isRunner||this.flight&&dist(p,this.flight.to)<8;
      if(rush||chase){
        const target=this.flight?.to||c;
        const bx=blocker?.x??p.x;
        const engaged=blocker&&dist(p,blocker)<2.15&&this.t<(run?2.8:3.05)+(i%3)*.28&&c.y<this.spot+5;
        move(p,engaged?bx+(i<2?-1:1)*.95:target.x+(i%3-1)*.55,engaged?blocker.y+1.1:target.y, (engaged?3.1:8.4)*diff,dt);
      } else {
        const match=this.off[7+[1,2,0,3,1,2,1,0,3,1,2][i]];
        const man=call.type==='MAN'||call.type==='BLITZ'||i===7||i===8;
        move(p,man?match.x*.96:front[i][0],man?match.y+2:Math.min(108,this.spot+front[i][1]+Math.min(this.t*3,9)),7.5*diff,dt);
      }
    }
    for(let i=0;i<5;i++){
      const p=this.off[i],d=this.def[i];
      move(p,clamp(d.x,positions[i][0]-2.5,positions[i][0]+2.5),run?Math.min(this.spot+4,d.y-.9):Math.max(this.spot-3.4,Math.min(this.spot+1,d.y-1.05)),5,dt);
    }
    if(!this.offenseHuman&&!run&&this.t>1.45&&!this.flight&&this.carrierIndex===5&&this.stats[this.possession].att===this.aiAttempts){
      const best=this.off.slice(7).map((p,i)=>({i,room:Math.min(...this.def.map(d=>dist(p,d)))+this.random()*1.2})).sort((a,b)=>b.room-a.room)[0];
      this.pass(best.i,this.t<2.2);
    }
    if(this.flight)this.updateFlight(dt);
    else{
      this.ball={x:c.x+.35,y:c.y,h:1.35};
      if(c.y>=100)this.finish('td',100);
      else if(Math.abs(c.x)>WIDTH/2)this.finish('rush',Math.max(1,c.y),'Out of bounds · '+Math.round(c.y-this.spot)+' yards');
      else if(this.t>.57){
        const tackle=this.def.find(p=>!p.down&&dist(p,c)<(p.i===this.control&&this.dive>0?2.15:.98));
        if(tackle&&this.protection<=0){
          if(this.cut>.22&&this.offenseHuman){
            this.cut=.14;this.protection=.48;tackle.down=true;tackle.vx=tackle.vy=0;
          } else {
            tackle.down=true;c.down=true;
            const sack=!run&&this.carrierIndex===5&&c.y<this.spot;
            if(c.y<=0)this.finish('safety',0);
            else if(pFumble(this.random,!this.offenseHuman&&tackle.i===this.control&&this.dive>0,this.offenseHuman&&input.sprint))this.finish('fumble',c.y,'Fumble · defense recovers');
            else this.finish('rush',c.y,sack?'Sack · loss of '+Math.max(0,Math.round(this.spot-c.y)):'');
          }
        }
      }
    }
    if(this.state==='live'&&this.t>18)this.finish('rush',clamp(c.y,1,99),'Play whistled dead');
    this.frameTime+=dt;
    if(this.state==='live'&&this.frameTime>=1/24){this.frameTime=0;this.capture()}
  }
  updateFlight(dt){
    const f=this.flight;
    f.elapsed+=dt;
    const t=clamp(f.elapsed/f.duration,0,1);
    this.ball={x:f.from.x+(f.to.x-f.from.x)*t,y:f.from.y+(f.to.y-f.from.y)*t,h:(1-t)*f.from.h+t*(f.fg?5.5:1.1)+Math.sin(Math.PI*t)*(f.kick?13:f.bullet?1.6:4.4)};
    this.frameTime+=f.kick?dt:0;
    if(f.kick&&this.frameTime>=1/24){this.frameTime=0;this.capture()}
    if(t<1)return;
    this.flight=null;
    if(f.kick){
      if(!f.fg){this.finish('punt',f.to.y);return}
      const yards=Math.round(117-this.spot);
      const good=yards<=68&&Math.abs(f.to.x)<3.0&&this.random()<clamp(1-(yards-38)*.021,.15,.99);
      this.finish(good?'fg':'miss',this.spot,yards+'-yard field goal · '+(good?'good':'no good'));
      return;
    }
    const target=this.off[7+f.index];
    const defender=this.def.reduce((a,b)=>dist(a,f.to)<dist(b,f.to)?a:b);
    const coverage=dist(defender,f.to),reach=dist(target,f.to);
    if(coverage<1.75&&this.random()<(reach>2.4?.49:.21)){
      this.ball={x:defender.x,y:defender.y,h:1.45};
      this.finish('pick',defender.y,'Intercepted · '+TEAMS[defender.team].abbr+' ball');
    } else if(reach<3.25&&(coverage>2.5||this.random()>.32)){
      this.carrierIndex=target.i;this.stats[this.possession].pass++;
      this.protection=.23;
      if(target.y>=100)this.finish('td',100);
    } else this.finish('incomplete',this.spot,coverage<2.5?'Pass broken up':'Incomplete pass');
  }
}
function pFumble(random,dive,sprint){return random()<(dive?.058:sprint?.022:.007)}
