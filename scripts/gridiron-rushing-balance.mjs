// Repeatable tuning exercise, not predicted human statistics.
// node scripts/gridiron-rushing-balance.mjs [trials per group=320] [optional asset directory]
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const base=process.argv[3]?pathToFileURL(process.argv[3]+'/'):new URL('../daily_flyer/themes/pocket_gridiron_assets/',import.meta.url);
const {Game}=await import(new URL('engine.js',base));
const {buildTeam,TEAMS}=await import(new URL('roster.js',base));
const {seededRandom}=await import(new URL('rules.js',base));
const data=JSON.parse(fs.readFileSync(new URL('rosters.json',base))),n=Number(process.argv[2])||320;
for(const format of [7,11])for(const difficulty of ['rookie','pro','legend']){
 const results=[];let runCalls=0;
 for(let i=0;i<n;i++){
  const home=buildTeam(TEAMS[i%32].abbr,data),away=buildTeam(TEAMS[(i*7+9)%32].abbr,data),rng=seededRandom((Math.imul(i+1,2654435761)+731)>>>0),g=new Game(home,away,difficulty,rng,{format});
  g.beginDrive(1,30);runCalls+=g.playDefinition.kind==='run';const runs=g.offensePlays.filter(p=>p.kind==='run'),call=runs[i%runs.length],coverage=['zone','man','commit','blitz','cover3'][i%5];
  g.defense=coverage;g.play=call.id;g.phase='ready';g.setFormation();g.isHumanDefender=()=>false;if(!g.snap(1))throw Error('Trial did not snap');
  let ticks=0;while(['live','return','fumble'].includes(g.phase)&&ticks++<450)g.tick(.05);
  if(g.isLive||g.isLoose)throw Error('Trial did not finish');
  if(g.phase==='penalty')g.resolvePenalty(false);
  results.push({yards:g.box[1].rushYards,call:call.id,blocks:g.events.filter(e=>e.type==='block').length});
 }
 const yards=results.map(r=>r.yards).sort((a,b)=>a-b),pct=fn=>Math.round(1000*results.filter(fn).length/n)/10;
 console.log(JSON.stringify({format,difficulty,trials:n,runCallPct:Math.round(runCalls/n*1000)/10,yardsPerCarry:Number((yards.reduce((a,b)=>a+b,0)/n).toFixed(2)),median:yards[Math.floor(n/2)],stuffPct:pct(r=>r.yards<=0),fivePlusPct:pct(r=>r.yards>=5),twentyPlusPct:pct(r=>r.yards>=20)}));
}
