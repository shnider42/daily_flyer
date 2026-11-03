// Football-season atmosphere, not a live forecast or measured occurrence odds.
// Weather uses its own seeded generator: presentation never advances football RNG.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const WEATHER={
 clear:{name:'Clear',icon:'☀',speed:1,acceleration:1,cut:0,drop:0,fumble:0,range:1,accuracy:1,recovery:1,cost:1},
 wind:{name:'Windy',icon:'↝',speed:1,acceleration:1,cut:0,drop:0,fumble:0,range:1,accuracy:1,recovery:1,cost:1},
 rain:{name:'Rain',icon:'☂',speed:.97,acceleration:.82,cut:.10,drop:.012,fumble:.0035,range:.96,accuracy:.92,recovery:1,cost:1},
 snow:{name:'Snow',icon:'❄',speed:.91,acceleration:.70,cut:.14,drop:.008,fumble:.002,range:.93,accuracy:.94,recovery:1,cost:1},
 heat:{name:'Heat',icon:'☀',speed:1,acceleration:1,cut:0,drop:0,fumble:0,range:1,accuracy:1,recovery:.67,cost:1.25}
};
export const SEASONS={early:'Early season · Sep–Oct',autumn:'Late fall · Nov',winter:'Winter · Dec–Feb'};
// [clear, wind, rain, snow, heat], deliberately authored for varied, credible games.
const CLIMATE={
 lakes:[[52,20,18,0,10],[36,22,22,20,0],[34,20,16,30,0]],
 north:[[55,19,18,0,8],[43,21,23,13,0],[42,20,16,22,0]],
 inland:[[53,22,15,0,10],[48,23,20,9,0],[45,22,16,17,0]],
 midatlantic:[[52,17,20,0,11],[48,20,27,5,0],[48,19,20,13,0]],
 southeast:[[42,13,22,0,23],[60,15,23,2,0],[57,16,23,4,0]],
 florida:[[30,14,28,0,28],[53,18,21,0,8],[66,19,15,0,0]],
 northwest:[[60,14,25,0,1],[36,18,45,1,0],[40,18,39,3,0]],
 bay:[[64,22,4,0,10],[56,23,21,0,0],[52,24,24,0,0]],
 socal:[[71,10,4,0,15],[78,12,10,0,0],[76,12,12,0,0]],
 mountain:[[57,19,10,4,10],[51,20,11,18,0],[47,19,10,24,0]],
 desert:[[40,14,6,0,40],[76,17,7,0,0],[78,16,6,0,0]]
};
const venue=(name,city,climate,roof='open')=>({name,city,climate,roof});
export const VENUES={
 ARI:venue('State Farm Stadium','Glendale, Arizona','desert','retractable'),ATL:venue('Mercedes-Benz Stadium','Atlanta, Georgia','southeast','retractable'),
 BAL:venue('M&T Bank Stadium','Baltimore, Maryland','midatlantic'),BUF:venue('Highmark Stadium','Orchard Park, New York','lakes'),CAR:venue('Bank of America Stadium','Charlotte, North Carolina','southeast'),
 CHI:venue('Soldier Field','Chicago, Illinois','lakes'),CIN:venue('Paycor Stadium','Cincinnati, Ohio','inland'),CLE:venue('Huntington Bank Field','Cleveland, Ohio','lakes'),
 DAL:venue('AT&T Stadium','Arlington, Texas','southeast','retractable'),DEN:venue('Empower Field at Mile High','Denver, Colorado','mountain'),DET:venue('Ford Field','Detroit, Michigan','lakes','fixed'),GB:venue('Lambeau Field','Green Bay, Wisconsin','lakes'),
 HOU:venue('NRG Stadium','Houston, Texas','southeast','retractable'),IND:venue('Lucas Oil Stadium','Indianapolis, Indiana','inland','retractable'),JAX:venue('Jacksonville home field','Jacksonville, Florida','florida'),KC:venue('Arrowhead Stadium','Kansas City, Missouri','inland'),
 LA:venue('SoFi Stadium','Inglewood, California','socal','canopy'),LAC:venue('SoFi Stadium','Inglewood, California','socal','canopy'),LV:venue('Allegiant Stadium','Paradise, Nevada','desert','fixed'),MIA:venue('Hard Rock Stadium','Miami Gardens, Florida','florida'),
 MIN:venue('U.S. Bank Stadium','Minneapolis, Minnesota','lakes','fixed'),NE:venue('Gillette Stadium','Foxborough, Massachusetts','north'),NO:venue('Caesars Superdome','New Orleans, Louisiana','southeast','fixed'),
 NYG:venue('MetLife Stadium','East Rutherford, New Jersey','north'),NYJ:venue('MetLife Stadium','East Rutherford, New Jersey','north'),PHI:venue('Lincoln Financial Field','Philadelphia, Pennsylvania','midatlantic'),PIT:venue('Acrisure Stadium','Pittsburgh, Pennsylvania','north'),
 SEA:venue('Lumen Field','Seattle, Washington','northwest'),SF:venue('Levi’s Stadium','Santa Clara, California','bay'),TB:venue('Raymond James Stadium','Tampa, Florida','florida'),TEN:venue('Nissan Stadium','Nashville, Tennessee','southeast'),WAS:venue('Washington home field','Landover, Maryland','midatlantic'),
 OAK72:venue('Oakland Coliseum','Oakland, California','bay'),PIT72:venue('Three Rivers Stadium','Pittsburgh, Pennsylvania','north'),OAK78:venue('Oakland Coliseum','Oakland, California','bay'),SD78:venue('San Diego Stadium','San Diego, California','socal'),DAL81:venue('Texas Stadium','Irving, Texas','southeast'),SF81:venue('Candlestick Park','San Francisco, California','bay'),NE16:venue('Gillette Stadium','Foxborough, Massachusetts','north'),ATL16:venue('Georgia Dome','Atlanta, Georgia','southeast','fixed'),SBLI:venue('NRG Stadium','Houston, Texas','southeast','fixed')
};
export function venueFor(home,override){const id=override||home?.abbr||home;return {...(VENUES[id]||VENUES[home?.franchise]||venue('PGI Field','Neutral outdoor field','midatlantic')),id};}
function random(seed){let n=Number(seed)>>>0;return ()=>{n=(n+0x6D2B79F5)|0;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export function weatherWeights(v,season='autumn'){
 const i=season==='early'?0:season==='winter'?2:1,raw=CLIMATE[v.climate]||CLIMATE.midatlantic,w=Object.fromEntries(Object.keys(WEATHER).map((k,j)=>[k,raw[i][j]]));
 if(v.roof==='fixed'||v.roof==='retractable')return {clear:100,wind:0,rain:0,snow:0,heat:0};
 if(v.roof==='canopy'){w.clear+=w.rain+w.snow;w.rain=w.snow=0;}
 return w;
}
export function createWeather(home,options={}){
 if(options?.kind&&options?.venue)return structuredClone(options);
 const o=typeof options==='string'?{selection:options}:options,season=Object.hasOwn(SEASONS,o.season)?o.season:'autumn',seed=Number(o.seed)||1,rng=random(seed);
 const v=o.practice?{...venueFor(home),name:'Outdoor training ground',roof:'open',id:'practice'}:venueFor(home,o.venue);
 const roofClosed=['fixed','retractable'].includes(v.roof),weights=weatherWeights(v,season),selection=o.selection||'clear';
 let kind=Object.hasOwn(WEATHER,selection)?selection:'clear';
 if(selection==='auto'){let roll=rng()*Object.values(weights).reduce((a,b)=>a+b,0);kind=Object.keys(weights).find(k=>(roll-=weights[k])<0)||'clear';}
 if(roofClosed||v.roof==='canopy'&&['rain','snow'].includes(kind))kind='clear';
 let temperature=roofClosed?72:kind==='snow'?Math.round(21+rng()*11):kind==='heat'?Math.round(87+rng()*9):Math.round(({early:67,autumn:49,winter:34}[season])+({florida:23,socal:20,bay:15,desert:17,southeast:10,northwest:8,mountain:-3,lakes:-5}[v.climate]||0)+(rng()-.5)*12);
 if(kind==='rain')temperature=Math.max(36,temperature);
 const mph=roofClosed?0:kind==='clear'||kind==='heat'?0:kind==='wind'?17+rng()*7:kind==='rain'?6+rng()*7:5+rng()*6;
 const angle=rng()*Math.PI*2,windScale=v.roof==='canopy'?.35:1;
 return {kind,venue:v,season,seed,temperature,roofClosed,selection,source:o.source||'simulated',wind:{x:mph?Math.sin(angle)*mph*windScale:0,y:mph?Math.cos(angle)*mph*windScale:0},gust:kind==='wind'?3:kind==='rain'?1.5:kind==='snow'?1:0,phase:rng()*Math.PI*2};
}
export function effects(w){return WEATHER[w?.kind]||WEATHER.clear;}
export function windAt(w,time=0){if(!w||w.roofClosed)return {x:0,y:0,mph:0};const n=Math.hypot(w.wind.x,w.wind.y),factor=n?1+(w.gust||0)*Math.sin(time*.31+w.phase)/n:1;return {x:w.wind.x*factor,y:w.wind.y*factor,mph:n*factor};}
// The screen always follows the offense. A team changes ends each quarter;
// possession changes rotate both components, not the underlying stadium wind.
export function windFor(g,team=g.offense,time=g.time||0){const raw=windAt(g.weather,time),sign=(team===0?1:-1)*(g.quarter%2===0?-1:1);return {...raw,x:raw.x*sign,y:raw.y*sign};}
export function kickConditions(g){const w=g.special?.weatherWind||windFor(g,g.special?.kickingTeam??g.offense),e=effects(g.weather);return {wind:w,rangeFactor:e.range,accuracyFactor:e.accuracy};}
export function windArrow(w){if(w.mph<.5)return '—';const i=(Math.round(Math.atan2(w.x,w.y)/(Math.PI/4))+8)%8;return ['↑','↗','→','↘','↓','↙','←','↖'][i];}
export function weatherLabel(w){if(!w)return 'Clear';return w.roofClosed?'INDOORS · 72°F':`${WEATHER[w.kind].name.toUpperCase()} · ${w.temperature}°F`;}
export function weatherAdvice(w,level='moderate'){
 if(w?.roofClosed)return level==='simple'?'Roof closed. Dry field, no wind.':'Climate-controlled field. No weather penalties; the kicking meter is centered.';
 const copy={clear:['Dry field. Normal grip and kicking.','Neutral conditions: timing, ratings and placement decide the play.','No footing, catch, stamina or kick-range weather modifiers.'],wind:['Watch the arrow. Long throws and kicks drift.','Throw into the breeze. The pass target and green kicking zone include wind. Teams switch ends each quarter.','Longer flight means more drift. Headwind trims range; tailwind adds it. Kick wind locks when the meter starts.'],rain:['Make gentle cuts. Protect the ball.','Wet footing slows sharp cuts. Grip is less reliable, and kicks lose a little range.','Speed −3%; acceleration −18%; catch-drop risk +1.2 points; contact-fumble risk +0.35 points; kick range −4% before wind.'],snow:['Short steps. Short passes. Set your feet.','Slower footing and less kick range. The yard lines and ball stay clear enough to read.','Speed −9%; acceleration −30%; catch-drop risk +0.8 points; contact-fumble risk +0.2 points; kick range −7% before wind.'],heat:['Save BURST for the gap. Stamina comes back slowly.','Bursts and tackle-breaking moves cost more energy. Between-play resets keep the heat manageable.','Burst / break-tackle stamina cost +25%; live-play recovery −33%. Both teams use the same contact costs.']};
 return (copy[w?.kind]||copy.clear)[level==='simple'?0:level==='expert'?2:1];
}
export function weatherPassDrift(g,duration){const w=windFor(g);return {x:w.x*.065*duration*duration,y:w.y*.045*duration*duration};}
export function weatherMove(g,p,dx,dy,dt){
 const e=effects(g.weather);if(!e.cut)return 1;const n=Math.hypot(dx,dy);if(n<.1)return e.speed;
 const x=dx/n,y=dy/n,dot=p.weatherDX===undefined?1:x*p.weatherDX+y*p.weatherDY;
 if(dot<.25&&(p.weatherCutUntil||0)<=g.time){p.pace=Math.min(p.pace??1,.70);p.weatherCutUntil=g.time+.38;if(p===g.carrier&&g.isLive)g.offBalance=Math.max(g.offBalance||0,e.cut);}
 p.weatherDX=x;p.weatherDY=y;return e.speed;
}
