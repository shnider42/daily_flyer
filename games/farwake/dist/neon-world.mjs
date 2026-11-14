/** Hand-authored city geography and small, bounded pixel-art effects. */
import {NEON_CITY_ID,NEON_DISTRICTS} from './neon-content.mjs';
import {pixelRect,pixelLine,pixelRing} from './pixel-art.mjs';

export const isNeonCity = location => location?.id === NEON_CITY_ID;
export const NEON_PALETTE = Object.freeze({ground:'#20252f',ground2:'#242a34',floor:'#303740',floor2:'#2b323c',edge:'#50616e',wall:'#1c2431',wallTop:'#526174',path:'#333d48',water:'#183446',light:'#e9a9ce',accent:'#82d5d2'});
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const T=24;

export function createNeonCity(location,seed,{makeMap,rect,line,room,point,entity,personEntity,prop,label,addArchive,addLocalWork,TILE}) {
  const m=makeMap(140,104,'neon',location.name||'Glimmer',location.id,seed,'planet');
  Object.assign(m,{authoredCity:true,neonTheme:true,atmosphere:'city-rain',palette:{...NEON_PALETTE},placeTypeId:'ecumenopolis',placeTypeName:'City world',sizeClass:'super-earth',terrain:'city',regionScale:1.3,layoutVersion:'place-1:ecumenopolis:140x104:glimmer-1',settlementId:'glimmer-six-districts',settlementName:'Glimmer · six districts',settlementDescription:'A continuous city region with public streets linking the quays, night market, independent clinic, corporate towers, utility channels and salvage yards.'});
  rect(m,0,0,m.cols,m.rows,TILE.GROUND);
  rect(m,0,0,m.cols,1,TILE.WALL);rect(m,0,m.rows-1,m.cols,1,TILE.WALL);rect(m,0,0,1,m.rows,TILE.WALL);rect(m,m.cols-1,0,1,m.rows,TILE.WALL);
  // A narrow runoff canal and a coastal freight basin make the city readable
  // from its local chart. Four broad crossings leave every district connected.
  rect(m,49,2,5,100,TILE.WATER);rect(m,132,2,6,100,TILE.WATER);
  for(const y of[18,43,64,81])rect(m,46,y,12,5,TILE.METAL);
  rect(m,56,2,10,100,TILE.PATH);rect(m,4,38,128,7,TILE.PATH);rect(m,4,71,128,6,TILE.PATH);
  rect(m,40,3,6,98,TILE.PATH);rect(m,70,3,5,98,TILE.PATH);rect(m,127,4,5,96,TILE.PATH);
  for(const y of[18,56,83])rect(m,5,y,127,4,TILE.PATH);
  for(let y=5;y<101;y+=6)prop(m,'city-lane',60,y,.18,2,'#8999a5');
  for(let x=8;x<130;x+=8){prop(m,'city-lane',x,41,3,.16,'#9aadb5');prop(m,'city-lane',x,74,3,.16,'#9aadb5');}
  // Dock Nine: the established public landing stays at the southwest edge.
  rect(m,7,78,30,18,TILE.METAL);rect(m,13,80,15,12,TILE.PAD);
  m.spawn=point(26,88);m.exit=point(22,88);
  entity(m,'exit','exit','Dock Nine shuttle','Return to ship',22,88,'#edbe78',{},'The shuttle takes you back to your ship above Glimmer.');
  prop(m,'shuttle',14,80,9,5,'#829caa');
  label(m,'DOCK NINE',10,96,'#e6bc7b');prop(m,'neon-sign',27,78,7,1,'#e9b861',false,{text:'ARRIVALS'});
  entity(m,'jobs','jobboard','Dock Nine work board','Jobs & local work',33,87,'#e9b861');
  personEntity(m,location,'dock-chief','npc','dockworker',30,92,'#b3a07f',{name:'Ivo Quill',text:'Welcome to Glimmer. Your ship is above us, not under the cranes. Low Orbit is north along the quay, in Lantern Row. The job board pays whether you win at cards or not.',rumors:['Crown Exchange handles the city’s passengers and freight.','Kilowatt makes our power cells. Reservoir cleans our water. Neither gets the money the towers do.'],data:{fixedPost:true}});
  personEntity(m,location,'mechanic','mechanic','mechanic',12,74,'#c8a076',{name:'Nell Mercer',text:'Hull repairs, drives, the ordinary things that get you home. Rustline is east if you want to see where our spare parts come from.'});
  prop(m,'workbench',8,70,8,2,'#778d91',true);prop(m,'cargo',30,80,4,3,'#7d6f58',true);
  addLocalWork(m,{crate:[9,87],delivery:[35,93],repairs:[[80,62],[119,54],[95,93]]});

  // Lantern Row: open-front shops lead to one roofless, playable gaming room.
  room(m,7,46,31,19,21);rect(m,21,63,5,3,TILE.FLOOR);rect(m,12,60,19,2,TILE.FLOOR);
  rect(m,9,48,27,14,TILE.FLOOR);prop(m,'bar',9,48,7,1,'#94646e',true);
  prop(m,'neon-sign',9,45,27,1.2,'#ea82bd',false,{text:'LOW ORBIT / GAMES · FOOD · COMPANY'});
  prop(m,'neon-sign',11,35,25,1,'#eac77f',false,{text:'LANTERN ROW'});
  prop(m,'city-rug',19,49,5,5,'#6b506b');prop(m,'city-rug',26,49,7,5,'#34605c');prop(m,'city-rug',26,56,7,5,'#62516e');
  prop(m,'bench',10,56,4,1,'#84657d',true);prop(m,'table',10,54,4,1,'#8b6a74',true);prop(m,'cards',10,54,3,1,'#d7c5a5');
  prop(m,'bench',10,61,4,1,'#84657d',true);prop(m,'table',18,61,5,1,'#796c77',true);
  prop(m,'city-jukebox',34,60,2,2,'#d3a0d6',true);prop(m,'city-aquarium',19,47,5,1,'#8bc0d0',true);
  prop(m,'city-walllight',8,50,.2,9,'#d497bf');prop(m,'city-walllight',35,48,.2,9,'#82c9c4');
  prop(m,'city-walllight',15,62,4,.15,'#ce8cb7');prop(m,'city-walllight',26,62,7,.15,'#8fcbbf');
  personEntity(m,location,'house-keeper','npc','bartender',12,51,'#dc9dba',{name:'Mika Dell',text:'Three tables, three different ways to spend an evening. Read the rules, set a stake you can afford and leave whenever you like. We settle in ship credits.',rumors:['Juno is at the back of the room if you need paid work.','The Undergrid is east of the canal. The people there know when the lights will fail.'],data:{fixedPost:true}});
  for(const[x,y,color]of[[9,29,'#d79367'],[20,29,'#a48fb9'],[31,29,'#84b4ae']]){prop(m,'market-stall',x,y,7,4,color,true);prop(m,'neon-sign',x,y-1,7,.7,color,false,{text:x===9?'NOODLES':x===20?'SECOND HAND':'NIGHT GOODS'});}
  personEntity(m,location,'vendor','npc','merchant',32,35,'#a8bb9d',{name:'Rei Morrow',text:'Everything on this stall has already survived one owner. That is a better guarantee than most advertisements.'});
  personEntity(m,location,'player-offwatch','npc','pilot',16,54,'#91b8c1',{name:'Dara Pell',text:'One more hand, then the late shuttle. I have been saying that for half an hour.',data:{fixedPost:true}});
  personEntity(m,location,'pool-regular','npc','engineer',33,55,'#b5a278',{name:'Oren Flint',text:'Aim, then choose the strength. The cushion is more reliable than most people I know.',data:{fixedPost:true}});
  label(m,'KEEP GOING / CHROME WARD ↑',11,26,'#7fc5c4');

  // Chrome Ward: the hospital is an ordinary walk-in room, not a faceless shop.
  room(m,7,5,37,20,26);rect(m,26,23,5,3,TILE.FLOOR);
  prop(m,'neon-sign',9,5,31,1,'#70d9cc',false,{text:'CHROME WARD / WALK IN'});
  personEntity(m,location,'medic','medic','medic',35,12,'#8bd0c0',{name:'Nila Renn',text:'Take a number if you can stand. If you cannot, take a bed. Asa handles implants; I handle the part of you that still bruises.',data:{fixedPost:true}});
  for(const x of[10,15,33,38])prop(m,'bed',x,9,2,4,'#9cbab9',true);
  prop(m,'workbench',19,10,8,2,'#667f8e',true);prop(m,'equipment',29,8,2,3,'#86b8b4',true);
  prop(m,'city-walllight',8,7,.2,14,'#73c8bd');prop(m,'city-aquarium',18,7,10,1,'#84c4c7',true);
  prop(m,'bench',10,21,5,1,'#758b8d',true);prop(m,'cabinet',31,8,1,4,'#798c96',true);
  prop(m,'clinic-sign',27,24,1,1,'#91d7c8');

  // The Glass Mile: clean geometry, white light and controlled entrances.
  const tower=(x,y,w,h,color)=>{rect(m,x,y,w,h,TILE.WALL);prop(m,'city-tower',x,y,w,h,color,false,{phase:hash(`${x}:${y}`)%9});};
  tower(78,5,15,13,'#7894ae');tower(103,5,21,17,'#8794ae');
  tower(108,27,16,9,'#6c819d');
  room(m,78,24,25,13,88);rect(m,88,35,5,3,TILE.FLOOR);
  prop(m,'neon-sign',78,23,25,1,'#a3bde6',false,{text:'ASTERION / UTILITIES'});
  prop(m,'console',81,26,8,2,'#6c8fa3',true);prop(m,'planter',97,26,3,2,'#7fa88d',true);
  prop(m,'bench',94,33,5,1,'#8795aa',true);prop(m,'city-rug',90,28,8,4,'#485f77');prop(m,'city-walllight',79,25,.2,9,'#a3c7ea');
  label(m,'THE GLASS MILE',80,20,'#b8c8de');prop(m,'city-billboard',68,9,6,6,'#93bcde',false,{text:'YOUR LIFE / UPGRADED'});
  personEntity(m,location,'tower-security','npc','warden',78,33,'#93a9c9',{name:'Officer Eda Kest',text:'Public lobby on the left. The office is open. If you came about the blackouts, you will want the person who signs the allocation orders.',data:{fixedPost:true}});
  personEntity(m,location,'tower-courier','npc','courier',121,39,'#c1c6a4',{name:'Sol Ane',text:'I carry envelopes between buildings whose networks already talk to each other. They want someone to blame when an answer arrives.'});

  // The Undergrid: a separate, narrow maintenance fabric under the rail deck.
  for(const[x,y,w,h]of[[79,48,14,7],[99,48,25,5],[80,65,14,4],[107,64,17,5]]){rect(m,x,y,w,h,TILE.WALL);prop(m,'city-roof',x,y,w,h,'#444157',false);}
  rect(m,76,57,50,5,TILE.GRATE);rect(m,96,45,5,26,TILE.GRATE);
  prop(m,'city-pipe',76,53,49,1,'#7a697f');prop(m,'city-pipe',101,46,1,22,'#6f777f');
  prop(m,'neon-sign',78,45,21,1,'#b89fce',false,{text:'UNDERGRID / MAINTENANCE'});
  for(const x of[82,90,110,119])prop(m,'city-vent',x,63,2,1,'#8b88a0');
  personEntity(m,location,'undergrid-resident','npc','engineer',86,59,'#aaa0b7',{name:'Sami Venn',text:'Do not let the towers tell you this place is abandoned. Every pipe you see serves an apartment. We live where the maintenance crew can still reach us.',rumors:['The load recorder is at the eastern junction.','Nobody in Chrome Ward asks whether your bones are company property.'],data:{fixedPost:true}});
  personEntity(m,location,'undergrid-courier','npc','courier',116,59,'#a7b09c',{name:'Kei Nar',text:'The rail line above is faster. The route down here does not ask for a subscriber number.'});

  // Rustline: open, uneven yards reuse broken hulls instead of a repeated plaza.
  rect(m,78,79,48,20,TILE.RUBBLE);rect(m,79,85,47,5,TILE.PATH);
  prop(m,'neon-sign',78,78,25,1,'#db9868',false,{text:'RUSTLINE / NOTHING WASTED'});
  for(const[x,y,w,h]of[[80,80,7,3],[94,80,8,3],[111,80,10,3],[82,94,8,4],[107,93,14,5]]){prop(m,'city-scrap',x,y,w,h,'#887568',true);}
  prop(m,'workbench',96,93,7,2,'#7c887d',true);prop(m,'city-vehicle',119,90,5,2,'#b98466',true);
  personEntity(m,location,'yard-foreman','npc','salvager',102,87,'#d4a779',{name:'Moss Calder',text:'The city sells you a newer version every season. We keep the version you already own working. Pull up a chair if your hands are steady.',rumors:['Kilowatt’s workers trade us good cells for repaired tools.','Juno runs honest tables. The company loan booth outside does not belong to Juno.'],data:{fixedPost:true}});
  addArchive(m,location,121,87,'Rustline community archive');

  // Small apartment blocks and advertising hardware make the districts meet.
  for(const[x,y,w,h]of[[8,68,7,3],[22,68,13,3],[8,98,29,3],[78,94,3,6],[7,2,36,2],[76,2,48,2]]){rect(m,x,y,w,h,TILE.WALL);prop(m,'city-roof',x,y,w,h,'#485768');}
  for(const[x,y,c]of[[44,12,'#78d6c8'],[44,36,'#e8a0c8'],[44,55,'#e8a0c8'],[44,88,'#e1bb86'],[68,34,'#a5c8ef'],[68,65,'#be9fe1'],[125,74,'#dca06d']])prop(m,'city-lamp',x,y,1,2,c);
  for(const[x,y,c]of[[36,41,'#d995b9'],[48,79,'#9eb5cc'],[76,73,'#d2aa83'],[118,41,'#91b2be']])prop(m,'city-vehicle',x,y,5,2,c,true);
  for(const[x,y,color]of[[42,66,'#b5a18c'],[57,87,'#a293ae'],[68,51,'#93b7bd'],[75,36,'#9cabc2'],[41,31,'#b29b85'],[67,20,'#a3bd9f']])personEntity(m,location,`street-${x}-${y}`,'npc',y>60?'dockworker':'courier',x,y,color,{text:y>60?'The last freight shift is changing over. There is still food on Lantern Row if you missed supper.':'The public path crosses the canal at the marked bridges. The towers have their own lifts; we use our feet.'});
  for(let i=0;i<48;i++){const x=6+(i*37)%121,y=5+(i*19)%94;if([TILE.PATH,TILE.GROUND,TILE.METAL,TILE.GRATE].includes(m.tiles[y]?.[x]))prop(m,'neon-puddle',x,y,2+(i%2),.35,i%3?'#6f899c':'#a36b93');}
  for(const district of NEON_DISTRICTS){m.districts||=[];m.districts.push({...district,...point(district.x,district.y)});}
  m.serviceAnchors={passage:point(35,83),faction:point(84,34),public:point(38,18),contacts:point(20,57)};
  m.terrainStats={terrain:'city',waterTiles:m.tiles.flat().filter(tile=>tile===TILE.WATER).length,terrainTiles:m.tiles.flat().filter(tile=>tile===TILE.RUBBLE||tile===TILE.METAL).length,features:m.decor.length,regionTiles:m.cols*m.rows};
  return m;
}

