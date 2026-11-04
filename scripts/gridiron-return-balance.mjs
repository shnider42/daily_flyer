// Repeatable return tuning diagnostic, not a forecast of human/NFL statistics.
// Returnable kicks only; straight/edge/weave runners use burst and commit to a break at contact.
// Run: node scripts/gridiron-return-balance.mjs [trials per scenario=300] [optional asset directory] [format=11]
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const base=process.argv[3]?pathToFileURL(process.argv[3]+'/'):new URL('../daily_flyer/themes/pocket_gridiron_assets/',import.meta.url);
const {Game}=await import(new URL('engine.js',base));
const {buildTeam}=await import(new URL('roster.js',base));
const {seededRandom}=await import(new URL('rules.js',base));
const format=Number(process.argv[4])===7?7:11;
const data=JSON.parse(fs.readFileSync(new URL('rosters.json',base)));
const home=buildTeam('NE',data),away=buildTeam('BUF',data),trials=Number(process.argv[2])||300;
for(const type of ['kickoff','punt'])for(const route of ['straight','edge','weave']){
 let returns=0,yards=0,touchdowns=0,fumbles=0;
 for(let seed=1;seed<=trials;seed++){
  const rng=seededRandom(seed),g=new Game(home,away,'pro',rng,{format});g.beginKick(type,1,type==='punt'?40:35);
  g.launchKick(.62+rng()*.15,(rng()-.5)*1.25);
  let ticks=0;while(g.phase.startsWith('kick_')&&ticks++<250)g.tick(.05);
  if(!g.isReturn)continue;returns++;const start=g.carrier.y,edge=g.carrier.x<26.5?7:46;
  while(g.isReturn&&ticks++<650){
   const x=route==='edge'?(edge-g.carrier.x)*.4:route==='weave'?Math.sin(g.liveTime*1.5)*.8:0;
   const input={x:Math.max(-1,Math.min(1,x)),y:1};if(g.breakAvailable)g.breakTackle(input);else g.burst();g.tick(.05,input);
  }
  yards+=g.carrier.y-start;touchdowns+=g.scores[0]>=6;fumbles+=g.isLoose;
 }
 console.log(JSON.stringify({format,type,route,trials,returns,averageYards:+(yards/returns).toFixed(2),touchdownPct:+(100*touchdowns/returns).toFixed(2),fumbles}));
}
