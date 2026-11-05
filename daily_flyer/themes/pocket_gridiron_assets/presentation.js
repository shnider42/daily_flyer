import {PERSONNEL,tendency} from './packages.js?v=32';
import {goalWindow} from './placekicks.js?v=32';
import {kickConditions} from './weather.js?v=32';
// Human-facing information. Never derive defensive guidance from the secret call.
export function showOffensiveRoutes(g){return g.userOffense&&!g.special&&!g.returnInfo&&['call','ready'].includes(g.phase);}
export function publicPlayName(g){return g.userOffense?g.playDefinition.name:g.teams[g.offense].abbr+' offense';}
// All legal kick cards for the full book. Suggested calls apply a stricter
// situation/range check below; an available 65-yard attempt is not a smart default.
export function kickOptions(g){
 if(!g.userOffense||g.paused||g.phase&&!['call','ready'].includes(g.phase))return [];
 const distance=Math.ceil(117-g.spot),cards=[];
 if(distance<=65)cards.push({id:'fieldgoal',kind:'kick',group:'kick',kickType:'fieldgoal',name:'Field goal',hint:`${distance}-yard attempt`,reason:`${distance}-yard attempt`,distance});
 if(g.down===4)cards.push({id:'punt',kind:'kick',group:'kick',kickType:'punt',name:'Punt',hint:'Trade possession for field position',reason:'Pin the opponent farther back'});
 return cards;
}
const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
function callSituation(g){
 const spot=Math.max(0,Math.min(100,finite(g.spot,25))),toGo=Math.max(1,finite(g.target,spot+10)-spot),down=finite(g.down,1),quarter=finite(g.quarter,1),clock=Math.max(0,finite(g.clock,Infinity));
 const offense=g.offense??0,score=(g.scores?.[offense]||0)-(g.scores?.[1-offense]||0),late=quarter===4&&clock<=Math.min(90,(g.quarterSeconds||180)*.4);
 return {spot,toGo,down,quarter,clock,score,goal:spot>=95,red:spot>=80,backed:spot<=5,short:toGo<=3,long:toGo>=8,late,ot:quarter>4,needScore:late&&score<0,needTD:late&&score< -3,protect:late&&score>0,halfEnd:[2,4].includes(quarter)&&clock<=12};
}
function kickRange(g,distance){
 const team=g.teams?.[g.offense??0],kicker=team?.specialists?.kicker||team?.roster?.find(p=>p.pos==='K')||team?.offense?.[0]||{};
 return goalWindow(kicker,distance,kickConditions(g)).range;
}
function suggestedKick(g,s){
 const cards=kickOptions(g),goal=cards.find(p=>p.kickType==='fieldgoal');
 if(goal&&(!s.needTD||s.goal)){
  const range=kickRange(g,goal.distance),limit=s.halfEnd?Math.min(65,range):Math.min(60,range-2);
  if(goal.distance<=limit&&(s.goal||s.down===4||s.halfEnd&&!s.protect||s.ot||s.red&&s.down===3&&!s.protect)){
   return {...goal,reason:s.needTD?'Three points will not tie the game':s.ot?'Three points win in overtime':s.halfEnd&&!s.protect?'Take the points before time expires':`${goal.distance}-yard kick · points available`};
  }
 }
 if(s.down===4&&!s.needScore&&(!s.halfEnd||s.protect)&&(s.spot<55||s.spot<75&&s.toGo>=4))return cards.find(p=>p.kickType==='punt');
 return null;
}
// A quick-game label alone is insufficient: comebacks and play-action need
// more time. Clearance routes may still run deep behind a short primary read.
const quickCall=p=>p.kind==='pass'&&p.group==='quick'&&!p.playAction&&(p.wait??1.4)<=1.6;
const directRun=p=>p.kind==='run'&&(p.delay||0)<=.4&&(p.exchange?.flight||0)<=.15;
const insideRun=p=>directRun(p)&&Math.abs((p.lane??26.5)-26.5)<=10;
function targetDepth(p){
 if(p.routes)return Math.max(...p.routes.map(r=>r.at(-1)?.[1]||0));
 return ({slants:8,curls:8,mesh:6,spot:6,levels:12,smash:26,flood:25,postwheel:35,verts:40})[p.id]??(p.group==='deep'?25:6);
}
function offensiveSuggestions(g,plays,s){
 const team=g.teams?.[g.offense??0],profile=team?.profile?.offense,recent=(g.offenseCalls?.[g.offense??0]||[]).slice(-4),kick=suggestedKick(g,s),count=4-(kick?1:0);
 const urgentPass=(s.needScore&&s.clock<=20||s.halfEnd&&!s.protect)&&!s.goal,conversion=s.down>=3&&s.long;
 let pool=plays.filter(p=>p.kind==='run'||p.kind==='pass');
 // In condensed space, keep the entire shortlist executable without waiting
 // for deep routes or a long fake. The full book remains available to explore.
 const safe=pool.filter(p=>s.backed?insideRun(p)||quickCall(p):directRun(p)||quickCall(p));
 if((s.goal||s.backed)&&safe.length>=count&&!urgentPass)pool=safe;
 if(conversion||urgentPass){const passes=pool.filter(p=>p.kind==='pass'&&(!conversion||targetDepth(p)>=Math.min(s.toGo,35)));if(passes.length>=count)pool=passes;}
 const score=p=>{
  const run=p.kind==='run',quick=quickCall(p),deep=p.group==='deep';let n=(profile?.signature?.includes(p.id)?1.7:0)+(p.system&&p.system===profile?.system?1.2:0);
  if(s.goal)n+=run?(insideRun(p)?11:7):quick?10:-14;
  else if(s.backed)n+=insideRun(p)?11:quick?10:-9;
  else if(s.short)n+=run?(insideRun(p)?8:5):quick?7:-3;
  else if(conversion)n+=run?-12:deep?9:targetDepth(p)>=s.toGo?7:0;
  else n+=run?4:quick?5:3;
  if(s.red&&!s.goal)n+=quick?4:deep?-4:1;
  if(urgentPass)n+=run?-20:deep&&s.spot<75?10:quick?7:4;
  if(s.needTD)n+=run?(s.goal?1:-3):4;
  if(s.protect)n+=run?6:quick?0:-5;
  if(p.playAction)n+=s.short||s.goal||s.backed||urgentPass||conversion?-8:2;
  if(g.personnel==='heavy')n+=quick?2:run&&!insideRun(p)?1:0;
  if(['nickel','stack'].includes(g.personnel)&&run)n+=1.5;
  n-=recent.filter(id=>id===p.id).length*2.4+(recent.at(-1)===p.id?2:0);
  return n;
 };
 let pattern;
 if(s.goal)pattern=s.needTD&&s.clock<=12?['quick','run','quick','quick']:['inside','quick','run','quick'];
 else if(s.backed&&!urgentPass)pattern=['inside','quick','quick','run'];
 else if(conversion||urgentPass)pattern=['deep','pass','pass','pass'];
 else if(s.short)pattern=['inside','quick','run','pass'];
 else if(s.needScore)pattern=['pass','pass','pass','run'];
 else if(s.protect)pattern=['run','quick','run','pass'];
 else pattern=['best','run','pass','best'];
 const accepts={best:()=>true,run:p=>p.kind==='run',inside:insideRun,pass:p=>p.kind==='pass',quick:quickCall,deep:p=>p.kind==='pass'&&p.group==='deep'};
 const selected=[],family=p=>p.kind==='run'?(p.carrier===0?'qb':insideRun(p)?'inside':p.lane<26.5?'left':'right'):p.id;
 for(const type of pattern.slice(0,count)){
  const available=pool.filter(p=>!selected.some(q=>q.id===p.id)),matching=available.filter(accepts[type]),choices=matching.length?matching:available;
  choices.sort((a,b)=>adjusted(b)-adjusted(a)||a.id.localeCompare(b.id));if(choices[0])selected.push(choices[0]);
  function adjusted(p){return score(p)-selected.filter(q=>family(q)===family(p)).length*2.5-selected.filter(q=>q.formationId&&q.formationId===p.formationId).length*.35;}
 }
 const result=selected.map(p=>({...p,reason:offensiveReason(p,s)}));
 if(kick){if(!s.needTD&&(s.halfEnd&&!s.protect||s.ot||s.down===4&&!s.goal))result.unshift(kick);else result.push(kick);}
 return result;
}
function offensiveReason(p,s){
 if(s.goal)return p.kind==='run'?'Attack the goal line':s.needTD?'Quick throw · a touchdown is needed':'Quick read in a tight end zone';
 if(s.backed)return p.kind==='run'?'Get space from your own end zone':'Quick outlet away from your end zone';
 if(s.protect)return p.kind==='run'?'Keep the clock moving':'Keep possession with a short outlet';
 if(s.halfEnd)return p.group==='deep'?'Reach scoring range before time expires':'Fast read with the clock running out';
 if(s.needTD)return p.kind==='run'?'Keep the touchdown drive alive':'Need a touchdown · keep attacking';
 if(s.short)return `${Math.ceil(s.toGo)} yards to move the chains`;
 if(s.down>=3&&s.long)return 'Routes that reach the first-down line';
 return p.kind==='run'?'Keep the defense honest':quickCall(p)?'Quick read to stay on schedule':p.playAction?'Show run · look behind the linebackers':'Stretch the coverage';
}
function defensiveSuggestions(g,plays,s){
 const system=PERSONNEL[g.personnel]?.system,profile=g.teams?.[1-(g.offense??0)]?.profile?.defense,seen=tendency(g.history?.[g.offense??0]||[]),mobile=g.teams?.[g.offense??0]?.profile?.offense?.id==='mobile';
 // The rendered pre-snap positions are public. Read those coordinates only,
 // never g.play, g.playDefinition, routes, or the CPU's pending choice.
 const receivers=['call','ready'].includes(g.phase)?(g.players||[]).slice(2,5).filter(p=>Number.isFinite(p.x)):[],bunch=receivers.some((p,i)=>receivers.slice(i+1).some(q=>Math.abs(p.x-q.x)<=8&&(p.x-26.5)*(q.x-26.5)>0)),wide=receivers.length===3&&Math.max(...receivers.map(p=>p.x))-Math.min(...receivers.map(p=>p.x))>=40;
 const pool=plays.filter(p=>!p.system||p.system===system),protectDeep=s.late&&s.score<0&&!s.red,short=s.short||s.goal;
 const metrics=p=>{
  const c=(g.format===7?p.coverage:p.fullCoverage)||p.coverage||{},zones=Object.values(c.zones||{});
  return {rush:(c.rush||[]).length,deep:zones.filter(z=>z.y>=18).length+(c.safety!==undefined?1:0),spy:c.spy!==undefined||!!c.spies?.length};
 };
 const score=p=>{
  const m=metrics(p);let n=(p.system===system?3:0)+(profile?.signature?.includes(p.id)?1:0);
  if(short)n+=(p.group==='pressure'?7:p.group==='man'?7:2)+Math.min(m.rush,6)*.5-m.deep*1.6;
  else if(s.down>=3&&s.long||protectDeep)n+=(p.group==='zone'?7:p.group==='man'?3:-3)+m.deep*1.25-Math.max(0,m.rush-4)*2;
  else n+=p.group==='zone'?5:p.group==='man'?4:3;
  if(s.red)n+=p.group==='man'?3:-m.deep*.7;
  if(!short)n+=bunch?(p.group==='zone'?1.8:p.group==='man'?-.5:0):wide&&p.group==='zone'&&m.deep>=2?1.5:0;
  if(p.id==='prevent')n+=protectDeep?10:-14;
  if(seen.total>=4)n+=seen.runRate>.62?(p.group==='pressure'?3:0):seen.runRate<.38?(p.group==='zone'?3:0):0;
  if(m.spy&&mobile&&!s.goal)n+=3;
  return n;
 };
 const ranked=[...pool].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)),selected=[];
 for(let i=0;i<4;i++){
  let available=ranked.filter(p=>!selected.some(q=>q.id===p.id));
  // A fourth card should offer a different coverage idea, not four copies of
  // the same pressure look. Long yardage still keeps help over the top.
  if(i===3&&new Set(selected.map(p=>p.group)).size===1){const variety=available.filter(p=>p.group!==selected[0].group&&(!protectDeep||metrics(p).deep>=1));if(variety.length)available=variety;}
  available.sort((a,b)=>adjusted(b)-adjusted(a)||a.id.localeCompare(b.id));if(available[0])selected.push(available[0]);
  function adjusted(p){return score(p)-selected.filter(q=>q.group===p.group).length*1.7;}
 }
 return selected.map(p=>({...p,reason:s.goal?'Protect the goal line':protectDeep?'Keep the deep ball in front':s.short?'Challenge the short-yardage gain':s.down>=3&&s.long?'Guard the first-down line':metrics(p).spy&&mobile?'Keep a defender watching the QB':seen.total>=4&&seen.runRate>.62&&p.group==='pressure'?'Answer the recent run tendency':seen.total>=4&&seen.runRate<.38&&p.group==='zone'?'Answer the recent pass tendency':bunch&&p.group==='zone'?'Keep help around the bunched receivers':wide&&p.group==='zone'?'Cover the wide receiver alignment':p.system===system?'Fits your unit already on the field':'Balance coverage and pressure'}));
}
export function suggestions(g,plays){
 const unique=[...new Map(plays.map(p=>[p.id,p])).values()],s=callSituation(g);
 return g.userOffense?offensiveSuggestions(g,unique,s):defensiveSuggestions(g,unique,s);
}
export function coachText(g,level){
 if(level==='expert')return '';
 if(g.phase==='dead')return g.contactFeedback||g.lastResult||'Choose your next call when the playbook opens.';
 if(g.phase==='penalty')return 'Accept applies the penalty. Decline keeps what happened on the play.';
 if(g.phase==='ready'&&g.userOffense&&g.playDefinition.playAction)return 'Sell the run fake, then pass with A, B or C. Repeating the fake makes it less convincing.';
 if(g.phase==='ready'&&g.userOffense&&g.playDefinition.kind==='run'&&!g.playDefinition.exchange)return 'You control the runner after SNAP. Follow the dotted lane; use BURST as the gap opens.';
 if(g.phase==='ready'&&g.userOffense&&g.playDefinition.exchange)return g.playDefinition.hint+' · steer after the exchange.';
 if(g.special?.goal)return g.userKicking?'Start the meter, set power, then stop accuracy in green.':'Opponent kicking.';
 if(g.phase.startsWith('kick_'))return g.userKicking?'Aim first. Tap twice to set power.':'Track the ring. Move after the catch; B calls a punt fair catch.';
 if(g.isLive&&!g.special&&!g.receivedPass&&g.playDefinition.kind==='run'&&g.userOffense&&g.carrier.y<g.spot+4)return g.pitch?'Wait for the exchange, then follow the dotted lane.':Math.abs(g.playDefinition.lane-26.5)>11?'Steer toward the outside lane first, then turn upfield. Burst through the opening.':'Press the marked gap. Let the blocker engage, then burst through.';
 if(g.isLive||g.isLoose)return '';
 const profile=g.teams[0].profile?.[g.userOffense?'offense':'defense'];
 if(!g.userOffense)return `${g.formation.name} is set. Your ${PERSONNEL[g.personnel].name.toLowerCase()} unit stays on. Choose coverage; the opponent’s call stays hidden.`;
 const distance=Math.ceil(g.target-g.spot),tip=g.down===4?'Reach the gold line to keep possession, or consider a kick.':g.down===3?'Look for a route that reaches the gold line.':distance<=3?'A short run can reach the gold line.':'Short passes can set up a manageable next down.';
 return level==='simple'?`${distance} yards to a first down. ${tip}`:`${profile?.strength||'Use your personnel'}. ${tip}`;
}
export function hitDefender(points,x,y,radius=26){return points.map(p=>({...p,d:Math.hypot(p.x-x,p.y-y)})).filter(p=>p.d<=radius).sort((a,b)=>a.d-b.d)[0]?.index??null;}

export const BOOK_FILTERS={offense:[['all','ALL'],['new','NEW'],['run','RUN'],['quick','QUICK'],['deep','DEEP'],['pa','PA']],defense:[['all','ALL'],['new','NEW'],['zone','ZONE'],['man','MAN'],['pressure','PRESSURE']]};
export function bookPage(plays,filter='all',page=0,size=6){
 const filtered=filter==='all'?plays:plays.filter(p=>filter==='new'?p.edition===31:filter==='pa'?!!p.playAction:p.group===filter),pages=Math.max(1,Math.ceil(filtered.length/size)),index=Math.max(0,Math.min(pages-1,page));
 return {plays:filtered.slice(index*size,(index+1)*size),page:index,pages,total:filtered.length};
}