/** Select existing clear floor; adding a table never relocates old NPCs or doors. */
export function addPublicGambling(m,location,{reachableTiles,entity,label}) {
  const city=isNeonCity(location),station=m.kind==='station';
  if(!city&&(!station||location.portType==='military'||m.noPortServices))return;
  const crown=location.id==='voltage-crown',home=city?'Low Orbit':crown?'After Shift':location.id==='kettle'?'The Long Way':'Common room';
  const games=city||crown||location.id==='kettle'?['poker','pool','blackjack']:[['poker','pool','blackjack'][hash(location.id)%3]];
  const target=city?{x:26,y:52}:m.entities.find(e=>e.role==='bartender')||m.spawn;
  const center=city?target:{x:target.x/T-.5,y:target.y/T-.5+3};
  const reachable=reachableTiles(m);
  const citySpots={poker:[21,51],pool:[29,51],blackjack:[29,58]};
  for(let i=0;i<games.length;i++){
    const gameId=games[i],desired=city?citySpots[gameId]:[center.x+(i%2)*4-2,center.y+Math.floor(i/2)*4];
    let best=null,score=Infinity;
    for(const n of reachable){const x=n%m.cols,y=Math.floor(n/m.cols),px=(x+.5)*T,py=(y+.5)*T,d=(x-desired[0])**2+(y-desired[1])**2;
      if(d>=score||m.entities.some(e=>Math.hypot(px-e.x,py-e.y)<58)||Math.hypot(px-m.spawn.x,py-m.spawn.y)<45)continue;
      best={x,y};score=d;
    }
    if(!best)continue;
    const table=entity(m,'table:'+gameId,'gambling',`${home} · ${gameId==='blackjack'?'Blackjack':gameId==='pool'?'Pool':'Poker'}`,'Play a table game',best.x,best.y,gameId==='pool'?'#80c3b7':gameId==='poker'?'#e0b68b':'#c8a8da',{gameId,venueId:city?'glimmer-night-market':crown?'voltage-after-shift':`${location.id}-common-room`,venueName:home,stakes:[10,20,50,100],homeLocationId:location.id,systemId:location.systemId,tableLabel:gameId==='pool'?'Eight-ball table':gameId==='poker'?'Poker table':'Blackjack table'},'Choose a stake and read the table rules before playing. Winnings and losses use your ordinary Farwake credits.');
    if(!city)label(m,gameId==='blackjack'?'BLACKJACK':gameId==='pool'?'POOL':'POKER',best.x-1,best.y-1.6,table.color);
  }
}

