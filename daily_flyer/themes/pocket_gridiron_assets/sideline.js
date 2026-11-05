import {weatherSideline} from './weather-presentation.js?v=32';
import {specialStory} from './special-teams.js?v=32';
// Casey Reed is an original fictional PGI reporter. Reports use snapshots of
// this game's lineup and box score. Coach dialogue is labeled PGI fiction.
export const REPORTER={id:'casey',name:'Casey Reed',label:'CASEY',location:'ON THE SIDELINE'};
const intros=[
 'Let’s go down to Casey Reed on the sideline.',
 'Casey Reed has a closer look from field level. Casey?',
 'Before we come back to the board, Casey, what stands out down there?',
 'A quick stop at field level. Here is Casey Reed.'
];
const tags=[
 ['Back to you, Al. John, I can see the yellow marker from here.','That means the cap is off. Thank you, Casey!'],
 ['Back to the booth. I have the microphone; you two have the comfortable chairs.','A fair division of labor. Thanks, Casey.'],
 ['That is the view from down here. Back to you.','Thanks, Casey. Different angle, same team effort.'],
 ['Back upstairs. I will leave the circles to John.','Good! I brought enough yellow ink for both sidelines.']
];

export function sidelineSlot(report,visit=0){
 const mode=report.mode||'halftime';
 // One at the break. Pregame and final-whistle visits rotate across games.
 const period=mode==='pregame'?2:mode==='postgame'?3:1;
 if(visit%period!==0)return null;
 const appearance=Math.floor(visit/period),team=appearance%2;
 const weatherIndex=report.segments.findIndex(s=>s.topic==='weather');
 if(report.weather&&weatherIndex>=0&&(report.weather.kind!=='clear'||appearance%2===0))return {index:weatherIndex,team,appearance,text:weatherSideline(report.weather)};
 if(mode==='pregame'){
  const index=report.segments.findIndex(s=>s.topic==='special');
  const c=report.segments[index]?.context;if(index<0||!c?.kr||!c?.kicker||!c?.punter)return null;
  const lines=[
   `${c.kr} is the selected kickoff returner for ${c.team}, with ${c.pr} handling punts. The return can go left, middle, or right. The blockers need a direction before that ball arrives.`,
   `${c.kicker} handles place kicks for ${c.team}; ${c.punter} handles punts. Power buys distance, but placement and coverage decide what happens after the ball comes down.`,
   `${c.gunner} leads one edge of the ${c.team} coverage unit. A fast trip downfield helps only if the coverage keeps the returner inside the help.`,
   `For ${c.team}, watch ${c.pr} on punts and ${c.kr} on kickoffs. A fair catch can be a useful decision. There is no bonus for running directly into somebody's shoulder pads.`
  ];
  return {index,team:report.segments[index].team,appearance,text:lines[appearance%lines.length]};
 }
 if(!report.box||!report.teams?.[team])return null;
 const index=report.segments.findIndex(s=>s.topic==='special'&&s.visual==='stats');
 if(index<0)return null;
 return {index,team,appearance,text:specialStory(report,team)};
}

export function addSideline(report,visit=0){
 const slot=sidelineSlot(report,visit);if(!slot)return report;
 const {index,team,appearance,text}=slot,[tag,response]=tags[appearance%tags.length];
 const turns=[{speaker:'al',text:intros[appearance%intros.length],pose:'explain'},
  {speaker:REPORTER.id,text:`${text} ${tag}`,pose:appearance%2?'explain':'talk'},
  {speaker:appearance%2?'al':'john',text:response,pose:appearance%2?'nod':'chuckle'}];
 const segments=[...report.segments];
 segments[index]={...segments[index],title:'A word from the field',visual:'sideline',sideline:true,team,turns,closing:null,
  al:turns.filter(t=>t.speaker==='al').map(t=>t.text).join(' '),john:turns.filter(t=>t.speaker==='john').map(t=>t.text).join(' '),
  caption:`${report.teams[team].city} sideline`,tag:'CASEY REED · FIELD REPORT'};
 return {...report,segments};
}
