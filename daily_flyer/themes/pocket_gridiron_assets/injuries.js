// Rare, fictional match-only injuries. Durability is a gameplay estimate,
// never a claim about a real player's current health. No permanent roster edits.
const GROUPS=[['QB'],['RB','FB'],['WR'],['TE','FB'],['OL','OT','OG','C','G','T'],['DL','DT','DE'],['LB','ILB','OLB'],['DB','CB','S','FS','SS'],['K'],['P']];
const compatible=(a,b)=>GROUPS.some(group=>group.includes(a.pos)&&group.includes(b.pos));
export function injuryChance(p){return Math.max(.0015,Math.min(.014,.008+(80-(p.durability??82))*.00015+(100-(p.energy??100))*.000035));}
export function availableTeam(g,side){
 const t=g.teams[side],out=new Set(g.injuries.filter(i=>i.team===side&&g.healthPlay+1<i.until).map(i=>i.id));
 if(!out.size)return t;
 const roster=t.roster.filter(p=>!out.has(p.id));
 const replaceUnit=unit=>{const used=new Set(unit.filter(p=>!out.has(p.id)).map(p=>p.id));return unit.map(p=>{if(!out.has(p.id))return p;const sub=roster.find(q=>!used.has(q.id)&&compatible(p,q));if(!sub)return p;used.add(sub.id);return {...sub,replacing:p.name};});};
 const specialists=Object.fromEntries(Object.entries(t.specialists).map(([key,p])=>[key,out.has(p.id)?roster.find(q=>compatible(p,q))||roster.find(q=>['WR','RB','DB','CB','S'].includes(q.pos))||p:p]));
 return {...t,roster,offense:replaceUnit(t.offense),defense:replaceUnit(t.defense),specialists};
}
export function beginHealthPlay(g){
 g.healthPlay++;
 for(const i of g.injuries)if(!i.returned&&g.healthPlay>=i.until){i.returned=true;g.emit('injury','BACK IN THE ROTATION',`${i.name} is available again.`);}
}
export function checkContactInjury(g,defender){
 if(!g.injuriesEnabled||g.healthPlay<6||g.healthPlay-g.lastInjuryPlay<18||g.injuries.length>=2||g.injuryCheckedPlay===g.healthPlay)return;
 g.injuryCheckedPlay=g.healthPlay;
 for(const [p,side] of [[g.carrier,g.offense],[defender,1-g.offense]]){
  const t=availableTeam(g,side),unit=side===g.offense?g.players:g.defenders;
  const backup=t.roster.find(q=>q.id!==p.id&&!unit.some(a=>a.id===q.id)&&compatible(p,q));
  if(!backup||g.rng()>=injuryChance(p))continue;
  const plays=2+Math.floor(g.rng()*3),label=g.rng()<.5?'Shaken up':'Needs a breather';
  const injury={id:p.id,name:p.name,team:side,until:g.healthPlay+plays+1,plays,label,backup:backup.name,returned:false};
  g.injuries.push(injury);g.lastInjuryPlay=g.healthPlay;
  g.emit('injury','SIDELINE UPDATE',`${p.name}: ${label.toLowerCase()}. ${backup.name} takes the next ${plays} snaps.`,{injury:{...injury}});break;
 }
}
export function injurySummary(g){return g.injuries.filter(i=>g.healthPlay+1<i.until).map(i=>`${g.teams[i.team].abbr} · ${i.name}: ${Math.max(1,i.until-g.healthPlay-1)} snaps of rest · ${i.backup} available`).join(' | ');}