export function drawGamblingTable(ctx,e,near=false) {
  const x=Math.round(e.x),y=Math.round(e.y),pool=e.data?.gameId==='pool',blackjack=e.data?.gameId==='blackjack',w=pool?56:46,h=pool?32:27;
  pixelRect(ctx,'#0b1722',x-w/2-3,y-h+4,w+6,h+5);pixelRect(ctx,'#775b52',x-w/2,y-h,w,h);pixelRect(ctx,near?'#b79b73':'#9a7e65',x-w/2,y-h,w,3);
  pixelRect(ctx,pool?'#286d67':blackjack?'#42624e':'#4b435f',x-w/2+4,y-h+4,w-8,h-8);
  if(pool){for(const dx of[-23,0,23])for(const dy of[-27,-6])pixelRect(ctx,'#071b23',x+dx-2,y+dy,4,4);pixelRect(ctx,'#efe9ca',x-13,y-19,3,3);pixelRect(ctx,'#d7b965',x+13,y-14,3,3);pixelRect(ctx,'#c37679',x+8,y-19,3,3);pixelRect(ctx,'#a0c3dd',x+15,y-21,3,3);pixelLine(ctx,x-31,y-8,x-12,y-15,'#cbb99a');}
  else{for(let i=0;i<3;i++){pixelRect(ctx,'#e3dfc6',x-14+i*10,y-21,7,10);pixelRect(ctx,i%2?'#6e515b':'#315d60',x-12+i*10,y-18,2,3);}pixelRect(ctx,'#a888bf',x+13,y-10,5,3);pixelRect(ctx,'#e4b27e',x+13,y-14,5,3);}
}

