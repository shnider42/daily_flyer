// Keep the pocket game's three receiver buttons; add a real five-man line,
// a lead blocker, and a 4–3 defense. Every added athlete comes from this roster.
const OL=['OL','C','G','T','OT','OG'],DL=['DL','DT','DE'],LB=['LB','ILB','OLB'],DB=['DB','CB','S','FS','SS'];
export function fullUnit(team,side,base,personnel='base'){
 const unit=[...base],positions=side==='offense'?[OL,OL,OL,['FB','RB','TE']]:['odd','stack'].includes(personnel)?[DL,LB,LB,DB]:[DL,DL,LB,DB];
 for(const group of positions){const p=team.roster.find(p=>group.includes(p.pos)&&!unit.some(q=>q.id===p.id))||team.roster.find(p=>(side==='defense'?[...DL,...LB,...DB]:[...OL,'RB','FB','TE','WR']).includes(p.pos)&&!unit.some(q=>q.id===p.id));if(!p)throw Error('Not enough athletes for 11-on-11');unit.push(p);}
 return unit;
}
export function fullFormation(formation){
 const x=[...formation.x,20,26.5,33,26.5],y=[...formation.y,-.5,-.5,-.5,-6];
 // Five linemen, two on-line ends, four backs. Bunch uses an off-line flanker.
 if(formation.full){x[5]=23.25;x[6]=29.75;formation.full.eligible.forEach(([a,b],i)=>{x[i+2]=a;y[i+2]=b;});[x[10],y[10]]=formation.full.back;return {...formation,x,y};}
 const tightLeft=formation.x[4]<26.5||formation.x[2]>16;
 x[5]=23.25;x[6]=29.75;x[4]=tightLeft?16.5:36.5;y[4]=-.5;y[2]=tightLeft?-1.5:-.5;y[3]=tightLeft?-.5:-1.5;
 return {...formation,x,y};
}
export function fullCoverage(g,d){
 if(d.slot<7)return null;
 if(d.slot===7||d.slot===8&&g.personnel!=='stack')return g.carrier;
 if(g.personnel==='stack'&&d.slot===8)return {x:g.fieldX?g.fieldX(12):12,y:Math.min(107,g.spot+7)};
 if(d.slot===9)return {x:g.fieldX?g.fieldX(26.5):26.5,y:Math.min(107,g.spot+6)};
 const threat=g.players.slice(2,5).sort((a,b)=>b.y-a.y)[0];
 return {x:Math.max(8,Math.min(45,threat.x)),y:Math.min(107,Math.max(g.spot+18,threat.y+4))};
}
export function fillSpecial(team,unit){
 const seen=new Set(unit.map(p=>p.id));
 return [...unit,...[...team.defense,...team.offense,...team.roster].filter(p=>{if(seen.has(p.id)||['QB','K','P'].includes(p.pos))return false;seen.add(p.id);return true;}).slice(0,4)];
}
