import {teamStrengths} from './teams.js?v=12';

// Original fictional fan-tribute copy. Matchup claims come from this game's
// selected lineup and arcade ratings; highlights come only from recorded plays.
const identity=t=>({abbr:t.abbr,city:t.city,color:t.color,accent:t.accent});
const player=p=>({name:p.name,number:p.number,pos:p.pos});
const top=ratings=>Object.entries(ratings).sort((a,b)=>b[1]-a[1])[0];

export function pregameReport(teams,match){
 const [a,b]=teams,ratings=teams.map(teamStrengths),strengths=ratings.map(top);
 const segments=[{
  title:'A little field. A whole lot of football.',visual:'matchup',
  al:`Welcome to PGI. ${a.city} and ${b.city}, four ${match.quarterSeconds}-second quarters, and a fresh scoreboard. ${a.offense[0].name} and ${b.offense[0].name} lead the offenses.`,
  john:'Two teams, one football, and a fresh yellow marker. That is a pretty good evening right there. But save some applause for the blockers. Somebody has to make room for all this fun!',
  caption:'Tonight’s matchup',tag:'FOR THE LOVE OF THE GAME'
 }];
 for(const [i,t] of teams.entries()){
  const qb=t.offense[0],rb=t.offense[1],receiver=[...t.offense.slice(2,5)].sort((a,b)=>b.catching-a.catching)[0];
  segments.push({title:`Inside ${t.city}`,visual:'team',team:i,stars:[player(qb),player(rb),player(receiver)],
   al:`${t.abbr} brings ${t.profile.offense.name.toLowerCase()}. Watch ${qb.name} at quarterback, ${rb.name} in the backfield, and ${receiver.name} as a target. ${strengths[i][0]} is their highest-rated unit in this PGI lineup.`,
   john:`${t.profile.offense.strength}. That is the idea. But ${t.profile.offense.weakness.toLowerCase()}. A playbook is a menu, Al. You still have to get the meal out of the kitchen!`,
   caption:`${t.abbr} · selected starters`,tag:`${strengths[i][0].toUpperCase()} · ${strengths[i][1]}`});
 }
 const protection=ratings[0].Protection,pressure=ratings[1].Pressure;
 segments.push({title:'Get the big fellows involved',visual:'diagram',team:0,
  al:`Our game-plan board: ${a.abbr}'s protection is rated ${protection}; ${b.abbr}'s pressure is ${pressure}. Those are arcade ratings, not a prediction. ${a.offense[5].name} and ${a.offense[6].name} have work to do.`,
  john:'Watch the yellow circle. A block buys a little time; the runner finds a little daylight. BOOM! That is the idea. I have drawn three arrows and somehow none of them go to the snack table.',
  caption:'Illustrated game plan · not a played highlight',tag:'JOHN’S YELLOW MARKER'});
 segments.push({title:'Enough talking. Let’s play.',visual:'matchup',
  al:`${a.city} receives the opening kickoff. ${b.city} gets the ball to begin the second half. We will be back at halftime with the plays and the numbers from this game.`,
  john:'Keep the ball, find your teammates, and enjoy the next play. The marker can wait. Football cannot happen until somebody kicks the football!',
  caption:'Your game starts when you are ready',tag:'KICKOFF IS NEXT'});
 return {mode:'pregame',teams:teams.map(identity),scores:[0,0],ratings,segments,
  rows:[['Quarterback',...teams.map(t=>t.offense[0].name)],['Running back',...teams.map(t=>t.offense[1].name)],
   ...Object.keys(ratings[0]).map(key=>[key,...ratings.map(r=>r[key])])],tableTitle:'The matchup · PGI arcade ratings'};
}

export function highlightFocus(clip){
 // Circle an actual recorded block when available. Otherwise use the ball
 // carrier at a recorded moment; never invent a block or a receiving route.
 const frames=clip.frames;
 let index=frames.findIndex((f,i)=>i>frames.length*.18&&i<frames.length*.75&&f.blocks?.length);
 if(index<0)index=Math.min(frames.length-1,Math.floor(frames.length*.58));
 const frame=frames[index],block=frame.blocks?.[0];
 const focus=block?frame.people.find(p=>p.id===block.blocker&&p.team===frame.offense):frame.people.find(p=>p.carrier);
 return {index,frame,focus,block:!!block};
}