/** Each effect uses only integer rectangles/lines and a fixed draw budget. */
export function drawNeonProp(ctx,d,m,time,emit) {
  const {x,y,w,h}=d,c=d.color||'#a1b4c4';
  if(d.kind==='city-lane'){pixelRect(ctx,c,x,y,w,h);return true;}
  if(d.kind==='city-rug'){pixelRect(ctx,c,x,y,w,h);pixelRect(ctx,'#7c7e8c',x+3,y+3,w-6,1);pixelRect(ctx,'#7c7e8c',x+3,y+h-4,w-6,1);return true;}
  if(d.kind==='city-walllight'){pixelRect(ctx,c,x,y,Math.max(w,3),Math.max(h,3));ctx.globalAlpha=.10;pixelRect(ctx,c,x-7,y-4,w+14,h+8);ctx.globalAlpha=1;return true;}
  if(d.kind==='city-aquarium'){pixelRect(ctx,'#223745',x,y,w,h);pixelRect(ctx,'#467a88',x+3,y+2,w-6,h-5);pixelRect(ctx,c,x+3,y+2,w-6,2);for(let xx=9;xx<w-8;xx+=19){pixelRect(ctx,'#b8c9af',x+xx,y+7,5,2);pixelRect(ctx,'#487578',x+xx+7,y+h-10,2,7);}return true;}
  if(d.kind==='city-jukebox'){pixelRect(ctx,'#1c2535',x,y-12,w,h+12);pixelRect(ctx,c,x+3,y-11,w-6,4);pixelRect(ctx,'#34354f',x+4,y-5,w-8,h);pixelRect(ctx,'#87b5c3',x+8,y+1,w-16,9);for(let yy=16;yy<h-4;yy+=5)pixelRect(ctx,'#9986aa',x+8,y+yy,w-16,1);return true;}
  if(d.kind==='neon-puddle'){ctx.globalAlpha=.20;pixelRect(ctx,c,x,y,w,h);pixelRect(ctx,c,x+7,y+h+3,Math.max(1,w-13),2);ctx.globalAlpha=1;return true;}
  if(d.kind==='neon-sign'){pixelRect(ctx,'#111a27',x-3,y-5,w+6,h+7);pixelRect(ctx,c,x,y-4,w,2);pixelRect(ctx,c,x,y+h,w,1);emit?.(d.text,x+w/2,y+h*.5,c,14,'center',49,'district');return true;}
  if(d.kind==='city-lamp'){pixelRect(ctx,'#202b37',x+7,y-12,5,h+15);pixelRect(ctx,'#59717e',x+8,y-12,2,h+12);pixelRect(ctx,c,x-5,y-15,28,4);ctx.globalAlpha=.08;pixelRect(ctx,c,x-17,y-7,52,55);ctx.globalAlpha=1;return true;}
  if(d.kind==='city-tower'||d.kind==='city-roof'){
    const tower=d.kind==='city-tower',rise=tower?29:9;
    pixelRect(ctx,'#121b28',x+8,y+10,w,h+7);pixelRect(ctx,'#273246',x,y-rise,w,h+rise);pixelRect(ctx,c,x+2,y-rise,w-4,4);
    pixelRect(ctx,tower?'#354254':'#3b4555',x+4,y-rise+7,w-8,h-8);
    for(let xx=9;xx<w-9;xx+=18)for(let yy=14;yy<h+rise-6;yy+=16){const lit=(Math.floor(xx/18)+Math.floor(yy/16)+(d.phase||0))%4!==0;pixelRect(ctx,lit?(tower?'#89b9c3':'#7a8198'):'#273340',x+xx,y-rise+yy,7,4);}
    if(tower){pixelRect(ctx,'#182737',x+w-18,y-rise+9,8,h+rise-12);pixelRect(ctx,'#9bb8e0',x+w-15,y-rise+13,2,h+rise-22);pixelRect(ctx,'#566b7c',x+13,y-rise-8,w*.36,9);pixelRect(ctx,'#87a5b8',x+18,y-rise-8,w*.25,2);}return true;
  }
  if(d.kind==='city-pipe'){pixelRect(ctx,'#1d2833',x+3,y+5,w,h);pixelRect(ctx,c,x,y,w,h);pixelRect(ctx,'#a8a4a3',x+2,y,w-4,2);if(w>h)for(let xx=6;xx<w;xx+=29)pixelRect(ctx,'#393f50',x+xx,y,3,h);else for(let yy=6;yy<h;yy+=29)pixelRect(ctx,'#393f50',x,y+yy,w,3);return true;}
  if(d.kind==='city-vent'){pixelRect(ctx,'#3f4858',x,y,w,h);for(let yy=3;yy<h;yy+=5)pixelRect(ctx,c,x+3,y+yy,w-6,1);return true;}
  if(d.kind==='city-vehicle'){pixelRect(ctx,'#101e2a',x-3,y+7,w+6,h);pixelRect(ctx,'#2e3949',x,y,w,h);pixelRect(ctx,c,x+3,y-2,w-6,h-3);pixelRect(ctx,'#77a6bd',x+w*.3,y+3,w*.4,h-11);for(const xx of[x+5,x+w-9]){pixelRect(ctx,'#19232d',xx,y-3,6,4);pixelRect(ctx,'#19232d',xx,y+h-5,6,5);}pixelRect(ctx,'#e3d9ab',x+w-6,y+3,3,6);pixelRect(ctx,'#c7747c',x+2,y+3,3,6);return true;}
  if(d.kind==='city-billboard'){pixelRect(ctx,'#3a485d',x+w*.4,y,5,h);pixelRect(ctx,'#344157',x+w*.6,y,5,h);pixelRect(ctx,'#151e32',x,y-22,w,h*.6);pixelRect(ctx,c,x+4,y-18,w-8,2);pixelRect(ctx,'#2b3257',x+5,y-12,w-10,h*.5-8);emit?.(d.text,x+w/2,y+h*.17,c,12,'center',47,'district');return true;}
  if(d.kind==='city-scrap'){pixelRect(ctx,'#352c32',x,y+8,w,h);pixelRect(ctx,c,x+3,y,w-8,h-5);pixelRect(ctx,'#5e575e',x+8,y+7,w-20,h*.4);pixelRect(ctx,'#b39a7d',x+12,y+4,w*.4,2);for(let xx=4;xx<w-8;xx+=24)pixelRect(ctx,'#484450',x+xx,y+6,6,h-10);return true;}
  return false;
}

