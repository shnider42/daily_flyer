// Repeatable arcade tuning smoke test; not a forecast of human match statistics.
// Run: node scripts/gridiron-balance.mjs [plays per difficulty, default 2000]
import fs from 'node:fs';
import {Game,PLAYS,distance} from '../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {seededRandom} from '../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {buildTeam} from '../daily_flyer/themes/pocket_gridiron_assets/roster.js';
const data=JSON.parse(fs.readFileSync(new URL('../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const home=buildTeam('NE',data),away=buildTeam('BUF',data),passes=PLAYS.filter(p=>p.kind==='pass');
for(const level of ['rookie','pro','legend']){
 const rng=seededRandom(991),n=Number(process.argv[2])||2000;
 const totals={attempts:0,completions:0,interceptions:0,drops:0,tips:0,noAttempt:0};
 for(let i=0;i<n;i++){
  const g=new Game(home,away,level,rng);g.beginDrive(0,25);g.choose(passes[i%passes.length].id);g.snap();const delay=1.1+rng()*1.9;let ticks=0;
  while(g.phase==='live'&&ticks++<400){
   if(g.canPass&&g.liveTime>=delay){
    const options=g.players.slice(2,5).map((p,i)=>({i,gap:Math.min(...g.defenders.map(d=>distance(d,p)))})).sort((a,b)=>b.gap-a.gap);
    // Mostly choose separation; every fourth play forces a receiver to include risky throws.
    g.throwTo(i%4===0?i%3:options[0].i);
   }
   g.tick(.05,{x:0,y:g.canPass?0:1});if(g.stats.completions||g.isLoose)break;
  }
  for(const k of ['attempts','completions','interceptions','drops'])totals[k]+=g.stats[k];
  totals.tips+=g.events.filter(e=>e.text==='TIPPED!').length;totals.noAttempt+=g.stats.attempts?0:1;
 }
 console.log(JSON.stringify({difficulty:level,plays:n,...totals,interceptionPct:100*totals.interceptions/totals.attempts,tipPct:100*totals.tips/totals.attempts}));
}
