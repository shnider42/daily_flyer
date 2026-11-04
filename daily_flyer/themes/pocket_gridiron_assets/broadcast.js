import {weatherSegment} from './weather-presentation.js?v=30';
import {specialRows,specialStory} from './special-teams.js?v=30';
import {teamStrengths} from './teams.js?v=30';
import {copyBox} from './match.js?v=30';

// Original fictional fan-tribute copy. Matchup claims come from this game's
// selected lineup and arcade ratings; highlights come only from recorded plays.
const identity=t=>({abbr:t.abbr,city:t.city,color:t.color,accent:t.accent});
const player=p=>({name:p.name,number:p.number,pos:p.pos});
const top=ratings=>Object.entries(ratings).sort((a,b)=>b[1]-a[1])[0];

export function pregameReport(teams,match,weather=null){
 const [a,b]=teams,ratings=teams.map(teamStrengths),strengths=ratings.map(top);
 const segments=[{
  title:'A little field. A whole lot of football.',visual:'matchup',topic:'welcome',
  al:`Welcome to PGI. ${a.city} and ${b.city}, four ${match.quarterSeconds}-second quarters, and a fresh scoreboard. ${a.offense[0].name} and ${b.offense[0].name} lead the offenses.`,
  john:'Two teams, one football, and a fresh yellow marker. That is a pretty good evening right there. But save some applause for the blockers. Somebody has to make room for all this fun!',
  caption:'Tonight’s matchup',tag:'FOR THE LOVE OF THE GAME'
 }];
 if(weather)segments.push(weatherSegment(weather));
 for(const [i,t] of teams.entries()){
  const qb=t.offense[0],rb=t.offense[1],receiver=[...t.offense.slice(2,5)].sort((a,b)=>b.catching-a.catching)[0];
  segments.push({title:`Inside ${t.city}`,visual:'team',topic:'team',context:{team:t.city,qb:qb.name,rb:rb.name,target:receiver.name},team:i,stars:[player(qb),player(rb),player(receiver)],
   al:`Here is the cast for ${t.city}: ${qb.name}, ${rb.name}, and ${receiver.name}. Their ${t.profile.offense.name.toLowerCase()} gives us something to watch. ${strengths[i][0]} leads their PGI ratings. John, where do you start?`,
   john:`${t.profile.offense.strength}. That is the idea. But ${t.profile.offense.weakness.toLowerCase()}. A playbook is a menu, Al. You still have to get the meal out of the kitchen!`,
   caption:`${t.abbr} · selected starters`,tag:`${strengths[i][0].toUpperCase()} · ${strengths[i][1]}`});
 }
 segments.push({title:'One formation. Three different answers.',visual:'package',topic:'board',team:0,
  al:'Singleback can show a run, a quick pass, or play-action without changing the formation. The offense calls first. The defense answers with the personnel already on the field.',
  analysis:'Circle that backfield, Al. Same starting picture! On the left the back takes the ball. On the right the quarterback shows it, keeps it, and looks behind the linebackers. A few honest runs can make that fake more convincing; repeat the fake and those defenders learn. The yellow marker has no eligibility left, but it can still teach!',
  caption:'Formation lesson · illustration, not a replay',tag:'SAME LOOK · DIFFERENT ANSWER'});
 const units=teams.map(t=>t.specialists),unit=units[0];
 segments.push({title:'The third phase wins field position',visual:'team',topic:'special',team:0,context:{team:a.city,kr:unit.kr.name,pr:unit.pr.name,kicker:unit.kicker.name,punter:unit.punter.name,gunner:unit.gunner1.name},stars:[player(unit.kr),player(unit.kicker),player(unit.punter)],
  al:`For ${a.city}: ${unit.kr.name} returns kickoffs, ${unit.pr.name} handles punts, ${unit.kicker.name} kicks, and ${unit.punter.name} punts. ${b.city} counters with ${units[1].kr.name} returning and ${units[1].gunner1.name} on coverage.`,
  caption:'Selected special-teams unit · arcade assignments',tag:'RETURNS · COVERAGE · KICKING'});
 segments.push({title:'Enough talking. Let’s play.',visual:'matchup',topic:'kickoff',
  al:`${a.city} receives the opening kickoff. ${b.city} gets the ball to begin the second half. We will be back at halftime with the plays and the numbers from this game.`,
  john:'Keep the ball, find your teammates, and enjoy the next play. The marker can wait. Football cannot happen until somebody kicks the football!',
  caption:'Your game starts when you are ready',tag:'KICKOFF IS NEXT'});
 return {mode:'pregame',weather,teams:teams.map(identity),scores:[0,0],ratings,segments,
  rows:[...['kr','pr','kicker','punter','gunner1','gunner2'].map((key,i)=>[['Kick returner','Punt returner','Kicker','Punter','Left gunner','Right gunner'][i],...units.map(u=>u[key].name)]),['Quarterback',...teams.map(t=>t.offense[0].name)],['Running back',...teams.map(t=>t.offense[1].name)],
   ...Object.keys(ratings[0]).map(key=>[key,...ratings.map(r=>r[key])])],tableTitle:'The matchup · PGI arcade ratings'};
}

