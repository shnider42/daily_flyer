import {FRONTS} from './defensive-systems.js?v=33';
import {jobs} from './assignment-books.js?v=33';
import {formationOf,PERSONNEL} from './packages.js?v=33';
import {fullFormation} from './full-team.js?v=33';
import {fullCalls,routeFor} from './plays.js?v=33';

const oldSeven=Object.fromEntries(Object.entries({
 zone:'R R HL HR FL FR H',man:'R R m4 MID m2 m3 H',press:'R R m4 R m2 m3 H',
 robber:'R R m4 LOW m2 m3 H',blitz:'R R R HR FL FR H',commit:'R R R R FL FR H',
 cover2:'R R HL HR FL L D',cover3:'R R HL HR TL TR TM',prevent:'R R TL TR Q2 Q3 HIGH'
}).map(([id,row])=>[id,jobs(row)]));
const colors={Rush:'#ffae72',Zone:'#85c9ff',Man:'#f9dc80',Spy:'#caa4ff',Help:'#9de5b0'};
const receivers={1:'RB',2:'A',3:'B',4:'C',10:'FB'};
export function roleFor(call,slot,format,personnel='base'){
 const c=(format===11?call.fullCoverage:null)||call.coverage||oldSeven[call.id];
 if(!c)return {kind:'Zone',label:'Read the play'};
 if(c.rush.includes(slot)||personnel==='heavy'&&slot===2)return {kind:'Rush',label:c.stunt?.includes(slot)?'Twist rush':'Rush the passer'};
 if(c.spy===slot||c.spies?.includes(slot))return {kind:'Spy',label:'Spy the QB'};
 if(c.man?.[slot]!==undefined)return {kind:'Man',label:'Man on '+receivers[c.man[slot]],receiver:c.man[slot]};
 if(c.bracket&&[c.bracket.under,c.bracket.over].includes(slot))return {kind:'Help',label:(c.bracket.over===slot?'Over ':'Under ')+receivers[c.bracket.slot],receiver:c.bracket.slot};
 if(c.safety===slot)return {kind:'Help',label:'Deep safety',zone:{x:26.5,y:24}};
 const z=c.zones[slot],side=z.x<21?'left':z.x>32?'right':'middle';
 return {kind:'Zone',label:(z.y>=18?'Deep ':z.y<=6?'Short ':'Hook ')+side,zone:z};
}
const sx=x=>12+x*4, sy=y=>99-y*2.25;
const circle=(x,y,color,r=3)=>`<circle cx="${sx(x)}" cy="${sy(y)}" r="${r}" fill="${color}"/>`;
function line(start,end,color){
 const x=sx(end[0]),y=sy(end[1]),dx=x-sx(start[0]),dy=y-sy(start[1]);
 const length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
 return `<path d="M${sx(start[0])} ${sy(start[1])} L${x} ${y} M${x-ux*5-uy*3} ${y-uy*5+ux*3} L${x} ${y} L${x-ux*5+uy*3} ${y-uy*5-ux*3}" stroke="${color}" stroke-width="2" fill="none"/>`;
}
const label=(x,y,word,color)=>`<text x="${sx(x)}" y="${sy(y)-4}" fill="${color}" font-size="9" text-anchor="middle">${word}</text>`;
const board=(marks,view="0 0 238 126")=>`<svg viewBox="${view}" aria-hidden="true"><path d="M6 31H232 M6 65H232" stroke="#304947" stroke-dasharray="3 4"/><path d="M6 99H232" stroke="#7ca29c"/>${marks}</svg>`;
export function defenseBoard(game,call,focus){
 const front=FRONTS[call.system||PERSONNEL[game.personnel].system]||FRONTS.fourthree;
 const roles=game.defenders.map((_,i)=>roleFor(call,i,game.format,game.personnel));
 const counts={};for(const role of roles)counts[role.kind]=(counts[role.kind]||0)+1;
 const kind=counts[focus]?focus:roles[game.selected]?.kind||roles[0].kind;
 const marks=[],dots=[],focusPoints=[];
 roles.forEach((role,i)=>{
  const start=[front.x[i],front.y[i]],active=role.kind===kind,color=active?colors[kind]:'#79918a';
  if(active){
   const rx=game.players[role.receiver]?.x;
   const end=role.zone?[role.zone.x,role.zone.y]:role.receiver!==undefined?[rx,9]:kind==='Rush'?[26.5,-5]:[26.5,4];
   focusPoints.push(start,end);
   marks.push(line(start,end,color));
   if(role.zone)marks.push(`<ellipse cx="${sx(end[0])}" cy="${sy(end[1])}" rx="12" ry="6" fill="${color}" opacity=".35"/>`);
   if(role.receiver!==undefined)marks.push(label(end[0],end[1],receivers[role.receiver],color));
  }
  dots.push(circle(...start,color,i===game.selected?4.6:3.1));
  if(active&&kind==='Rush')dots.push(`<text x="${sx(start[0])}" y="${sy(start[1])-5}" fill="#ffe9cf" font-size="5" text-anchor="middle">${game.defenders[i].number}</text>`);
 });
 let view;
 if(kind==='Rush'||kind==='Spy'){
  // Frame the relevant part of the field: five rush paths need the pocket,
  // while a deep shell needs the full width and depth of the chalkboard.
  const xs=focusPoints.map(point=>sx(point[0])),ys=focusPoints.map(point=>sy(point[1]));
  const left=Math.min(...xs)-12,top=Math.min(...ys)-12;
  const width=Math.max(68,Math.max(...xs)-left+12),height=Math.max(31,Math.max(...ys)-top+7);
  view=[left,top,width,height].join(' ');
 }
 return {diagram:board([...marks,...dots].join(''),view),kind,counts,assignment:roles[game.selected]?.label};
}
export function offenseBoard(call,format){
 const play=format===11?fullCalls.get(call.id):call;
 const formation=format===11?fullFormation(formationOf(play)):formationOf(play);
 const marks=[];
 if(play.kind==='pass'){
  for(const [i,color] of ['#f8d16d','#8fcdff','#aee4a5'].entries()){
   const slot=i+2,p={slot,speed:7.5,routeRunning:85,routeStart:{x:formation.x[slot],y:formation.y[slot]}};
   const points=Array.from({length:35},(_,n)=>routeFor(play,p,n*.18,0));
   marks.push(`<polyline points="${points.map(q=>sx(q.x)+','+sy(q.y)).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2"/>`);
   const tip=points.at(-1);marks.push(label(tip.x,Math.min(39,tip.y),'ABC'[i],color));
  }
 }else{
  const slot=play.carrier??1;
  const start=[formation.x[slot],formation.y[slot]],gap=[play.lane??26.5,0];
  marks.push(line(start,gap,'#ffae72'),line(gap,[gap[0],19],'#ffae72'),label(gap[0],19,'RUN','#ffae72'));
  for(const block of [...(play.pulls||[play.pull]),play.lead].filter(Boolean)){
   if(block.slot<format)marks.push(line([formation.x[block.slot],formation.y[block.slot]],[block.x,4],'#9de5b0'));
  }
 }
 for(let i=0;i<format;i++)marks.push(circle(formation.x[i],formation.y[i],i===0?'#fff0bb':'#acbdb4'));
 return board(marks.join(''));
}
