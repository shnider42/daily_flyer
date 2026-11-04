// Public alignments and observed tendencies. None of these reads a hidden call.
export const FORMATIONS={
 singleback:{name:'Singleback',x:[26.5,27,7,46,36,23,30],y:[-4,-7,0,0,-.5,-.5,-.5]},
 pistol:{name:'Pistol',x:[26.5,26.5,7,46,36,23,30],y:[-7,-10,0,0,-.5,-.5,-.5]},
 bunch:{name:'Bunch right',x:[26.5,22,36,43,39,23,30],y:[-4,-7,-1,0,-2,-.5,-.5]},
 shotgun:{name:'Shotgun · Run & Gun',x:[26.5,20,6,47,34,23,30],y:[-6,-6,-.5,-.5,-1.5,-.5,-.5],full:{eligible:[[6,-.5],[47,-.5],[34,-1.5]],back:[22,-2]}},
 proset:{name:'Pro split backs',x:[26.5,21,7,46,36.5,23,30],y:[-3,-5,-.5,-1.5,-.5,-.5,-.5],full:{eligible:[[7,-.5],[46,-1.5],[36.5,-.5]],back:[31,-5]}},
 wingt:{name:'Wing-T',x:[26.5,22,7,43,36,23,30],y:[-2,-6,-.5,-.5,-2,-.5,-.5],full:{eligible:[[7,-.5],[43,-.5],[36,-2]],back:[26.5,-4.5]}},
 airraid:{name:'Wide gun · Air Raid',x:[26.5,32,3,50,33,23,30],y:[-6,-6,-.5,-.5,-1.5,-.5,-.5],full:{eligible:[[3,-.5],[50,-.5],[33,-1.5]],back:[21,-2]}},
 iform:{name:'Power I',x:[26.5,26.5,7,46,36.5,23,30],y:[-3,-8.5,-.5,-1.5,-.5,-.5,-.5],full:{eligible:[[7,-.5],[46,-1.5],[36.5,-.5]],back:[26.5,-5.5]}},
 spread:{name:'Spread · QB run',x:[26.5,21,5,48,37,23,30],y:[-6,-6,-.5,-.5,-1.5,-.5,-.5],full:{eligible:[[5,-.5],[48,-.5],[37,-1.5]],back:[18,-2]}},
 pistolstrong:{name:'Strong pistol',x:[26.5,26.5,7,46,36.5,23,30],y:[-5.5,-9,-.5,-1.5,-.5,-.5,-.5],full:{eligible:[[7,-.5],[46,-1.5],[36.5,-.5]],back:[32,-5.5]}},
 special:{name:'Special looks'}
};
export function formationOf(play){
 if(play.formationId&&FORMATIONS[play.formationId])return {id:play.formationId,...FORMATIONS[play.formationId]};
 const names={counter:'Offset left',flood:'Boot right',sweepleft:'Wing left',tossleft:'Toss left wing',tossright:'Toss right wing',jetsweep:'Jet slot'};
 if(names[play.id])return {id:play.id,name:names[play.id],x:play.formation||(play.id==='counter'?[26.5,35,7,46,16,23,30]:[31,25,7,44,35,25,32]),y:FORMATIONS.singleback.y};
 return {id:'singleback',...FORMATIONS.singleback};
}
export const packageOf=play=>FORMATIONS[formationOf(play).id]?formationOf(play).id:'special';
export const PERSONNEL={
 base:{name:'4–3 Base',system:'fourthree',label:'2 DL · 2 LB · 3 DB',fullLabel:'4 DL · 3 LB · 4 DB',counts:[4,3,4],hint:'Four down linemen. Balanced run fits; seams and short outlets test the coverage.'},
 odd:{name:'3–4 Odd',system:'odd',label:'2 DL · 2 LB · 3 DB',fullLabel:'3 DL · 4 LB · 4 DB',counts:[3,4,4],hint:'Three down linemen and four linebackers. Vary the fourth rusher; protect the flats.'},
 bear:{name:'46 Bear',system:'bear',label:'2 DL · 2 LB · 3 DB',fullLabel:'4 DL · 3 LB · 4 DB',counts:[4,3,4],hint:'Crowd the interior and bring pressure. Quick throws and deep isolation are the tradeoff.'},
 nickel:{name:'4–2–5 Nickel',system:'nickel',label:'2 DL · 1 LB · 4 DB',fullLabel:'4 DL · 2 LB · 5 DB',counts:[4,2,5],hint:'Five defensive backs answer spread passing. Fewer linebackers to meet a power run.'},
 stack:{name:'3–3–5 Stack',system:'stack',label:'2 DL · 1 LB · 4 DB',fullLabel:'3 DL · 3 LB · 5 DB',counts:[3,3,5],hint:'Stack linebackers behind a three-man line. Flexible coverage; a lighter front against the run.'},
 heavy:{name:'Heavy',system:'heavy',label:'3 DL · 2 LB · 2 DB',fullLabel:'5 DL · 3 LB · 3 DB',counts:[5,3,3],hint:'Extra size for short yardage. Fewer defensive backs to protect space.'}
};
export const personnelLabel=(id,format=11)=>PERSONNEL[id][format===11?'fullLabel':'label'];
export function supportsPersonnel(team,id,format=11){
 const need=format===11?PERSONNEL[id].counts:id==='heavy'?[3,2,2]:['nickel','stack'].includes(id)?[2,1,4]:[2,2,3];
 return [DL,LB,DB].every((group,i)=>team.roster.filter(p=>group.includes(p.pos)).length>=need[i]);
}
export function choosePersonnel(team,id,format=11){return PERSONNEL[id]&&supportsPersonnel(team,id,format)?id:'base';}
const DL=['DL','DT','DE'],LB=['LB','OLB','ILB'],DB=['DB','CB','S','FS','SS'];
export function defensiveUnit(team,id='base'){
 const unit=[...team.defense];if(['base','odd','bear'].includes(id))return unit;
 const nickel=['nickel','stack'].includes(id),slot=nickel?3:4,positions=nickel?DB:DL;
 const candidates=(team.roster||[]).filter(p=>positions.includes(p.pos)&&!unit.some(d=>d.id===p.id));
 candidates.sort((a,b)=>(b.recognition||70)+(nickel?b.coverage:b.shed)-(a.recognition||70)-(nickel?a.coverage:a.shed)||String(a.id).localeCompare(String(b.id)));
 if(candidates[0]){if(id==='heavy')return [unit[0],unit[1],candidates[0],unit[2],unit[3],unit[5],unit[6]];unit[slot]=candidates[0];}return unit;
}
export function tendency(history=[]){
 const runs=history.filter(k=>k==='run').length,pa=history.filter(k=>k==='playaction').length;
 // A small prior prevents one call from turning into a certainty.
 return {runs,passes:history.length-runs,pa,total:history.length,runRate:(runs+2)/(history.length+4),fakeRate:pa/(history.length+4)};
}
export function fakeRead({difficulty='pro',defender,qb,rb,unitRecognition=80,seen,slot}){
 const t=tendency(seen),recognition=((defender.recognition||80)*.75+unitRecognition*.25);
 const craft=((qb.composure||80)+(qb.accuracy||80)+(rb.agility||80))/3;
 const level={rookie:.12,pro:0,legend:-.10}[difficulty]??0;
 const chance=Math.max(.04,Math.min(.82,.27+level+(t.runRate-.5)*.65-t.fakeRate*.5+(craft-recognition)*.009-(slot>=4?.08:0)));
 const duration=Math.max(.30,Math.min(1.35,.72+level*1.8+(85-recognition)*.014+(t.runRate-.5)*.4));
 return {chance,duration};
}
