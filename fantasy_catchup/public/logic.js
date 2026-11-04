export const defaults={scoring:'half',format:'redraft',qb:'one',size:'12',waivers:'faab',lineup:'managed',guidance:'simple',window:'3',scope:'all',position:'ALL'};
export function inferSettings(league){
 const s=league.settings || {}, p=league.positions || [], rec=league.scoring?.rec ?? 0;
 return {scoring:rec===1?'ppr':rec===0.5?'half':rec===0?'standard':'custom',format:s.type===2?'dynasty':s.type===1?'keeper':'redraft',qb:p.includes('SUPER_FLEX')?'super':p.filter(x=>x==='QB').length>1?'two':'one',size:String(league.rosters.length),waivers:s.waiver_type===2?'faab':'priority',lineup:s.best_ball===1?'best':'managed'};
}
export function cutoff(settings,lastSeen,now=Date.now()) {
 return settings.window==='since' && lastSeen ? Date.parse(lastSeen) : now-Number(settings.window==='since'?3:settings.window)*86400000;
}
export function filterNews(news,settings,tracked,available,lastSeen,now=Date.now()) {
 const after=cutoff(settings,lastSeen,now);
 return news.filter(n=>Date.parse(n.updated || n.published)>=after && (settings.scope==='all' || n.players.some(id=>(settings.scope==='mine'?tracked:available).has(id))));
}
export function relevantPlayers(data,ids){return (data.players || []).filter(p=>ids.has(p.id));}
export function statusChanges(players,previous){
 return players.filter(p=>previous[p.id] && (previous[p.id].status!==p.status || previous[p.id].team!==p.team)).map(p=>({player:p,before:previous[p.id],after:{status:p.status,team:p.team}}));
}
export function byeTeams(schedule,players){
 if(!schedule || schedule.seasonType!=='regular' || schedule.games.length<8)return new Set();
 const playing=new Set(schedule.games.flatMap(g=>[g.home.team,g.away.team]));
 return new Set(players.map(p=>p.team).filter(t=>t && !playing.has(t)));
}
export function playerLens(p,s,level=s.guidance){
 const short={QB:s.qb==='one'?'Compare against the quarterbacks you can actually start.':'Your league can start multiple quarterbacks, so check available replacements early.',RB:s.scoring==='standard'?'Check carries and goal-line work before chasing last week’s points.':'Check both rushing work and receiving opportunities.',WR:s.scoring==='standard'?'Check targets and scoring opportunities, not just catches.':'Receptions count in this format. Look for repeatable involvement.',TE:'Check whether his routes and targets support a regular role.',K:'Check the matchup and your kicker scoring before using a roster spot.',DEF:'Check the opponent and your defense scoring before making a move.'};
 let result=short[p.position] || 'Compare the opportunity with the alternatives in your league.';
 if(s.format==='dynasty')result+=' Weigh his future role separately from this week.';
 if(s.format==='keeper')result+=' Factor in your keeper cost before dropping a player.';
 if(s.lineup==='best')result+=' Best ball chooses scoring lineups; check whether your league permits roster moves.';
 if(level==='moderate')result+=' '+(s.waivers==='faab'?'Compare the roster benefit with your remaining bidding budget.':'Consider whether the move is worth using your waiver priority.');
 if(level==='expert')result+=' '+`Context: ${s.size} teams; ${s.scoring==='custom'?'custom reception scoring':s.scoring==='ppr'?'1 point/reception':s.scoring==='half'?'0.5 points/reception':'0 points/reception'}. Activity and directory status do not establish snap share, route participation, or expected points.`;
 return result;
}
export function newsLens(n,people,s){
 const first=people.length===1?people[0]:null;
 let base=n.kind==='Availability'?'Check the report’s timing and whether it affects this week’s availability.':n.kind==='Roster moves'?'A roster move can change opportunity. Confirm the new role before treating it as an upgrade.':n.kind==='Fantasy report'?'Compare the article’s scoring assumptions with your league settings.':'Look for a change in opportunity or availability that affects your roster.';
 if(first)base+=' '+playerLens(first,s);
 else if(people.length>1)base+=' This report covers several players; check the part that concerns your roster.';
 else if(s.guidance!=='simple')base+=' This report has no confidently matched fantasy player; its relevance to your roster is unconfirmed.';
 if(s.guidance==='expert')base+=' Player links use ESPN athlete IDs and full-name matching; this is a reading prompt, not a projection.';
 return base;
}
