// Broadcast graphics use recorded coordinates or explicitly labeled diagrams.
// No renderer calls into the live game or consumes its random stream.
const W=720,H=360,YELLOW='#ffdc46';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=n=>1-(1-clamp(n))**3;
const mix=(a,b,t)=>a+(b-a)*t;
function text(c,s,x,y,size=18,color='#fff3d6',align='left'){
 c.fillStyle=color;c.font=`bold ${size}px monospace`;c.textAlign=align;c.fillText(String(s),x,y);
}
function fit(c,s,x,y,width,size=24,color='#fff3d6'){
 c.font=`bold ${size}px monospace`;while(c.measureText(s).width>width&&size>12){size--;c.font=`bold ${size}px monospace`;}text(c,s,x,y,size,color);
}
function box(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function ball(c,x,y,scale=1){c.save();c.translate(x,y);c.rotate(-.3);c.fillStyle='#a96a35';c.beginPath();c.ellipse(0,0,10*scale,6*scale,0,0,Math.PI*2);c.fill();box(c,-4*scale,-1*scale,8*scale,2*scale,'#fff4d0');c.restore();}
function pen(c,p){c.save();c.translate(p.x,p.y);c.rotate(-.7);box(c,-3,-26,7,23,YELLOW);box(c,-3,-30,7,5,'#202b2b');c.fillStyle='#fff8b5';c.beginPath();c.moveTo(-3,-3);c.lineTo(4,-3);c.lineTo(0,3);c.fill();c.restore();}
function stroke(c,points,progress){
 if(progress<=0||points.length<2)return;
 const n=(points.length-1)*clamp(progress),end=Math.floor(n),fraction=n-end;
 c.save();c.strokeStyle=YELLOW;c.lineWidth=4.5;c.lineCap=c.lineJoin='round';c.shadowColor='#251e0e';c.shadowBlur=2;
 c.beginPath();c.moveTo(points[0].x,points[0].y);for(let i=1;i<=end;i++)c.lineTo(points[i].x,points[i].y);
 let cursor=points[end];if(end<points.length-1){cursor={x:mix(cursor.x,points[end+1].x,fraction),y:mix(cursor.y,points[end+1].y,fraction)};c.lineTo(cursor.x,cursor.y);}c.stroke();c.restore();if(progress<1)pen(c,cursor);
}
function circle(c,p,progress,r=23){const pts=Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2.08;return {x:p.x+Math.cos(a)*(r+Math.sin(i*1.7)),y:p.y+Math.sin(a)*(r*.82+Math.cos(i*.8))};});stroke(c,pts,progress);}
function arrow(c,pts,progress){stroke(c,pts,progress);if(progress>=1&&pts.length>1){const p=pts.at(-1),q=pts.at(-2),a=Math.atan2(p.y-q.y,p.x-q.x);stroke(c,[{x:p.x-14*Math.cos(a-.5),y:p.y-14*Math.sin(a-.5)},p,{x:p.x-14*Math.cos(a+.5),y:p.y-14*Math.sin(a+.5)}],1);}}
function person(c,p,color){c.fillStyle='#06151266';c.beginPath();c.ellipse(p.x,p.y+9,11,5,0,0,7);c.fill();box(c,p.x-9,p.y-7,18,16,color);box(c,p.x-12,p.y-5,5,8,color);box(c,p.x+7,p.y-5,5,8,color);box(c,p.x-5,p.y-15,10,8,'#edddbe');text(c,p.number??'',p.x,p.y+5,10,'#fff','center');}
function field(c,low=20,high=75){
 box(c,0,0,W,H,'#112c29');box(c,22,24,676,300,'#2a6247');
 const xy=p=>({x:22+(p.y-low)/(high-low)*676,y:30+p.x/53*288});
 for(let yard=Math.ceil(low/5)*5;yard<=high;yard+=5){const x=xy({x:0,y:yard}).x;box(c,x,24,1,300,'#b7d5ac77');if(yard%10===0)text(c,yard>50?100-yard:yard,x+5,47,12,'#bdcda7');}
 for(const side of [17,36])for(let yard=Math.ceil(low);yard<=high;yard++){const p=xy({x:side,y:yard});box(c,p.x,p.y,1,5,'#bdcda766');}
 box(c,22,24,676,2,'#c6d3b1');box(c,22,322,676,2,'#c6d3b1');return xy;
}
export function sampleHighlight(clip,elapsed,reduced=false){
 const first=clip.frames[0].time,last=clip.frames.at(-1).time,focus=clip.focusIndex??Math.floor(clip.frames.length*.58),freeze=clip.frames[focus].time;
 const at=reduced?freeze:elapsed<3.5?mix(first,freeze,ease(elapsed/3.5)):elapsed<8?freeze:mix(freeze,last,clamp((elapsed-8)/4));
 let hi=clip.frames.findIndex(f=>f.time>=at);if(hi<0)hi=clip.frames.length-1;
 const a=clip.frames[Math.max(0,hi-1)],b=clip.frames[hi],t=a.time===b.time?1:clamp((at-a.time)/(b.time-a.time));
 if(a.offense!==b.offense)return b;
 return {...a,people:a.people.map((p,i)=>({...p,x:mix(p.x,b.people[i].x,t),y:mix(p.y,b.people[i].y,t)})),ball:{x:mix(a.ball.x,b.ball.x,t),y:mix(a.ball.y,b.ball.y,t)},arc:mix(a.arc,b.arc,t)};
}
function highlight(c,report,s,time,reduced,ink){
 const clip={...s.clip,focusIndex:s.focus.index},anchor=clip.anchor;
 const orient=p=>({x:anchor===1?53-p.x:p.x,y:anchor===1?100-p.y:p.y});
 const ys=clip.frames.map(f=>orient(f.ball).y),span=Math.max(45,Math.min(110,Math.max(...ys)-Math.min(...ys)+22));
 const low=clamp((Math.min(...ys)+Math.max(...ys)-span)/2,-5,105-span),xy=field(c,low,low+span),frame=sampleHighlight(clip,time,reduced),project=p=>xy(orient(p));
 const line=project({x:0,y:frame.spot});box(c,line.x,24,2,300,'#7aceed');
 for(const p of frame.people){const q=project(p);if(q.x<10||q.x>710)continue;person(c,{...q,number:p.number},report.teams[p.team].color);}
 const b=project(frame.ball);ball(c,b.x,b.y-frame.arc*.4,.7);
 const paused=reduced||time>=3.5&&time<8;
 text(c,paused?'HOLD IT RIGHT THERE':(s.period==='game'?'GAME REPLAY':'FIRST-HALF REPLAY'),36,346,13,paused?YELLOW:'#d7e1d0');
 if(ink&&paused){
  const f=s.focus.focus;if(f)circle(c,project(f),reduced?1:clamp((time-3.5)/1.2));
  const carrier=s.focus.frame.people.find(p=>p.carrier),trail=clip.frames.slice(0,s.focus.index+1).filter((_,i)=>i%3===0).map(frame=>frame.people.find(p=>p.id===carrier?.id&&p.team===carrier?.team)).filter(Boolean).map(project);
  if(trail.length>1)arrow(c,trail,reduced?1:clamp((time-4.8)/1.7));
  if(f&&(time>5||reduced)){const p=project(f);text(c,s.focus.block?'THE BLOCK':`#${f.number}`,clamp(p.x+26,28,550),clamp(p.y-23,70,300),15,YELLOW);}
 }
}
function diagram(c,report,s,time,reduced,ink){
 const xy=field(c,25,80),team=s.team||0,progress=reduced?0:time>8?clamp((time-8)/4):0;
 const players=[{x:27,y:35,number:'QB'},{x:27,y:31,number:'RB'},{x:22,y:40,number:'OL'},{x:32,y:40,number:'OL'},{x:8,y:40,number:'WR'},{x:46,y:40,number:'WR'},{x:38,y:40,number:'TE'}];
 for(const p of [{x:21,y:43},{x:33,y:43},{x:15,y:49},{x:40,y:49},{x:9,y:57},{x:45,y:57},{x:27,y:67}])person(c,{...xy(p),number:'D'},report.teams[1-team].color);
 for(const [i,p] of players.entries()){const q=i===1?{...p,x:mix(27,22,progress),y:mix(31,62,progress)}:p;person(c,{...xy(q),number:p.number},report.teams[team].color);}
 const runner=xy({x:mix(27,22,progress),y:mix(31,62,progress)});ball(c,runner.x,runner.y,.7);
 if(ink){circle(c,xy(players[2]),reduced?1:clamp((time-1)/1.4));arrow(c,[xy(players[1]),xy({x:24,y:40}),xy({x:22,y:53}),xy({x:22,y:63})],reduced?1:clamp((time-2.5)/2));if(time>4||reduced)text(c,'A LITTLE DAYLIGHT',340,98,18,YELLOW);}
 text(c,'GAME-PLAN ILLUSTRATION · NOT A REPLAY',36,346,13,'#d7e1d0');
}
function matchup(c,report,s,time,reduced){
 const offset=reduced?0:(1-ease(time/.7))*50;
 for(const [i,t] of report.teams.entries()){
  const x=30+i*360+(i?-offset:offset);box(c,x,42,300,238,t.color);box(c,x,270,300,10,t.accent||YELLOW);
  text(c,t.abbr,x+24,140,66);fit(c,t.city.toUpperCase(),x+24,177,260,19);
  text(c,report.mode==='pregame'?'READY FOR KICKOFF':report.scores[i],x+24,235,report.mode==='pregame'?17:42,YELLOW);
 }
 box(c,324,132,72,58,'#13272b');text(c,'VS',360,171,30,YELLOW,'center');
 text(c,report.mode==='pregame'?'THE BEST PART IS STILL AHEAD.':(report.mode==='postgame'?'THE FINAL WORD. ALL HEART.':'HALF A GAME. PLENTY OF STORY.'),360,326,18,'#e7debc','center');
}
function teamCard(c,report,s,time,reduced){
 const t=report.teams[s.team];box(c,25,28,670,296,'#20383d');box(c,25,28,12,296,t.color);text(c,t.abbr,56,104,58,t.accent||YELLOW);
 text(c,'THE ONES TO WATCH',250,68,17,YELLOW);
 s.stars.forEach((p,i)=>{const x=250+(reduced?0:18*(1-ease((time-i*.12)/.6))),y=107+i*74;box(c,x-8,y-24,426,58,'#132a2f');text(c,p.pos,x,y,15,YELLOW);fit(c,`#${p.number} ${p.name}`,x+47,y,358,22);});
 text(c,'SELECTED PGI LINEUP',55,285,16,'#baccc4');
}
function stats(c,report,time,reduced){
 const values=report.box.map(b=>b.rushYards+b.passYards),max=Math.max(1,...values);
 text(c,'OFFENSIVE YARDS',34,53,22,YELLOW);
 report.teams.forEach((t,i)=>{const y=120+i*100;const n=reduced?1:ease(time/1.2);text(c,t.abbr,35,y,25);box(c,120,y-26,480,32,'#254447');box(c,120,y-26,480*Math.max(0,values[i])/max*n,32,t.color);text(c,values[i],670,y,28,YELLOW,'right');text(c,`${report.box[i].rushYards} RUSH  /  ${report.box[i].passYards} PASS`,120,y+28,15,'#c8d5c8');});
 text(c,report.mode==='postgame'?'ACTUAL FULL-GAME TOTALS':'ACTUAL FIRST-HALF TOTALS',35,330,14,'#adbbb2');
}
export function paintBroadcast(canvas,report,s,time,{reduced=false,ink=true}={}){
 const c=canvas.getContext('2d');if(!c)return;
 c.clearRect(0,0,W,H);box(c,0,0,W,H,'#10272d');
 if(s.visual==='highlight')highlight(c,report,s,time,reduced,ink);
 else if(s.visual==='diagram')diagram(c,report,s,time,reduced,ink);
 else if(s.visual==='team')teamCard(c,report,s,time,reduced);
 else if(s.visual==='stats'&&report.box)stats(c,report,time,reduced);
 else matchup(c,report,s,time,reduced);
 // A quiet broadcast frame, not a flashing overlay.
 box(c,0,0,W,4,YELLOW);box(c,0,H-4,W,4,'#426063');
}
