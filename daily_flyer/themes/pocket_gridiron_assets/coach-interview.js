import {weatherAdvice,WEATHER} from './weather.js?v=29';
// The coach is a fictional representative of the selected team. Original
// dialogue describes only this simulated match; it is not a real quotation.
export function coachInterview(report,visit=0){
 if(report.mode!=='halftime'||!report.box)return null;
 const team=visit%2,t=report.teams[team],b=report.box[team],other=report.box[1-team];
 const margin=report.scores[team]-report.scores[1-team];
 const question=margin<0?`Coach, ${t.city} trails by ${-margin}. What needs to change?`:margin>0?`Coach, ${t.city} leads by ${margin}. How do you keep it going?`:`Coach, we are tied. What is the second-half message?`;
 const plan=b.fumblesLost+b.interceptions>0?`We have given it away ${b.fumblesLost+b.interceptions} time${b.fumblesLost+b.interceptions===1?'':'s'}. Secure the football first. A shorter gain is better than handing them a possession.`:b.rushYards>b.passYards?`We have ${b.rushYards} rushing yards. Keep following the blocks, and save the burst until there is daylight. Then use that run look to open a pass.`:b.attempts>0?`We are ${b.completions} for ${b.attempts} throwing it. Give the quarterback a clean first read, and make the short completion count.`:'We need a first down and a clean start. Finish the block before looking for the highlight.';
 const defense=other.rushYards>other.passYards?'On defense, keep the outside shoulder free. Chasing the runner from behind is a long afternoon.':'On defense, keep the coverage connected. One defender closes; the next one takes away the escape.';
 const active=(report.injuries||[]).filter(i=>i.team===team&&!i.returned);
 const health=active.length?`${active.map(i=>i.name).join(' and ')} ${active.length===1?'is':'are'} getting a short rest. The next player has to know the assignment.`:'We will keep rotating the workload. Fresh legs still need good decisions.';
 const field=report.weather?`${WEATHER[report.weather.kind].name} today. ${weatherAdvice(report.weather,'simple')}`:'Read the field and stay patient.';
 const turns=[{speaker:'al',text:'Casey has the head coach before the team heads into the locker room.',pose:'explain'},
 {speaker:'casey',text:question,pose:'talk'},
 {speaker:'coach',text:`${plan} ${defense}`,pose:'explain'},
 {speaker:'casey',text:`And the conditions down here? ${field}`,pose:'explain'},
 {speaker:'coach',text:`${health} Same field for both teams. Adjust the footwork, trust the plan, and play the next snap. Also, whoever took my yellow marker can leave it by the cooler.`,pose:'smile'},
 {speaker:'casey',text:'That is the plan from the sideline. Back to you, Al.',pose:'talk'}];
 return {title:`Halftime with the ${t.abbr} head coach`,topic:'coach',visual:'sideline',sideline:true,interview:true,team,weather:report.weather,turns,caption:`${t.city} · fictional PGI head coach`,tag:'HALFTIME INTERVIEW · PGI FICTION',al:turns[0].text,john:''};
}
export function addCoachInterview(report,visit=0){const segment=coachInterview(report,visit);if(!segment)return report;const segments=[...report.segments];segments.splice(Math.max(1,segments.length-1),0,segment);return {...report,segments};}