export function highlightFocus(clip){
 // Circle an actual recorded block when available. Otherwise use the ball
 // carrier at a recorded moment; never invent a block or a receiving route.
 const frames=clip.frames;
 if(clip.special&&!clip.special.returned){const index=Math.max(0,frames.findLastIndex(f=>f.airborne)),frame=frames[index],focus=frame.people.find(p=>p.team===clip.special.kickingTeam&&(clip.special.type==='fieldgoal'?p.carrier:p.slot===6));return {index,frame,focus,block:false,fake:false,receiver:null};}
 const stepsIn=p=>{const start=frames[0].people.find(q=>q.id===p.id&&q.team===p.team);return p.biting&&start&&(clip.anchor===1?p.y-start.y:start.y-p.y)>.3;};
 let index=frames.findIndex(f=>f.people.some(stepsIn));
 const fake=index>=0;
 if(fake){const first=index;while(index+1<frames.length&&frames[index+1].time<frames[first].time+.35&&frames[index+1].people.some(stepsIn))index++;}
 else index=frames.findIndex((f,i)=>i>frames.length*.18&&i<frames.length*.75&&f.blocks?.length);
 if(index<0)index=Math.min(frames.length-1,Math.floor(frames.length*.58));
 const frame=frames[index],block=frame.blocks?.find(b=>b.doubleTeam)||frame.blocks?.[0];
 const focus=fake?frame.people.find(stepsIn):block?frame.people.find(p=>p.id===block.blocker&&p.team===frame.offense):frame.people.find(p=>p.carrier);
 const targetId=frames.find(f=>f.targetId)?.targetId,receiver=targetId?frame.people.find(p=>p.id===targetId&&p.team===clip.original):null;
 const help=block?.doubleTeam?frame.blocks.find(b=>b.defender===block.defender&&b.blocker!==block.blocker):null,helper=help?frame.people.find(p=>p.id===help.blocker&&p.team===frame.offense):null;
 return {index,frame,focus,block:!fake&&!!block,fake,receiver,helper:fake?null:helper};
}

