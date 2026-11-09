import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SourceStore, fetchJSON, SLEEPER } from './lib/providers.mjs';

const store = new SourceStore();
await store.load();
const root = fileURLToPath(new URL('./public/',import.meta.url));
const leagueCache=new Map();
const leaguePending=new Map();
let leagueActive=0;
async function getLeague(id) {
  const cached=leagueCache.get(id);
  if(cached && Date.now()-cached.at<300000)return cached.data;
  if(leaguePending.has(id)) return leaguePending.get(id);
  if(leagueActive>=4)throw Error('League import is busy. Please try again shortly.');
  const task=(async()=>{
    leagueActive++;
    try {
      const [league,rosters,users]=await Promise.all(['','/rosters','/users'].map(s=>fetchJSON(`${SLEEPER}/league/${id}${s}`)));
      if(league?.sport!=='nfl' || !Array.isArray(rosters) || !Array.isArray(users) || !rosters.length)throw Error('An NFL league was not found for this ID.');
      if(!Number.isInteger(league.total_rosters) || rosters.length!==league.total_rosters || new Set(rosters.map(r=>r.roster_id)).size!==rosters.length || rosters.some(r=>!Number.isInteger(r.roster_id) || (r.players!==null && !Array.isArray(r.players)) || ['reserve','taxi'].some(key=>r[key]!=null && !Array.isArray(r[key]))))throw Error('Sleeper returned an incomplete roster snapshot. Please try again later.');
      const data={id,name:league.name,season:league.season,status:league.status,settings:league.settings,scoring:league.scoring_settings,positions:league.roster_positions,
        checkedAt:new Date().toISOString(),rosters:rosters.map(r=>({id:r.roster_id,owner:r.owner_id,name:users.find(u=>u.user_id===r.owner_id)?.metadata?.team_name || users.find(u=>u.user_id===r.owner_id)?.display_name || `Team ${r.roster_id}`,players:r.players || [],starters:r.starters || [],reserve:r.reserve || [],taxi:r.taxi || [],record:{wins:r.settings?.wins || 0,losses:r.settings?.losses || 0}}))};
      if(leagueCache.size>=30)leagueCache.delete(leagueCache.keys().next().value);
      leagueCache.set(id,{at:Date.now(),data});return data;
    } finally { leagueActive--; }
  })().finally(()=>leaguePending.delete(id));
  leaguePending.set(id,task);return task;
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const paths={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/logic.js':'logic.js','/favicon.svg':'favicon.svg'};
const preview=process.argv.includes('--strictPort');
const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',`default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors ${preview?"'self'":"'none'"}; base-uri 'none'; form-action 'self'`);
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET' && req.method!=='HEAD'){json(405,{error:'Read-only service'});return;}
    if(url.pathname==='/health'){json(200,{ok:true});return;}
    if(preview && url.pathname==='/__preview/mobile'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><title>Mobile QA · Roster Radar</title></head><body><iframe title="390px phone preview" src="/" width="390" height="844"></iframe></body></html>');return;
    }
    if(url.pathname==='/api/briefing'){
      // A shared refresh prevents one visitor from making a separate upstream request.
      store.refresh().catch(()=>{});
      json(200,store.publicData());return;
    }
    if(url.pathname.startsWith('/api/league/')){
      const id=url.pathname.slice('/api/league/'.length);
      if(!/^\d{10,24}$/.test(id)){json(400,{error:'Use a numeric Sleeper league ID or a Sleeper league URL.'});return;}
      try {json(200,await getLeague(id));}catch(err){json(502,{error:err.message || 'Sleeper is unavailable. Try again shortly.'});}return;
    }
    const name=paths[url.pathname];
    if(!name){json(404,{error:'Not found'});return;}
    const body=await readFile(root+name);const ext=name.slice(name.lastIndexOf('.'));
    res.writeHead(200,{'Content-Type':types[ext],'Cache-Control':name==='index.html'?'no-cache':'public, max-age=300'});res.end(req.method==='HEAD'?undefined:body);
  } catch { json(500,{error:'Unable to load this resource.'}); }
});
const portArg=process.argv.indexOf('--port');
const port=Number(process.env.PORT || (portArg>=0?process.argv[portArg+1]:3000));
server.listen(port,'0.0.0.0',()=>{console.log(`Roster Radar listening on ${port}`);store.refresh().catch(()=>{});});
const tick=setInterval(()=>store.refresh().catch(()=>{}),60000);tick.unref();
process.on('SIGTERM',()=>{clearInterval(tick);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),8000).unref();});
