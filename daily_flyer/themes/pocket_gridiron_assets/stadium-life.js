// Presentation state uses game events, never a random roll from the simulation.
export function crowdReaction(e,home=0){
 if(e.scorePoints)return {mood:e.scoreTeam===home?'ROAR':'GROAN',level:e.scoreTeam===home?.34:.16,seconds:4.5};
 if(e.type==='turnover')return {mood:'GASP',level:.28,seconds:2.5};
 if(e.type==='ball'&&e.text==='FUMBLE!')return {mood:'GASP',level:.24,seconds:1.8};
 if(e.type==='result'&&e.text==='FIRST DOWN!')return {mood:'CHEER',level:.18,seconds:1.7};
 if(e.type==='result'&&/NO GOOD|MISSED|INCOMPLETE/.test(e.text))return {mood:'GROAN',level:.12,seconds:1.6};
 if(e.type==='result'&&/DOWNS/.test(e.text))return {mood:'ROAR',level:.25,seconds:2.3};
 if(e.type==='flag')return {mood:'MURMUR',level:.10,seconds:1};
 return null;
}
export function crowdBed(g){
 if(!g)return .012;
 if(g.practice)return .006;
 if(g.phase==='tv_timeout')return .018;
 const close=Math.abs(g.scores[0]-g.scores[1])<=8,late=g.quarter>=4&&g.clock<=60;
 if(g.isLive)return .035+Math.max(0,(g.carrier.y-55)/45)*.12+(close&&late?.035:0);
 if(['call','ready'].includes(g.phase))return g.offense===1?.045+(g.down>=3?.045:0):.016;
 return .02;
}