function replaySegments(report,recordings=[],period='first-half'){
 const ranked=[...recordings].sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);
 // Give both sidelines a look when there is eligible footage from both.
 const selected=[];
 const sides=ranked.length?[ranked[0].team,1-ranked[0].team]:[];
 for(const team of sides){const c=ranked.find(c=>c.team===team);if(c&&!selected.includes(c))selected.push(c);}
 const special=ranked.find(c=>c.special&&!selected.includes(c));if(special&&selected.length<3)selected.push(special);
 for(const c of ranked)if(selected.length<3&&!selected.includes(c))selected.push(c);
 const highlights=selected.map((clip,i)=>{
  const t=report.teams[clip.team],f=highlightFocus(clip),subject=f.focus?`#${f.focus.number} ${f.focus.name}`:'the ball carrier';
  const summary=clip.special?clip.detail:clip.kind==='TOUCHDOWN'?`${t.city} finishes this one in the end zone.`:clip.kind==='TAKEAWAY'?`${t.city} comes away with the football.`:clip.gain<0?`${Math.abs(clip.gain)} yards lost on the play.`:`${clip.gain} offensive yard${clip.gain===1?'':'s'} on the play.`;
  return {title:`Roll the tape · ${i+1}`,visual:'highlight',clip,period,topic:clip.special?'special':clip.kind==='TOUCHDOWN'?'touchdown':clip.kind==='TAKEAWAY'?'takeaway':clip.kind==='DEFENSIVE STOP'?'stop':f.block?'block':'gain',
   analysis:clip.special?(clip.special.type==='fieldgoal'?`${clip.special.player} makes this from ${clip.special.distance} yards. The yellow line follows the recorded flight. Set the power, settle the accuracy, and finish the drive with points.`:clip.special.returned?`Watch ${clip.special.player} and the blocking in front. This is a ${clip.special.yards}-yard ${clip.special.type} return. Those yards belong to the return unit, not the offense. Every coverage lane matters.`:`The receiving team starts at its own ${clip.special.spot}. Follow the recorded kick and notice where the coverage finishes. That is how the punt team changes the next drive.`):f.helper?`Two actual blockers on this frame: ${subject} and #${f.helper.number} ${f.helper.name}. Circle both! They have one defender occupied. That costs the offense a second blocker, so watch for the next free defender. The runner still has to find the opening.`:f.fake?`${clip.call?.formation||'The offense'} shows the fake. ${subject} steps toward the run; that yellow trail follows his recorded movement. Before this snap, this formation had shown ${clip.tendency?.runs||0} run${clip.tendency?.runs===1?'':'s'} and ${clip.tendency?.passes||0} pass${clip.tendency?.passes===1?'':'es'}. ${f.receiver?`The second trail follows #${f.receiver.number} ${f.receiver.name}, the intended receiver.`:'The quarterback keeps the ball through the mesh.'} A false step creates an opportunity; the offense still has to finish the play.`:f.receiver?`The second yellow trail follows #${f.receiver.number} ${f.receiver.name}, the intended receiver. The dotted flight is the actual pass. Watch where the defender and receiver separate; the marker follows what is on the tape.`:null,
   al:`${clip.quarter>4?'Overtime':`Quarter ${clip.quarter}`}. ${summary} Let’s take another look.${clip.special?'':' '+clip.detail}`,
   john:f.block?`Hold it right there! ${subject} is engaged in the block. That is why we look away from the football sometimes. The ball gets the camera; the big fellows get my yellow marker. Now roll it!`:
    clip.kind==='TAKEAWAY'?`Circle ${subject}. The football changes hands, and everybody gets a new job. That is not a souvenir—bring it back for your teammates! Roll it again.`:
    clip.kind==='DEFENSIVE STOP'?`Look at the ball carrier in that circle. That is where the defense closes the play down. You can draw an arrow through a tackler, Al, but the runner still has to get past one!`:
    `Right there: ${subject}. Follow that yellow trail. Those are the steps on the tape, not a magic shortcut. BOOM! I like a good play even more the second time.`,
   caption:`${t.abbr} · Q${clip.quarter} · ${clip.call?.name||clip.kind.toLowerCase()}`,tag:f.fake?'SELL THE RUN · FIND THE WINDOW':f.block?'GIVE THE BLOCKER SOME LOVE':clip.kind==='TOUCHDOWN'?'BOOM! · SIX ON THE BOARD':'LOOK RIGHT HERE',focus:f};
 });
 return highlights;
}
const scoreTopic=scores=>scores[0]===scores[1]?'tie':Math.abs(scores[0]-scores[1])<=7?'close':'lead';
const yardTopic=box=>box.reduce((n,b)=>n+b.rushYards,0)>box.reduce((n,b)=>n+b.passYards,0)?'run':'pass';
const boxRows=box=>[...specialRows(box),['Offensive yards',...box.map(b=>b.rushYards+b.passYards)],['Rush / pass yards',...box.map(b=>`${b.rushYards} / ${b.passYards}`)],['Passing',...box.map(b=>`${b.completions} / ${b.attempts}`)],['Takeaways',...box.map(b=>b.takeaways)],['Return yards',...box.map(b=>b.returnYards)]];
export function halftimeBroadcast(report,recordings=[]){
 const highlights=replaySegments(report,recordings);
 const story={...report.segments[0],topic:scoreTopic(report.scores),visual:'matchup',caption:'The first-half story',tag:'BACK IN THE BOOTH'};
 const moving={...report.segments[1],topic:yardTopic(report.box),visual:'stats',caption:'First-half offensive yards',tag:'THE NUMBERS BEHIND THE NOISE',
  john:report.segments[1].john+' A yard does not care whether it arrived wearing shoulder pads or flying through the air.'};
 const possession={...report.segments[3],topic:'special',visual:'stats',al:specialStory(report,0)+' '+specialStory(report,1),caption:'Special teams · field position and points',tag:'THE THIRD PHASE'};
 const closing={...report.segments[4],topic:'goodbye',visual:'matchup',caption:'The second half is yours',tag:'MORE FOOTBALL. YES, PLEASE.',
  john:'The best adjustment starts with something you can actually do. Finish a block, find an open teammate, wrap up a tackle. And somebody put the cap on my marker before I circle the whole stadium.'};
 const fallback={title:'Back to the drawing board',visual:'diagram',topic:'board',team:0,caption:'Illustrated game plan · no eligible first-half clip',tag:'A LITTLE CHALK TALK',
  al:'We do not have an eligible first-half scrimmage clip to review. This is an illustrated game plan, not a replay from your game.',
  john:'Then we teach the idea. Circle the blocker, point out the space, follow the runner. That is a lot of yellow ink for one simple thought: help the teammate with the football.'};
 return {...report,mode:'halftime',segments:[story,...(report.weather?[weatherSegment(report.weather,'halftime',3)]:[]),...(highlights.length?highlights:[fallback]),moving,possession,closing],tableTitle:'First-half box score',
  rows:boxRows(report.box)};
}