/** Wet asphalt and quiet interior flooring replace the generic factory tiles. */
export function drawNeonTile(ctx,m,x,y,time=0) {
  if(!m.authoredCity)return false;
  const tile=m.tiles[y]?.[x],wx=x*T,wy=y*T,n=(Math.imul(x+17,73856093)^Math.imul(y+37,19349663)^m.seed)>>>0;
  if(tile===2){pixelRect(ctx,'#1d2635',wx,wy,T,T);pixelRect(ctx,'#556477',wx,wy,T,4);pixelRect(ctx,'#293747',wx,wy+20,T,4);if(x%3===0)pixelRect(ctx,'#748d9a',wx+7,wy+7,10,2);return true;}
  if(tile===5){pixelRect(ctx,'#122c3b',wx,wy,T,T);const yy=5+(n%13);pixelRect(ctx,(x+y)%4?'#284b60':'#396175',wx+3,wy+yy,13,1);if((n%7)===0)pixelRect(ctx,'#537384',wx+7,wy+yy+5,10,1);return true;}
  if(tile===1){pixelRect(ctx,(Math.floor(x/2)+Math.floor(y/2))%2?'#2a303c':'#2e3541',wx,wy,T,T);if(x%2===0)pixelRect(ctx,'#242a35',wx,wy,1,T);if(y%2===0)pixelRect(ctx,'#242a35',wx,wy,T,1);return true;}
  if(tile===9){pixelRect(ctx,'#293140',wx,wy,T,T);for(let yy=4;yy<T;yy+=6)pixelRect(ctx,'#4b4e64',wx+2,wy+yy,T-4,1);return true;}
  if(tile===8){pixelRect(ctx,'#493e3b',wx,wy,T,T);if(n%3===0)pixelRect(ctx,'#786356',wx+n%14,wy+7,5,2);return true;}
  if(tile===7||tile===6){pixelRect(ctx,tile===6?'#414650':'#394654',wx,wy,T,T);if(x%3===0)pixelRect(ctx,'#64717d',wx,wy,1,T);if(y%3===0)pixelRect(ctx,'#64717d',wx,wy,T,1);if(tile===6&&y%5===0)pixelRect(ctx,'#c3aa78',wx+3,wy+3,T-6,2);return true;}
  pixelRect(ctx,tile===3?(n%4===0?'#303944':'#2c3540'):(n%5===0?'#272e39':'#252c36'),wx,wy,T,T);
  if(n%9===0){ctx.globalAlpha=.20;pixelRect(ctx,'#697a91',wx+3,wy+14,16,1);pixelRect(ctx,'#697a91',wx+7,wy+17,11,1);ctx.globalAlpha=1;}
  if(tile!==3&&x%8===0)pixelRect(ctx,'#303946',wx,wy,1,T);
  return true;
}

export function drawNeonRain(ctx,surface,{cameraX,cameraY,width,height,time=0,reduceMotion=false}) {
  if(surface.atmosphere!=='city-rain')return;
  // The viewport, not map area, bounds weather cost. Reduced motion keeps wet
  // street reflections while omitting moving rain and the passing rail light.
  if(reduceMotion)return;
  const phase=(surface.seed%997)/997;
  ctx.globalAlpha=.22;
  for(let i=0;i<54;i++){
    const x=cameraX+((i*73.17+phase*width-time*27)%width+width)%width;
    const y=cameraY+((i*41.71+phase*height+time*(95+(i%4)*11))%height+height)%height;
    if(surface.tiles[Math.floor(y/T)]?.[Math.floor(x/T)]===1)continue;
    pixelLine(ctx,x,y,x-3,y+8,i%4?'#8fa7be':'#c9b9db');
  }
  ctx.globalAlpha=1;
}
