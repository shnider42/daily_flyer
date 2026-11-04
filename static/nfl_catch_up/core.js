(function(root) {
  'use strict';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' });
  const dateCache = new Map();
  const localDate = iso => {if(!dateCache.has(iso))dateCache.set(iso,dateFormatter.format(new Date(iso)));return dateCache.get(iso);};
  function records(data, before = '9999-12-31') {
    const map = Object.fromEntries(data.teams.map(t => [t.id, {...t, w:0,l:0,t:0,pf:0,pa:0,form:[]} ]));
    data.games.filter(g=>g.completed && g.week<=data.through_week && localDate(g.date)<before).forEach(g=>{
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
  function games(data,state){return data.games.filter(g=>g.week<=data.through_week && g.completed && localDate(g.date)>=state.since && (state.team==='ALL'||[g.home.team,g.away.team].includes(state.team)));}
  function normalize(raw,data) {
    const isDate=s=>/^2026-\d{2}-\d{2}$/.test(s||'') && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
    return {depth:['little','basics','well'].includes(raw.depth)?raw.depth:'basics',
      since:isDate(raw.since)&&raw.since<=(data.as_of||'2026-11-04')?raw.since:'2026-10-28',
      team:data.teams.some(t=>t.id===raw.team)?raw.team:'ALL',
      topic:['all','games','roster','injuries'].includes(raw.topic)?raw.topic:'all',
      query:typeof raw.query==='string'?raw.query.slice(0,80):'',
      order:raw.order==='latest'?'latest':'impact', spoilers:raw.spoilers===true,
      tab:['brief','league','games','learn'].includes(raw.tab)?raw.tab:'brief',
      week:Number.isInteger(Number(raw.week))&&Number(raw.week)>=1&&Number(raw.week)<=data.through_week+1?Number(raw.week):data.through_week};
  }
  const api={localDate,records,sortRecords,record,matches,stories,games,normalize};
  if(typeof module!=='undefined')module.exports=api;else root.NFLCatchUp=api;
})(typeof globalThis!=='undefined'?globalThis:this);
