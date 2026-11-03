// Public alignments and observed tendencies. None of these reads a hidden call.
export const FORMATIONS={
 singleback:{name:'Singleback',x:[26.5,27,7,46,36,23,30],y:[-4,-7,0,0,-.5,-.5,-.5]},
 pistol:{name:'Pistol',x:[26.5,26.5,7,46,36,23,30],y:[-7,-10,0,0,-.5,-.5,-.5]},
 bunch:{name:'Bunch right',x:[26.5,22,36,43,39,23,30],y:[-4,-7,-1,0,-2,-.5,-.5]},
 special:{name:'Special looks'}
};
export function formationOf(play){
 if(play.formationId&&FORMATIONS[play.formationId])return {id:play.formationId,...FORMATIONS[play.formationId]};
 const names={counter:'Offset left',flood:'Boot right',sweepleft:'Wing left',tossleft:'Toss left wing',tossright:'Toss right wing',jetsweep:'Jet slot'};
 if(names[play.id])return {id:play.id,name:names[play.id],x:play.formation||(play.id==='counter'?[26.5,35,7,46,16,23,30]:[31,25,7,44,35,25,32]),y:FORMATIONS.singleback.y};
 return {id:'singleback',...FORMATIONS.singleback};
}
export const packageOf=play=>FORMATIONS[formationOf(play).id]?formationOf(play).id:'special';
export const PERSONNEL={base:{name:'Base',label:'2 DL · 2 LB · 3 DB'},nickel:{name:'Nickel',label:'2 DL · 1 LB · 4 DB'},heavy:{name:'Heavy',label:'3 DL · 2 LB · 2 DB'}};
const DL=['DL','DT','DE'],LB=['LB','OLB','ILB'],DB=['DB','CB','S','FS','SS'];
export function defensiveUnit(team,id='base'){
 const unit=[...team.defense];if(id==='base')return unit;
 const slot=id==='nickel'?3:4,positions=id==='nickel'?DB:DL;
 const candidates=(team.roster||[]).filter(p=>positions.includes(p.pos)&&!unit.some(d=>d.id===p.id));
 candidates.sort((a,b)=>(b.recognition||70)+(id==='nickel'?b.coverage:b.shed)-(a.recognition||70)-(id==='nickel'?a.coverage:a.shed)||String(a.id).localeCompare(String(b.id)));
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
