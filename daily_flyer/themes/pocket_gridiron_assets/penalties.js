export const PENALTIES={offside:{name:'OFFSIDE',yards:5},encroachment:{name:'ENCROACHMENT',yards:5},holding:{name:'OFFENSIVE HOLDING',yards:10}};
export function acceptedPenalty(start,flags){
 const both=new Set(flags.map(f=>f.team)).size>1,f=flags[0],rule=PENALTIES[f.type];
 const scores=[...start.scores],stats={...start.stats};
 if(both)return {scores,stats,pending:{offense:start.offense,spot:start.spot,down:start.down,target:start.target,extend:true},title:'OFFSETTING FOULS',detail:'Both teams flagged · replay the down'};
 const offenseFoul=f.team===start.offense;
 if(f.team===0)stats.penalties=(stats.penalties||0)+1;
 if(f.type==='holding'&&f.y<=0){scores[1-start.offense]+=2;return {scores,stats,pending:{kickoff:start.offense,kickSpot:20},title:'HOLDING · SAFETY',detail:'Holding in the offense’s end zone · two points'};}
 // Pocket holding uses the previous spot. Return and downfield holding are
 // deliberately outside this first penalty model.
 const yards=Math.min(rule.yards,(offenseFoul?start.spot:100-start.spot)/2),spot=start.spot+(offenseFoul?-yards:yards);
 const first=spot>=start.target;
 if(f.team===0)stats.penaltyYards=(stats.penaltyYards||0)+yards;
 return {scores,stats,pending:{offense:start.offense,spot,down:first?1:start.down,target:first?Math.min(100,spot+10):start.target,extend:!offenseFoul&&f.type!=='encroachment'},title:rule.name,detail:`${yards<rule.yards?'Half the distance':`${yards} yards`} · ${first?'first down':'replay the down'}`};
}
export function outcomeValue(outcome,team){
 const p=outcome.pending,score=(outcome.scores[team]-outcome.scores[1-team])*1000;
 if(p.kickoff!==undefined||p.extraPoint!==undefined)return score;
 const down=p.down??(p.newSeries?1:outcome.nextDown??2);
 const drive=200+p.spot+(5-down)*6;
 return score+(p.offense===team?drive:-drive);
}
