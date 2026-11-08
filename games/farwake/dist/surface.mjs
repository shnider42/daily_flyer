/**
 * Farwake person mode. All positions and width/height are WORLD PIXELS.
 * cols/rows are tile counts; one tile is 24 pixels. Person x/y is their feet.
 * generateSurface(location, seed, flags) is deterministic and JSON serializable.
 * movePerson mutates and returns person. dt is seconds, input is a -1..1 vector.
 * drawSurface draws only the world and returns {cameraX,cameraY,width,height}.
 */
import {DIALOGUE,NAMED_SYSTEMS,LORE} from './content.mjs';

export const TILE = Object.freeze({VOID:0,FLOOR:1,WALL:2,PATH:3,GROUND:4,WATER:5,PAD:6,METAL:7,RUBBLE:8,GRATE:9});
const T=24;
const BLOCKED=new Set([TILE.VOID,TILE.WALL,TILE.WATER]);
const PALETTES={
 station:{ground:'#172c35',floor:'#203c43',floor2:'#1c353e',edge:'#375059',wall:'#1a2c35',wallTop:'#577079',path:'#304952',light:'#edc584',accent:'#69b3ad'},
 verdant:{ground:'#244439',ground2:'#294b3c',floor:'#4e5651',floor2:'#48504b',edge:'#879080',wall:'#384b47',wallTop:'#7d9688',path:'#6b6250',water:'#173f50',light:'#f6d59a',accent:'#a0c56d'},
 temperate:{ground:'#244439',ground2:'#294b3c',floor:'#4e5651',floor2:'#48504b',edge:'#879080',wall:'#384b47',wallTop:'#7d9688',path:'#6b6250',water:'#173f50',light:'#f6d59a',accent:'#a0c56d'},
 arid:{ground:'#755842',ground2:'#7e6147',floor:'#756856',floor2:'#6a5e4e',edge:'#ab9476',wall:'#5f4d42',wallTop:'#b29875',path:'#967853',water:'#294c58',light:'#f2d494',accent:'#e2ba74'},
 desert:{ground:'#755842',ground2:'#7e6147',floor:'#756856',floor2:'#6a5e4e',edge:'#ab9476',wall:'#5f4d42',wallTop:'#b29875',path:'#967853',water:'#294c58',light:'#f2d494',accent:'#e2ba74'},
 ice:{ground:'#526e79',ground2:'#5c7c86',floor:'#425c65',floor2:'#3c545f',edge:'#84a6aa',wall:'#314c5b',wallTop:'#9bbdc4',path:'#6d8d94',water:'#254a5e',light:'#def5e5',accent:'#96d7da'},
 frozen:{ground:'#526e79',ground2:'#5c7c86',floor:'#425c65',floor2:'#3c545f',edge:'#84a6aa',wall:'#314c5b',wallTop:'#9bbdc4',path:'#6d8d94',water:'#254a5e',light:'#def5e5',accent:'#96d7da'},
 volcanic:{ground:'#3f3d43',ground2:'#484047',floor:'#4e4549',floor2:'#453c44',edge:'#897379',wall:'#322d38',wallTop:'#8a6a68',path:'#655154',water:'#a65034',light:'#efb480',accent:'#e38761'},
 ash:{ground:'#3f3d43',ground2:'#484047',floor:'#4e4549',floor2:'#453c44',edge:'#897379',wall:'#322d38',wallTop:'#8a6a68',path:'#655154',water:'#a65034',light:'#efb480',accent:'#e38761'},
 ocean:{ground:'#3b5a4e',ground2:'#456453',floor:'#54625e',floor2:'#4a5856',edge:'#8ba195',wall:'#38554f',wallTop:'#86a999',path:'#8a8065',water:'#20546a',light:'#e2dca2',accent:'#80c1b5'},
 derelict:{ground:'#15252f',floor:'#26353d',floor2:'#21303a',edge:'#44565d',wall:'#18212d',wallTop:'#51616a',path:'#38424a',light:'#e58a6c',accent:'#ae7b69'},
 ship:{ground:'#152a35',floor:'#26414b',floor2:'#213a45',edge:'#42636b',wall:'#182d39',wallTop:'#5f7d86',path:'#344c58',light:'#edd0a1',accent:'#75bdc6'}
};
function hash(input){let h=2166136261;for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){let a=hash(seed);return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function noise(x,y,seed=0){let n=Math.imul(x+31,374761393)^Math.imul(y+71,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const AUTHORED_BODIES=new Map(NAMED_SYSTEMS.flatMap(system=>system.bodies.map(body=>[body.id,{body,system}])));
const LORE_BY_ID=new Map(LORE.map(entry=>[entry.id,entry]));
const BODY_LORE={kettle:'kettle_history',morrow:'union_charter',tinbell:'open_frequency',orchard:'union_charter',weighhouse:'union_charter',serein:'meridian_patent',ledger:'meridian_patent',cairn:'lanes',lilt:'severance',listening:'living_registry',ward:'quiet_earth',bastion:'quiet_earth',kiln:'cinder_debt',patchwork:'cinder_debt',palimpsest:'silent_engine',blindpost:'silent_engine',tallow:'meridian_patent',checkpoint:'open_frequency',newshore:'union_charter',porch:'lanes',stillwater:'seedvault',census:'living_registry',earth:'air_pact',luna:'return_ethic',threshold:'return_ethic',wide:'open_frequency',door:'open_frequency'};
const FACTION_LORE={freewake:'union_charter',meridian:'meridian_patent',lantern:'open_frequency',concord:'quiet_earth',cinder:'cinder_debt'};
const COMMON_ROOMS={kettle:'The Long Way',weighhouse:'Common Kitchen',ledger:'The Countersign',listening:'Listening Room',bastion:'Off Watch',patchwork:'Red Cloth',blindpost:'The Night Window',checkpoint:'Crossing House',porch:'Homeward Mess',census:'Registry Canteen',threshold:'The Last Gate',door:'The Outer Room'};
const GIVEN_NAMES=['Ari','Nemi','Evin','Keir','Lio','Tala','Bren','Siv','Mina','Kori','Reva','Tess','Oren','Veda','Rafi','Enna','Darin','Sela','Kade','Yara','Aven','Miko','Nessa','Tarin','Suri','Hale','Iris','Orla','Jorin','Noa','Lena','Cai'];
const FAMILY_NAMES=['Voss','Ames','Kest','Raye','Pell','Sorn','Ives','Marr','Tal','Venn','Daro','Vale','Bex','Mott','Wynn','Renn','Holt','Oran','Dane','Vela','Reed','Dusk','Aster','Neri','Shaw','Lark','Rill','Cale','Vey','Esker','Arden','Thorne'];
const ROLE_LABELS={bartender:'Common-room keeper',scientist:'Field researcher',courier:'Local courier',survivor:'Shipwreck survivor',settler:'Settlement representative'};

// The caller can pass just a body ID. Authored context is resolved here instead
// of requiring every docking / save-load caller to rebuild its own lore data.
function resolveLocation(value={}){
 const source=typeof value==='string'?{id:value}:value||{},authored=AUTHORED_BODIES.get(source.id);
 const system=authored?.system||NAMED_SYSTEMS.find(s=>s.id===source.systemId),location={...authored?.body,...source};
 location.kind=source.kind||source.type||authored?.body.kind||'planet';
 const kind=kindOf(location);
 location.id=source.id||(source.name?`place-${hash(source.name).toString(36)}`:({station:'station',ship:'own-ship',derelict:'derelict',planet:'world'}[kind]));
 location.name=source.name||authored?.body.name||({station:'Uncharted station',ship:'Your ship · interior',derelict:'Silent freighter',planet:'Uncharted settlement'}[kind]);
 location.systemId=source.systemId||system?.id||null;
 location.systemName=source.systemName||system?.name||source.systemId||'Uncharted Reach';
 location.faction=source.faction||system?.faction||null;
 location.loreId=LORE_BY_ID.has(source.loreId)?source.loreId:LORE_BY_ID.has(location.lore)?location.lore:BODY_LORE[location.id]||FACTION_LORE[location.faction]||'open_frequency';
 location.localLore=source.localLore||(LORE_BY_ID.has(location.lore)?'':location.lore)||`${location.name||'This landing'} keeps a local record of the ships, workers, and families who pass through.`;
 return location;
}
function localName(location,slot){const h=hash(`${location.id||location.name||'frontier'}:${slot}`);return`${GIVEN_NAMES[h%GIVEN_NAMES.length]} ${FAMILY_NAMES[(h>>>8)%FAMILY_NAMES.length]}`;}
function resident(location,role,slot=role,override={}){
 const dialogueRole=override.dialogueRole||({bartender:'merchant',scientist:'engineer',courier:'pilot',settler:'governor',survivor:'refugee'}[role]||role),authored=DIALOGUE[dialogueRole];
 const home=location.name||'this port',room=COMMON_ROOMS[location.id]||'the common room';
 const greetings={
  mechanic:`I keep the ships passing through ${home} in one piece. Show me what your hull needs.`,
  medic:`Welcome to the clinic at ${home}. Set your pack down; we can make time for one more patient.`,
  bartender:`You have found ${room}. Sit a while. Ships bring news to ${home} before the networks do.`,
  merchant:`I trade along the ${location.systemName} routes. A fair cargo and a safe return suit me better than a fortune I cannot spend.`,
  dockworker:`The freight here keeps ${home} breathing. Take a shift from the exchange and I will show you where the crates go.`,
  governor:`People came to ${home} to build a life. Every repair and delivery helps us keep it.`,
  archivist:`We keep the records of ${home}: arrivals, departures, and the messages still waiting for an answer.`,
  scientist:`The survey cooperative at ${home} needs three tagged samples from beyond the settlement. Look for the marked field circuit.`,
  courier:`I run messages and light freight around ${home}. It pays for my next departure, whenever I decide where that is.`,
  warden:`Welcome to ${home}. Keep the landing lane clear. If you have news from a stranded ship, bring it to us.`,
  broker:`The contracts here cross several borders. Read the destination, and decide whose promises you are willing to carry.`,
  salvager:`Every patched hull here has a previous owner and a story. Ask about both before taking anything apart.`,
  survivor:`I heard your docking clamp. I had begun to think ${home} would keep drifting forever.`
 };
 const greeting=override.text||greetings[role]||authored?.greeting||`There is always another story arriving at ${home}.`;
 const rumors=override.rumors||[location.localLore,...(authored?.rumors||[]).filter(s=>!(/The Kettle|The Vesper|Farwake has/.test(s)))].filter(Boolean).slice(0,3);
 return{name:override.name||localName(location,slot),role,text:greeting,data:{dialogueRole,roleLabel:override.roleLabel||ROLE_LABELS[role]||authored?.role||role,homeLocationId:location.id,home:home,systemId:location.systemId,systemName:location.systemName,faction:override.faction||location.faction,greeting,rumors,...override.data}};
}
function personEntity(m,location,id,type,role,x,y,color,override={}){
 const r=resident(location,role,id,override);return entity(m,id,type,r.name,r.role,x,y,color,r.data,r.text);
}
function storyResident(location){
 if(location.id==='kettle')return{role:'dockworker',name:DIALOGUE.dockworker.name,roleLabel:'Dock foreman',text:'Iona is in the shipwright’s bay. A local shift will pay for the parts she needs. Kettle remembers the people who keep its air running.',rumors:DIALOGUE.dockworker.rumors,data:{storyKey:'first_shift'}};
 if(location.id==='listening')return{role:'archivist',name:DIALOGUE.archivist.name,roleLabel:DIALOGUE.archivist.role,text:`${DIALOGUE.archivist.greeting} Our array at Listening House is missing a stable relay. Help me restore it, and we can read what your census fragment is trying to tell us.`,rumors:DIALOGUE.archivist.rumors,data:{storyKey:'listening_house'}};
 if(location.id==='ledger')return{role:'governor',name:'Liaison Evin Raye',roleLabel:'Charter council liaison',text:'Continuity asks for jurisdiction. Meridian asks for the routes. Freewake asks for the evidence to be public. Ledger Ring can record an alliance, but you will be the one living with its promises.',rumors:['An alliance is a name that reaches the next port before your ship.','The original lane patent is still in this archive. Read it before deciding who owns a route.'],data:{storyKey:'three_claims',representative:true}};
 if(location.id==='stillwater')return{role:'archivist',name:'Custodian Nemi Ives',roleLabel:'Vault records custodian',text:'The vault kept its climate records through every silent year. The irrigation messages are still addressed to Earth. If you have come to carry those records home, we should talk.',rumors:['These seeds were chosen for farmers who might never see the weather their grandparents knew.','The climate record includes a safe approach to Sol. The people there deserve to choose who follows it.'],data:{storyKey:'witness_vault',loreId:'seedvault'}};
 if(location.id==='earth')return{role:'governor',name:DIALOGUE.governor.name,roleLabel:'Earth council representative',text:'Welcome to Earth. We kept the landing light for people, not for claims. Our council is ready to discuss reopening contact. Tell us what kind of relationship you came to build.',rumors:DIALOGUE.governor.rumors,data:{storyKey:'open_sky',representative:true}};
 const role=location.kind==='station'?({concord:'warden',freewake:'dockworker',meridian:'broker',lantern:'archivist',cinder:'salvager'}[location.faction]||'archivist'):location.biome==='ruin'?'archivist':'governor';
 return{role};
}
function addStoryResident(m,location,x,y,color){const story=storyResident(location);return personEntity(m,location,'story','npc',story.role,x,y,color,{...story,data:{...story.data,story:true}});}
function addArchive(m,location,x,y,name='Local archive'){
 const lore=LORE_BY_ID.get(location.loreId),local=location.localLore;
 return entity(m,'lore','terminal',name,'Read local history',x,y,'#83adb6',{loreId:location.loreId,localLore:local,loreTitle:lore?.title,homeLocationId:location.id},[local,lore?.text].filter(Boolean).join('\n\n'));
}
function normalizeBiome(value){const b=String(value||'verdant').toLowerCase();if(/ice|froz|snow|glaci/.test(b))return'ice';if(/volcan|lava|ash|cinder/.test(b))return'volcanic';if(/arid|desert|dune|barren|rock|dust/.test(b))return'arid';if(/ocean|water|coast|trop/.test(b))return'ocean';return'verdant';}
function kindOf(location){const kind=String(location.kind||location.type||'planet').toLowerCase();if(/derelict|wreck|abandon/.test(kind))return'derelict';if(/own_ship|ownship|interior|player_ship/.test(kind)||location.id==='own-ship'||kind==='ship')return'ship';if(/station|outpost|dock/.test(kind))return'station';return'planet';}
function makeMap(cols,rows,biome,name,id,seed,kind){return{width:cols*T,height:rows*T,pixelWidth:cols*T,pixelHeight:rows*T,cols,rows,tileSize:T,biome,name,id,kind,seed:hash(seed+':'+id),tiles:Array.from({length:rows},()=>Array(cols).fill(TILE.VOID)),solids:[],entities:[],decor:[],spawn:{x:0,y:0},exit:{x:0,y:0}};}
function rect(m,x,y,w,h,tile){for(let j=Math.max(0,y);j<Math.min(m.rows,y+h);j++)for(let i=Math.max(0,x);i<Math.min(m.cols,x+w);i++)m.tiles[j][i]=tile;}
function line(m,x1,y1,x2,y2,tile,width=1){let x=x1,y=y1;for(let guard=0;guard<512;guard++){rect(m,x,y,width,width,tile);if(x===x2&&y===y2)break;if(x!==x2)x+=Math.sign(x2-x);else y+=Math.sign(y2-y);}}
function room(m,x,y,w,h,doorX){rect(m,x,y,w,h,TILE.WALL);rect(m,x+1,y+1,w-2,h-2,TILE.FLOOR);rect(m,doorX,y+h-1,2,1,TILE.FLOOR);}
function point(x,y){return{x:(x+.5)*T,y:(y+.5)*T};}
function entity(m,id,type,name,role,x,y,color,data={},text=''){const p=point(x,y),e={id:m.id+':'+id,type,name,role,...p,color,text,data:{...data}};m.entities.push(e);return e;}
function prop(m,kind,x,y,w=1,h=1,color=null,solid=false,extra={}){const p={kind,x:x*T,y:y*T,w:w*T,h:h*T,color,...extra};m.decor.push(p);if(solid)m.solids.push({x:p.x+3,y:p.y+5,w:p.w-6,h:p.h-7});return p;}
function label(m,text,x,y,color='#7ca5a8'){prop(m,'label',x,y,1,1,color,false,{text});}
function addLocalWork(m,positions){
 entity(m,'cargo','crate','Freight crate','Cargo · pick up',positions.crate[0],positions.crate[1],'#d4b37b',{workType:'cargo',kind:'cargo',taskId:'cargo',flag:'cargo:'+m.id,carriedFlag:'carrying:'+m.id},'A sealed freight crate. Carry it to the striped loading pad.');
 entity(m,'delivery','delivery','Loading pad','Cargo · deliver',positions.delivery[0],positions.delivery[1],'#e2be7d',{workType:'delivery',kind:'cargo',taskId:'delivery',flag:'delivery:'+m.id,carriedFlag:'carrying:'+m.id},'The receiver scans each crate delivered to this pad.');
 positions.repairs.forEach(([x,y],i)=>entity(m,'repair-'+(i+1),'work','Relay '+(i+1),'Maintenance · repair',x,y,'#e9a66d',{workType:'repair',kind:'repair',index:i,taskId:'repair-'+(i+1),flag:'repair:'+m.id+':'+i},'The relay is stuttering. An on-site repair will restore this part of the local grid.'));
 positions.samples?.forEach(([x,y],i)=>entity(m,'sample-'+(i+1),'sample',m.biome==='ice'?'Ice-core sample':m.biome==='volcanic'?'Glass-spore sample':m.biome==='arid'?'Amber lichen sample':'Biological sample','Fieldwork · collect',x,y,'#a6d6ad',{workType:'sample',kind:'sample',index:i,taskId:'sample-'+(i+1),flag:'sample:'+m.id+':'+i},'The sample is tagged for the local survey cooperative.'));
}
function station(location,seed){
 const m=makeMap(38,30,'station',location.name||'Uncharted station',location.id||'station',seed,'station');
 const doorShift=location.id==='kettle'?0:hash(location.id||location.name)%3-1,doorXs=[7+doorShift,18-doorShift,28+doorShift];
 rect(m,2,2,34,26,TILE.WALL);rect(m,3,3,32,24,TILE.FLOOR);
 rect(m,3,9,32,1,TILE.WALL);rect(m,3,19,32,1,TILE.WALL);
 rect(m,13,3,1,6,TILE.WALL);rect(m,24,3,1,6,TILE.WALL);rect(m,13,20,1,7,TILE.WALL);rect(m,24,20,1,7,TILE.WALL);
 for(const x of doorXs){rect(m,x,9,2,1,TILE.FLOOR);rect(m,x,19,2,1,TILE.FLOOR);}
 rect(m,4,12,30,5,TILE.PATH);rect(m,17,10,4,9,TILE.PATH);
 m.spawn=point(6,14);m.exit=point(4,14);
 entity(m,'exit','exit','Your ship','Return to ship',4,14,'#d8c69e',{},'The docking collar leads back to your ship.');
 entity(m,'jobs','jobboard',`${location.name||'Port'} exchange`,'Jobs & local work',17,12,'#87b6a6');
 personEntity(m,location,'mechanic','mechanic','mechanic',18,6,'#d7a86b',location.id==='kettle'?{name:DIALOGUE.mechanic.name,text:DIALOGUE.mechanic.greeting,rumors:DIALOGUE.mechanic.rumors}:{});
 personEntity(m,location,'medic','medic','medic',29,6,'#8fc8bf',location.id==='kettle'?{name:DIALOGUE.medic.name,text:DIALOGUE.medic.greeting,rumors:DIALOGUE.medic.rumors}:{});
 personEntity(m,location,'bartender','npc','bartender',28,23,'#c7a49b');
 addStoryResident(m,location,18,23,'#c5ba89');
 personEntity(m,location,'trader','npc','merchant',26,14,'#7aa9b0');
 personEntity(m,location,'dockworker','npc','dockworker',9,15,'#b49472');
 addArchive(m,location,21,24,`${location.name||'Port'} archive`);
 addLocalWork(m,{crate:[5,5],delivery:[8,23],repairs:[[21,5],[32,16],[15,24]]});
 label(m,'FREIGHT / 01',4,3);label(m,'SHIPWRIGHT',15,3);label(m,'CLINIC',26,3);label(m,'DOCKING BAY',4,20);label(m,location.id==='ledger'?'CHARTER COUNCIL':location.id==='kettle'?'PORT OFFICE':'ARCHIVE',15,20);label(m,(COMMON_ROOMS[location.id]||'COMMON ROOM').toUpperCase(),26,20);
 prop(m,'window',5,2,7,1);prop(m,'window',16,2,6,1);prop(m,'window',27,2,6,1);prop(m,'window',15,27,8,1);
 prop(m,'cargo',9,4,2,2,'#7f7362',true);prop(m,'cargo',4,7,2,1,'#617c7b',true);prop(m,'cargo',10,7,2,1,'#856f58',true);
 prop(m,'workbench',16,4,4,1,'#46656c',true);prop(m,'equipment',22,7,1,1,'#91a29c',true);
 prop(m,'bed',26,4,1,2,'#9aaba1',true);prop(m,'bed',32,4,1,2,'#9aaba1',true);prop(m,'cabinet',33,7,1,1,'#7c9691',true);
 prop(m,'console',15,21,2,1,'#4b777d',true);prop(m,'books',22,21,1,2,'#6d7f78',true);
 prop(m,'bar',26,21,6,1,'#916b50',true);prop(m,'table',31,24,2,1,'#7f6956',true);
 prop(m,'bench',12,16,3,1,'#5d7778',true);prop(m,'bench',23,11,3,1,'#5d7778',true);prop(m,'plant',32,11,1,1,'#618f7c');prop(m,'plant',4,18,1,1,'#618f7c');
 for(const x of doorXs)for(const y of[10,18])prop(m,'light',x,y,1,.3,'#e6c381');
 prop(m,'dockship',0,12,2,5,'#7b9da4');
 return m;
}
function planet(location,seed){
 const biome=normalizeBiome(location.biome),m=makeMap(48,36,biome,location.name||'Uncharted settlement',location.id||'world',seed,'planet'),rng=random(seed+':'+m.id);
 rect(m,0,0,48,36,TILE.WALL);rect(m,1,1,46,34,TILE.GROUND);
 // Connected paths link the landing, services and the field survey circuit.
 rect(m,7,23,7,7,TILE.PAD);rect(m,15,15,12,9,TILE.PATH);
 line(m,10,24,10,16,TILE.PATH,2);line(m,10,16,29,16,TILE.PATH,2);
 line(m,10,12,10,16,TILE.PATH,2);line(m,21,12,21,16,TILE.PATH,2);line(m,32,16,26,16,TILE.PATH,2);
 line(m,25,20,41,20,TILE.PATH);line(m,41,20,41,6,TILE.PATH);line(m,41,6,39,6,TILE.PATH);line(m,25,22,25,31,TILE.PATH);line(m,25,31,29,31,TILE.PATH);
 room(m,5,5,10,8,10);room(m,17,5,10,8,21);room(m,29,8,11,9,33);
 rect(m,7,26,5,2,TILE.METAL);
 // A small lake / melt pool / lava basin leaves the settlement and survey connected.
 for(let y=25;y<=31;y++)for(let x=34;x<=43;x++){const d=((x-38.5)/5.2)**2+((y-28)/3.8)**2;if(d<.8+rng()*.22)m.tiles[y][x]=TILE.WATER;}
 m.spawn=point(10,26);m.exit=point(10,28);
 entity(m,'exit','exit','Landing shuttle','Return to ship',10,28,'#d9bd87');
 entity(m,'jobs','jobboard',`${location.name||'Settler'} cooperative`,'Jobs & local work',17,17,'#8bb8a0');
 personEntity(m,location,'mechanic','mechanic','mechanic',10,9,'#d6aa73');
 personEntity(m,location,'medic','medic','medic',22,9,'#a5cec0');
 personEntity(m,location,'bartender','npc','bartender',34,12,'#c89a8b');
 addStoryResident(m,location,22,20,'#b6bd87');
 personEntity(m,location,'scientist','npc','scientist',28,24,'#92adb8',{data:{survey:true}});
 personEntity(m,location,'courier','npc','courier',15,24,'#d4a47d');
 addArchive(m,location,19,7,location.id==='stillwater'?'Stillwater climate register':location.id==='earth'?'Council public record':`${location.name||'Colony'} memory wall`);
 addLocalWork(m,{crate:[6,17],delivery:[26,21],repairs:[[7,8],[24,11],[37,13]],samples:[[39,5],[43,18],[29,31]]});
 label(m,'WORKSHOP',6,6,PALETTES[biome].light);label(m,location.id==='stillwater'?'VAULT RECORDS':'CLINIC',18,6,PALETTES[biome].light);label(m,location.id==='earth'?'COUNCIL HOUSE':'WAYFARER HOUSE',30,9,PALETTES[biome].light);label(m,'LANDING  /  01',7,24,'#d6c49f');
 prop(m,'workbench',7,6,4,1,'#626e65',true);prop(m,'equipment',12,7,1,2,'#879384',true);
 prop(m,'bed',19,9,1,2,'#94aaa0',true);prop(m,'cabinet',24,7,1,1,'#9ba99b',true);prop(m,'bar',31,10,6,1,'#9a7758',true);prop(m,'table',31,14,2,1,'#9a7758',true);
 prop(m,'fountain',19,16,2,2,biome==='volcanic'?'#937f68':'#73969a',true);prop(m,'bench',19,22,3,1,'#7b8271',true);prop(m,'cargo',4,19,2,2,'#9c845f',true);
 prop(m,'fence',3,22,4,.3,'#a39175');prop(m,'fence',14,28,5,.3,'#a39175');prop(m,'antenna',3,6,1,3,'#99aaa3',true);
 for(let y=3;y<34;y+=2)for(let x=2;x<46;x+=2){
  if(m.tiles[y][x]!==TILE.GROUND||rng()>.45)continue;
  if(m.entities.some(e=>Math.hypot(e.x-(x+.5)*T,e.y-(y+.5)*T)<57))continue;
  const isTree=(biome==='verdant'||biome==='ocean')&&rng()>.38;
  prop(m,isTree?'tree':biome==='ice'?'ice':biome==='arid'&&rng()>.5?'cactus':rng()>.48?'rock':'grass',x,y,1,1,null,isTree||biome==='ice',{variant:Math.floor(rng()*4)});
 }
 prop(m,'shuttle',8,25,4,2,'#93b6b5');
 prop(m,'sign',28,19,1,1,'#cfbf90',false,{text:'SURVEY →'});prop(m,'sign',25,29,1,1,'#cfbf90',false,{text:'FIELD ↓'});
 return m;
}
function derelict(location,seed){
 const m=makeMap(38,28,'derelict',location.name||'Silent freighter',location.id||'derelict',seed,'derelict');
 rect(m,3,3,32,22,TILE.WALL);rect(m,4,4,30,20,TILE.FLOOR);rect(m,4,11,30,1,TILE.WALL);rect(m,4,18,30,1,TILE.WALL);
 rect(m,14,4,1,7,TILE.WALL);rect(m,25,4,1,7,TILE.WALL);rect(m,17,19,1,5,TILE.WALL);
 for(const x of[9,20,29])rect(m,x,11,2,1,TILE.FLOOR);for(const x of[10,22,29])rect(m,x,18,2,1,TILE.FLOOR);
 rect(m,4,13,30,3,TILE.GRATE);rect(m,8,12,3,7,TILE.PATH);
 m.spawn=point(6,14);m.exit=point(4,14);
 entity(m,'exit','exit','Docking tether','Return to ship',4,14,'#d7b490');
 personEntity(m,location,'survivor','npc','survivor',21,7,'#bea698',{data:{encounter:true,story:true}});
 addArchive(m,location,29,6,'Black-box recorder');
 entity(m,'jobs','jobboard','Salvage manifest','Jobs & salvage',8,9,'#99b6ae');
 entity(m,'mechanic','mechanic','Emergency fabricator','Repair station',29,21,'#b59875',{automated:true},'The surviving fabricator can stabilize equipment and fit salvage.');
 addLocalWork(m,{crate:[9,6],delivery:[7,21],repairs:[[12,21],[23,21],[31,9]],samples:[[19,5],[30,15],[15,22]]});
 label(m,'HOLD / B',5,4,'#b69f8c');label(m,'CREW QUARTERS',16,4,'#b69f8c');label(m,'BRIDGE',27,4,'#b69f8c');label(m,'ENGINEERING',19,19,'#b69f8c');
 prop(m,'window',27,3,5,1);prop(m,'cargo',5,5,2,2,'#726c61',true);prop(m,'cargo',11,7,2,2,'#7f6a5d',true);prop(m,'bed',16,6,1,2,'#758389',true);prop(m,'bed',23,6,1,2,'#758389',true);
 prop(m,'console',27,4,5,1,'#5d7377',true);prop(m,'engine',19,20,2,3,'#59777b',true);prop(m,'equipment',32,21,1,2,'#687b7d',true);
 for(const[x,y]of[[7,12],[20,12],[30,12],[9,17],[23,17]])prop(m,'light',x,y,1,.2,'#d78162');
 for(const[x,y]of[[15,13],[17,14],[28,17],[6,23],[30,22]])prop(m,'debris',x,y,1,1,'#69676a');
 return m;
}
function ship(location,seed){
 const m=makeMap(28,22,'ship',location.name||'Your ship · interior',location.id||'own-ship',seed,'ship');
 const crew=(Array.isArray(location.crew)?location.crew:[]).filter(c=>c&&(typeof c==='object'||typeof c==='string')).slice(0,4).map((c,i)=>typeof c==='string'?{id:`crew-${i}`,name:c,role:'crewmate'}:{...c,id:c.id||`crew-${i}`});
 const engineer=crew.find(c=>['engineer','mechanic'].includes(c.role)),navigator=crew.find(c=>['navigator','pilot'].includes(c.role));
 const addCrew=(id,c,x,y,color)=>entity(m,id,'crew',c.name||DIALOGUE[c.role]?.name||'Crewmate',c.role||'crewmate',x,y,c.color||color,{crewId:c.id,crewRole:c.role,dialogueRole:c.role==='navigator'?'pilot':c.role,roleLabel:DIALOGUE[c.role]?.role||c.role||'Crewmate',greeting:c.greeting||DIALOGUE[c.role]?.greeting,rumors:c.rumors||DIALOGUE[c.role]?.rumors||[]},c.text||c.greeting||DIALOGUE[c.role]?.greeting||'Another watch together. Where are we headed next?');
 rect(m,3,2,22,18,TILE.WALL);rect(m,4,3,20,16,TILE.FLOOR);rect(m,4,9,20,1,TILE.WALL);rect(m,13,3,1,6,TILE.WALL);rect(m,13,13,1,6,TILE.WALL);
 rect(m,8,9,2,1,TILE.FLOOR);rect(m,18,9,2,1,TILE.FLOOR);rect(m,12,10,3,3,TILE.PATH);rect(m,13,14,1,2,TILE.FLOOR);rect(m,4,11,20,2,TILE.PATH);
 m.spawn=point(14,11);m.exit=point(21,5);
 entity(m,'exit','exit','Captain’s chair','Take the helm',21,5,'#dabf88');
 if(engineer)addCrew('engineer',engineer,8,15,'#c5ac7a');
 else entity(m,'engineer','terminal','Engineering console','Systems diagnostics',8,15,'#c5ac7a',{automated:true,vacant:true,crewRole:'engineer',console:'engineering'},'No engineer is assigned to this station. For now, the captain handles every repair. Crew candidates can be hired at port.');
 if(navigator)addCrew('navigator',navigator,17,5,'#8cb4b8');
 else entity(m,'navigator','terminal','Navigation console','Navigation records',17,5,'#8cb4b8',{automated:true,vacant:true,crewRole:'navigator',console:'navigation'},'No navigator is assigned. The ship carries local charts and a long list of stars beyond the starter drive’s reach. Crew candidates can be hired at port.');
 entity(m,'medic','medic','Medical station','medic',8,5,'#9ecbbe',{automated:true});
 entity(m,'lore','terminal','Captain’s archive','Journal & lore',19,16,'#83b8bf',{journal:true},'Recovered signals, crew notes, and the history you carry with you.');
 entity(m,'crew-console','terminal','Crew manifest','Crew & alliances',17,8,'#a3bfa4',{crew:true},'Every berth is a promise to bring someone home.');
 entity(m,'repair-1','work','Engineering panel','Maintenance · repair',10,17,'#d8b477',{workType:'repair',kind:'repair',index:0,taskId:'repair-1',flag:'repair:'+m.id+':0'});
 label(m,'SICKBAY',5,3);label(m,'BRIDGE',15,3);label(m,'ENGINEERING',5,13);label(m,'CREW DECK',15,13);
 prop(m,'window',15,2,8,1);prop(m,'bed',5,5,1,2,'#96b6ae',true);prop(m,'cabinet',10,4,1,1,'#829d9e',true);prop(m,'console',15,3,7,1,'#557b87',true);
 prop(m,'engine',5,15,2,3,'#497d87',true);prop(m,'bed',15,15,1,2,'#7d9998',true);prop(m,'bed',21,15,1,2,'#8ba3a3',true);prop(m,'table',17,17,2,1,'#8b7e62',true);
 for(const[x,y]of[[7,10],[18,10],[12,11]])prop(m,'light',x,y,1,.25,'#d4bd8b');
 crew.filter(c=>c!==engineer&&c!==navigator).forEach((c,i)=>addCrew('recruit-'+c.id,c,16+i*2,11,'#a5bbac'));
 return m;
}
/** Build a walkable place from a body object or authored body ID. */
export function generateSurface(location={},seed='farwake',flags=[]){
 location=resolveLocation(location);
 const kind=kindOf(location);const m=kind==='station'?station(location,seed):kind==='ship'?ship(location,seed):kind==='derelict'?derelict(location,seed):planet(location,seed);
 m.faction=location.faction||null;m.systemId=location.systemId;m.systemName=location.systemName;m.localLore=location.localLore;m.loreId=location.loreId;m.flags=Array.isArray(flags)?[...flags]:[];
 // Interactive spaces always remain clear. Furniture is collision-enabled,
 // but items and characters never fence in an interaction or a landing spawn.
 m.solids=m.solids.filter(s=>![m.spawn,m.exit,...m.entities].some(e=>e.x>s.x-15&&e.x<s.x+s.w+15&&e.y>s.y-15&&e.y<s.y+s.h+15));
 for(const e of m.entities){const tx=Math.floor(e.x/T),ty=Math.floor(e.y/T);if(BLOCKED.has(m.tiles[ty]?.[tx]))m.tiles[ty][tx]=m.kind==='planet'?TILE.GROUND:TILE.FLOOR;}
 return m;
}
/** Collision uses a small circular-feeling square footprint below the sprite. */
export function isWalkable(surface,x,y,radius=6){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x-radius<0||y-radius<0||x+radius>=surface.width||y+radius>=surface.height)return false;
 const size=surface.tileSize||T;
 for(const[ox,oy]of[[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]){const tile=surface.tiles[Math.floor((y+oy)/size)]?.[Math.floor((x+ox)/size)];if(tile===undefined||BLOCKED.has(tile))return false;}
 return !surface.solids.some(s=>x+radius>s.x&&x-radius<s.x+s.w&&y+radius>s.y&&y-radius<s.y+s.h);
}
export function movePerson(surface,person,dx,dy,dt){
 if(!Number.isFinite(person.x)||!Number.isFinite(person.y))Object.assign(person,surface.spawn);
 dx=Number.isFinite(dx)?dx:0;dy=Number.isFinite(dy)?dy:0;dt=clamp(Number.isFinite(dt)?dt:0,0,.25);
 const magnitude=Math.hypot(dx,dy);if(magnitude>.01){person.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';if(magnitude>1){dx/=magnitude;dy/=magnitude;}}
 const distance=(person.speed||112)*dt,steps=Math.max(1,Math.ceil(distance*Math.max(Math.abs(dx),Math.abs(dy))/5)),sx=dx*distance/steps,sy=dy*distance/steps;
 const startX=person.x,startY=person.y;
 for(let i=0;i<steps;i++){if(isWalkable(surface,person.x+sx,person.y,person.radius||6))person.x+=sx;if(isWalkable(surface,person.x,person.y+sy,person.radius||6))person.y+=sy;}
 person.moving=Math.hypot(person.x-startX,person.y-startY)>.01;person.walkTime=(person.walkTime||0)+(person.moving?dt:0);
 return person;
}
export function nearestEntity(surface,person,range=38){
 let best=null,distance=range;
 for(const e of surface.entities){if(e.hidden||e.disabled)continue;const d=Math.hypot(e.x-person.x,e.y-person.y);if(d<=distance){best=e;distance=d;}}
 return best;
}
function pixel(ctx,c,x,y,w,h){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function text(ctx,value,x,y,color='#d8e2d7',size=9,align='left'){ctx.font=`${size}px monospace`;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(value,Math.round(x),Math.round(y));}
function tileDraw(ctx,m,x,y,p,time){
 const tile=m.tiles[y][x],wx=x*T,wy=y*T,n=noise(x,y,m.seed);
 if(tile===TILE.VOID){if(n>.91)pixel(ctx,n>.98?'#a4c9cd':'#3e6575',wx+Math.floor(n*17),wy+Math.floor(noise(y,x,m.seed)*20),1,1);return;}
 if(tile===TILE.WALL){
  pixel(ctx,p.wall,wx,wy,T,T);pixel(ctx,p.wallTop,wx,wy,T,5);pixel(ctx,p.edge,wx,wy+5,T,2);pixel(ctx,'#10202a',wx,wy+22,T,2);pixel(ctx,'#10232b',wx+22,wy+7,2,15);
  if(m.kind==='planet'&&((x===0||y===0||x===m.cols-1||y===m.rows-1))){pixel(ctx,p.ground,wx,wy,T,T);pixel(ctx,p.wall,wx+2,wy+6,20,15);pixel(ctx,p.wallTop,wx+5,wy+4,13,5);}
  return;
 }
 if(tile===TILE.WATER){
  pixel(ctx,p.water||'#1c4757',wx,wy,T,T);const shimmer=(Math.floor(time*.5)+x+y)%4;pixel(ctx,m.biome==='volcanic'?'#d27a43':'#4b8394',wx+3+shimmer*2,wy+8,8,1);pixel(ctx,m.biome==='volcanic'?'#b55b32':'#2f687c',wx+12-shimmer,wy+18,7,1);return;
 }
 if(tile===TILE.GROUND){
  pixel(ctx,n>.55?p.ground2||p.ground:p.ground,wx,wy,T,T);if(n>.72){pixel(ctx,p.path,wx+Math.floor(n*13),wy+6,2,1);pixel(ctx,p.path,wx+15,wy+17,1,1);}if(n<.22&&m.biome==='ice')pixel(ctx,'#86a2a5',wx+3,wy+16,9,1);return;
 }
 if(tile===TILE.PATH){pixel(ctx,p.path,wx,wy,T,T);pixel(ctx,p.edge,wx,wy+23,T,1);if(m.kind==='planet'){if(n>.6)pixel(ctx,'#aaa084',wx+7,wy+14,3,1);}else{pixel(ctx,p.floor2,wx+23,wy,1,T);if(x%6===0)pixel(ctx,'#657c7b',wx+4,wy+11,6,2);}return;}
 if(tile===TILE.PAD){pixel(ctx,p.floor,wx,wy,T,T);pixel(ctx,p.floor2,wx+1,wy+1,22,22);if((x+y)%3===0)pixel(ctx,'#b5a37c',wx+3,wy+12,6,2);return;}
 if(tile===TILE.GRATE){pixel(ctx,p.floor2,wx,wy,T,T);for(let i=3;i<23;i+=4)pixel(ctx,'#40505a',wx+2,wy+i,20,1);return;}
 pixel(ctx,(x+y)%2?p.floor:p.floor2,wx,wy,T,T);pixel(ctx,p.edge,wx,wy,24,1);pixel(ctx,'#162c36',wx,wy,1,24);
 if(n>.74){pixel(ctx,'#556a6d',wx+3,wy+3,1,1);pixel(ctx,'#556a6d',wx+20,wy+20,1,1);}
 if(tile===TILE.METAL){pixel(ctx,'#a99b7b',wx+3,wy+3,18,2);pixel(ctx,p.edge,wx+3,wy+19,18,2);}
}
/** Human sprite anchored at feet. scale is an optional integer for portraits. */
export function drawCharacter(ctx,x,y,options={}){
 const facing=options.facing||'down',c=options.color||'#bc9e69',skin=options.skin||'#d5b48e',hair=options.hair||'#4b3937',s=options.scale||1,time=options.time||0,bob=options.walking||options.moving?Math.floor(Math.sin(time*13)*1.3):0;
 x=Math.round(x);y=Math.round(y);ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 pixel(ctx,'#0b1b24',-7,-2,14,3);
 const step=options.walking||options.moving?(Math.sin(time*13)>0?1:-1):0;
 pixel(ctx,'#1a2833',-5,-5+step,4,5);pixel(ctx,'#1a2833',1,-5-step,4,5);pixel(ctx,'#83948e',-5,-1+step,4,1);pixel(ctx,'#83948e',1,-1-step,4,1);
 pixel(ctx,'#102631',-6,-15+bob,12,11);pixel(ctx,c,-5,-14+bob,10,8);pixel(ctx,c,-7,-12+bob,2,7);pixel(ctx,c,5,-12+bob,2,7);
 pixel(ctx,skin,-7,-6+bob,2,2);pixel(ctx,skin,5,-6+bob,2,2);pixel(ctx,'#33434b',-5,-7+bob,10,2);
 pixel(ctx,hair,-5,-24+bob,10,9);pixel(ctx,hair,-6,-21+bob,12,6);pixel(ctx,skin,-4,-21+bob,8,8);
 if(facing==='up'){pixel(ctx,hair,-5,-23+bob,10,9);pixel(ctx,'#8b795d',-4,-14+bob,8,7);pixel(ctx,'#b0a183',-3,-14+bob,6,2);}
 else{
  pixel(ctx,hair,-5,-24+bob,10,5);pixel(ctx,hair,-5,-20+bob,2,4);
  if(facing==='left'){pixel(ctx,skin,-6,-18+bob,3,4);pixel(ctx,'#263440',-4,-18+bob,1,2);pixel(ctx,hair,3,-20+bob,2,6);}
  else if(facing==='right'){pixel(ctx,skin,3,-18+bob,3,4);pixel(ctx,'#263440',3,-18+bob,1,2);pixel(ctx,hair,-5,-20+bob,2,6);}
  else{pixel(ctx,'#263440',-3,-18+bob,1,2);pixel(ctx,'#263440',2,-18+bob,1,2);pixel(ctx,'#a87562',-1,-14+bob,3,1);}
  pixel(ctx,'#e8d5a7',2,-12+bob,2,2);
 }
 if(options.carried){pixel(ctx,'#806448',-8,-9,16,9);pixel(ctx,'#bc9d70',-7,-9,14,2);pixel(ctx,'#e2ca93',-1,-8,2,8);}
 ctx.restore();
}
function drawProp(ctx,d,m,time){
 const{x,y,w,h}=d,p=PALETTES[m.biome]||PALETTES.station,c=d.color||p.accent;
 if(d.kind==='label'){text(ctx,d.text,x+2,y+4,c,8);return;}
 if(d.kind==='light'){pixel(ctx,'#16282f',x,y,w,h+4);pixel(ctx,c,x+4,y+1,w-8,2);ctx.globalAlpha=.08;pixel(ctx,c,x-8,y+4,w+16,20);ctx.globalAlpha=1;return;}
 if(d.kind==='window'){
  pixel(ctx,'#0d1c2b',x,y,w,h);pixel(ctx,'#88adb1',x,y,w,2);pixel(ctx,'#35545e',x,y+h-2,w,2);
  for(let i=6;i<w;i+=23){pixel(ctx,'#476a7c',x+i,y+7,1,1);pixel(ctx,'#99b4bb',x+i+10,y+15,1,1);pixel(ctx,'#3d5c66',x+i+17,y+1,2,h-2);}return;
 }
 if(d.kind==='bench'){pixel(ctx,'#182b32',x+3,y+h-5,w-6,5);pixel(ctx,c,x,y+4,w,h-8);pixel(ctx,'#92aaa2',x,y+4,w,3);pixel(ctx,'#263b43',x+3,y+h-4,3,5);pixel(ctx,'#263b43',x+w-6,y+h-4,3,5);return;}
 if(d.kind==='cargo'){
  pixel(ctx,'#172b32',x+3,y+h-2,w,h*.2);pixel(ctx,c,x,y+4,w,h-4);pixel(ctx,'#b4ad91',x+2,y+2,w-4,4);pixel(ctx,'#4f5956',x+3,y+9,w-6,h-14);
  pixel(ctx,c,x+w/2-2,y+5,4,h-7);pixel(ctx,'#cdb77e',x+4,y+h-10,8,4);return;
 }
 if(d.kind==='bed'){pixel(ctx,'#27373b',x+2,y+2,w-4,h-3);pixel(ctx,'#cbd1bc',x+4,y+5,w-8,9);pixel(ctx,c,x+3,y+16,w-6,h-19);pixel(ctx,'#526e72',x+3,y+h-6,w-6,4);return;}
 if(d.kind==='bar'||d.kind==='workbench'){
  pixel(ctx,'#1a2c31',x,y+6,w,h-3);pixel(ctx,c,x,y,w,h-5);pixel(ctx,'#b8a88a',x,y,w,3);pixel(ctx,'#3d4844',x+2,y+h-7,w-4,4);
  for(let i=8;i<w-9;i+=23){pixel(ctx,d.kind==='bar'?'#b1ba88':'#b6b7a3',x+i,y+5,4,6);pixel(ctx,'#678c8c',x+i+7,y+6,6,3);}return;
 }
 if(d.kind==='table'){pixel(ctx,'#1d2e31',x+3,y+9,w-6,h-4);pixel(ctx,c,x,y+2,w,h-8);pixel(ctx,'#b3a183',x,y+2,w,3);pixel(ctx,'#9bbcac',x+w/2-2,y+8,5,5);return;}
 if(d.kind==='cabinet'||d.kind==='books'){
  pixel(ctx,'#1b2c32',x,y+3,w,h-2);pixel(ctx,c,x+1,y,w-2,h-4);for(let j=7;j<h-5;j+=10){pixel(ctx,'#2e4248',x+3,y+j,w-6,2);if(d.kind==='books')for(let i=3;i<w-4;i+=5)pixel(ctx,i%2?'#b7a483':'#719c9d',x+i,y+j-5,3,5);}return;
 }
 if(d.kind==='console'||d.kind==='equipment'){
  pixel(ctx,'#162d36',x,y+4,w,h);pixel(ctx,c,x,y,w,h-3);pixel(ctx,'#142b37',x+3,y+3,w-6,Math.max(7,h-11));
  for(let i=7;i<w-3;i+=15){pixel(ctx,'#7cb9b5',x+i,y+7,6,2);pixel(ctx,'#497b88',x+i,y+11,9,1);pixel(ctx,(Math.floor(time)+i)%3?'#d8c18b':'#6ab49d',x+i,y+h-7,2,2);}return;
 }
 if(d.kind==='engine'){
  pixel(ctx,'#172b35',x+2,y+3,w-4,h);pixel(ctx,c,x+5,y,w-10,h-3);pixel(ctx,'#7c9fa5',x+7,y,w-14,5);
  for(let j=8;j<h-7;j+=9){pixel(ctx,'#182e3a',x+3,y+j,w-6,5);pixel(ctx,'#78c3bd',x+12,y+j+1,w-24,2);}
  ctx.globalAlpha=.08+Math.sin(time*2)*.025;pixel(ctx,'#84dad0',x-5,y-3,w+10,h+10);ctx.globalAlpha=1;return;
 }
 if(d.kind==='plant'||d.kind==='grass'){
  if(d.kind==='plant'){pixel(ctx,'#675d4b',x+6,y+14,13,9);pixel(ctx,'#ac9d7d',x+5,y+13,15,3);}
  pixel(ctx,c||'#6b9b71',x+10,y+4,4,14);pixel(ctx,'#6a9774',x+4,y+5,7,7);pixel(ctx,'#87ac7a',x+13,y+1,7,9);if(d.kind==='grass'){pixel(ctx,p.ground,x,y+16,24,8);pixel(ctx,p.accent,x+6,y+11,2,5);}return;
 }
 if(d.kind==='tree'){
  pixel(ctx,'#172b2b',x+1,y+17,25,8);pixel(ctx,'#806b4d',x+9,y+2,6,19);pixel(ctx,'#254e3d',x-7,y-21,34,29);pixel(ctx,'#315c44',x-10,y-15,40,16);pixel(ctx,'#497f50',x-5,y-23,28,19);pixel(ctx,'#669555',x,y-21,17,5);pixel(ctx,'#80a660',x+4,y-19,3,3);return;
 }
 if(d.kind==='cactus'){pixel(ctx,'#2d594a',x+9,y-5,7,27);pixel(ctx,'#6c9870',x+10,y-4,2,23);pixel(ctx,'#2d594a',x+3,y+5,7,5);pixel(ctx,'#2d594a',x+3,y-1,4,10);pixel(ctx,'#51765a',x+15,y+1,6,5);pixel(ctx,'#51765a',x+19,y-6,4,10);return;}
 if(d.kind==='rock'||d.kind==='ice'){
  const icy=d.kind==='ice';pixel(ctx,icy?'#3b5d6a':'#343e40',x+2,y+17,21,7);pixel(ctx,icy?'#91b9bd':m.biome==='arid'?'#a18b6c':'#77716d',x+2,y+8,20,13);pixel(ctx,icy?'#b9d3cf':m.biome==='arid'?'#b09a76':'#89827b',x+6,y+3,13,9);pixel(ctx,icy?'#668e9c':'#59544f',x+17,y+12,5,10);return;
 }
 if(d.kind==='fountain'){pixel(ctx,'#283e3e',x,y+8,w,h-8);pixel(ctx,'#b0afa0',x+2,y+3,w-4,h-9);pixel(ctx,'#2e6873',x+6,y+7,w-12,h-17);pixel(ctx,'#a4b4a7',x+w/2-4,y+2,8,h-12);pixel(ctx,'#9ec3bc',x+w/2-5,y,10,5);return;}
 if(d.kind==='fence'){for(let i=1;i<w;i+=14)pixel(ctx,c,x+i,y-4,3,14);pixel(ctx,c,x,y,w,2);pixel(ctx,c,x,y+5,w,2);return;}
 if(d.kind==='antenna'){pixel(ctx,'#22343a',x+3,y+h-3,w-2,5);pixel(ctx,c,x+w/2-2,y,4,h);pixel(ctx,c,x+2,y+7,w-4,3);pixel(ctx,'#cfbd8b',x+5,y,15,3);pixel(ctx,'#79b4b4',x+8,y+11,8,9);return;}
 if(d.kind==='debris'){pixel(ctx,c,x+3,y+4,13,3);pixel(ctx,'#a28d79',x+12,y+12,7,4);pixel(ctx,'#334c54',x+3,y+18,9,2);return;}
 if(d.kind==='sign'){pixel(ctx,'#524d3d',x+10,y+9,3,17);pixel(ctx,'#243b3c',x-2,y-2,64,13);text(ctx,d.text,x+1,y,c,7);return;}
 if(d.kind==='shuttle'){
  pixel(ctx,'#1c3039',x-4,y+5,w+8,h-3);pixel(ctx,'#446775',x-7,y+13,14,h-15);pixel(ctx,'#446775',x+w-7,y+13,14,h-15);pixel(ctx,c,x+5,y,w-10,h-6);pixel(ctx,'#bfd1c2',x+12,y-4,w-24,7);pixel(ctx,'#244c5f',x+w/2-15,y+5,30,11);pixel(ctx,'#b8c7b0',x+w/2-12,y+5,24,2);pixel(ctx,'#d4b575',x+11,y+25,12,4);pixel(ctx,'#d4b575',x+w-23,y+25,12,4);return;
 }
 if(d.kind==='dockship'){pixel(ctx,'#294651',x+6,y+6,w-12,h-12);pixel(ctx,c,x+11,y+1,w-22,h-2);pixel(ctx,'#d3c18b',x+w-8,y+h/2-9,18,18);pixel(ctx,'#5d96a6',x+12,y+9,w-24,24);}
}
function isDone(entity,flags){return!!entity.completed||flags.has(entity.data?.flag)||flags.has('done:'+entity.id)||flags.has(entity.id);}
function drawEntity(ctx,e,m,time,flags,near){
 if(e.hidden)return;
 const{x,y,color:c}=e,done=isDone(e,flags);
 if(['npc','crew','mechanic','medic'].includes(e.type)&&!e.data?.automated){drawCharacter(ctx,x,y,{color:c,facing:e.facing||'down',time});if(e.type==='medic'){pixel(ctx,'#e7e5c9',x-3,y-21,6,3);pixel(ctx,'#d47b6c',x-1,y-22,2,5);}}
 else if(e.type==='exit'){
  pixel(ctx,'#122e38',x-15,y-10,30,22);pixel(ctx,'#527981',x-14,y-9,28,2);pixel(ctx,'#a9b6a6',x-11,y+10,22,2);
  for(let i=0;i<3;i++){const yy=y-5+i*5;pixel(ctx,c,x-4,yy,8,2);pixel(ctx,c,x-2,yy+2,4,2);}return;
 }
 else if(e.type==='delivery'){
  pixel(ctx,'#394b4a',x-20,y-15,40,31);for(let i=-18;i<19;i+=8){pixel(ctx,c,x+i,y-15,5,3);pixel(ctx,c,x+i,y+13,5,3);}pixel(ctx,c,x-20,y-13,3,26);pixel(ctx,c,x+17,y-13,3,26);
  text(ctx,'↓',x,y-7,'#dccb9c',16,'center');return;
 }
 else if(e.type==='sample'){
  if(done)return;
  pixel(ctx,'#1c363b',x-8,y-1,16,5);pixel(ctx,m.biome==='volcanic'?'#d1a684':m.biome==='ice'?'#b9e4dd':'#9ed0ad',x-3,y-16,7,15);pixel(ctx,m.biome==='arid'?'#d0bd7b':'#7ab8b0',x-8,y-9,5,9);pixel(ctx,'#cde5c6',x-2,y-16,3,5);pixel(ctx,'#abc7a2',x+5,y-11,4,9);
  if(Math.floor(time*2)%2===0)pixel(ctx,'#dfeecb',x+9,y-19,2,2);
 }
 else if(e.type==='crate'){
  if(done||flags.has(e.data?.carriedFlag))return;
  pixel(ctx,'#192d32',x-10,y-1,22,5);pixel(ctx,'#806749',x-10,y-16,20,18);pixel(ctx,c,x-9,y-17,18,4);pixel(ctx,'#a98b59',x-7,y-12,14,11);pixel(ctx,'#dec98e',x-2,y-14,4,15);pixel(ctx,'#404844',x+4,y-10,3,4);
 }
 else if(e.type==='jobboard'){
  pixel(ctx,'#182e35',x-12,y-24,24,27);pixel(ctx,'#567b79',x-13,y-26,26,22);pixel(ctx,'#1b3e46',x-10,y-23,20,16);pixel(ctx,'#b3cfb6',x-7,y-20,4,4);pixel(ctx,'#d6c08b',x+1,y-20,6,1);pixel(ctx,'#7faaa0',x+1,y-17,5,1);pixel(ctx,'#77bba6',x-7,y-12,14,2);pixel(ctx,'#547b7a',x-10,y-4,3,7);pixel(ctx,'#547b7a',x+7,y-4,3,7);
 }
 else{
  const ec=done?'#80bea6':e.type==='work'?'#dca167':c;
  pixel(ctx,'#152a35',x-10,y-21,20,24);pixel(ctx,'#48616a',x-10,y-23,20,20);pixel(ctx,'#152e3a',x-7,y-20,14,10);pixel(ctx,ec,x-5,y-18,10,2);pixel(ctx,'#668f97',x-5,y-14,6,1);pixel(ctx,ec,x-7,y-6,3,2);pixel(ctx,'#9bb1aa',x-1,y-6,5,2);pixel(ctx,'#344c56',x-8,y-2,16,3);
 }
 if(done&&e.type==='work'){text(ctx,'✓',x,y-33,'#9dd4ac',10,'center');}
 if(near){
  const yy=y-36+Math.round(Math.sin(time*3));pixel(ctx,'#e5d7ac',x-2,yy,4,2);pixel(ctx,'#e5d7ac',x-1,yy+2,2,2);
 }
}
function shortRole(e){if(e.type==='exit')return e.role;return{jobboard:'CONTRACTS',mechanic:'SHIPWRIGHT',medic:'MEDIC',terminal:'ARCHIVE',work:'RELAY',crate:'CARGO',delivery:'LOADING',sample:'SAMPLE',crew:'CREW'}[e.type]||e.name;}
/**
 * Draw the surface centered on person by default. Passing cameraX/cameraY locks
 * it to a supplied world camera. time is seconds; flags can be an array or Set.
 * The function does not clear or draw the app HUD, dialog, or touch controls.
 */
export function drawSurface(ctx,surface,options={}){
 const person=options.person||surface.spawn,width=options.width||ctx.canvas.width,height=options.height||ctx.canvas.height,time=options.time||0;
 const center=(v,world,viewport)=>world<viewport?(world-viewport)/2:clamp(v-viewport/2,0,world-viewport);
 const cameraX=Math.round(options.cameraX??center(person.x,surface.width,width)),cameraY=Math.round(options.cameraY??center(person.y,surface.height,height));
 const p=PALETTES[surface.biome]||PALETTES.station,flags=options.flags instanceof Set?options.flags:new Set(options.flags||surface.flags||[]);
 ctx.save();ctx.imageSmoothingEnabled=false;pixel(ctx,surface.kind==='planet'?'#132a2c':'#091622',0,0,width,height);ctx.translate(-cameraX,-cameraY);
 const minX=Math.max(0,Math.floor(cameraX/T)-1),maxX=Math.min(surface.cols,Math.ceil((cameraX+width)/T)+1),minY=Math.max(0,Math.floor(cameraY/T)-1),maxY=Math.min(surface.rows,Math.ceil((cameraY+height)/T)+1);
 for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++)tileDraw(ctx,surface,x,y,p,time);
 const visible=d=>d.x+d.w>cameraX-64&&d.x<cameraX+width+64&&d.y+d.h>cameraY-64&&d.y<cameraY+height+64;
 const flat=new Set(['label','window','light','fence','debris','sign']);
 for(const d of surface.decor)if(flat.has(d.kind)&&visible(d))drawProp(ctx,d,surface,time);
 // Loading pads and exits are floor decals; everyone else participates in depth.
 const near=nearestEntity(surface,person,40),items=[];
 for(const d of surface.decor)if(!flat.has(d.kind)&&visible(d))items.push({y:d.y+d.h,prop:d});
 for(const e of surface.entities){if(e.x<cameraX-45||e.x>cameraX+width+45||e.y<cameraY-45||e.y>cameraY+height+45)continue;if(e.type==='delivery'||e.type==='exit')drawEntity(ctx,e,surface,time,flags,near===e);else items.push({y:e.y,entity:e});}
 items.push({y:person.y,player:person});items.sort((a,b)=>a.y-b.y);
 for(const item of items){if(item.prop)drawProp(ctx,item.prop,surface,time);else if(item.entity)drawEntity(ctx,item.entity,surface,time,flags,near===item.entity);else drawCharacter(ctx,person.x,person.y,{...person,color:person.color||'#c9a875',time:person.walkTime||time,carried:person.carrying||flags.has('carrying:'+surface.id)});}
 for(const e of surface.entities){
  if(e.hidden||(isDone(e,flags)&&['sample','crate'].includes(e.type)))continue;
  if(e.x<cameraX||e.x>cameraX+width||e.y<cameraY||e.y>cameraY+height)continue;
  const important=['jobboard','mechanic','medic','exit'].includes(e.type),selected=near===e;
  if(!important&&!selected)continue;
  const value=selected?e.name:shortRole(e),labelY=e.type==='exit'?e.y-27:e.y-48;
  ctx.font='8px monospace';const tw=ctx.measureText(value).width;pixel(ctx,'#10232bcc',e.x-tw/2-4,labelY-2,tw+8,12);text(ctx,value,e.x,labelY,selected?'#e9d8a8':'#9ab9b5',8,'center');
 }
 // A quiet objective ring directs local tasks without replacing exploration.
 const targetId=options.mission?.targetEntityId||options.mission?.entityId;
 if(targetId){const e=surface.entities.find(e=>e.id===targetId);if(e){ctx.strokeStyle='#dbc68f';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.strokeRect(Math.round(e.x-17),Math.round(e.y-26),34,32);ctx.setLineDash([]);}}
 ctx.restore();
 return{cameraX,cameraY,width,height};
}
