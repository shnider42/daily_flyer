import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLEEPER = 'https://api.sleeper.app/v1';
export const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const root = fileURLToPath(new URL('../', import.meta.url));
export const TTL = { state: 3600, players: 86400, news: 900, trends: 1800, schedule: 900 };
export const normalizeTeam = x => ({ JAC: 'JAX', WAS: 'WSH', LA: 'LAR' }[x] || x);
export function cleanPlayers(raw) {
  if (!raw || Array.isArray(raw) || Object.keys(raw).length < 100) throw Error('Incomplete player directory');
  return Object.values(raw).filter(p => ['QB','RB','WR','TE','K','DEF'].includes(p.position) && (p.active || p.team)).map(p => ({
    id: String(p.player_id), name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '),
    position: p.position, team: normalizeTeam(p.team), espnId: String(p.espn_id || ''),
    status: p.injury_status || null, body: p.injury_body_part || null, rank: p.search_rank || 999999,
    experience: p.years_exp ?? null,
  })).filter(p => p.name).sort((a,b) => a.rank-b.rank);
}
export function cleanNews(raw, players = []) {
  if (!Array.isArray(raw?.articles)) throw Error('Invalid news feed');
  return raw.articles.filter(a => a.type !== 'Media' && a.headline && a.published).map(a => {
    const text = `${a.headline} ${a.description || ''}`.toLowerCase();
    const athletes = new Set((a.categories || []).filter(c => c.type === 'athlete').map(c => String(c.athleteId)));
    const people = players.filter(p => athletes.has(p.espnId) || text.includes(p.name.toLowerCase()));
    return { id: String(a.id), title: a.headline, published: a.published, updated: a.lastModified || a.published,
      url: safeLink(a.links?.web?.href, 'espn.com'), players: people.map(p => p.id),
      kind: /injur|questionable|concussion|ruled out|surgery|practice|hamstring|ankle|knee/.test(text) ? 'Availability' : /trad(e|ed|ing)|signs|signed|released|waiver/.test(text) ? 'Roster moves' : /fantasy/.test(text) ? 'Fantasy report' : 'Around the league',
    };
  }).filter(a => a.url && Number.isFinite(Date.parse(a.published))).sort((a,b) => Date.parse(b.published)-Date.parse(a.published));
}
export function safeLink(url, domain) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === domain || u.hostname.endsWith('.'+domain)) ? u.href : null; } catch { return null; }
}
export function cleanSchedule(raw, expected) {
  if (!Array.isArray(raw?.events) || Number(raw.season?.year) !== Number(expected.season) || Number(raw.week?.number) !== Number(expected.week)) throw Error('Season or week did not match');
  const games = raw.events.map(e => {
    const comp = e.competitions?.[0];
    if (!comp?.competitors || comp.competitors.length !== 2) throw Error('Incomplete matchup');
    const side = homeAway => { const c=comp.competitors.find(c => c.homeAway===homeAway); if (!c) throw Error('Missing team'); return { team:normalizeTeam(c.team.abbreviation), name:c.team.shortDisplayName || c.team.displayName, score:Number(c.score || 0) }; };
    return { id:e.id, date:e.date, home:side('home'), away:side('away'), completed:Boolean(e.status?.type?.completed), status:e.status?.type?.shortDetail || '', state:e.status?.type?.state || 'pre', url:`https://www.espn.com/nfl/game/_/gameId/${e.id}` };
  });
  if (games.length > 16 || new Set(games.flatMap(g=>[g.home.team,g.away.team])).size !== games.length*2) throw Error('Duplicate teams in schedule');
  return { season:Number(expected.season), week:Number(expected.week), seasonType:expected.season_type, games };
}
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
    if(s?.lastAttempt && this.clock()-Date.parse(s.lastAttempt)<60000) return false;
    return !s?.checkedAt || this.clock()-Date.parse(s.checkedAt)>=TTL[key]*1000;
  }
  async update(key,url,transform) {
    if(!this.due(key)) return;
    const old=this.sources[key]; const attempted=new Date(this.clock()).toISOString();
    try { const data=transform(await this.fetcher(url)); this.sources[key]={data,checkedAt:attempted,lastAttempt:attempted,error:null}; }
    catch (err) { this.sources[key]={...old,lastAttempt:attempted,error:String(err.message).slice(0,120)}; }
  }
  async refresh() {
    if (this.pending) return this.pending;
    if (!Object.keys(TTL).some(key => this.due(key))) return;
    this.pending=(async()=>{
      await Promise.all([
        this.update('state',SLEEPER+'/state/nfl',d=>{if(!/^20\d{2}$/.test(d?.season) || !Number.isInteger(d.week) || d.week<0 || d.week>25)throw Error('Invalid NFL state');return {season:d.season,week:d.week,season_type:d.season_type};}),
        this.update('players',SLEEPER+'/players/nfl',cleanPlayers),
        this.update('trends',SLEEPER+'/players/nfl/trending/add?lookback_hours=24&limit=30',d=>{if(!Array.isArray(d) || d.some(x=>!x.player_id || !Number.isFinite(x.count)))throw Error('Invalid activity feed');return d.map(x=>({id:String(x.player_id),count:x.count}));}),
      ]);
      const state=this.sources.state?.data;
      await Promise.all([
        this.update('news',ESPN+'/news?limit=50',d=>cleanNews(d,this.sources.players?.data || [])),
        state?.week ? this.update('schedule',`${ESPN}/scoreboard?dates=${state.season}&seasontype=${{pre:1,regular:2,post:3}[state.season_type] || 2}&week=${state.week}&limit=100`,d=>cleanSchedule(d,state)) : Promise.resolve(),
      ]);
      try { await this.save(); } catch { console.error('Cache persistence unavailable; retaining memory cache'); }
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
  publicData() {
    const sources=Object.fromEntries(Object.entries(this.sources).map(([k,v])=>[k,{checkedAt:v.checkedAt || null,lastAttempt:v.lastAttempt || null,stale:!v.checkedAt || this.clock()-Date.parse(v.checkedAt)>TTL[k]*2000,error:v.error || null,refreshSeconds:TTL[k]}]));
    return { schema:1,serverTime:new Date(this.clock()).toISOString(),refreshing:Boolean(this.pending),sources,state:this.sources.state?.data || null,players:this.sources.players?.data || [],news:this.sources.news?.data || [],trends:this.sources.trends?.data || [],schedule:this.sources.schedule?.data || null };
  }
}
