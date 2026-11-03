export const RETURN_PLANS={left:{name:'Return left',x:12,hint:'Build a wall toward the left numbers.'},middle:{name:'Return middle',x:26.5,hint:'Stay behind the wedge, then find daylight.'},right:{name:'Return right',x:41,hint:'Build a wall toward the right numbers.'}};
export const SPECIAL_SLOTS=[['kr','Kick returner',['RB','WR','DB','CB','S','FS','SS']],['pr','Punt returner',['RB','WR','DB','CB','S','FS','SS']],['kicker','Kicker',['K']],['punter','Punter',['P']],['gunner1','Left gunner',['WR','DB','CB','S','FS','SS','LB']],['gunner2','Right gunner',['WR','DB','CB','S','FS','SS','LB']]];
const value=(p,keys)=>keys.reduce((n,k)=>n+(p[k]||70),0)/keys.length;
export function selectSpecialists(roster,custom={}){
 const unit={};
 for(const [key,,positions] of SPECIAL_SLOTS){
  const available=roster.filter(p=>positions.includes(p.pos)&&(key!=='gunner2'||p.id!==unit.gunner1?.id));
  const score=p=>value(p,key==='kicker'?['kickPower','kickAccuracy']:key==='punter'?['kickPower','hangTime']:key.startsWith('gunner')?['speed','tackling','recognition']:['speed','agility','ballSecurity','catching']);
  available.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
  unit[key]=available.find(p=>p.id===custom[key])||available[0]||roster.find(p=>p.id!==unit.gunner1?.id)||roster[0];
 }
 return unit;
}
export function specialUnit(team,type){
 const s=team.specialists||selectSpecialists(team.roster),returner=s[type==='punt'?'pr':'kr'];
 const unique=(items,skip=[])=>{const seen=new Set(skip);return items.filter(p=>{if(!p||seen.has(p.id))return false;seen.add(p.id);return true;});};
 const blockers=unique([...team.offense.slice(4),...team.defense.slice(2),...team.offense.slice(1),...team.roster],[returner.id]).slice(0,6);
 const receiving=[blockers[0],returner,...blockers.slice(1)];
 const kicker=s[type==='punt'?'punter':'kicker'];
 const coverage=unique([s.gunner1,s.gunner2,...team.defense,...team.roster],[kicker.id]).slice(0,6);
 return {receiving,coverage:[...coverage,kicker],specialists:s};
}
export function returnLane(g){const plan=RETURN_PLANS[g.special?.returnPlan];return plan&&g.isReturn&&g.liveTime<3?Math.max(g.carrier.x-12,Math.min(g.carrier.x+12,plan.x)):g.carrier.x;}
export function emptySpecial(){return {fgMade:0,fgAttempts:0,longFG:0,xpMade:0,xpAttempts:0,punts:0,puntYards:0,puntNet:0,inside20:0,puntTouchbacks:0,kickoffs:0,kickTouchbacks:0,outOfBounds:0,kickReturns:0,puntReturns:0,kickReturnYards:0,puntReturnYards:0,returnTD:0,longReturn:0,returner:'',coverageStops:0,starts:0,startYards:0};}
const stats=(g,team)=>g.box[team].special??=(emptySpecial());
export function recordKickLaunch(g){const s=g.special;if(s.launched)return;s.launched=true;stats(g,s.kickingTeam)[s.type==='punt'?'punts':'kickoffs']++;}
export function recordKickEnd(g,spot,reason,offense=g.offense){
 const s=g.special;if(!s||s.goal||s.settled)return;
 const kicking=stats(g,s.kickingTeam),receiving=stats(g,1-s.kickingTeam),returned=Number.isFinite(s.catchY),yards=returned?Math.round(spot-s.catchY):0;
 if(returned){receiving[s.type==='punt'?'puntReturns':'kickReturns']++;receiving[s.type==='punt'?'puntReturnYards':'kickReturnYards']+=yards;if(yards>receiving.longReturn){receiving.longReturn=yards;receiving.returner=g.carrier.name;}if(reason==='touchdown')receiving.returnTD++;if(reason==='tackle')kicking.coverageStops++;}
 if(reason==='TOUCHBACK')kicking[s.type==='punt'?'puntTouchbacks':'kickTouchbacks']++;
 if(reason==='OUT OF BOUNDS')kicking.outOfBounds++;
 if(s.type==='punt'){
  const landing=returned?s.catchY:reason==='TOUCHBACK'?0:spot;
  kicking.puntYards+=Math.round(100-s.kickSpot-landing);kicking.puntNet+=Math.round(100-s.kickSpot-spot);
  if(spot>0&&spot<20&&offense!==s.kickingTeam)kicking.inside20++;
 }
 if(spot>0&&spot<100&&offense!==s.kickingTeam){receiving.starts++;receiving.startYards+=Math.round(spot);}
 s.settled={type:s.type,kickingTeam:s.kickingTeam,receivingTeam:1-s.kickingTeam,spot:Math.round(spot),yards,returned,reason,player:returned?g.carrier.name:g.defenders[6].name};
}
export function recordGoal(g,good){const s=g.special;if(s.settled)return;const b=stats(g,s.kickingTeam),extra=s.type==='extra';b[extra?'xpAttempts':'fgAttempts']++;if(good){b[extra?'xpMade':'fgMade']++;if(!extra)b.longFG=Math.max(b.longFG,s.distance);}s.settled={type:s.type,kickingTeam:s.kickingTeam,good,distance:s.distance,player:g.players[0].name};}
export function specialRows(box){
 const b=box.map(b=>({...emptySpecial(),...b.special})),avg=(n,d)=>d?(n/d).toFixed(1):'—';
 return [['Field goals',...b.map(s=>`${s.fgMade}/${s.fgAttempts}${s.longFG?` · long ${s.longFG}`:''}`)],['Extra points',...b.map(s=>`${s.xpMade}/${s.xpAttempts}`)],['Punts · gross / net avg',...b.map(s=>`${s.punts} · ${avg(s.puntYards,s.punts)} / ${avg(s.puntNet,s.punts)}`)],['Punts inside 20',...b.map(s=>s.inside20)],['Kick returns · yards',...b.map(s=>`${s.kickReturns} · ${s.kickReturnYards}`)],['Punt returns · yards',...b.map(s=>`${s.puntReturns} · ${s.puntReturnYards}`)],['Return TD / longest',...b.map(s=>`${s.returnTD} / ${s.longReturn}`)],['Coverage tackles',...b.map(s=>s.coverageStops)],['Starting yard after kicks',...b.map(s=>s.starts?`${s.startYards/s.starts<=50?'own':'opponent'} ${s.startYards/s.starts<=50?avg(s.startYards,s.starts):(100-s.startYards/s.starts).toFixed(1)}`:'—')]];
}
export function specialStory(report,team=0){
 const t=report.teams[team],b={...emptySpecial(),...report.box?.[team]?.special};
 if(b.returnTD)return `${t.city} has ${b.returnTD} special-teams return touchdown${b.returnTD===1?'':'s'}. ${b.returner||'The return unit'} produced their longest return of ${b.longReturn} yards. Coverage and blocking deserve a place in that story.`;
 if(b.inside20)return `${t.city} has pinned ${b.inside20} punt${b.inside20===1?'':'s'} inside the 20. The punter and coverage team are making the next offense travel farther.`;
 if(b.fgAttempts)return `${t.city} is ${b.fgMade} for ${b.fgAttempts} on field goals${b.longFG?`, with a long of ${b.longFG} yards`:''}. Those kicks count every bit as much on the scoreboard.`;
 if(b.kickReturns+b.puntReturns)return `${t.city} has ${b.kickReturnYards} kickoff-return yards and ${b.puntReturnYards} punt-return yards. Their longest special-teams return is ${b.longReturn} yards. The return unit helps set the next drive's starting point.`;
 if(b.punts)return `${t.city} has punted ${b.punts} time${b.punts===1?'':'s'}, averaging ${(b.puntNet/b.punts).toFixed(1)} net yards. The return is part of the punt's final result.`;
 if(b.xpAttempts)return `${t.city} is ${b.xpMade} for ${b.xpAttempts} on extra points. A touchdown still leaves a job for the kicking unit.`;
  if(b.kickoffs)return `${t.city} has kicked off ${b.kickoffs} time${b.kickoffs===1?'':'s'}, with ${b.kickTouchbacks} touchback${b.kickTouchbacks===1?'':'s'}. Kicking and coverage set the defense's starting assignment.`;
 return `No field-goal or punt result for ${t.city} in this ledger. Field position matters even when it does not produce a highlight.`;
}
