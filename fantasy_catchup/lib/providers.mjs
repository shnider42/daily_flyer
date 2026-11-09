import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLEEPER = 'https://api.sleeper.app/v1';
export const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const root = fileURLToPath(new URL('../', import.meta.url));
export const TTL = { state: 3600, players: 86400, news: 900, trends: 1800, schedule: 900 };
export const normalizeTeam = x => ({ JAC: 'JAX', WAS: 'WSH', LA: 'LAR' }[x] || x);
export const NEWS_RETENTION_DAYS = 7;
export const NEWS_LIMIT = 350;
const NFL_TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WSH'.split(' '));
const normalizeWords = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function newsKind(headline, description) {
  const classify=text=> /ruled out|will miss|miss(?:es|ing)? (?:the )?rest|season ending|sidelined|out for|placed? .*\b(?:ir|injured reserve)\b|surgery|questionable|doubtful|inactive/.test(text) ? 'Availability'
    : /\b(?:trade|trades|traded|trading|signs|signed|signing|released|releases|waived|waives|claimed|claims|acquire|acquires|acquired|waiver)\b/.test(text) ? 'Roster moves'
    : /injur|concussion|practice|hamstring|ankle|knee|neck|achilles|\bir\b/.test(text) ? 'Availability'
    : /fantasy/.test(text) ? 'Fantasy report' : null;
  // The headline's actual development takes precedence over background context.
  return classify(normalizeWords(headline)) || classify(normalizeWords(description)) || 'Around the league';
}
export function cleanPlayers(raw) {
  if (!raw || Array.isArray(raw) || Object.keys(raw).length < 100) throw Error('Incomplete player directory');
  return Object.values(raw).filter(p => ['QB','RB','WR','TE','K','DEF'].includes(p.position) && (p.active || p.team)).map(p => ({
    id: String(p.player_id), name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '),
    position: p.position, team: normalizeTeam(p.team), espnId: String(p.espn_id || ''),
    status: p.injury_status || null, body: p.injury_body_part || null, rank: p.search_rank || 999999,
    experience: p.years_exp ?? null,
  })).filter(p => p.name).sort((a,b) => a.rank-b.rank);
}
export function cleanNews(raw, players = [], now = Date.now()) {
  if (!Array.isArray(raw?.articles)) throw Error('Invalid news feed');
  return raw.articles.filter(a => a && a.type !== 'Media' && a.id != null && a.headline && a.published).map(a => {
    const headline = ` ${normalizeWords(a.headline)} `, description = ` ${normalizeWords(a.description)} `;
    const athletes = new Map((a.categories || []).filter(c => c.type === 'athlete' && c.athleteId != null).map((c,i) => [String(c.athleteId),i]));
    // Rolling articles can tag dozens of players. Show the named subject before
    // broader source tags or description matches instead of using directory rank.
    const people = players.map(p => {
      const name=normalizeWords(p.name), inHeadline=name?headline.indexOf(` ${name} `):-1, inDescription=name?description.indexOf(` ${name} `):-1;
      return {player:p,priority:inHeadline>=0?0:athletes.has(p.espnId)?1:inDescription>=0?2:3,order:inHeadline>=0?inHeadline:athletes.get(p.espnId) ?? inDescription};
    }).filter(match=>match.priority<3).sort((a,b)=>a.priority-b.priority || a.order-b.order).map(match=>match.player);
    const published = Date.parse(a.published), modified = Date.parse(a.lastModified);
    // Bad source timestamps must not turn an old story into a permanent "new" report.
    const updated = Number.isFinite(modified) && modified >= published && modified <= now+300000 ? a.lastModified : a.published;
    return { id: String(a.id), title: a.headline, published: a.published, updated,
      url: safeLink(a.links?.web?.href, 'espn.com'), players: people.map(p => p.id),
      kind: newsKind(a.headline,a.description),
    };
  }).filter(a => a.url && Number.isFinite(Date.parse(a.published)) && Date.parse(a.published)<=now+300000).sort((a,b) => Date.parse(b.published)-Date.parse(a.published));
}
export function mergeNews(previous, incoming, now = Date.now()) {
  const byId = new Map();
  for (const article of [...previous, ...incoming]) {
    const stamp=Date.parse(article.updated || article.published), published=Date.parse(article.published);
    if (!article.id || !safeLink(article.url,'espn.com') || !Number.isFinite(stamp) || !Number.isFinite(published) || published>now+300000 || stamp>now+300000 || stamp<now-NEWS_RETENTION_DAYS*86400000) continue;
    const existing=byId.get(article.id);
    if (!existing || stamp>=Date.parse(existing.updated || existing.published)) byId.set(article.id,article);
  }
  return [...byId.values()].sort((a,b)=>Date.parse(b.updated || b.published)-Date.parse(a.updated || a.published)).slice(0,NEWS_LIMIT);
}
export function safeLink(url, domain) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === domain || u.hostname.endsWith('.'+domain)) ? u.href : null; } catch { return null; }
}
export function cleanSchedule(raw, expected) {
  const expectedType={pre:1,regular:2,post:3}[expected.season_type];
  if (!Array.isArray(raw?.events) || Number(raw.season?.year) !== Number(expected.season) || Number(raw.week?.number) !== Number(expected.week) || (raw.season?.type!=null && Number(raw.season.type)!==expectedType)) throw Error('Season, week, or season type did not match');
  const games = raw.events.map(e => {
    const comp = e.competitions?.[0];
    if (!comp?.competitors || comp.competitors.length !== 2) throw Error('Incomplete matchup');
    const side = homeAway => { const c=comp.competitors.find(c => c.homeAway===homeAway); if (!c) throw Error('Missing team'); return { team:normalizeTeam(c.team.abbreviation), name:c.team.shortDisplayName || c.team.displayName, score:Number(c.score || 0) }; };
    return { id:e.id, date:e.date, home:side('home'), away:side('away'), completed:Boolean(e.status?.type?.completed), status:e.status?.type?.shortDetail || '', state:e.status?.type?.state || 'pre', url:`https://www.espn.com/nfl/game/_/gameId/${e.id}` };
  });
  const playing=games.flatMap(g=>[g.home.team,g.away.team]);
  if (games.length > 16 || new Set(playing).size !== games.length*2 || playing.some(t=>!NFL_TEAMS.has(t)) || games.some(g=>!Number.isFinite(Date.parse(g.date)))) throw Error('Incomplete or duplicate teams in schedule');
  const byeTeams=Array.isArray(raw.week?.teamsOnBye)?raw.week.teamsOnBye.map(t=>normalizeTeam(t.abbreviation)):null;
  if (byeTeams && (byeTeams.some(t=>!NFL_TEAMS.has(t) || playing.includes(t)) || new Set(byeTeams).size!==byeTeams.length)) throw Error('Invalid bye-week information');
  const complete=expected.season_type==='regular' && byeTeams!==null && new Set([...playing,...byeTeams]).size===NFL_TEAMS.size;
  return { season:Number(expected.season), week:Number(expected.week), seasonType:expected.season_type, games, byeTeams, complete };
}
export const scheduleMatches = (schedule,state) => Boolean(schedule && state && Number(schedule.season)===Number(state.season) && Number(schedule.week)===Number(state.week) && schedule.seasonType===state.season_type);
export async function fetchJSON(url) {
  const r = await fetch(url, { signal:AbortSignal.timeout(16000), headers:{'User-Agent':'DailyFlyer-RosterRadar/1.0','Accept':'application/json'} });
  if (!r.ok) throw Error(`Source returned ${r.status}`);
  return r.json();
}
export class SourceStore {
  constructor({fetcher=fetchJSON, clock=()=>Date.now(), path=process.env.FANTASY_CACHE_PATH || '/tmp/dfe-roster-radar/cache.json'}={}) {
    this.fetcher=fetcher; this.clock=clock; this.path=path; this.sources={}; this.pending=null;
  }
  async load() {
    for (const p of [this.path,join(root,'seed.json')]) {
      try { const data=JSON.parse(await readFile(p,'utf8')); if(data.schema===1 && data.sources){this.sources=data.sources;break;} } catch {}
    }
  }
  async save() {
    await mkdir(dirname(this.path),{recursive:true});
    await writeFile(this.path+'.tmp',JSON.stringify({schema:1,sources:this.sources}));
    await rename(this.path+'.tmp',this.path);
  }
  due(key) {
    const s=this.sources[key];
    const attemptAge=this.clock()-Date.parse(s?.lastAttempt);
    if(attemptAge>=0 && attemptAge<60000) return false;
    const checked=Date.parse(s?.checkedAt);
    return !Number.isFinite(checked) || checked>this.clock()+300000 || this.clock()-checked>=TTL[key]*1000;
  }
  async update(key,url,transform,{force=false}={}) {
    const attemptAge=this.clock()-Date.parse(this.sources[key]?.lastAttempt);
    if(!this.due(key) && (!force || (attemptAge>=0 && attemptAge<60000))) return;
    const old=this.sources[key]; const attempted=new Date(this.clock()).toISOString();
    try { const data=transform(await this.fetcher(url)); this.sources[key]={data,checkedAt:attempted,lastAttempt:attempted,error:null}; }
    catch (err) { this.sources[key]={...old,lastAttempt:attempted,error:String(err.message).slice(0,120)}; }
  }
  async refresh() {
    if (this.pending) return this.pending;
    const stateBefore=this.sources.state?.data;
    const scheduleMissing=stateBefore?.season && stateBefore.week>0 && !scheduleMatches(this.sources.schedule?.data,stateBefore);
    if (!Object.keys(TTL).some(key => this.due(key)) && !scheduleMissing) return;
    this.pending=(async()=>{
      await Promise.all([
        this.update('state',SLEEPER+'/state/nfl',d=>{if(!/^20\d{2}$/.test(d?.season) || !Number.isInteger(d.week) || d.week<0 || d.week>25)throw Error('Invalid NFL state');return {season:d.season,week:d.week,season_type:d.season_type};}),
        this.update('players',SLEEPER+'/players/nfl',cleanPlayers),
        this.update('trends',SLEEPER+'/players/nfl/trending/add?lookback_hours=24&limit=30',d=>{if(!Array.isArray(d) || d.some(x=>!x.player_id || !Number.isFinite(x.count)))throw Error('Invalid activity feed');return d.map(x=>({id:String(x.player_id),count:x.count}));}),
      ]);
      const state=this.sources.state?.data;
      await Promise.all([
        this.update('news',ESPN+'/news?limit=50',d=>mergeNews(this.sources.news?.data || [],cleanNews(d,this.sources.players?.data || [],this.clock()),this.clock())),
        state?.week ? this.update('schedule',`${ESPN}/scoreboard?dates=${state.season}&seasontype=${{pre:1,regular:2,post:3}[state.season_type] || 2}&week=${state.week}&limit=100`,d=>cleanSchedule(d,state),{force:!scheduleMatches(this.sources.schedule?.data,state)}) : Promise.resolve(),
      ]);
      try { await this.save(); } catch { console.error('Cache persistence unavailable; retaining memory cache'); }
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
  publicData() {
    const sources=Object.fromEntries(Object.keys(TTL).map(k=>{const v=this.sources[k] || {}, checked=Date.parse(v.checkedAt);return [k,{checkedAt:v.checkedAt || null,lastAttempt:v.lastAttempt || null,stale:!Number.isFinite(checked) || checked>this.clock()+300000 || this.clock()-checked>TTL[k]*2000,error:v.error || null,refreshSeconds:TTL[k]}];}));
    const state=this.sources.state?.data || null;
    const schedule=scheduleMatches(this.sources.schedule?.data,state)?this.sources.schedule.data:null;
    if(state?.week && !schedule){sources.schedule.stale=true;sources.schedule.error ||= 'Waiting for a schedule matching the current NFL week';}
    const news=mergeNews([],this.sources.news?.data || [],this.clock());
    const published=news.map(n=>Date.parse(n.published));
    const newsCoverage={oldestPublished:published.length?new Date(Math.min(...published)).toISOString():null,latestPublished:published.length?new Date(Math.max(...published)).toISOString():null,retainedReports:news.length,retentionDays:NEWS_RETENTION_DAYS,limit:NEWS_LIMIT};
    return { schema:1,serverTime:new Date(this.clock()).toISOString(),refreshing:Boolean(this.pending),sources,state,players:this.sources.players?.data || [],news,newsCoverage,trends:this.sources.trends?.data || [],schedule };
  }
}
