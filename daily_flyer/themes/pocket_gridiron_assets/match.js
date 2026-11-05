import {emptySpecial} from './special-teams.js?v=31';
export const MATCH_LENGTHS=Object.freeze({
 quick:{name:'Quick game',quarterSeconds:45,multiplier:1,halftimeShow:true},
 extended:{name:'Extended game',quarterSeconds:90,multiplier:2,halftimeShow:true},
 showcase:{name:'Sunday showcase',quarterSeconds:180,multiplier:4,halftimeShow:true}
});
export function matchLength(id){return Object.hasOwn(MATCH_LENGTHS,id)?MATCH_LENGTHS[id]:MATCH_LENGTHS.quick;}
export function clockText(seconds){const n=Math.max(0,Math.ceil(seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
export function emptyBox(){return {special:emptySpecial(),plays:0,attempts:0,completions:0,rushYards:0,passYards:0,returnYards:0,takeaways:0,interceptions:0,fumblesLost:0,longest:{yards:0,player:'',kind:''}};}
export function copyBox(box){return box.map(t=>({...t,longest:{...t.longest},special:{...emptySpecial(),...t.special}}));}
// Every line below is newly written fictional fan-tribute dialogue. It reports
// only completed, penalty-adjusted game facts; no external or generated claims.
export function halftimeReport(g){
 const teams=g.teams.map(t=>({abbr:t.abbr,city:t.city,color:t.color,accent:t.accent})),scores=[...g.scores],box=copyBox(g.box),[a,b]=teams,[x,y]=box;
 const leader=scores[0]===scores[1]?null:scores[0]>scores[1]?a:b,margin=Math.abs(scores[0]-scores[1]);
 const lead=leader?`${leader.city} takes a ${margin}-point lead into the break, ${scores[0]}–${scores[1]}.`:`We reach halftime all square, ${scores[0]}–${scores[1]}.`;
 const segments=[{title:'The first-half story',al:`${lead} There is another half of football ahead of us.`,john:leader?(margin<=7?'That is a one-possession game. Both sidelines have something to build on. One good drive can change this conversation.':'The leading team has earned that cushion. Now the other sideline gets a chance to make an adjustment and answer with a drive.'):'That is a fresh contest with half the work already on film. Find one thing your team does well and give it another chance.'}];
 const total=t=>t.rushYards+t.passYards;
 segments.push({title:'Moving the football',al:`${a.abbr}: ${total(x)} offensive yards, with ${x.rushYards} rushing and ${x.passYards} passing. ${b.abbr}: ${total(y)} total, ${y.rushYards} rushing and ${y.passYards} passing.`,john:Math.max(x.rushYards,y.rushYards)>Math.max(x.passYards,y.passYards)?'I like a game that gives the runners some work. Watch the gap open, let the block develop, then get through it. The big fellows deserve a little applause too.':'There is room for the passing game in the second half. Give the quarterback a clear read and put the ball where the receiver can keep working.'});
 segments.push({title:'The quarterback conversation',al:`${a.abbr} completed ${x.completions} of ${x.attempts} passes. ${b.abbr} completed ${y.completions} of ${y.attempts}. ${x.attempts+y.attempts===0?'Neither offense has attempted a pass yet.':'Placement and timing will matter after the break.'}`,john:x.attempts+y.attempts===0?'They have kept those passing pages in the playbook. Nothing wrong with saving a little surprise for the second half.':x.completions+y.completions===0?'Those completions are still waiting for somebody. Start with a friendly throw, let the receiver settle, and build from there.':'The receiver button starts the story; where you place the ball helps finish it. I would leave the defender out of that conversation if I could.'});
 const turnovers=x.takeaways+y.takeaways;
 segments.push({title:'Possession matters',al:turnovers?`${a.abbr} has ${x.takeaways} takeaway${x.takeaways===1?'':'s'}; ${b.abbr} has ${y.takeaways}. The return yards are ${x.returnYards} for ${a.abbr} and ${y.returnYards} for ${b.abbr}.`:`Neither side has taken the ball away. Return yards: ${a.abbr} ${x.returnYards}, ${b.abbr} ${y.returnYards}.`,john:turnovers?'A change of possession gives everybody a new job. The defender becomes the runner, and suddenly the offense has to make a tackle. That is a whole team moment.':'Taking care of the football gives your teammates another chance to make something happen. That is a useful habit to take out of the locker room.'});
 const big=x.longest.yards>=y.longest.yards?{...x.longest,team:a}:{...y.longest,team:b};
 segments.push({title:big.yards?'One to remember':'A second-half opening',al:big.yards?`The longest gain so far belongs to ${big.player}: ${big.yards} yards on a ${big.kind} for ${big.team.abbr}.`:'No positive-yardage gain has reached the ledger yet. The next half is an opportunity to put one there.',john:big.yards?'That earns a second look on the chalkboard. Find what worked, then be ready when the defense gives you a different answer.':'A first down can be a good place to start. You do not have to draw the entire drive with one play.',closing:`${b.city} receives the second-half kickoff. Thanks for spending halftime in the booth with us.`});
 return {teams,scores,box,segments,injuries:structuredClone(g.injuries||[]),receivingTeam:1,weather:g.weather?structuredClone(g.weather):null};
}