export function postgameReport(g,recordings=[]){
 const teams=g.teams.map(identity),scores=[...g.scores],box=copyBox(g.box),winner=scores[0]===scores[1]?null:teams[scores[0]>scores[1]?0:1],margin=Math.abs(scores[0]-scores[1]);
 const report={mode:'postgame',weather:g.weather,teams,scores,box,tableTitle:'Final box score',rows:boxRows(box)};
 const lead=winner?`${winner.city} takes it, ${Math.max(...scores)}–${Math.min(...scores)}.${g.quarter>4?' They needed overtime to settle this one.':margin<=7?' One score separates them at the finish.':''}`:`We finish level at ${scores[0]} apiece.`;
 const total=b=>b.rushYards+b.passYards;
 report.segments=[{title:'One more look before we go',topic:'final',visual:'matchup',al:`${lead} John, let’s put a bow on this game.`,caption:'The final word',tag:'FINAL WHISTLE'},
  ...replaySegments(report,recordings,'game'),
  ...(g.weather?[weatherSegment(g.weather,'postgame',g.quarter)]:[]),
  {title:'The yards behind the score',topic:yardTopic(box),visual:'stats',al:`${teams[0].city} finishes with ${total(box[0])} offensive yards; ${teams[1].city}, ${total(box[1])}. That is ${box[0].completions} of ${box[0].attempts} passing for ${teams[0].abbr}, and ${box[1].completions} of ${box[1].attempts} for ${teams[1].abbr}.`,caption:'Full-game production',tag:'FROM THE FINAL BOX SCORE'},
  {title:'The third phase',topic:'special',visual:'stats',al:specialStory(report,0)+' '+specialStory(report,1),caption:'Special teams · the final ledger',tag:'FIELD POSITION COUNTS'},
  {title:'Thanks for spending the game with us',topic:'final',visual:'matchup',al:`${teams[0].abbr} comes away with ${box[0].takeaways} takeaways, ${teams[1].abbr} with ${box[1].takeaways}. The final is ${scores[0]}–${scores[1]}. There is your game, John.`,closing:'Thanks for joining us. We’ll leave the next matchup to you.',caption:'For the love of the game',tag:'SEE YOU AT THE NEXT KICKOFF'}];
 return report;
}
