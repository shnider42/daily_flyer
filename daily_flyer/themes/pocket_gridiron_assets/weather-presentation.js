import {WEATHER,weatherLabel,weatherAdvice,windAt,windArrow} from './weather.js?v=30';
const mod=(n,d)=>(n%d+d)%d;
const r=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
export function weatherSurface(c,view,project,w){
 if(!w||w.roofClosed)return;
 const {px,py}=project,h=view.height;
 if(w.kind==='rain'){r(c,29,0,302,h,'#102b4166');for(let i=0;i<32;i++){const x=4+(i*17%46),y=i*37%110,p=py(y);if(p>0&&p<h)r(c,px(x),p,12+i%8,2,'#72adba88');}}
 if(w.kind==='snow'){
  r(c,29,0,302,h,'#e3edf36b');
  for(let i=0;i<190;i++){const y=py((i*37.73)%120-10),x=px(1+(i*19.7)%50);if(y>0&&y<h)r(c,x,y,3+i%7,2+i%3,'#e5ede6aa');}
  r(c,23,0,5,h,'#f0f1e0');r(c,332,0,5,h,'#f0f1e0');
 }
 if(w.kind==='heat')r(c,29,0,302,h,'#f1bb5040');
}
export function weatherParticles(c,view,w,time=0,{reduced=false,wind=null}={}){
 if(!w||w.roofClosed)return;const h=view.height,width=view.width,kind=w.kind,t=reduced?0:time,v=wind||windAt(w,time);
 c.save();c.beginPath();c.rect(0,0,width,h);c.clip();
 if(kind==='rain'||kind==='snow'){
  const count=reduced?16:kind==='rain'?100:78;
  for(let i=0;i<count;i++){
   const x=mod(i*83.7+t*v.x*(kind==='rain'?1.3:.6),width),y=mod(i*137.3+t*(kind==='rain'?210:24+i%10),h+30)-15;
   if(kind==='rain'){c.strokeStyle='#c4e3edb0';c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x+v.x*.25,y+13);c.stroke();}
   else r(c,x+Math.sin(t*.7+i)*3,y,i%3?2:3,2,'#f3f6eac9');
  }
 }
 if(kind==='wind')for(let i=0;i<14;i++){const y=mod(i*83+t*9,h),x=mod(i*61+t*v.x*3,width);r(c,x,y,9+i%4,1,'#d2dfb580');}
 if(kind==='heat')for(let i=0;i<14;i++){const y=i*h/8+Math.sin(t+i)*3;r(c,29,y,40+Math.sin(t+i)*14,2,'#ffe0a480');r(c,290,y+15,40,2,'#ffe0a480');}
 // A small sideline windsock; it never covers a player or the ball.
 if(v.mph>.5){const y=42;r(c,12,y,2,22,'#cdd4bf');r(c,v.x<0?3:14,y,9,3,'#ef9f57');r(c,v.x<0?2:20,y+3,4,3,'#e9d6ae');}
 c.restore();
}
export function weatherFeet(c,p,x,y,w,time){
 if(w?.kind==='rain'&&Math.sin(p.phase)>0&&p.pace>.6){r(c,x-7,y+11,3,1,'#97cbd1');r(c,x+6,y+8,2,2,'#97cbd1');}
 if(w?.kind==='snow'&&Math.sin(time*1.2+p.slot)>.7)r(c,x+5,y-12,4,2,'#ebf3e77a');
}
const JOHN={
 clear:['Good footing gives you choices. Press the run gap, let that blocker engage, then accelerate. The best opening is not always the biggest one before the snap.','Nothing on the weather board is asking us to change the playbook. That leaves eleven good reasons to block somebody. Seven in the pocket game!'],
 wind:['Watch the arrow before you launch it. A longer flight gives that wind more time to move the football. The target and the green kicking window already show the adjustment.','A headwind takes distance away; a tailwind gives some back. Change ends and you have a new kicking decision. My marker has excellent range in either direction.'],
 rain:['Wet footing makes a hard cut slower. Keep the steps short and protect the ball through contact. There is still room to run; give your blocker a chance to make it.','A wet ball asks a little more of the hands. That does not mean every dropped pass was the rain. Placement and the defender still get a vote.'],
 snow:['Shorter steps, clean angles. The whole field is slower, including the defense. A patient runner can still follow a good block right through this picture.','The kicker loses some range in these conditions. Check the meter before asking for a miracle. I can draw the ball through the posts, but that does not put points on the board.'],
 heat:['Save the burst for the opening. In this heat, running and moves cost more energy. You recover while standing still, not while sprinting. Fresh legs return for the next snap.','Watch the stamina bar. You do not win a footrace by spending all your energy before the race opens up. Find the block, find the gap, then go.']
};
export function weatherSegment(w,mode='pregame',quarter=1){
 if(!w)return null;const wind=windAt(w,0),variant=(w.seed+(mode==='halftime'?1:0))%2;
 const conditions=w.roofClosed?`${w.venue.name} has the roof closed for this PGI game. The field is dry and sheltered.`:`At ${w.venue.name} in ${w.venue.city}: ${WEATHER[w.kind].name.toLowerCase()}, ${w.temperature} degrees, ${wind.mph>.5?`with a breeze around ${Math.round(wind.mph)} miles per hour`:'with calm air'}.`;
 const al=mode==='pregame'?conditions:mode==='halftime'?`The second half stays in ${w.roofClosed?'sheltered indoor':WEATHER[w.kind].name.toLowerCase()} conditions. ${wind.mph>.5?'Check the arrow after the teams change ends.':'The footing is unchanged.'}`:`This game was played in ${w.roofClosed?'sheltered indoor':WEATHER[w.kind].name.toLowerCase()} conditions. The score and the film tell us what the teams made of them.`;
 const john=w.roofClosed?'The roof keeps the weather outside. Dry footing, no wind adjustment. The people blocking and tackling still have plenty of work to do.':JOHN[w.kind][variant];
 const turns=[{speaker:'al',text:al,pose:'explain'},{speaker:'john',text:john,pose:'point'},{speaker:'al',text:w.roofClosed?'A controlled environment. The matchup supplies the uncertainty.':w.kind==='wind'?'And once the kicking meter starts, that wind adjustment is held for the kick.':w.kind==='heat'?'A good reason to use the burst when the lane opens.':'Both teams work with the same field conditions.',pose:'nod'},{speaker:'john',text:w.kind==='snow'?'The yard lines are cleared. I was ready to draw all of them myself.':w.kind==='rain'?'Keep the football dry. The marker already has its cap on. Mostly.':w.kind==='heat'?'Even my yellow marker is taking a water break.':w.kind==='wind'?'That arrow is a better scouting report than my hair right now.':'Now let us see somebody finish a block.',pose:'chuckle'}];
 return {title:'The field-level forecast',topic:'weather',visual:'weather',weather:w,quarter,turns,al,john,caption:w.venue.name,tag:w.roofClosed?'ROOF CLOSED · DRY FIELD':'READ THE FIELD · ADJUST THE PLAN'};
}
export function weatherSideline(w){return w.roofClosed?`From field level: the roof is closed and this is a dry, sheltered game. ${weatherAdvice(w,'simple')}`:`Down on the ${w.kind==='snow'?'snow-dusted':w.kind==='rain'?'wet':'playing'} field, this PGI matchup has ${WEATHER[w.kind].name.toLowerCase()} conditions. ${weatherAdvice(w,'moderate')}`;}
export function paintWeatherBoard(c,s,time,reduced,ink){
 const w=s.weather,v=windAt(w,reduced?0:time),label=weatherLabel(w),font=(text,x,y,size=18,color='#efe9d1')=>{c.fillStyle=color;c.font=`bold ${size}px monospace`;c.textAlign='left';c.fillText(text,x,y);};
 r(c,0,0,720,360,'#142d32');r(c,25,32,670,284,'#213c3f');font(label,46,78,32,'#f3d277');font(w.venue.name.toUpperCase(),46,112,18);
 r(c,46,141,260,145,w.kind==='snow'?'#91a99b':'#386d50');for(let y=160;y<275;y+=28)r(c,46,y,260,1,'#dae0c4aa');
 font(w.roofClosed?'ROOF CLOSED':`${Math.round(v.mph)} MPH  ${windArrow(v)}`,330,178,25,'#f3d277');
 const messages=w.roofClosed?['DRY FOOTING','NO WIND DRIFT']:w.kind==='rain'?['WET GRIP · GENTLER CUTS','SLIGHTLY LESS KICK RANGE']:w.kind==='snow'?['SHORT STEPS · LOWER SPEED','LESS KICK RANGE']:w.kind==='heat'?['BURST COSTS MORE ENERGY','SLOWER STAMINA RECOVERY']:w.kind==='wind'?['THROWS AND KICKS DRIFT','CHECK THE GREEN KICK ZONE']:['NORMAL GRIP AND FOOTING','RATINGS AND TIMING MATTER'];
 messages.forEach((m,i)=>font(m,330,220+i*29,15));
 if(ink){const t=reduced?1:Math.min(1,time/2),x=170+(w.kind==='wind'?45*Math.sin(w.phase):35)*t;c.strokeStyle='#f3d277';c.lineWidth=5;c.beginPath();c.moveTo(95,265);c.quadraticCurveTo(135,210,x,169);c.stroke();c.beginPath();c.arc(x,169,16,0,Math.PI*2*t);c.stroke();}
 c.save();c.beginPath();c.rect(46,141,260,145);c.clip();weatherParticles(c,{width:305,height:285},w,time,{reduced});c.restore();
 font('SIMULATED GAME CONDITIONS · SAME RULES FOR BOTH TEAMS',35,342,13,'#bbcfc7');
}
