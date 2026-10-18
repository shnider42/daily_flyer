/* Teaching state is local and separate from game rules, saves and Experience. */
'use strict';
(()=>{
 const key='empires-learning-v1',steps=['goal','land','explore','city','improve','research','turn'];
 let saved={ignored:false,welcomed:false,progress:{}};
 try{const v=JSON.parse(localStorage.getItem(key)||'null');if(v&&typeof v==='object')saved={ignored:v.ignored===true,welcomed:v.welcomed===true,progress:v.progress&&typeof v.progress==='object'&&!Array.isArray(v.progress)?v.progress:{}};}catch{}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(saved));}catch{}};
 const campaign=g=>`${g.code}:${g.side}`,progress=g=>saved.progress[campaign(g)]||{},done=g=>steps.filter(k=>progress(g)[k]===true);
 function mark(g,id,feedback){
  if(!g||!steps.includes(id))return;
  const p={...progress(g),[id]:true};if(feedback)p.feedback=feedback.slice(0,600);saved.progress[campaign(g)]=p;
  const ids=Object.keys(saved.progress);for(const old of ids.slice(0,-30))delete saved.progress[old];persist();
 }
 function lesson(g){
  const intro={id:'goal',title:'You lead a whole civilization',facts:[
   'Units explore and act on the map. Cities turn nearby land into food, production and gold. You choose what cities build and what your civilization researches.',
   'Start by helping one city grow. You do not need to fight: after 40 rounds, cities, population, discoveries and explored ruins determine your development score. Capturing the rival capital is the other way to win.',
   'Your first loop: read the land → explore → give a city a job → improve land → choose research → End turn.'
  ],label:g?'Show me the land':'Choose your civilization',action:g?'inspect':'setup'};
  if(!g)return intro;
  const completed=done(g),id=steps.find(k=>!completed.includes(k)),own=g.units.filter(u=>u.side===g.side),cities=g.cities.filter(c=>c.side===g.side);
  const city=cities.find(c=>!c.project)||cities[0],scout=own.find(u=>u.kind==='scout'&&u.ap>0)||own.find(u=>u.kind==='scout'),builder=own.find(u=>u.kind==='builder'&&g.legal[u.id]?.actions.some(k=>['farm','mine','road'].includes(k)))||own.find(u=>u.kind==='builder');
  const tech=g.technologies[g.player.research];
  if(g.winner)return {id:'result',title:'Your campaign has finished',facts:[g.result||'The final result is saved.',`Your development score is ${g.score}. Review your cities and Chronicle to see how your decisions added up.`],action:'chronicle',label:'Read the Chronicle',complete:true};
  const lessons={
   goal:intro,
   land:{id,title:'Land feeds your cities',facts:['Food helps population grow. Production builds a city’s chosen project. Gold pays upkeep and can rush a project. Knowledge comes from cities and discoveries, not a basic terrain yield.',
    'Each citizen automatically works one nearby hex, within two hexes of a city. A hex supports only its nearest city. Good land is potential income: standing a unit there does not collect it.',
    'Inspect a hex to see its numbers, whether your city works it, movement costs and useful orders. Inspection spends no action points.'],label:'Inspect land on the map',action:'inspect'},
   explore:{id,title:'Explore with your scout',facts:['Select a Scout, then tap a highlighted neighboring hex. The number on it is the cost in action points (AP). Unseen land is unknown; moving closer reveals more of it.',scout?`Your Scout has ${scout.ap} AP. Woods cost a Scout 1 AP; hills cost 2. ${scout.ap?'Look for a highlighted step toward the unknown.':'End a turn to restore AP before practicing.'}`:'You have no Scout now. A city can produce one; you can also review this lesson and keep playing.'],label:scout?'Show my Scout':'Show a city',action:scout?'unit':'city',entity:(scout||city)?.id},
   city:{id,title:'Give a city a job',facts:[city?`${city.name} produces ${city.yields.production} production per turn. ${city.project?`${city.projects[city.project]?.name||city.project} is already queued: ${city.production} of ${city.projects[city.project]?.cost||'?'} production stored.`:'It has no project: its production is stored until you choose one.'}`:'A city is your economic base.',
    'A Granary adds food, helping this city grow. More population means more nearby hexes can be worked. You choose a project; the city adds production when you End turn.',
    'The city center provides its own base income. Its Orders panel shows total output, including worked land and buildings.'],label:city?.project?'Keep this project & view city':'Choose a city project',action:'city',entity:city?.id,review:!!city?.project},
   improve:{id,title:'Builders make land more useful',facts:[`A farm on grass adds ${g.player.techs.includes('agriculture')?3:2} food to that hex when it is worked. A mine on hills adds ${g.player.techs.includes('engineering')?3:2} production. Roads help units travel; they add no income.`,
    'Builders improve the hex they stand on. Each improvement costs 2 AP and one of their three building charges. It must be near your city, outside a city center and rival territory.',
    builder?`Your Builders have ${builder.ap} AP and ${builder.charges} charges. ${builder.ap<2?'They need a new turn before improving land.':'Open Orders to see what is legal here; if necessary, move them to suitable land first.'}`:'No Builders remain. Your city can train another; the improvements already built stay on the map.'],label:builder?'Show Builders and Orders':'Show a city',action:builder?'builder':'city',entity:(builder||city)?.id},
   research:{id,title:'Research is a civilization-wide plan',facts:[tech?`${tech.name} is already selected. ${tech.benefit}. You have ${g.player.knowledge} of ${tech.cost} knowledge and earn ${g.economy.knowledge} per turn.`:`You have ${g.player.knowledge} knowledge stored. Choose an available discovery in Research.`,
    'Choosing research does not spend a unit’s AP. Knowledge is added when you End turn, then the discovery finishes if you have enough. Waiting in real time does nothing.',
    'You can change research without losing stored knowledge. When a discovery finishes, choose the next one.'],label:tech?'Keep this research & view it':'Choose research',action:'research',review:!!tech},
   turn:{id,title:'End turn makes your plans happen',facts:['You can move and give several orders before ending a turn. When ready, End turn adds income, advances city growth and projects, and resolves research. Your rival then takes a turn.',
    'Units refresh their action points for their next turn and can carry over at most one unused AP. You do not have to spend every point.',
    'Afterward, check what changed: population, project progress and knowledge. Then repeat the loop.'],label:'End turn',action:'end'}
  };
  if(id)return {...lessons[id],number:completed.length+1,total:steps.length};
  let next={title:'Keep developing your civilization',facts:['Your first-turn lessons are complete. Keep exploring, improving worked land and giving cities useful projects. Founding another well-placed city can grow your economy and score.','These prompts stay available in Simple until you explicitly choose Ignore tutorial.'],action:'city',entity:city?.id,label:'Review a city',complete:true};
  if(!tech&&g.player.techs.length<Object.keys(g.technologies).length)next={...next,title:'Choose your next discovery',facts:['Research has no selected technology. Knowledge still accumulates, but no discovery can finish until you choose one.'],action:'research',label:'Open Research'};
  else if(city&&!city.project)next={...next,title:`Give ${city.name} its next project`,facts:['This city is storing production. Choose a project so that production can finish something useful at turn end.'],label:'Choose production'};
  else if(own.some(u=>u.shaken))next={...next,title:'Help a shaken unit recover',facts:['A shaken unit must Rally before moving or attacking. Rally costs 1 AP.'],action:'builder',entity:own.find(u=>u.shaken).id,label:'Show Rally orders'};
  else if(builder&&g.legal[builder.id]?.actions.some(k=>['farm','mine','road'].includes(k)))next={...next,title:'Your Builders can improve land',facts:['Check whether a nearby citizen works this hex. Improving a worked hex helps immediately at the next turn end; other land may become useful as the city grows.'],action:'builder',entity:builder.id,label:'Show Builders'};
  else if(!own.some(u=>g.legal[u.id]?.moves.length||g.legal[u.id]?.actions.length))next={...next,title:'Ready for the next turn?',facts:['Your units have no legal orders available right now. End turn to advance the economy and refresh their AP.'],action:'end',label:'End turn'};
  return next;
 }
 function record(command,before,after){
  if(!before||!after||before.code!==after.code||after.revision<=before.revision)return;
  const u=before.units.find(u=>u.id===command.unit),now=after.units.find(v=>v.id===command.unit);
  if(command.kind==='move'&&u?.kind==='scout'&&now&&now.pos.join(',')===command.pos.join(',')&&u.pos.join(',')!==now.pos.join(',')){
   const revealed=after.visible.filter(p=>!before.visible.includes(p)).length;
   mark(after,'explore',`Scout moved: ${u.ap} → ${now.ap} AP. ${revealed?`${revealed} newly visible hexes.`:'No new land was revealed on this step; keep exploring toward the unknown.'}`);
  }
  if(['farm','mine','road'].includes(command.kind)&&u?.kind==='builder'){
   const t=after.map[u.pos[1]]?.[u.pos[0]];
   if(command.kind==='road'?t?.road:t?.improvement===command.kind)mark(after,'improve',`${command.kind[0].toUpperCase()+command.kind.slice(1)} completed. ${command.kind==='road'?'This helps movement, not income.':'Its extra yield counts at turn end when a citizen works this hex.'}`);
  }
  if(command.kind==='produce'&&after.cities.some(c=>c.id===command.city&&c.project===command.project))mark(after,'city','City project saved. Production is added when you End turn.');
  if(command.kind==='research'&&after.player.research===command.tech)mark(after,'research','Research saved. Knowledge advances at End turn, without spending unit AP.');
  if(command.kind==='end'&&(after.round!==before.round||after.turn!==before.turn||after.winner)){
   const found=after.player.techs.filter(k=>!before.player.techs.includes(k));
   const grew=after.cities.filter(c=>c.side===after.side&&c.population>(before.cities.find(v=>v.id===c.id)?.population||c.population));
   mark(after,'turn',`Turn resolved. Knowledge stored: ${before.player.knowledge} → ${after.player.knowledge}.${found.length?' Discovered '+found.map(k=>after.technologies[k].name).join(', ')+'.':''}${grew.length?' Population grew in '+grew.map(c=>c.name).join(', ')+'.':''} Check city Orders for food and project progress.`);
  }
 }
 const terrain={grass:['Grassland','Good for food and farms.'],woods:['Woods','Food and production, with defensive cover. Blocks sight through it.'],hill:['Hills','Good for production and mines, with defensive cover.'],mountain:['Mountains','Impassable to units. Blocks sight through it.'],water:['Water','Food and gold when worked. Only galleys can move here.'],bridge:['Bridge','A land crossing over water. Road movement can help here.']};
 const paths={food:'M8 15V2M8 5Q2 5 3 1Q8 1 8 5M8 9Q2 9 3 5Q8 5 8 9M8 7Q14 7 13 3Q8 3 8 7M8 12Q14 12 13 8Q8 8 8 12',production:'M3 13 11 5M7 2 14 9 16 6 10 0ZM1 12 4 15 7 12 4 9Z',gold:'M8 1a7 7 0 1 0 0 14a7 7 0 1 0 0-14M8 4V12M5 6H10M6 10H11',grain:'M8 15V2M8 5 3 2M8 8 2 5M8 11 3 8M8 6 13 3M8 9 14 6M8 12 13 9',iron:'M2 12 5 3 11 1 15 11 10 15ZM5 3 8 8 2 12M8 8 15 11M8 8 10 15',ruins:'M1 15H15M3 12V4H6V12M10 12V1H13V12M2 3H7M9 1H14',farm:'M2 15 6 7M7 15 10 7M12 15 14 9M1 6 7 1 13 6M4 6V9M10 6V9',mine:'M2 14V4H14V14M1 4H15M5 14 8 8 11 14M3 1H13',worker:'M8 1a3 3 0 1 0 0 6a3 3 0 1 0 0-6M2 15V12Q8 6 14 12V15Z'};
 function icon(kind){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 16 16',width:16,height:16,class:'emp-land-icon','aria-hidden':'true',focusable:'false'}))n.setAttribute(k,v);const p=document.createElementNS(n.namespaceURI,'path');p.setAttribute('d',paths[kind]||paths.food);n.append(p);return n;}
 function distance(a,b){const y=a[1]-b[1],x=a[0]-(a[1]-(a[1]&1))/2-b[0]+(b[1]-(b[1]&1))/2;return Math.max(Math.abs(x),Math.abs(y),Math.abs(x+y));}
 window.empiresLearning={steps,lesson,mark,record,terrain,icon,distance,done,feedback:g=>progress(g).feedback||'',get ignored(){return saved.ignored;},get welcomed(){return saved.welcomed;},welcome(){saved.welcomed=true;persist();},ignore(){saved.ignored=true;persist();},resume(){saved.ignored=false;persist();},restart(g){if(g)delete saved.progress[campaign(g)];saved.ignored=false;persist();}};
})();