export function halftimeBroadcast(report,recordings=[]){
 const ranked=[...recordings].sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);
 // Give both sidelines a look when there is eligible footage from both.
 const selected=[];
 const sides=ranked.length?[ranked[0].team,1-ranked[0].team]:[];
 for(const team of sides){const c=ranked.find(c=>c.team===team);if(c&&!selected.includes(c))selected.push(c);}
 for(const c of ranked)if(selected.length<3&&!selected.includes(c))selected.push(c);
 const highlights=selected.map((clip,i)=>{
  const t=report.teams[clip.team],f=highlightFocus(clip),subject=f.focus?`#${f.focus.number} ${f.focus.name}`:'the ball carrier';
  const summary=clip.kind==='TOUCHDOWN'?`${t.city} finishes this one in the end zone.`:clip.kind==='TAKEAWAY'?`${t.city} comes away with the football.`:clip.gain<0?`${Math.abs(clip.gain)} yards lost on the play.`:`${clip.gain} offensive yard${clip.gain===1?'':'s'} on the play.`;
  return {title:`Roll the tape · ${i+1}`,visual:'highlight',clip,
   al:`Quarter ${clip.quarter}. ${summary} Here is the actual first-half replay. ${clip.detail}`,
   john:f.block?`Hold it right there! ${subject} is engaged in the block. That is why we look away from the football sometimes. The ball gets the camera; the big fellows get my yellow marker. Now roll it!`:
    clip.kind==='TAKEAWAY'?`Circle ${subject}. The football changes hands, and everybody gets a new job. That is not a souvenir—bring it back for your teammates! Roll it again.`:
    clip.kind==='DEFENSIVE STOP'?`Look at the ball carrier in that circle. That is where the defense closes the play down. You can draw an arrow through a tackler, Al, but the runner still has to get past one!`:
    `Right there: ${subject}. Follow that yellow trail. Those are the steps on the tape, not a magic shortcut. BOOM! I like a good play even more the second time.`,
   caption:`${t.abbr} · Q${clip.quarter} · ${clip.kind.toLowerCase()}`,tag:f.block?'GIVE THE BLOCKER SOME LOVE':clip.kind==='TOUCHDOWN'?'BOOM! · SIX ON THE BOARD':'LOOK RIGHT HERE',focus:f};
 });
 const story={...report.segments[0],visual:'matchup',caption:'The first-half story',tag:'BACK IN THE BOOTH'};
 const moving={...report.segments[1],visual:'stats',caption:'First-half offensive yards',tag:'THE NUMBERS BEHIND THE NOISE',
  john:report.segments[1].john+' A yard does not care whether it arrived wearing shoulder pads or flying through the air.'};
 const possession={...report.segments[3],visual:'stats',caption:'Possession and production',tag:'HANG ON TO THAT FOOTBALL'};
 const closing={...report.segments[4],visual:'matchup',caption:'The second half is yours',tag:'MORE FOOTBALL. YES, PLEASE.',
  john:'The best adjustment starts with something you can actually do. Finish a block, find an open teammate, wrap up a tackle. And somebody put the cap on my marker before I circle the whole stadium.'};
 const fallback={title:'Back to the drawing board',visual:'diagram',team:0,caption:'Illustrated game plan · no eligible first-half clip',tag:'A LITTLE CHALK TALK',
  al:'We do not have an eligible first-half scrimmage clip to review. This is an illustrated game plan, not a replay from your game.',
  john:'Then we teach the idea. Circle the blocker, point out the space, follow the runner. That is a lot of yellow ink for one simple thought: help the teammate with the football.'};
 return {...report,mode:'halftime',segments:[story,...(highlights.length?highlights:[fallback]),moving,possession,closing],tableTitle:'First-half box score',
  rows:[['Offensive yards',...report.box.map(b=>b.rushYards+b.passYards)],['Rush / pass yards',...report.box.map(b=>`${b.rushYards} / ${b.passYards}`)],
   ['Passing',...report.box.map(b=>`${b.completions} / ${b.attempts}`)],['Takeaways',...report.box.map(b=>b.takeaways)],['Return yards',...report.box.map(b=>b.returnYards)]]};
}
