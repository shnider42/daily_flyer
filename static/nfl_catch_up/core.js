(function(root) {
  'use strict';
  const supportedLocales=Object.freeze(['en-US','de-AT','hi-IN','gu-IN']);
  const normalizeLocale=value=>supportedLocales.includes(value)?value:'en-US';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' });
  const dateCache = new Map();
  const localDate = iso => {if(!dateCache.has(iso))dateCache.set(iso,dateFormatter.format(new Date(iso)));return dateCache.get(iso);};
  function records(data, before = '9999-12-31') {
    const map = Object.fromEntries(data.teams.map(t => [t.id, {...t, w:0,l:0,t:0,pf:0,pa:0,form:[]} ]));
    data.games.filter(g=>g.completed && localDate(g.date)<before).forEach(g=>{
      for (const [side,other] of [[g.home,g.away],[g.away,g.home]]) {
        const t=map[side.team], outcome=side.score>other.score?'W':side.score<other.score?'L':'T';
        t[outcome.toLowerCase()]++; t.pf+=side.score;t.pa+=other.score;t.form.push({outcome,week:g.week,date:localDate(g.date)});
      }
    });
    return Object.values(map).map(t=>({...t,gp:t.w+t.l+t.t,pct:(t.w+t.l+t.t)?(t.w+t.t/2)/(t.w+t.l+t.t):0}));
  }
  function sortRecords(rows) {return [...rows].sort((a,b)=>b.pct-a.pct || a.name.localeCompare(b.name));}
  function record(t){return `${t.w}–${t.l}${t.t?'–'+t.t:''}`;}
  function matches(s,state){return s.date>=state.since && (state.team==='ALL'||s.teams.includes(state.team)) && (state.topic==='all'||state.topic===s.category) && (!state.query||[s.title,s.summary,s.detail,...s.teams].join(' ').toLowerCase().includes(state.query.toLowerCase()));}
  function stories(data,state){return data.stories.filter(s=>matches(s,state)).sort((a,b)=>state.order==='latest'?b.date.localeCompare(a.date)||a.priority-b.priority:a.priority-b.priority);}
  function games(data,state){return data.games.filter(g=>g.completed && localDate(g.date)>=state.since && (state.team==='ALL'||[g.home.team,g.away.team].includes(state.team)));}
  function teamBrief(data,id,since){
    const all=data.games.filter(g=>g.completed&&[g.home.team,g.away.team].includes(id));
    const window=all.filter(g=>localDate(g.date)>=since);
    const now=records(data).find(t=>t.id===id),before=records(data,since).find(t=>t.id===id);
    const side=(g,opponent=false)=>g[g.home.team===id?(opponent?'away':'home'):(opponent?'home':'away')];
    const avg=(gs,key,opponent=false)=>{const values=gs.map(g=>key==='score'?side(g,opponent).score:Number(g.stats?.[side(g,opponent).team]?.[key])).filter(Number.isFinite);return values.length?{value:values.reduce((a,b)=>a+b,0)/values.length,n:values.length}:null;};
    const latest=all.at(-1),passer=latest?.leaders?.find(l=>l.team===id&&/pass/i.test(l.kind));
    return {all,window,now,before,latest,passer,delta:{w:now.w-before.w,l:now.l-before.l,t:now.t-before.t},
      points:avg(window,'score'),allowed:avg(window,'score',true),yards:avg(window,'totalYards'),
      pass:avg(window,'netPassingYards'),rush:avg(window,'rushingYards'),conceded:avg(window,'totalYards',true),
      turnovers:avg(window,'turnovers'),takeaways:avg(window,'turnovers',true),seasonPoints:avg(all,'score'),seasonAllowed:avg(all,'score',true)};
  }
  function schedule(data,state) {
    const names=Object.fromEntries(data.teams.map(t=>[t.id,t.name.toLowerCase()]));
    return data.games.filter(g=>(state.week==='all'||g.week===state.week)
      &&(state.team==='ALL'||[g.home.team,g.away.team].includes(state.team))
      &&(state.gameStatus==='all'||(state.gameStatus==='final'?g.completed:!g.completed))
      &&(!state.closeGames||(g.completed&&Math.abs(g.home.score-g.away.score)<=7))
      &&(!state.gameQuery||[names[g.home.team],names[g.away.team],g.home.team,g.away.team,g.venue].join(' ').toLowerCase().includes(state.gameQuery.toLowerCase())));
  }
  function gameContext(data,game) {
    const before=records(data,localDate(game.date));
    return [game.away,game.home].map((side,i)=>{
      const other=i?game.away:game.home, old=before.find(t=>t.id===side.team), now={...old};
      if(game.completed){now[side.score>other.score?'w':side.score<other.score?'l':'t']++;}
      return {team:side.team,before:record(old),after:record(now)};
    });
  }
  function quarterFlow(game){
    const away=game.away.quarters||[],home=game.home.quarters||[];
    if(!game.completed||!away.length||away.length!==home.length)return [];
    let a=0,h=0;return [{quarter:0,away:0,home:0},...away.map((v,i)=>({quarter:i+1,away:a+=v,home:h+=home[i]}))];
  }
  function gameRead(game,locale='en-US'){
    if(locale==='de-AT'){
      if(!game.completed)return {kind:'Angesetzt',text:'Diese Begegnung wurde in dieser Ausgabe noch nicht gespielt.'};
      const margin=Math.abs(game.away.score-game.home.score),winner=game.away.score>game.home.score?game.away:game.home,loser=winner===game.away?game.home:game.away;
      if(margin===0)return {kind:'Unentschieden',text:`Beide Teams beendeten das Spiel mit ${game.home.score} Punkten. Für beide zählt ein Unentschieden in der Bilanz.`};
      const half=side=>(side.quarters||[]).slice(0,2).reduce((a,b)=>a+b,0),hasHalf=(winner.quarters||[]).length>=4&&(loser.quarters||[]).length>=4;
      const deficit=hasHalf?half(loser)-half(winner):0;
      if(deficit>=10)return {kind:'Aufholjagd',text:`${winner.team} holte einen Halbzeitrückstand von ${deficit} Punkten auf und gewann mit ${margin} ${margin===1?'Punkt':'Punkten'} Vorsprung.`};
      if(/OT/.test(game.status))return {kind:'Verlängerung',text:`${winner.team} gewann in der Verlängerung mit ${margin} ${margin===1?'Punkt':'Punkten'} Vorsprung. Nach der regulären Spielzeit stand es unentschieden.`};
      if(loser.score===0)return {kind:'Zu null',text:`${winner.team} ließ gegen ${loser.team} keine Punkte zu und gewann mit ${margin} Punkten Vorsprung.`};
      if(margin<=7)return {kind:'Knappe Entscheidung',text:`${winner.team} gewann mit ${margin} ${margin===1?'Punkt':'Punkten'} Vorsprung – höchstens einem Touchdown samt Extrapunkt.`};
      return {kind:margin>=17?'Deutlicher Vorsprung':'Endstand',text:`${winner.team} erzielte ${margin} Punkte mehr als ${loser.team}.`};
    }
    if(!game.completed)return {kind:'Scheduled',text:'This matchup has not been played in this edition.'};
    const margin=Math.abs(game.away.score-game.home.score),winner=game.away.score>game.home.score?game.away:game.home,loser=winner===game.away?game.home:game.away;
    if(margin===0)return {kind:'Tie game',text:`Both teams finished with ${game.home.score} points. Each adds a tie to its record.`};
    const half=(side)=>(side.quarters||[]).slice(0,2).reduce((a,b)=>a+b,0),hasHalf=(winner.quarters||[]).length>=4&&(loser.quarters||[]).length>=4;
    const deficit=hasHalf?half(loser)-half(winner):0;
    if(deficit>=10)return {kind:'Comeback',text:`${winner.team} erased a ${deficit}-point halftime deficit to win by ${margin}.`};
    if(/OT/.test(game.status))return {kind:'Overtime',text:`${winner.team} won by ${margin} after regulation ended level.`};
    if(loser.score===0)return {kind:'Shutout',text:`${winner.team} held ${loser.team} scoreless and won by ${margin}.`};
    if(margin<=7)return {kind:'Close finish',text:`${winner.team} finished ${margin} ${margin===1?'point':'points'} ahead. The final margin was no more than a touchdown and extra point.`};
    return {kind:margin>=17?'Clear margin':'Final result',text:`${winner.team} outscored ${loser.team} by ${margin} points.`};
  }
  function normalize(raw,data) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
    const locale=normalizeLocale(raw.locale);
    const validTeam=id=>data.teams.some(t=>t.id===id);
    const defaultSince=new Date(Date.parse(data.as_of+'T12:00:00Z')-7*86400000).toISOString().slice(0,10);
    const isDate=s=>/^2026-\d{2}-\d{2}$/.test(s||'') && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
    return {locale,depth:['little','basics','well'].includes(raw.depth)?raw.depth:'basics',
      since:isDate(raw.since)&&raw.since<=(data.as_of||'2026-11-04')?raw.since:defaultSince,
      team:raw.team==='ALL'||validTeam(raw.team)?raw.team:locale==='de-AT'?'MIN':'ALL',
      englishTeam:raw.englishTeam==='ALL'||validTeam(raw.englishTeam)?raw.englishTeam:'ALL',
      englishTeamFocus:validTeam(raw.englishTeamFocus)?raw.englishTeamFocus:'NE',
      topic:['all','games','roster','injuries'].includes(raw.topic)?raw.topic:'all',
      query:typeof raw.query==='string'?raw.query.slice(0,80):'',
      order:raw.order==='latest'?'latest':'impact', spoilers:raw.spoilers===true,
      tab:['brief','league','games','teams','learn'].includes(raw.tab)?raw.tab:'brief',
      theme:raw.theme==='light'?'light':'dark',
      conference:['ALL','AFC','NFC'].includes(raw.conference)?raw.conference:'ALL',
      teamFocus:validTeam(raw.teamFocus)?raw.teamFocus:locale==='de-AT'?'MIN':'NE',
      gameStatus:['all','final','scheduled'].includes(raw.gameStatus)?raw.gameStatus:'all',
      gameQuery:typeof raw.gameQuery==='string'?raw.gameQuery.slice(0,80):'',
      closeGames:raw.closeGames===true&&raw.spoilers!==true,
      game:data.games.some(g=>g.id===raw.game)?raw.game:null,
      week:raw.week==='all'?'all':Number.isInteger(Number(raw.week))&&Number(raw.week)>=1&&Number(raw.week)<=18?Number(raw.week):(data.latest_week||data.through_week)};
  }
  function switchLocale(state,locale,data){
    const next=normalizeLocale(locale);
    if(next===state.locale)return normalize(state,data);
    if(next==='de-AT')return normalize({...state,locale:next,englishTeam:state.team,englishTeamFocus:state.teamFocus,team:'MIN',teamFocus:'MIN'},data);
    if(state.locale==='de-AT')return normalize({...state,locale:next,team:state.englishTeam,teamFocus:state.englishTeamFocus},data);
    return normalize({...state,locale:next},data);
  }
  function formatKickoff(iso,locale='en-US',compact=false){
    const normalized=normalizeLocale(locale),austrian=normalized==='de-AT',indian=['hi-IN','gu-IN'].includes(normalized);
    return new Date(iso).toLocaleString(normalized,{
      timeZone:austrian?'Europe/Vienna':indian?'Asia/Kolkata':'America/New_York',month:'short',day:'numeric',
      ...(compact?{}:austrian||indian?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{hour:'numeric',minute:'2-digit'})
    })+(compact?'':austrian?' Uhr · Wien':indian?' IST':' ET');
  }
  const api={supportedLocales,normalizeLocale,localDate,records,sortRecords,record,matches,stories,games,schedule,gameContext,quarterFlow,gameRead,normalize,switchLocale,formatKickoff,teamBrief};
  if(typeof module!=='undefined')module.exports=api;else root.NFLCatchUp=api;
})(typeof globalThis!=='undefined'?globalThis:this);
